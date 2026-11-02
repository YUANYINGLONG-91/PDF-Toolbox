import './style.css';
import type { EnhanceMode, PageSize, Rotation, ScanPage } from './types';
import { clampPoint, fullFrameCorners, rotateCorners } from './geometry';
import { drawRotated, normalizeImage } from './image';
import { detectDocument, loadOpenCv, renderPage } from './opencv';
import { createPdf, sanitizePdfFilename } from './pdf';
import { getLanguage, setLanguage, t, type Language } from './i18n';
import { refreshToolLanguage, setupToolNavigation } from './tools';

function element<T extends Element = HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing interface element: ${id}`);
  return found as unknown as T;
}

const ui = {
  welcome: element('welcome'),
  workspace: element('workspace'),
  fileInput: element<HTMLInputElement>('fileInput'),
  dropzone: element('dropzone'),
  choose: element<HTMLButtonElement>('chooseButton'),
  addPages: element<HTMLButtonElement>('addPagesButton'),
  addSmall: element<HTMLButtonElement>('addSmallButton'),
  startOver: element<HTMLButtonElement>('startOverButton'),
  progress: element('globalProgress'),
  pageList: element('pageList'),
  pageCount: element('pageCount'),
  pageLabel: element('editorPageLabel'),
  cropStatus: element('cropStatus'),
  cropImage: element<HTMLImageElement>('cropImage'),
  cropSvg: element<SVGSVGElement>('cropSvg'),
  cropPolygon: element<SVGPolygonElement>('cropPolygon'),
  cropShade: element<SVGPolygonElement>('cropShade'),
  handles: element<SVGGElement>('cornerHandles'),
  cropView: element('cropView'),
  resultView: element('resultView'),
  resultImage: element<HTMLImageElement>('resultImage'),
  cropTab: element<HTMLButtonElement>('cropTab'),
  resultTab: element<HTMLButtonElement>('resultTab'),
  cropHelp: element('cropHelp'),
  stageLoading: element('stageLoading'),
  stageLoadingText: element('stageLoadingText'),
  strength: element<HTMLInputElement>('strengthRange'),
  strengthValue: element<HTMLOutputElement>('strengthValue'),
  filename: element<HTMLInputElement>('filenameInput'),
  pageSize: element<HTMLSelectElement>('pageSizeSelect'),
  exportButton: element<HTMLButtonElement>('exportButton'),
  exportText: element('exportButtonText'),
  exportStatus: element('exportStatus'),
  toast: element('toast'),
  toastText: element('toastText'),
};

const pages: ScanPage[] = [];
let selectedId = '';
let currentView: 'crop' | 'result' = 'crop';
let rotatedPreviewUrl = '';
let resultUrl = '';
let renderedResultKey = '';
let cropWidth = 1;
let cropHeight = 1;
let cropRequest = 0;
let resultRequest = 0;
let resultTimer = 0;
let toastTimer = 0;
let importing = false;
let exporting = false;
let draggedPageId = '';
let activeCorner: number | null = null;
const thumbnailTimers = new Map<string, number>();
const thumbnailRequests = new Map<string, number>();

function activeToolIsScanner(): boolean {
  return document.querySelector('[data-tool="scan"]')?.classList.contains('active') ?? true;
}

const utilityView = element('utilityView');
const scanObserver = new MutationObserver(() => {
  if (activeToolIsScanner() && !utilityView.hidden && (!ui.welcome.hidden || !ui.workspace.hidden)) utilityView.hidden = true;
});
scanObserver.observe(ui.welcome, { attributes: true, attributeFilter: ['hidden'] });
scanObserver.observe(ui.workspace, { attributes: true, attributeFilter: ['hidden'] });

setupToolNavigation({
  showScan: () => renderWorkspace(),
  showUtility: () => {
    ui.welcome.hidden = true;
    ui.workspace.hidden = true;
    utilityView.hidden = false;
  },
  notify: showToast,
});

function selectedPage(): ScanPage | undefined {
  return pages.find((page) => page.id === selectedId);
}

function pageResultKey(page: ScanPage): string {
  return JSON.stringify([page.id, page.rotation, page.corners, page.mode, page.strength]);
}

function icon(name: string): string {
  return `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
}

function showToast(message: string): void {
  window.clearTimeout(toastTimer);
  ui.toastText.textContent = message;
  ui.toast.hidden = false;
  toastTimer = window.setTimeout(() => { ui.toast.hidden = true; }, 6500);
}

function setGlobalBusy(busy: boolean): void {
  ui.progress.hidden = !busy;
}

function setStageBusy(busy: boolean, message = t('processing')): void {
  ui.stageLoadingText.textContent = message;
  ui.stageLoading.hidden = !busy;
}

function updateCropStatus(page: ScanPage): void {
  ui.cropStatus.textContent = page.detected ? t('edgesFound') : t('manualCrop');
  const index = pages.indexOf(page);
  ui.pageLabel.textContent = getLanguage() === 'zh'
    ? `${t('page')} ${index + 1} ${t('of')} ${pages.length} ${getLanguage() === 'zh' ? '页' : ''}`
    : `${t('page')} ${index + 1} ${t('of')} ${pages.length}`;
}

function updateInspector(page: ScanPage): void {
  document.querySelectorAll<HTMLButtonElement>('.mode-button').forEach((button) => {
    const active = button.dataset.mode === page.mode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  ui.strength.value = String(page.strength);
  ui.strengthValue.value = `${page.strength}%`;
  updateCropStatus(page);
}

function renderPageList(): void {
  ui.pageList.replaceChildren();
  ui.pageCount.textContent = String(pages.length);
  pages.forEach((page, index) => {
    const item = document.createElement('article');
    item.className = `page-item${page.id === selectedId ? ' active' : ''}`;
    item.dataset.id = page.id;
    item.draggable = true;

    const thumbnail = document.createElement('button');
    thumbnail.type = 'button';
    thumbnail.className = 'page-thumb';
    thumbnail.setAttribute('aria-label', `${t('pageOptions')} ${index + 1}`);
    const image = document.createElement('img');
    image.src = page.thumbUrl || page.sourceUrl;
    image.alt = '';
    image.draggable = false;
    const number = document.createElement('span');
    number.className = 'page-number';
    number.textContent = String(index + 1);
    thumbnail.append(image, number);
    thumbnail.addEventListener('click', () => selectPage(page.id));

    const meta = document.createElement('div');
    meta.className = 'page-meta';
    const name = document.createElement('button');
    name.type = 'button';
    name.className = 'page-name';
    name.textContent = page.name.replace(/\.[^.]+$/, '');
    name.title = page.name;
    name.addEventListener('click', () => selectPage(page.id));
    const controls = document.createElement('div');
    controls.className = 'page-controls';
    const grip = document.createElement('span');
    grip.className = 'page-grip icon-button';
    grip.innerHTML = icon('grip');
    grip.setAttribute('aria-hidden', 'true');
    const up = document.createElement('button');
    up.type = 'button';
    up.className = 'icon-button';
    up.innerHTML = icon('up');
    up.title = t('moveUp');
    up.setAttribute('aria-label', `${t('moveUp')} ${index + 1}`);
    up.disabled = index === 0;
    up.addEventListener('click', () => movePage(page.id, -1));
    const down = document.createElement('button');
    down.type = 'button';
    down.className = 'icon-button';
    down.innerHTML = icon('down');
    down.title = t('moveDown');
    down.setAttribute('aria-label', `${t('moveDown')} ${index + 1}`);
    down.disabled = index === pages.length - 1;
    down.addEventListener('click', () => movePage(page.id, 1));
    controls.append(grip, up, down);
    meta.append(name, controls);
    item.append(thumbnail, meta);

    item.addEventListener('dragstart', (event) => {
      draggedPageId = page.id;
      item.classList.add('dragging');
      event.dataTransfer?.setData('text/plain', page.id);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    });
    item.addEventListener('dragover', (event) => {
      if (!draggedPageId || draggedPageId === page.id) return;
      event.preventDefault();
      item.classList.add('drag-target');
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    });
    item.addEventListener('dragleave', () => item.classList.remove('drag-target'));
    item.addEventListener('drop', (event) => {
      event.preventDefault();
      const sourceId = draggedPageId || event.dataTransfer?.getData('text/plain') || '';
      reorderPage(sourceId, page.id);
      draggedPageId = '';
    });
    item.addEventListener('dragend', () => {
      draggedPageId = '';
      document.querySelectorAll('.page-item').forEach((entry) => entry.classList.remove('dragging', 'drag-target'));
    });
    ui.pageList.append(item);
  });
}

function renderWorkspace(): void {
  const hasPages = pages.length > 0;
  ui.welcome.hidden = hasPages;
  ui.workspace.hidden = !hasPages;
  if (hasPages) {
    renderPageList();
    const page = selectedPage();
    if (page) updateInspector(page);
  }
}

function movePage(id: string, direction: number): void {
  if (exporting) return;
  const index = pages.findIndex((page) => page.id === id);
  const destination = index + direction;
  if (index < 0 || destination < 0 || destination >= pages.length) return;
  const [page] = pages.splice(index, 1);
  pages.splice(destination, 0, page);
  renderPageList();
  const selected = selectedPage();
  if (selected) updateCropStatus(selected);
}

function reorderPage(sourceId: string, targetId: string): void {
  if (exporting || !sourceId || sourceId === targetId) return;
  const sourceIndex = pages.findIndex((page) => page.id === sourceId);
  const targetIndex = pages.findIndex((page) => page.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0) return;
  const [page] = pages.splice(sourceIndex, 1);
  pages.splice(targetIndex, 0, page);
  renderPageList();
  const selected = selectedPage();
  if (selected) updateCropStatus(selected);
}

async function selectPage(id: string): Promise<void> {
  if (!pages.some((page) => page.id === id)) return;
  selectedId = id;
  currentView = 'crop';
  setView('crop', false);
  renderPageList();
  const page = selectedPage();
  if (page) updateInspector(page);
  await loadCropPreview();
}

async function loadCropPreview(): Promise<void> {
  const page = selectedPage();
  if (!page) return;
  const request = ++cropRequest;
  setStageBusy(true);
  try {
    const preview = await drawRotated(page);
    if (request !== cropRequest || selectedId !== page.id) {
      URL.revokeObjectURL(preview.url);
      return;
    }
    if (rotatedPreviewUrl) URL.revokeObjectURL(rotatedPreviewUrl);
    rotatedPreviewUrl = preview.url;
    cropWidth = preview.width;
    cropHeight = preview.height;
    ui.cropImage.src = preview.url;
    ui.cropSvg.setAttribute('viewBox', `0 0 ${cropWidth} ${cropHeight}`);
    updateCropOverlay();
  } catch {
    showToast(t('importError'));
  } finally {
    if (request === cropRequest && currentView === 'crop') setStageBusy(false);
  }
}

function createCornerHandles(): void {
  for (let index = 0; index < 4; index += 1) {
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.dataset.index = String(index);
    const hit = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    hit.setAttribute('class', 'corner-hit');
    hit.dataset.index = String(index);
    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dot.setAttribute('class', 'corner-dot');
    const core = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    core.setAttribute('class', 'corner-core');
    group.append(hit, dot, core);
    ui.handles.append(group);
  }
}

function updateCropOverlay(): void {
  const page = selectedPage();
  if (!page) return;
  const points = page.corners.map((point) => `${point.x * cropWidth},${point.y * cropHeight}`).join(' ');
  ui.cropPolygon.setAttribute('points', points);
  ui.cropShade.setAttribute('points', points);
  const radius = Math.max(cropWidth, cropHeight) / 115;
  ui.handles.querySelectorAll<SVGGElement>('g').forEach((group, index) => {
    const point = page.corners[index];
    const x = point.x * cropWidth;
    const y = point.y * cropHeight;
    const hit = group.querySelector<SVGCircleElement>('.corner-hit');
    const dot = group.querySelector<SVGCircleElement>('.corner-dot');
    const core = group.querySelector<SVGCircleElement>('.corner-core');
    [hit, dot, core].forEach((circle) => {
      circle?.setAttribute('cx', String(x));
      circle?.setAttribute('cy', String(y));
    });
    hit?.setAttribute('r', String(radius * 2.4));
    dot?.setAttribute('r', String(radius));
    core?.setAttribute('r', String(radius * 0.32));
  });
}

function setView(view: 'crop' | 'result', render = true): void {
  currentView = view;
  const crop = view === 'crop';
  ui.cropView.hidden = !crop;
  ui.resultView.hidden = crop;
  ui.cropHelp.hidden = !crop;
  ui.cropTab.classList.toggle('active', crop);
  ui.resultTab.classList.toggle('active', !crop);
  ui.cropTab.setAttribute('aria-selected', String(crop));
  ui.resultTab.setAttribute('aria-selected', String(!crop));
  if (!crop && render) scheduleResult(true);
  else if (crop) {
    resultRequest += 1;
    setStageBusy(false);
  }
}

function scheduleResult(immediate = false): void {
  window.clearTimeout(resultTimer);
  const page = selectedPage();
  if (!page || currentView !== 'result' || exporting) return;
  const key = pageResultKey(page);
  if (resultUrl && renderedResultKey === key) {
    ui.resultImage.src = resultUrl;
    setStageBusy(false);
    return;
  }
  const request = ++resultRequest;
  resultTimer = window.setTimeout(() => updateResult(request), immediate ? 0 : 220);
}

async function updateResult(request: number): Promise<void> {
  const page = selectedPage();
  if (!page || currentView !== 'result' || request !== resultRequest) return;
  const key = pageResultKey(page);
  setStageBusy(true);
  try {
    const rendered = await renderPage(page, 1900, 0.88);
    if (request !== resultRequest || selectedId !== page.id || currentView !== 'result') return;
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    resultUrl = URL.createObjectURL(rendered.blob);
    renderedResultKey = key;
    ui.resultImage.src = resultUrl;
    await ui.resultImage.decode();
  } catch (error) {
    console.error('Preview rendering failed:', error);
    if (request === resultRequest) showToast(t('engineFailed'));
  } finally {
    if (request === resultRequest) setStageBusy(false);
  }
}

function scheduleThumbnail(page: ScanPage, immediate = false): void {
  const oldTimer = thumbnailTimers.get(page.id);
  if (oldTimer) window.clearTimeout(oldTimer);
  const request = (thumbnailRequests.get(page.id) ?? 0) + 1;
  thumbnailRequests.set(page.id, request);
  const timer = window.setTimeout(async () => {
    try {
      const rendered = await renderPage(page, 240, 0.78);
      if (thumbnailRequests.get(page.id) !== request || !pages.includes(page)) return;
      if (page.thumbUrl) URL.revokeObjectURL(page.thumbUrl);
      page.thumbUrl = URL.createObjectURL(rendered.blob);
      renderPageList();
    } catch {
      // The source thumbnail remains available if the enhancement engine fails.
    }
  }, immediate ? 0 : 300);
  thumbnailTimers.set(page.id, timer);
}

async function rotatePage(amount: Rotation): Promise<void> {
  if (exporting || importing) return;
  const page = selectedPage();
  if (!page) return;
  page.corners = rotateCorners(page.corners, amount);
  page.rotation = ((page.rotation + amount) % 360) as Rotation;
  renderedResultKey = '';
  updateCropStatus(page);
  await loadCropPreview();
  if (currentView === 'result') scheduleResult(true);
  scheduleThumbnail(page);
}

async function autoCrop(): Promise<void> {
  const page = selectedPage();
  if (!page || exporting || importing) return;
  setStageBusy(true, t('detecting'));
  try {
    const blob = await (await fetch(page.sourceUrl)).blob();
    const detected = await detectDocument(blob);
    page.corners = detected ? rotateCorners(detected, page.rotation) : fullFrameCorners();
    page.detected = Boolean(detected);
    renderedResultKey = '';
    updateCropStatus(page);
    updateCropOverlay();
    if (!detected) showToast(t('detectFailed'));
    if (currentView === 'result') scheduleResult(true);
    scheduleThumbnail(page, true);
  } catch {
    showToast(t('engineFailed'));
  } finally {
    setStageBusy(false);
  }
}

function resetCrop(): void {
  const page = selectedPage();
  if (!page || exporting || importing) return;
  page.corners = fullFrameCorners();
  page.detected = false;
  renderedResultKey = '';
  updateCropStatus(page);
  updateCropOverlay();
  if (currentView === 'result') scheduleResult(true);
  scheduleThumbnail(page);
}

function deleteSelectedPage(): void {
  const page = selectedPage();
  if (!page || exporting || importing || !window.confirm(t('deleteConfirm'))) return;
  const index = pages.indexOf(page);
  URL.revokeObjectURL(page.sourceUrl);
  if (page.thumbUrl) URL.revokeObjectURL(page.thumbUrl);
  pages.splice(index, 1);
  window.clearTimeout(thumbnailTimers.get(page.id));
  if (!pages.length) {
    clearWorkspace();
    return;
  }
  const next = pages[Math.min(index, pages.length - 1)];
  void selectPage(next.id);
}

function clearWorkspace(): void {
  pages.forEach((page) => {
    URL.revokeObjectURL(page.sourceUrl);
    if (page.thumbUrl) URL.revokeObjectURL(page.thumbUrl);
  });
  pages.splice(0);
  selectedId = '';
  cropRequest += 1;
  resultRequest += 1;
  window.clearTimeout(resultTimer);
  thumbnailTimers.forEach((timer) => window.clearTimeout(timer));
  thumbnailTimers.clear();
  if (rotatedPreviewUrl) URL.revokeObjectURL(rotatedPreviewUrl);
  if (resultUrl) URL.revokeObjectURL(resultUrl);
  rotatedPreviewUrl = '';
  resultUrl = '';
  renderedResultKey = '';
  ui.cropImage.removeAttribute('src');
  ui.resultImage.removeAttribute('src');
  ui.exportStatus.textContent = '';
  renderWorkspace();
}

async function importFiles(fileList: FileList | File[]): Promise<void> {
  if (importing || exporting) return;
  const files = Array.from(fileList);
  const images = files.filter((file) => file.type.startsWith('image/'));
  if (!images.length) {
    showToast(t('invalidImages'));
    return;
  }
  if (images.length !== files.length) showToast(t('invalidImages'));
  importing = true;
  setGlobalBusy(true);
  ui.choose.disabled = true;
  ui.addPages.disabled = true;
  ui.addSmall.disabled = true;
  ui.exportButton.disabled = true;
  let added = 0;
  let failed = 0;
  let engineFailed = false;
  let uncertainEdges = false;
  // Start the local engine download/compile in parallel with image normalization.
  void loadOpenCv().catch(() => { engineFailed = true; });
  try {
    for (const file of images) {
      let sourceUrl = '';
      try {
        const normalized = await normalizeImage(file);
        sourceUrl = URL.createObjectURL(normalized.blob);
        const page: ScanPage = {
          id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          name: file.name || `Page ${pages.length + 1}`,
          sourceUrl,
          width: normalized.width,
          height: normalized.height,
          rotation: 0,
          corners: fullFrameCorners(),
          mode: 'color',
          strength: 70,
          detected: false,
        };
        pages.push(page);
        added += 1;
        if (!selectedId) selectedId = page.id;
        renderWorkspace();
        try {
          const corners = await detectDocument(normalized.blob);
          if (corners) {
            page.corners = corners;
            page.detected = true;
          } else {
            uncertainEdges = true;
          }
          const thumbnail = await renderPage(page, 240, 0.78);
          page.thumbUrl = URL.createObjectURL(thumbnail.blob);
        } catch {
          engineFailed = true;
        }
        renderPageList();
      } catch {
        failed += 1;
        if (sourceUrl) URL.revokeObjectURL(sourceUrl);
      }
    }
  } finally {
    importing = false;
    setGlobalBusy(false);
    ui.choose.disabled = false;
    ui.addPages.disabled = false;
    ui.addSmall.disabled = false;
    ui.exportButton.disabled = false;
    ui.fileInput.value = '';
  }
  if (added) {
    await selectPage(selectedId);
    showToast(`${added} ${t(added === 1 ? 'importSuccessOne' : 'importSuccess')}`);
    if (engineFailed) showToast(t('engineFailed'));
    else if (uncertainEdges) showToast(t('detectFailed'));
  }
  if (failed) showToast(t('importError'));
}

async function exportPdf(): Promise<void> {
  if (!pages.length || exporting || importing) return;
  exporting = true;
  const snapshot = pages.map((page) => ({ ...page, corners: page.corners.map((point) => ({ ...point })) }));
  const language = getLanguage();
  const filename = sanitizePdfFilename(ui.filename.value, t('emptyFilename'));
  ui.filename.value = filename;
  ui.exportButton.disabled = true;
  ui.exportText.textContent = t('processing');
  ui.workspace.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement>('button, input, select').forEach((control) => {
    control.disabled = true;
  });
  try {
    const bytes = await createPdf(snapshot, ui.pageSize.value as PageSize, (index, total) => {
      ui.exportStatus.textContent = `${t('preparing')} ${index} / ${total}`;
    });
    ui.exportStatus.textContent = t('creatingPdf');
    const blob = new Blob([bytes.slice().buffer as ArrayBuffer], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename}.pdf`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
    ui.exportStatus.textContent = t('downloadReady');
  } catch {
    ui.exportStatus.textContent = t('exportError');
    showToast(t('exportError'));
  } finally {
    exporting = false;
    ui.workspace.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement>('button, input, select').forEach((control) => {
      control.disabled = false;
    });
    ui.exportButton.disabled = false;
    ui.exportText.textContent = t('downloadPdf');
    renderPageList();
    if (language !== getLanguage()) ui.exportStatus.textContent = '';
  }
}

function openFilePicker(): void {
  if (!importing && !exporting) ui.fileInput.click();
}

// File import: album/file selection only. No capture attribute or camera interface.
ui.choose.addEventListener('click', (event) => { event.stopPropagation(); openFilePicker(); });
ui.dropzone.addEventListener('click', openFilePicker);
ui.dropzone.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    openFilePicker();
  }
});
ui.addPages.addEventListener('click', openFilePicker);
ui.addSmall.addEventListener('click', openFilePicker);
ui.fileInput.addEventListener('change', () => {
  if (ui.fileInput.files) void importFiles(ui.fileInput.files);
});
ui.dropzone.addEventListener('dragover', (event) => {
  event.preventDefault();
  ui.dropzone.classList.add('drag-over');
});
ui.dropzone.addEventListener('dragleave', () => ui.dropzone.classList.remove('drag-over'));
ui.dropzone.addEventListener('drop', (event) => {
  event.preventDefault();
  ui.dropzone.classList.remove('drag-over');
  if (event.dataTransfer?.files) void importFiles(event.dataTransfer.files);
});
window.addEventListener('dragover', (event) => event.preventDefault());
window.addEventListener('drop', (event) => event.preventDefault());

ui.cropTab.addEventListener('click', () => setView('crop'));
ui.resultTab.addEventListener('click', () => setView('result'));
element('rotateLeftButton').addEventListener('click', () => void rotatePage(270));
element('rotateRightButton').addEventListener('click', () => void rotatePage(90));
element('autoCropButton').addEventListener('click', () => void autoCrop());
element('resetCropButton').addEventListener('click', resetCrop);
element('deletePageButton').addEventListener('click', deleteSelectedPage);
ui.startOver.addEventListener('click', () => {
  if (!exporting && !importing && window.confirm(t('startOverConfirm'))) clearWorkspace();
});

ui.cropSvg.addEventListener('pointerdown', (event) => {
  const target = (event.target as SVGElement).closest<SVGCircleElement>('.corner-hit');
  const page = selectedPage();
  if (!target || !page || exporting || importing) return;
  event.preventDefault();
  activeCorner = Number(target.dataset.index);
  page.detected = false;
  ui.cropSvg.setPointerCapture(event.pointerId);
});
ui.cropSvg.addEventListener('pointermove', (event) => {
  const page = selectedPage();
  if (activeCorner === null || !page) return;
  const bounds = ui.cropSvg.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return;
  page.corners[activeCorner] = clampPoint({
    x: (event.clientX - bounds.left) / bounds.width,
    y: (event.clientY - bounds.top) / bounds.height,
  });
  renderedResultKey = '';
  updateCropOverlay();
  updateCropStatus(page);
});
function finishCornerDrag(): void {
  if (activeCorner === null) return;
  activeCorner = null;
  const page = selectedPage();
  if (!page) return;
  if (currentView === 'result') scheduleResult();
  scheduleThumbnail(page);
}
ui.cropSvg.addEventListener('pointerup', finishCornerDrag);
ui.cropSvg.addEventListener('pointercancel', finishCornerDrag);

document.querySelectorAll<HTMLButtonElement>('.mode-button').forEach((button) => {
  button.addEventListener('click', () => {
    const page = selectedPage();
    if (!page || exporting || importing) return;
    page.mode = button.dataset.mode as EnhanceMode;
    renderedResultKey = '';
    updateInspector(page);
    setView('result');
    scheduleThumbnail(page);
  });
});
ui.strength.addEventListener('input', () => {
  const page = selectedPage();
  if (!page) return;
  page.strength = Number(ui.strength.value);
  ui.strengthValue.value = `${page.strength}%`;
  renderedResultKey = '';
  if (currentView !== 'result') setView('result');
  else scheduleResult();
  scheduleThumbnail(page);
});

ui.exportButton.addEventListener('click', () => void exportPdf());
element('languageButton').addEventListener('click', () => {
  const next: Language = getLanguage() === 'en' ? 'zh' : 'en';
  try { localStorage.setItem('pdf-toolbox-language', next); } catch { /* Private browsing can disable storage. */ }
  setLanguage(next);
  refreshToolLanguage();
  if (pages.length) {
    renderPageList();
    const page = selectedPage();
    if (page) updateInspector(page);
  }
  ui.exportStatus.textContent = '';
  ui.toast.hidden = true;
});
element('toastClose').addEventListener('click', () => { ui.toast.hidden = true; });
window.addEventListener('beforeunload', (event) => {
  if (pages.length) {
    event.preventDefault();
    event.returnValue = '';
  }
});

createCornerHandles();
let initialLanguage: Language = 'en';
try {
  const saved = localStorage.getItem('pdf-toolbox-language');
  if (saved === 'zh' || (!saved && navigator.language.toLowerCase().startsWith('zh'))) initialLanguage = 'zh';
} catch { /* Language preference is optional. */ }
setLanguage(initialLanguage);
refreshToolLanguage();
renderWorkspace();
