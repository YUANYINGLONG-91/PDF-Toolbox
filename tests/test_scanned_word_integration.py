from docx import Document

from pdf_toolbox.core.capabilities import detect_capabilities
from pdf_toolbox.core.convert import pdf_to_docx
from pdf_toolbox.core.image_pdf import images_to_pdf


def test_scanned_pdf_to_editable_word(tmp_path, make_text_image):
    image = make_text_image(tmp_path / "scan.png")
    source = tmp_path / "scan.pdf"
    output = tmp_path / "editable.docx"
    images_to_pdf([image], source)
    pdf_to_docx(source, output, detect_capabilities())
    document = Document(output)
    text = "\n".join(paragraph.text for paragraph in document.paragraphs)
    text += "\n" + "\n".join(cell.text for table in document.tables for row in table.rows for cell in row.cells)
    assert "OCRmyPDF" in text
    assert "12345" in text
