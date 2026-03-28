# Piper TTS Studio

Local Swedish text-to-speech web app powered by [Piper TTS](https://github.com/rhasspy/piper).

## One-command setup

```bash
git clone <your-repo-url> piper-app
cd piper-app
./setup.sh
```

This automatically:
- Installs Python dependencies
- Installs ffmpeg (if missing)
- Downloads the Swedish voice model (~60MB)
- Adds `start-tts` shell alias

## Usage

```bash
start-tts
```

Opens the app at http://localhost:5123.

## Features

- Swedish text-to-speech
- Save as WAV, MP3, OGG, or FLAC
- Browse and save to any folder on your system
- Play, download, and manage generated files

## Requirements

- Python 3.9+
- macOS or Linux
