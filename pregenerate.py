"""Pre-generate all reading and listening questions so users don't have to wait.
Run: python3 pregenerate.py
"""
import json
import hashlib
import subprocess
import re
import sys
from pathlib import Path

from config import KNOWLEDGE_DIR, OUTPUT_DIR, VOICES_DIR

QUESTIONS_FILE = Path(__file__).parent / "knowledge" / "pregenerated_questions.json"


def load_passages():
    passages = []
    for folder in ["Reading", "Listening"]:
        d = KNOWLEDGE_DIR / folder
        if not d.exists():
            continue
        for f in sorted(d.iterdir()):
            if f.suffix not in (".md", ".txt"):
                continue
            text = f.read_text(encoding="utf-8")

            if "8sidor" in f.name:
                articles = re.split(r'^## (.+)', text, flags=re.MULTILINE)
                for i in range(1, len(articles) - 1, 2):
                    title = articles[i].strip()
                    body = articles[i + 1].strip()
                    if len(body) > 50:
                        key = hashlib.sha256((title + body[:200]).encode()).hexdigest()[:16]
                        passages.append({"key": key, "title": title, "text": body, "source": "8sidor.se", "category": "news"})
            elif "stories" in f.name:
                chapters = re.split(r'^## (Kapitel .+)', text, flags=re.MULTILINE)
                for i in range(1, len(chapters) - 1, 2):
                    title = chapters[i].strip()
                    body = chapters[i + 1].strip()[:2000]
                    if len(body) > 100:
                        key = hashlib.sha256((title + body[:200]).encode()).hexdigest()[:16]
                        passages.append({"key": key, "title": title, "text": body, "source": "Short Stories", "category": "stories"})

    # Deduplicate by key
    seen = set()
    unique = []
    for p in passages:
        if p["key"] not in seen:
            seen.add(p["key"])
            unique.append(p)
    return unique


def generate_questions(text, title):
    from blueprints.ai import ask_claude

    system = (
        "You are a YKI Swedish reading/listening exam question generator (intermediate B1-B2). "
        "Generate comprehension questions for the given Swedish text. "
        "Return ONLY valid JSON."
    )
    prompt = (
        f"Read this Swedish text and create 3 questions about it.\n\n"
        f"Title: \"{title}\"\nText: \"{text[:1500]}\"\n\n"
        f"Create questions in Swedish. Include:\n"
        f"- 1 multiple choice (type: 'mc', options A/B/C, correct answer)\n"
        f"- 1 true/false (type: 'tf', correct: 'sant' or 'falskt')\n"
        f"- 1 open question (type: 'open')\n\n"
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


def synthesize_audio(text):
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


def main():
    # Load existing pre-generated data
    existing = {}
    if QUESTIONS_FILE.exists():
        existing = json.loads(QUESTIONS_FILE.read_text(encoding="utf-8"))

    passages = load_passages()
    print(f"Found {len(passages)} passages")

    updated = 0
    for i, p in enumerate(passages):
        key = p["key"]

        if key in existing and existing[key].get("questions"):
            print(f"  [{i+1}/{len(passages)}] {p['title'][:50]} — already done")
            continue

        print(f"  [{i+1}/{len(passages)}] {p['title'][:50]} — generating questions...")
        questions = generate_questions(p["text"], p["title"])

        print(f"    Synthesizing audio...")
        audio_url = synthesize_audio(p["text"])

        existing[key] = {
            "title": p["title"],
            "text": p["text"],
            "source": p["source"],
            "category": p["category"],
            "questions": questions,
            "audio_url": audio_url,
        }
        updated += 1

        # Save after each to avoid losing progress
        QUESTIONS_FILE.write_text(json.dumps(existing, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"\nDone! {updated} new, {len(existing)} total. Saved to {QUESTIONS_FILE}")


if __name__ == "__main__":
    main()
