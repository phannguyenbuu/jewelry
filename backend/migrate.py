import sqlite3, os
db_path = '/var/www/jewelry/backend/instance/jewelry.db'
conn = sqlite3.connect(db_path)
cur  = conn.cursor()
migrations = [
    'ALTER TABLE kho ADD COLUMN nguoi_phu_trach TEXT DEFAULT ""',
    'ALTER TABLE kho ADD COLUMN ngay_tao TEXT DEFAULT ""',
    'ALTER TABLE quay_nho ADD COLUMN nguoi_phu_trach TEXT DEFAULT ""',
    'ALTER TABLE quay_nho ADD COLUMN ngay_tao TEXT DEFAULT ""',
    'ALTER TABLE loai_vang ADD COLUMN nguoi_phu_trach TEXT DEFAULT ""',
    'ALTER TABLE loai_vang ADD COLUMN ngay_tao TEXT DEFAULT ""',
    'ALTER TABLE loai_vang ADD COLUMN sjc_key TEXT DEFAULT ""',
]
for sql in migrations:
    try:
        cur.execute(sql)
        print('OK:', sql[:60])
    except Exception as e:
        print('SKIP:', e)
conn.commit()
conn.close()
print('Done')
