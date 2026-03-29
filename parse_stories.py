"""Parse Swedish short stories book with correct story→chapter mapping and answer keys."""
import re
import json

# Correct mapping: each Kapitel 1 starts a new story (in order)
STORIES_IN_ORDER = [
    "Den galna köttbullen",
    "En mycket ovanlig utflykt",
    "Riddaren",
    "Klockan",
    "Kistan",
    "Okänt land",
    "Den osynliga kvinnan",
    "Rymdkapseln",
]

# Answer keys from the book
ANSWER_KEYS = {
    "Den galna köttbullen": "abdc b dbaa c ccdd b cdac a",
    "En mycket ovanlig utflykt": "badd b ddca b cdda c",
    "Riddaren": "bbdc b aabcd cbcc a",
    "Klockan": "acdc b acabd cbbd b",
    "Kistan": "cbad c abbad dcdb a",
    "Okänt land": "badc d cbdad cccc b",
    "Den osynliga kvinnan": "abcc c abcc a dbba c",
    "Rymdkapseln": "cbbd d badcb caad b",
}

def parse_answer_key(key_str):
    """Parse 'abdc b dbaa c' into list of answers."""
    return [c for c in key_str if c in 'abcd']

def parse():
    with open("/tmp/swedish_stories.txt", "r") as f:
        text = f.read()

    text = re.sub(r'Omistaja Aleksandr.*?\n', '', text)

    # Split by Kapitel headers
    parts = re.split(r'(Kapitel \d+ – .+)', text)

    chapters = []
    story_idx = -1
    last_kapitel_num = 0

    for i in range(1, len(parts) - 1, 2):
        chapter_title = parts[i].strip()
        chapter_body = parts[i + 1].strip()

        if 'Översikt' in chapter_title:
            continue

        # Extract kapitel number
        kap_match = re.match(r'Kapitel (\d+)', chapter_title)
        kap_num = int(kap_match.group(1)) if kap_match else 0

        # If Kapitel 1, it's a new story
        if kap_num == 1:
            story_idx += 1
            last_kapitel_num = 1
        else:
            last_kapitel_num = kap_num

        if story_idx >= len(STORIES_IN_ORDER):
            break

        story_name = STORIES_IN_ORDER[story_idx]

        # Split body into text and questions
        q_split = re.split(r'Läsförståelsefrågor', chapter_body, maxsplit=1)
        story_text = q_split[0].strip()
        story_text = re.sub(r'\n\d{1,3}\n', '\n', story_text)
        story_text = re.sub(r'\n{3,}', '\n\n', story_text)

        # Parse questions
        questions = []
        if len(q_split) > 1:
            q_text = q_split[1]
            q_blocks = re.split(r'(\d+\))', q_text)
            for qi in range(1, len(q_blocks) - 1, 2):
                q_body = q_blocks[qi + 1].strip()
                lines = q_body.split('\n')
                question_text = ""
                options = []
                for line in lines:
                    line = line.strip()
                    if re.match(r'^[a-d]\.', line):
                        options.append(line)
                    elif line and not options:
                        question_text += " " + line

                question_text = question_text.strip()
                if question_text and len(options) >= 2:
                    questions.append({
                        "type": "mc",
                        "question": question_text,
                        "options": [o.strip() for o in options[:4]],
                    })

        # Add answer keys
        if story_name in ANSWER_KEYS:
            answers = parse_answer_key(ANSWER_KEYS[story_name])
            # Questions are numbered sequentially across chapters
            # Each chapter has 5 questions
            chapter_in_story = sum(1 for c in chapters if c["story"] == story_name)
            start_q = chapter_in_story * 5
            for qi, q in enumerate(questions):
                ans_idx = start_q + qi
                if ans_idx < len(answers):
                    q["correct"] = answers[ans_idx] + "."  # e.g. "a."

        chapters.append({
            "story": story_name,
            "chapter": chapter_title,
            "text": story_text[:3000],
            "questions": questions,
        })

    return chapters


if __name__ == "__main__":
    chapters = parse()

    current_story = ""
    for ch in chapters:
        if ch["story"] != current_story:
            current_story = ch["story"]
            print(f"\n{current_story}")
        answers = [q.get("correct", "?") for q in ch["questions"]]
        print(f"  {ch['chapter']} — {len(ch['questions'])}q — answers: {', '.join(answers)}")

    with open("knowledge/Reading/stories_parsed.json", "w", encoding="utf-8") as f:
        json.dump(chapters, f, ensure_ascii=False, indent=2)
    print(f"\nSaved {len(chapters)} chapters")
