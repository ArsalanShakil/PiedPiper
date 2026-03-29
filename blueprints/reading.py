"""Reading exam — stories have built-in questions, news uses pre-generated."""
import json
import random

from flask import Blueprint, jsonify, request

from config import KNOWLEDGE_DIR
from blueprints.ai import ask_claude

bp = Blueprint("reading", __name__, url_prefix="/api/reading")

QUESTIONS_FILE = KNOWLEDGE_DIR / "pregenerated_questions.json"
STORIES_FILE = KNOWLEDGE_DIR / "Reading" / "stories_parsed.json"


def _get_all_passages():
    """Merge story chapters (with built-in Qs) + news articles (pre-generated Qs)."""
    passages = []

    # Stories with built-in questions
    if STORIES_FILE.exists():
        stories = json.loads(STORIES_FILE.read_text(encoding="utf-8"))
        for ch in stories:
            passages.append({
                "title": f"{ch['story']} — {ch['chapter']}",
                "text": ch["text"],
                "source": ch["story"],
                "category": "stories",
                "questions": ch["questions"],
            })

    # News with pre-generated questions
    if QUESTIONS_FILE.exists():
        pregen = json.loads(QUESTIONS_FILE.read_text(encoding="utf-8"))
        for key, data in pregen.items():
            if data.get("category") == "news":
                passages.append({
                    "title": data["title"],
                    "text": data["text"],
                    "source": data.get("source", "8sidor.se"),
                    "category": "news",
                    "questions": data.get("questions", []),
                })

    return passages


@bp.route("/passages")
def list_passages():
    passages = _get_all_passages()
    # Group by source for nicer browsing
    return jsonify([{
        "title": p["title"], "source": p["source"], "category": p["category"],
        "length": len(p["text"]), "index": i, "num_questions": len(p["questions"]),
    } for i, p in enumerate(passages)])


@bp.route("/categories")
def list_categories():
    return jsonify(list(set(p["category"] for p in _get_all_passages())))


@bp.route("/stories")
def list_stories():
    """List story names for browsing."""
    if not STORIES_FILE.exists():
        return jsonify([])
    stories = json.loads(STORIES_FILE.read_text(encoding="utf-8"))
    grouped = {}
    for ch in stories:
        if ch["story"] not in grouped:
            grouped[ch["story"]] = []
        grouped[ch["story"]].append(ch["chapter"])
    return jsonify([{"name": name, "chapters": chs} for name, chs in grouped.items()])


@bp.route("/passage/<int:index>", methods=["POST"])
def get_passage(index):
    passages = _get_all_passages()
    if index < 0 or index >= len(passages):
        return jsonify({"error": "Invalid index"}), 404
    p = passages[index]
    return jsonify({"passages": [{
        "title": p["title"], "text": p["text"], "source": p["source"], "questions": p["questions"],
    }]})


@bp.route("/generate", methods=["POST"])
def generate_reading():
    data = request.json or {}
    category = data.get("category", "")
    num_passages = data.get("num_passages", 3)

    passages = _get_all_passages()
    if category:
        passages = [p for p in passages if p["category"] == category]
    if not passages:
        return jsonify({"error": "No passages available"}), 404

    selected = random.sample(passages, min(num_passages, len(passages)))
    return jsonify({"passages": [{
        "title": p["title"], "text": p["text"], "source": p["source"], "questions": p["questions"],
    } for p in selected]})


@bp.route("/evaluate", methods=["POST"])
def evaluate_reading():
    data = request.json
    answers = data.get("answers", [])
    passages = data.get("passages", [])

    # Auto-grade MCQs where possible, use Claude for open questions
    total = 0
    correct = 0
    details = []

    idx = 0
    for p in passages:
        for q in p.get("questions", []):
            ans = answers[idx] if idx < len(answers) else ""
            idx += 1
            total += 1

            if q.get("correct"):
                is_correct = ans.strip().lower() == q["correct"].strip().lower()
                if is_correct:
                    correct += 1
                details.append({"correct": is_correct, "your_answer": ans, "correct_answer": q["correct"]})
            else:
                details.append({"correct": None, "your_answer": ans, "correct_answer": "open question"})

    score = round(correct / total * 100) if total > 0 else 0
    feedback = f"You got {correct} out of {total} correct ({score}%)."

    # For open questions or more detailed feedback, optionally use Claude
    if any(d["correct"] is None for d in details):
        feedback += " Open questions need manual review or AI evaluation."

    return jsonify({"score": score, "feedback": feedback, "details": details})
