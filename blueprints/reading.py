"""Reading exam blueprint — uses knowledge base content + Claude for questions."""
import json
import random
import re

from flask import Blueprint, jsonify, request

from config import KNOWLEDGE_DIR
from blueprints.ai import ask_claude
from db import get_db

bp = Blueprint("reading", __name__, url_prefix="/api/reading")


def _load_passages():
    """Load reading passages from knowledge base."""
    passages = []
    reading_dir = KNOWLEDGE_DIR / "Reading"
    if not reading_dir.exists():
        return passages

    for f in sorted(reading_dir.iterdir()):
        if f.suffix not in (".md", ".txt"):
            continue
        text = f.read_text(encoding="utf-8")

        if "8sidor" in f.name:
            # Split by ## headers into individual articles
            articles = re.split(r'^## (.+)', text, flags=re.MULTILINE)
            for i in range(1, len(articles) - 1, 2):
                title = articles[i].strip()
                body = articles[i + 1].strip()
                if len(body) > 50:
                    passages.append({
                        "title": title,
                        "text": body,
                        "source": "8sidor.se",
                        "category": "news",
                    })
        elif "stories" in f.name:
            # Split by ## Kapitel headers
            chapters = re.split(r'^## (Kapitel .+)', text, flags=re.MULTILINE)
            for i in range(1, len(chapters) - 1, 2):
                title = chapters[i].strip()
                body = chapters[i + 1].strip()[:2000]  # Limit chapter size
                if len(body) > 100:
                    passages.append({
                        "title": title,
                        "text": body,
                        "source": "Short Stories",
                        "category": "stories",
                    })

    return passages


_cached_passages = None

def get_passages():
    global _cached_passages
    if _cached_passages is None:
        _cached_passages = _load_passages()
    return _cached_passages


@bp.route("/passages")
def list_passages():
    passages = get_passages()
    return jsonify([{"title": p["title"], "source": p["source"], "category": p["category"],
                     "length": len(p["text"])} for p in passages])


@bp.route("/categories")
def list_categories():
    passages = get_passages()
    cats = list(set(p["category"] for p in passages))
    return jsonify(cats)


@bp.route("/generate", methods=["POST"])
def generate_reading():
    """Generate a reading exam — pick passages and generate questions via Claude."""
    data = request.json or {}
    category = data.get("category", "")
    num_passages = data.get("num_passages", 3)
    mode = data.get("mode", "mock")  # mock or practice

    passages = get_passages()
    if category:
        passages = [p for p in passages if p["category"] == category]

    if not passages:
        return jsonify({"error": "No passages available"}), 404

    selected = random.sample(passages, min(num_passages, len(passages)))

    # Generate questions for each passage via Claude
    system = (
        "You are a YKI Swedish reading exam question generator (intermediate B1-B2). "
        "Generate comprehension questions for the given Swedish text. "
        "Return ONLY valid JSON."
    )

    exam_passages = []
    for p in selected:
        prompt = (
            f"Read this Swedish text and create 3 questions about it.\n\n"
            f"Text: \"{p['text'][:1500]}\"\n\n"
            f"Create questions in Swedish. Include a mix of:\n"
            f"- 1 multiple choice question (type: 'mc', with options A, B, C and correct answer)\n"
            f"- 1 true/false question (type: 'tf', correct: 'sant' or 'falskt')\n"
            f"- 1 open question (type: 'open')\n\n"
            f"Return JSON: {{\"questions\": [{{\"type\": \"mc\", \"question\": \"...\", "
            f"\"options\": [\"A\", \"B\", \"C\"], \"correct\": \"B\"}}, "
            f"{{\"type\": \"tf\", \"question\": \"...\", \"correct\": \"sant\"}}, "
            f"{{\"type\": \"open\", \"question\": \"...\"}}]}}"
        )

        raw = ask_claude(prompt, system=system, timeout=120)
        questions = []
        try:
            start = raw.find("{")
            end = raw.rfind("}") + 1
            if start >= 0 and end > start:
                parsed = json.loads(raw[start:end])
                questions = parsed.get("questions", [])
        except (json.JSONDecodeError, ValueError):
            questions = [{"type": "open", "question": "Vad handlar texten om?"}]

        exam_passages.append({
            "title": p["title"],
            "text": p["text"],
            "source": p["source"],
            "questions": questions,
        })

    return jsonify({"passages": exam_passages, "mode": mode})


@bp.route("/evaluate", methods=["POST"])
def evaluate_reading():
    """Evaluate reading answers via Claude."""
    data = request.json
    answers = data.get("answers", [])
    passages = data.get("passages", [])

    system = (
        "You are a YKI Swedish reading exam evaluator (B1-B2). "
        "Evaluate the student's answers. Return ONLY valid JSON: "
        "{\"score\": 0-100, \"feedback\": \"...\", \"details\": [{\"correct\": true/false, \"feedback\": \"...\"}]}"
    )

    prompt = f"Evaluate these reading comprehension answers:\n\n"
    for i, p in enumerate(passages):
        prompt += f"Passage {i+1}: {p['title']}\n"
        for j, q in enumerate(p.get('questions', [])):
            ans = answers[i * 3 + j] if i * 3 + j < len(answers) else ""
            prompt += f"  Q: {q['question']}\n  Student answer: {ans}\n  Correct: {q.get('correct', 'N/A')}\n"
    prompt += "\nReturn JSON with score and feedback."

    raw = ask_claude(prompt, system=system, timeout=120)
    try:
        start = raw.find("{")
        end = raw.rfind("}") + 1
        if start >= 0 and end > start:
            return jsonify(json.loads(raw[start:end]))
    except (json.JSONDecodeError, ValueError):
        pass
    return jsonify({"score": 0, "feedback": raw[:500], "details": []})
