from __future__ import annotations

import os
import shutil
from pathlib import Path

from pdf_toolbox.errors import DependencyError
from pdf_toolbox.models import Capabilities


def _existing(candidates: list[Path | None]) -> Path | None:
    for candidate in candidates:
        if candidate and candidate.is_file():
            return candidate.resolve()
    return None


def detect_capabilities() -> Capabilities:
    home = Path.home()
    ocrmypdf = _existing([
        home / ".local" / "bin" / "ocrmypdf.exe",
        Path(shutil.which("ocrmypdf")) if shutil.which("ocrmypdf") else None,
    ])
    tesseract = _existing([
        Path(r"C:\Program Files\Tesseract-OCR\tesseract.exe"),
        Path(shutil.which("tesseract")) if shutil.which("tesseract") else None,
    ])
    gs_candidates: list[Path | None] = []
    gs_root = Path(r"C:\Program Files\gs")
    if gs_root.is_dir():
        gs_candidates.extend(sorted(gs_root.glob("gs*/bin/gswin64c.exe"), reverse=True))
    gs_candidates.append(Path(shutil.which("gswin64c")) if shutil.which("gswin64c") else None)
    ghostscript = _existing(gs_candidates)
    word = _existing([
        Path(r"C:\Program Files\Microsoft Office\root\Office16\WINWORD.EXE"),
        Path(r"C:\Program Files (x86)\Microsoft Office\root\Office16\WINWORD.EXE"),
    ])

    tess_candidates = [
        home / "AppData" / "Local" / "Tesseract-OCR" / "tessdata",
        Path(r"C:\Program Files\Tesseract-OCR\tessdata"),
    ]
    tessdata = next((p for p in tess_candidates if p.is_dir()), None)
    languages: set[str] = set()
    if tessdata:
        languages = {p.stem for p in tessdata.glob("*.traineddata")}
        # Prefer a directory that contains both default OCR languages.
        for candidate in tess_candidates:
            if candidate.is_dir():
                found = {p.stem for p in candidate.glob("*.traineddata")}
                if {"chi_sim", "eng"}.issubset(found):
                    tessdata, languages = candidate, found
                    break
    return Capabilities(ocrmypdf, tesseract, ghostscript, tessdata, word, languages)


def require_ocr(caps: Capabilities, languages: str = "chi_sim+eng") -> None:
    missing = []
    if not caps.ocrmypdf:
        missing.append("OCRmyPDF")
    if not caps.tesseract:
        missing.append("Tesseract")
    if not caps.tessdata:
        missing.append("Tesseract language data")
    if missing:
        raise DependencyError("Missing OCR components: " + ", ".join(missing))
    requested = set(languages.split("+"))
    unavailable = requested - caps.languages
    if unavailable:
        raise DependencyError("Missing OCR languages: " + ", ".join(sorted(unavailable)))


def subprocess_environment(caps: Capabilities, work_dir: Path | None = None) -> dict[str, str]:
    env = os.environ.copy()
    prefixes = []
    if caps.tesseract:
        prefixes.append(str(caps.tesseract.parent))
    if caps.ghostscript:
        prefixes.append(str(caps.ghostscript.parent))
    if prefixes:
        env["PATH"] = os.pathsep.join(prefixes + [env.get("PATH", "")])
    if caps.tessdata:
        env["TESSDATA_PREFIX"] = str(caps.tessdata)
    if work_dir:
        env["TEMP"] = env["TMP"] = str(work_dir)
    return env
