#!/usr/bin/env python3
"""
Migrate data từ SQLite → PostgreSQL cho jewelry app.
Chạy: ./venv/bin/python migrate_sqlite_to_pg.py
"""
import sqlite3, json, sys

PG_DSN  = 'postgresql://jewelry_user:jewelry2026@localhost/jewelry_db'
SQLITE  = '/var/www/jewelry/backend/instance/jewelry.db'

try:
    import psycopg2
except ImportError:
    sys.exit("psycopg2 not found – activate venv first")

# ── Kết nối ──────────────────────────────────────────────────────────────────
sl  = sqlite3.connect(SQLITE)
sl.row_factory = sqlite3.Row
pg  = psycopg2.connect(PG_DSN)
cur_sl = sl.cursor()
cur_pg = pg.cursor()

def migrate_table(table, columns, fk_reset=True):
    """Đọc từ SQLite, insert vào PostgreSQL."""
    cur_sl.execute(f"SELECT * FROM {table}")
    rows = cur_sl.fetchall()
    if not rows:
        print(f"  [{table}] no data – skip")
        return 0

    # Xoá dữ liệu cũ trong PG (giữ schema)
    cur_pg.execute(f"DELETE FROM {table}")

    col_names = [c for c in columns]
    placeholders = ", ".join(["%s"] * len(col_names))
    cols_str = ", ".join(col_names)
    sql = f"INSERT INTO {table} ({cols_str}) VALUES ({placeholders})"

    count = 0
    for row in rows:
        vals = []
        for c in col_names:
            v = row[c] if c in row.keys() else None
            # JSON columns: SQLite lưu string, PG cần string JSON
            if isinstance(v, str) and v and v[0] in ('[', '{'):
                try: json.loads(v); vals.append(v)   # valid JSON string → keep
                except: vals.append(v)
            else:
                vals.append(v)
        cur_pg.execute(sql, vals)
        count += 1

    if fk_reset:
        # Reset sequence để auto-increment hoạt động đúng
        cur_pg.execute(f"SELECT setval(pg_get_serial_sequence('{table}','id'), COALESCE(MAX(id),0)+1, false) FROM {table}")
    print(f"  [{table}] migrated {count} rows ✅")
    return count

# Kiểm tra bảng nào tồn tại trong SQLite
cur_sl.execute("SELECT name FROM sqlite_master WHERE type='table'")
sqlite_tables = {r[0] for r in cur_sl.fetchall()}
print(f"SQLite tables: {sqlite_tables}")

# ── Migrate từng bảng ────────────────────────────────────────────────────────
print("\nMigrating...")

if 'kho' in sqlite_tables:
    migrate_table('kho', ['id','ten_kho','dia_chi','ghi_chu','nguoi_phu_trach','ngay_tao'])

if 'quay_nho' in sqlite_tables:
    migrate_table('quay_nho', ['id','ten_quay','kho_id','ghi_chu','nguoi_phu_trach','ngay_tao'])

if 'loai_vang' in sqlite_tables:
    migrate_table('loai_vang', ['id','ma_loai','ten_loai','gia_ban','gia_mua','sjc_key','nguoi_phu_trach','ngay_tao','lich_su'])

if 'item' in sqlite_tables:
    migrate_table('item', ['id','ma_hang','ncc','nhom_hang','quay_nho',
                           'cong_le','cong_si','tong_tl','tl_da','tl_vang',
                           'loai_vang','status','images','certificates','history'])

pg.commit()
sl.close()
pg.close()
print("\nDone! All data migrated to PostgreSQL.")
