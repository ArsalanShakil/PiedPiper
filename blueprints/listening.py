"""Listening exam blueprint — converts reading passages to TTS audio + questions."""
import json
import hashlib
import subprocess
import random
import re

from flask import Blueprint, jsonify, request, send_file

from config import KNOWLEDGE_DIR, OUTPUT_DIR, VOICES_DIR
from blueprints.ai import ask_claude

bp = Blueprint("listening", __name__, url_prefix="/api/listening")


def _load_passages():
    """Load passages suitable for listening from knowledge base."""
    passages = []
    listen_dir = KNOWLEDGE_DIR / "Listening"
    if not listen_dir.exists():
        return passages

    for f in sorted(listen_dir.iterdir()):
        if f.suffix not in (".md", ".txt"):
            continue
        text = f.read_text(encoding="utf-8")

        if "8sidor" in f.name:
            articles = re.split(r'^## (.+)', text, flags=re.MULTILINE)
            for i in range(1, len(articles) - 1, 2):
                title = articles[i].strip()
                body = articles[i + 1].strip()
                if len(body) > 50:
                    passages.append({"title": title, "text": body, "source": "8sidor.se", "category": "news"})
        elif "stories" in f.name:
            chapters = re.split(r'^## (Kapitel .+)', text, flags=re.MULTILINE)
            for i in range(1, len(chapters) - 1, 2):
                title = chapters[i].strip()
                body = chapters[i + 1].strip()[:1500]
                if len(body) > 100:
                    passages.append({"title": title, "text": body, "source": "Short Stories", "category": "stories"})

    return passages


_cached = None
def get_passages():
    global _cached
    if _cached is None:
        _cached = _load_passages()
    return _cached


def _synthesize(text):
    """Convert text to audio, return URL path."""
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
    return jsonify([{"title": p["title"], "source": p["source"], "category": p["category"]}
                     for p in get_passages()])


@bp.route("/categories")
def list_categories():
    return jsonify(list(set(p["category"] for p in get_passages())))


@bp.route("/clip/<int:index>", methods=["POST"])
def generate_for_clip(index):
    """Generate audio + questions for a specific passage."""
    passages = get_passages()
    if index < 0 or index >= len(passages):
        return jsonify({"error": "Invalid index"}), 404

    p = passages[index]
    audio_url = _synthesize(p["text"])

    system = (
        "You are a YKI Swedish listening exam question generator (B1-B2). "
        "Generate comprehension questions for text that will be heard as audio. "
        "Return ONLY valid JSON."
    )
    prompt = (
        f"This Swedish text will be played as audio:\n\"{p['text'][:1200]}\"\n\n"
        f"Create 3 comprehension questions in Swedish:\n"
        f"- 1 multiple choice (type: 'mc', options A/B/C, correct answer)\n"
        f"- 1 true/false (type: 'tf', correct: 'sant'/'falskt')\n"
        f"- 1 open question (type: 'open')\n\n"
        f"Return JSON: {{\"questions\": [...]}}"
    )
    raw = ask_claude(prompt, system=system, timeout=120)
    questions = []
    try:
        start = raw.find("{")
        end = raw.rfind("}") + 1
        if start >= 0 and end > start:
            questions = json.loads(raw[start:end]).get("questions", [])
    except (json.JSONDecodeError, ValueError):
        questions = [{"type": "open", "question": "Vad handlade texten om?"}]

    return jsonify({"clips": [{"title": p["title"], "audio_url": audio_url, "questions": questions, "text": p["text"]}]})


@bp.route("/generate", methods=["POST"])
def generate_listening():
    data = request.json or {}
    category = data.get("category", "")
    num_clips = data.get("num_clips", 2)

    passages = get_passages()
    if category:
        passages = [p for p in passages if p["category"] == category]
    if not passages:
        return jsonify({"error": "No passages available"}), 404

    selected = random.sample(passages, min(num_clips, len(passages)))

    system = (
        "You are a YKI Swedish listening exam question generator (B1-B2). "
        "Generate comprehension questions for text that will be heard as audio. "
        "Return ONLY valid JSON."
    )

    clips = []
    for p in selected:
        # Synthesize audio
        audio_url = _synthesize(p["text"])

        prompt = (
            f"This Swedish text will be played as audio:\n\"{p['text'][:1200]}\"\n\n"
            f"Create 3 comprehension questions in Swedish:\n"
            f"- 1 multiple choice (type: 'mc', options A/B/C, correct answer)\n"
            f"- 1 true/false (type: 'tf', correct: 'sant'/'falskt')\n"
            f"- 1 open question (type: 'open')\n\n"
            f"Return JSON: {{\"questions\": [...]}}"
        )

        raw = ask_claude(prompt, system=system, timeout=120)
        questions = []
        try:
            start = raw.find("{")
            end = raw.rfind("}") + 1
            if start >= 0 and end > start:
                questions = json.loads(raw[start:end]).get("questions", [])
        except (json.JSONDecodeError, ValueError):
            questions = [{"type": "open", "question": "Vad handlade texten om?"}]

        clips.append({
            "title": p["title"],
            "audio_url": audio_url,
            "questions": questions,
            "text": p["text"],  # Include for evaluation
        })

    return jsonify({"clips": clips})


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
        prompt += f"Clip: {c['title']}\nOriginal text: {c.get('text', '')[:500]}\n"
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
