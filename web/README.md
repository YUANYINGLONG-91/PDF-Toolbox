# PDF Toolbox — Web Edition

A responsive, browser-only document scanner for desktop and mobile. Import image files, arrange pages, correct perspective, clean up document photos, and download a PDF. The interface is available in English and Simplified Chinese.

## Privacy

- No uploads, accounts, analytics, telemetry, cookies, or remote APIs.
- Images are processed in the current browser tab and are not persisted. Refreshing or closing the tab clears the workspace.
- OpenCV.js and pdf-lib are bundled locally; there are no runtime CDN dependencies.
- Network access is used only to load the app's static files. The browser smoke test also checks for unexpected remote requests.

## Features

- Multi-image selection and drag-and-drop for browser-supported image formats (JPG, PNG, WEBP, and others).
- File/album import only: no camera capture attribute or camera interface.
- Thumbnail previews, drag ordering, and accessible earlier/later buttons for touch devices.
- Automatic four-corner document detection with explicit manual fallback.
- Real draggable corner editing and homography-based perspective correction.
- Left/right rotation that preserves the crop geometry.
- Color, grayscale, and adaptive B&W cleanup. Illumination normalization and strong unsharp sharpening help retain handwriting.
- Adjustable detail strength and an enhanced-result preview.
- Editable PDF filename; A4, Letter, or image-sized output; automatic A4/Letter orientation.
- Direct PDF download generated locally with pdf-lib.

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
```

`npm test` runs fast geometry, rotation, crop sizing, filename, and PDF layout unit tests.

`npm run test:browser` builds the app and runs a real browser workflow: image import, edge detection, crop handles, all enhancement modes, rotation, page ordering, language switching, mobile overflow, and a validated two-page PDF download. It uses an installed Chrome, Chromium, or Edge browser via `playwright-core`; it does not download a browser. Set `CHROME_PATH` if the executable is not in a standard location:

```sh
CHROME_PATH=/path/to/chrome npm run test:browser
```

Screenshots are written to the ignored `test-output/` directory.

## GitHub Pages

`vite.config.ts` uses `base: './'`, so built asset URLs work on GitHub Pages **project sites** (for example, `https://USER.github.io/REPOSITORY/`) without hard-coding a repository name.

The repository-level `.github/workflows/pages.yml` workflow runs `npm ci`, unit tests, and `npm run build` in `web`, uploads `web/dist`, and deploys it with GitHub Pages actions. Set **Settings → Pages → Source** to **GitHub Actions**, then push to `main` or run the workflow manually.

Because routing is not used, no SPA rewrite rules or custom 404 page are needed.

## Performance and limitations

- The initial application JavaScript is small. The approximately 13.3 MB uncompressed OpenCV.js asset is lazy-loaded only after the first image import; pdf-lib loads only when exporting.
- Imported images are downscaled to a 2400-pixel long edge and stored as compressed local object URLs. Full-resolution pixel buffers are processed one page at a time and released between processing stages. Export still needs enough memory for the final PDF, so very large page batches may be limited by the browser/device.
- Automatic detection looks for a useful convex four-sided contour. Low contrast, shadows, cluttered backgrounds, or missing edges can prevent detection. In that case the full frame is retained and the four corner handles provide an honest manual crop; no crop is invented.
- Output photos are JPEG-compressed inside the PDF. Transparency is flattened to white. This edition does not perform OCR, embed searchable text, or import existing PDFs.
- A WebAssembly-capable modern browser is required for OpenCV. HEIC/HEIF support depends on the browser; convert those files to JPG or PNG if import fails.
- There is deliberately no service worker: the app does not claim offline-first caching. Once loaded, document processing itself does not require a server.

## Third-party notices

OpenCV.js is Apache-2.0 licensed and pdf-lib is MIT licensed. Their notices are included in `public/licenses/` and copied into production builds.
