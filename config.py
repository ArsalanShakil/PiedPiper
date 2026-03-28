from pathlib import Path

BASE_DIR = Path(__file__).parent
DB_PATH = BASE_DIR / "piedpiper.db"
KNOWLEDGE_DIR = BASE_DIR / "knowledge"
OUTPUT_DIR = BASE_DIR / "output"
VOICES_DIR = Path.home() / "piper-voices"

SUPPORTED_FORMATS = ["wav", "mp3", "ogg", "flac"]

KNOWLEDGE_FOLDERS = ["Writing", "Reading", "Listening", "Speaking"]

BUNDLED_KNOWLEDGE = [
    "Writing/yki-argumenterande.md",
    "Writing/yki-informella.md",
    "Writing/yki-klagomal.md",
    "Writing/yki-recension.md",
]
