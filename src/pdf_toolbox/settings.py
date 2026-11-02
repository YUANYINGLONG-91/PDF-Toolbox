from __future__ import annotations

from pathlib import Path

from PySide6.QtCore import QSettings

from pdf_toolbox.core.paths import data_dir
from pdf_toolbox.errors import ValidationError

ENGLISH = "en"
SIMPLIFIED_CHINESE = "zh_CN"
LANGUAGES = {ENGLISH, SIMPLIFIED_CHINESE}


class AppSettings:
    """Persistent application preferences; tests may supply an isolated QSettings."""

    def __init__(self, store: QSettings | None = None):
        self.store = store if store is not None else QSettings("LocalPDF", "PDF Toolbox")

    @property
    def language(self) -> str:
        value = str(self.store.value("interface/language", ENGLISH))
        return value if value in LANGUAGES else ENGLISH

    @property
    def output_directory(self) -> Path:
        fallback = data_dir("output")
        raw = str(self.store.value("output/defaultFolder", "")).strip()
        if not raw:
            return fallback
        path = Path(raw).expanduser()
        if not path.is_absolute() or not path.is_dir():
            return fallback
        return path

    def save(self, output_directory: str | Path, language: str) -> None:
        if language not in LANGUAGES:
            raise ValidationError("Unsupported interface language.")
        raw = str(output_directory).strip()
        if not raw:
            raise ValidationError("Choose a default save folder.")
        folder = Path(raw).expanduser().resolve()
        try:
            folder.mkdir(parents=True, exist_ok=True)
        except OSError as exc:
            raise ValidationError(f"The selected folder cannot be created: {exc}") from exc
        if not folder.is_dir():
            raise ValidationError("The default save location must be a folder.")
        self.store.setValue("output/defaultFolder", str(folder))
        self.store.setValue("interface/language", language)
        self.store.sync()
        if self.store.status() != QSettings.Status.NoError:
            raise ValidationError("Settings could not be saved on this computer.")

    def restore_defaults(self) -> None:
        self.store.remove("output/defaultFolder")
        self.store.remove("interface/language")
        self.store.sync()


def default_output_dir() -> Path:
    return AppSettings().output_directory
