from __future__ import annotations

from pathlib import Path

from PySide6.QtCore import QSize, QUrl, Qt
from PySide6.QtGui import QCloseEvent, QDesktopServices
from PySide6.QtWidgets import (
    QComboBox, QFormLayout, QFrame, QGridLayout, QGroupBox, QHBoxLayout, QLabel,
    QLineEdit, QListWidget, QListWidgetItem, QMainWindow, QMessageBox, QPlainTextEdit,
    QProgressBar, QPushButton, QScrollArea, QStackedWidget, QStyle, QVBoxLayout, QWidget,
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
from pdf_toolbox.ui.theme import STYLE
from pdf_toolbox.ui.widgets import OutputPicker, add_page_header, create_page_layout
from pdf_toolbox.workers import JobWorker


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
        self.setMinimumSize(1080, 720)
        root = QWidget()
        root.setObjectName("root")
        root.setStyleSheet(STYLE)
        self.setCentralWidget(root)
        layout = QVBoxLayout(root)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)
        body = QHBoxLayout()
        body.setContentsMargins(0, 0, 0, 0)
        body.setSpacing(0)
        layout.addLayout(body, 1)

        sidebar = QFrame()
        sidebar.setObjectName("sidebar")
        sidebar.setFixedWidth(244)
        sidebar_layout = QVBoxLayout(sidebar)
        sidebar_layout.setContentsMargins(18, 20, 18, 18)
        sidebar_layout.setSpacing(12)
        body.addWidget(sidebar)

        brand = QHBoxLayout()
        brand.setSpacing(11)
        mark = QLabel("PDF")
        mark.setObjectName("brandMark")
        mark.setAlignment(Qt.AlignmentFlag.AlignCenter)
        mark.setFixedSize(43, 43)
        brand.addWidget(mark)
        brand_text = QVBoxLayout()
        brand_text.setSpacing(1)
        brand_title = QLabel("PDF Toolbox")
        brand_title.setObjectName("brandTitle")
        brand_text.addWidget(brand_title)
        brand_subtitle = QLabel("LOCAL DOCUMENT TOOLS")
        brand_subtitle.setObjectName("brandSubtitle")
        brand_text.addWidget(brand_subtitle)
        brand.addLayout(brand_text, 1)
        sidebar_layout.addLayout(brand)
        sidebar_layout.addSpacing(20)

        navigation_caption = QLabel("TOOLS")
        navigation_caption.setObjectName("navigationCaption")
        sidebar_layout.addWidget(navigation_caption)
        self.navigation_search = QLineEdit()
        self.navigation_search.setObjectName("navigationSearch")
        self.navigation_search.setPlaceholderText("Find a tool…")
        self.navigation_search.setClearButtonEnabled(True)
        self.navigation_search.textChanged.connect(self._filter_navigation)
        sidebar_layout.addWidget(self.navigation_search)
        sidebar_layout.addSpacing(2)
        self.navigation = QListWidget()
        self.navigation.setObjectName("navigation")
        self.navigation.setIconSize(QSize(19, 19))
        self.navigation.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        self.navigation.setSpacing(1)
        sidebar_layout.addWidget(self.navigation, 1)
        self.navigation_empty = QLabel("No matching tools")
        self.navigation_empty.setObjectName("privacyCaption")
        self.navigation_empty.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.navigation_empty.setVisible(False)
        sidebar_layout.addWidget(self.navigation_empty)

        privacy = QFrame()
        privacy.setObjectName("privacyPanel")
        privacy_layout = QVBoxLayout(privacy)
        privacy_layout.setContentsMargins(12, 11, 12, 11)
        privacy_layout.setSpacing(4)
        privacy_title = QLabel("LOCAL & PRIVATE")
        privacy_title.setObjectName("privacyTitle")
        privacy_layout.addWidget(privacy_title)
        privacy_caption = QLabel("Your documents never leave this computer.")
        privacy_caption.setObjectName("privacyCaption")
        privacy_caption.setWordWrap(True)
        privacy_layout.addWidget(privacy_caption)
        sidebar_layout.addWidget(privacy)

        workspace = QFrame()
        workspace.setObjectName("workspace")
        workspace_layout = QVBoxLayout(workspace)
        workspace_layout.setContentsMargins(0, 0, 0, 0)
        workspace_layout.setSpacing(0)
        body.addWidget(workspace, 1)
        self.stack = QStackedWidget()
        self.stack.setObjectName("toolStack")
        workspace_layout.addWidget(self.stack, 1)

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
            ("Settings", self._environment_page()),
        ]
        icon_names = [
            QStyle.StandardPixmap.SP_DialogOpenButton,
            QStyle.StandardPixmap.SP_FileDialogContentsView,
            QStyle.StandardPixmap.SP_FileDialogDetailedView,
            QStyle.StandardPixmap.SP_ArrowRight,
            QStyle.StandardPixmap.SP_DialogSaveButton,
            QStyle.StandardPixmap.SP_DialogApplyButton,
            QStyle.StandardPixmap.SP_BrowserReload,
            QStyle.StandardPixmap.SP_ArrowDown,
            QStyle.StandardPixmap.SP_DirIcon,
            QStyle.StandardPixmap.SP_FileDialogInfoView,
        ]
        for index, ((name, page), icon_name) in enumerate(zip(pages, icon_names)):
            item = QListWidgetItem(self.style().standardIcon(icon_name), name)
            item.setData(Qt.ItemDataRole.UserRole, index)
            item.setToolTip(name)
            self.navigation.addItem(item)
            self.stack.addWidget(page)
        self.navigation.currentItemChanged.connect(self._show_navigation_page)
        self.navigation.setCurrentRow(0)

        job_panel = QFrame()
        job_panel.setObjectName("jobPanel")
        job_layout = QVBoxLayout(job_panel)
        job_layout.setContentsMargins(18, 11, 18, 13)
        job_layout.setSpacing(9)
        row = QHBoxLayout()
        row.setSpacing(9)
        self.status_dot = QLabel("●")
        self.status_dot.setObjectName("statusDot")
        self.status_dot.setFixedWidth(15)
        row.addWidget(self.status_dot)
        status_text = QVBoxLayout()
        status_text.setSpacing(1)
        activity_caption = QLabel("ACTIVITY")
        activity_caption.setObjectName("activityCaption")
        status_text.addWidget(activity_caption)
        self.status = QLabel("Ready — files are processed locally on this computer.")
        self.status.setWordWrap(True)
        status_text.addWidget(self.status)
        row.addLayout(status_text, 1)
        row.addSpacing(8)
        self.open_button = QPushButton("Open output folder")
        self.open_button.setObjectName("quietButton")
        self.open_button.clicked.connect(self.open_output)
        self.open_button.setEnabled(False)
        row.addWidget(self.open_button)
        self.log_button = QPushButton("Show log")
        self.log_button.setObjectName("quietButton")
        self.log_button.setCheckable(True)
        self.log_button.toggled.connect(self._toggle_log)
        row.addWidget(self.log_button)
        self.cancel_button = QPushButton("Cancel")
        self.cancel_button.setObjectName("dangerButton")
        self.cancel_button.clicked.connect(self.cancel_job)
        self.cancel_button.setEnabled(False)
        row.addWidget(self.cancel_button)
        job_layout.addLayout(row)
        self.progress = QProgressBar()
        self.progress.setRange(0, 100)
        self.progress.setValue(0)
        self.progress.setTextVisible(False)
        job_layout.addWidget(self.progress)
        self.log = QPlainTextEdit()
        self.log.setObjectName("jobLog")
        self.log.setReadOnly(True)
        self.log.setMaximumBlockCount(2000)
        self.log.setMinimumHeight(120)
        self.log.setMaximumHeight(190)
        self.log.setVisible(False)
        job_layout.addWidget(self.log)
        workspace_layout.addSpacing(2)
        workspace_layout.addWidget(job_panel)
        workspace_layout.setContentsMargins(24, 0, 24, 18)
        translate_ui(self)

    def _show_navigation_page(self, current, previous=None):
        if current is not None:
            self.stack.setCurrentIndex(current.data(Qt.ItemDataRole.UserRole))

    def _filter_navigation(self, text):
        query = text.strip().casefold()
        first_visible = None
        for row in range(self.navigation.count()):
            item = self.navigation.item(row)
            visible = not query or query in item.text().casefold()
            item.setHidden(not visible)
            if visible and first_visible is None:
                first_visible = item
        current = self.navigation.currentItem()
        if (current is None or current.isHidden()) and first_visible is not None:
            self.navigation.setCurrentItem(first_visible)
        self.navigation_empty.setVisible(first_visible is None)

    def _set_status_state(self, state: str):
        self.status_dot.setProperty("state", state)
        self.status_dot.style().unpolish(self.status_dot)
        self.status_dot.style().polish(self.status_dot)

    def _environment_page(self):
        page = QWidget()
        layout = create_page_layout(page)
        add_page_header(
            layout,
            "Settings & Environment",
            "Manage default output and language preferences, and review local processing engines.",
        )
        overview = QHBoxLayout()
        version = QLabel(f"PDF Toolbox {__version__}")
        version.setObjectName("versionBadge")
        overview.addWidget(version)
        language_text = _("Current interface language: Simplified Chinese") if self.settings.language == SIMPLIFIED_CHINESE else _("Current interface language: English")
        self.current_language_label = QLabel(language_text)
        self.current_language_label.setObjectName("mutedText")
        overview.addWidget(self.current_language_label)
        overview.addStretch()
        layout.addLayout(overview)

        scroll = QScrollArea()
        scroll.setObjectName("settingsScroll")
        scroll.setWidgetResizable(True)
        scroll.setFrameShape(QFrame.Shape.NoFrame)
        scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        content = QWidget()
        content.setObjectName("settingsContent")
        content_layout = QVBoxLayout(content)
        content_layout.setContentsMargins(0, 4, 5, 4)
        content_layout.setSpacing(12)
        scroll.setWidget(content)
        layout.addWidget(scroll, 1)

        preferences = QGroupBox("Settings")
        form = QFormLayout(preferences)
        form.setHorizontalSpacing(18)
        form.setVerticalSpacing(12)
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
        explanation.setObjectName("helperText")
        explanation.setWordWrap(True)
        form.addRow(explanation)
        buttons = QHBoxLayout()
        buttons.addStretch()
        restore = QPushButton("Restore Defaults")
        restore.clicked.connect(self.restore_settings_defaults)
        buttons.addWidget(restore)
        save = QPushButton("Save Settings")
        save.setObjectName("primaryButton")
        save.clicked.connect(self.save_settings)
        buttons.addWidget(save)
        form.addRow(buttons)
        content_layout.addWidget(preferences)

        self.output_summary = QLabel(
            _("Default output folder: {folder}").format(folder=self.settings.output_directory)
        )
        self.output_summary.setObjectName("helperText")
        self.output_summary.setWordWrap(True)
        self.output_summary.setTextInteractionFlags(Qt.TextInteractionFlag.TextSelectableByMouse)
        content_layout.addWidget(self.output_summary)

        engines = QGroupBox("Available local engines")
        engines_layout = QGridLayout(engines)
        engines_layout.setHorizontalSpacing(12)
        engines_layout.setVerticalSpacing(10)
        entries = [
            ("OCRmyPDF", self.caps.ocrmypdf), ("Tesseract", self.caps.tesseract),
            ("Ghostscript", self.caps.ghostscript), ("Microsoft Word", self.caps.word),
            ("Tesseract language data", self.caps.tessdata),
        ]
        for index, (name, path) in enumerate(entries):
            location = str(path) if path else _("Not found")
            label = QLabel(f"<b>{name}</b><br>{location}")
            label.setObjectName("engineEntry")
            label.setWordWrap(True)
            label.setTextInteractionFlags(Qt.TextInteractionFlag.TextSelectableByMouse)
            engines_layout.addWidget(label, index // 2, index % 2)
        languages = QLabel(
            _("Installed OCR languages: {languages}").format(languages=", ".join(sorted(self.caps.languages)))
        )
        languages.setObjectName("helperText")
        engines_layout.addWidget(languages, 3, 0, 1, 2)
        content_layout.addWidget(engines)
        privacy = QLabel("Files are processed locally. No document upload or telemetry is used.")
        privacy.setObjectName("helperText")
        privacy.setWordWrap(True)
        content_layout.addWidget(privacy)
        content_layout.addStretch()
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
        self._set_status_state("running")
        self.progress.setValue(0)
        self.stack.setEnabled(False)
        self.navigation.setEnabled(False)
        self.navigation_search.setEnabled(False)
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
        self.navigation_search.setEnabled(True)
        self.cancel_button.setEnabled(False)

    def _succeeded(self, result: JobResult):
        self.last_outputs = result.outputs
        self.status.setText(result.message)
        self._set_status_state("success")
        self.progress.setValue(100)
        self.open_button.setEnabled(bool(result.outputs))
        self._job_done()

    def _failed(self, message):
        self.status.setText(_("Task failed"))
        self._set_status_state("error")
        self._job_done()
        QMessageBox.critical(self, _("Task failed"), message)

    def _cancelled(self):
        self.status.setText(_("Task cancelled — no output was published."))
        self._set_status_state("cancelled")
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
