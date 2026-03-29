"""Writing exam blueprint — uses bundled YKI templates for practice + mock."""
import json
import random
import re

from flask import Blueprint, jsonify, request

from config import KNOWLEDGE_DIR
from blueprints.ai import ask_claude

bp = Blueprint("writing", __name__, url_prefix="/api/writing")

TASK_TYPES = [
    {"type": "informal", "label": "Informellt mejl", "word_limit": 80, "time_minutes": 18},
    {"type": "complaint", "label": "Klagomål", "word_limit": 100, "time_minutes": 18},
    {"type": "review", "label": "Recension", "word_limit": 100, "time_minutes": 18},
    {"type": "argumentative", "label": "Argumenterande text", "word_limit": 120, "time_minutes": 18},
]


def _load_writing_prompts():
    """Parse writing templates into structured prompts."""
    prompts = {"informal": [], "complaint": [], "review": [], "argumentative": []}
    writing_dir = KNOWLEDGE_DIR / "Writing"
    if not writing_dir.exists():
        return prompts

    for f in sorted(writing_dir.iterdir()):
        if f.suffix != ".md":
            continue
        text = f.read_text(encoding="utf-8")
        fname = f.name.lower()

        if "informella" in fname:
            cat = "informal"
        elif "klagomal" in fname or "klagomål" in fname:
            cat = "complaint"
        elif "recension" in fname:
            cat = "review"
        elif "argumenterande" in fname:
            cat = "argumentative"
        else:
            continue

        # Parse numbered sections: ## 1. (Topic) Title
        sections = re.split(r'^## \d+\.\s*', text, flags=re.MULTILINE)
        for sec in sections[1:]:
            lines = sec.strip().split('\n')
            title = lines[0].strip() if lines else ""
            body = '\n'.join(lines[1:]).strip()

            # Extract template text (the actual Swedish example)
            template_match = re.search(r'(?:Hej|Många|Vissa|Jag|Restaurang|Hotell|Gym|Café|Stadium|Frisör|Power|Zalando|Bilverkstad|Bussbolaget|Hälsocentralen).*', body, re.DOTALL)
            template = template_match.group(0).strip() if template_match else ""

            if title:
                prompts[cat].append({
                    "title": title,
                    "template": template,
                })

    return prompts


_cached_prompts = None
def get_prompts():
    global _cached_prompts
    if _cached_prompts is None:
        _cached_prompts = _load_writing_prompts()
    return _cached_prompts


@bp.route("/types")
def list_types():
    return jsonify(TASK_TYPES)


@bp.route("/prompts")
def list_prompts():
    """List all available prompts by type."""
    prompts = get_prompts()
    result = {}
    for cat, items in prompts.items():
        result[cat] = [{"title": p["title"], "index": i} for i, p in enumerate(items)]
    return jsonify(result)


@bp.route("/generate-mock", methods=["POST"])
def generate_mock():
    """Generate a full writing mock exam: 3 tasks."""
    prompts = get_prompts()
    tasks = []

    # Task 1: Informal
    if prompts["informal"]:
        p = random.choice(prompts["informal"])
        tasks.append({"type": "informal", "label": "Informellt mejl", "prompt": p["title"],
                       "template": p.get("template", ""), "word_limit": 80, "time_minutes": 18})

    # Task 2: Complaint or Review (random)
    cat2 = random.choice(["complaint", "review"])
    if prompts[cat2]:
        p = random.choice(prompts[cat2])
        label = "Klagomål" if cat2 == "complaint" else "Recension"
        tasks.append({"type": cat2, "label": label, "prompt": p["title"],
                       "template": p.get("template", ""), "word_limit": 100, "time_minutes": 18})

    # Task 3: Argumentative
    if prompts["argumentative"]:
        p = random.choice(prompts["argumentative"])
        tasks.append({"type": "argumentative", "label": "Argumenterande text", "prompt": p["title"],
                       "template": p.get("template", ""), "word_limit": 120, "time_minutes": 18})

    return jsonify({"tasks": tasks, "total_minutes": 54})


@bp.route("/generate-practice", methods=["POST"])
def generate_practice():
    """Generate a single writing task for practice."""
    data = request.json or {}
    task_type = data.get("type", "")
    index = data.get("index", -1)

    prompts = get_prompts()
    if task_type and task_type in prompts and prompts[task_type]:
        pool = prompts[task_type]
        if 0 <= index < len(pool):
            p = pool[index]
        else:
            p = random.choice(pool)

        info = next((t for t in TASK_TYPES if t["type"] == task_type), TASK_TYPES[0])
        return jsonify({
            "type": task_type, "label": info["label"], "prompt": p["title"],
            "template": p["template"], "word_limit": info["word_limit"],
            "time_minutes": info["time_minutes"],
        })

    # Random type
    all_items = []
    for cat, items in prompts.items():
        for i, p in enumerate(items):
            info = next((t for t in TASK_TYPES if t["type"] == cat), TASK_TYPES[0])
            all_items.append({"type": cat, "label": info["label"], "prompt": p["title"],
                              "template": p["template"], "word_limit": info["word_limit"],
                              "time_minutes": info["time_minutes"]})
    if all_items:
        return jsonify(random.choice(all_items))
    return jsonify({"error": "No prompts available"}), 404


@bp.route("/evaluate", methods=["POST"])
def evaluate_writing():
    """Evaluate writing via Claude with knowledge base reference."""
    data = request.json
    tasks = data.get("tasks", [])
    answers = data.get("answers", [])

    system = (
        "You are a YKI Swedish writing exam evaluator (B1-B2, CEFR). "
        "Evaluate against: task completion, vocabulary range, grammar, coherence, word count. "
        "Return ONLY valid JSON: {\"score\": 0-100, \"feedback\": \"overall\", "
        "\"task_feedback\": [{\"score\": 0-100, \"feedback\": \"...\"}]}"
    )

    prompt = "Evaluate these YKI writing tasks:\n\n"
    for i, task in enumerate(tasks):
        ans = answers[i] if i < len(answers) else ""
        prompt += f"Task {i+1} ({task.get('label', '')}): {task.get('prompt', '')}\n"
        prompt += f"Word limit: ~{task.get('word_limit', 80)} words\n"
        prompt += f"Student wrote: \"{ans}\"\n\n"

    raw = ask_claude(prompt, system=system, use_knowledge=True, timeout=180)
    try:
        start = raw.find("{")
        end = raw.rfind("}") + 1
        if start >= 0 and end > start:
            return jsonify(json.loads(raw[start:end]))
    except (json.JSONDecodeError, ValueError):
        pass
    return jsonify({"score": 0, "feedback": raw[:500], "task_feedback": []})
