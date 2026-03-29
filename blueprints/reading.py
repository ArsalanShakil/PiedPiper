"""Reading exam blueprint — uses pre-generated questions, falls back to Claude."""
import json
import random
import re

from flask import Blueprint, jsonify, request

from config import KNOWLEDGE_DIR
from blueprints.ai import ask_claude

bp = Blueprint("reading", __name__, url_prefix="/api/reading")

QUESTIONS_FILE = KNOWLEDGE_DIR / "pregenerated_questions.json"


def _load_pregenerated():
    if QUESTIONS_FILE.exists():
        return json.loads(QUESTIONS_FILE.read_text(encoding="utf-8"))
    return {}


def _get_passages():
    """Get all passages with pre-generated questions."""
    pregen = _load_pregenerated()
    passages = []
    for key, data in pregen.items():
        passages.append({
            "key": key,
            "title": data["title"],
            "text": data["text"],
            "source": data.get("source", ""),
            "category": data.get("category", ""),
            "questions": data.get("questions", []),
            "length": len(data["text"]),
        })
    return passages


@bp.route("/passages")
def list_passages():
    passages = _get_passages()
    return jsonify([{"title": p["title"], "source": p["source"], "category": p["category"],
                     "length": p["length"], "index": i, "has_questions": len(p["questions"]) > 0}
                    for i, p in enumerate(passages)])


@bp.route("/categories")
def list_categories():
    return jsonify(list(set(p["category"] for p in _get_passages())))


@bp.route("/passage/<int:index>", methods=["POST"])
def get_passage(index):
    passages = _get_passages()
    if index < 0 or index >= len(passages):
        return jsonify({"error": "Invalid index"}), 404

    p = passages[index]
    questions = p["questions"]

    # If no pre-generated questions, generate on the fly
    if not questions:
        questions = _generate_questions(p["text"], p["title"])

    return jsonify({"passages": [{
        "title": p["title"], "text": p["text"], "source": p["source"], "questions": questions,
    }]})


@bp.route("/generate", methods=["POST"])
def generate_reading():
    data = request.json or {}
    category = data.get("category", "")
    num_passages = data.get("num_passages", 3)

    passages = _get_passages()
    if category:
        passages = [p for p in passages if p["category"] == category]
    if not passages:
        return jsonify({"error": "No passages available. Run: python3 pregenerate.py"}), 404

    selected = random.sample(passages, min(num_passages, len(passages)))

    result = []
    for p in selected:
        questions = p["questions"]
        if not questions:
            questions = _generate_questions(p["text"], p["title"])
        result.append({
            "title": p["title"], "text": p["text"], "source": p["source"], "questions": questions,
        })

    return jsonify({"passages": result})


def _generate_questions(text, title):
    system = (
        "You are a YKI Swedish reading exam question generator (intermediate B1-B2). "
        "Return ONLY valid JSON."
    )
    prompt = (
        f"Read this Swedish text and create 3 questions.\n\nTitle: \"{title}\"\nText: \"{text[:1500]}\"\n\n"
        f"- 1 mc (type:'mc', options A/B/C, correct)\n- 1 tf (type:'tf', correct:'sant'/'falskt')\n- 1 open (type:'open')\n\n"
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
    return [{"type": "open", "question": "Vad handlar texten om?"}]


@bp.route("/evaluate", methods=["POST"])
def evaluate_reading():
    data = request.json
    answers = data.get("answers", [])
    passages = data.get("passages", [])

    system = (
        "You are a YKI Swedish reading exam evaluator (B1-B2). "
        "Return ONLY valid JSON: {\"score\": 0-100, \"feedback\": \"...\"}"
    )
    prompt = "Evaluate these reading answers:\n\n"
    for i, p in enumerate(passages):
        prompt += f"Passage {i+1}: {p['title']}\n"
        for j, q in enumerate(p.get('questions', [])):
            ans = answers[i * 3 + j] if i * 3 + j < len(answers) else ""
            prompt += f"  Q: {q['question']}  Answer: {ans}  Correct: {q.get('correct', 'N/A')}\n"

    raw = ask_claude(prompt, system=system, timeout=120)
    try:
        start = raw.find("{")
        end = raw.rfind("}") + 1
        if start >= 0 and end > start:
            return jsonify(json.loads(raw[start:end]))
    except (json.JSONDecodeError, ValueError):
        pass
    return jsonify({"score": 0, "feedback": raw[:500]})
