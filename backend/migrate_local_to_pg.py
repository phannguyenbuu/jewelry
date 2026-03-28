#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Migrate dữ liệu từ local SQLite → PostgreSQL trên VPS.
Chạy: ./venv/bin/python migrate_local_to_pg.py
"""
import sqlite3, json, sys

SQLITE_PATH = '/var/www/jewelry/backend/local_jewelry.db'
PG_DSN      = 'postgresql://jewelry_user:jewelry2026@localhost/jewelry_db'

try:
    import psycopg2
    from psycopg2.extras import Json
except ImportError:
    sys.exit("psycopg2 not found")

sl = sqlite3.connect(SQLITE_PATH)
sl.row_factory = sqlite3.Row
pg = psycopg2.connect(PG_DSN)
pg.autocommit = False

cur_sl = sl.cursor()
cur_pg = pg.cursor()

def sl_tables():
    cur_sl.execute("SELECT name FROM sqlite_master WHERE type='table'")
    return {r[0] for r in cur_sl.fetchall()}

def sl_columns(table):
    cur_sl.execute(f"PRAGMA table_info({table})")
    return [r[1] for r in cur_sl.fetchall()]

def pg_columns(table):
    cur_pg.execute("""
        SELECT column_name FROM information_schema.columns
        WHERE table_name=%s ORDER BY ordinal_position
    """, (table,))
    return [r[0] for r in cur_pg.fetchall()]

def coerce(val):
    """Chuyển SQLite value → phù hợp PostgreSQL."""
    if isinstance(val, bytes):
        return val.decode('utf-8', errors='replace')
    if isinstance(val, str):
        # kiểm tra nếu là JSON string
        stripped = val.strip()
        if stripped and stripped[0] in ('[', '{'):
            try:
                parsed = json.loads(stripped)
                return Json(parsed)
            except Exception:
                pass
    return val

def migrate(table):
    if table not in sl_tables():
        print(f"  [{table}] not in SQLite – skip")
        return 0

    # Lấy cột giao nhau giữa SQLite và PG
    sl_cols = sl_columns(table)
    pg_cols = pg_columns(table)
    common  = [c for c in sl_cols if c in pg_cols]

    cur_sl.execute(f"SELECT {','.join(common)} FROM {table}")
    rows = cur_sl.fetchall()
    if not rows:
        print(f"  [{table}] 0 rows – skip")
        return 0

    # Xoá data cũ trong PG
    cur_pg.execute(f"DELETE FROM {table}")
    print(f"  [{table}] cleared old PG data")

    placeholders = ", ".join(["%s"] * len(common))
    cols_str     = ", ".join(f'"{c}"' for c in common)
    sql = f'INSERT INTO "{table}" ({cols_str}) VALUES ({placeholders})'

    count = 0
    errors = 0
    for row in rows:
        vals = [coerce(row[i]) for i, c in enumerate(common)]
        try:
            cur_pg.execute(sql, vals)
            count += 1
        except Exception as e:
            print(f"    ⚠ row error (id={row[0]}): {e}")
            pg.rollback()
            errors += 1
            continue

    # Reset sequence
    if 'id' in common:
        cur_pg.execute(f"""
            SELECT setval(
                pg_get_serial_sequence('"{table}"', 'id'),
                COALESCE((SELECT MAX(id) FROM "{table}"), 0) + 1,
                false
            )
        """)

    pg.commit()
    status = "✅" if errors == 0 else f"⚠ {errors} errors"
    print(f"  [{table}] {count} rows migrated {status}")
    return count

# ── Chạy migration theo đúng thứ tự FK ──────────────────────────────────────
print("=" * 60)
print("Local SQLite → PostgreSQL Migration")
print("=" * 60)
print(f"Source : {SQLITE_PATH}")
print(f"Target : {PG_DSN}\n")

total = 0
total += migrate('kho')
total += migrate('quay_nho')
total += migrate('loai_vang')
total += migrate('item')

sl.close()
pg.close()
print(f"\n{'='*60}")
print(f"Done! Total {total} rows migrated to PostgreSQL.")
print('='*60)
