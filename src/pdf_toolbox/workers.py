from __future__ import annotations

import threading
import traceback
from typing import Callable

from PySide6.QtCore import QThread, Signal

from pdf_toolbox.errors import CancelledError
from pdf_toolbox.models import JobResult


class JobWorker(QThread):
    progressed = Signal(int, str)
    logged = Signal(str)
    succeeded = Signal(object)
    failed = Signal(str)
    cancelled = Signal()

    def __init__(self, task: Callable, parent=None):
        super().__init__(parent)
        self.task = task
        self.cancel_event = threading.Event()

    def cancel(self) -> None:
        self.cancel_event.set()

    def run(self) -> None:
        try:
            result = self.task(self.progressed.emit, self.logged.emit, self.cancel_event)
            if self.cancel_event.is_set():
                raise CancelledError("Operation cancelled.")
            if not isinstance(result, JobResult):
                result = JobResult([], str(result))
            self.succeeded.emit(result)
        except CancelledError:
            self.cancelled.emit()
        except Exception as exc:
            self.logged.emit(traceback.format_exc())
            self.failed.emit(str(exc) or exc.__class__.__name__)
