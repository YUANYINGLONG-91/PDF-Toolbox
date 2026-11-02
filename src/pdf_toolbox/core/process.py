from __future__ import annotations

import os
import queue
import subprocess
import threading
from collections import deque
from pathlib import Path
from typing import Iterable

from pdf_toolbox.errors import CancelledError, OperationError
from pdf_toolbox.models import LogCallback, ignore_log


def _reader(pipe, messages: queue.Queue) -> None:
    try:
        for line in iter(pipe.readline, ""):
            messages.put(line.rstrip())
    finally:
        pipe.close()
        messages.put(None)


def run_process(
    args: Iterable[str | os.PathLike],
    *,
    env: dict[str, str] | None = None,
    cwd: Path | None = None,
    cancel_event: threading.Event | None = None,
    log: LogCallback = ignore_log,
) -> list[str]:
    command = [os.fspath(arg) for arg in args]
    flags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
    try:
        process = subprocess.Popen(
            command,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
            env=env,
            cwd=cwd,
            shell=False,
            creationflags=flags,
        )
    except OSError as exc:
        raise OperationError(f"Could not start {Path(command[0]).name}: {exc}") from exc

    messages: queue.Queue = queue.Queue()
    reader = threading.Thread(target=_reader, args=(process.stdout, messages), daemon=True)
    reader.start()
    tail: deque[str] = deque(maxlen=200)
    reader_done = False
    while not reader_done or process.poll() is None:
        if cancel_event and cancel_event.is_set() and process.poll() is None:
            if os.name == "nt":
                subprocess.run(
                    ["taskkill", "/PID", str(process.pid), "/T", "/F"],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    creationflags=flags,
                    check=False,
                )
            else:
                process.terminate()
            raise CancelledError("Operation cancelled.")
        try:
            line = messages.get(timeout=0.1)
            if line is None:
                reader_done = True
            else:
                tail.append(line)
                log(line)
        except queue.Empty:
            pass
    reader.join(timeout=1)
    if cancel_event and cancel_event.is_set():
        raise CancelledError("Operation cancelled.")
    if process.returncode:
        detail = "\n".join(list(tail)[-12:])
        raise OperationError(f"External tool failed ({process.returncode}).\n{detail}")
    return list(tail)
