from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np
from PySide6.QtCore import Qt, QTimer
from PySide6.QtGui import QImage, QPixmap
from PySide6.QtWidgets import (
    QCheckBox, QComboBox, QFormLayout, QGroupBox, QHBoxLayout, QLabel, QLineEdit,
    QMessageBox, QPushButton, QSplitter, QVBoxLayout, QWidget,
)

from pdf_toolbox.core.image_pdf import IMAGE_SUFFIXES, images_to_pdf
from pdf_toolbox.core.ocr import ocr_pdf
from pdf_toolbox.core.paths import (
    new_workspace, pdf_output_path, publish_file, staging_path,
)
from pdf_toolbox.core.scan import (
    detect_corners, load_bgr, preview, process_document, rotate90, save_bgr,
)
from pdf_toolbox.errors import CancelledError, ValidationError
from pdf_toolbox.i18n import tr as _
from pdf_toolbox.models import JobResult
from pdf_toolbox.settings import default_output_dir
from pdf_toolbox.ui.scan_canvas import ScanCanvas
from pdf_toolbox.ui.widgets import FileListPanel, OutputPicker

SCAN_OBJECT_ROLE = Qt.ItemDataRole.UserRole + 1


def pixmap_from_array(image: np.ndarray) -> QPixmap:
    if image.ndim == 2:
        qimage = QImage(image.data, image.shape[1], image.shape[0], image.strides[0], QImage.Format.Format_Grayscale8)
    else:
        rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        qimage = QImage(rgb.data, rgb.shape[1], rgb.shape[0], rgb.strides[0], QImage.Format.Format_RGB888)
    return QPixmap.fromImage(qimage.copy())


@dataclass
class ScanItem:
    source: Path
    full: np.ndarray
    small: np.ndarray
    corners: np.ndarray
    detected: bool
    mode: str = "color"

    @property
    def scale(self) -> float:
        return self.small.shape[1] / self.full.shape[1]


class ScanPage(QWidget):
    def __init__(self, host):
        super().__init__()
        self.host = host
        self.loading = False
        root = QVBoxLayout(self)
        root.setContentsMargins(18, 16, 18, 14)
        root.setSpacing(10)
        title = QLabel(_("Document Photo Scanner"))
        title.setObjectName("pageTitle")
        root.addWidget(title)
        instructions = QLabel(_("Add and arrange photos on the left. Correct and preview on the right. Export below the preview."))
        instructions.setWordWrap(True)
        root.addWidget(instructions)
        splitter = QSplitter()
        root.addWidget(splitter, 1)

        left_panel = QWidget()
        left_layout = QVBoxLayout(left_panel)
        left_layout.setContentsMargins(0, 0, 8, 0)
        self.files = FileListPanel(_("1. Add and arrange photos (or drag them here)"), "Images (*.jpg *.jpeg *.png *.tif *.tiff *.bmp *.webp)", IMAGE_SUFFIXES)
        self.files.pathsAdded.connect(self._add_documents)
        self.files.list.currentRowChanged.connect(self._show_current)
        left_layout.addWidget(self.files, 1)
        left_panel.setMinimumWidth(310)
        left_panel.setMaximumWidth(410)
        splitter.addWidget(left_panel)

        editor = QGroupBox(_("Correct and preview the selected page"))
        editor_layout = QVBoxLayout(editor)
        self.canvas = ScanCanvas()
        self.canvas.setMinimumSize(320, 260)
        self.canvas.cornersChanged.connect(self._corners_changed)
        editor_layout.addWidget(self.canvas, 3)
        controls = QHBoxLayout()
        for text, handler in [("Rotate left", lambda: self.rotate(False)), ("Rotate right", lambda: self.rotate(True)), ("Detect edges", self.redetect)]:
            button = QPushButton(_(text))
            button.clicked.connect(handler)
            controls.addWidget(button)
        controls.addWidget(QLabel(_("Enhancement")))
        self.mode = QComboBox()
        for label, value in [("Enhanced color", "color"), ("Original color", "original"), ("Grayscale", "grayscale"), ("Black & white", "bw")]:
            self.mode.addItem(_(label), value)
        self.mode.setToolTip(_("Enhanced color flattens shadows, whitens paper, preserves color, and sharpens handwriting."))
        self.mode.currentIndexChanged.connect(self._mode_changed)
        controls.addWidget(self.mode)
        editor_layout.addLayout(controls)

        correction_options = QHBoxLayout()
        self.deskew = QCheckBox(_("Automatically straighten text after perspective correction"))
        self.deskew.setChecked(True)
        self.deskew.toggled.connect(lambda: self.preview_timer.start())
        correction_options.addWidget(self.deskew)
        correction_options.addStretch()
        correction_options.addWidget(QLabel(_("Text sharpness")))
        self.sharpness = QComboBox()
        self.sharpness.addItem(_("Standard"), 1.0)
        self.sharpness.addItem(_("Strong (handwriting)"), 1.55)
        self.sharpness.setCurrentIndex(1)
        self.sharpness.setToolTip(_("Strong enhances faint handwriting and stroke edges. Standard is gentler for photos and illustrations."))
        self.sharpness.currentIndexChanged.connect(lambda: self.preview_timer.start())
        correction_options.addWidget(self.sharpness)
        editor_layout.addLayout(correction_options)
        self.status = QLabel(_("Drag the four corner handles to match the document edges."))
        self.status.setWordWrap(True)
        editor_layout.addWidget(self.status)
        self.result_preview = QLabel(_("Corrected preview"))
        self.result_preview.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.result_preview.setMinimumHeight(140)
        self.result_preview.setStyleSheet("background: #262a30; color: #ddd; border: 1px solid #454c55;")
        editor_layout.addWidget(self.result_preview, 2)

        export_group = QGroupBox(_("Export PDF"))
        export_layout = QVBoxLayout(export_group)
        export_layout.setSpacing(7)
        self.ocr = QCheckBox(_("Searchable PDF (Chinese + English OCR)"))
        self.ocr.setChecked(True)
        export_layout.addWidget(self.ocr)
        form = QFormLayout()
        form.setHorizontalSpacing(10)
        form.setVerticalSpacing(7)
        self.filename = QLineEdit("scanned.pdf")
        self.filename.setPlaceholderText(_("Enter a PDF file name"))
        form.addRow(_("File name"), self.filename)
        self.output_directory = OutputPicker(str(default_output_dir()), directory=True, browse_label=_("Choose folder…"))
        form.addRow(_("Save to"), self.output_directory)
        export_layout.addLayout(form)
        button_row = QHBoxLayout()
        button_row.addStretch()
        self.export_button = QPushButton(_("Create PDF from Photos"))
        self.export_button.setObjectName("primaryButton")
        self.export_button.setMinimumHeight(42)
        self.export_button.clicked.connect(self.start_export)
        button_row.addWidget(self.export_button)
        export_layout.addLayout(button_row)
        editor_layout.addWidget(export_group)

        splitter.addWidget(editor)
        splitter.setSizes([350, 850])
        splitter.setStretchFactor(0, 0)
        splitter.setStretchFactor(1, 1)

        self.preview_timer = QTimer(self)
        self.preview_timer.setSingleShot(True)
        self.preview_timer.setInterval(120)
        self.preview_timer.timeout.connect(self._update_preview)

    def set_output_directory(self, folder: Path):
        self.output_directory.set_default_path(folder)

    def _add_documents(self, paths):
        for raw in paths:
            source = Path(raw)
            try:
                full = load_bgr(source)
                small = preview(full)
                corners, detected = detect_corners(full)
                item = ScanItem(source, full, small, corners, detected)
            except Exception as exc:
                QMessageBox.warning(self, _("Image could not be opened"), str(exc))
                continue
            for row in range(self.files.list.count()):
                widget = self.files.list.item(row)
                if widget.data(Qt.ItemDataRole.UserRole) == str(source):
                    widget.setData(SCAN_OBJECT_ROLE, item)
                    break
        self._show_current(self.files.list.currentRow())

    def current_item(self) -> ScanItem | None:
        widget = self.files.list.currentItem()
        return widget.data(SCAN_OBJECT_ROLE) if widget else None

    def _show_current(self, row):
        item = self.current_item()
        if not item:
            self.canvas.clear_document()
            self.result_preview.clear()
            self.result_preview.setText(_("Corrected preview"))
            self.status.setText(_("Add a photo on the left, then adjust its edges here."))
            return
        self.loading = True
        self.canvas.set_document(pixmap_from_array(item.small), item.corners * item.scale)
        self.mode.setCurrentIndex(max(0, self.mode.findData(item.mode)))
        self.status.setText(_("Edges detected. Drag handles if adjustment is needed.") if item.detected else _("Automatic edges were uncertain. Adjust the four handles manually."))
        self.loading = False
        self._update_preview()

    def _corners_changed(self, corners):
        item = self.current_item()
        if not item or self.loading:
            return
        item.corners = np.asarray(corners) / item.scale
        self.preview_timer.start()

    def _mode_changed(self):
        item = self.current_item()
        if item and not self.loading:
            item.mode = self.mode.currentData()
            self.preview_timer.start()

    def _update_preview(self):
        item = self.current_item()
        if not item:
            self.result_preview.setText(_("Corrected preview"))
            return
        try:
            result = process_document(item.small, item.corners * item.scale, item.mode, self.deskew.isChecked(), self.sharpness.currentData())
            pixmap = pixmap_from_array(result)
            self.result_preview.setPixmap(pixmap.scaled(self.result_preview.size(), Qt.AspectRatioMode.KeepAspectRatio, Qt.TransformationMode.SmoothTransformation))
        except Exception as exc:
            self.result_preview.setText(str(exc))

    def rotate(self, clockwise: bool):
        item = self.current_item()
        if not item:
            return
        item.full = rotate90(item.full, clockwise)
        item.small = rotate90(item.small, clockwise)
        item.corners, item.detected = detect_corners(item.full)
        self._show_current(self.files.list.currentRow())

    def redetect(self):
        item = self.current_item()
        if item:
            item.corners, item.detected = detect_corners(item.full)
            self._show_current(self.files.list.currentRow())

    def start_export(self):
        items = [self.files.list.item(row).data(SCAN_OBJECT_ROLE) for row in range(self.files.list.count())]
        items = [item for item in items if item]
        if not items:
            QMessageBox.information(self, _("No photos"), _("Add at least one document photo."))
            return
        try:
            output = pdf_output_path(self.output_directory.path(), self.filename.text())
        except ValidationError as exc:
            QMessageBox.warning(self, _("Invalid output"), _(str(exc)))
            return
        use_ocr = self.ocr.isChecked()
        auto_straighten = self.deskew.isChecked()
        sharpness = float(self.sharpness.currentData())
        caps = self.host.caps
        pages = [(item.full, item.corners.copy(), item.mode) for item in items]

        def task(progress, log, cancel_event):
            staged = staging_path(output)
            with new_workspace() as workspace:
                normalized: list[Path] = []
                for index, (image, corners, mode) in enumerate(pages, 1):
                    if cancel_event.is_set():
                        raise CancelledError("Operation cancelled.")
                    progress(round((index - 1) / len(pages) * 65), _("Processing photo {index} of {total}").format(index=index, total=len(pages)))
                    processed = process_document(image, corners, mode, auto_straighten, sharpness)
                    image_path = Path(workspace) / f"page-{index:05d}.jpg"
                    save_bgr(image_path, processed)
                    normalized.append(image_path)
                progress(68, _("Building PDF"))
                images_to_pdf(normalized, staged)
                if use_ocr:
                    ocr_staged = staging_path(output)
                    progress(72, _("Recognizing Chinese and English text"))
                    ocr_pdf(staged, ocr_staged, caps, cancel_event=cancel_event, log=log)
                    staged.unlink(missing_ok=True)
                    staged = ocr_staged
                if cancel_event.is_set():
                    staged.unlink(missing_ok=True)
                    raise CancelledError("Operation cancelled.")
                final = publish_file(staged, output)
                progress(100, _("Completed"))
                return JobResult([final], _("Created {count}-page PDF").format(count=len(pages)))
        self.host.run_task(_("Create scanned PDF"), task)
