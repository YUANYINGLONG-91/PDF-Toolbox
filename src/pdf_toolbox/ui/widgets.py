from __future__ import annotations

from pathlib import Path

from PySide6.QtCore import QSize, Qt, Signal
from PySide6.QtGui import QIcon
from PySide6.QtWidgets import (
    QAbstractItemView, QFileDialog, QGridLayout, QHBoxLayout, QLabel, QLineEdit, QListWidget,
    QListWidgetItem, QPushButton, QVBoxLayout, QWidget,
)

from pdf_toolbox.core.image_pdf import IMAGE_SUFFIXES
from pdf_toolbox.i18n import tr as _


def create_page_layout(page: QWidget) -> QVBoxLayout:
    """Create the common content rhythm used by every tool page."""
    layout = QVBoxLayout(page)
    layout.setContentsMargins(28, 24, 28, 24)
    layout.setSpacing(12)
    return layout


def add_page_header(layout: QVBoxLayout, title: str, description: str) -> QLabel:
    heading = QLabel(title)
    heading.setObjectName("pageTitle")
    layout.addWidget(heading)
    detail = QLabel(description)
    detail.setObjectName("pageDescription")
    detail.setWordWrap(True)
    layout.addWidget(detail)
    layout.addSpacing(8)
    return heading


def add_primary_action(layout: QVBoxLayout, button: QPushButton) -> None:
    """Place a page's main action consistently at the lower right of its card."""
    button.setObjectName("primaryButton")
    button.setMinimumHeight(42)
    button.setMinimumWidth(150)
    row = QHBoxLayout()
    row.addStretch()
    row.addWidget(button)
    layout.addLayout(row)


class FileDropList(QListWidget):
    pathsDropped = Signal(list)

    def __init__(self):
        super().__init__()
        self.setObjectName("fileList")
        self.setAcceptDrops(True)
        self.setSelectionMode(QAbstractItemView.SelectionMode.ExtendedSelection)
        self.setIconSize(QSize(40, 40))
        self.setSpacing(3)
        self.setMinimumHeight(150)
        self.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)

    def dragEnterEvent(self, event):
        if event.mimeData().hasUrls():
            event.acceptProposedAction()
        else:
            super().dragEnterEvent(event)

    def dragMoveEvent(self, event):
        if event.mimeData().hasUrls():
            event.acceptProposedAction()
        else:
            super().dragMoveEvent(event)

    def dropEvent(self, event):
        if event.mimeData().hasUrls():
            paths = [url.toLocalFile() for url in event.mimeData().urls() if url.isLocalFile()]
            self.pathsDropped.emit(paths)
            event.acceptProposedAction()
        else:
            super().dropEvent(event)


class FileListPanel(QWidget):
    pathsAdded = Signal(list)

    def __init__(self, title: str, file_filter: str, suffixes: set[str]):
        super().__init__()
        self.file_filter = file_filter
        self.suffixes = {suffix.lower() for suffix in suffixes}
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(10)
        title_label = QLabel(title)
        title_label.setObjectName("sectionTitle")
        title_label.setWordWrap(True)
        layout.addWidget(title_label)
        self.list = FileDropList()
        self.list.pathsDropped.connect(self.add_paths)
        layout.addWidget(self.list, 1)
        buttons = QGridLayout()
        buttons.setHorizontalSpacing(8)
        buttons.setVerticalSpacing(8)
        controls = [
            ("Add files", self.browse), ("Remove", self.remove_selected),
            ("Clear", self.clear), ("Move up", lambda: self.move_selected(-1)),
            ("Move down", lambda: self.move_selected(1)),
        ]
        for index, (text, handler) in enumerate(controls):
            button = QPushButton(text)
            button.clicked.connect(handler)
            buttons.addWidget(button, index // 3, index % 3)
        layout.addLayout(buttons)

    def browse(self):
        paths, _ = QFileDialog.getOpenFileNames(self, _("Select files"), "", _(self.file_filter))
        self.add_paths(paths)

    def add_paths(self, paths):
        existing = {str(path).casefold() for path in self.paths()}
        added = []
        for raw in paths:
            path = Path(raw)
            if path.suffix.lower() not in self.suffixes or str(path).casefold() in existing:
                continue
            item = QListWidgetItem(path.name)
            item.setData(Qt.ItemDataRole.UserRole, str(path))
            item.setToolTip(str(path))
            if path.suffix.lower() in IMAGE_SUFFIXES:
                item.setIcon(QIcon(str(path)))
            self.list.addItem(item)
            existing.add(str(path).casefold())
            added.append(str(path))
        if self.list.currentRow() < 0 and self.list.count():
            self.list.setCurrentRow(0)
        if added:
            self.pathsAdded.emit(added)

    def paths(self) -> list[Path]:
        return [Path(self.list.item(row).data(Qt.ItemDataRole.UserRole)) for row in range(self.list.count())]

    def selected_rows(self) -> list[int]:
        return sorted((index.row() for index in self.list.selectedIndexes()), reverse=True)

    def remove_selected(self):
        for row in self.selected_rows():
            self.list.takeItem(row)

    def move_selected(self, direction: int):
        row = self.list.currentRow()
        target = row + direction
        if row < 0 or target < 0 or target >= self.list.count():
            return
        item = self.list.takeItem(row)
        self.list.insertItem(target, item)
        self.list.setCurrentRow(target)

    def clear(self):
        self.list.clear()


class FilePicker(QWidget):
    pathSelected = Signal(str)

    def __init__(self, file_filter: str):
        super().__init__()
        self.file_filter = file_filter
        layout = QHBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(8)
        self.edit = QLineEdit()
        self.edit.setPlaceholderText("Select a file…")
        browse = QPushButton("Browse…")
        browse.clicked.connect(self.choose)
        self.edit.textChanged.connect(self.pathSelected)
        layout.addWidget(self.edit, 1)
        layout.addWidget(browse)

    def choose(self):
        path, _ = QFileDialog.getOpenFileName(self, _("Select input file"), self.edit.text(), _(self.file_filter))
        if path:
            self.edit.setText(path)

    def path(self) -> Path:
        return Path(self.edit.text()).expanduser()


class OutputPicker(QWidget):
    def __init__(self, default_path: str, *, directory: bool = False, file_filter: str = "", browse_label: str = "Browse…"):
        super().__init__()
        self.directory = directory
        self.file_filter = file_filter
        self.customized = False
        layout = QHBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(8)
        self.edit = QLineEdit(default_path)
        self.edit.textEdited.connect(self._edited)
        self.browse_button = QPushButton(browse_label)
        self.browse_button.clicked.connect(self.choose)
        layout.addWidget(self.edit, 1)
        layout.addWidget(self.browse_button)

    def _edited(self):
        self.customized = True

    def set_default_path(self, path: str | Path, *, force: bool = False):
        """Update an automatic default without replacing a user's custom path."""
        if force or not self.customized:
            self.edit.setText(str(path))
            self.customized = False

    def choose(self):
        if self.directory:
            path = QFileDialog.getExistingDirectory(self, _("Select output folder"), self.edit.text())
        else:
            path, _ = QFileDialog.getSaveFileName(self, _("Select output file"), self.edit.text(), _(self.file_filter))
        if path:
            self.edit.setText(path)
            self.customized = True

    def path(self) -> Path:
        return Path(self.edit.text()).expanduser()
