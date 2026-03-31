import sys

sys.path.insert(0, '/var/www/jewelry/backend')

from app_jewelry import app, db


with app.app_context():
    conn = db.connection()
    try:
        cur = conn.cursor()

        cols = [
            ("gia_vang_mua", "BIGINT DEFAULT 0"),
            ("gia_hat", "BIGINT DEFAULT 0"),
            ("gia_nhan_cong", "BIGINT DEFAULT 0"),
            ("dieu_chinh", "BIGINT DEFAULT 0"),
        ]
        for col, coltype in cols:
            try:
                cur.execute(f"ALTER TABLE item ADD COLUMN {col} {coltype}")
                conn.commit()
                print(f"  + item.{col} OK")
            except Exception as e:
                conn.rollback()
                if "already exists" in str(e):
                    print(f"  = item.{col} already exists")
                else:
                    print(f"  ! item.{col} ERROR: {e}")

        try:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS nhom_hang (
                    id       SERIAL PRIMARY KEY,
                    ten_nhom VARCHAR(150) NOT NULL UNIQUE,
                    ma_nhom  VARCHAR(50),
                    mau_sac  VARCHAR(20) DEFAULT '#6366f1',
                    mo_ta    TEXT,
                    thu_tu   INTEGER DEFAULT 0,
                    ngay_tao VARCHAR(30) DEFAULT ''
                )
                """
            )
            conn.commit()
            print("  + nhom_hang table OK")
        except Exception as e:
            conn.rollback()
            print(f"  ! nhom_hang ERROR: {e}")
    finally:
        conn.close()

    print("XONG!")
