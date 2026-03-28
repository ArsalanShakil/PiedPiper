"""PiedPiper Desktop — launches as a native macOS window."""
import threading
import time
import webview
from app import create_app

def start_server():
    app = create_app()
    app.run(port=5123, use_reloader=False)

if __name__ == '__main__':
    # Start Flask in background thread
    server = threading.Thread(target=start_server, daemon=True)
    server.start()
    time.sleep(1)

    # Open native window
    webview.create_window(
        'PiedPiper',
        'http://localhost:5123',
        width=1280,
        height=850,
        min_size=(900, 600),
    )
    webview.start()
