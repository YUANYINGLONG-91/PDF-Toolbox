from __future__ import annotations

import os
import shutil
import sys
import tempfile
import uuid
from pathlib import Path

from pdf_toolbox.errors import OperationError, ValidationError


def application_dir() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parents[3]


def data_dir(name: str) -> Path:
    path = application_dir() / name
    path.mkdir(parents=True, exist_ok=True)
    return path


def unique_path(path: str | Path) -> Path:
    candidate = Path(path)
    if not candidate.exists():
        return candidate
    for number in range(1, 10000):
        alternate = candidate.with_name(
            f"{candidate.stem}_{number:03d}{candidate.suffix}"
        )
        if not alternate.exists():
            return alternate
    raise OperationError(f"Could not allocate a unique output name for {candidate}")


def unique_directory(path: str |Path) -> Path:
    candidate = unique_path(path)
    candidate.mkdir(parents=True, exist_ok=False)
    return candidate


def check_input(path: str | Path, suffixes: set[str] | None = None) -> Path:
    source = Path(path).expanduser().resolve()
    if not source.is_file():
        raise OperationError(f"Input file does not exist: {source}")
    if suffixes and source.suffix.lower() not in suffixes:
        raise OperationError(f"Unsupported file type: {source.suffix}")
    return source


def pdf_output_path(folder: str | Path, filename: str) -> Path:
    """Validate a single user-facing PDF filename and combine it with a folder."""
    name = filename.strip()
    if not name:
        raise ValidationError("Enter a PDF file name.")
    if any(ord(char) < 32 for char in name) or any(char in '<>:"/\\|?*' for char in name):
        raise ValidationError("The file name contains characters that Windows does not allow.")
    if name.endswith("."):
        raise ValidationError("The file name cannot end with a dot.")
    if name.casefold() == ".pdf":
        raise ValidationError("Enter a valid PDF file name.")
    candidate = Path(name)
    if candidate.is_absolute() or candidate.name != name:
        raise ValidationError("Enter a file name only, not a path.")
    if not candidate.suffix:
        candidate = candidate.with_suffix(".pdf")
    elif candidate.suffix.lower() != ".pdf":
        raise ValidationError("The output file name must use the .pdf extension.")
    stem = candidate.stem
    if not stem or stem.rstrip(" .") != stem:
        raise ValidationError("Enter a valid PDF file name.")
    reserved = {"CON", "PRN", "AUX", "NUL"} | {f"COM{number}" for number in range(1, 10)} | {f"LPT{number}" for number in range(1, 10)}
    if stem.upper() in reserved:
        raise ValidationError("This file name is reserved by Windows.")
    directory = Path(folder).expanduser()
    if not directory.is_dir():
        raise ValidationError("Choose an existing output folder.")
    return directory / candidate.name


def prevent_source_overwrite(source: str | Path, output: str | Path) -> None:
    if Path(source).resolve() == Path(output).resolve():
        raise OperationError("The output must be different from the source file.")


def publish_file(staged: str | Path, requested_output: str | Path) -> Path:
    """Publish without replacing an existing file; staged and output share a volume."""
    staged_path = Path(staged)
    requested = Path(requested_output)
    requested.parent.mkdir(parents=True, exist_ok=True)
    for _ in range(10000):
        final = unique_path(requested)
        try:
            os.link(staged_path, final)
            staged_path.unlink()
            return final
        except FileExistsError:
            continue
        except OSError:
            # Fallback for filesystems without hard-link support. O_EXCL prevents overwrite.
            try:
                with staged_path.open("rb") as src, final.open("xb") as dst:
                    shutil.copyfileobj(src, dst, length=1024 * 1024)
                staged_path.unlink()
                return final
            except FileExistsError:
                continue
            except Exception:
                final.unlink(missing_ok=True)
                raise
    raise OperationError(f"Could not publish output: {requested}")


def new_workspace() -> tempfile.TemporaryDirectory:
    return tempfile.TemporaryDirectory(
        prefix=f"job-{uuid.uuid4().hex[:8]}-", dir=data_dir("work")
    )


def staging_path(requested_output: str | Path) -> Path:
    output = Path(requested_output)
    output.parent.mkdir(parents=True, exist_ok=True)
    return output.parent / f".{output.stem}-{uuid.uuid4().hex}.tmp{output.suffix}"
