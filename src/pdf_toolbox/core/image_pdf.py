from __future__ import annotations

import tempfile
from pathlib import Path

import img2pdf
from PIL import Image, ImageOps

from pdf_toolbox.core.paths import check_input
from pdf_toolbox.errors import ValidationError

IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".tif", ".tiff", ".bmp", ".webp"}


def _directly_usable(path: Path) -> bool:
    if path.suffix.lower() in {".jpg", ".jpeg"}:
        return True
    if path.suffix.lower() == ".png":
        with Image.open(path) as image:
            return image.mode not in {"RGBA", "LA", "P"} and "transparency" not in image.info
    return False


def images_to_pdf(images: list[str | Path], output: str | Path) -> Path:
    if not images:
        raise ValidationError("Add at least one image.")
    sources = [check_input(path, IMAGE_SUFFIXES) for path in images]
    destination = Path(output)
    with tempfile.TemporaryDirectory(prefix="pdf-toolbox-images-") as temporary:
        usable: list[str] = []
        for index, source in enumerate(sources):
            if _directly_usable(source):
                usable.append(str(source))
                continue
            with Image.open(source) as opened:
                image = ImageOps.exif_transpose(opened)
                if image.mode in {"RGBA", "LA"} or "transparency" in image.info:
                    rgba = image.convert("RGBA")
                    background = Image.new("RGB", rgba.size, "white")
                    background.paste(rgba, mask=rgba.getchannel("A"))
                    image = background
                else:
                    image = image.convert("RGB")
                normalized = Path(temporary) / f"image-{index:05d}.png"
                image.save(normalized, dpi=(300, 300))
                usable.append(str(normalized))
        with destination.open("wb") as stream:
            stream.write(img2pdf.convert(usable))
    return destination
