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
    echo "[!!] Claude Code CLI not found — AI features (translation, exam generation) won't work"
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

# --- Add shell alias ---
ALIAS_LINE="alias start-tts='python3 $APP_DIR/app.py & sleep 1 && open http://localhost:5123'"

for RC_FILE in "$HOME/.zshrc" "$HOME/.bashrc"; do
    if [ -f "$RC_FILE" ]; then
        if ! grep -q "start-tts" "$RC_FILE" 2>/dev/null; then
            printf '\n# PiedPiper\n%s\n' "$ALIAS_LINE" >> "$RC_FILE"
            echo "[OK] Added 'start-tts' alias to $RC_FILE"
        else
            sed -i.bak "/alias start-tts=/c\\
$ALIAS_LINE" "$RC_FILE" && rm -f "${RC_FILE}.bak"
            echo "[OK] Updated 'start-tts' alias in $RC_FILE"
        fi
    fi
done

echo ""
echo "=== Setup complete! ==="
echo ""
echo "Start the app:  start-tts"
echo "Or run directly: python3 $APP_DIR/app.py"
echo "(open a new terminal first, or run: source ~/.zshrc)"
