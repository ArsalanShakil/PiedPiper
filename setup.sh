#!/bin/bash
set -e

echo "=== PiedPiper — Automated Setup ==="
echo ""

APP_DIR="$(cd "$(dirname "$0")" && pwd)"

# --- Python check ---
if ! command -v python3 &> /dev/null; then
    echo "ERROR: python3 not found. Please install Python 3.9+ first."
    exit 1
fi
echo "[OK] Python found: $(python3 --version)"

# --- Install ffmpeg if missing ---
if ! command -v ffmpeg &> /dev/null; then
    echo "[..] Installing ffmpeg..."
    if command -v brew &> /dev/null; then
        brew install ffmpeg
    elif command -v apt-get &> /dev/null; then
        sudo apt-get update -qq && sudo apt-get install -y -qq ffmpeg
    elif command -v dnf &> /dev/null; then
        sudo dnf install -y ffmpeg
    else
        echo "WARNING: Could not auto-install ffmpeg. WAV will work, but MP3/OGG/FLAC need ffmpeg."
    fi
else
    echo "[OK] ffmpeg found"
fi

# --- Check Claude Code CLI ---
if command -v claude &> /dev/null; then
    echo "[OK] Claude Code CLI found"
else
    echo "[!!] Claude Code CLI not found — AI features (exam generation, evaluation) won't work"
    echo "     Install from: https://claude.ai/code"
fi

# --- Install Python dependencies ---
echo "[..] Installing Python packages..."
pip3 install -q -r "$APP_DIR/requirements.txt"
echo "[OK] Python packages installed"

# --- Download Swedish voice model ---
VOICES_DIR="$HOME/piper-voices"
MODEL_FILE="$VOICES_DIR/sv_SE-nst-medium.onnx"
MODEL_JSON="$VOICES_DIR/sv_SE-nst-medium.onnx.json"
mkdir -p "$VOICES_DIR"

if [ ! -f "$MODEL_FILE" ]; then
    echo "[..] Downloading Swedish voice model (~60MB)..."
    curl -sL -o "$MODEL_FILE" \
        "https://huggingface.co/rhasspy/piper-voices/resolve/main/sv/sv_SE/nst/medium/sv_SE-nst-medium.onnx"
    curl -sL -o "$MODEL_JSON" \
        "https://huggingface.co/rhasspy/piper-voices/resolve/main/sv/sv_SE/nst/medium/sv_SE-nst-medium.onnx.json"
    echo "[OK] Voice model downloaded"
else
    echo "[OK] Voice model already present"
fi

# --- Create directories ---
mkdir -p "$APP_DIR/output/General"
mkdir -p "$APP_DIR/output/recordings"
mkdir -p "$APP_DIR/output/audio_cache"
mkdir -p "$APP_DIR/knowledge"

# --- Initialize database ---
cd "$APP_DIR" && python3 -c "from db import init_db; init_db()"
echo "[OK] Database initialized"

# --- Create macOS Desktop App ---
if [[ "$(uname)" == "Darwin" ]]; then
    APP_BUNDLE="$HOME/Desktop/PiedPiper.app"
    mkdir -p "$APP_BUNDLE/Contents/MacOS"
    mkdir -p "$APP_BUNDLE/Contents/Resources"

    # Launcher script — include full PATH so the app works from Finder
    CURRENT_PATH="$PATH"
    PYTHON_PATH="$(which python3)"
    cat > "$APP_BUNDLE/Contents/MacOS/PiedPiper" << LAUNCHER
#!/bin/bash
export PATH="$CURRENT_PATH"
export PYENV_ROOT="\$HOME/.pyenv"
eval "\$(pyenv init --path 2>/dev/null)" 2>/dev/null
eval "\$(pyenv init - 2>/dev/null)" 2>/dev/null
cd "$APP_DIR"
exec "$PYTHON_PATH" desktop.py
LAUNCHER
    chmod +x "$APP_BUNDLE/Contents/MacOS/PiedPiper"

    # Info.plist
    cat > "$APP_BUNDLE/Contents/Info.plist" << 'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>PiedPiper</string>
    <key>CFBundleIdentifier</key>
    <string>com.piedpiper.app</string>
    <key>CFBundleName</key>
    <string>PiedPiper</string>
    <key>CFBundleDisplayName</key>
    <string>PiedPiper</string>
    <key>CFBundleVersion</key>
    <string>1.0</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleIconFile</key>
    <string>AppIcon</string>
    <key>LSMinimumSystemVersion</key>
    <string>11.0</string>
    <key>NSHighResolutionCapable</key>
    <true/>
    <key>NSMicrophoneUsageDescription</key>
    <string>PiedPiper needs microphone access for speaking practice.</string>
</dict>
</plist>
PLIST

    # Generate icon from bundled SVG
    ICON_SVG="$APP_DIR/icon.svg"
    if [ -f "$ICON_SVG" ]; then
        TMP_DIR=$(mktemp -d)
        qlmanage -t -s 512 -o "$TMP_DIR" "$ICON_SVG" 2>/dev/null
        PNG="$TMP_DIR/icon.svg.png"
        if [ -f "$PNG" ]; then
            ICONSET="$TMP_DIR/icon.iconset"
            mkdir -p "$ICONSET"
            for size in 16 32 64 128 256 512; do
                sips -z $size $size "$PNG" --out "$ICONSET/icon_${size}x${size}.png" 2>/dev/null
                double=$((size * 2))
                if [ $double -le 512 ]; then
                    sips -z $double $double "$PNG" --out "$ICONSET/icon_${size}x${size}@2x.png" 2>/dev/null
                fi
            done
            iconutil -c icns "$ICONSET" -o "$APP_BUNDLE/Contents/Resources/AppIcon.icns" 2>/dev/null
        fi
        rm -rf "$TMP_DIR"
    fi

    echo "[OK] Desktop app created at ~/Desktop/PiedPiper.app"
fi

# --- Add shell aliases ---
ALIAS_TTS="alias start-tts='cd $APP_DIR && python3 app.py & sleep 1 && open http://localhost:5123'"
ALIAS_PP="alias piedpiper='cd $APP_DIR && python3 desktop.py'"

for RC_FILE in "$HOME/.zshrc" "$HOME/.bashrc"; do
    if [ -f "$RC_FILE" ]; then
        if ! grep -q "start-tts" "$RC_FILE" 2>/dev/null; then
            printf '\n# PiedPiper\n%s\n%s\n' "$ALIAS_TTS" "$ALIAS_PP" >> "$RC_FILE"
            echo "[OK] Added aliases to $RC_FILE"
        else
            sed -i.bak "/alias start-tts=/c\\
$ALIAS_TTS" "$RC_FILE" && rm -f "${RC_FILE}.bak"
            if ! grep -q "alias piedpiper=" "$RC_FILE" 2>/dev/null; then
                echo "$ALIAS_PP" >> "$RC_FILE"
            fi
            echo "[OK] Updated aliases in $RC_FILE"
        fi
    fi
done

echo ""
echo "=== Setup complete! ==="
echo ""
echo "Launch options:"
echo "  1. Double-click PiedPiper.app on your Desktop"
echo "  2. Run: piedpiper     (native window)"
echo "  3. Run: start-tts     (browser mode)"
echo ""
echo "(open a new terminal first, or run: source ~/.zshrc)"
