CREATE TABLE IF NOT EXISTS vocabulary (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    swedish_text TEXT NOT NULL,
    translation TEXT NOT NULL,
    context TEXT,
    notes TEXT,
    category TEXT,
    difficulty INTEGER DEFAULT 0,
    review_count INTEGER DEFAULT 0,
    last_reviewed_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL DEFAULT 'Untitled',
    folder TEXT NOT NULL DEFAULT 'General',
    content_html TEXT NOT NULL DEFAULT '',
    content_text TEXT NOT NULL DEFAULT '',
    word_count INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS exam_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exam_type TEXT NOT NULL,
    difficulty TEXT NOT NULL DEFAULT 'intermediate',
    topic TEXT,
    status TEXT NOT NULL DEFAULT 'in_progress',
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT,
    total_score REAL,
    max_score INTEGER,
    time_spent_seconds INTEGER,
    feedback_json TEXT
);

CREATE TABLE IF NOT EXISTS exam_questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES exam_sessions(id) ON DELETE CASCADE,
    section_index INTEGER NOT NULL,
    question_index INTEGER NOT NULL,
    question_type TEXT NOT NULL,
    passage_text TEXT,
    question_text TEXT NOT NULL,
    options_json TEXT,
    correct_answer TEXT,
    user_answer TEXT,
    audio_path TEXT,
    score REAL,
    max_score INTEGER DEFAULT 1,
    ai_feedback TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audio_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text_hash TEXT NOT NULL UNIQUE,
    text_content TEXT NOT NULL,
    audio_path TEXT NOT NULL,
    voice_id TEXT NOT NULL,
    duration_seconds REAL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS memorization_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL DEFAULT 'Untitled',
    folder TEXT NOT NULL DEFAULT 'General',
    original_text TEXT NOT NULL,
    chunks_json TEXT NOT NULL DEFAULT '[]',
    mastery_level INTEGER DEFAULT 0,
    highest_mode_completed INTEGER DEFAULT 0,
    total_drill_count INTEGER DEFAULT 0,
    last_drilled_at TEXT,
    next_review_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS memorization_drill_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL REFERENCES memorization_items(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL DEFAULT 0,
    mode INTEGER NOT NULL,
    score REAL NOT NULL,
    time_spent_seconds INTEGER,
    mistakes_json TEXT,
    drilled_at TEXT NOT NULL DEFAULT (datetime('now'))
);
