from __future__ import annotations

from pathlib import Path

from PySide6.QtWidgets import (
    QCheckBox, QComboBox, QFormLayout, QGroupBox, QHBoxLayout, QLabel, QLineEdit,
    QMessageBox, QPushButton, QSpinBox, QTabWidget, QVBoxLayout, QWidget,
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
from pdf_toolbox.ui.widgets import (
    FileListPanel, FilePicker, OutputPicker, add_page_header, add_primary_action,
    create_page_layout,
)


class SingleFilePage(QWidget):
    def __init__(self, host, title, description, file_filter, suffixes, output_suffix):
        super().__init__()
        self.host = host
        self.suffixes = suffixes
        self.output_suffix = output_suffix
        layout = create_page_layout(self)
        add_page_header(layout, title, description)

        input_card = QGroupBox("Input file")
        input_layout = QVBoxLayout(input_card)
        self.input = FilePicker(file_filter)
        self.input.pathSelected.connect(self._source_changed)
        input_layout.addWidget(self.input)
        layout.addWidget(input_card)

        self.options_card = QGroupBox("Options")
        self.options = QVBoxLayout(self.options_card)
        self.options.setSpacing(12)
        self.options_card.setVisible(False)
        layout.addWidget(self.options_card)

        output_card = QGroupBox("Output file")
        output_layout = QVBoxLayout(output_card)
        output_layout.setSpacing(12)
        self.output = OutputPicker("", file_filter=f"Output (*{Path(output_suffix).suffix})")
        output_layout.addWidget(self.output)
        self.start_button = QPushButton("Start")
        self.start_button.clicked.connect(self.start)
        add_primary_action(output_layout, self.start_button)
        layout.addWidget(output_card)
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
        self.options_card.setVisible(True)
        row = QHBoxLayout()
        row.setSpacing(10)
        row.addWidget(QLabel("OCR languages"))
        self.languages = QComboBox()
        for label, value in [("Chinese + English", "chi_sim+eng"), ("English", "eng"), ("Simplified Chinese", "chi_sim")]:
            self.languages.addItem(label, value)
        row.addWidget(self.languages)
        row.addStretch()
        self.options.addLayout(row)
        checks = QHBoxLayout()
        checks.setSpacing(20)
        self.rotate = QCheckBox("Rotate pages automatically")
        self.deskew = QCheckBox("Deskew pages")
        checks.addWidget(self.rotate)
        checks.addWidget(self.deskew)
        checks.addStretch()
        self.options.addLayout(checks)

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
        self.options_card.setVisible(True)
        row = QHBoxLayout()
        row.setSpacing(10)
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
        layout = create_page_layout(self)
        add_page_header(layout, "Images to PDF", "Combine multiple images in the displayed order. Use Move up/down to arrange pages.")
        body = QHBoxLayout()
        body.setSpacing(16)
        layout.addLayout(body, 1)

        files_card = QGroupBox("Images")
        files_layout = QVBoxLayout(files_card)
        self.files = FileListPanel("Add and arrange images", "Images (*.jpg *.jpeg *.png *.tif *.tiff *.bmp *.webp)", IMAGE_SUFFIXES)
        files_layout.addWidget(self.files, 1)
        body.addWidget(files_card, 1)

        export_card = QGroupBox("Export PDF")
        export_card.setMinimumWidth(315)
        export_card.setMaximumWidth(365)
        export_layout = QVBoxLayout(export_card)
        export_layout.setSpacing(14)
        self.ocr = QCheckBox("Searchable PDF (Chinese + English OCR)")
        export_layout.addWidget(self.ocr)
        output_label = QLabel("Output file")
        export_layout.addWidget(output_label)
        self.output = OutputPicker(str(default_output_dir() / "images.pdf"), file_filter="PDF files (*.pdf)")
        export_layout.addWidget(self.output)
        button = QPushButton("Create PDF")
        button.clicked.connect(self.start)
        add_primary_action(export_layout, button)
        export_layout.addStretch()
        body.addWidget(export_card)

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
        layout = create_page_layout(self)
        add_page_header(layout, "PDF to Images", "Render every PDF page as a PNG or JPG image.")
        input_card = QGroupBox("Input file")
        input_layout = QVBoxLayout(input_card)
        self.input = FilePicker("PDF files (*.pdf)")
        input_layout.addWidget(self.input)
        layout.addWidget(input_card)

        output_card = QGroupBox("Output settings")
        output_layout = QVBoxLayout(output_card)
        form = QFormLayout()
        form.setHorizontalSpacing(16)
        form.setVerticalSpacing(12)
        self.format = QComboBox()
        self.format.addItems(["png", "jpg"])
        form.addRow("Format", self.format)
        self.dpi = QSpinBox()
        self.dpi.setRange(72, 600)
        self.dpi.setValue(150)
        self.dpi.setSuffix(" dpi")
        form.addRow("DPI", self.dpi)
        self.output = OutputPicker(str(default_output_dir() / "pdf_pages"), directory=True)
        form.addRow("Output folder (a unique subfolder will be created)", self.output)
        output_layout.addLayout(form)
        button = QPushButton("Convert pages")
        button.clicked.connect(self.start)
        add_primary_action(output_layout, button)
        layout.addWidget(output_card)
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
        layout = create_page_layout(self)
        add_page_header(layout, "Merge or Split PDF", "Combine PDFs into one document or split selected page groups into new files.")
        tabs = QTabWidget()
        tabs.setDocumentMode(True)
        layout.addWidget(tabs, 1)
        merge = QWidget()
        merge_layout = QVBoxLayout(merge)
        merge_layout.setContentsMargins(20, 20, 20, 20)
        merge_layout.setSpacing(12)
        self.merge_files = FileListPanel("PDFs in merge order", "PDF files (*.pdf)", {".pdf"})
        merge_layout.addWidget(self.merge_files, 1)
        merge_form = QFormLayout()
        self.merge_output = OutputPicker(str(default_output_dir() / "merged.pdf"), file_filter="PDF files (*.pdf)")
        merge_form.addRow("Output file", self.merge_output)
        merge_layout.addLayout(merge_form)
        merge_button = QPushButton("Merge PDFs")
        merge_button.clicked.connect(self.start_merge)
        add_primary_action(merge_layout, merge_button)
        tabs.addTab(merge, "Merge")

        split = QWidget()
        split_layout = QVBoxLayout(split)
        split_layout.setContentsMargins(20, 20, 20, 20)
        split_layout.setSpacing(12)
        split_form = QFormLayout()
        split_form.setHorizontalSpacing(16)
        split_form.setVerticalSpacing(12)
        self.split_input = FilePicker("PDF files (*.pdf)")
        split_form.addRow("Input file", self.split_input)
        split_layout.addLayout(split_form)
        range_help = QLabel("Page groups separated by semicolons; leave blank for one file per page.")
        range_help.setObjectName("helperText")
        range_help.setWordWrap(True)
        split_layout.addWidget(range_help)
        self.ranges = QLineEdit()
        self.ranges.setPlaceholderText("Example: 1-3;4-6;7,9")
        split_layout.addWidget(self.ranges)
        output_form = QFormLayout()
        self.split_output = OutputPicker(str(default_output_dir() / "split_pages"), directory=True)
        output_form.addRow("Output folder", self.split_output)
        split_layout.addLayout(output_form)
        split_button = QPushButton("Split PDF")
        split_button.clicked.connect(self.start_split)
        add_primary_action(split_layout, split_button)
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
