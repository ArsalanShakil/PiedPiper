import json
import hashlib
import subprocess
from pathlib import Path

from flask import Blueprint, jsonify, request

from config import OUTPUT_DIR, VOICES_DIR
from db import get_db
from blueprints.ai import ask_claude

bp = Blueprint("yki", __name__, url_prefix="/api/yki")

YKI_TOPICS = [
    "Personal background", "Home and housing", "Shops and services",
    "Culture", "Travelling", "Health and wellbeing",
    "Work", "The environment", "Society"
]


@bp.route("/topics")
def get_topics():
    return jsonify(YKI_TOPICS)


@bp.route("/generate", methods=["POST"])
def generate_exam():
    data = request.json
    exam_type = data.get("exam_type", "reading")
    topic = data.get("topic", "")

    conn = get_db()
    cur = conn.execute(
        "INSERT INTO exam_sessions (exam_type, topic) VALUES (?, ?)",
        (exam_type, topic),
    )
    session_id = cur.lastrowid
    conn.commit()

    if exam_type == "reading":
        result = _generate_reading(session_id, topic, conn)
    elif exam_type == "writing":
        result = _generate_writing(session_id, topic, conn)
    elif exam_type == "listening":
        result = _generate_listening(session_id, topic, conn)
    elif exam_type == "speaking":
        result = _generate_speaking(session_id, topic, conn)
    else:
        conn.close()
        return jsonify({"error": "Invalid exam type"}), 400

    conn.close()
    return jsonify(result)


def _generate_reading(session_id, topic, conn):
    system = (
        "You are a YKI Swedish exam generator for intermediate level (B1-B2). "
        "Generate a reading comprehension exam. Return ONLY valid JSON."
    )
    prompt = (
        f"Generate a Swedish YKI reading exam{f' about {topic}' if topic else ''}. "
        "Create 2 passages (150-200 words each in Swedish) with 3 questions each. "
        "Return JSON: {\"passages\": [{\"text\": \"...\", \"questions\": [{\"question\": \"...\", "
        "\"type\": \"multiple_choice\", \"options\": [\"A\",\"B\",\"C\"], \"correct\": \"B\"}]}]}"
    )
    return _generate_and_store(session_id, system, prompt, conn, "reading")


def _generate_writing(session_id, topic, conn):
    system = (
        "You are a YKI Swedish exam generator for intermediate level (B1-B2). "
        "Generate writing prompts matching real YKI format. Return ONLY valid JSON."
    )
    prompt = (
        f"Generate 3 YKI Swedish writing tasks{f' related to {topic}' if topic else ''}:\n"
        "Task 1: Informal email to a friend (60-80 words)\n"
        "Task 2: Formal complaint or review (80-100 words)\n"
        "Task 3: Argumentative essay (100-120 words)\n"
        "Return JSON: {\"tasks\": [{\"type\": \"informal\", \"prompt\": \"...\", \"word_limit\": 80, \"time_minutes\": 18}]}"
    )
    return _generate_and_store(session_id, system, prompt, conn, "writing")


def _generate_listening(session_id, topic, conn):
    system = (
        "You are a YKI Swedish exam generator for intermediate level (B1-B2). "
        "Generate listening comprehension scripts and questions. Return ONLY valid JSON."
    )
    prompt = (
        f"Generate 2 Swedish listening scripts{f' about {topic}' if topic else ''} for YKI intermediate level. "
        "Each script should be 80-120 words of natural spoken Swedish. "
        "Include 3 questions per script. "
        "Return JSON: {\"clips\": [{\"script\": \"...\", \"title\": \"...\", "
        "\"questions\": [{\"question\": \"...\", \"type\": \"multiple_choice\", "
        "\"options\": [\"A\",\"B\",\"C\"], \"correct\": \"A\"}]}]}"
    )
    return _generate_and_store(session_id, system, prompt, conn, "listening")


def _generate_speaking(session_id, topic, conn):
    system = (
        "You are a YKI Swedish exam generator for intermediate level (B1-B2). "
        "Generate speaking prompts matching real YKI format. Return ONLY valid JSON."
    )
    prompt = (
        f"Generate a YKI Swedish speaking exam{f' about {topic}' if topic else ''} with 4 parts:\n"
        "Part 1: 2 personal questions with sub-questions (1.5 min to answer)\n"
        "Part 2: A conversation scenario with prompts\n"
        "Part 3: 3 situational responses (20-30s prep + 20-30s answer each)\n"
        "Part 4: A monologue topic with sub-questions (1.5 min prep + 2 min speak)\n"
        "Return JSON: {\"parts\": [{\"part\": 1, \"title\": \"...\", \"instructions\": \"...\", "
        "\"prompts\": [\"...\"], \"prep_seconds\": 0, \"answer_seconds\": 90}]}"
    )
    return _generate_and_store(session_id, system, prompt, conn, "speaking")


def _generate_and_store(session_id, system, prompt, conn, exam_type):
    raw = ask_claude(prompt, system=system, use_knowledge=True, timeout=180)

    # Parse JSON
    parsed = None
    try:
        start = raw.find("{")
        end = raw.rfind("}") + 1
        if start >= 0 and end > start:
            parsed = json.loads(raw[start:end])
    except (json.JSONDecodeError, ValueError):
        pass

    if not parsed:
        conn.execute(
            "UPDATE exam_sessions SET status = 'error', feedback_json = ? WHERE id = ?",
            (json.dumps({"error": "Failed to parse AI response", "raw": raw[:500]}), session_id),
        )
        conn.commit()
        return {"session_id": session_id, "error": "Failed to generate exam. Try again.", "raw_preview": raw[:200]}

    # Store questions
    conn.execute(
        "UPDATE exam_sessions SET feedback_json = ? WHERE id = ?",
        (json.dumps(parsed), session_id),
    )
    conn.commit()

    return {"session_id": session_id, "exam_type": exam_type, "data": parsed}


@bp.route("/submit", methods=["POST"])
def submit_exam():
    data = request.json
    session_id = data.get("session_id")
    answers = data.get("answers", {})
    time_spent = data.get("time_spent_seconds", 0)

    conn = get_db()
    session = conn.execute("SELECT * FROM exam_sessions WHERE id = ?", (session_id,)).fetchone()
    if not session:
        conn.close()
        return jsonify({"error": "Session not found"}), 404

    exam_data = json.loads(session["feedback_json"]) if session["feedback_json"] else {}

    conn.execute(
        "UPDATE exam_sessions SET status = 'completed', completed_at = datetime('now'), time_spent_seconds = ? WHERE id = ?",
        (time_spent, session_id),
    )
    conn.commit()
    conn.close()

    return jsonify({"ok": True, "session_id": session_id})


@bp.route("/evaluate", methods=["POST"])
def evaluate_answers():
    data = request.json
    exam_type = data.get("exam_type", "")
    answers = data.get("answers", [])
    exam_data = data.get("exam_data", {})

    system = (
        "You are a YKI Swedish exam evaluator for intermediate level (B1-B2). "
        "Evaluate the student's answers against CEFR B1-B2 criteria. "
        "Return ONLY valid JSON."
    )

    prompt = f"Evaluate these {exam_type} exam answers:\n\n"
    prompt += f"Exam data: {json.dumps(exam_data, ensure_ascii=False)}\n\n"
    prompt += f"Student answers: {json.dumps(answers, ensure_ascii=False)}\n\n"
    prompt += (
        "Return JSON: {\"score\": 0-100, \"feedback\": \"overall feedback\", "
        "\"details\": [{\"question\": 1, \"correct\": true/false, \"feedback\": \"...\"}]}"
    )

    raw = ask_claude(prompt, system=system, use_knowledge=True, timeout=180)

    try:
        start = raw.find("{")
        end = raw.rfind("}") + 1
        if start >= 0 and end > start:
            return jsonify(json.loads(raw[start:end]))
    except (json.JSONDecodeError, ValueError):
        pass

    return jsonify({"score": 0, "feedback": raw[:500], "details": []})


@bp.route("/synthesize-script", methods=["POST"])
def synthesize_script():
    """Convert a listening script to audio via Piper TTS, with caching."""
    data = request.json
    text = data.get("text", "").strip()
    if not text:
        return jsonify({"error": "No text"}), 400

    text_hash = hashlib.sha256(text.encode()).hexdigest()[:16]

    # Check cache
    conn = get_db()
    cached = conn.execute(
        "SELECT * FROM audio_cache WHERE text_hash = ?", (text_hash,)
    ).fetchone()

    if cached and Path(cached["audio_path"]).exists():
        conn.close()
        return jsonify({"audio_path": cached["audio_path"], "cached": True})

    # Generate with Piper
    voices = list(VOICES_DIR.glob("*.onnx"))
    voices = [v for v in voices if not v.name.endswith(".onnx.json")]
    if not voices:
        conn.close()
        return jsonify({"error": "No voice model found"}), 500

    audio_dir = OUTPUT_DIR / "audio_cache"
    audio_dir.mkdir(exist_ok=True)
    audio_path = audio_dir / f"{text_hash}.wav"

    try:
        proc = subprocess.run(
            ["piper", "--model", str(voices[0]), "--output_file", str(audio_path)],
            input=text, capture_output=True, text=True, timeout=60,
        )
        if proc.returncode != 0:
            conn.close()
            return jsonify({"error": f"TTS error: {proc.stderr}"}), 500
    except subprocess.TimeoutExpired:
        conn.close()
        return jsonify({"error": "TTS timed out"}), 500

    # Cache it
    conn.execute(
        "INSERT OR REPLACE INTO audio_cache (text_hash, text_content, audio_path, voice_id) VALUES (?, ?, ?, ?)",
        (text_hash, text, str(audio_path), voices[0].stem),
    )
    conn.commit()
    conn.close()

    return jsonify({"audio_path": str(audio_path), "cached": False})


@bp.route("/audio-cache/play")
def play_cached_audio():
    """Serve a cached audio file."""
    path = request.args.get("path", "")
    if not path or ".." in path:
        return jsonify({"error": "Invalid path"}), 400
    from flask import send_file
    p = Path(path)
    if not p.exists():
        return jsonify({"error": "Not found"}), 404
    return send_file(p)


@bp.route("/sessions")
def list_sessions():
    conn = get_db()
    rows = conn.execute(
        "SELECT id, exam_type, topic, status, started_at, completed_at, total_score, time_spent_seconds "
        "FROM exam_sessions ORDER BY started_at DESC LIMIT 50"
    ).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])
