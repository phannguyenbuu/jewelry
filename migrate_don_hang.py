import sys

sys.path.insert(0, '/var/www/jewelry/backend')

from app_jewelry import app, db


with app.app_context():
    conn = db.connection()
    try:
        cur = conn.cursor()
        cols = [
            ("loai_don", "VARCHAR(20) DEFAULT 'Mua'"),
            ("cccd", "VARCHAR(20) DEFAULT ''"),
            ("dia_chi_kh", "TEXT DEFAULT ''"),
            ("chung_tu", "JSON DEFAULT '[]'"),
        ]
        for col, definition in cols:
            try:
                cur.execute(f"ALTER TABLE don_hang ADD COLUMN IF NOT EXISTS {col} {definition}")
                conn.commit()
                print(f'Added: {col}')
            except Exception as e:
                conn.rollback()
                print(f'Skip {col}: {e}')
    finally:
        conn.close()

    print('Migration complete')
