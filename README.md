# PiedPiper

Swedish language learning & YKI exam prep app powered by [Piper TTS](https://github.com/rhasspy/piper) and Claude Code.

## One-command setup

```bash
git clone git@github.com:ArsalanShakil/PiedPiper.git
cd PiedPiper
./setup.sh
```

This automatically:
- Installs Python and Node.js dependencies
- Builds the React frontend
- Downloads the Swedish voice model
- Initializes the database with seed data
- Sets up the `start-pp`, `stop-pp`, and `piedpiper` shell aliases
- Creates a macOS desktop app (on Mac)

## Usage

```bash
start-pp    # start the app in browser
stop-pp     # stop the server
```

Opens the app at http://localhost:5123.

## Development

For hot-reload development with the Vite dev server:

```bash
# Terminal 1: Start the Flask backend
python3 app.py

# Terminal 2: Start the Vite dev server
cd frontend && npm run dev
```

Open http://localhost:5173 — the Vite dev server proxies API calls to Flask.

To build the frontend for production:

```bash
cd frontend && npm run build
```

Flask serves the built output from `frontend/dist/`.

## Architecture

```
PiedPiper/
  app.py                Flask backend (serves API + React build)
  blueprints/           API route modules (tts, editor, vocab, yki, memorization, etc.)
  db.py, schema.sql     SQLite database
  frontend/             React + TypeScript + Vite
    src/
      components/       React components for each page
      api/              Typed API client modules
      hooks/            Custom React hooks
      types/            TypeScript interfaces
      styles/           CSS (ported from original design)
  knowledge/            Bundled study materials
  output/               Generated audio files
```

**Backend**: Flask (Python) with SQLite — serves all `/api/*` endpoints unchanged.

**Frontend**: React 19 + TypeScript + Vite. Uses React Router for client-side navigation, react-quill-new for the rich text editor, and the CSS Custom Highlight API for vocabulary highlighting.

## Features

- **Text to Speech** — Swedish TTS with Piper, save as WAV/MP3/OGG/FLAC
- **Writing Editor** — Rich text editor with instant translation, vocabulary highlighting, and TTS on text selection
- **Vocabulary Manager** — Save words, Quizlet-style flashcard review with 3D flip cards and spaced repetition, CSV export
- **Memorization** — Paste any text and drill it through 5 scientific modes: Read & Listen, Fill the Blanks, First Letters, Recall & Write, and Speed Round. Progressive difficulty, chunk-by-chunk drilling, mastery tracking, spaced repetition scheduling, and collapsible folder organization
- **Knowledge Base** — Upload study materials (PDF, Markdown, text) used as AI context
- **YKI Exam Practice** — Reading, Writing, Listening, Speaking sections with AI-generated questions and example templates
- **Full Mock Exam** — Complete timed YKI exam across all 4 sections back-to-back in one sitting
- **AI Powered** — Uses local Claude Code CLI for translation, exam generation, and evaluation
- **Global Tools** — Select any text in the app to Translate, Speak (with audio player controls), or add to Vocabulary

## Requirements

- Python 3.9+
- Node.js 18+
- macOS or Linux
- Claude Code CLI (for AI features)
