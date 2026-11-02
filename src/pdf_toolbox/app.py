from __future__ import annotations

import multiprocessing
import sys
from pathlib import Path

from PySide6.QtGui import QIcon
from PySide6.QtWidgets import QApplication

from pdf_toolbox.i18n import initialize_language


def main() -> int:
    multiprocessing.freeze_support()
    application = QApplication(sys.argv)
    application.setApplicationName("PDF Toolbox")
    application.setOrganizationName("LocalPDF")
    initialize_language()
    bundle_dir = Path(getattr(sys, "_MEIPASS", Path(sys.executable).parent)) if getattr(sys, "frozen", False) else Path(__file__).resolve().parents[2]
    icon = bundle_dir / "resources" / "pdf_toolbox.ico"
    if icon.is_file():
        application.setWindowIcon(QIcon(str(icon)))
    from pdf_toolbox.ui.main_window import MainWindow
    window = MainWindow()
    window.show()
    return application.exec()


if __name__ == "__main__":
    raise SystemExit(main())
