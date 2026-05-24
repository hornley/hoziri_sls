import os
import shutil
import subprocess
import threading
import time
import webbrowser

import pystray
from PIL import Image, ImageDraw


REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOG_PATH = os.path.join(REPO_ROOT, "logs", "tray.log")
SERVER_URL = "http://localhost:3000"


class ServerController:
    def __init__(self):
        self._process = None
        self._lock = threading.Lock()
        self._npm_path = resolve_npm_path()
        self._creationflags, self._startupinfo = resolve_subprocess_window_flags()

    def is_running(self):
        with self._lock:
            return self._process is not None and self._process.poll() is None

    def start(self):
        with self._lock:
            if self._process is not None and self._process.poll() is None:
                return False
            try:
                if not self._npm_path:
                    raise FileNotFoundError("npm not found")
                command = [self._npm_path, "start"]
                self._process = subprocess.Popen(
                    command,
                    cwd=REPO_ROOT,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    creationflags=self._creationflags,
                    startupinfo=self._startupinfo,
                )
                log_event("start")
                return True
            except Exception as exc:
                log_event(f"start_error: {exc}")
                return False

    def stop(self):
        with self._lock:
            if self._process is None or self._process.poll() is not None:
                return False
            process = self._process

        process.terminate()
        stopped = wait_for_exit(process, timeout_seconds=5)
        if not stopped:
            process.kill()
            stopped = wait_for_exit(process, timeout_seconds=2)

        with self._lock:
            if stopped:
                self._process = None
                log_event("stop")
                return True
            log_event("stop_error: could_not_stop")
            return False

    def restart(self):
        stopped = True
        if self.is_running():
            stopped = self.stop()
        if not stopped:
            return False
        return self.start()


def wait_for_exit(process, timeout_seconds):
    start = time.time()
    while time.time() - start < timeout_seconds:
        if process.poll() is not None:
            return True
        time.sleep(0.1)
    return process.poll() is not None


def resolve_npm_path():
    override = os.environ.get("NPM_PATH")
    if override and os.path.isfile(override):
        return override

    resolved = shutil.which("npm")
    if resolved:
        return resolved

    if os.name == "nt":
        candidates = [
            os.path.join(os.environ.get("ProgramFiles", ""), "nodejs", "npm.cmd"),
            os.path.join(os.environ.get("ProgramFiles(x86)", ""), "nodejs", "npm.cmd"),
            os.path.join(os.environ.get("APPDATA", ""), "npm", "npm.cmd"),
        ]
        for candidate in candidates:
            if candidate and os.path.isfile(candidate):
                return candidate
    return None


def resolve_subprocess_window_flags():
    if os.name != "nt":
        return 0, None

    creationflags = subprocess.CREATE_NO_WINDOW
    startupinfo = subprocess.STARTUPINFO()
    startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
    return creationflags, startupinfo


def log_event(message):
    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
    log_dir = os.path.dirname(LOG_PATH)
    if log_dir:
        os.makedirs(log_dir, exist_ok=True)
    line = f"[{timestamp}] {message}\n"
    with open(LOG_PATH, "a", encoding="utf-8") as handle:
        handle.write(line)


def create_icon_image():
    size = 64
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.ellipse((8, 8, size - 8, size - 8), fill=(232, 120, 24, 255))
    draw.rectangle((28, 18, 36, 46), fill=(255, 240, 224, 255))
    draw.ellipse((26, 12, 38, 24), fill=(255, 240, 224, 255))
    return image


def main():
    controller = ServerController()

    def open_site(icon, item):
        webbrowser.open(SERVER_URL)

    def stop_server(icon, item):
        if not controller.stop():
            icon.notify("Could not stop server", "Hoziri")

    def restart_server(icon, item):
        if not controller.restart():
            icon.notify("Could not restart server", "Hoziri")

    def exit_app(icon, item):
        controller.stop()
        icon.stop()

    menu = pystray.Menu(
        pystray.MenuItem("Open", open_site, default=True),
        pystray.MenuItem("Restart", restart_server),
        pystray.MenuItem("Stop", stop_server),
        pystray.MenuItem("Exit", exit_app),
    )

    icon = pystray.Icon("hoziri", create_icon_image(), "Hoziri", menu)

    controller.start()
    icon.run()


if __name__ == "__main__":
    main()
