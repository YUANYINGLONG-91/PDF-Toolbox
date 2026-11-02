from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageOps

from pdf_toolbox.errors import OperationError, ValidationError

PointArray = np.ndarray


def load_bgr(path: str | Path) -> np.ndarray:
    try:
        with Image.open(path) as source:
            image = ImageOps.exif_transpose(source).convert("RGB")
            rgb = np.asarray(image).copy()
        return cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    except Exception as exc:
        raise OperationError(f"Could not read image: {path}\n{exc}") from exc


def save_bgr(path: str | Path, image: np.ndarray, quality: int = 95) -> None:
    destination = Path(path)
    if image.ndim == 2:
        rgb = Image.fromarray(image, mode="L")
    else:
        rgb = Image.fromarray(cv2.cvtColor(image, cv2.COLOR_BGR2RGB))
    if destination.suffix.lower() in {".jpg", ".jpeg"}:
        rgb.save(destination, quality=quality, optimize=True, dpi=(300, 300))
    else:
        rgb.save(destination, dpi=(300, 300))


def preview(image: np.ndarray, max_side: int = 1400) -> np.ndarray:
    height, width = image.shape[:2]
    scale = min(1.0, max_side / max(height, width))
    if scale == 1.0:
        return image.copy()
    return cv2.resize(image, (round(width * scale), round(height * scale)), interpolation=cv2.INTER_AREA)


def rotate90(image: np.ndarray, clockwise: bool = True) -> np.ndarray:
    return cv2.rotate(image, cv2.ROTATE_90_CLOCKWISE if clockwise else cv2.ROTATE_90_COUNTERCLOCKWISE)


def order_corners(points: np.ndarray) -> PointArray:
    points = np.asarray(points, dtype=np.float32).reshape(4, 2)
    ordered = np.zeros((4, 2), dtype=np.float32)
    sums = points.sum(axis=1)
    differences = np.diff(points, axis=1).ravel()
    ordered[0] = points[np.argmin(sums)]
    ordered[2] = points[np.argmax(sums)]
    ordered[1] = points[np.argmin(differences)]
    ordered[3] = points[np.argmax(differences)]
    return ordered


def fallback_corners(image: np.ndarray) -> PointArray:
    height, width = image.shape[:2]
    inset_x, inset_y = width * 0.04, height * 0.04
    return np.array([
        [inset_x, inset_y], [width - inset_x, inset_y],
        [width - inset_x, height - inset_y], [inset_x, height - inset_y],
    ], dtype=np.float32)


def _quadrilateral(contour: np.ndarray) -> tuple[np.ndarray, bool] | None:
    """Return a contour quad and whether it was inferred from a bounding rectangle."""
    perimeter = cv2.arcLength(contour, True)
    for epsilon in (0.015, 0.022, 0.03, 0.04):
        polygon = cv2.approxPolyDP(contour, epsilon * perimeter, True)
        if len(polygon) == 4 and cv2.isContourConvex(polygon):
            return polygon.reshape(4, 2).astype(np.float32), False
    if len(cv2.approxPolyDP(contour, 0.02 * perimeter, True)) >= 3:
        rectangle = cv2.minAreaRect(contour)
        rectangle_area = max(1.0, rectangle[1][0] * rectangle[1][1])
        if cv2.contourArea(contour) / rectangle_area > 0.78:
            return cv2.boxPoints(rectangle).astype(np.float32), True
    return None


def _valid_quadrilateral(corners: np.ndarray, image_shape: tuple[int, ...]) -> bool:
    height, width = image_shape[:2]
    corners = order_corners(corners)
    sides = [np.linalg.norm(corners[index] - corners[(index + 1) % 4]) for index in range(4)]
    if min(sides) < min(height, width) * 0.06:
        return False
    for index in range(4):
        previous = corners[(index - 1) % 4] - corners[index]
        following = corners[(index + 1) % 4] - corners[index]
        denominator = max(1e-6, float(np.linalg.norm(previous) * np.linalg.norm(following)))
        cosine = abs(float(np.dot(previous, following)) / denominator)
        if cosine > 0.96:  # Reject nearly collapsed or self-intersecting selections.
            return False
    return True


def detect_corners(image: np.ndarray) -> tuple[PointArray, bool]:
    """Detect a page using complementary edge and illumination masks.

    The detector deliberately returns a manual fallback instead of guessing when no
    plausible four-sided document can be found.
    """
    height, width = image.shape[:2]
    scale = min(1.0, 1100 / max(height, width))
    small = cv2.resize(image, (round(width * scale), round(height * scale)), interpolation=cv2.INTER_AREA)
    gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    kernel_size = max(5, round(min(small.shape[:2]) * 0.012) | 1)
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (kernel_size, kernel_size))
    masks = [(cv2.Canny(blurred, 35, 110), 1.0), (cv2.Canny(blurred, 75, 190), 0.98)]
    otsu_threshold, _ = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    for threshold in {int(otsu_threshold), int(np.clip(otsu_threshold - 30, 20, 235)), int(np.clip(otsu_threshold + 30, 20, 235))}:
        masks.append((cv2.threshold(blurred, threshold, 255, cv2.THRESH_BINARY)[1], 0.94))
        masks.append((cv2.threshold(blurred, threshold, 255, cv2.THRESH_BINARY_INV)[1], 0.90))

    image_area = small.shape[0] * small.shape[1]
    center = np.array([small.shape[1] / 2, small.shape[0] / 2], dtype=np.float32)
    candidates: list[tuple[float, np.ndarray]] = []
    seen: set[tuple[int, ...]] = set()
    for raw_mask, source_weight in masks:
        mask = cv2.morphologyEx(raw_mask, cv2.MORPH_CLOSE, kernel)
        contours, _ = cv2.findContours(mask, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
        for contour in sorted(contours, key=cv2.contourArea, reverse=True)[:16]:
            contour_area = cv2.contourArea(contour)
            if contour_area < image_area * 0.10:
                continue
            result = _quadrilateral(contour)
            if result is None:
                continue
            polygon, inferred = result
            if not _valid_quadrilateral(polygon, small.shape):
                continue
            corners = order_corners(polygon)
            key = tuple(np.round(corners.reshape(-1) / 8).astype(int))
            if key in seen:
                continue
            seen.add(key)
            quad_area = abs(cv2.contourArea(corners))
            area_ratio = float(np.clip(quad_area / image_area, 0, 1))
            rectangularity = float(np.clip(contour_area / max(quad_area, 1), 0, 1))
            distance = np.linalg.norm(corners.mean(axis=0) - center) / max(height * scale, width * scale)
            centeredness = 1.0 - min(1.0, float(distance))
            border_contacts = int(np.sum((corners[:, 0] <= 3) | (corners[:, 0] >= small.shape[1] - 4)))
            border_contacts += int(np.sum((corners[:, 1] <= 3) | (corners[:, 1] >= small.shape[0] - 4)))
            border_penalty = 0.45 if area_ratio > 0.95 and border_contacts >= 4 else 1.0
            inference_penalty = 0.90 if inferred else 1.0
            score = (area_ratio * 0.80 + rectangularity * 0.12 + centeredness * 0.08)
            score *= source_weight * border_penalty * inference_penalty
            candidates.append((score, corners))
    if not candidates:
        return fallback_corners(image), False
    corners = max(candidates, key=lambda item: item[0])[1] / scale
    return order_corners(corners), True


def _output_size(corners: PointArray) -> tuple[int, int]:
    top_left, top_right, bottom_right, bottom_left = corners
    width = max(np.linalg.norm(bottom_right - bottom_left), np.linalg.norm(top_right - top_left))
    height = max(np.linalg.norm(top_left - bottom_left), np.linalg.norm(top_right - bottom_right))
    width, height = round(float(width)), round(float(height))
    if width < 20 or height < 20:
        raise ValidationError("The selected document area is too small.")
    if width * height > 60_000_000 or max(width, height) > 12_000:
        raise ValidationError("The corrected image would be too large. Adjust the corners.")
    return width, height


def warp(image: np.ndarray, corners: np.ndarray) -> np.ndarray:
    corners = order_corners(corners)
    width, height = _output_size(corners)
    target = np.array([[0, 0], [width - 1, 0], [width - 1, height - 1], [0, height - 1]], dtype=np.float32)
    matrix = cv2.getPerspectiveTransform(corners, target)
    return cv2.warpPerspective(image, matrix, (width, height), flags=cv2.INTER_LANCZOS4)


def _normalize_illumination(gray: np.ndarray, paper_level: int = 245) -> np.ndarray:
    """Flatten shadows while retaining dark print, using a broad illumination estimate."""
    sigma = max(12.0, min(gray.shape[:2]) / 18.0)
    background = cv2.GaussianBlur(gray, (0, 0), sigma)
    return cv2.divide(gray, np.maximum(background, 1), scale=paper_level)


def _white_balance(image: np.ndarray) -> np.ndarray:
    """Balance the likely paper pixels without strongly shifting colored content."""
    source = image.astype(np.float32)
    luminance = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    cutoff = float(np.percentile(luminance, 70))
    paper = luminance >= cutoff
    if np.count_nonzero(paper) < 100:
        return image.copy()
    means = source[paper].mean(axis=0)
    target = float(means.mean())
    gains = np.clip(target / np.maximum(means, 1), 0.78, 1.28)
    return np.clip(source * gains, 0, 255).astype(np.uint8)


def _unsharp(image: np.ndarray, amount: float = 0.32) -> np.ndarray:
    blurred = cv2.GaussianBlur(image, (0, 0), 1.0)
    return cv2.addWeighted(image, 1.0 + amount, blurred, -amount, 0)


def _document_contrast(image: np.ndarray, sharpness: float) -> np.ndarray:
    """Darken faint pencil/ink strokes while leaving white paper nearly unchanged."""
    gamma = float(np.clip(1.08 + 0.12 * max(0.0, sharpness - 1.0), 1.0, 1.25))
    lut = np.clip((np.arange(256, dtype=np.float32) / 255.0) ** gamma * 255.0, 0, 255).astype(np.uint8)
    return cv2.LUT(image, lut)


def _text_mask(image: np.ndarray) -> np.ndarray:
    small = preview(image, 900)
    gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY) if small.ndim == 3 else small
    if float(gray.std()) < 4.0:
        return np.zeros_like(gray)
    normalized = _normalize_illumination(gray)
    block_size = max(25, round(min(gray.shape[:2]) * 0.04) | 1)
    block_size = min(block_size, 101) | 1
    mask = cv2.adaptiveThreshold(normalized, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, block_size, 11)
    margin_x, margin_y = round(mask.shape[1] * 0.025), round(mask.shape[0] * 0.025)
    mask[:margin_y, :] = mask[-margin_y:, :] = 0
    mask[:, :margin_x] = mask[:, -margin_x:] = 0
    ratio = np.count_nonzero(mask) / mask.size
    if ratio < 0.001 or ratio > 0.38:
        return np.zeros_like(gray)
    return mask


def _projection_score(mask: np.ndarray, angle: float) -> float:
    height, width = mask.shape
    matrix = cv2.getRotationMatrix2D((width / 2, height / 2), float(angle), 1.0)
    rotated = cv2.warpAffine(mask, matrix, (width, height), flags=cv2.INTER_NEAREST)
    projection = np.sum(rotated, axis=1, dtype=np.float64) / 255.0
    mean = max(1.0, float(projection.mean()))
    return float(projection.var() / (mean * mean))


def estimate_skew_angle(image: np.ndarray, max_angle: float = 8.0) -> float:
    """Estimate the corrective small-angle rotation from text/line projection profiles."""
    mask = _text_mask(image)
    if not np.any(mask):
        return 0.0
    baseline = _projection_score(mask, 0.0)
    coarse = np.arange(-max_angle, max_angle + 0.01, 1.0)
    scores = [(float(angle), _projection_score(mask, float(angle))) for angle in coarse]
    best_angle, _ = max(scores, key=lambda item: item[1])
    fine = np.arange(best_angle - 0.6, best_angle + 0.61, 0.2)
    scores.extend((float(angle), _projection_score(mask, float(angle))) for angle in fine)
    best_angle, best_score = max(scores, key=lambda item: item[1])
    if abs(best_angle) < 0.25 or best_score < baseline * 1.015:
        return 0.0
    return float(np.clip(best_angle, -max_angle, max_angle))


def auto_deskew(image: np.ndarray) -> tuple[np.ndarray, float]:
    angle = estimate_skew_angle(image)
    if abs(angle) < 0.25:
        return image, 0.0
    height, width = image.shape[:2]
    matrix = cv2.getRotationMatrix2D((width / 2, height / 2), angle, 1.0)
    border = 255 if image.ndim == 2 else (255, 255, 255)
    corrected = cv2.warpAffine(image, matrix, (width, height), flags=cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_CONSTANT, borderValue=border)
    return corrected, angle


def enhance(image: np.ndarray, mode: str, sharpness: float = 1.0) -> np.ndarray:
    sharpness = float(sharpness)
    if not 0.0 <= sharpness <= 2.0:
        raise ValidationError("Sharpness must be between 0 and 2.")
    if mode == "original":
        return image
    if mode == "color":
        balanced = _white_balance(image)
        lab = cv2.cvtColor(balanced, cv2.COLOR_BGR2LAB)
        lightness, a, b = cv2.split(lab)
        flattened = _normalize_illumination(lightness, 246)
        lightness = cv2.addWeighted(flattened, 0.88, lightness, 0.12, 0)
        local = cv2.createCLAHE(clipLimit=1.35, tileGridSize=(8, 8)).apply(lightness)
        lightness = cv2.addWeighted(local, 0.35, lightness, 0.65, 0)
        lightness = _document_contrast(lightness, sharpness)
        lightness = _unsharp(lightness, 0.48 * sharpness)
        return cv2.cvtColor(cv2.merge((lightness, a, b)), cv2.COLOR_LAB2BGR)
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if image.ndim == 3 else image.copy()
    normalized = _normalize_illumination(gray, 250 if mode == "grayscale" else 245)
    if mode == "grayscale":
        local = cv2.createCLAHE(clipLimit=1.45, tileGridSize=(8, 8)).apply(normalized)
        mixed = cv2.addWeighted(local, 0.4, normalized, 0.6, 0)
        mixed = _document_contrast(mixed, sharpness)
        return _unsharp(mixed, 0.42 * sharpness)
    if mode == "bw":
        denoised = cv2.medianBlur(normalized, 3)
        denoised = _unsharp(_document_contrast(denoised, sharpness), 0.30 * sharpness)
        block_size = max(31, round(min(gray.shape[:2]) * 0.045) | 1)
        block_size = min(block_size, 151) | 1
        return cv2.adaptiveThreshold(denoised, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, block_size, 12)
    raise ValidationError(f"Unknown enhancement mode: {mode}")


def process_document(image: np.ndarray, corners: np.ndarray, mode: str, deskew: bool = False, sharpness: float = 1.0) -> np.ndarray:
    corrected = warp(image, corners)
    if deskew:
        corrected, _ = auto_deskew(corrected)
    return enhance(corrected, mode, sharpness)
