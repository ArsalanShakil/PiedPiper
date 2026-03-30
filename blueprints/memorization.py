import json
import re
from datetime import datetime, timedelta

from flask import Blueprint, jsonify, request

from db import get_db

bp = Blueprint("memorization", __name__, url_prefix="/api/memorization")

MODE_WEIGHTS = [0.05, 0.15, 0.25, 0.30, 0.25]
REVIEW_INTERVALS = [
    timedelta(hours=1),
    timedelta(hours=4),
    timedelta(days=1),
    timedelta(days=3),
    timedelta(days=7),
    timedelta(days=14),
    timedelta(days=30),
]


def chunk_text(text, max_words=20):
    """Split text into memorizable chunks by sentence.

    Keeps full sentences together. Only splits a sentence if it exceeds
    max_words, in which case it splits at the nearest word boundary.
    Adjacent short sentences (< 6 words) are merged with the next sentence.
    """
    # Split on sentence-ending punctuation followed by whitespace, or on newlines
    raw = re.split(r'(?<=[.?!])\s+|\n+', text.strip())
    sentences = [s.strip() for s in raw if s.strip()]

    if not sentences:
        return [text.strip()] if text.strip() else []

    # Merge very short fragments with the next sentence
    merged = []
    buf = ""
    for s in sentences:
        if buf:
            buf = buf + " " + s
            merged.append(buf)
            buf = ""
        elif len(s.split()) < 6 and s != sentences[-1]:
            buf = s
        else:
            merged.append(s)
    if buf:
        if merged:
            merged[-1] = merged[-1] + " " + buf
        else:
            merged.append(buf)

    # Split any sentence that's still too long
    chunks = []
    for sentence in merged:
        words = sentence.split()
        if len(words) <= max_words:
            chunks.append(sentence)
        else:
            for i in range(0, len(words), max_words):
                chunk = " ".join(words[i : i + max_words])
                if chunk:
                    chunks.append(chunk)

    return chunks


def item_to_dict(row):
    """Convert a database row to a dict with parsed chunks."""
    d = dict(row)
    d['chunks'] = json.loads(d.pop('chunks_json', '[]'))
    return d


def recalculate_mastery(conn, item_id):
    """Recalculate mastery_level, highest_mode_completed, and next_review_at."""
    # Get last 3 drill results per mode
    mode_scores = {}
    for mode in range(5):
        rows = conn.execute(
            "SELECT score FROM memorization_drill_results "
            "WHERE item_id = ? AND mode = ? ORDER BY drilled_at DESC LIMIT 3",
            (item_id, mode),
        ).fetchall()
        if rows:
            mode_scores[mode] = sum(r['score'] for r in rows) / len(rows)

    # Calculate weighted average with renormalized weights
    if mode_scores:
        total_weight = sum(MODE_WEIGHTS[m] for m in mode_scores)
        weighted_avg = sum(
            MODE_WEIGHTS[m] * mode_scores[m] / total_weight
            for m in mode_scores
        )
        mastery_level = round(weighted_avg * 100)
    else:
        mastery_level = 0

    # Highest mode where latest score >= 0.8
    highest_mode_completed = 0
    for mode in range(5):
        latest = conn.execute(
            "SELECT score FROM memorization_drill_results "
            "WHERE item_id = ? AND mode = ? ORDER BY drilled_at DESC LIMIT 1",
            (item_id, mode),
        ).fetchone()
        if latest and latest['score'] >= 0.8:
            highest_mode_completed = mode

    # Get current item for total_drill_count
    item = conn.execute(
        "SELECT total_drill_count FROM memorization_items WHERE id = ?",
        (item_id,),
    ).fetchone()
    new_drill_count = (item['total_drill_count'] or 0) + 1

    # Compute next_review_at
    interval_index = min(new_drill_count - 1, len(REVIEW_INTERVALS) - 1)
    interval = REVIEW_INTERVALS[interval_index]
    if mastery_level < 50:
        interval = min(interval, timedelta(days=1))
    next_review_at = (datetime.utcnow() + interval).strftime('%Y-%m-%d %H:%M:%S')

    conn.execute(
        "UPDATE memorization_items SET mastery_level = ?, highest_mode_completed = ?, "
        "total_drill_count = ?, last_drilled_at = datetime('now'), "
        "next_review_at = ?, updated_at = datetime('now') WHERE id = ?",
        (mastery_level, highest_mode_completed, new_drill_count, next_review_at, item_id),
    )
    conn.commit()


@bp.route("/")
def list_items():
    search = request.args.get("search", "")
    conn = get_db()

    query = "SELECT * FROM memorization_items WHERE 1=1"
    params = []
    if search:
        query += " AND (title LIKE ? OR original_text LIKE ?)"
        params += [f"%{search}%", f"%{search}%"]

    query += " ORDER BY created_at DESC"
    rows = conn.execute(query, params).fetchall()
    conn.close()
    return jsonify([item_to_dict(r) for r in rows])


@bp.route("/", methods=["POST"])
def create_item():
    data = request.json
    title = data.get("title", "Untitled").strip()
    original_text = data.get("original_text", "").strip()

    if not original_text:
        return jsonify({"error": "original_text is required"}), 400

    chunks = chunk_text(original_text)
    chunks_json = json.dumps(chunks)

    conn = get_db()
    cur = conn.execute(
        "INSERT INTO memorization_items (title, original_text, chunks_json) VALUES (?, ?, ?)",
        (title, original_text, chunks_json),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM memorization_items WHERE id = ?", (cur.lastrowid,)).fetchone()
    conn.close()
    return jsonify(item_to_dict(row))


@bp.route("/<int:item_id>")
def get_item(item_id):
    conn = get_db()
    row = conn.execute("SELECT * FROM memorization_items WHERE id = ?", (item_id,)).fetchone()
    conn.close()
    if not row:
        return jsonify({"error": "Not found"}), 404
    return jsonify(item_to_dict(row))


@bp.route("/<int:item_id>", methods=["PUT"])
def update_item(item_id):
    data = request.json
    conn = get_db()
    row = conn.execute("SELECT * FROM memorization_items WHERE id = ?", (item_id,)).fetchone()
    if not row:
        conn.close()
        return jsonify({"error": "Not found"}), 404

    fields = []
    params = []

    if "title" in data:
        fields.append("title = ?")
        params.append(data["title"].strip())

    if "original_text" in data:
        new_text = data["original_text"].strip()
        fields.append("original_text = ?")
        params.append(new_text)
        # Re-chunk if text changed
        if new_text != row["original_text"]:
            chunks = chunk_text(new_text)
            fields.append("chunks_json = ?")
            params.append(json.dumps(chunks))

    if fields:
        fields.append("updated_at = datetime('now')")
        params.append(item_id)
        conn.execute(
            f"UPDATE memorization_items SET {', '.join(fields)} WHERE id = ?",
            params,
        )
        conn.commit()

    updated = conn.execute("SELECT * FROM memorization_items WHERE id = ?", (item_id,)).fetchone()
    conn.close()
    return jsonify(item_to_dict(updated))


@bp.route("/<int:item_id>", methods=["DELETE"])
def delete_item(item_id):
    conn = get_db()
    conn.execute("DELETE FROM memorization_items WHERE id = ?", (item_id,))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


@bp.route("/<int:item_id>/drills", methods=["POST"])
def submit_drill(item_id):
    conn = get_db()
    row = conn.execute("SELECT * FROM memorization_items WHERE id = ?", (item_id,)).fetchone()
    if not row:
        conn.close()
        return jsonify({"error": "Not found"}), 404

    data = request.json
    chunk_index = data.get("chunk_index", 0)
    mode = data.get("mode")
    score = data.get("score")
    time_spent_seconds = data.get("time_spent_seconds")
    mistakes = data.get("mistakes")

    if mode is None or score is None:
        conn.close()
        return jsonify({"error": "mode and score are required"}), 400

    mistakes_json = json.dumps(mistakes) if mistakes is not None else None

    conn.execute(
        "INSERT INTO memorization_drill_results (item_id, chunk_index, mode, score, time_spent_seconds, mistakes_json) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (item_id, chunk_index, mode, score, time_spent_seconds, mistakes_json),
    )
    conn.commit()

    recalculate_mastery(conn, item_id)

    updated = conn.execute("SELECT * FROM memorization_items WHERE id = ?", (item_id,)).fetchone()
    conn.close()
    return jsonify(item_to_dict(updated))


@bp.route("/due")
def get_due_items():
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM memorization_items "
        "WHERE next_review_at <= datetime('now') OR next_review_at IS NULL "
        "ORDER BY next_review_at ASC"
    ).fetchall()
    conn.close()
    return jsonify([item_to_dict(r) for r in rows])
