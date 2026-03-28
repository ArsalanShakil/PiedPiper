import csv
import io

from flask import Blueprint, Response, jsonify, request

from db import get_db

bp = Blueprint("vocabulary", __name__, url_prefix="/api/vocabulary")


@bp.route("/")
def list_vocab():
    search = request.args.get("search", "")
    category = request.args.get("category", "")
    conn = get_db()

    query = "SELECT * FROM vocabulary WHERE 1=1"
    params = []
    if search:
        query += " AND (swedish_text LIKE ? OR translation LIKE ?)"
        params += [f"%{search}%", f"%{search}%"]
    if category:
        query += " AND category = ?"
        params.append(category)

    query += " ORDER BY created_at DESC"
    rows = conn.execute(query, params).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@bp.route("/", methods=["POST"])
def add_vocab():
    data = request.json
    swedish = data.get("swedish_text", "").strip()
    translation = data.get("translation", "").strip()
    context = data.get("context", "")
    notes = data.get("notes", "")
    category = data.get("category", "")

    if not swedish or not translation:
        return jsonify({"error": "Swedish text and translation are required"}), 400

    conn = get_db()
    cur = conn.execute(
        "INSERT INTO vocabulary (swedish_text, translation, context, notes, category) VALUES (?, ?, ?, ?, ?)",
        (swedish, translation, context, notes, category),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM vocabulary WHERE id = ?", (cur.lastrowid,)).fetchone()
    conn.close()
    return jsonify(dict(row))


@bp.route("/<int:vocab_id>", methods=["PUT"])
def update_vocab(vocab_id):
    data = request.json
    conn = get_db()
    row = conn.execute("SELECT id FROM vocabulary WHERE id = ?", (vocab_id,)).fetchone()
    if not row:
        conn.close()
        return jsonify({"error": "Not found"}), 404

    fields = []
    params = []
    for key in ("swedish_text", "translation", "context", "notes", "category", "difficulty"):
        if key in data:
            fields.append(f"{key} = ?")
            params.append(data[key])

    if fields:
        fields.append("updated_at = datetime('now')")
        params.append(vocab_id)
        conn.execute(f"UPDATE vocabulary SET {', '.join(fields)} WHERE id = ?", params)
        conn.commit()

    updated = conn.execute("SELECT * FROM vocabulary WHERE id = ?", (vocab_id,)).fetchone()
    conn.close()
    return jsonify(dict(updated))


@bp.route("/<int:vocab_id>", methods=["DELETE"])
def delete_vocab(vocab_id):
    conn = get_db()
    conn.execute("DELETE FROM vocabulary WHERE id = ?", (vocab_id,))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


@bp.route("/review")
def get_review_items():
    limit = request.args.get("limit", 10, type=int)
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM vocabulary ORDER BY difficulty ASC, review_count ASC, RANDOM() LIMIT ?",
        (limit,),
    ).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@bp.route("/review/<int:vocab_id>", methods=["POST"])
def submit_review(vocab_id):
    data = request.json
    knew_it = data.get("knew_it", False)
    conn = get_db()
    row = conn.execute("SELECT * FROM vocabulary WHERE id = ?", (vocab_id,)).fetchone()
    if not row:
        conn.close()
        return jsonify({"error": "Not found"}), 404

    difficulty = row["difficulty"]
    if knew_it:
        difficulty = min(5, difficulty + 1)
    else:
        difficulty = max(0, difficulty - 1)

    conn.execute(
        "UPDATE vocabulary SET difficulty = ?, review_count = review_count + 1, last_reviewed_at = datetime('now') WHERE id = ?",
        (difficulty, vocab_id),
    )
    conn.commit()
    conn.close()
    return jsonify({"ok": True, "new_difficulty": difficulty})


@bp.route("/categories")
def get_categories():
    conn = get_db()
    rows = conn.execute(
        "SELECT DISTINCT category FROM vocabulary WHERE category IS NOT NULL AND category != '' ORDER BY category"
    ).fetchall()
    conn.close()
    return jsonify([r["category"] for r in rows])


@bp.route("/export")
def export_csv():
    conn = get_db()
    rows = conn.execute("SELECT swedish_text, translation, context, notes, category FROM vocabulary ORDER BY created_at DESC").fetchall()
    conn.close()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Swedish", "Translation", "Context", "Notes", "Category"])
    for r in rows:
        writer.writerow([r["swedish_text"], r["translation"], r["context"] or "", r["notes"] or "", r["category"] or ""])

    return Response(
        output.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": "attachment; filename=vocabulary.csv"},
    )
