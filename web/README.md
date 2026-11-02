# PDF Toolbox — Web Edition

**Open the web app on desktop or mobile: https://YUANYINGLONG-91.github.io/PDF-Toolbox/**

A responsive, browser-based document toolbox with English and Simplified Chinese interfaces. Documents are processed locally in the current browser tab; there is no document-upload service.

## Features

- **Photo Scanner:** import document photos, arrange pages, detect document boundaries, drag all four corners, correct perspective, rotate, clean backgrounds, sharpen handwriting, preview the result, and export a named PDF.
- **Images to PDF:** combine multiple images in a selected order without applying scan enhancement. Choose A4, Letter, or image-sized pages.
- **OCR PDF:** recognize Simplified Chinese and/or English and create an image-based PDF with an invisible searchable text layer.
- **PDF to Word:** create an editable DOCX from embedded PDF text, or use local OCR for scanned and image-only pages.
- **Word to PDF:** render DOCX documents locally and export their visual appearance as PDF pages.
- **Merge PDF:** arrange and combine multiple PDF files.
- **Split PDF:** create separate PDFs from inclusive ranges such as `1-3,5,8-10`, packaged as a ZIP download.
- **Organize pages:** use visual previews to reorder, rotate, delete, or extract pages.
- **Compress PDF:** choose high-quality, balanced, or small-file profiles.
- **PDF to images:** render every page as PNG or JPG at 150, 200, or 300 DPI and download a ZIP archive.
- Touch-friendly mobile layouts, file/album import rather than required camera capture, and safe editable output filenames.

## Privacy

- No uploads, accounts, analytics, telemetry, cookies, or remote document APIs.
- Images and documents are processed in the current browser tab and are not persisted by the application. Refreshing or closing the tab clears the workspace.
- OpenCV.js, PDF.js, Tesseract.js, OCR language data, fonts, and conversion libraries are bundled locally; there are no runtime CDN dependencies.
- OCR uses `cacheMethod: 'none'`, so the OCR worker does not persist its language data.
- Network access is used only to load static application files. Browser tests monitor for unexpected remote requests and non-GET document traffic.

## Local development

Requires a current Node.js release (developed and tested with Node 24).

```sh
cd web
npm ci
npm run dev
```

Open the local URL printed by Vite.

### Production build

```sh
npm run build
npm run preview
```

The static production site is written to `web/dist/`. Do not serve the source directory directly.

### Tests

```sh
npm test
npm run test:browser
npm run test:tools
```

- `npm test` covers geometry, rotation, crop sizing, filename handling, PDF layout, and page-range parsing.
- `npm run test:browser` builds the app and runs the scanner workflow in a real browser: image import, edge detection, crop handles, enhancement modes, rotation, ordering, language switching, mobile overflow, and a validated two-page PDF.
- `npm run test:tools` builds the app and verifies direct image PDF creation, merge, split ZIPs, visual page organization, compression, PDF rendering, text PDF to editable DOCX, scanned Chinese/English OCR PDF, scanned PDF to editable DOCX, DOCX to PDF, and the Chinese mobile utility layout. It validates output file contents and checks for remote requests and uploads.

Browser tests use an installed Chrome, Chromium, or Edge browser through `playwright-core`; they do not download a browser. Set `CHROME_PATH` if the executable is not in a standard location:

```sh
CHROME_PATH=/path/to/chrome npm run test:browser
```

Screenshots are written to the ignored `test-output/` directory.

## GitHub Pages

`vite.config.ts` uses `base: './'`, so built asset URLs work on GitHub Pages project sites without hard-coding a repository name.

The repository-level `.github/workflows/pages.yml` workflow runs unit tests and the production build, then copies `web/dist/` to the `main` branch root. This repository uses **Settings → Pages → Deploy from a branch → `main` / `/ (root)`**. The root `.nojekyll` file disables Jekyll processing, and the workflow commits refreshed deployment files, including the local OCR and font assets, when the app changes.

Because routing is not used, no SPA rewrite rules or custom 404 page are needed.

## Performance and limitations

- Large engines are lazy-loaded. OpenCV.js loads for scanner enhancement; PDF.js, OCR language data, the CJK font, and conversion libraries load only for tools that need them.
- Large OCR and conversion jobs depend on available device memory. On mobile devices, process smaller documents or fewer pages at a time.
- Automatic document-edge detection can require manual corner adjustment in low-contrast or cluttered photos.
- OCR output is image-based at 150 DPI with invisible recognized text. Recognition errors are possible and should be reviewed.
- PDF-to-DOCX conversion prioritizes editable text. Columns, tables, formulas, fonts, and exact positioning are approximate and can require manual formatting.
- Browser Word conversion supports **DOCX**, not legacy **DOC**. DOCX-to-PDF output is image-based, and complex Word layout may vary from Microsoft Word.
- Browser PDF compression rasterizes pages, so selectable text and links are not preserved. An already optimized text PDF can become larger; compare the result before replacing anything.
- Imported images are downscaled for browser processing, and output photos are JPEG-compressed. Transparency is flattened to white. HEIC/HEIF support depends on the browser.
- A modern WebAssembly-capable browser is required. There is deliberately no service worker or offline-first caching claim.

## Third-party notices

Notices for OpenCV.js, pdf-lib, PDF.js, Tesseract.js, OCR language data, Noto CJK, fontkit, docx, docx-preview, html2canvas, and fflate are included in `public/licenses/` and copied into production builds.
