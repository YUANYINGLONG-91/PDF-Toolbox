from __future__ import annotations

import threading
from pathlib import Path

import pymupdf
from docx import Document
from docx.shared import Inches, Pt

from pdf_toolbox.core.ocr import ocr_pdf
from pdf_toolbox.core.paths import check_input, new_workspace
from pdf_toolbox.core.pdf_pages import validate_pdf
from pdf_toolbox.core.word_com import pdf_to_docx_word, word_to_pdf
from pdf_toolbox.errors import CancelledError, OperationError
from pdf_toolbox.models import Capabilities, LogCallback, ignore_log


def is_predominantly_scanned(source: str | Path) -> bool:
    document = pymupdf.open(source)
    scanned_pages = 0
    try:
        for page in document:
            text = page.get_text("text").strip()
            if len(text) < 30 and (page.get_images(full=True) or len(text) < 5):
                scanned_pages += 1
        return bool(len(document)) and scanned_pages / len(document) >= 0.5
    finally:
        document.close()


def validate_docx(path: str | Path, require_text: bool = False) -> None:
    try:
        document = Document(path)
        text = "\n".join(paragraph.text for paragraph in document.paragraphs)
        text += "\n" + "\n".join(cell.text for table in document.tables for row in table.rows for cell in row.cells)
        if require_text and len(text.strip()) < 2:
            raise OperationError("The DOCX contains no editable text. Review the OCR quality and try again.")
    except OperationError:
        raise
    except Exception as exc:
        raise OperationError(f"The generated DOCX is not readable: {exc}") from exc


def _ocr_reflow_docx(source: Path, output: Path) -> Path:
    pdf = pymupdf.open(source)
    document = Document()
    try:
        for page_index, page in enumerate(pdf):
            if page_index:
                document.add_page_break()
            section = document.sections[-1]
            section.page_width, section.page_height = Pt(page.rect.width), Pt(page.rect.height)
            section.top_margin = section.bottom_margin = Inches(0.45)
            section.left_margin = section.right_margin = Inches(0.45)
            blocks = page.get_text("dict")["blocks"]
            for block in blocks:
                if block.get("type") != 0:
                    continue
                paragraph = document.add_paragraph()
                for line in block.get("lines", []):
                    for span in line.get("spans", []):
                        text = span.get("text", "")
                        if not text:
                            continue
                        run = paragraph.add_run(text)
                        run.font.size = Pt(max(7, min(28, float(span.get("size", 11)))))
                        run.bold = bool(span.get("flags", 0) & 16)
                    paragraph.add_run("\n")
        document.save(output)
    finally:
        pdf.close()
    return output


def pdf_to_docx(
    source: str | Path,
    output: str | Path,
    caps: Capabilities,
    *,
    cancel_event: threading.Event | None = None,
    log: LogCallback = ignore_log,
) -> Path:
    source = check_input(source, {".pdf"})
    scanned = is_predominantly_scanned(source)
    conversion_source = source
    with new_workspace() as workspace:
        if scanned:
            if cancel_event and cancel_event.is_set():
                raise CancelledError("Operation cancelled.")
            log("Scanned PDF detected. Running OCR before Word conversion.")
            conversion_source = Path(workspace) / "ocr.pdf"
            ocr_pdf(source, conversion_source, caps, cancel_event=cancel_event, log=log)
        if caps.word_ready:
            try:
                pdf_to_docx_word(conversion_source, output)
                validate_docx(output, require_text=scanned)
                return Path(output)
            except Exception as exc:
                if cancel_event and cancel_event.is_set():
                    raise CancelledError("Operation cancelled.") from exc
                log(f"Word PDF Reflow was not successful: {exc}")
                Path(output).unlink(missing_ok=True)
        if scanned:
            log("Creating an editable OCR-reflowed DOCX. Layout will be approximate.")
            _ocr_reflow_docx(conversion_source, Path(output))
        else:
            log("Using pdf2docx for this text-based PDF.")
            try:
                from pdf2docx import Converter
                converter = Converter(str(conversion_source))
                try:
                    converter.convert(str(output))
                finally:
                    converter.close()
            except Exception as exc:
                raise OperationError(f"PDF to Word conversion failed: {exc}") from exc
    validate_docx(output, require_text=scanned)
    return Path(output)


def convert_word_to_pdf(source: str | Path, output: str | Path, caps: Capabilities) -> Path:
    if not caps.word_ready:
        raise OperationError("Microsoft Word is required for DOC/DOCX to PDF conversion.")
    word_to_pdf(source, output)
    validate_pdf(output)
    return Path(output)
