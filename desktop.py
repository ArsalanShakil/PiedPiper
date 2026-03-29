"""PiedPiper Desktop — native macOS window with Chromium-based mic access."""
import sys
import threading
import time
import platform

import webview
from app import create_app


def start_server():
    app = create_app()
    app.run(port=5123, use_reloader=False)


def setup_webkit_mic_permission(window):
    """
    On macOS, WKWebView needs explicit delegate to grant mic permission.
    This hooks into the native WebKit view after it's created.
    """
    if platform.system() != 'Darwin':
        return

    try:
        import objc
        from Foundation import NSObject
        from objc import super as objc_super  # noqa: F811

        # Define a class that implements WKUIDelegate's media permission method
        NSObject = objc.lookUpClass('NSObject')

        class PiedPiperUIDelegate(NSObject):
            # WKUIDelegate method for media capture permission (macOS 12+)
            def webView_requestMediaCapturePermissionForOrigin_initiatedByFrame_type_decisionHandler_(
                self, webView, origin, frame, mediaType, decisionHandler
            ):
                # WKPermissionDecisionGrant = 1
                decisionHandler(1)

            # Also handle JavaScript alerts/confirms to avoid crashes
            def webView_runJavaScriptAlertPanelWithMessage_initiatedByFrame_completionHandler_(
                self, webView, message, frame, completionHandler
            ):
                completionHandler()

        # Get the native WebKit view from pywebview
        instances = window.gui.BrowserView.instances
        key = list(instances.keys())[0]
        native = instances[key]
        wk_webview = native.webkit

        delegate = PiedPiperUIDelegate.alloc().init()
        wk_webview.setUIDelegate_(delegate)

        # Keep a reference so delegate isn't garbage collected
        window._mic_delegate = delegate
        print("[OK] Mic permission delegate installed for WebKit")

    except Exception as e:
        print(f"[!!] Could not set up mic permission: {e}")
        print("     Mic access will still work in the browser at http://localhost:5123")


if __name__ == '__main__':
    # Start Flask in background thread
    server = threading.Thread(target=start_server, daemon=True)
    server.start()
    time.sleep(1)

    # Create window
    window = webview.create_window(
        'PiedPiper',
        'http://localhost:5123',
        width=1280,
        height=850,
        min_size=(900, 600),
    )

    def on_loaded():
        setup_webkit_mic_permission(window)

    window.events.loaded += on_loaded

    webview.start()
