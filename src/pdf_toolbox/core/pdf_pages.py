from __future__ import annotations

from pathlib import Path

import pikepdf

from pdf_toolbox.core.paths import check_input, unique_path
from pdf_toolbox.errors import OperationError, ValidationError

PDF_SUFFIXES = {".pdf"}


def open_pdf(path: str | Path) -> pikepdf.Pdf:
    source = check_input(path, PDF_SUFFIXES)
    try:
        return pikepdf.open(source)
    except pikepdf.PasswordError as exc:
        raise OperationError("This PDF is password-protected. Unlock it before processing.") from exc
    except Exception as exc:
        raise OperationError(f"Could not open PDF: {source}\n{exc}") from exc


def page_count(path: str | Path) -> int:
    with open_pdf(path) as pdf:
        return len(pdf.pages)


def validate_pdf(path: str | Path, expected_pages: int | None = None) -> None:
    with open_pdf(path) as pdf:
        count = len(pdf.pages)
        if count < 1:
            raise OperationError("The output PDF has no pages.")
        if expected_pages is not None and count != expected_pages:
            raise OperationError(f"Page count changed unexpectedly: {count} instead of {expected_pages}.")


def parse_page_range(value: str, total_pages: int) -> list[int]:
    pages: list[int] = []
    for part in value.split(","):
        part = part.strip()
        if not part:
            continue
        try:
            if "-" in part:
                start_text, end_text = part.split("-", 1)
                start, end = int(start_text), int(end_text)
                if end < start:
                    raise ValueError
                selected = list(range(start, end + 1))
            else:
                selected = [int(part)]
        except ValueError as exc:
            raise ValidationError(f"Invalid page range: {part}") from exc
        if any(page < 1 or page > total_pages for page in selected):
            raise ValidationError(f"Pages must be between 1 and {total_pages}.")
        pages.extend(page - 1 for page in selected)
    if not pages:
        raise ValidationError("Enter at least one page or range, for example 1-3,5.")
    return pages


def merge_pdfs(inputs: list[str | Path], output: str | Path) -> Path:
    if not inputs:
        raise ValidationError("Add at least one PDF.")
    result = pikepdf.new()
    try:
        for source in inputs:
            with open_pdf(source) as pdf:
                result.pages.extend(pdf.pages)
        if not result.pages:
            raise ValidationError("No pages were found in the input PDFs.")
        result.save(output)
    finally:
        result.close()
    return Path(output)


def split_pdf(source: str | Path, ranges: str, output_directory: str | Path) -> list[Path]:
    directory = Path(output_directory)
    directory.mkdir(parents=True, exist_ok=True)
    outputs: list[Path] = []
    with open_pdf(source) as pdf:
        groups = [group.strip() for group in ranges.split(";") if group.strip()]
        if not groups:
            groups = [str(index + 1) for index in range(len(pdf.pages))]
        for index, group in enumerate(groups, 1):
            selected = parse_page_range(group, len(pdf.pages))
            target = unique_path(directory / f"{Path(source).stem}_part_{index:03d}.pdf")
            with pikepdf.new() as result:
                result.pages.extend([pdf.pages[page] for page in selected])
                result.save(target)
            outputs.append(target)
    return outputs


def organize_pdf(
    source: str | Path,
    output: str | Path,
    order: list[int],
    rotations: dict[int, int] | None = None,
) -> Path:
    rotations = rotations or {}
    with open_pdf(source) as pdf:
        if not order or sorted(order) != list(range(len(pdf.pages))) and not set(order).issubset(set(range(len(pdf.pages)))):
            raise ValidationError("The requested page list is invalid.")
        if len(set(order)) != len(order):
            raise ValidationError("A page cannot be included more than once.")
        with pikepdf.new() as result:
            for new_index, original_index in enumerate(order):
                page = pdf.pages[original_index]
                angle = rotations.get(new_index, 0) % 360
                if angle:
                    page.Rotate = (int(page.get("/Rotate", 0)) + angle) % 360
                result.pages.append(page)
            result.save(output)
    return Path(output)
