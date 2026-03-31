#!/usr/bin/env python3
import json
import os
import sqlite3
import sys

try:
    import psycopg2
    from psycopg2 import sql
    from psycopg2.extras import Json
except ImportError:
    sys.exit('psycopg2-binary not found. Install backend requirements first.')


BASE_DIR = os.path.dirname(__file__)
SQLITE_PATH = os.environ.get('SQLITE_PATH', os.path.join(BASE_DIR, 'instance', 'jewelry.db'))
PGHOST = os.environ.get('PGHOST', 'localhost' if os.path.exists('/var/www/jewelry') else 'jewelry.n-lux.com')
PGUSER = os.environ.get('PGUSER', 'postgres')
PGPASSWORD = os.environ.get('PGPASSWORD', 'myPass')
PGDATABASE = os.environ.get('PGDATABASE', 'jsql')
PG_DSN = os.environ.get('DATABASE_URL', f'postgresql://{PGUSER}:{PGPASSWORD}@{PGHOST}/{PGDATABASE}')
PG_ADMIN_DSN = f'postgresql://{PGUSER}:{PGPASSWORD}@{PGHOST}/postgres'

TABLE_ORDER = [
    'kho',
    'nhom_hang',
    'loai_vang',
    'nhan_vien',
    'thu_ngan',
    'quay_nho',
    'item',
    'tuoi_vang',
    'thu_ngan_so_quy',
    'thu_ngan_so_quy_theo_nguoi',
    'thu_chi',
    'chung_tu',
    'don_hang',
    'khoan_vay',
    'lich_tra_no',
    'hang_sua_bo',
    'nhap_vang_list',
    'nhap_vang_item',
    'he_thong_cau_hinh',
    'scale_agent',
    'scale_command',
    'scale_reading',
]


def ensure_database():
    conn = psycopg2.connect(PG_ADMIN_DSN)
    conn.autocommit = True
    cur = conn.cursor()
    cur.execute('SELECT 1 FROM pg_database WHERE datname = %s', (PGDATABASE,))
    exists = cur.fetchone() is not None
    if not exists:
        cur.execute(sql.SQL('CREATE DATABASE {}').format(sql.Identifier(PGDATABASE)))
        print(f'Created database {PGDATABASE}')
    else:
        print(f'Database {PGDATABASE} already exists')
    conn.close()


def ensure_schema():
    os.environ['DATABASE_URL'] = PG_DSN
    sys.path.insert(0, BASE_DIR)
    import app_jewelry  # noqa: F401
    print('PostgreSQL schema sync completed')


def sqlite_tables(cur):
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    return [row[0] for row in cur.fetchall()]


def sqlite_columns(cur, table):
    cur.execute(f'PRAGMA table_info({table})')
    return [row[1] for row in cur.fetchall()]


def pg_columns(cur, table):
    cur.execute(
        """
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = %s
        ORDER BY ordinal_position
        """,
        (table,),
    )
    return [row[0] for row in cur.fetchall()]


def coerce_value(value):
    if isinstance(value, bytes):
        return value.decode('utf-8', errors='replace')
    if isinstance(value, str):
        text = value.strip()
        if text[:1] in {'{', '['}:
            try:
                return Json(json.loads(text))
            except Exception:
                return value
    return value


def ordered_tables(found_tables):
    ordered = [name for name in TABLE_ORDER if name in found_tables]
    ordered.extend(name for name in found_tables if name not in ordered)
    return ordered


def truncate_tables(cur, tables):
    if not tables:
        return
    query = sql.SQL('TRUNCATE TABLE {} RESTART IDENTITY CASCADE').format(
        sql.SQL(', ').join(sql.Identifier(name) for name in tables),
    )
    cur.execute(query)


def reset_sequence(cur, table):
    cur.execute('SELECT pg_get_serial_sequence(%s, %s)', (table, 'id'))
    row = cur.fetchone()
    sequence_name = row[0] if row else None
    if not sequence_name:
        return
    cur.execute(
        sql.SQL(
            'SELECT setval(%s, COALESCE((SELECT MAX(id) FROM {}), 0) + 1, false)'
        ).format(sql.Identifier(table)),
        (sequence_name,),
    )


def migrate():
    if not os.path.exists(SQLITE_PATH):
        sys.exit(f'SQLite source not found: {SQLITE_PATH}')

    sl = sqlite3.connect(SQLITE_PATH)
    sl.row_factory = sqlite3.Row
    pg = psycopg2.connect(PG_DSN)
    pg.autocommit = False

    cur_sl = sl.cursor()
    cur_pg = pg.cursor()

    source_tables = sqlite_tables(cur_sl)
    tables = ordered_tables(source_tables)
    common_tables = [table for table in tables if pg_columns(cur_pg, table)]
    truncate_tables(cur_pg, common_tables)
    pg.commit()

    migrated = {}
    for table in common_tables:
        sl_cols = sqlite_columns(cur_sl, table)
        target_cols = pg_columns(cur_pg, table)
        common_cols = [col for col in sl_cols if col in target_cols]
        if not common_cols:
            migrated[table] = 0
            continue

        cur_sl.execute(f'SELECT {",".join(common_cols)} FROM {table}')
        rows = cur_sl.fetchall()
        if not rows:
            migrated[table] = 0
            continue

        insert_sql = sql.SQL('INSERT INTO {} ({}) VALUES ({})').format(
            sql.Identifier(table),
            sql.SQL(', ').join(sql.Identifier(col) for col in common_cols),
            sql.SQL(', ').join(sql.Placeholder() for _ in common_cols),
        )

        for row in rows:
            values = [coerce_value(row[col]) for col in common_cols]
            cur_pg.execute(insert_sql, values)

        if 'id' in common_cols:
            reset_sequence(cur_pg, table)
        migrated[table] = len(rows)
        pg.commit()
        print(f'[{table}] migrated {len(rows)} rows')

    sl.close()
    pg.close()
    return migrated


def main():
    print(f'SQLite source: {SQLITE_PATH}')
    print(f'PostgreSQL target: {PG_DSN}')
    ensure_database()
    ensure_schema()
    migrated = migrate()
    total_rows = sum(migrated.values())
    print('Migration complete')
    for table, count in migrated.items():
        print(f'  - {table}: {count}')
    print(f'Total rows migrated: {total_rows}')


if __name__ == '__main__':
    main()
