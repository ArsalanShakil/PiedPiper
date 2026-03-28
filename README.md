# PiedPiper

Swedish language learning & YKI exam prep app powered by [Piper TTS](https://github.com/rhasspy/piper) and Claude Code.

## One-command setup

```bash
git clone git@github.com:ArsalanShakil/PiedPiper.git
cd PiedPiper
./setup.sh
```

This automatically installs all dependencies, downloads the Swedish voice model, initializes the database, and sets up the `start-tts` shell alias.

## Usage

```bash
start-tts
```

Opens the app at http://localhost:5123.

## Features

- **Text to Speech** — Swedish TTS with Piper, save as WAV/MP3/OGG/FLAC
- **Writing Editor** — Google Docs-style editor with instant translation and TTS on text selection
- **Vocabulary Manager** — Save words, flashcard review, CSV export
- **Knowledge Base** — Upload study materials (PDF, Markdown, text) used as AI context
- **YKI Exam Practice** — Reading, Writing, Listening, Speaking sections with AI-generated questions
- **AI Powered** — Uses local Claude Code CLI for translation, exam generation, and evaluation

## Requirements

- Python 3.9+
- macOS or Linux
- Claude Code CLI (for AI features)
