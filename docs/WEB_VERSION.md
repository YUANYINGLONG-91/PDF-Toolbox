# Responsive Web Version

The implemented web edition in `web/` uses one responsive interface for desktop and mobile browsers and is suitable for static GitHub Pages hosting.

- Desktop: mouse, keyboard, file drag-and-drop, and multi-file selection.
- Mobile: touch controls and image/album import. Camera capture is deliberately not required or requested.
- Local browser processing with JavaScript/WebAssembly; no document upload, analytics, telemetry, accounts, or runtime CDN dependencies.
- OpenCV.js for document-boundary detection, manual corner editing, and perspective correction.
- Color, grayscale, and adaptive black-and-white cleanup with illumination normalization and adjustable handwriting sharpening.
- pdf-lib for locally generated, downloadable PDFs with editable filenames and A4, Letter, or image-sized pages.
- English and Simplified Chinese interfaces.
- Bundled static assets with relative URLs for GitHub Pages project sites.

## Deployment

`.github/workflows/pages.yml` runs the unit tests and production build on pushes to `main` that change the web app. It uploads `web/dist/` and deploys with GitHub Pages actions. In the repository, select **Settings → Pages → Build and deployment → Source → GitHub Actions**. The workflow can also be started manually with **Run workflow**.

## Verification and limitations

`npm test` covers geometry, rotation, filename handling, and PDF layout. `npm run test:browser` uses an installed Edge/Chrome/Chromium browser to verify import, crop handles, enhancement, rotation, ordering, Chinese UI, mobile overflow, local-only requests, and a real two-page PDF download.

The browser edition does not currently perform OCR, import existing PDFs, or convert Word documents. High-fidelity OCR and Microsoft Word conversion remain desktop features. Low-contrast or cluttered photos can require manual corner adjustment. Very large batches depend on available device memory. HEIC support depends on the browser. No offline service worker is included.

See `web/README.md` for development commands and additional implementation details.
