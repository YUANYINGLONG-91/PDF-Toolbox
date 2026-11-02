from __future__ import annotations

import os
import tempfile
import threading
from pathlib import Path
from types import SimpleNamespace

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")

import numpy as np
import pytest
from PySide6.QtCore import QSettings, Qt
from PySide6.QtWidgets import QApplication, QListWidgetItem, QMessageBox

from pdf_toolbox.i18n import initialize_language
from pdf_toolbox.models import Capabilities
from pdf_toolbox.settings import AppSettings, ENGLISH, SIMPLIFIED_CHINESE
from pdf_toolbox.ui.pages.scan_page import SCAN_OBJECT_ROLE, ScanItem, ScanPage
from pdf_toolbox.ui.widgets import OutputPicker


@pytest.fixture(scope="module")
def qapp():
    return QApplication.instance() or QApplication([])


@pytest.fixture(autouse=True)
def isolated_qsettings(tmp_path, monkeypatch):
    class IsolatedSettings:
        Status = QSettings.Status

        def __new__(cls, *args, **kwargs):
            return QSettings(str(tmp_path / "settings.ini"), QSettings.Format.IniFormat)

    monkeypatch.setattr("pdf_toolbox.settings.QSettings", IsolatedSettings)
    yield
    initialize_language(ENGLISH)


@pytest.fixture
def capabilities():
    return Capabilities(None, None, None, None, None, {"chi_sim", "eng"})


def make_host(capabilities):
    return SimpleNamespace(caps=capabilities, task=None, run_task=lambda title, task: None)


def test_output_picker_preserves_custom_path(qapp, tmp_path):
    picker = OutputPicker(str(tmp_path / "first.pdf"))
    picker.set_default_path(tmp_path / "second.pdf")
    assert picker.path() == tmp_path / "second.pdf"

    custom = tmp_path / "custom.pdf"
    picker.edit.setText(str(custom))
    picker.edit.textEdited.emit(str(custom))
    picker.set_default_path(tmp_path / "ignored.pdf")
    assert picker.path() == custom
    picker.set_default_path(tmp_path / "forced.pdf", force=True)
    assert picker.path() == tmp_path / "forced.pdf"
    assert not picker.customized


def test_scan_export_is_below_preview_with_filename_and_folder(qapp, capabilities):
    host = make_host(capabilities)
    page = ScanPage(host)
    page.resize(1100, 850)
    page.show()
    qapp.processEvents()
    export_group = page.export_button.parentWidget()
    assert export_group.parentWidget() is page.result_preview.parentWidget()
    assert export_group.y() > page.result_preview.y()
    assert page.filename.text() == "scanned.pdf"
    assert page.filename.parentWidget() is not page.output_directory
    assert page.output_directory.browse_button.text() == "Choose folder…"
    assert page.export_button.x() > export_group.width() * 0.55
    assert page.sharpness.currentData() == 1.55
    page.close()


def test_scan_worker_uses_captured_sharpness_and_options(qapp, capabilities, tmp_path, monkeypatch):
    host = make_host(capabilities)
    tasks = []
    host.run_task = lambda title, task: tasks.append(task)
    page = ScanPage(host)
    image = np.full((240, 320, 3), 255, dtype=np.uint8)
    image[60:180, 70:250] = 40
    corners = np.array([[20, 20], [300, 20], [300, 220], [20, 220]], dtype=np.float32)
    scan_item = ScanItem(tmp_path / "photo.png", image, image.copy(), corners, True)
    widget = QListWidgetItem("photo.png")
    widget.setData(Qt.ItemDataRole.UserRole, str(scan_item.source))
    widget.setData(SCAN_OBJECT_ROLE, scan_item)
    page.files.list.addItem(widget)
    page.ocr.setChecked(False)
    page.filename.setText("handwriting")
    page.output_directory.set_default_path(tmp_path, force=True)

    calls = []
    monkeypatch.setattr(
        "pdf_toolbox.ui.pages.scan_page.process_document",
        lambda image, corners, mode, deskew, sharpness: calls.append((deskew, sharpness)) or image,
    )
    monkeypatch.setattr(
        "pdf_toolbox.ui.pages.scan_page.images_to_pdf",
        lambda sources, output: Path(output).write_bytes(b"test pdf"),
    )
    monkeypatch.setattr(
        "pdf_toolbox.ui.pages.scan_page.new_workspace",
        lambda: tempfile.TemporaryDirectory(dir=tmp_path),
    )
    page.start_export()
    assert len(tasks) == 1
    page.sharpness.setCurrentIndex(0)
    page.deskew.setChecked(False)
    result = tasks[0](lambda *args: None, lambda *args: None, threading.Event())
    assert calls == [(True, 1.55)]
    assert result.outputs == [tmp_path / "handwriting.pdf"]
    assert result.outputs[0].is_file()
    page.close()


@pytest.mark.parametrize("language, navigation, export", [
    (ENGLISH, "Photo Scanner", "Create PDF from Photos"),
    (SIMPLIFIED_CHINESE, "照片扫描", "从照片创建 PDF"),
])
def test_main_window_language_smoke(qapp, capabilities, tmp_path, monkeypatch, language, navigation, export):
    AppSettings().save(tmp_path / "output", language)
    initialize_language(language)
    monkeypatch.setattr("pdf_toolbox.ui.main_window.detect_capabilities", lambda: capabilities)
    from pdf_toolbox.ui.main_window import MainWindow
    window = MainWindow()
    assert window.navigation.item(0).text() == navigation
    assert window.navigation.item(0).toolTip() == navigation
    assert window.tool_pages[0].export_button.text() == export
    window.close()


def test_navigation_search_selects_matching_tool(qapp, capabilities, tmp_path, monkeypatch):
    AppSettings().save(tmp_path / "output", ENGLISH)
    initialize_language(ENGLISH)
    monkeypatch.setattr("pdf_toolbox.ui.main_window.detect_capabilities", lambda: capabilities)
    from pdf_toolbox.ui.main_window import MainWindow
    window = MainWindow()
    window.navigation_search.setText("compress")
    qapp.processEvents()
    assert window.stack.currentWidget() is window.tool_pages[7]
    assert not window.navigation.item(7).isHidden()
    assert all(window.navigation.item(row).isHidden() for row in range(window.navigation.count()) if row != 7)

    window.navigation_search.setText("not a real tool")
    assert not window.navigation_empty.isHidden()
    window.navigation_search.clear()
    assert window.navigation_empty.isHidden()
    assert all(not window.navigation.item(row).isHidden() for row in range(window.navigation.count()))
    window.close()


def test_saving_settings_updates_defaults_but_not_custom_paths(qapp, capabilities, tmp_path, monkeypatch):
    AppSettings().save(tmp_path / "initial", ENGLISH)
    initialize_language(ENGLISH)
    monkeypatch.setattr("pdf_toolbox.ui.main_window.detect_capabilities", lambda: capabilities)
    from pdf_toolbox.ui.main_window import MainWindow
    window = MainWindow()
    custom = tmp_path / "custom"
    custom.mkdir()
    scanner = window.tool_pages[0]
    scanner.output_directory.edit.setText(str(custom))
    scanner.output_directory.edit.textEdited.emit(str(custom))
    destination = tmp_path / "new default"
    window.default_folder.edit.setText(str(destination))
    window.language.setCurrentIndex(window.language.findData(SIMPLIFIED_CHINESE))
    dialogs = []
    monkeypatch.setattr(QMessageBox, "information", lambda *args: dialogs.append(args))
    window.save_settings()

    assert AppSettings().language == SIMPLIFIED_CHINESE
    assert AppSettings().output_directory == destination.resolve()
    assert scanner.output_directory.path() == custom
    assert window.tool_pages[1].output.path() == destination / "images.pdf"
    assert window.tool_pages[5].merge_output.path() == destination / "merged.pdf"
    assert window.tool_pages[6].output.path() == destination / "organized.pdf"
    assert any(args[1] == "Restart required" for args in dialogs)
    window.close()
