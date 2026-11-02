from __future__ import annotations

import threading
from pathlib import Path

from pdf_toolbox.core.capabilities import subprocess_environment
from pdf_toolbox.core.paths import check_input
from pdf_toolbox.core.pdf_pages import page_count, validate_pdf
from pdf_toolbox.core.process import run_process
from pdf_toolbox.errors import DependencyError
from pdf_toolbox.models import Capabilities, LogCallback, ignore_log

PROFILES = {"high": "/printer", "balanced": "/ebook", "small": "/screen"}


def compress_pdf(
    source: str | Path,
    output: str | Path,
    caps: Capabilities,
    profile: str = "balanced",
    cancel_event: threading.Event | None = None,
    log: LogCallback = ignore_log,
) -> Path:
    if not caps.ghostscript:
        raise DependencyError("Ghostscript is required for PDF compression.")
    source = check_input(source, {".pdf"})
    expected = page_count(source)
    args = [
        caps.ghostscript, "-sDEVICE=pdfwrite", "-dCompatibilityLevel=1.7",
        f"-dPDFSETTINGS={PROFILES.get(profile, '/ebook')}",
        "-dNOPAUSE", "-dQUIET", "-dBATCH", "-dDetectDuplicateImages=true",
        f"-sOutputFile={output}", source,
    ]
    run_process(args, env=subprocess_environment(caps), cancel_event=cancel_event, log=log)
    validate_pdf(output, expected)
    return Path(output)
