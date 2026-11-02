from __future__ import annotations

import pymupdf
from docx import Document

from pdf_toolbox.core.capabilities import detect_capabilities
from pdf_toolbox.core.convert import convert_word_to_pdf, pdf_to_docx


def test_word_pdf_round_trip(tmp_path):
    source = Document()
    source.add_heading("PDF Toolbox Verification", 0)
    source.add_paragraph("Editable English paragraph for Word and PDF conversion.")
    table = source.add_table(rows=2, cols=2)
    table.cell(0, 0).text = "Name"
    table.cell(0, 1).text = "Value"
    table.cell(1, 0).text = "Result"
    table.cell(1, 1).text = "12345"
    docx = tmp_path / "source.docx"
    source.save(docx)
    caps = detect_capabilities()
    pdf = tmp_path / "converted.pdf"
    convert_word_to_pdf(docx, pdf, caps)
    with pymupdf.open(pdf) as document:
        text = "".join(page.get_text() for page in document)
    assert "PDF Toolbox Verification" in text
    assert "12345" in text
    output = tmp_path / "roundtrip.docx"
    pdf_to_docx(pdf, output, caps)
    converted = Document(output)
    text = "\n".join(p.text for p in converted.paragraphs)
    text += "\n" + "\n".join(cell.text for table in converted.tables for row in table.rows for cell in row.cells)
    assert "PDF Toolbox Verification" in text
    assert "Editable English paragraph" in text
