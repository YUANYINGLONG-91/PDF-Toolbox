# Responsive Web Version

**Open PDF Toolbox online: https://YUANYINGLONG-91.github.io/PDF-Toolbox/**

The implemented web edition in `web/` uses one responsive interface for desktop and mobile browsers and is suitable for static GitHub Pages hosting.

## Available tools

- Photo scanning with automatic/manual four-corner cropping, perspective correction, rotation, color/grayscale/black-and-white cleanup, and handwriting sharpening.
- Direct multi-image PDF creation without scan enhancement.
- Local Simplified Chinese and English OCR for searchable PDFs.
- PDF to editable DOCX, using embedded text or OCR for scanned pages.
- DOCX to PDF using local browser rendering.
- PDF merge, custom-range split, visual page reorder/rotate/delete/extract, compression, and PNG/JPG rendering.
- English and Simplified Chinese interfaces, editable output filenames, and ZIP downloads for multi-file results.

Desktop browsers support mouse, keyboard, file drag-and-drop, and multi-file selection. Mobile browsers use touch controls and image/album import; camera capture is not required or requested.

All document processing uses local JavaScript/WebAssembly. There is no document upload, analytics, telemetry, account, or runtime CDN dependency. PDF.js, Tesseract.js, OCR language data, Noto CJK, OpenCV.js, and the conversion libraries are served with the application.

## Deployment

`.github/workflows/pages.yml` runs the unit tests and production build on pushes to `main` that change the web app. It copies `web/dist/` to the `main` branch root and commits the refreshed deployment files, including `assets/`, `fonts/`, `pdfjs/`, `tesseract/`, and `licenses/`. The repository uses **Settings → Pages → Build and deployment → Deploy from a branch → `main` / `/ (root)`**; `.nojekyll` disables Jekyll processing. The workflow can also be started manually with **Run workflow**.

## Verification

- `npm test` covers geometry, rotation, filename handling, PDF layout, and page-range parsing.
- `npm run test:browser` verifies the complete scanner workflow and a real PDF download in an installed Edge/Chrome/Chromium browser.
- `npm run test:tools` verifies all document utilities, Chinese and English OCR text, editable DOCX content, multi-file ZIP results, Chinese mobile layout, and the absence of remote requests or document uploads.

## Limitations

Very large OCR and conversion jobs depend on available device memory. OCR accuracy and complex document layout require review. PDF-to-DOCX layout is approximate. Browser Word conversion accepts DOCX rather than legacy DOC and produces image-based PDF pages. Browser compression rasterizes pages and does not preserve selectable text or links. Low-contrast photos can require manual corner adjustment, HEIC support depends on the browser, and no offline service worker is included.

See `web/README.md` for development commands and additional implementation details.
