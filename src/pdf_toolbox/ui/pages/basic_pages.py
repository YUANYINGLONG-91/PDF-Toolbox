from __future__ import annotations

from pathlib import Path

from PySide6.QtWidgets import (
    QCheckBox, QComboBox, QHBoxLayout, QLabel, QLineEdit, QMessageBox,
    QPushButton, QSpinBox, QTabWidget, QVBoxLayout, QWidget,
)

from pdf_toolbox.core.compress import compress_pdf
from pdf_toolbox.core.convert import convert_word_to_pdf, pdf_to_docx
from pdf_toolbox.core.image_pdf import IMAGE_SUFFIXES, images_to_pdf
from pdf_toolbox.core.ocr import ocr_pdf
from pdf_toolbox.core.paths import (
    check_input, publish_file, staging_path, unique_path,
)
from pdf_toolbox.core.pdf_images import pdf_to_images
from pdf_toolbox.core.pdf_pages import merge_pdfs, split_pdf
from pdf_toolbox.errors import CancelledError
from pdf_toolbox.i18n import tr as _
from pdf_toolbox.models import JobResult
from pdf_toolbox.settings import default_output_dir
from pdf_toolbox.ui.widgets import FileListPanel, FilePicker, OutputPicker


class SingleFilePage(QWidget):
    def __init__(self, host, title, description, file_filter, suffixes, output_suffix):
        super().__init__()
        self.host = host
        self.suffixes = suffixes
        self.output_suffix = output_suffix
        layout = QVBoxLayout(self)
        heading = QLabel(title)
        heading.setObjectName("pageTitle")
        layout.addWidget(heading)
        detail = QLabel(description)
        detail.setWordWrap(True)
        layout.addWidget(detail)
        layout.addSpacing(12)
        layout.addWidget(QLabel("Input file"))
        self.input = FilePicker(file_filter)
        self.input.pathSelected.connect(self._source_changed)
        layout.addWidget(self.input)
        self.options = QVBoxLayout()
        layout.addLayout(self.options)
        layout.addWidget(QLabel("Output file"))
        self.output = OutputPicker("", file_filter=f"Output (*{Path(output_suffix).suffix})")
        layout.addWidget(self.output)
        self.start_button = QPushButton("Start")
        self.start_button.setObjectName("primaryButton")
        self.start_button.clicked.connect(self.start)
        layout.addWidget(self.start_button)
        layout.addStretch()

    def _source_changed(self, raw):
        source = Path(raw)
        if source.name:
            self.output.set_default_path(default_output_dir() / f"{source.stem}{self.output_suffix}")

    def set_output_directory(self, folder: Path):
        current_name = self.output.path().name
        if current_name:
            self.output.set_default_path(folder / current_name)

    def operation(self, source, output, progress, log, cancel_event):
        raise NotImplementedError

    def start(self):
        if not self.input.edit.text().strip():
            QMessageBox.information(self, _("Input required"), _("Select an input file first."))
            return
        output = self.output.path()
        if not output.name:
            QMessageBox.information(self, _("Output required"), _("Select an output file."))
            return

        def task(progress, log, cancel_event):
            source = check_input(self.input.path(), self.suffixes)
            staged = staging_path(output)
            try:
                progress(10, _("Processing"))
                self.operation(source, staged, progress, log, cancel_event)
                if cancel_event.is_set():
                    raise CancelledError("Operation cancelled before output was published.")
                final = publish_file(staged, output)
                progress(100, _("Completed"))
                return JobResult([final], _("Created {name}").format(name=final.name))
            finally:
                staged.unlink(missing_ok=True)
        self.host.run_task(self.windowTitle() or _("Document conversion"), task)


class OCRPage(SingleFilePage):
    def __init__(self, host):
        super().__init__(host, "OCR PDF", "Add a searchable Chinese and/or English text layer to a scanned PDF. Existing text pages are skipped.", "PDF files (*.pdf)", {".pdf"}, "_ocr.pdf")
        row = QHBoxLayout()
        row.addWidget(QLabel("OCR languages"))
        self.languages = QComboBox()
        for label, value in [("Chinese + English", "chi_sim+eng"), ("English", "eng"), ("Simplified Chinese", "chi_sim")]:
            self.languages.addItem(label, value)
        row.addWidget(self.languages)
        self.rotate = QCheckBox("Rotate pages automatically")
        self.deskew = QCheckBox("Deskew pages")
        row.addWidget(self.rotate)
        row.addWidget(self.deskew)
        row.addStretch()
        self.options.addLayout(row)

    def operation(self, source, output, progress, log, cancel_event):
        return ocr_pdf(source, output, self.host.caps, languages=self.languages.currentData(), rotate_pages=self.rotate.isChecked(), deskew=self.deskew.isChecked(), cancel_event=cancel_event, log=log)


class PDFToWordPage(SingleFilePage):
    def __init__(self, host):
        super().__init__(host, "PDF to Word", "Create an editable DOCX using Microsoft Word PDF Reflow. Scanned PDFs are OCR-processed first. Complex layouts, tables, formulas, and scans may require manual correction.", "PDF files (*.pdf)", {".pdf"}, ".docx")

    def operation(self, source, output, progress, log, cancel_event):
        progress(25, _("Converting with the available Word/OCR engine"))
        return pdf_to_docx(source, output, self.host.caps, cancel_event=cancel_event, log=log)


class WordToPDFPage(SingleFilePage):
    def __init__(self, host):
        super().__init__(host, "Word to PDF", "Convert DOC or DOCX to PDF locally with Microsoft Word. Your source document is opened read-only.", "Word documents (*.doc *.docx)", {".doc", ".docx"}, ".pdf")

    def operation(self, source, output, progress, log, cancel_event):
        progress(30, _("Exporting PDF with Microsoft Word"))
        return convert_word_to_pdf(source, output, self.host.caps)


class CompressPage(SingleFilePage):
    def __init__(self, host):
        super().__init__(host, "Compress PDF", "Reduce PDF size with Ghostscript. Strong compression can reduce image quality and may not shrink every file.", "PDF files (*.pdf)", {".pdf"}, "_compressed.pdf")
        row = QHBoxLayout()
        row.addWidget(QLabel("Compression profile"))
        self.profile = QComboBox()
        for label, value in [("Balanced (150 dpi)", "balanced"), ("High quality (300 dpi)", "high"), ("Smallest size (72 dpi)", "small")]:
            self.profile.addItem(label, value)
        row.addWidget(self.profile)
        row.addStretch()
        self.options.addLayout(row)

    def operation(self, source, output, progress, log, cancel_event):
        return compress_pdf(source, output, self.host.caps, self.profile.currentData(), cancel_event, log)


class ImagesPDFPage(QWidget):
    def __init__(self, host):
        super().__init__()
        self.host = host
        layout = QVBoxLayout(self)
        title = QLabel("Images to PDF")
        title.setObjectName("pageTitle")
        layout.addWidget(title)
        layout.addWidget(QLabel("Combine multiple images in the displayed order. Use Move up/down to arrange pages."))
        self.files = FileListPanel("Images", "Images (*.jpg *.jpeg *.png *.tif *.tiff *.bmp *.webp)", IMAGE_SUFFIXES)
        layout.addWidget(self.files, 1)
        self.ocr = QCheckBox("Add searchable Chinese + English text with OCR")
        layout.addWidget(self.ocr)
        self.output = OutputPicker(str(default_output_dir() / "images.pdf"), file_filter="PDF files (*.pdf)")
        layout.addWidget(self.output)
        button = QPushButton("Create PDF")
        button.setObjectName("primaryButton")
        button.clicked.connect(self.start)
        layout.addWidget(button)

    def set_output_directory(self, folder: Path):
        self.output.set_default_path(folder / "images.pdf")

    def start(self):
        images = self.files.paths()
        if not images:
            QMessageBox.information(self, _("No images"), _("Add at least one image."))
            return
        output = self.output.path()
        if output.suffix.lower() != ".pdf":
            output = output.with_suffix(".pdf")

        def task(progress, log, cancel_event):
            staged = staging_path(output)
            try:
                progress(15, _("Combining images"))
                images_to_pdf(images, staged)
                if self.ocr.isChecked():
                    ocr_staged = staging_path(output)
                    progress(35, _("Running OCR"))
                    ocr_pdf(staged, ocr_staged, self.host.caps, cancel_event=cancel_event, log=log)
                    staged.unlink(missing_ok=True)
                    staged = ocr_staged
                final = publish_file(staged, output)
                progress(100, _("Completed"))
                return JobResult([final], _("Created {count}-page PDF").format(count=len(images)))
            finally:
                staged.unlink(missing_ok=True)
        self.host.run_task(_("Images to PDF"), task)


class PDFImagesPage(QWidget):
    def __init__(self, host):
        super().__init__()
        self.host = host
        layout = QVBoxLayout(self)
        title = QLabel("PDF to Images")
        title.setObjectName("pageTitle")
        layout.addWidget(title)
        layout.addWidget(QLabel("Render every PDF page as a PNG or JPG image."))
        self.input = FilePicker("PDF files (*.pdf)")
        layout.addWidget(self.input)
        row = QHBoxLayout()
        row.addWidget(QLabel("Format"))
        self.format = QComboBox()
        self.format.addItems(["png", "jpg"])
        row.addWidget(self.format)
        row.addWidget(QLabel("DPI"))
        self.dpi = QSpinBox()
        self.dpi.setRange(72, 600)
        self.dpi.setValue(150)
        row.addWidget(self.dpi)
        row.addStretch()
        layout.addLayout(row)
        layout.addWidget(QLabel("Output folder (a unique subfolder will be created)"))
        self.output = OutputPicker(str(default_output_dir() / "pdf_pages"), directory=True)
        layout.addWidget(self.output)
        button = QPushButton("Convert pages")
        button.setObjectName("primaryButton")
        button.clicked.connect(self.start)
        layout.addWidget(button)
        layout.addStretch()

    def set_output_directory(self, folder: Path):
        self.output.set_default_path(folder / "pdf_pages")

    def start(self):
        if not self.input.edit.text():
            QMessageBox.information(self, _("Input required"), _("Select a PDF first."))
            return
        def task(progress, log, cancel_event):
            progress(15, _("Rendering pages"))
            outputs = pdf_to_images(self.input.path(), self.output.path(), self.format.currentText(), self.dpi.value())
            progress(100, _("Completed"))
            return JobResult(outputs, _("Created {count} images in {folder}").format(count=len(outputs), folder=outputs[0].parent))
        self.host.run_task(_("PDF to images"), task)


class MergeSplitPage(QWidget):
    def __init__(self, host):
        super().__init__()
        self.host = host
        layout = QVBoxLayout(self)
        title = QLabel("Merge or Split PDF")
        title.setObjectName("pageTitle")
        layout.addWidget(title)
        tabs = QTabWidget()
        layout.addWidget(tabs)
        merge = QWidget()
        merge_layout = QVBoxLayout(merge)
        self.merge_files = FileListPanel("PDFs in merge order", "PDF files (*.pdf)", {".pdf"})
        merge_layout.addWidget(self.merge_files)
        self.merge_output = OutputPicker(str(default_output_dir() / "merged.pdf"), file_filter="PDF files (*.pdf)")
        merge_layout.addWidget(self.merge_output)
        merge_button = QPushButton("Merge PDFs")
        merge_button.setObjectName("primaryButton")
        merge_button.clicked.connect(self.start_merge)
        merge_layout.addWidget(merge_button)
        tabs.addTab(merge, "Merge")

        split = QWidget()
        split_layout = QVBoxLayout(split)
        self.split_input = FilePicker("PDF files (*.pdf)")
        split_layout.addWidget(self.split_input)
        split_layout.addWidget(QLabel("Page groups separated by semicolons; leave blank for one file per page."))
        self.ranges = QLineEdit()
        self.ranges.setPlaceholderText("Example: 1-3;4-6;7,9")
        split_layout.addWidget(self.ranges)
        self.split_output = OutputPicker(str(default_output_dir() / "split_pages"), directory=True)
        split_layout.addWidget(self.split_output)
        split_button = QPushButton("Split PDF")
        split_button.setObjectName("primaryButton")
        split_button.clicked.connect(self.start_split)
        split_layout.addWidget(split_button)
        split_layout.addStretch()
        tabs.addTab(split, "Split")

    def set_output_directory(self, folder: Path):
        self.merge_output.set_default_path(folder / "merged.pdf")
        self.split_output.set_default_path(folder / "split_pages")

    def start_merge(self):
        sources = self.merge_files.paths()
        if not sources:
            QMessageBox.information(self, _("No PDFs"), _("Add at least one PDF."))
            return
        output = self.merge_output.path()
        def task(progress, log, cancel_event):
            staged = staging_path(output)
            try:
                progress(20, _("Merging PDFs"))
                merge_pdfs(sources, staged)
                final = publish_file(staged, output)
                progress(100, _("Completed"))
                return JobResult([final], _("Merged {count} PDFs").format(count=len(sources)))
            finally:
                staged.unlink(missing_ok=True)
        self.host.run_task(_("Merge PDFs"), task)

    def start_split(self):
        if not self.split_input.edit.text():
            QMessageBox.information(self, _("Input required"), _("Select a PDF first."))
            return
        def task(progress, log, cancel_event):
            progress(20, _("Splitting PDF"))
            output_dir = unique_path(self.split_output.path())
            outputs = split_pdf(self.split_input.path(), self.ranges.text(), output_dir)
            progress(100, _("Completed"))
            return JobResult(outputs, _("Created {count} PDF files").format(count=len(outputs)))
        self.host.run_task(_("Split PDF"), task)
