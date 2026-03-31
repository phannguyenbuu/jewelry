import psycopg2
from contextvars import ContextVar

from pgcompat_core import Column, DataType, ForeignKey, FuncNamespace, MODEL_REGISTRY, Model, Relationship
from pgcompat_session import Session

class SessionProxy:
    def __init__(self, db):
        self.db = db
        self._ctx = ContextVar('pgcompat_session', default=None)

    def _get(self):
        session = self._ctx.get()
        if session is None:
            session = Session(self.db)
            self._ctx.set(session)
        return session

    def remove(self, *_args, **_kwargs):
        session = self._ctx.get()
        if session is not None:
            session.close()
            self._ctx.set(None)

    def __getattr__(self, name):
        return getattr(self._get(), name)

    @property
    def new(self):
        return self._get().new

    @property
    def dirty(self):
        return self._get().dirty

    @property
    def deleted(self):
        return self._get().deleted


class Database:
    def __init__(self, app=None):
        self.app = None
        self.dsn = None
        self.session = SessionProxy(self)
        self.func = FuncNamespace()
        self.Integer = DataType('INTEGER')
        self.BigInteger = DataType('BIGINT')
        self.Float = DataType('DOUBLE PRECISION')
        self.Boolean = DataType('BOOLEAN')
        self.Text = DataType('TEXT')
        self.JSON = DataType('JSONB')
        self.Model = type('Model', (Model,), {'_db': self})
        if app is not None:
            self.init_app(app)

    def String(self, length=None):
        return DataType('VARCHAR', length)

    def Column(self, data_type, *constraints, primary_key=False, nullable=True, default=None, unique=False):
        return Column(
            data_type,
            *constraints,
            primary_key=primary_key,
            nullable=nullable,
            default=default,
            unique=unique,
        )

    def ForeignKey(self, target):
        return ForeignKey(target)

    def relationship(self, target_name, backref=None, cascade='', lazy=True, order_by=None):
        return Relationship(target_name, backref=backref, cascade=cascade, lazy=lazy, order_by=order_by)

    def init_app(self, app):
        self.app = app
        self.dsn = app.config['DATABASE_URL']
        app.teardown_appcontext(self.session.remove)

    @property
    def engine(self):
        return self

    def connection(self):
        return psycopg2.connect(self.dsn)

    def create_all(self):
        conn = self.connection()
        try:
            conn.autocommit = True
            cur = conn.cursor()
            for model in MODEL_REGISTRY.values():
                column_defs = []
                for name, column in model.__columns__.items():
                    if column.primary_key:
                        column_sql = f'"{name}" BIGSERIAL PRIMARY KEY'
                    else:
                        column_sql = f'"{name}" {column.data_type.sql()}'
                        if not column.nullable:
                            column_sql += ' NOT NULL'
                        if column.unique:
                            column_sql += ' UNIQUE'
                        if column.foreign_key:
                            table_name, column_name = column.foreign_key.target.split('.')
                            column_sql += f' REFERENCES "{table_name}"("{column_name}")'
                    column_defs.append(column_sql)
                sql = f'CREATE TABLE IF NOT EXISTS "{model.__table_name__}" ({", ".join(column_defs)})'
                try:
                    cur.execute(sql)
                except (
                    psycopg2.errors.DuplicateTable,
                    psycopg2.errors.DuplicateObject,
                    psycopg2.errors.UniqueViolation,
                ):
                    # Gunicorn can import the app in parallel workers; ignore
                    # duplicate DDL races if the target table now exists.
                    with conn.cursor() as check_cur:
                        check_cur.execute("SELECT to_regclass(%s)", (model.__table_name__,))
                        if check_cur.fetchone()[0] is None:
                            raise
        finally:
            conn.close()
