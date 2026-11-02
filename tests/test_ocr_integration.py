from __future__ import annotations

import pymupdf

from pdf_toolbox.core.capabilities import detect_capabilities
from pdf_toolbox.core.image_pdf import images_to_pdf
from pdf_toolbox.core.ocr import ocr_pdf


def test_chinese_english_ocr(tmp_path, make_text_image):
    image = make_text_image(tmp_path / "中文输入.png", chinese=True)
    source = tmp_path / "source.pdf"
    output = tmp_path / "output.pdf"
    images_to_pdf([image], source)
    caps = detect_capabilities()
    ocr_pdf(source, output, caps)
    with pymupdf.open(output) as document:
        text = document[0].get_text()
    assert "中文识别测试" in text
    assert "OCRmyPDF" in text
    assert "12345" in text
