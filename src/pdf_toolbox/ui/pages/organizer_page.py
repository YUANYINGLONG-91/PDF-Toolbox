from __future__ import annotations

from pathlib import Path

from PySide6.QtCore import Qt
from PySide6.QtWidgets import (
    QHBoxLayout, QLabel, QListWidget, QListWidgetItem, QMessageBox,
    QPushButton, QVBoxLayout, QWidget,
)

from pdf_toolbox.core.paths import publish_file, staging_path
from pdf_toolbox.core.pdf_pages import organize_pdf, page_count
from pdf_toolbox.i18n import tr as _
from pdf_toolbox.models import JobResult
from pdf_toolbox.settings import default_output_dir
from pdf_toolbox.ui.widgets import FilePicker, OutputPicker

ORIGINAL_PAGE = Qt.ItemDataRole.UserRole
ROTATION = Qt.ItemDataRole.UserRole + 1


class PageOrganizerPage(QWidget):
    def __init__(self, host):
        super().__init__()
        self.host = host
        layout = QVBoxLayout(self)
        title = QLabel("PDF Page Organizer")
        title.setObjectName("pageTitle")
        layout.addWidget(title)
        layout.addWidget(QLabel("Rotate, reorder, delete, or keep selected pages. The source PDF is never modified."))
        row = QHBoxLayout()
        self.input = FilePicker("PDF files (*.pdf)")
        row.addWidget(self.input, 1)
        load = QPushButton("Load pages")
        load.clicked.connect(self.load_pages)
        row.addWidget(load)
        layout.addLayout(row)
        self.pages = QListWidget()
        self.pages.setSelectionMode(QListWidget.SelectionMode.ExtendedSelection)
        layout.addWidget(self.pages, 1)
        controls = QHBoxLayout()
        for text, handler in [
            ("Rotate 90°", self.rotate_selected), ("Move up", lambda: self.move_selected(-1)),
            ("Move down", lambda: self.move_selected(1)), ("Delete selected", self.delete_selected),
            ("Keep only selected", self.keep_selected), ("Reset", self.load_pages),
        ]:
            button = QPushButton(text)
            button.clicked.connect(handler)
            controls.addWidget(button)
        controls.addStretch()
        layout.addLayout(controls)
        self.output = OutputPicker(str(default_output_dir() / "organized.pdf"), file_filter="PDF files (*.pdf)")
        layout.addWidget(self.output)
        save = QPushButton("Save organized PDF")
        save.setObjectName("primaryButton")
        save.clicked.connect(self.start)
        layout.addWidget(save)

    def set_output_directory(self, folder: Path):
        current_name = self.output.path().name
        self.output.set_default_path(folder / (current_name or "organized.pdf"))

    def load_pages(self):
        try:
            count = page_count(self.input.path())
        except Exception as exc:
            QMessageBox.warning(self, _("Could not load PDF"), str(exc))
            return
        self.pages.clear()
        for index in range(count):
            item = QListWidgetItem(_("Page {number}").format(number=index + 1))
            item.setData(ORIGINAL_PAGE, index)
            item.setData(ROTATION, 0)
            self.pages.addItem(item)
        if count:
            self.pages.setCurrentRow(0)
        source = self.input.path()
        self.output.set_default_path(default_output_dir() / f"{source.stem}_organized.pdf")

    def _update_label(self, item):
        original = item.data(ORIGINAL_PAGE) + 1
        rotation = item.data(ROTATION)
        if rotation:
            item.setText(_("Page {number} — rotated {rotation}°").format(number=original, rotation=rotation))
        else:
            item.setText(_("Page {number}").format(number=original))

    def rotate_selected(self):
        for item in self.pages.selectedItems():
            item.setData(ROTATION, (item.data(ROTATION) + 90) % 360)
            self._update_label(item)

    def move_selected(self, direction):
        row = self.pages.currentRow()
        target = row + direction
        if row < 0 or target < 0 or target >= self.pages.count():
            return
        item = self.pages.takeItem(row)
        self.pages.insertItem(target, item)
        self.pages.setCurrentRow(target)

    def delete_selected(self):
        for row in sorted((index.row() for index in self.pages.selectedIndexes()), reverse=True):
            self.pages.takeItem(row)

    def keep_selected(self):
        keep = {index.row() for index in self.pages.selectedIndexes()}
        if not keep:
            QMessageBox.information(self, _("No selection"), _("Select one or more pages to keep."))
            return
        for row in range(self.pages.count() - 1, -1, -1):
            if row not in keep:
                self.pages.takeItem(row)

    def start(self):
        if not self.pages.count():
            QMessageBox.information(self, _("No pages"), _("Load a PDF and keep at least one page."))
            return
        source = self.input.path()
        order = [self.pages.item(row).data(ORIGINAL_PAGE) for row in range(self.pages.count())]
        rotations = {row: self.pages.item(row).data(ROTATION) for row in range(self.pages.count())}
        output = self.output.path()

        def task(progress, log, cancel_event):
            staged = staging_path(output)
            try:
                progress(25, _("Writing organized PDF"))
                organize_pdf(source, staged, order, rotations)
                final = publish_file(staged, output)
                progress(100, _("Completed"))
                return JobResult([final], _("Saved {count} pages").format(count=len(order)))
            finally:
                staged.unlink(missing_ok=True)
        self.host.run_task(_("Organize PDF"), task)
