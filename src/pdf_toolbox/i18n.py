from __future__ import annotations

from PySide6.QtWidgets import (
    QAbstractButton, QComboBox, QGroupBox, QLabel, QLineEdit, QListWidget,
    QPlainTextEdit, QTabWidget, QWidget,
)

_ACTIVE_LANGUAGE: str | None = None

ZH_CN = {
    "Photo Scanner": "照片扫描",
    "Images to PDF": "图片转 PDF",
    "OCR PDF": "PDF OCR 识别",
    "PDF to Word": "PDF 转 Word",
    "Word to PDF": "Word 转 PDF",
    "Merge / Split": "合并 / 拆分",
    "Page Organizer": "页面整理",
    "Compress PDF": "压缩 PDF",
    "PDF to Images": "PDF 转图片",
    "Settings": "设置",
    "Settings & Environment": "设置与运行环境",
    "Ready — files are processed locally on this computer.": "就绪 — 所有文件均在此电脑本地处理。",
    "Open output folder": "打开输出文件夹",
    "Show log": "显示日志",
    "Hide log": "隐藏日志",
    "Cancel": "取消",
    "Cancelling…": "正在取消…",
    "Task in progress": "任务正在进行",
    "Wait for the current task or cancel it first.": "请等待当前任务完成，或先取消任务。",
    "Task failed": "任务失败",
    "Task cancelled — no output was published.": "任务已取消 — 未生成输出文件。",
    "Cancelling; waiting for the current engine call to stop…": "正在取消；等待当前处理引擎停止…",
    "Cancel the current task and wait for it to stop before closing PDF Toolbox.": "关闭 PDF Toolbox 前，请先取消当前任务并等待其停止。",
    "Add files": "添加文件",
    "Remove": "移除",
    "Clear": "清空",
    "Move up": "上移",
    "Move down": "下移",
    "Select files": "选择文件",
    "Select input file": "选择输入文件",
    "Select output folder": "选择输出文件夹",
    "Select output file": "选择输出文件",
    "Select a file…": "选择一个文件…",
    "Browse…": "浏览…",
    "Choose folder…": "选择文件夹…",
    "Images (*.jpg *.jpeg *.png *.tif *.tiff *.bmp *.webp)": "图片 (*.jpg *.jpeg *.png *.tif *.tiff *.bmp *.webp)",
    "PDF files (*.pdf)": "PDF 文件 (*.pdf)",
    "Word documents (*.doc *.docx)": "Word 文档 (*.doc *.docx)",
    "Document Photo Scanner": "文档照片扫描",
    "Add and arrange photos on the left. Correct and preview on the right. Export below the preview.": "在左侧添加并整理照片，在右侧校正和预览，在预览下方导出。",
    "1. Add and arrange photos (or drag them here)": "1. 添加并整理照片（也可拖入此处）",
    "Correct and preview the selected page": "校正并预览所选页面",
    "Rotate left": "向左旋转",
    "Rotate right": "向右旋转",
    "Detect edges": "检测边缘",
    "Enhancement": "图像增强",
    "Enhanced color": "增强彩色",
    "Original color": "原始彩色",
    "Grayscale": "灰度",
    "Black & white": "黑白",
    "Black && white": "黑白",
    "Enhanced color flattens shadows, whitens paper, preserves color, and sharpens handwriting.": "增强彩色可消除阴影、增白纸张、保留颜色并锐化手写笔画。",
    "Automatically straighten text after perspective correction": "透视矫正后自动拉正文字",
    "Text sharpness": "文字锐度",
    "Standard": "标准",
    "Strong": "强",
    "Strong (handwriting)": "强（手写）",
    "Strong enhances faint handwriting and stroke edges. Standard is gentler for photos and illustrations.": "强锐化可增强较淡的手写内容和笔画边缘；标准模式更适合照片与插图。",
    "Drag the four corner handles to match the document edges.": "拖动四个角点，使其贴合文档边缘。",
    "Corrected preview": "校正后预览",
    "Export PDF": "导出 PDF",
    "Searchable PDF (Chinese + English OCR)": "可搜索 PDF（中英文 OCR）",
    "File name": "文件名",
    "Enter a PDF file name": "输入 PDF 文件名",
    "Save to": "保存到",
    "Create PDF from Photos": "从照片创建 PDF",
    "Add a photo on the left, then adjust its edges here.": "先在左侧添加照片，然后在这里调整边缘。",
    "Edges detected. Drag handles if adjustment is needed.": "已检测到边缘。如需微调，请拖动角点。",
    "Automatic edges were uncertain. Adjust the four handles manually.": "自动检测的边缘不够可靠，请手动调整四个角点。",
    "Image could not be opened": "无法打开图片",
    "No photos": "没有照片",
    "Add at least one document photo.": "请至少添加一张文档照片。",
    "Invalid output": "输出设置无效",
    "Processing photo {index} of {total}": "正在处理第 {index} 张照片，共 {total} 张",
    "Building PDF": "正在生成 PDF",
    "Recognizing Chinese and English text": "正在识别中英文文字",
    "Completed": "已完成",
    "Created {count}-page PDF": "已创建 {count} 页 PDF",
    "Create scanned PDF": "创建扫描 PDF",
    "Add photos using the panel on the left": "请使用左侧面板添加照片",
    "Input file": "输入文件",
    "Output file": "输出文件",
    "Start": "开始",
    "Input required": "需要输入文件",
    "Select an input file first.": "请先选择输入文件。",
    "Output required": "需要输出文件",
    "Select an output file.": "请选择输出文件。",
    "Processing": "正在处理",
    "Created {name}": "已创建 {name}",
    "Add a searchable Chinese and/or English text layer to a scanned PDF. Existing text pages are skipped.": "为扫描版 PDF 添加可搜索的中英文文字层；已有文字的页面会跳过。",
    "OCR languages": "OCR 识别语言",
    "Chinese + English": "中文 + 英文",
    "English": "英语",
    "Simplified Chinese": "简体中文",
    "Rotate pages automatically": "自动旋转页面",
    "Deskew pages": "校正页面倾斜",
    "Create an editable DOCX using Microsoft Word PDF Reflow. Scanned PDFs are OCR-processed first. Complex layouts, tables, formulas, and scans may require manual correction.": "使用 Microsoft Word PDF Reflow 创建可编辑 DOCX。扫描版 PDF 会先进行 OCR；复杂排版、表格、公式和扫描件可能需要手动修正。",
    "Convert DOC or DOCX to PDF locally with Microsoft Word. Your source document is opened read-only.": "使用本机 Microsoft Word 将 DOC 或 DOCX 转为 PDF；源文档以只读方式打开。",
    "Convert DOC or DOCX to PDF locally with Microsoft Word. Your source document is opened read-only": "使用本机 Microsoft Word 将 DOC 或 DOCX 转为 PDF；源文档以只读方式打开。",
    "Reduce PDF size with Ghostscript. Strong compression can reduce image quality and may not shrink every file.": "使用 Ghostscript 减小 PDF 体积。高压缩可能降低图片质量，且不保证每个文件都能缩小。",
    "Compression profile": "压缩等级",
    "Balanced (150 dpi)": "均衡（150 dpi）",
    "High quality (300 dpi)": "高质量（300 dpi）",
    "Smallest size (72 dpi)": "最小体积（72 dpi）",
    "Combine multiple images in the displayed order. Use Move up/down to arrange pages.": "按显示顺序合并多张图片；使用上移/下移调整页面顺序。",
    "Images": "图片",
    "Add searchable Chinese + English text with OCR": "通过 OCR 添加可搜索的中英文文字",
    "Create PDF": "创建 PDF",
    "No images": "没有图片",
    "Add at least one image.": "请至少添加一张图片。",
    "Combining images": "正在合并图片",
    "Running OCR": "正在运行 OCR",
    "Render every PDF page as a PNG or JPG image.": "将 PDF 的每一页渲染为 PNG 或 JPG 图片。",
    "Format": "格式",
    "Output folder (a unique subfolder will be created)": "输出文件夹（将创建一个不重复的子文件夹）",
    "Convert pages": "转换页面",
    "Select a PDF first.": "请先选择一个 PDF。",
    "Rendering pages": "正在渲染页面",
    "Created {count} images in {folder}": "已在 {folder} 中创建 {count} 张图片",
    "PDF to images": "PDF 转图片",
    "Merge or Split PDF": "合并或拆分 PDF",
    "PDFs in merge order": "按合并顺序排列的 PDF",
    "Merge PDFs": "合并 PDF",
    "Merge": "合并",
    "Page groups separated by semicolons; leave blank for one file per page.": "用分号分隔页面组；留空则每页生成一个文件。",
    "Example: 1-3;4-6;7,9": "示例：1-3;4-6;7,9",
    "Split PDF": "拆分 PDF",
    "Split": "拆分",
    "No PDFs": "没有 PDF",
    "Add at least one PDF.": "请至少添加一个 PDF。",
    "Merging PDFs": "正在合并 PDF",
    "Merged {count} PDFs": "已合并 {count} 个 PDF",
    "Splitting PDF": "正在拆分 PDF",
    "Created {count} PDF files": "已创建 {count} 个 PDF 文件",
    "PDF Page Organizer": "PDF 页面整理",
    "Rotate, reorder, delete, or keep selected pages. The source PDF is never modified.": "旋转、重排、删除或仅保留所选页面；不会修改源 PDF。",
    "Load pages": "加载页面",
    "Rotate 90°": "旋转 90°",
    "Delete selected": "删除所选",
    "Keep only selected": "仅保留所选",
    "Reset": "重置",
    "Save organized PDF": "保存整理后的 PDF",
    "Could not load PDF": "无法加载 PDF",
    "Page {number}": "第 {number} 页",
    "Page {number} — rotated {rotation}°": "第 {number} 页 — 已旋转 {rotation}°",
    "No selection": "未选择页面",
    "Select one or more pages to keep.": "请选择要保留的一个或多个页面。",
    "No pages": "没有页面",
    "Load a PDF and keep at least one page.": "请加载 PDF，并至少保留一页。",
    "Writing organized PDF": "正在写入整理后的 PDF",
    "Saved {count} pages": "已保存 {count} 页",
    "Organize PDF": "整理 PDF",
    "Converting with the available Word/OCR engine": "正在使用可用的 Word/OCR 引擎转换",
    "Exporting PDF with Microsoft Word": "正在使用 Microsoft Word 导出 PDF",
    "Document conversion": "文档转换",
    "Default save folder": "默认保存文件夹",
    "Interface language": "界面语言",
    "Save Settings": "保存设置",
    "Restore Defaults": "恢复默认值",
    "Current interface language: English": "当前界面语言：English",
    "Current interface language: Simplified Chinese": "当前界面语言：简体中文",
    "Default output folder: {folder}": "默认输出文件夹：{folder}",
    "Installed OCR languages: {languages}": "已安装 OCR 语言：{languages}",
    "Save settings and use this folder for future default outputs. Existing custom paths are preserved.": "保存设置，并将此文件夹用于后续默认输出；已自定义的当前路径不会被覆盖。",
    "Settings saved": "设置已保存",
    "Restart required": "需要重启",
    "Restart PDF Toolbox to apply the interface language.": "重新启动 PDF Toolbox 后即可应用所选界面语言。",
    "The default save folder has been updated.": "默认保存文件夹已更新。",
    "Defaults restored": "已恢复默认值",
    "Defaults loaded. Click Save Settings to apply.": "默认值已填入。点击“保存设置”后生效。",
    "Could not save settings": "无法保存设置",
    "Available local engines": "可用的本地处理引擎",
    "Not found": "未找到",
    "Enter a PDF file name.": "请输入 PDF 文件名。",
    "The file name contains characters that Windows does not allow.": "文件名包含 Windows 不允许的字符。",
    "The file name cannot end with a dot.": "文件名不能以句点结尾。",
    "Enter a file name only, not a path.": "请只输入文件名，不要输入路径。",
    "The output file name must use the .pdf extension.": "输出文件名必须使用 .pdf 扩展名。",
    "Enter a valid PDF file name.": "请输入有效的 PDF 文件名。",
    "This file name is reserved by Windows.": "此文件名是 Windows 保留名称。",
    "Choose an existing output folder.": "请选择一个已存在的输出文件夹。",
    "Unsupported interface language.": "不支持所选界面语言。",
    "Choose a default save folder.": "请选择默认保存文件夹。",
    "The default save location must be a folder.": "默认保存位置必须是文件夹。",
    "Settings could not be saved on this computer.": "无法在此电脑上保存设置。",
    "Output (*.pdf)": "输出 (*.pdf)",
    "Output (*.docx)": "输出 (*.docx)",
    "Files are processed locally. No document upload or telemetry is used.": "文件均在本地处理，不上传文档，也不使用遥测。",
}


def initialize_language(language: str | None = None) -> str:
    global _ACTIVE_LANGUAGE
    if language is None:
        from pdf_toolbox.settings import AppSettings
        language = AppSettings().language
    _ACTIVE_LANGUAGE = language if language in {"en", "zh_CN"} else "en"
    return _ACTIVE_LANGUAGE


def tr(text: str) -> str:
    if _ACTIVE_LANGUAGE is None:
        initialize_language()
    if _ACTIVE_LANGUAGE == "zh_CN":
        return ZH_CN.get(text, text)
    return text


def translate_ui(root: QWidget) -> None:
    """Translate static widgets after construction; dynamic text uses tr directly."""
    for widget in [root, *root.findChildren(QWidget)]:
        if isinstance(widget, (QAbstractButton, QLabel)):
            widget.setText(tr(widget.text()))
        if isinstance(widget, QGroupBox):
            widget.setTitle(tr(widget.title()))
        if isinstance(widget, QLineEdit):
            widget.setPlaceholderText(tr(widget.placeholderText()))
        if isinstance(widget, QPlainTextEdit):
            widget.setPlaceholderText(tr(widget.placeholderText()))
        if widget.toolTip():
            widget.setToolTip(tr(widget.toolTip()))
        if isinstance(widget, QComboBox):
            for index in range(widget.count()):
                widget.setItemText(index, tr(widget.itemText(index)))
        if isinstance(widget, QListWidget):
            for index in range(widget.count()):
                widget.item(index).setText(tr(widget.item(index).text()))
        if isinstance(widget, QTabWidget):
            for index in range(widget.count()):
                widget.setTabText(index, tr(widget.tabText(index)))
