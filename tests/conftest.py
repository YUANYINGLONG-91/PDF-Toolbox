from __future__ import annotations

from pathlib import Path

import pytest
from PIL import Image, ImageDraw, ImageFont
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas


@pytest.fixture
def make_pdf():
    def factory(path: Path, pages: int = 1, prefix: str = "Document") -> Path:
        pdf = canvas.Canvas(str(path), pagesize=A4)
        for page in range(1, pages + 1):
            pdf.setFont("Helvetica", 18)
            pdf.drawString(72, 760, f"{prefix} - page {page}")
            pdf.setFont("Helvetica", 11)
            pdf.drawString(72, 720, "Editable English text for PDF Toolbox verification.")
            pdf.rect(72, 640, 180, 50, stroke=1, fill=0)
            pdf.showPage()
        pdf.save()
        return path
    return factory


@pytest.fixture
def make_text_image():
    def factory(path: Path, chinese: bool = False) -> Path:
        image = Image.new("RGB", (1600, 500), "white")
        draw = ImageDraw.Draw(image)
        font = ImageFont.truetype(r"C:\Windows\Fonts\msyh.ttc" if chinese else r"C:\Windows\Fonts\arial.ttf", 70)
        draw.text((70, 70), "中文识别测试" if chinese else "PDF Toolbox", font=font, fill="black")
        draw.text((70, 240), "OCRmyPDF 12345", font=font, fill="black")
        image.save(path, dpi=(300, 300))
        return path
    return factory
