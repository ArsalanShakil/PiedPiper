"""Parse the Swedish short stories book into structured JSON with chapters and built-in questions."""
import re
import json

STORY_NAMES = [
    "Den galna köttbullen",
    "En mycket ovanlig utflykt",
    "Riddaren",
    "Klockan",
    "Kistan",
    "Okänt land",
    "Den osynliga kvinnan",
    "Rymdkapseln",
]

def parse():
    with open("/tmp/swedish_stories.txt", "r") as f:
        text = f.read()

    # Remove owner lines
    text = re.sub(r'Omistaja Aleksandr.*?\n', '', text)

    # Find where each story starts by finding its first "Kapitel" after content
    # Split by "Kapitel N – Title" pattern
    parts = re.split(r'(Kapitel \d+ – .+)', text)

    chapters = []
    current_story_idx = -1

    for i in range(1, len(parts) - 1, 2):
        chapter_title = parts[i].strip()
        chapter_body = parts[i + 1].strip()

        # Skip Översikt sections
        if 'Översikt' in chapter_title:
            continue

        # Determine which story this belongs to
        # Check if any story name appears between this chapter and the previous one
        preceding = parts[i - 1] if i > 0 else ""
        for si, sname in enumerate(STORY_NAMES):
            if sname in preceding:
                current_story_idx = si
                break

        story_name = STORY_NAMES[current_story_idx] if current_story_idx >= 0 else "Unknown"

        # Split body into text and questions
        q_split = re.split(r'Läsförståelsefrågor', chapter_body, maxsplit=1)
        story_text = q_split[0].strip()

        # Remove page numbers and clean up
        story_text = re.sub(r'\n\d{1,3}\n', '\n', story_text)
        story_text = re.sub(r'\n{3,}', '\n\n', story_text)

        # Parse questions if present
        questions = []
        if len(q_split) > 1:
            q_text = q_split[1]
            # Parse numbered questions: 1) question text \n a. option \n b. option ...
            q_blocks = re.split(r'(\d+\))', q_text)
            for qi in range(1, len(q_blocks) - 1, 2):
                q_num = q_blocks[qi].strip()
                q_body = q_blocks[qi + 1].strip()

                # Split into question text and options
                lines = q_body.split('\n')
                question_text = ""
                options = []
                for line in lines:
                    line = line.strip()
                    if re.match(r'^[a-d]\.', line):
                        options.append(line)
                    elif line and not options:
                        question_text += " " + line
                    elif line and options:
                        options.append(line)

                question_text = question_text.strip()
                if question_text and options:
                    questions.append({
                        "type": "mc",
                        "question": question_text,
                        "options": [o.strip() for o in options[:4]],
                    })

        chapters.append({
            "story": story_name,
            "chapter": chapter_title,
            "text": story_text[:3000],  # Limit size
            "questions": questions,
        })

    return chapters


if __name__ == "__main__":
    chapters = parse()

    # Print summary
    current_story = ""
    for ch in chapters:
        if ch["story"] != current_story:
            current_story = ch["story"]
            print(f"\n{current_story}")
        print(f"  {ch['chapter']} — {len(ch['text'])} chars, {len(ch['questions'])} questions")

    # Save
    with open("knowledge/Reading/stories_parsed.json", "w", encoding="utf-8") as f:
        json.dump(chapters, f, ensure_ascii=False, indent=2)
    print(f"\nSaved {len(chapters)} chapters to knowledge/Reading/stories_parsed.json")
