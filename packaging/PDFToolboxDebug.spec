from pathlib import Path

from PyInstaller.utils.hooks import collect_submodules

project = Path(SPECPATH).parent
resources = project / "resources"

a = Analysis(
    [str(project / "src" / "pdf_toolbox" / "app.py")],
    pathex=[str(project / "src")],
    binaries=[],
    datas=[(str(resources), "resources")],
    hiddenimports=["pythoncom", "win32com.client", "win32timezone"] + collect_submodules("pdf2docx"),
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["tkinter", "pytest"],
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="PDF Toolbox Debug",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,
    disable_windowed_traceback=False,
    icon=str(resources / "pdf_toolbox.ico"),
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    name="PDF Toolbox Debug",
)
