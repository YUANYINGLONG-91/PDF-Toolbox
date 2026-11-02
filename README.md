# PDF Toolbox

PDF Toolbox is a local Windows desktop application for document photo cleanup, OCR, document conversion, and common PDF tasks. The interface supports English and Simplified Chinese.

## Features

- **Photo Scanner:** import document photos, detect boundaries with edge/illumination analysis, drag corner handles, correct perspective, rotate, automatically straighten text, remove shadows, whiten paper, sharpen print and handwriting, reorder pages, and export PDF. Color, grayscale, black-and-white, and original-color modes are available. **Strong (handwriting)** sharpening is selected by default; **Standard** is gentler for photos and illustrations.
- **Images to PDF:** combine multiple JPG, PNG, TIFF, BMP, or WebP images in a selected order.
- **OCR PDF:** add searchable Simplified Chinese and/or English text with OCRmyPDF and Tesseract.
- **PDF to Word:** create editable DOCX files using Microsoft Word PDF Reflow, with OCR for scanned PDFs and alternative local conversion routes.
- **Word to PDF:** convert DOC/DOCX using the installed Microsoft Word.
- **Merge / Split:** merge ordered PDFs or split custom page groups.
- **Page Organizer:** rotate, reorder, delete, or keep selected pages.
- **Compress PDF:** choose high-quality, balanced, or small-size Ghostscript profiles.
- **PDF to Images:** render pages as PNG or JPG at a selectable DPI.

All document processing is local. There is no telemetry or document upload code.

## Use the application

After building, double-click the **PDF Toolbox** shortcut on the desktop, or open `release/PDF Toolbox/PDF Toolbox.exe`. No Python command is required. The shortcut targets the executable inside this project folder, so keep that folder in place.

The scanner's **Export PDF** area is below the corrected preview. Enter a separate **File name**, choose a folder in **Save to**, and use **Create PDF from Photos** in the lower-right. The output name automatically receives a `.pdf` extension when omitted.

The default output folder is `output` beside the project or executable. Open **Settings & Environment** to choose a persistent default save folder or switch between English and Simplified Chinese. Folder changes immediately update output paths that have not been customized; restart the application to apply a language change throughout the interface. **Restore Defaults** fills in the standard folder and English, and **Save Settings** applies them.

Existing files are never overwritten; numeric suffixes are added automatically. During a task, use **Cancel** and **Show log** in the bottom panel. **Open output folder** opens the completed result location.

## Conversion limitations

PDF and Word use different document models. Complex tables, multiple columns, formulas, unusual fonts, and scanned pages may not retain their original appearance in DOCX. Scanned conversion prioritizes editable text and can require manual review. Automatic document-edge detection can also require manual corner adjustment.

## Desktop engine requirements

The current Windows build detects and uses the following installed engines:

- OCRmyPDF 17.13.0
- Tesseract 5.4.0 with `chi_sim` and `eng` language data
- Ghostscript 10.08.0
- Microsoft Word 2021 with Word COM automation

The application sets the OCR subprocess environment explicitly, including the user-level Tesseract language-data directory.

## Development

```powershell
.venv\Scripts\python.exe -m pytest
powershell -File scripts\build.ps1
powershell -File scripts\create_shortcut.ps1
```

The project uses a private Python 3.12 environment. Core processing is independent of Qt; background jobs provide progress, cancellation, and logs.

## Responsive web edition

The `web/` directory contains the responsive browser edition for desktop and mobile. It supports multi-image/album import, touch-friendly page ordering, rotation, automatic or manual four-corner cropping, color/grayscale/black-and-white cleanup, handwriting sharpening, editable PDF filenames, A4/Letter/image-sized pages, and local PDF download. It deliberately has no camera-capture requirement.

Images are processed locally in the browser. OpenCV.js and pdf-lib are bundled with the static site; there are no document uploads, analytics, telemetry, accounts, or runtime CDN dependencies. The web edition does not currently provide OCR or existing-PDF/Word conversion; those remain desktop features.

```powershell
cd web
npm ci
npm test
npm run test:browser
npm run build
```

The production site is generated in `web/dist/`. Relative asset URLs support GitHub Pages project sites. The workflow in `.github/workflows/pages.yml` tests and builds the site, then deploys it to GitHub Pages after a push to `main` when **Settings → Pages → Source** is set to **GitHub Actions**. See `web/README.md` for usage, testing, privacy, and limitations.
