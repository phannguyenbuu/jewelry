# pyre-ignore-all-errors
import os as _os
from flask import Flask
from flask_cors import CORS
from pgcompat import Database

app = Flask(__name__)
app.config['SECRET_KEY'] = _os.environ.get('FLASK_SECRET_KEY', 'jewelry-pos-local-secret')
CORS(app, supports_credentials=True)

_pg_host = _os.environ.get('PGHOST', 'localhost' if _os.path.exists('/var/www/jewelry') else 'jewelry.n-lux.com')
_pg_user = _os.environ.get('PGUSER', 'postgres')
_pg_password = _os.environ.get('PGPASSWORD', 'myPass')
_pg_database = _os.environ.get('PGDATABASE', 'jsql')
_pg = f'postgresql://{_pg_user}:{_pg_password}@{_pg_host}/{_pg_database}'
app.config['DATABASE_URL'] = _os.environ.get('DATABASE_URL', _pg)

db = Database(app)
