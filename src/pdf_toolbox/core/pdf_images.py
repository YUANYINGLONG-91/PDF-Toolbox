from __future__ import annotations

from pathlib import Path

import pymupdf

from pdf_toolbox.core.paths import check_input, unique_directory
from pdf_toolbox.errors import OperationError


def pdf_to_images(
    source: str | Path,
    output_directory: str | Path,
    image_format: str = "png",
    dpi: int = 150,
) -> list[Path]:
    source = check_input(source, {".pdf"})
    if image_format not in {"png", "jpg"}:
        raise OperationError("Image format must be PNG or JPG.")
    if not 72 <= dpi <= 600:
        raise OperationError("DPI must be between 72 and 600.")
    directory = unique_directory(output_directory)
    outputs: list[Path] = []
    try:
        document = pymupdf.open(source)
        if document.needs_pass:
            raise OperationError("This PDF is password-protected.")
        matrix = pymupdf.Matrix(dpi / 72, dpi / 72)
        for index, page in enumerate(document, 1):
            pixmap = page.get_pixmap(matrix=matrix, alpha=False)
            target = directory / f"{source.stem}_page_{index:04d}.{image_format}"
            pixmap.save(target, jpg_quality=92)
            outputs.append(target)
        document.close()
    except Exception:
        for output in outputs:
            output.unlink(missing_ok=True)
        if directory.exists() and not any(directory.iterdir()):
            directory.rmdir()
        raise
    return outputs
