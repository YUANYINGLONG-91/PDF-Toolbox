from __future__ import annotations

from pathlib import Path

import pytest
from PySide6.QtCore import QSettings

from pdf_toolbox.errors import ValidationError
from pdf_toolbox.settings import AppSettings, ENGLISH, SIMPLIFIED_CHINESE


def isolated_settings(tmp_path, monkeypatch):
    fallback = tmp_path / "fallback"
    monkeypatch.setattr("pdf_toolbox.settings.data_dir", lambda name: fallback)
    return QSettings(str(tmp_path / "preferences.ini"), QSettings.Format.IniFormat)


def test_settings_round_trip_and_reset(tmp_path, monkeypatch):
    store = isolated_settings(tmp_path, monkeypatch)
    settings = AppSettings(store)
    assert settings.language == ENGLISH
    assert settings.output_directory == tmp_path / "fallback"

    output = tmp_path / "chosen output"
    settings.save(output, SIMPLIFIED_CHINESE)
    restored = AppSettings(QSettings(str(tmp_path / "preferences.ini"), QSettings.Format.IniFormat))
    assert restored.output_directory == output.resolve()
    assert restored.language == SIMPLIFIED_CHINESE

    restored.restore_defaults()
    assert restored.language == ENGLISH
    assert restored.output_directory == tmp_path / "fallback"
    assert output.is_dir()


def test_invalid_saved_values_fall_back_without_creating_output(tmp_path, monkeypatch):
    store = isolated_settings(tmp_path, monkeypatch)
    store.setValue("interface/language", "unsupported")
    store.setValue("output/defaultFolder", str(tmp_path / "missing"))
    settings = AppSettings(store)
    assert settings.language == ENGLISH
    assert settings.output_directory == tmp_path / "fallback"


def test_settings_reject_empty_folder_and_unknown_language(tmp_path, monkeypatch):
    store = isolated_settings(tmp_path, monkeypatch)
    settings = AppSettings(store)
    with pytest.raises(ValidationError, match="Choose a default"):
        settings.save("", ENGLISH)
    with pytest.raises(ValidationError, match="Unsupported"):
        settings.save(tmp_path, "fr")
