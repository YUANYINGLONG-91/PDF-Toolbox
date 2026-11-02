from __future__ import annotations

from pathlib import Path

import pythoncom
import win32com.client

from pdf_toolbox.core.paths import check_input
from pdf_toolbox.errors import OperationError

WD_FORMAT_PDF = 17
WD_FORMAT_DOCX = 16
MSO_FORCE_DISABLE_MACROS = 3


def _new_word():
    word = win32com.client.DispatchEx("Word.Application")
    word.Visible = False
    word.DisplayAlerts = 0
    word.AutomationSecurity = MSO_FORCE_DISABLE_MACROS
    return word


def _convert(source: Path, output: Path, target: str) -> Path:
    pythoncom.CoInitialize()
    word = None
    document = None
    try:
        word = _new_word()
        document = word.Documents.Open(
            str(source), ConfirmConversions=False, ReadOnly=True,
            AddToRecentFiles=False, Visible=False,
        )
        if target == "pdf":
            document.ExportAsFixedFormat(str(output), WD_FORMAT_PDF)
        else:
            document.SaveAs2(str(output), FileFormat=WD_FORMAT_DOCX)
        document.Close(False)
        document = None
        word.Quit(0)
        word = None
    except Exception as exc:
        raise OperationError(f"Microsoft Word conversion failed: {exc}") from exc
    finally:
        if document is not None:
            try:
                document.Close(False)
            except Exception:
                pass
        if word is not None:
            try:
                word.Quit(0)
            except Exception:
                pass
        pythoncom.CoUninitialize()
    if not output.is_file() or output.stat().st_size == 0:
        raise OperationError("Microsoft Word did not create an output file.")
    return output


def word_to_pdf(source: str | Path, output: str | Path) -> Path:
    source = check_input(source, {".doc", ".docx"})
    return _convert(source, Path(output), "pdf")


def pdf_to_docx_word(source: str | Path, output: str | Path) -> Path:
    source = check_input(source, {".pdf"})
    return _convert(source, Path(output), "docx")
