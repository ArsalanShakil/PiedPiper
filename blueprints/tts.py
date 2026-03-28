import os
import subprocess
import uuid
from datetime import datetime
from pathlib import Path

from flask import Blueprint, jsonify, request, send_file

from config import OUTPUT_DIR, VOICES_DIR, SUPPORTED_FORMATS

bp = Blueprint("tts", __name__, url_prefix="/api")


def get_voices():
    voices = []
    if not VOICES_DIR.exists():
        return voices
    for f in sorted(VOICES_DIR.glob("*.onnx")):
        if not f.name.endswith(".onnx.json"):
            name = f.stem.replace("-", " ").replace("_", " ")
            voices.append({"id": f.stem, "name": name, "path": str(f)})
    return voices


def resolve_save_dir(folder_path):
    if folder_path and os.path.isabs(folder_path):
        p = Path(folder_path)
        p.mkdir(parents=True, exist_ok=True)
        return p
    name = folder_path or "General"
    p = OUTPUT_DIR / name
    p.mkdir(parents=True, exist_ok=True)
    return p


@bp.route("/voices")
def api_voices():
    return jsonify(get_voices())


@bp.route("/browse")
def api_browse():
    path = request.args.get("path", str(Path.home()))
    p = Path(path)
    if not p.exists() or not p.is_dir():
        return jsonify({"error": "Path not found"}), 400

    dirs = []
    try:
        for item in sorted(p.iterdir()):
            if item.is_dir() and not item.name.startswith("."):
                dirs.append({"name": item.name, "path": str(item)})
    except PermissionError:
        return jsonify({"error": "Permission denied"}), 403

    parent = str(p.parent) if p != p.parent else None
    return jsonify({"current": str(p), "parent": parent, "directories": dirs})


@bp.route("/recent-folders")
def api_recent_folders():
    home = Path.home()
    locations = [
        {"name": "Default (App Output)", "path": str(OUTPUT_DIR)},
        {"name": "Desktop", "path": str(home / "Desktop")},
        {"name": "Documents", "path": str(home / "Documents")},
        {"name": "Downloads", "path": str(home / "Downloads")},
        {"name": "Music", "path": str(home / "Music")},
        {"name": "Home", "path": str(home)},
    ]
    if OUTPUT_DIR.exists():
        for d in sorted(OUTPUT_DIR.iterdir()):
            if d.is_dir():
                locations.append({"name": f"App / {d.name}", "path": str(d)})
    return jsonify(locations)


@bp.route("/synthesize", methods=["POST"])
def api_synthesize():
    data = request.json
    text = data.get("text", "").strip()
    voice_id = data.get("voice_id", "")
    fmt = data.get("format", "wav")
    save_path = data.get("save_path", "")
    filename = data.get("filename", "").strip()

    if not text:
        return jsonify({"error": "Text is required"}), 400
    if fmt not in SUPPORTED_FORMATS:
        return jsonify({"error": f"Unsupported format: {fmt}"}), 400

    voice_path = VOICES_DIR / f"{voice_id}.onnx"
    if not voice_path.exists():
        return jsonify({"error": "Voice model not found"}), 400

    folder_path = resolve_save_dir(save_path)

    if not filename:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"tts_{timestamp}_{uuid.uuid4().hex[:6]}"

    filename = "".join(c for c in filename if c.isalnum() or c in "-_ ")
    wav_path = folder_path / f"{filename}.wav"
    final_path = folder_path / f"{filename}.{fmt}"

    try:
        proc = subprocess.run(
            ["piper", "--model", str(voice_path), "--output_file", str(wav_path)],
            input=text,
            capture_output=True,
            text=True,
            timeout=60,
        )
        if proc.returncode != 0:
            return jsonify({"error": f"Piper error: {proc.stderr}"}), 500
    except subprocess.TimeoutExpired:
        return jsonify({"error": "TTS generation timed out"}), 500

    if fmt != "wav":
        try:
            subprocess.run(
                ["ffmpeg", "-y", "-i", str(wav_path), str(final_path)],
                capture_output=True,
                timeout=30,
            )
            wav_path.unlink()
        except Exception as e:
            return jsonify({"error": f"Conversion error: {e}"}), 500
    else:
        final_path = wav_path

    return jsonify({
        "filename": final_path.name,
        "folder": str(folder_path),
        "path": str(final_path),
        "size": final_path.stat().st_size,
    })


@bp.route("/files")
def api_files():
    folder = request.args.get("folder", "")
    result = []

    if folder:
        search_dirs = [Path(folder)]
    else:
        search_dirs = []
        if OUTPUT_DIR.exists():
            for d in OUTPUT_DIR.iterdir():
                if d.is_dir():
                    search_dirs.append(d)

    for d in search_dirs:
        if not d.exists():
            continue
        try:
            for f in sorted(d.glob("*"), key=lambda x: x.stat().st_mtime, reverse=True):
                if f.suffix.lstrip(".") in SUPPORTED_FORMATS:
                    result.append({
                        "name": f.name,
                        "folder": str(d),
                        "folder_short": d.name,
                        "format": f.suffix.lstrip("."),
                        "size": f.stat().st_size,
                        "created": datetime.fromtimestamp(f.stat().st_mtime).isoformat(),
                    })
        except PermissionError:
            continue
    return jsonify(result)


@bp.route("/files/play")
def api_play_file():
    folder = request.args.get("folder", "")
    name = request.args.get("name", "")
    if not folder or not name:
        return jsonify({"error": "Invalid path"}), 400
    filepath = Path(folder) / name
    if not filepath.exists():
        return jsonify({"error": "File not found"}), 404
    return send_file(filepath)


@bp.route("/files/delete", methods=["POST"])
def api_delete_file():
    data = request.json
    folder = data.get("folder", "")
    name = data.get("name", "")
    if not folder or not name:
        return jsonify({"error": "Invalid path"}), 400
    filepath = Path(folder) / name
    if filepath.exists():
        filepath.unlink()
    return jsonify({"ok": True})
