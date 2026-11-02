from pathlib import Path
import sys

import cv2
import numpy as np
from PySide6.QtCore import QTimer
from PySide6.QtWidgets import QApplication

from pdf_toolbox.core.scan import save_bgr
from pdf_toolbox.ui.main_window import MainWindow

root = Path(__file__).resolve().parents[1]
sample = root / "work" / "ui-scan-sample.png"
image = np.full((900, 1200, 3), 65, dtype=np.uint8)
corners = np.array([[240, 110], [1010, 190], [920, 790], [130, 670]], dtype=np.float32)
cv2.fillConvexPoly(image, corners.astype(np.int32), (245, 245, 245))
cv2.polylines(image, [corners.astype(np.int32)], True, (15, 15, 15), 5)
for y in range(300, 600, 55):
    cv2.line(image, (300, y), (800, y + 20), (40, 40, 40), 8)
horizontal = np.linspace(0.48, 1.0, image.shape[1], dtype=np.float32)
vertical = np.linspace(0.80, 1.0, image.shape[0], dtype=np.float32)[:, None]
image = np.clip(image.astype(np.float32) * (horizontal[None, :] * vertical)[..., None], 0, 255).astype(np.uint8)
save_bgr(sample, image)

application = QApplication(sys.argv)
application.setApplicationName("PDF Toolbox")
window = MainWindow()
window.show()
scanner = window.stack.widget(0)
QTimer.singleShot(500, lambda: scanner.files.add_paths([str(sample)]))
print(f"Diagnostic GUI PID: {__import__('os').getpid()}", flush=True)
raise SystemExit(application.exec())
