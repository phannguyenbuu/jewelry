import sqlite3, json

db = 'backend/instance/jewelry.db'
conn = sqlite3.connect(db)
conn.row_factory = sqlite3.Row
cur = conn.cursor()

cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = [r[0] for r in cur.fetchall()]
print('Tables:', tables)
for t in tables:
    n = conn.execute(f'SELECT COUNT(*) FROM {t}').fetchone()[0]
    print(f'  {t}: {n} rows')
    if n > 0 and n <= 5:
        rows = conn.execute(f'SELECT * FROM {t}').fetchall()
        for row in rows:
            print('   ', dict(row))
conn.close()
