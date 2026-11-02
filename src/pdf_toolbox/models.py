from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

ProgressCallback = Callable[[int, str], None]
LogCallback = Callable[[str], None]


def ignore_progress(percent: int, message: str) -> None:
    pass


def ignore_log(message: str) -> None:
    pass


@dataclass(slots=True)
class JobResult:
    outputs: list[Path]
    message: str


@dataclass(slots=True)
class Capabilities:
    ocrmypdf: Path | None
    tesseract: Path | None
    ghostscript: Path | None
    tessdata: Path | None
    word: Path | None
    languages: set[str] = field(default_factory=set)

    @property
    def ocr_ready(self) -> bool:
        return all((self.ocrmypdf, self.tesseract, self.tessdata))

    @property
    def word_ready(self) -> bool:
        return self.word is not None
