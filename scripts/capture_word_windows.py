from pathlib import Path
import ctypes
import sys
import time
import win32gui
import win32con
import win32process
from PIL import ImageGrab

ctypes.windll.user32.SetProcessDpiAwarenessContext(ctypes.c_void_p(-4))

pid = int(sys.argv[1])
prefix = sys.argv[2] if len(sys.argv) > 2 else "window"
out = Path(r"C:\Users\yuany\Desktop\PDF Toolbox\work")
windows = []

def callback(hwnd, _):
    if win32gui.IsWindowVisible(hwnd) and win32process.GetWindowThreadProcessId(hwnd)[1] == pid:
        windows.append(hwnd)

win32gui.EnumWindows(callback, None)
for index, hwnd in enumerate(windows):
    title = win32gui.GetWindowText(hwnd)
    rect = win32gui.GetWindowRect(hwnd)
    print(index, hwnd, repr(title), rect, flush=True)
    if rect[2] > rect[0] and rect[3] > rect[1]:
        flags = win32con.SWP_NOMOVE | win32con.SWP_NOSIZE
        win32gui.ShowWindow(hwnd, win32con.SW_RESTORE)
        win32gui.SetWindowPos(hwnd, win32con.HWND_TOPMOST, 0, 0, 0, 0, flags)
        time.sleep(0.5)
        ImageGrab.grab(rect).save(out / f"{prefix}-{index}.png")
        win32gui.SetWindowPos(hwnd, win32con.HWND_NOTOPMOST, 0, 0, 0, 0, flags)
