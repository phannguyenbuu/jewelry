import sqlite3
conn = sqlite3.connect('instance/jewelry.db')
cur = conn.cursor()
cur.execute("UPDATE item SET quay_nho = REPLACE(quay_nho, 'M - Khay', 'M3 - Khay') WHERE quay_nho LIKE 'M - Khay%'")
conn.commit()
print('Fixed:', cur.rowcount, 'rows')
conn.close()
