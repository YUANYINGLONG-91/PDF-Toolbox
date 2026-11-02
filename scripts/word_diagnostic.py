from pathlib import Path
import sys
import pythoncom
import win32com.client
from docx import Document

root = Path(r"C:\Users\yuany\Desktop\PDF Toolbox\work")
root.mkdir(parents=True, exist_ok=True)
docx_path = root / "word-diagnostic.docx"
pdf_path = root / "word-diagnostic.pdf"
roundtrip_path = root / "word-diagnostic-roundtrip.docx"
document = Document()
document.add_heading("PDF Toolbox Diagnostic", 0)
document.add_paragraph("Editable conversion test 12345.")
document.save(docx_path)
print("Created test DOCX", flush=True)
pythoncom.CoInitialize()
word = win32com.client.DispatchEx("Word.Application")
print("Created Word instance", flush=True)
word.Visible = True
word.DisplayAlerts = 0
word.AutomationSecurity = 3
print("Opening DOCX", flush=True)
doc = word.Documents.Open(str(docx_path), ConfirmConversions=False, ReadOnly=True, AddToRecentFiles=False, Visible=True)
print("Exporting PDF", flush=True)
doc.ExportAsFixedFormat(str(pdf_path), 17)
print("Exported PDF", flush=True)
doc.Close(False)
print("Opening PDF for Reflow", flush=True)
doc = word.Documents.Open(str(pdf_path), ConfirmConversions=False, ReadOnly=True, AddToRecentFiles=False, Visible=True)
print("Saving DOCX", flush=True)
doc.SaveAs2(str(roundtrip_path), FileFormat=16)
print("Saved DOCX", flush=True)
doc.Close(False)
word.Quit(0)
pythoncom.CoUninitialize()
print("DONE", flush=True)
