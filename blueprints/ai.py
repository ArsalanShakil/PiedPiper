import subprocess
from pathlib import Path

from config import KNOWLEDGE_DIR


def load_knowledge_base(folder=None):
    """Load files from the knowledge directory as context. Optionally filter by folder."""
    context_parts = []
    if not KNOWLEDGE_DIR.exists():
        return ""
    dirs = [KNOWLEDGE_DIR / folder] if folder else sorted(KNOWLEDGE_DIR.iterdir())
    for d in dirs:
        if not d.is_dir():
            continue
        for f in sorted(d.iterdir()):
            if f.suffix in (".md", ".txt"):
                try:
                    content = f.read_text(encoding="utf-8")
                    context_parts.append(f"--- {d.name}/{f.name} ---\n{content}")
                except Exception:
                    continue
    return "\n\n".join(context_parts)


def ask_claude(prompt, system="", use_knowledge=False, timeout=120):
    """Call local Claude Code CLI for AI responses."""
    if use_knowledge:
        kb = load_knowledge_base()
        if kb:
            prompt = f"Reference material:\n\n{kb}\n\n---\n\nTask:\n{prompt}"

    cmd = ["claude", "-p"]
    if system:
        cmd += ["--system-prompt", system]
    cmd.append(prompt)

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        if result.returncode != 0:
            return f"Error: {result.stderr.strip()}"
        return result.stdout.strip()
    except subprocess.TimeoutExpired:
        return "Error: Claude CLI timed out"
    except FileNotFoundError:
        return "Error: Claude CLI not found. Make sure 'claude' is installed and in your PATH."


def check_claude_available():
    """Check if the claude CLI is available."""
    try:
        result = subprocess.run(
            ["claude", "--version"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        return result.returncode == 0, result.stdout.strip()
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return False, "Claude CLI not found"
