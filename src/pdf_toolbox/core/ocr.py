from __future__ import annotations

import threading
from pathlib import Path

from pdf_toolbox.core.capabilities import require_ocr, subprocess_environment
from pdf_toolbox.core.paths import check_input
from pdf_toolbox.core.pdf_pages import page_count, validate_pdf
from pdf_toolbox.core.process import run_process
from pdf_toolbox.models import Capabilities, LogCallback, ignore_log


def ocr_pdf(
    source: str | Path,
    output: str | Path,
    caps: Capabilities,
    *,
    languages: str = "chi_sim+eng",
    rotate_pages: bool = False,
    deskew: bool = False,
    skip_text: bool = True,
    cancel_event: threading.Event | None = None,
    log: LogCallback = ignore_log,
) -> Path:
    require_ocr(caps, languages)
    source = check_input(source)
    expected = page_count(source) if source.suffix.lower() == ".pdf" else None
    args = [
        caps.ocrmypdf, "--language", languages, "--optimize", "0",
        "--output-type", "pdf", "--image-dpi", "300",
    ]
    if skip_text:
        args.append("--skip-text")
    if rotate_pages:
        args.append("--rotate-pages")
    if deskew:
        args.append("--deskew")
    args.extend([source, output])
    run_process(
        args,
        env=subprocess_environment(caps, Path(output).parent),
        cancel_event=cancel_event,
        log=log,
    )
    validate_pdf(output, expected)
    return Path(output)
