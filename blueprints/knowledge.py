import os
import subprocess
from pathlib import Path

from flask import Blueprint, jsonify, request

from config import KNOWLEDGE_DIR, BUNDLED_KNOWLEDGE

bp = Blueprint("knowledge", __name__, url_prefix="/api/knowledge")

ALLOWED_EXTENSIONS = {".md", ".txt", ".pdf", ".docx"}
MAX_FILE_SIZE = 20 * 1024 * 1024  # 20MB


def _file_info(path):
    """Build file info dict for a knowledge file."""
    return {
        "name": path.name,
        "size": path.stat().st_size,
        "extension": path.suffix,
        "bundled": path.name in BUNDLED_KNOWLEDGE,
    }


def _extract_text(path):
    """Extract readable text from a file for preview."""
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
            # Basic extraction via python-docx if available, else just note it
            try:
                import docx
                doc = docx.Document(str(path))
                return "\n".join(p.text for p in doc.paragraphs)
            except ImportError:
                return "(Install python-docx to preview .docx files)"
        return "(Preview not available for this file type)"
    except Exception as e:
        return f"(Error reading file: {e})"


@bp.route("/")
def list_files():
    """List all files in the knowledge base."""
    KNOWLEDGE_DIR.mkdir(exist_ok=True)
    files = []
    for f in sorted(KNOWLEDGE_DIR.iterdir()):
        if f.is_file() and f.suffix.lower() in ALLOWED_EXTENSIONS:
            files.append(_file_info(f))
    return jsonify(files)


@bp.route("/preview")
def preview_file():
    """Preview a knowledge base file."""
    name = request.args.get("name", "")
    if not name or ".." in name or "/" in name:
        return jsonify({"error": "Invalid filename"}), 400

    path = KNOWLEDGE_DIR / name
    if not path.exists():
        return jsonify({"error": "File not found"}), 404

    text = _extract_text(path)
    # Limit preview to first 5000 characters
    truncated = len(text) > 5000
    return jsonify({
        "name": name,
        "content": text[:5000],
        "truncated": truncated,
        "full_size": len(text),
    })


@bp.route("/upload", methods=["POST"])
def upload_file():
    """Upload a file to the knowledge base."""
    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400

    file = request.files["file"]
    if not file.filename:
        return jsonify({"error": "No filename"}), 400

    # Check extension
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        return jsonify({"error": f"Unsupported file type: {ext}. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"}), 400

    # Check size
    file.seek(0, os.SEEK_END)
    size = file.tell()
    file.seek(0)
    if size > MAX_FILE_SIZE:
        return jsonify({"error": "File too large (max 20MB)"}), 400

    # Sanitize filename
    safe_name = "".join(c for c in file.filename if c.isalnum() or c in "-_. ").strip()
    if not safe_name:
        safe_name = "uploaded_file" + ext

    KNOWLEDGE_DIR.mkdir(exist_ok=True)
    dest = KNOWLEDGE_DIR / safe_name

    # Avoid overwriting
    if dest.exists():
        base = dest.stem
        i = 1
        while dest.exists():
            dest = KNOWLEDGE_DIR / f"{base}_{i}{ext}"
            i += 1

    file.save(str(dest))
    return jsonify(_file_info(dest))


@bp.route("/delete", methods=["POST"])
def delete_file():
    """Delete a file from the knowledge base."""
    data = request.json
    name = data.get("name", "")
    if not name or ".." in name or "/" in name:
        return jsonify({"error": "Invalid filename"}), 400

    # Don't allow deleting bundled files
    if name in BUNDLED_KNOWLEDGE:
        return jsonify({"error": "Cannot delete bundled files"}), 400

    path = KNOWLEDGE_DIR / name
    if path.exists():
        path.unlink()
    return jsonify({"ok": True})
