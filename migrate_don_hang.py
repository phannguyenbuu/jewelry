import sys
sys.path.insert(0, '/var/www/jewelry/backend')
from app_jewelry import db, app
from sqlalchemy import text

with app.app_context():
    with db.engine.connect() as conn:
        cols = [
            ("loai_don",  "VARCHAR(20) DEFAULT 'Mua'"),
            ("cccd",      "VARCHAR(20) DEFAULT ''"),
            ("dia_chi_kh","TEXT DEFAULT ''"),
            ("chung_tu",  "JSON DEFAULT '[]'"),
        ]
        for col, definition in cols:
            try:
                conn.execute(text(f"ALTER TABLE don_hang ADD COLUMN IF NOT EXISTS {col} {definition}"))
                conn.commit()
                print(f'Added: {col}')
            except Exception as e:
                print(f'Skip {col}: {e}')
    print('Migration complete')
