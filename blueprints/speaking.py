"""Speaking exam blueprint — parses bundled test data and serves structured exams."""
import json
import re
import random
import hashlib
import subprocess
from pathlib import Path

from flask import Blueprint, jsonify, request, send_file

from config import KNOWLEDGE_DIR, OUTPUT_DIR, VOICES_DIR, SPEAKING_TOPICS
from db import get_db

bp = Blueprint("speaking", __name__, url_prefix="/api/speaking")


def _parse_12_tests():
    """Parse the 12 full tests markdown into structured data."""
    path = KNOWLEDGE_DIR / "Speaking" / "yki-speaking-12-tests.md"
    if not path.exists():
        return []

    text = path.read_text(encoding="utf-8")
    tests = []
    # Split by PROV headers
    prov_splits = re.split(r'# PROV (\d+) — (.+)', text)

    # prov_splits: ['header', '1', 'topic1', 'content1', '2', 'topic2', 'content2', ...]
    i = 1
    while i < len(prov_splits) - 2:
        num = prov_splits[i]
        topic = prov_splits[i + 1].strip()
        content = prov_splits[i + 2]

        test = {"number": int(num), "topic": topic, "parts": []}

        # Parse DEL 1: DIALOGER
        dialogues = []
        dialog_blocks = re.split(r'### Dialog \d+[AB] — (.+)', content)
        for j in range(1, len(dialog_blocks) - 1, 2):
            title = dialog_blocks[j].strip()
            block = dialog_blocks[j + 1]
            # Extract situation
            sit_match = re.search(r'\*\*Situation:\*\*\s*(.+)', block)
            situation = sit_match.group(1).strip() if sit_match else ""
            # Extract table rows
            lines = []
            for row in re.findall(r'\|\s*(.+?)\s*\|\s*(.+?)\s*\|', block):
                if row[0].strip().startswith('---') or row[0].strip().startswith('Vän') or row[0].strip().startswith('Servitör') or row[0].strip().startswith('Säljare') or row[0].strip().startswith('Mäklare') or row[0].strip().startswith('Granne') or row[0].strip().startswith('Kollega') or row[0].strip().startswith('Läkare') or row[0].strip().startswith('Chef') or 'du hör' in row[0].lower():
                    continue
                prompt = row[0].strip()
                instruction = row[1].strip().strip('*()')
                if prompt and instruction:
                    lines.append({"prompt": prompt, "instruction": instruction})
            if lines:
                dialogues.append({"title": title, "situation": situation, "lines": lines})

        if dialogues:
            test["parts"].append({
                "part": 1, "type": "dialogues", "title": "Dialoger",
                "instructions": "Rollspel — lyssna på repliken och svara.",
                "items": dialogues,
                "prep_seconds": 20, "answer_seconds": 20,
            })

        # Parse DEL 2: REAGERA
        reagera_match = re.search(r'## DEL 2: REAGERA\s*\n(.*?)(?=\n## DEL 3|\Z)', content, re.DOTALL)
        if reagera_match:
            reagera_text = reagera_match.group(1)
            items = re.findall(r'\d+\.\s*\*\*(.+?)\*\*\s*(.+?)(?=\n\d+\.|\n---|\Z)', reagera_text, re.DOTALL)
            reagera_items = []
            for situation, instruction in items:
                reagera_items.append({
                    "situation": situation.strip(),
                    "instruction": instruction.strip(),
                })
            if reagera_items:
                test["parts"].append({
                    "part": 2, "type": "react", "title": "Reagera",
                    "instructions": "Korta vardagssituationer — reagera naturligt. Max 3 meningar.",
                    "items": reagera_items,
                    "prep_seconds": 20, "answer_seconds": 30,
                })

        # Parse DEL 3: BERÄTTA
        beratta_match = re.search(r'## DEL 3: BERÄTTA\s*\n(.*?)(?=\n## DEL 4|\Z)', content, re.DOTALL)
        if beratta_match:
            beratta_text = beratta_match.group(1)
            title_match = re.search(r'\*\*(.+?)\*\*', beratta_text)
            title = title_match.group(1) if title_match else "Berätta"
            bullets = re.findall(r'[-•]\s*(.+)', beratta_text)
            test["parts"].append({
                "part": 3, "type": "narrate", "title": "Berätta",
                "instructions": "Berätta fritt om ämnet.",
                "topic": title,
                "prompts": bullets,
                "prep_seconds": 60, "answer_seconds": 60,
            })

        # Parse DEL 4: DIN ÅSIKT
        asikt_match = re.search(r'## DEL 4: DIN ÅSIKT\s*\n(.*?)(?=\n---|\Z)', content, re.DOTALL)
        if asikt_match:
            asikt_text = asikt_match.group(1)
            title_match = re.search(r'\*\*(.+?)\*\*', asikt_text)
            title = title_match.group(1) if title_match else "Din åsikt"
            bullets = re.findall(r'[-•]\s*(.+)', asikt_text)
            test["parts"].append({
                "part": 4, "type": "opinion", "title": "Din åsikt",
                "instructions": "Argumentera muntligt för din ståndpunkt.",
                "topic": title,
                "prompts": bullets,
                "prep_seconds": 60, "answer_seconds": 90,
            })

        tests.append(test)
        i += 3

    return tests


# Cache parsed tests
_cached_tests = None

def get_tests():
    global _cached_tests
    if _cached_tests is None:
        _cached_tests = _parse_12_tests()
    return _cached_tests


@bp.route("/tests")
def list_tests():
    tests = get_tests()
    return jsonify([{"number": t["number"], "topic": t["topic"]} for t in tests])


@bp.route("/topics")
def list_topics():
    return jsonify(SPEAKING_TOPICS)


@bp.route("/test/<int:test_num>")
def get_test(test_num):
    tests = get_tests()
    test = next((t for t in tests if t["number"] == test_num), None)
    if not test:
        return jsonify({"error": "Test not found"}), 404
    return jsonify(test)


@bp.route("/random")
def random_test():
    """Get a random test, optionally filtered by topic."""
    topic = request.args.get("topic", "")
    tests = get_tests()
    if topic:
        filtered = [t for t in tests if topic.lower() in t["topic"].lower()]
        if filtered:
            return jsonify(random.choice(filtered))
    if tests:
        return jsonify(random.choice(tests))
    return jsonify({"error": "No tests available"}), 404


@bp.route("/mix")
def mix_test():
    """Create a mixed mock test — each part from a different random test."""
    tests = get_tests()
    if not tests:
        return jsonify({"error": "No tests available"}), 404

    parts = []
    part_types = ["dialogues", "react", "narrate", "opinion"]
    topics_used = []

    for pt in part_types:
        # Collect all parts of this type from all tests
        candidates = []
        for t in tests:
            for p in t["parts"]:
                if p["type"] == pt:
                    candidates.append({**p, "source_topic": t["topic"]})
        if candidates:
            chosen = random.choice(candidates)
            parts.append(chosen)
            topics_used.append(chosen.get("source_topic", ""))

    return jsonify({
        "number": 0,
        "topic": "Mixed: " + ", ".join(dict.fromkeys(topics_used)),
        "parts": parts,
    })


@bp.route("/practice")
def practice_part():
    """Get a random part of a specific type for practice mode."""
    part_type = request.args.get("type", "")  # dialogues, react, narrate, opinion
    topic = request.args.get("topic", "")
    tests = get_tests()

    candidates = []
    for t in tests:
        if topic and topic.lower() not in t["topic"].lower():
            continue
        for p in t["parts"]:
            if not part_type or p["type"] == part_type:
                candidates.append({**p, "test_topic": t["topic"], "test_number": t["number"]})

    if not candidates:
        return jsonify({"error": "No matching exercises found"}), 404
    return jsonify(random.choice(candidates))


@bp.route("/browse")
def browse_questions():
    """Return all questions in a flat list for browsing."""
    part_type = request.args.get("type", "")
    topic = request.args.get("topic", "")
    tests = get_tests()

    items = []
    for t in tests:
        if topic and topic.lower() not in t["topic"].lower():
            continue
        for p in t["parts"]:
            if part_type and p["type"] != part_type:
                continue

            if p["type"] == "dialogues":
                for di, d in enumerate(p.get("items", [])):
                    items.append({
                        "id": f"t{t['number']}-d{di}",
                        "test": t["number"], "topic": t["topic"],
                        "part_type": "dialogues", "part_label": "Dialog",
                        "title": d["title"],
                        "preview": d["situation"],
                        "data": {"items": [d], "part": p["part"], "type": "dialogues",
                                 "title": "Dialoger", "instructions": p["instructions"],
                                 "prep_seconds": p["prep_seconds"], "answer_seconds": p["answer_seconds"]},
                    })
            elif p["type"] == "react":
                for ri, item in enumerate(p.get("items", [])):
                    items.append({
                        "id": f"t{t['number']}-r{ri}",
                        "test": t["number"], "topic": t["topic"],
                        "part_type": "react", "part_label": "Reagera",
                        "title": item["situation"][:60] + ("..." if len(item["situation"]) > 60 else ""),
                        "preview": item["instruction"],
                        "data": {"items": [item], "part": p["part"], "type": "react",
                                 "title": "Reagera", "instructions": p["instructions"],
                                 "prep_seconds": p["prep_seconds"], "answer_seconds": p["answer_seconds"]},
                    })
            elif p["type"] in ("narrate", "opinion"):
                items.append({
                    "id": f"t{t['number']}-{p['type']}",
                    "test": t["number"], "topic": t["topic"],
                    "part_type": p["type"],
                    "part_label": "Berätta" if p["type"] == "narrate" else "Din åsikt",
                    "title": p.get("topic", p["title"]),
                    "preview": ", ".join(p.get("prompts", [])[:2]),
                    "data": p,
                })

    return jsonify(items)


@bp.route("/tts", methods=["POST"])
def synthesize_prompt():
    """Convert a speaking prompt to audio via Piper TTS with caching."""
    data = request.json
    text = data.get("text", "").strip()
    if not text:
        return jsonify({"error": "No text"}), 400

    text_hash = hashlib.sha256(text.encode()).hexdigest()[:16]
    audio_dir = OUTPUT_DIR / "audio_cache"
    audio_dir.mkdir(exist_ok=True)
    audio_path = audio_dir / f"sp_{text_hash}.wav"

    # Check cache
    if audio_path.exists():
        return jsonify({"url": f"/api/speaking/audio/{text_hash}"})

    # Generate
    voices = [v for v in VOICES_DIR.glob("*.onnx") if not v.name.endswith(".onnx.json")]
    if not voices:
        return jsonify({"error": "No voice model"}), 500

    try:
        proc = subprocess.run(
            ["piper", "--model", str(voices[0]), "--output_file", str(audio_path)],
            input=text, capture_output=True, text=True, timeout=60,
        )
        if proc.returncode != 0:
            return jsonify({"error": proc.stderr}), 500
    except subprocess.TimeoutExpired:
        return jsonify({"error": "TTS timed out"}), 500

    return jsonify({"url": f"/api/speaking/audio/{text_hash}"})


@bp.route("/audio/<hash_id>")
def serve_audio(hash_id):
    audio_path = OUTPUT_DIR / "audio_cache" / f"sp_{hash_id}.wav"
    if not audio_path.exists():
        return jsonify({"error": "Not found"}), 404
    return send_file(audio_path)


@bp.route("/beep")
def serve_beep():
    """Generate a short beep sound for 'answer now' signal."""
    beep_path = OUTPUT_DIR / "audio_cache" / "beep.wav"
    if not beep_path.exists():
        # Generate a simple beep using Piper
        voices = [v for v in VOICES_DIR.glob("*.onnx") if not v.name.endswith(".onnx.json")]
        if voices:
            subprocess.run(
                ["piper", "--model", str(voices[0]), "--output_file", str(beep_path)],
                input="Svara nu.", capture_output=True, text=True, timeout=30,
            )
    if beep_path.exists():
        return send_file(beep_path)
    return jsonify({"error": "Could not generate beep"}), 500
