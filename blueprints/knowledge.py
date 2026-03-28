import os
import subprocess
from pathlib import Path

from flask import Blueprint, jsonify, request

from config import KNOWLEDGE_DIR, KNOWLEDGE_FOLDERS, BUNDLED_KNOWLEDGE

bp = Blueprint("knowledge", __name__, url_prefix="/api/knowledge")

ALLOWED_EXTENSIONS = {".md", ".txt", ".pdf", ".docx"}
MAX_FILE_SIZE = 20 * 1024 * 1024  # 20MB


def _file_info(path, folder):
    rel = f"{folder}/{path.name}"
    return {
        "name": path.name,
        "folder": folder,
        "path": rel,
        "size": path.stat().st_size,
        "extension": path.suffix,
        "bundled": rel in BUNDLED_KNOWLEDGE,
    }


def _extract_text(path):
    ext = path.suffix.lower()
    try:
        if ext in (".md", ".txt"):
            return path.read_text(encoding="utf-8")
        elif ext == ".pdf":
            result = subprocess.run(
                ["pdftotext", str(path), "-"],
                capture_output=True, text=True, timeout=30,
            )
            if result.returncode == 0:
                return result.stdout
            return f"(Could not extract text from PDF: {result.stderr.strip()})"
        elif ext == ".docx":
            try:
                import docx
                doc = docx.Document(str(path))
                return "\n".join(p.text for p in doc.paragraphs)
            except ImportError:
                return "(Install python-docx to preview .docx files)"
        return "(Preview not available for this file type)"
    except Exception as e:
        return f"(Error reading file: {e})"


@bp.route("/folders")
def list_folders():
    # Ensure all folders exist
    for f in KNOWLEDGE_FOLDERS:
        (KNOWLEDGE_DIR / f).mkdir(parents=True, exist_ok=True)
    return jsonify(KNOWLEDGE_FOLDERS)


@bp.route("/")
def list_files():
    KNOWLEDGE_DIR.mkdir(exist_ok=True)
    result = {}
    for folder in KNOWLEDGE_FOLDERS:
        folder_path = KNOWLEDGE_DIR / folder
        folder_path.mkdir(exist_ok=True)
        files = []
        for f in sorted(folder_path.iterdir()):
            if f.is_file() and f.suffix.lower() in ALLOWED_EXTENSIONS:
                files.append(_file_info(f, folder))
        result[folder] = files
    return jsonify(result)


@bp.route("/preview")
def preview_file():
    folder = request.args.get("folder", "")
    name = request.args.get("name", "")
    if not folder or not name or ".." in folder or ".." in name:
        return jsonify({"error": "Invalid path"}), 400

    path = KNOWLEDGE_DIR / folder / name
    if not path.exists():
        return jsonify({"error": "File not found"}), 404

    text = _extract_text(path)
    truncated = len(text) > 5000
    return jsonify({
        "name": name,
        "folder": folder,
        "content": text[:5000],
        "truncated": truncated,
        "full_size": len(text),
    })


@bp.route("/upload", methods=["POST"])
def upload_file():
    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400

    file = request.files["file"]
    folder = request.form.get("folder", "Writing")
    if not file.filename:
        return jsonify({"error": "No filename"}), 400
    if folder not in KNOWLEDGE_FOLDERS:
        return jsonify({"error": "Invalid folder"}), 400

    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        return jsonify({"error": f"Unsupported file type: {ext}"}), 400

    file.seek(0, os.SEEK_END)
    size = file.tell()
    file.seek(0)
    if size > MAX_FILE_SIZE:
        return jsonify({"error": "File too large (max 20MB)"}), 400

    safe_name = "".join(c for c in file.filename if c.isalnum() or c in "-_. ").strip()
    if not safe_name:
        safe_name = "uploaded_file" + ext

    dest_dir = KNOWLEDGE_DIR / folder
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / safe_name

    if dest.exists():
        base = dest.stem
        i = 1
        while dest.exists():
            dest = dest_dir / f"{base}_{i}{ext}"
            i += 1

    file.save(str(dest))
    return jsonify(_file_info(dest, folder))


@bp.route("/delete", methods=["POST"])
def delete_file():
    data = request.json
    folder = data.get("folder", "")
    name = data.get("name", "")
    if not folder or not name or ".." in folder or ".." in name:
        return jsonify({"error": "Invalid path"}), 400

    rel = f"{folder}/{name}"
    if rel in BUNDLED_KNOWLEDGE:
        return jsonify({"error": "Cannot delete bundled files"}), 400

    path = KNOWLEDGE_DIR / folder / name
    if path.exists():
        path.unlink()
    return jsonify({"ok": True})
