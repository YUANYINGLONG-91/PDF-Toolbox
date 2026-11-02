from __future__ import annotations

import numpy as np
from PySide6.QtCore import QPointF, QRectF, QSize, Qt, Signal
from PySide6.QtGui import QColor, QPainter, QPen, QPixmap, QPolygonF
from PySide6.QtWidgets import QWidget

from pdf_toolbox.i18n import tr as _


class ScanCanvas(QWidget):
    cornersChanged = Signal(object)

    def __init__(self):
        super().__init__()
        self.pixmap = QPixmap()
        self.corners = np.zeros((4, 2), dtype=np.float32)
        self.active_handle = -1
        self.setMouseTracking(True)
        self.setMinimumSize(360, 360)

    def sizeHint(self):
        return QSize(620, 520)

    def set_document(self, pixmap: QPixmap, corners: np.ndarray):
        self.pixmap = pixmap
        self.corners = np.asarray(corners, dtype=np.float32).copy()
        self.active_handle = -1
        self.update()

    def clear_document(self):
        self.pixmap = QPixmap()
        self.corners = np.zeros((4, 2), dtype=np.float32)
        self.active_handle = -1
        self.update()

    def _rect(self) -> QRectF:
        if self.pixmap.isNull():
            return QRectF()
        available_width, available_height = max(1, self.width() - 24), max(1, self.height() - 24)
        scale = min(available_width / self.pixmap.width(), available_height / self.pixmap.height())
        width, height = self.pixmap.width() * scale, self.pixmap.height() * scale
        return QRectF((self.width() - width) / 2, (self.height() - height) / 2, width, height)

    def _to_widget(self, point) -> QPointF:
        rect = self._rect()
        scale = rect.width() / self.pixmap.width()
        return rect.topLeft() + QPointF(float(point[0]), float(point[1])) * scale

    def _to_image(self, point: QPointF) -> np.ndarray:
        rect = self._rect()
        scale = rect.width() / self.pixmap.width()
        local = (point - rect.topLeft()) / scale
        return np.array([
            np.clip(local.x(), 0, self.pixmap.width() - 1),
            np.clip(local.y(), 0, self.pixmap.height() - 1),
        ], dtype=np.float32)

    def paintEvent(self, event):
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        painter.fillRect(self.rect(), QColor(23, 33, 49))
        painter.setPen(QPen(QColor(44, 58, 77), 1))
        painter.drawRect(self.rect().adjusted(0, 0, -1, -1))
        if self.pixmap.isNull():
            center = self.rect().center()
            document = QRectF(center.x() - 29, center.y() - 75, 58, 72)
            painter.setPen(QPen(QColor(83, 108, 139), 1.5))
            painter.setBrush(QColor(29, 43, 63))
            painter.drawRoundedRect(document, 5, 5)
            painter.setPen(QPen(QColor(83, 108, 139), 2))
            for offset in (20, 32, 44):
                painter.drawLine(
                    QPointF(document.left() + 12, document.top() + offset),
                    QPointF(document.right() - 12, document.top() + offset),
                )
            painter.setPen(QColor(183, 197, 214))
            painter.drawText(self.rect().adjusted(16, 52, -16, 0), Qt.AlignmentFlag.AlignCenter, _("Add photos using the panel on the left"))
            return
        rect = self._rect()
        painter.setRenderHint(QPainter.RenderHint.SmoothPixmapTransform)
        painter.drawPixmap(rect, self.pixmap, QRectF(self.pixmap.rect()))
        polygon = QPolygonF([self._to_widget(point) for point in self.corners])
        painter.setPen(QPen(QColor(91, 141, 239), 2.5))
        painter.setBrush(QColor(47, 111, 237, 32))
        painter.drawPolygon(polygon)
        painter.setPen(QPen(QColor(47, 111, 237), 2))
        painter.setBrush(QColor(255, 255, 255))
        for point in polygon:
            painter.drawEllipse(point, 8, 8)

    def mousePressEvent(self, event):
        if self.pixmap.isNull():
            return
        position = event.position()
        distances = [(point - position).manhattanLength() for point in [self._to_widget(p) for p in self.corners]]
        index = int(np.argmin(distances))
        if distances[index] < 28:
            self.active_handle = index
            event.accept()

    def mouseMoveEvent(self, event):
        if self.active_handle < 0:
            return
        self.corners[self.active_handle] = self._to_image(event.position())
        self.cornersChanged.emit(self.corners.copy())
        self.update()
        event.accept()

    def mouseReleaseEvent(self, event):
        self.active_handle = -1
        event.accept()
