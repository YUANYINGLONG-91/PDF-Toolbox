from pdf_toolbox.core.capabilities import detect_capabilities
from pdf_toolbox.core.compress import compress_pdf
from pdf_toolbox.core.image_pdf import images_to_pdf
from pdf_toolbox.core.pdf_pages import page_count


def test_ghostscript_compression(tmp_path, make_text_image):
    image = make_text_image(tmp_path / "source.png")
    source = tmp_path / "source.pdf"
    output = tmp_path / "compressed.pdf"
    images_to_pdf([image], source)
    compress_pdf(source, output, detect_capabilities(), "balanced")
    assert page_count(output) == 1
    assert output.stat().st_size > 1000
