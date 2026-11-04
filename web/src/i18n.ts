const en = {
  brandTag: 'DOCUMENT TOOLS',
  navScan: 'Photo scanner',
  navImages: 'Images to PDF',
  navOcr: 'OCR PDF',
  navPdfWord: 'PDF to Word',
  navWordPdf: 'Word to PDF',
  navMerge: 'Merge',
  navSplit: 'Split',
  navOrganize: 'Organize',
  navCompress: 'Compress',
  navRender: 'PDF to images',
  private: 'Processed in this browser',
  heroTitle: 'Photo scanner',
  heroBody: 'Crop, clean, and sharpen document photos, then export a PDF.',
  dropTitle: 'Drop your document photos',
  dropBody: 'or choose images from your device',
  chooseImages: 'Choose images',
  fileTypes: 'JPG, PNG or WEBP · Multiple images welcome',
  workspaceTitle: 'Scan workspace',
  addPages: 'Add pages',
  startOver: 'Start over',
  pages: 'Pages',
  reorderHint: 'Drag to reorder, or use the arrows.',
  addMore: 'Add more pages',
  crop: 'Crop',
  result: 'Enhanced scan',
  cropHelp: 'Drag the four corner handles to match the document edges.',
  rotateLeft: 'Rotate left',
  rotateRight: 'Rotate right',
  autoCrop: 'Auto crop',
  resetCrop: 'Reset crop',
  enhanceTitle: 'Enhancement',
  enhanceHint: 'Clean the paper background and sharpen text.',
  scanStyle: 'Scan style',
  color: 'Color',
  grayscale: 'Gray',
  bw: 'B&W',
  detailBoost: 'Sharpening',
  natural: 'Natural',
  crisp: 'Crisp',
  exportPdf: 'Export PDF',
  filename: 'File name',
  pageSize: 'Page size',
  a4auto: 'A4 · Auto orientation',
  letterAuto: 'Letter · Auto orientation',
  matchImage: 'Match image',
  downloadPdf: 'Download PDF',
  footerTag: 'Document tools for desktop and mobile',
  processing: 'Processing…',
  loadingEngine: 'Loading scan engine…',
  detecting: 'Finding document edges…',
  edgesFound: 'Edges found · adjust if needed',
  manualCrop: 'Manual crop · drag the corners',
  fullPageCrop: 'Full page · auto crop uncertain',
  page: 'Page',
  of: 'of',
  moveUp: 'Move page earlier',
  moveDown: 'Move page later',
  pageOptions: 'Select page',
  invalidImages: 'Please choose JPG, PNG, WEBP, or another browser-supported image.',
  importError: 'Some images could not be opened. Try exporting them as JPG or PNG.',
  importSuccess: 'pages added.',
  importSuccessOne: 'page added.',
  detectFailed: 'No clear edges found. Drag the corner handles to crop manually.',
  engineFailed: 'The scan engine could not start. Reload to try enhancement again.',
  deleteConfirm: 'Delete this page from the scan?',
  startOverConfirm: 'Start over and remove all pages? Your original images will not be changed.',
  preparing: 'Preparing page',
  creatingPdf: 'Finishing your PDF…',
  downloadReady: 'Your PDF is ready.',
  exportError: 'Could not create the PDF. Try fewer or smaller images, then export again.',
  emptyFilename: 'Scanned document',
  imageAlt: 'Selected document page',
  resultAlt: 'Enhanced document preview',
};

const zh: Record<keyof typeof en, string> = {
  brandTag: '文档工具箱',
  navScan: '照片扫描',
  navImages: '图片合并 PDF',
  navOcr: 'OCR 识别 PDF',
  navPdfWord: 'PDF 转 Word',
  navWordPdf: 'Word 转 PDF',
  navMerge: '合并 PDF',
  navSplit: '拆分 PDF',
  navOrganize: '页面管理',
  navCompress: '压缩 PDF',
  navRender: 'PDF 转图片',
  private: '在浏览器中处理',
  heroTitle: '照片扫描',
  heroBody: '裁剪、净化并锐化文档照片，然后导出 PDF。',
  dropTitle: '将文档照片拖到这里',
  dropBody: '或从设备中选择图片',
  chooseImages: '选择图片',
  fileTypes: '支持 JPG、PNG 或 WEBP · 可一次选择多张',
  workspaceTitle: '扫描工作区',
  addPages: '添加页面',
  startOver: '重新开始',
  pages: '页面',
  reorderHint: '拖动排序，或使用箭头调整。',
  addMore: '添加更多页面',
  crop: '裁剪',
  result: '增强效果',
  cropHelp: '拖动四个角点，使其与文档边缘对齐。',
  rotateLeft: '向左旋转',
  rotateRight: '向右旋转',
  autoCrop: '自动裁剪',
  resetCrop: '重置裁剪',
  enhanceTitle: '图像增强',
  enhanceHint: '净化纸张背景并锐化文字。',
  scanStyle: '扫描效果',
  color: '彩色',
  grayscale: '灰度',
  bw: '黑白',
  detailBoost: '锐化',
  natural: '自然',
  crisp: '清晰',
  exportPdf: '导出 PDF',
  filename: '文件名',
  pageSize: '页面大小',
  a4auto: 'A4 · 自动方向',
  letterAuto: 'Letter · 自动方向',
  matchImage: '匹配图片',
  downloadPdf: '下载 PDF',
  footerTag: '适用于电脑和手机的文档工具',
  processing: '正在处理…',
  loadingEngine: '正在加载扫描引擎…',
  detecting: '正在查找文档边缘…',
  edgesFound: '已找到边缘 · 可继续微调',
  manualCrop: '手动裁剪 · 拖动角点',
  fullPageCrop: '使用完整页面 · 自动裁剪不确定',
  page: '第',
  of: '页，共',
  moveUp: '向前移动页面',
  moveDown: '向后移动页面',
  pageOptions: '选择页面',
  invalidImages: '请选择 JPG、PNG、WEBP 或浏览器支持的其他图片。',
  importError: '部分图片无法打开。请尝试将其转换为 JPG 或 PNG。',
  importSuccess: '页已添加。',
  importSuccessOne: '页已添加。',
  detectFailed: '未找到清晰边缘。请拖动角点手动裁剪。',
  engineFailed: '扫描引擎无法启动。请刷新后重试增强功能。',
  deleteConfirm: '从扫描文档中删除此页？',
  startOverConfirm: '重新开始并移除所有页面？原始图片不会被更改。',
  preparing: '正在处理第',
  creatingPdf: '正在完成 PDF…',
  downloadReady: 'PDF 已准备好。',
  exportError: '无法创建 PDF。请减少页面或使用较小的图片后重试。',
  emptyFilename: '扫描文档',
  imageAlt: '所选文档页面',
  resultAlt: '增强后的文档预览',
};

export type Language = 'en' | 'zh';
export type TranslationKey = keyof typeof en;
let current: Language = 'en';

export function setLanguage(language: Language): void {
  current = language;
  const strings = language === 'zh' ? zh : en;
  document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
  document.title = language === 'zh' ? 'PDF Toolbox — 文档工具箱' : 'PDF Toolbox — Document tools';
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((element) => {
    const key = element.dataset.i18n as TranslationKey;
    if (key in strings) element.textContent = strings[key];
  });
  const label = document.querySelector<HTMLElement>('#languageLabel');
  const button = document.querySelector<HTMLButtonElement>('#languageButton');
  if (label) label.textContent = language === 'zh' ? 'English' : '简体中文';
  if (button) button.setAttribute('aria-label', language === 'zh' ? 'Switch to English' : '切换到简体中文');
  const dropzone = document.querySelector<HTMLElement>('#dropzone');
  dropzone?.setAttribute('aria-label', language === 'zh' ? '选择文档图片或将图片拖到这里' : 'Choose document images or drop them here');
  const cropImage = document.querySelector<HTMLImageElement>('#cropImage');
  const resultImage = document.querySelector<HTMLImageElement>('#resultImage');
  if (cropImage) cropImage.alt = strings.imageAlt;
  if (resultImage) resultImage.alt = strings.resultAlt;
}

export function getLanguage(): Language {
  return current;
}

export function t(key: TranslationKey): string {
  return (current === 'zh' ? zh : en)[key];
}
