"""Listening exam blueprint — uses pre-generated questions + cached TTS audio."""
import json
import hashlib
import subprocess
import random

from flask import Blueprint, jsonify, request, send_file

from config import KNOWLEDGE_DIR, OUTPUT_DIR, VOICES_DIR
from blueprints.ai import ask_claude

bp = Blueprint("listening", __name__, url_prefix="/api/listening")

QUESTIONS_FILE = KNOWLEDGE_DIR / "pregenerated_questions.json"


def _load_pregenerated():
    if QUESTIONS_FILE.exists():
        return json.loads(QUESTIONS_FILE.read_text(encoding="utf-8"))
    return {}


def _get_clips():
    """Get all clips with pre-generated questions and audio URLs."""
    pregen = _load_pregenerated()
    clips = []
    for key, data in pregen.items():
        clips.append({
            "key": key,
            "title": data["title"],
            "text": data["text"],
            "source": data.get("source", ""),
            "category": data.get("category", ""),
            "questions": data.get("questions", []),
            "audio_url": data.get("audio_url", ""),
        })
    return clips


def _synthesize(text):
    text_hash = hashlib.sha256(text.encode()).hexdigest()[:16]
    audio_dir = OUTPUT_DIR / "audio_cache"
    audio_dir.mkdir(exist_ok=True)
    audio_path = audio_dir / f"listen_{text_hash}.wav"

    if audio_path.exists():
        return f"/api/listening/audio/{text_hash}"

    voices = [v for v in VOICES_DIR.glob("*.onnx") if not v.name.endswith(".onnx.json")]
    if not voices:
        return None

    try:
        subprocess.run(
            ["piper", "--model", str(voices[0]), "--output_file", str(audio_path)],
            input=text, capture_output=True, text=True, timeout=120,
        )
    except Exception:
        return None

    return f"/api/listening/audio/{text_hash}"


@bp.route("/audio/<hash_id>")
def serve_audio(hash_id):
    audio_path = OUTPUT_DIR / "audio_cache" / f"listen_{hash_id}.wav"
    if not audio_path.exists():
        return jsonify({"error": "Not found"}), 404
    return send_file(audio_path)


@bp.route("/passages")
def list_passages():
    clips = _get_clips()
    return jsonify([{"title": c["title"], "source": c["source"], "category": c["category"],
                     "index": i, "has_audio": bool(c["audio_url"])}
                    for i, c in enumerate(clips)])


@bp.route("/categories")
def list_categories():
    return jsonify(list(set(c["category"] for c in _get_clips())))


@bp.route("/clip/<int:index>", methods=["POST"])
def get_clip(index):
    clips = _get_clips()
    if index < 0 or index >= len(clips):
        return jsonify({"error": "Invalid index"}), 404

    c = clips[index]
    audio_url = c["audio_url"] or _synthesize(c["text"])
    questions = c["questions"]
    if not questions:
        questions = _generate_questions(c["text"], c["title"])

    return jsonify({"clips": [{
        "title": c["title"], "audio_url": audio_url, "questions": questions, "text": c["text"],
    }]})


@bp.route("/generate", methods=["POST"])
def generate_listening():
    data = request.json or {}
    category = data.get("category", "")
    num_clips = data.get("num_clips", 2)

    clips = _get_clips()
    if category:
        clips = [c for c in clips if c["category"] == category]
    if not clips:
        return jsonify({"error": "No clips available. Run: python3 pregenerate.py"}), 404

    selected = random.sample(clips, min(num_clips, len(clips)))

    result = []
    for c in selected:
        audio_url = c["audio_url"] or _synthesize(c["text"])
        questions = c["questions"]
        if not questions:
            questions = _generate_questions(c["text"], c["title"])
        result.append({
            "title": c["title"], "audio_url": audio_url, "questions": questions, "text": c["text"],
        })

    return jsonify({"clips": result})


def _generate_questions(text, title):
    system = (
        "You are a YKI Swedish listening exam question generator (B1-B2). "
        "Return ONLY valid JSON."
    )
    prompt = (
        f"This Swedish text is played as audio:\n\"{text[:1200]}\"\n\n"
        f"Create 3 questions in Swedish:\n- 1 mc (options A/B/C, correct)\n- 1 tf (correct: sant/falskt)\n- 1 open\n\n"
        f"Return JSON: {{\"questions\": [...]}}"
    )
    raw = ask_claude(prompt, system=system, timeout=120)
    try:
        start = raw.find("{")
        end = raw.rfind("}") + 1
        if start >= 0 and end > start:
            return json.loads(raw[start:end]).get("questions", [])
    except (json.JSONDecodeError, ValueError):
        pass
    return [{"type": "open", "question": "Vad handlade texten om?"}]


@bp.route("/evaluate", methods=["POST"])
def evaluate_listening():
    data = request.json
    answers = data.get("answers", [])
    clips = data.get("clips", [])

    system = (
        "You are a YKI Swedish listening evaluator (B1-B2). "
        "Return ONLY valid JSON: {\"score\": 0-100, \"feedback\": \"...\"}"
    )
    prompt = "Evaluate these listening answers:\n\n"
    for i, c in enumerate(clips):
        prompt += f"Clip: {c['title']}\nText: {c.get('text', '')[:500]}\n"
        for j, q in enumerate(c.get('questions', [])):
            idx = sum(len(clips[k].get('questions', [])) for k in range(i)) + j
            ans = answers[idx] if idx < len(answers) else ""
            prompt += f"  Q: {q['question']}  Answer: {ans}  Correct: {q.get('correct', '')}\n"

    raw = ask_claude(prompt, system=system, timeout=120)
    try:
        start = raw.find("{")
        end = raw.rfind("}") + 1
        if start >= 0 and end > start:
            return jsonify(json.loads(raw[start:end]))
    except (json.JSONDecodeError, ValueError):
        pass
    return jsonify({"score": 0, "feedback": raw[:500]})
