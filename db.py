import sqlite3
from pathlib import Path

from config import DB_PATH, BASE_DIR


def get_db():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    schema_path = BASE_DIR / "schema.sql"
    with open(schema_path) as f:
        schema = f.read()
    conn = get_db()
    conn.executescript(schema)
    conn.close()
