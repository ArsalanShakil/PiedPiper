from flask import Blueprint, jsonify, request

from db import get_db
from blueprints.ai import ask_claude

bp = Blueprint("editor", __name__, url_prefix="/api/editor")


@bp.route("/documents")
def list_documents():
    conn = get_db()
    rows = conn.execute(
        "SELECT id, title, word_count, updated_at FROM documents ORDER BY updated_at DESC"
    ).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@bp.route("/documents", methods=["POST"])
def create_document():
    data = request.json or {}
    title = data.get("title", "Untitled")
    conn = get_db()
    cur = conn.execute(
        "INSERT INTO documents (title) VALUES (?)", (title,)
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


@bp.route("/documents/<int:doc_id>", methods=["PUT"])
def update_document(doc_id):
    data = request.json
    conn = get_db()
    row = conn.execute("SELECT id FROM documents WHERE id = ?", (doc_id,)).fetchone()
    if not row:
        conn.close()
        return jsonify({"error": "Not found"}), 404

    title = data.get("title")
    content_html = data.get("content_html")
    content_text = data.get("content_text", "")
    word_count = len(content_text.split()) if content_text else 0

    if title is not None:
        conn.execute(
            "UPDATE documents SET title = ?, updated_at = datetime('now') WHERE id = ?",
            (title, doc_id),
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


@bp.route("/translate", methods=["POST"])
def translate():
    data = request.json
    text = data.get("text", "").strip()
    context = data.get("context", "")

    if not text:
        return jsonify({"error": "No text provided"}), 400

    system = (
        "You are a Swedish-English translation assistant. "
        "Return ONLY valid JSON with this exact structure: "
        '{"translation": "English translation", '
        '"word_by_word": [{"sv": "Swedish word", "en": "English word"}], '
        '"grammar_notes": "Brief grammar note if relevant, or empty string"}'
    )
    prompt = f"Translate this Swedish text to English:\n\n\"{text}\""
    if context:
        prompt += f"\n\nContext: \"{context}\""

    result = ask_claude(prompt, system=system)

    # Try to parse JSON from response
    import json
    try:
        # Find JSON in the response
        start = result.find("{")
        end = result.rfind("}") + 1
        if start >= 0 and end > start:
            parsed = json.loads(result[start:end])
            return jsonify(parsed)
    except (json.JSONDecodeError, ValueError):
        pass

    # Fallback: return raw text as translation
    return jsonify({
        "translation": result,
        "word_by_word": [],
        "grammar_notes": "",
    })
