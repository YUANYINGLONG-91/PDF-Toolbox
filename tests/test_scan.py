from __future__ import annotations

import cv2
import numpy as np
import pytest

from pdf_toolbox.core.scan import (
    auto_deskew, detect_corners, enhance, estimate_skew_angle, load_bgr,
    order_corners, preview, process_document, rotate90, save_bgr, warp,
)
from pdf_toolbox.errors import ValidationError


def synthetic_photo():
    image = np.full((900, 1200, 3), 65, dtype=np.uint8)
    corners = np.array([[240, 110], [1010, 190], [920, 790], [130, 670]], dtype=np.float32)
    cv2.fillConvexPoly(image, corners.astype(np.int32), (245, 245, 245))
    cv2.polylines(image, [corners.astype(np.int32)], True, (15, 15, 15), 5)
    for y in range(300, 600, 55):
        cv2.line(image, (300, y), (800, y + 20), (40, 40, 40), 8)
    return image, corners


def test_order_corners():
    source = np.array([[100, 100], [0, 0], [100, 0], [0, 100]])
    assert np.array_equal(order_corners(source), [[0, 0], [100, 0], [100, 100], [0, 100]])


def test_detect_and_process_document():
    image, expected = synthetic_photo()
    corners, detected = detect_corners(image)
    assert detected
    assert np.linalg.norm(order_corners(corners) - order_corners(expected)) < 180
    for mode in ["original", "color", "grayscale", "bw"]:
        result = process_document(image, corners, mode)
        assert result.shape[0] > 300 and result.shape[1] > 300
        if mode in {"grayscale", "bw"}:
            assert result.ndim == 2


def test_rotation_and_unicode_round_trip(tmp_path):
    image, _ = synthetic_photo()
    rotated = rotate90(image)
    assert rotated.shape == (1200, 900, 3)
    path = tmp_path / "中文 photo.png"
    save_bgr(path, preview(rotated, 700))
    loaded = load_bgr(path)
    assert max(loaded.shape[:2]) == 700


def test_shadow_removal_and_document_detection():
    image, expected = synthetic_photo()
    rows, columns = image.shape[:2]
    horizontal = np.linspace(0.48, 1.0, columns, dtype=np.float32)
    vertical = np.linspace(0.80, 1.0, rows, dtype=np.float32)[:, None]
    illumination = horizontal[None, :] * vertical
    shadowed = np.clip(image.astype(np.float32) * illumination[..., None], 0, 255).astype(np.uint8)
    shadowed = cv2.GaussianBlur(shadowed, (0, 0), 1.2)

    corners, detected = detect_corners(shadowed)
    assert detected
    assert np.linalg.norm(order_corners(corners) - order_corners(expected)) < 210

    original = cv2.cvtColor(warp(shadowed, corners), cv2.COLOR_BGR2GRAY)
    enhanced_color = enhance(warp(shadowed, corners), "color")
    enhanced = cv2.cvtColor(enhanced_color, cv2.COLOR_BGR2GRAY)
    paper = original > np.percentile(original, 60)
    original_spread = np.percentile(original[paper], 90) - np.percentile(original[paper], 10)
    enhanced_spread = np.percentile(enhanced[paper], 90) - np.percentile(enhanced[paper], 10)
    assert enhanced[paper].mean() > original[paper].mean() + 30
    assert enhanced_spread < original_spread * 0.75


def test_auto_deskew_and_blank_page_safety():
    image = np.full((520, 820), 255, dtype=np.uint8)
    for y in range(65, 470, 34):
        for x in range(70, 700, 155):
            cv2.line(image, (x, y), (x + 115, y), 25, 3)
            cv2.line(image, (x + 10, y + 10), (x + 95, y + 10), 70, 2)
    matrix = cv2.getRotationMatrix2D((410, 260), 3.0, 1.0)
    rotated = cv2.warpAffine(image, matrix, (820, 520), flags=cv2.INTER_CUBIC, borderValue=255)
    angle = estimate_skew_angle(rotated)
    assert abs(angle + 3.0) <= 0.65
    corrected, applied = auto_deskew(rotated)
    assert applied == angle
    assert corrected.shape == rotated.shape
    assert abs(estimate_skew_angle(corrected)) <= 0.65
    assert estimate_skew_angle(np.full((500, 700), 255, dtype=np.uint8)) == 0.0


def _edge_strength(image):
    x = cv2.Sobel(image, cv2.CV_32F, 1, 0, ksize=3)
    y = cv2.Sobel(image, cv2.CV_32F, 0, 1, ksize=3)
    return cv2.magnitude(x, y)


def test_strong_sharpening_improves_blurred_handwriting():
    image = np.full((420, 680, 3), 250, dtype=np.uint8)
    strokes = np.array([
        [70, 80], [105, 55], [92, 160], [150, 90], [120, 180],
        [190, 100], [230, 60], [215, 175], [280, 85], [300, 170],
    ], dtype=np.int32)
    cv2.polylines(image, [strokes], False, (35, 35, 35), 6, cv2.LINE_AA)
    cv2.line(image, (70, 235), (560, 245), (55, 55, 55), 5, cv2.LINE_AA)
    cv2.line(image, (95, 285), (490, 300), (70, 70, 70), 4, cv2.LINE_AA)
    blurred = cv2.GaussianBlur(image, (0, 0), 2.0)
    before = cv2.cvtColor(blurred, cv2.COLOR_BGR2GRAY)
    standard = enhance(blurred, "grayscale", 1.0)
    strong = enhance(blurred, "grayscale", 1.55)
    edges = _edge_strength(before) > 18
    assert _edge_strength(standard)[edges].mean() > _edge_strength(before)[edges].mean()
    assert _edge_strength(strong)[edges].mean() > _edge_strength(standard)[edges].mean()
    assert strong[20:40, 20:600].mean() > 245
    assert strong.shape == blurred.shape[:2]
    assert np.array_equal(enhance(blurred, "original", 1.55), blurred)


@pytest.mark.parametrize("sharpness", [-0.01, 2.01, float("nan")])
def test_invalid_sharpness_is_rejected(sharpness):
    image = np.full((100, 120, 3), 255, dtype=np.uint8)
    with pytest.raises(ValidationError, match="Sharpness"):
        enhance(image, "color", sharpness)
