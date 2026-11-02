from __future__ import annotations

from pathlib import Path

from PySide6.QtCore import QUrl, Qt
from PySide6.QtGui import QCloseEvent, QDesktopServices
from PySide6.QtWidgets import (
    QComboBox, QFormLayout, QGroupBox, QHBoxLayout, QLabel, QListWidget,
    QMainWindow, QMessageBox, QPlainTextEdit, QProgressBar, QPushButton,
    QSplitter, QStackedWidget, QVBoxLayout, QWidget,
)

from pdf_toolbox import __version__
from pdf_toolbox.core.capabilities import detect_capabilities
from pdf_toolbox.core.paths import data_dir
from pdf_toolbox.errors import ValidationError
from pdf_toolbox.i18n import tr as _, translate_ui
from pdf_toolbox.models import JobResult
from pdf_toolbox.settings import AppSettings, ENGLISH, SIMPLIFIED_CHINESE
from pdf_toolbox.ui.pages.basic_pages import (
    CompressPage, ImagesPDFPage, MergeSplitPage, OCRPage, PDFImagesPage,
    PDFToWordPage, WordToPDFPage,
)
from pdf_toolbox.ui.pages.organizer_page import PageOrganizerPage
from pdf_toolbox.ui.pages.scan_page import ScanPage
from pdf_toolbox.ui.widgets import OutputPicker
from pdf_toolbox.workers import JobWorker

STYLE = """
QWidget { font-family: 'Segoe UI'; font-size: 14px; color: #202733; }
QMainWindow, QWidget#root { background: #f4f6f9; }
QLabel#pageTitle { font-size: 26px; font-weight: 650; color: #16283f; margin-bottom: 4px; }
QListWidget#navigation { background: #14263d; color: #eaf1f8; border: 0; padding: 10px; font-size: 15px; }
QListWidget#navigation::item { padding: 12px 10px; border-radius: 6px; margin: 2px 0; }
QListWidget#navigation::item:selected { background: #1976d2; color: white; }
QListWidget#navigation::item:hover { background: #234463; }
QLineEdit, QComboBox, QSpinBox, QListWidget, QPlainTextEdit { background: white; border: 1px solid #b9c5d2; border-radius: 5px; padding: 7px; }
QPushButton { background: #e7ecf2; border: 1px solid #b7c4d2; border-radius: 5px; padding: 8px 13px; }
QPushButton:hover { background: #dce6f1; }
QPushButton#primaryButton { background: #1976d2; color: white; border: 0; font-size: 15px; font-weight: 650; padding: 11px 18px; }
QPushButton#primaryButton:hover { background: #1264b3; }
QPushButton:disabled { color: #8c97a5; background: #e2e5e9; }
QGroupBox { background: white; border: 1px solid #ccd4de; border-radius: 7px; margin-top: 11px; padding: 10px; font-weight: 600; }
QGroupBox::title { subcontrol-origin: margin; left: 10px; padding: 0 5px; color: #16283f; }
QProgressBar { border: 1px solid #ccd4de; border-radius: 5px; text-align: center; background: white; }
QProgressBar::chunk { background: #1976d2; }
QTabWidget::pane { border: 1px solid #d2d9e2; }
"""


class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.settings = AppSettings()
        self.caps = detect_capabilities()
        self.worker: JobWorker | None = None
        self.last_outputs: list[Path] = []
        self.tool_pages: list[QWidget] = []
        self.setWindowTitle("PDF Toolbox")
        self.resize(1280, 840)
        root = QWidget()
        root.setObjectName("root")
        root.setStyleSheet(STYLE)
        self.setCentralWidget(root)
        layout = QVBoxLayout(root)
        layout.setContentsMargins(0, 0, 0, 0)
        splitter = QSplitter()
        layout.addWidget(splitter, 1)
        self.navigation = QListWidget()
        self.navigation.setObjectName("navigation")
        self.navigation.setMaximumWidth(220)
        self.navigation.setMinimumWidth(185)
        splitter.addWidget(self.navigation)
        self.stack = QStackedWidget()
        splitter.addWidget(self.stack)
        splitter.setSizes([200, 1080])

        self.tool_pages = [
            ScanPage(self), ImagesPDFPage(self), OCRPage(self),
            PDFToWordPage(self), WordToPDFPage(self), MergeSplitPage(self),
            PageOrganizerPage(self), CompressPage(self), PDFImagesPage(self),
        ]
        pages = [
            ("Photo Scanner", self.tool_pages[0]),
            ("Images to PDF", self.tool_pages[1]),
            ("OCR PDF", self.tool_pages[2]),
            ("PDF to Word", self.tool_pages[3]),
            ("Word to PDF", self.tool_pages[4]),
            ("Merge / Split", self.tool_pages[5]),
            ("Page Organizer", self.tool_pages[6]),
            ("Compress PDF", self.tool_pages[7]),
            ("PDF to Images", self.tool_pages[8]),
            ("Settings & Environment", self._environment_page()),
        ]
        for name, page in pages:
            self.navigation.addItem(name)
            self.stack.addWidget(page)
        self.navigation.currentRowChanged.connect(self.stack.setCurrentIndex)
        self.navigation.setCurrentRow(0)

        job_panel = QWidget()
        job_layout = QVBoxLayout(job_panel)
        job_layout.setContentsMargins(14, 8, 14, 10)
        row = QHBoxLayout()
        self.status = QLabel("Ready — files are processed locally on this computer.")
        row.addWidget(self.status, 1)
        self.open_button = QPushButton("Open output folder")
        self.open_button.clicked.connect(self.open_output)
        self.open_button.setEnabled(False)
        row.addWidget(self.open_button)
        self.log_button = QPushButton("Show log")
        self.log_button.setCheckable(True)
        self.log_button.toggled.connect(self._toggle_log)
        row.addWidget(self.log_button)
        self.cancel_button = QPushButton("Cancel")
        self.cancel_button.clicked.connect(self.cancel_job)
        self.cancel_button.setEnabled(False)
        row.addWidget(self.cancel_button)
        job_layout.addLayout(row)
        self.progress = QProgressBar()
        self.progress.setRange(0, 100)
        self.progress.setValue(0)
        job_layout.addWidget(self.progress)
        self.log = QPlainTextEdit()
        self.log.setReadOnly(True)
        self.log.setMaximumBlockCount(2000)
        self.log.setVisible(False)
        job_layout.addWidget(self.log)
        layout.addWidget(job_panel)
        translate_ui(self)

    def _environment_page(self):
        page = QWidget()
        layout = QVBoxLayout(page)
        title = QLabel("Settings & Environment")
        title.setObjectName("pageTitle")
        layout.addWidget(title)
        version = QLabel(f"PDF Toolbox {__version__}")
        layout.addWidget(version)
        language_text = _("Current interface language: Simplified Chinese") if self.settings.language == SIMPLIFIED_CHINESE else _("Current interface language: English")
        self.current_language_label = QLabel(language_text)
        layout.addWidget(self.current_language_label)

        preferences = QGroupBox("Settings")
        form = QFormLayout(preferences)
        self.default_folder = OutputPicker(
            str(self.settings.output_directory), directory=True, browse_label="Choose folder…"
        )
        form.addRow("Default save folder", self.default_folder)
        self.language = QComboBox()
        self.language.addItem("English", ENGLISH)
        self.language.addItem("Simplified Chinese", SIMPLIFIED_CHINESE)
        self.language.setCurrentIndex(max(0, self.language.findData(self.settings.language)))
        form.addRow("Interface language", self.language)
        explanation = QLabel("Save settings and use this folder for future default outputs. Existing custom paths are preserved.")
        explanation.setWordWrap(True)
        form.addRow(explanation)
        buttons = QHBoxLayout()
        save = QPushButton("Save Settings")
        save.setObjectName("primaryButton")
        save.clicked.connect(self.save_settings)
        buttons.addWidget(save)
        restore = QPushButton("Restore Defaults")
        restore.clicked.connect(self.restore_settings_defaults)
        buttons.addWidget(restore)
        buttons.addStretch()
        form.addRow(buttons)
        layout.addWidget(preferences)

        self.output_summary = QLabel(
            _("Default output folder: {folder}").format(folder=self.settings.output_directory)
        )
        self.output_summary.setTextInteractionFlags(Qt.TextInteractionFlag.TextSelectableByMouse)
        layout.addWidget(self.output_summary)

        engines = QGroupBox("Available local engines")
        engines_layout = QVBoxLayout(engines)
        entries = [
            ("OCRmyPDF", self.caps.ocrmypdf), ("Tesseract", self.caps.tesseract),
            ("Ghostscript", self.caps.ghostscript), ("Microsoft Word", self.caps.word),
            ("Tesseract language data", self.caps.tessdata),
        ]
        for name, path in entries:
            location = str(path) if path else _("Not found")
            label = QLabel(f"<b>{name}</b><br>{location}")
            label.setTextInteractionFlags(Qt.TextInteractionFlag.TextSelectableByMouse)
            engines_layout.addWidget(label)
        engines_layout.addWidget(QLabel(
            _("Installed OCR languages: {languages}").format(languages=", ".join(sorted(self.caps.languages)))
        ))
        layout.addWidget(engines)
        privacy = QLabel("Files are processed locally. No document upload or telemetry is used.")
        privacy.setWordWrap(True)
        layout.addWidget(privacy)
        layout.addStretch()
        return page

    def save_settings(self):
        previous_language = self.settings.language
        language = self.language.currentData()
        try:
            self.settings.save(self.default_folder.edit.text(), language)
        except (ValidationError, OSError) as exc:
            QMessageBox.warning(self, _("Could not save settings"), _(str(exc)))
            return
        folder = self.settings.output_directory
        self.default_folder.set_default_path(folder, force=True)
        for page in self.tool_pages:
            page.set_output_directory(folder)
        self.output_summary.setText(_("Default output folder: {folder}").format(folder=folder))
        if language != previous_language:
            QMessageBox.information(
                self, _("Restart required"),
                _("Restart PDF Toolbox to apply the interface language."),
            )
        else:
            QMessageBox.information(
                self, _("Settings saved"), _("The default save folder has been updated."),
            )

    def restore_settings_defaults(self):
        self.default_folder.set_default_path(data_dir("output"), force=True)
        self.language.setCurrentIndex(self.language.findData(ENGLISH))
        QMessageBox.information(
            self, _("Defaults restored"), _("Defaults loaded. Click Save Settings to apply."),
        )

    def run_task(self, title: str, task):
        if self.worker and self.worker.isRunning():
            QMessageBox.information(self, _("Task in progress"), _("Wait for the current task or cancel it first."))
            return
        self.log.clear()
        self.last_outputs = []
        self.open_button.setEnabled(False)
        self.status.setText(title)
        self.progress.setValue(0)
        self.stack.setEnabled(False)
        self.navigation.setEnabled(False)
        self.cancel_button.setEnabled(True)
        self.cancel_button.setText(_("Cancel"))
        self.worker = JobWorker(task, self)
        self.worker.progressed.connect(self._progress)
        self.worker.logged.connect(self._append_log)
        self.worker.succeeded.connect(self._succeeded)
        self.worker.failed.connect(self._failed)
        self.worker.cancelled.connect(self._cancelled)
        self.worker.finished.connect(self._thread_finished)
        self.worker.start()

    def _progress(self, value, message):
        self.progress.setValue(value)
        self.status.setText(message)

    def _append_log(self, message):
        self.log.appendPlainText(message)

    def _job_done(self):
        self.stack.setEnabled(True)
        self.navigation.setEnabled(True)
        self.cancel_button.setEnabled(False)

    def _succeeded(self, result: JobResult):
        self.last_outputs = result.outputs
        self.status.setText(result.message)
        self.progress.setValue(100)
        self.open_button.setEnabled(bool(result.outputs))
        self._job_done()

    def _failed(self, message):
        self.status.setText(_("Task failed"))
        self._job_done()
        QMessageBox.critical(self, _("Task failed"), message)

    def _cancelled(self):
        self.status.setText(_("Task cancelled — no output was published."))
        self._job_done()

    def _thread_finished(self):
        if self.worker:
            self.worker.deleteLater()
            self.worker = None

    def cancel_job(self):
        if self.worker and self.worker.isRunning():
            self.worker.cancel()
            self.cancel_button.setEnabled(False)
            self.cancel_button.setText(_("Cancelling…"))
            self.status.setText(_("Cancelling; waiting for the current engine call to stop…"))

    def _toggle_log(self, visible):
        self.log.setVisible(visible)
        self.log_button.setText(_("Hide log") if visible else _("Show log"))

    def open_output(self):
        if not self.last_outputs:
            return
        target = self.last_outputs[0]
        folder = target if target.is_dir() else target.parent
        QDesktopServices.openUrl(QUrl.fromLocalFile(str(folder)))

    def closeEvent(self, event: QCloseEvent):
        if self.worker and self.worker.isRunning():
            QMessageBox.information(self, _("Task in progress"), _("Cancel the current task and wait for it to stop before closing PDF Toolbox."))
            event.ignore()
        else:
            event.accept()
