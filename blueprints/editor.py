from flask import Blueprint, jsonify, request

from db import get_db

bp = Blueprint("editor", __name__, url_prefix="/api/editor")


@bp.route("/documents")
def list_documents():
    conn = get_db()
    rows = conn.execute(
        "SELECT id, title, folder, word_count, updated_at FROM documents ORDER BY folder, updated_at DESC"
    ).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@bp.route("/documents", methods=["POST"])
def create_document():
    data = request.json or {}
    title = data.get("title", "Untitled")
    folder = data.get("folder", "General")
    conn = get_db()
    cur = conn.execute(
        "INSERT INTO documents (title, folder) VALUES (?, ?)", (title, folder)
    )
    doc_id = cur.lastrowid
    conn.commit()
    row = conn.execute("SELECT * FROM documents WHERE id = ?", (doc_id,)).fetchone()
    conn.close()
    return jsonify(dict(row))


@bp.route("/documents/<int:doc_id>")
def get_document(doc_id):
    conn = get_db()
    row = conn.execute("SELECT * FROM documents WHERE id = ?", (doc_id,)).fetchone()
    conn.close()
    if not row:
        return jsonify({"error": "Not found"}), 404
    return jsonify(dict(row))


@bp.route("/documents/<int:doc_id>", methods=["PUT", "POST"])
def update_document(doc_id):
    data = request.json
    conn = get_db()
    row = conn.execute("SELECT id FROM documents WHERE id = ?", (doc_id,)).fetchone()
    if not row:
        conn.close()
        return jsonify({"error": "Not found"}), 404

    title = data.get("title")
    folder = data.get("folder")
    content_html = data.get("content_html")
    content_text = data.get("content_text", "")
    word_count = len(content_text.split()) if content_text else 0

    if title is not None:
        conn.execute(
            "UPDATE documents SET title = ?, updated_at = datetime('now') WHERE id = ?",
            (title, doc_id),
        )
    if folder is not None:
        conn.execute(
            "UPDATE documents SET folder = ?, updated_at = datetime('now') WHERE id = ?",
            (folder, doc_id),
        )
    if content_html is not None:
        conn.execute(
            "UPDATE documents SET content_html = ?, content_text = ?, word_count = ?, updated_at = datetime('now') WHERE id = ?",
            (content_html, content_text, word_count, doc_id),
        )
    conn.commit()
    updated = conn.execute("SELECT * FROM documents WHERE id = ?", (doc_id,)).fetchone()
    conn.close()
    return jsonify(dict(updated))


@bp.route("/documents/<int:doc_id>", methods=["DELETE"])
def delete_document(doc_id):
    conn = get_db()
    conn.execute("DELETE FROM documents WHERE id = ?", (doc_id,))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


@bp.route("/folders")
def list_folders():
    conn = get_db()
    rows = conn.execute(
        "SELECT DISTINCT folder FROM documents ORDER BY folder"
    ).fetchall()
    conn.close()
    folders = [r["folder"] for r in rows]
    if "General" not in folders:
        folders.insert(0, "General")
    return jsonify(folders)


@bp.route("/translate", methods=["POST"])
def translate():
    data = request.json
    text = data.get("text", "").strip()

    if not text:
        return jsonify({"error": "No text provided"}), 400

    try:
        from deep_translator import GoogleTranslator
        translation = GoogleTranslator(source='sv', target='en').translate(text)

        # Word-by-word for multi-word text
        words = text.split()
        word_by_word = []
        if len(words) > 1:
            for w in words:
                try:
                    w_trans = GoogleTranslator(source='sv', target='en').translate(w)
                    word_by_word.append({"sv": w, "en": w_trans})
                except Exception:
                    word_by_word.append({"sv": w, "en": "?"})

        return jsonify({
            "translation": translation,
            "word_by_word": word_by_word,
            "grammar_notes": "",
        })
    except Exception as e:
        return jsonify({"error": f"Translation error: {e}"}), 500
