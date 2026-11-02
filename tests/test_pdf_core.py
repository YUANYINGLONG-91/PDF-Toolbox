from __future__ import annotations

import pymupdf
import pytest
from PIL import Image

from pdf_toolbox.core.image_pdf import images_to_pdf
from pdf_toolbox.core.paths import pdf_output_path, publish_file, unique_path
from pdf_toolbox.core.pdf_images import pdf_to_images
from pdf_toolbox.core.pdf_pages import (
    merge_pdfs, organize_pdf, page_count, parse_page_range, split_pdf,
)
from pdf_toolbox.errors import ValidationError


def test_page_range_parser():
    assert parse_page_range("1-3,5,8-9", 10) == [0, 1, 2, 4, 7, 8]
    with pytest.raises(ValidationError):
        parse_page_range("4-2", 10)
    with pytest.raises(ValidationError):
        parse_page_range("0", 10)


def test_images_merge_split_organize_and_render(tmp_path, make_pdf):
    images = []
    for index, color in enumerate([(255, 0, 0), (0, 255, 0), (0, 0, 255)], 1):
        path = tmp_path / f"图片 {index}.png"
        Image.new("RGB", (320, 240), color).save(path)
        images.append(path)
    combined = tmp_path / "combined.pdf"
    images_to_pdf(images, combined)
    assert page_count(combined) == 3
    document = pymupdf.open(combined)
    center_colors = []
    for page in document:
        pixmap = page.get_pixmap(matrix=pymupdf.Matrix(0.2, 0.2), alpha=False)
        center = (pixmap.height // 2) * pixmap.stride + (pixmap.width // 2) * pixmap.n
        center_colors.append(tuple(pixmap.samples[center:center + 3]))
    document.close()
    assert center_colors[0][0] > 200 and center_colors[1][1] > 200 and center_colors[2][2] > 200

    first = make_pdf(tmp_path / "first.pdf", 2, "First")
    second = make_pdf(tmp_path / "second.pdf", 3, "Second")
    merged = tmp_path / "merged.pdf"
    merge_pdfs([first, second], merged)
    assert page_count(merged) == 5

    outputs = split_pdf(merged, "1-2;3,4", tmp_path / "split")
    assert [page_count(path) for path in outputs] == [2, 2]

    organized = tmp_path / "organized.pdf"
    organize_pdf(merged, organized, [4, 2, 0], {0: 90, 2: 180})
    assert page_count(organized) == 3
    with pymupdf.open(organized) as result:
        assert "Second - page 3" in result[0].get_text()
        assert result[0].rotation == 90
        assert result[2].rotation == 180

    rendered = pdf_to_images(organized, tmp_path / "rendered", "png", 100)
    assert len(rendered) == 3
    assert all(path.stat().st_size > 100 for path in rendered)


def test_unique_output_and_publish(tmp_path):
    requested = tmp_path / "result.pdf"
    requested.write_bytes(b"original")
    assert unique_path(requested).name == "result_001.pdf"
    staged = tmp_path / "staged.pdf"
    staged.write_bytes(b"new content")
    final = publish_file(staged, requested)
    assert final.name == "result_001.pdf"
    assert requested.read_bytes() == b"original"
    assert final.read_bytes() == b"new content"


def test_pdf_output_path_adds_extension_and_preserves_unicode(tmp_path):
    assert pdf_output_path(tmp_path, "  手写笔记  ") == tmp_path / "手写笔记.pdf"
    assert pdf_output_path(tmp_path, "notes.PDF") == tmp_path / "notes.PDF"


@pytest.mark.parametrize("name", [
    "", "   ", ".pdf", "notes.txt", "bad/name.pdf", "bad\\name.pdf",
    "bad:name.pdf", "notes.", "notes .pdf", "CON.pdf", "com1.pdf",
    "line\nbreak.pdf", "C:/absolute.pdf",
])
def test_pdf_output_path_rejects_invalid_names(tmp_path, name):
    with pytest.raises(ValidationError):
        pdf_output_path(tmp_path, name)


def test_pdf_output_path_requires_existing_folder(tmp_path):
    with pytest.raises(ValidationError, match="existing output folder"):
        pdf_output_path(tmp_path / "missing", "notes.pdf")
