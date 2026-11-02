from __future__ import annotations

import cv2
import numpy as np
import pymupdf
import pytest

from pdf_toolbox.core.capabilities import detect_capabilities
from pdf_toolbox.core.image_pdf import images_to_pdf
from pdf_toolbox.core.ocr import ocr_pdf
from pdf_toolbox.core.scan import detect_corners, load_bgr, process_document, save_bgr


@pytest.mark.parametrize("sharpness", [1.0, 1.55])
def test_photo_cleanup_preserves_chinese_english_ocr(tmp_path, make_text_image, sharpness):
    source_image = load_bgr(make_text_image(tmp_path / "text.png", chinese=True))
    source_height, source_width = source_image.shape[:2]
    page_corners = np.array([[0, 0], [source_width - 1, 0], [source_width - 1, source_height - 1], [0, source_height - 1]], dtype=np.float32)
    photo_corners = np.array([[260, 130], [1770, 210], [1640, 720], [170, 650]], dtype=np.float32)
    matrix = cv2.getPerspectiveTransform(page_corners, photo_corners)
    photo = cv2.warpPerspective(source_image, matrix, (1950, 850), flags=cv2.INTER_CUBIC, borderValue=(55, 55, 55))
    shading = np.linspace(0.65, 1.0, photo.shape[1], dtype=np.float32)
    photo = np.clip(photo.astype(np.float32) * shading[None, :, None], 0, 255).astype(np.uint8)

    corners, detected = detect_corners(photo)
    assert detected
    cleaned = process_document(photo, corners, "color", deskew=True, sharpness=sharpness)
    cleaned_path = tmp_path / "cleaned.jpg"
    save_bgr(cleaned_path, cleaned)
    source_pdf = tmp_path / "photo.pdf"
    output_pdf = tmp_path / "searchable.pdf"
    images_to_pdf([cleaned_path], source_pdf)
    ocr_pdf(source_pdf, output_pdf, detect_capabilities())
    with pymupdf.open(output_pdf) as document:
        text = document[0].get_text()
    assert "中文识别测试" in text
    assert "OCRmyPDF" in text
    assert "12345" in text
