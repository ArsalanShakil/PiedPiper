"""PiedPiper Desktop — launches as a native macOS window with mic access."""
import sys
import threading
import time

import webview
from app import create_app


def start_server():
    app = create_app()
    app.run(port=5123, use_reloader=False)


def grant_media_permissions():
    """Grant microphone permission to the WKWebView on macOS."""
    try:
        import objc
        from Foundation import NSObject
        from WebKit import WKWebView

        # Swizzle the WKUIDelegate to auto-grant media permissions
        class MediaDelegate(NSObject):
            def webView_requestMediaCapturePermissionForOrigin_initiatedByFrame_type_decisionHandler_(
                self, webView, origin, frame, mediaType, decisionHandler
            ):
                # 1 = WKPermissionDecisionGrant
                decisionHandler(1)

        return MediaDelegate
    except Exception:
        return None


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
        """After window loads, try to set up mic permissions for WebKit."""
        try:
            import objc
            from Foundation import NSObject

            # Access the native webview and set media permission
            native = window.gui.BrowserView.instances[list(window.gui.BrowserView.instances.keys())[0]]
            webkit_view = native.webkit

            class PermissionDelegate(NSObject):
                def webView_requestMediaCapturePermissionForOrigin_initiatedByFrame_type_decisionHandler_(
                    self, webView, origin, frame, mediaType, decisionHandler
                ):
                    decisionHandler(1)  # Grant

            delegate = PermissionDelegate.alloc().init()
            webkit_view.setUIDelegate_(delegate)
        except Exception as e:
            print(f"Note: Could not auto-grant mic permission: {e}")
            print("Mic may still work if macOS system permissions are granted.")

    window.events.loaded += on_loaded

    webview.start()
