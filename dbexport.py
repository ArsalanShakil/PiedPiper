"""Export/import database to/from JSON for version control."""
import json
import sys

from db import get_db, init_db

TABLES = ["vocabulary", "documents", "exam_sessions", "exam_questions", "audio_cache", "settings"]


def export_db():
    conn = get_db()
    data = {}
    for table in TABLES:
        rows = conn.execute(f"SELECT * FROM {table}").fetchall()
        data[table] = [dict(r) for r in rows]
    conn.close()

    with open("db_seed.json", "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"Exported {sum(len(v) for v in data.values())} rows to db_seed.json")


def import_db():
    try:
        with open("db_seed.json", "r", encoding="utf-8") as f:
            data = json.load(f)
    except FileNotFoundError:
        print("No db_seed.json found, skipping import")
        return

    init_db()
    conn = get_db()

    for table in TABLES:
        rows = data.get(table, [])
        if not rows:
            continue
        # Check if table already has data
        existing = conn.execute(f"SELECT COUNT(*) as c FROM {table}").fetchone()["c"]
        if existing > 0:
            print(f"  {table}: already has {existing} rows, skipping")
            continue

        cols = list(rows[0].keys())
        placeholders = ", ".join(["?"] * len(cols))
        col_names = ", ".join(cols)
        for row in rows:
            vals = [row.get(c) for c in cols]
            conn.execute(f"INSERT INTO {table} ({col_names}) VALUES ({placeholders})", vals)
        conn.commit()
        print(f"  {table}: imported {len(rows)} rows")

    conn.close()
    print("Import complete")


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "import":
        import_db()
    else:
        export_db()
