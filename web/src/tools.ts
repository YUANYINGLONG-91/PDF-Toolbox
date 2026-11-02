import { getLanguage } from './i18n';
import type { DirectImagePageSize, OcrLanguage } from './document-tools';

export type UtilityTool = 'images' | 'ocr' | 'pdf-word' | 'word-pdf' | 'merge' | 'split' | 'organize' | 'compress' | 'render';
export type AppTool = 'scan' | UtilityTool;
type LocalText = { en: string; zh: string };
type ToolConfig = {
  accept: string;
  extensions: string[];
  multiple: boolean;
  title: LocalText;
  subtitle: LocalText;
  dropTitle: LocalText;
  action: LocalText;
  extension: string;
  description: LocalText;
  notes: LocalText[];
};
type NavigationCallbacks = {
  showScan: () => void;
  showUtility: () => void;
  notify: (message: string) => void;
};

const tx = (en: string, zh: string): LocalText => ({ en, zh });
const local = (value: LocalText) => value[getLanguage()];
const common = {
  chooseFiles: tx('Choose files', '选择文件'),
  chooseImages: tx('Choose images', '选择图片'),
  dropBody: tx('or drop them here · processing stays on this device', '或将文件拖到这里 · 全程在本机处理'),
  outputName: tx('Output file name', '输出文件名'),
  ready: tx('Done. Your download is ready.', '处理完成，文件已开始下载。'),
  working: tx('Processing locally…', '正在本地处理…'),
  loadingPreviews: tx('Rendering page previews…', '正在生成页面预览…'),
  failed: tx('The operation could not be completed.', '操作未能完成。'),
  noFiles: tx('Choose at least one file first.', '请先选择文件。'),
  twoPdfs: tx('Choose at least two PDF files.', '请至少选择两个 PDF 文件。'),
  wrongType: tx('Some files were skipped because their format is not supported.', '部分文件因格式不受支持而被跳过。'),
  oneFile: tx('This tool uses one file at a time; only the first file was kept.', '此工具一次处理一个文件，仅保留第一个文件。'),
  earlier: tx('Move earlier', '向前移动'),
  later: tx('Move later', '向后移动'),
  remove: tx('Remove', '移除'),
  rotate: tx('Rotate 90°', '旋转 90°'),
  page: tx('Page', '第'),
  pagesSuffix: tx('', '页'),
  filename: tx('Scanned document', '扫描文档'),
  sideTitle: tx('Private by design', '隐私优先'),
  localNote: tx('Your files are processed in this browser and never uploaded.', '文件仅在当前浏览器中处理，绝不上传。'),
  eyebrow: tx('LOCAL DOCUMENT TOOLKIT', '本地文档工具箱'),
  pageRanges: tx('Page ranges', '页面范围'),
  language: tx('OCR language', 'OCR 识别语言'),
  bothLanguages: tx('Chinese + English', '简体中文 + 英语'),
  english: tx('English', '英语'),
  chinese: tx('Simplified Chinese', '简体中文'),
  pageSize: tx('Page size', '页面大小'),
  compression: tx('Compression profile', '压缩档位'),
  imageFormat: tx('Image format', '图片格式'),
  resolution: tx('Resolution', '分辨率'),
};

const configs: Record<UtilityTool, ToolConfig> = {
  images: {
    accept: 'image/*', extensions: [], multiple: true, extension: '.pdf',
    title: tx('Combine images into a PDF', '将图片直接合并为 PDF'),
    subtitle: tx('Keep your original images, arrange their order, and create one PDF without scan enhancement.', '保留原图并调整顺序，无需扫描增强即可生成一个 PDF。'),
    dropTitle: tx('Add JPG, PNG or WEBP images', '添加 JPG、PNG 或 WEBP 图片'),
    action: tx('Create PDF from images', '将图片合并为 PDF'),
    description: tx('A direct image-to-PDF converter, separate from the photo scanner.', '独立的图片转 PDF 工具，不会自动裁剪或增强图片。'),
    notes: [tx('Multiple images are placed one per page.', '每张图片单独占一页。'), tx('Use Photo scanner when you need cropping and cleanup.', '如需裁剪、找边和增强，请使用照片扫描。')],
  },
  ocr: {
    accept: '.pdf,application/pdf', extensions: ['.pdf'], multiple: false, extension: '.pdf',
    title: tx('Make a scanned PDF searchable', '让扫描版 PDF 支持搜索'),
    subtitle: tx('Recognize Simplified Chinese and English text locally, then add an invisible searchable text layer.', '在本地识别简体中文和英文，并添加可搜索的隐形文字层。'),
    dropTitle: tx('Choose a scanned PDF', '选择扫描版 PDF'),
    action: tx('OCR and download PDF', '识别并下载 PDF'),
    description: tx('On-device OCR keeps the page appearance and makes recognized text searchable.', '本地 OCR 保留页面外观，并让识别出的文字可以搜索。'),
    notes: [tx('The first OCR run loads the bundled recognition engine and language data.', '首次识别需要加载本地识别引擎和语言数据。'), tx('Pages are rendered as high-quality images; review OCR text for errors.', '页面会渲染为高质量图片，识别结果仍需校对。')],
  },
  'pdf-word': {
    accept: '.pdf,application/pdf', extensions: ['.pdf'], multiple: false, extension: '.docx',
    title: tx('Convert PDF to editable Word', '将 PDF 转换为可编辑 Word'),
    subtitle: tx('Extract existing text or OCR scanned pages into an editable DOCX document.', '提取已有文字，或识别扫描页面，生成可编辑的 DOCX 文档。'),
    dropTitle: tx('Choose a PDF to convert', '选择要转换的 PDF'),
    action: tx('Convert to DOCX', '转换为 DOCX'),
    description: tx('Text remains editable, including OCR text from image-only pages.', '文字保持可编辑，纯图片页面会通过 OCR 提取文字。'),
    notes: [tx('Layout, columns, tables and formulas are approximate.', '版面、分栏、表格和公式仅为近似还原。'), tx('Complex documents may need manual formatting afterward.', '复杂文档转换后可能需要手动排版。')],
  },
  'word-pdf': {
    accept: '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document', extensions: ['.docx'], multiple: false, extension: '.pdf',
    title: tx('Convert Word to PDF', '将 Word 转换为 PDF'),
    subtitle: tx('Render DOCX pages locally and preserve their visual appearance in a PDF.', '在本地渲染 DOCX 页面，并在 PDF 中保留视觉外观。'),
    dropTitle: tx('Choose a DOCX document', '选择 DOCX 文档'),
    action: tx('Convert to PDF', '转换为 PDF'),
    description: tx('Common DOCX formatting is rendered without Microsoft Word or an online service.', '无需 Microsoft Word 或在线服务即可渲染常见 DOCX 格式。'),
    notes: [tx('Legacy .doc files are not supported; save them as .docx first.', '暂不支持旧版 .doc 文件，请先另存为 .docx。'), tx('Output pages are image-based; complex Word layout may vary.', '输出为图片型页面，复杂 Word 排版可能存在差异。')],
  },
  merge: {
    accept: '.pdf,application/pdf', extensions: ['.pdf'], multiple: true, extension: '.pdf',
    title: tx('Merge PDF files', '合并 PDF 文件'),
    subtitle: tx('Arrange multiple PDFs in the order you want and combine them without changing their pages.', '按所需顺序排列多个 PDF，并在不改变页面的情况下合并。'),
    dropTitle: tx('Add two or more PDF files', '添加两个或更多 PDF 文件'),
    action: tx('Merge and download PDF', '合并并下载 PDF'),
    description: tx('Pages, text and existing annotations are copied locally into one document.', '页面、文字和已有批注会在本地复制到一个文档中。'),
    notes: [tx('Use the arrows to change file order before merging.', '合并前可使用箭头调整文件顺序。'), tx('Encrypted or damaged PDFs may need to be repaired first.', '加密或损坏的 PDF 可能需要先解密或修复。')],
  },
  split: {
    accept: '.pdf,application/pdf', extensions: ['.pdf'], multiple: false, extension: '.zip',
    title: tx('Split or extract PDF pages', '拆分或提取 PDF 页面'),
    subtitle: tx('Create separate PDFs from custom inclusive page ranges.', '按自定义页面范围生成独立的 PDF 文件。'),
    dropTitle: tx('Choose a PDF to split', '选择要拆分的 PDF'),
    action: tx('Split and download ZIP', '拆分并下载 ZIP'),
    description: tx('Each range becomes a separate PDF inside one ZIP download.', '每个页面范围会生成一个独立 PDF，并打包为 ZIP 下载。'),
    notes: [tx('Example: 1-3,5,8-10 creates three PDF files.', '例如 1-3,5,8-10 会生成三个 PDF 文件。'), tx('Use a single range to extract only the pages you need.', '输入单个范围即可只提取所需页面。')],
  },
  organize: {
    accept: '.pdf,application/pdf', extensions: ['.pdf'], multiple: false, extension: '.pdf',
    title: tx('Organize PDF pages', '管理 PDF 页面'),
    subtitle: tx('Reorder, rotate or delete pages with visual previews, then save a new PDF.', '通过页面预览排序、旋转或删除页面，然后保存新的 PDF。'),
    dropTitle: tx('Choose a PDF to organize', '选择要管理的 PDF'),
    action: tx('Save organized PDF', '保存整理后的 PDF'),
    description: tx('Keep only the pages you need and adjust their order and orientation.', '保留所需页面，并调整顺序和方向。'),
    notes: [tx('Deleting a page here never changes your original file.', '在这里删除页面不会修改原文件。'), tx('To extract pages, delete the pages you do not want.', '如需提取页面，可删除不需要的页面。')],
  },
  compress: {
    accept: '.pdf,application/pdf', extensions: ['.pdf'], multiple: false, extension: '.pdf',
    title: tx('Compress a PDF', '压缩 PDF'),
    subtitle: tx('Reduce file size with local page rendering and adjustable image quality.', '通过本地页面渲染和可调图片质量减小文件体积。'),
    dropTitle: tx('Choose a PDF to compress', '选择要压缩的 PDF'),
    action: tx('Compress and download', '压缩并下载'),
    description: tx('Choose a balance between visual quality and a smaller download.', '在视觉质量和较小文件之间选择平衡。'),
    notes: [tx('Compression rasterizes pages; selectable text and links are not preserved.', '压缩会将页面图片化，不保留可选文字和链接。'), tx('Already optimized text PDFs can become larger; compare the result.', '已优化的文字型 PDF 可能反而变大，请比较结果。')],
  },
  render: {
    accept: '.pdf,application/pdf', extensions: ['.pdf'], multiple: false, extension: '.zip',
    title: tx('Convert PDF pages to images', '将 PDF 页面转换为图片'),
    subtitle: tx('Render every page as PNG or JPG at your chosen resolution.', '按所选分辨率将每页渲染为 PNG 或 JPG。'),
    dropTitle: tx('Choose a PDF to render', '选择要转换的 PDF'),
    action: tx('Render and download ZIP', '转换并下载 ZIP'),
    description: tx('Page images are generated locally and bundled into a ZIP archive.', '页面图片在本地生成，并打包为 ZIP 文件。'),
    notes: [tx('Higher DPI produces clearer images and larger files.', '更高 DPI 会产生更清晰的图片和更大的文件。'), tx('Large documents need enough available device memory.', '较大的文档需要足够的设备内存。')],
  },
};

function element<T extends Element = HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing interface element: ${id}`);
  return found as unknown as T;
}

const ui = {
  view: element('utilityView'),
  drop: element('utilityDrop'),
  choose: element<HTMLButtonElement>('utilityChoose'),
  chooseText: element('utilityChooseText'),
  files: element<HTMLInputElement>('utilityFiles'),
  fileList: element('utilityFileList'),
  title: element('utilityTitle'),
  subtitle: element('utilitySubtitle'),
  dropTitle: element('utilityDropTitle'),
  dropBody: element('utilityDropBody'),
  accept: element('utilityAccept'),
  options: element('utilityOptions'),
  filenameLabel: element('utilityFilenameLabel'),
  filename: element<HTMLInputElement>('utilityFilename'),
  extension: element('utilityExtension'),
  run: element<HTMLButtonElement>('utilityRun'),
  runText: element('utilityRunText'),
  progressWrap: element('utilityProgressWrap'),
  progress: element<HTMLProgressElement>('utilityProgress'),
  progressText: element('utilityProgressText'),
  status: element('utilityStatus'),
  sideTitle: element('utilitySideTitle'),
  description: element('utilityDescription'),
  notes: element('utilityNotes'),
  localNote: element('utilityLocalNote'),
  eyebrow: element('utilityEyebrow'),
  organizer: element('organizerPreview'),
};

let activeTool: AppTool = 'scan';
let files: File[] = [];
let busy = false;
let nameCustomized = false;
let callbacks: NavigationCallbacks;
const optionValues = new Map<string, string>();
let organizerOrder: number[] = [];
let organizerRotations: Record<number, number> = {};
let organizerUrls: string[] = [];
let organizerRequest = 0;

function config(): ToolConfig {
  return configs[activeTool as UtilityTool];
}

function defaultFilename(): string {
  const base = files[0]?.name.replace(/\.[^.]+$/, '') || local(common.filename);
  const suffix: Partial<Record<UtilityTool, string>> = {
    ocr: '-ocr', 'pdf-word': '', 'word-pdf': '', merge: '-merged', split: '-pages',
    organize: '-organized', compress: '-compressed', render: '-images',
  };
  return activeTool === 'images' ? 'images' : `${base}${suffix[activeTool as UtilityTool] ?? ''}`;
}

function safeFilename(value: string): string {
  const extension = config().extension;
  const cleaned = value.trim().replace(new RegExp(`\\${extension}$`, 'i'), '')
    .replace(/[\\/:*?"<>|%\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '').slice(0, 100).trim();
  return cleaned && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(cleaned) ? cleaned : defaultFilename();
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function updateNavigation(): void {
  document.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach((button) => {
    const selected = button.dataset.tool === activeTool;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-current', selected ? 'page' : 'false');
    button.disabled = busy;
  });
}

function updateRunState(): void {
  let disabled = busy || !files.length;
  if (activeTool === 'merge' && files.length < 2) disabled = true;
  if (activeTool === 'organize' && !organizerOrder.length) disabled = true;
  ui.run.disabled = disabled;
}

function renderFileList(): void {
  ui.fileList.replaceChildren();
  files.forEach((file, index) => {
    const row = document.createElement('div');
    row.className = 'utility-file-row';
    const meta = document.createElement('div');
    meta.className = 'utility-file-meta';
    const name = document.createElement('strong');
    name.textContent = file.name;
    name.title = file.name;
    const size = document.createElement('span');
    size.textContent = formatSize(file.size);
    meta.append(name, size);
    const controls = document.createElement('div');
    controls.className = 'utility-file-controls';
    if (files.length > 1) {
      for (const [direction, label, symbol] of [[-1, common.earlier, '↑'], [1, common.later, '↓']] as const) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = symbol;
        button.title = local(label);
        button.setAttribute('aria-label', `${local(label)}: ${file.name}`);
        button.disabled = busy || (direction < 0 ? index === 0 : index === files.length - 1);
        button.addEventListener('click', () => {
          const destination = index + direction;
          [files[index], files[destination]] = [files[destination], files[index]];
          renderFileList();
        });
        controls.append(button);
      }
    }
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = '×';
    remove.title = local(common.remove);
    remove.setAttribute('aria-label', `${local(common.remove)}: ${file.name}`);
    remove.disabled = busy;
    remove.addEventListener('click', () => {
      files.splice(index, 1);
      if (!files.length) resetFiles();
      else renderFileList();
      updateRunState();
    });
    controls.append(remove);
    row.append(meta, controls);
    ui.fileList.append(row);
  });
  updateRunState();
}

function makeField(label: LocalText, control: HTMLElement): HTMLElement {
  const wrapper = document.createElement('label');
  wrapper.className = 'utility-field';
  const caption = document.createElement('span');
  caption.textContent = local(label);
  wrapper.append(caption, control);
  return wrapper;
}

function makeSelect(id: string, choices: { value: string; label: LocalText }[], fallback: string): HTMLSelectElement {
  const select = document.createElement('select');
  select.id = id;
  choices.forEach((choice) => {
    const option = document.createElement('option');
    option.value = choice.value;
    option.textContent = local(choice.label);
    select.append(option);
  });
  const key = `${activeTool}:${id}`;
  select.value = optionValues.get(key) ?? fallback;
  select.addEventListener('change', () => optionValues.set(key, select.value));
  return select;
}

function selectedOption(id: string, fallback: string): string {
  return optionValues.get(`${activeTool}:${id}`) ?? fallback;
}

function renderOptions(): void {
  ui.options.replaceChildren();
  if (activeTool === 'ocr' || activeTool === 'pdf-word') {
    const id = activeTool === 'ocr' ? 'ocrLanguage' : 'docxOcrLanguage';
    ui.options.append(makeField(common.language, makeSelect(id, [
      { value: 'chi_sim+eng', label: common.bothLanguages },
      { value: 'chi_sim', label: common.chinese },
      { value: 'eng', label: common.english },
    ], 'chi_sim+eng')));
  } else if (activeTool === 'images') {
    ui.options.append(makeField(common.pageSize, makeSelect('directPageSize', [
      { value: 'a4', label: tx('A4 · Auto orientation', 'A4 · 自动方向') },
      { value: 'letter', label: tx('Letter · Auto orientation', 'Letter · 自动方向') },
      { value: 'image', label: tx('Match image dimensions', '匹配图片尺寸') },
    ], 'a4')));
  } else if (activeTool === 'split') {
    const input = document.createElement('textarea');
    input.id = 'pageRangesInput';
    input.rows = 2;
    input.placeholder = '1-3,5,8-10';
    input.value = selectedOption('pageRangesInput', '1-3,5,8-10');
    input.addEventListener('input', () => optionValues.set(`${activeTool}:pageRangesInput`, input.value));
    ui.options.append(makeField(common.pageRanges, input));
  } else if (activeTool === 'compress') {
    ui.options.append(makeField(common.compression, makeSelect('compressionProfile', [
      { value: '160:0.78', label: tx('High quality · 160 DPI', '高质量 · 160 DPI') },
      { value: '130:0.68', label: tx('Balanced · 130 DPI', '均衡 · 130 DPI') },
      { value: '100:0.55', label: tx('Small file · 100 DPI', '较小体积 · 100 DPI') },
    ], '130:0.68')));
  } else if (activeTool === 'render') {
    ui.options.append(
      makeField(common.resolution, makeSelect('renderDpi', [
        { value: '150', label: tx('150 DPI', '150 DPI') },
        { value: '200', label: tx('200 DPI', '200 DPI') },
        { value: '300', label: tx('300 DPI', '300 DPI') },
      ], '150')),
      makeField(common.imageFormat, makeSelect('renderFormat', [
        { value: 'png', label: tx('PNG · lossless', 'PNG · 无损') },
        { value: 'jpeg', label: tx('JPG · smaller', 'JPG · 较小体积') },
      ], 'png')),
    );
  }
}

function renderOrganizer(): void {
  ui.organizer.replaceChildren();
  ui.organizer.hidden = activeTool !== 'organize' || !organizerUrls.length;
  if (ui.organizer.hidden) return;
  organizerOrder.forEach((originalIndex, position) => {
    const card = document.createElement('article');
    card.className = 'organizer-card';
    const imageWrap = document.createElement('div');
    imageWrap.className = 'organizer-image-wrap';
    const image = document.createElement('img');
    image.src = organizerUrls[originalIndex];
    image.alt = `${local(common.page)} ${originalIndex + 1}${local(common.pagesSuffix)}`;
    image.style.transform = `rotate(${organizerRotations[originalIndex] ?? 0}deg)`;
    imageWrap.append(image);
    const label = document.createElement('strong');
    label.textContent = `${local(common.page)} ${originalIndex + 1}${local(common.pagesSuffix)}`;
    const controls = document.createElement('div');
    controls.className = 'organizer-controls';
    const actions: { symbol: string; label: LocalText; disabled?: boolean; run: () => void }[] = [
      { symbol: '↑', label: common.earlier, disabled: position === 0, run: () => {
        [organizerOrder[position - 1], organizerOrder[position]] = [organizerOrder[position], organizerOrder[position - 1]];
      } },
      { symbol: '↓', label: common.later, disabled: position === organizerOrder.length - 1, run: () => {
        [organizerOrder[position + 1], organizerOrder[position]] = [organizerOrder[position], organizerOrder[position + 1]];
      } },
      { symbol: '↻', label: common.rotate, run: () => {
        organizerRotations[originalIndex] = ((organizerRotations[originalIndex] ?? 0) + 90) % 360;
      } },
      { symbol: '×', label: common.remove, run: () => { organizerOrder.splice(position, 1); } },
    ];
    actions.forEach((action) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = action.symbol;
      button.title = local(action.label);
      button.disabled = busy || (action.disabled ?? false);
      button.addEventListener('click', () => {
        action.run();
        renderOrganizer();
        updateRunState();
      });
      controls.append(button);
    });
    card.append(imageWrap, label, controls);
    ui.organizer.append(card);
  });
}

function renderUtility(): void {
  if (activeTool === 'scan') return;
  const current = config();
  ui.eyebrow.textContent = local(common.eyebrow);
  ui.title.textContent = local(current.title);
  ui.subtitle.textContent = local(current.subtitle);
  ui.dropTitle.textContent = local(current.dropTitle);
  ui.dropBody.textContent = local(common.dropBody);
  ui.chooseText.textContent = local(activeTool === 'images' ? common.chooseImages : common.chooseFiles);
  ui.accept.textContent = activeTool === 'images' ? 'JPG · PNG · WEBP' : current.extensions.join(' · ').toUpperCase();
  ui.files.accept = current.accept;
  ui.files.multiple = current.multiple;
  ui.filenameLabel.textContent = local(common.outputName);
  ui.extension.textContent = current.extension;
  if (!nameCustomized) ui.filename.value = defaultFilename();
  ui.runText.textContent = local(current.action);
  ui.sideTitle.textContent = local(common.sideTitle);
  ui.description.textContent = local(current.description);
  ui.localNote.textContent = local(common.localNote);
  ui.notes.replaceChildren();
  current.notes.forEach((note) => {
    const item = document.createElement('li');
    item.textContent = local(note);
    ui.notes.append(item);
  });
  renderFileList();
  renderOptions();
  renderOrganizer();
  updateRunState();
}

function clearPreviews(): void {
  organizerRequest += 1;
  organizerUrls.forEach((url) => URL.revokeObjectURL(url));
  organizerUrls = [];
  organizerOrder = [];
  organizerRotations = {};
}

function resetFiles(): void {
  clearPreviews();
  files = [];
  nameCustomized = false;
  ui.status.textContent = '';
  ui.progressWrap.hidden = true;
  if (activeTool !== 'scan') renderUtility();
}

function setBusy(value: boolean): void {
  busy = value;
  ui.view.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('button,input,select,textarea').forEach((control) => {
    control.disabled = value;
  });
  updateNavigation();
  if (!value) renderUtility();
}

function setProgress(current: number, total: number): void {
  ui.progressWrap.hidden = false;
  ui.progress.max = Math.max(1, total);
  ui.progress.value = current;
  ui.progressText.textContent = `${current} / ${total}`;
}

async function loadOrganizerPreviews(file: File): Promise<void> {
  const request = ++organizerRequest;
  setBusy(true);
  ui.status.className = 'utility-status';
  ui.status.textContent = local(common.loadingPreviews);
  try {
    const { previewPdfFile } = await import('./document-tools');
    const previews = await previewPdfFile(file, 220, setProgress);
    if (request !== organizerRequest || activeTool !== 'organize') return;
    clearPreviews();
    organizerUrls = previews.map((blob) => URL.createObjectURL(blob));
    organizerOrder = previews.map((_, index) => index);
    organizerRotations = {};
    ui.status.textContent = '';
  } catch (error) {
    ui.status.className = 'utility-status error';
    ui.status.textContent = `${local(common.failed)} ${error instanceof Error ? error.message : ''}`;
  } finally {
    setBusy(false);
  }
}

function acceptFiles(fileList: FileList | File[]): void {
  if (busy || activeTool === 'scan') return;
  const current = config();
  let incoming = Array.from(fileList);
  if (current.extensions.length) {
    const valid = incoming.filter((file) => current.extensions.some((extension) => file.name.toLowerCase().endsWith(extension)));
    if (valid.length !== incoming.length) callbacks.notify(local(common.wrongType));
    incoming = valid;
  } else {
    const valid = incoming.filter((file) => file.type.startsWith('image/') || /\.(jpe?g|png|webp|bmp|gif|tiff?)$/i.test(file.name));
    if (valid.length !== incoming.length) callbacks.notify(local(common.wrongType));
    incoming = valid;
  }
  if (!incoming.length) return;
  if (!current.multiple) {
    if (files.length || incoming.length > 1) callbacks.notify(local(common.oneFile));
    incoming = incoming.slice(0, 1);
    clearPreviews();
    files = incoming;
  } else {
    files.push(...incoming);
  }
  if (!nameCustomized) ui.filename.value = defaultFilename();
  ui.status.textContent = '';
  renderUtility();
  if (activeTool === 'organize' && files[0]) void loadOrganizerPreviews(files[0]);
}

function download(bytes: Uint8Array, type: string): void {
  const blob = new Blob([bytes.slice().buffer as ArrayBuffer], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${safeFilename(ui.filename.value)}${config().extension}`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 3000);
}

async function downloadArchive(entries: Record<string, Uint8Array>): Promise<void> {
  const { zipSync } = await import('fflate');
  download(zipSync(entries, { level: 0 }), 'application/zip');
}

async function runTool(): Promise<void> {
  if (busy || activeTool === 'scan') return;
  if (!files.length) {
    callbacks.notify(local(common.noFiles));
    return;
  }
  if (activeTool === 'merge' && files.length < 2) {
    callbacks.notify(local(common.twoPdfs));
    return;
  }
  setBusy(true);
  ui.status.className = 'utility-status';
  ui.status.textContent = local(common.working);
  ui.progress.value = 0;
  ui.progressWrap.hidden = false;
  ui.progressText.textContent = '';
  ui.filename.value = safeFilename(ui.filename.value);
  try {
    const tools = await import('./document-tools');
    const language = selectedOption(activeTool === 'ocr' ? 'ocrLanguage' : 'docxOcrLanguage', 'chi_sim+eng') as OcrLanguage;
    if (activeTool === 'images') {
      const bytes = await tools.imagesToPdfFile(files, selectedOption('directPageSize', 'a4') as DirectImagePageSize, setProgress);
      download(bytes, 'application/pdf');
    } else if (activeTool === 'ocr') {
      download(await tools.ocrPdfFile(files[0], language, setProgress), 'application/pdf');
    } else if (activeTool === 'pdf-word') {
      download(await tools.pdfToDocxFile(files[0], language, setProgress), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    } else if (activeTool === 'word-pdf') {
      download(await tools.docxToPdfFile(files[0], setProgress), 'application/pdf');
    } else if (activeTool === 'merge') {
      download(await tools.mergePdfFiles(files), 'application/pdf');
    } else if (activeTool === 'split') {
      const { PDFDocument } = await import('pdf-lib');
      const source = await PDFDocument.load(await files[0].arrayBuffer());
      const ranges = tools.parsePageRanges(selectedOption('pageRangesInput', '1-3,5,8-10'), source.getPageCount());
      const outputs = await tools.splitPdfFile(files[0], ranges, setProgress);
      const entries: Record<string, Uint8Array> = {};
      outputs.forEach((bytes, index) => { entries[`${files[0].name.replace(/\.pdf$/i, '')}-part-${index + 1}.pdf`] = bytes; });
      await downloadArchive(entries);
    } else if (activeTool === 'organize') {
      download(await tools.organizePdfFile(files[0], organizerOrder, organizerRotations, setProgress), 'application/pdf');
    } else if (activeTool === 'compress') {
      const [dpi, quality] = selectedOption('compressionProfile', '130:0.68').split(':').map(Number);
      download(await tools.compressPdfFile(files[0], dpi, quality, setProgress), 'application/pdf');
    } else if (activeTool === 'render') {
      const format = selectedOption('renderFormat', 'png') as 'png' | 'jpeg';
      const images = await tools.renderPdfFile(files[0], Number(selectedOption('renderDpi', '150')), format, setProgress);
      const entries: Record<string, Uint8Array> = {};
      for (let index = 0; index < images.length; index += 1) {
        entries[`page-${String(index + 1).padStart(3, '0')}.${format === 'png' ? 'png' : 'jpg'}`] = new Uint8Array(await images[index].arrayBuffer());
      }
      await downloadArchive(entries);
    }
    ui.status.className = 'utility-status success';
    ui.status.textContent = local(common.ready);
    callbacks.notify(local(common.ready));
  } catch (error) {
    console.error('Document tool failed:', error);
    ui.status.className = 'utility-status error';
    ui.status.textContent = `${local(common.failed)} ${error instanceof Error ? error.message : ''}`;
  } finally {
    setBusy(false);
  }
}

export function showTool(tool: AppTool): void {
  if (busy) return;
  if (tool === activeTool) return;
  activeTool = tool;
  resetFiles();
  updateNavigation();
  if (tool === 'scan') callbacks.showScan();
  else {
    callbacks.showUtility();
    renderUtility();
  }
}

export function refreshToolLanguage(): void {
  if (activeTool !== 'scan') renderUtility();
}

export function setupToolNavigation(handlers: NavigationCallbacks): void {
  callbacks = handlers;
  document.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach((button) => {
    button.addEventListener('click', () => showTool(button.dataset.tool as AppTool));
  });
  ui.choose.addEventListener('click', (event) => {
    event.stopPropagation();
    if (!busy) ui.files.click();
  });
  ui.drop.addEventListener('click', () => { if (!busy) ui.files.click(); });
  ui.drop.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (!busy) ui.files.click();
    }
  });
  ui.drop.addEventListener('dragover', (event) => {
    event.preventDefault();
    ui.drop.classList.add('drag-over');
  });
  ui.drop.addEventListener('dragleave', () => ui.drop.classList.remove('drag-over'));
  ui.drop.addEventListener('drop', (event) => {
    event.preventDefault();
    ui.drop.classList.remove('drag-over');
    if (event.dataTransfer?.files) acceptFiles(event.dataTransfer.files);
  });
  ui.files.addEventListener('change', () => {
    if (ui.files.files) acceptFiles(ui.files.files);
    ui.files.value = '';
  });
  ui.filename.addEventListener('input', () => { nameCustomized = true; });
  ui.run.addEventListener('click', () => void runTool());
  updateNavigation();
}
