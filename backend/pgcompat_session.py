from collections import OrderedDict

import psycopg2
from flask import abort

from pgcompat_core import AggregateExpr, ColumnExpr, Model, OrderExpr, _coerce_param

class Query:
    def __init__(self, session, *entities):
        self.session = session
        self.entities = list(entities)
        self.model = entities[0] if entities and isinstance(entities[0], type) and issubclass(entities[0], Model) else None
        self._filters = []
        self._order_by = []
        self._limit = None
        self._distinct = False

    @property
    def base_model(self):
        if self.model is not None:
            return self.model
        for entity in self.entities:
            if isinstance(entity, ColumnExpr):
                return entity.model
            if isinstance(entity, AggregateExpr):
                return entity.model
        return None

    def _clone(self):
        cloned = Query(self.session, *self.entities)
        cloned.model = self.model
        cloned._filters = list(self._filters)
        cloned._order_by = list(self._order_by)
        cloned._limit = self._limit
        cloned._distinct = self._distinct
        return cloned

    def filter_by(self, **kwargs):
        query = self._clone()
        base_model = query.base_model
        for key, value in kwargs.items():
            query._filters.append(getattr(base_model, key) == value)
        return query

    def filter(self, *conditions):
        query = self._clone()
        for condition in conditions:
            if condition is not None:
                query._filters.append(condition)
        return query

    def order_by(self, *expressions):
        query = self._clone()
        query._order_by.extend(expressions)
        return query

    def limit(self, value):
        query = self._clone()
        query._limit = int(value)
        return query

    def distinct(self):
        query = self._clone()
        query._distinct = True
        return query

    def _select_sql(self, count=False):
        base_model = self.base_model
        table_name = base_model.__table_name__
        params = []

        if count:
            select_sql = 'COUNT(*)'
        elif self.model is not None:
            select_sql = f'"{table_name}".*'
        else:
            select_parts = []
            for entity in self.entities:
                if isinstance(entity, (ColumnExpr, AggregateExpr)):
                    select_parts.append(entity.sql())
                else:
                    raise RuntimeError(f'Unsupported select entity: {entity!r}')
            select_sql = ', '.join(select_parts)

        where_sql = ''
        if self._filters:
            clauses = []
            for condition in self._filters:
                clauses.append(f'({condition.clause})')
                params.extend(condition.params)
            where_sql = ' WHERE ' + ' AND '.join(clauses)

        distinct_sql = 'DISTINCT ' if self._distinct and not count else ''
        sql = f'SELECT {distinct_sql}{select_sql} FROM "{table_name}"{where_sql}'
        if self._order_by and not count:
            order_parts = []
            for expression in self._order_by:
                if isinstance(expression, OrderExpr):
                    order_parts.append(expression.sql())
                elif isinstance(expression, ColumnExpr):
                    order_parts.append(expression.sql())
                else:
                    raise RuntimeError(f'Unsupported order_by expression: {expression!r}')
            sql += ' ORDER BY ' + ', '.join(order_parts)
        if self._limit is not None and not count:
            sql += ' LIMIT %s'
            params.append(self._limit)
        return sql, params

    def all(self):
        sql, params = self._select_sql()
        cur = self.session.execute(sql, params)
        rows = cur.fetchall()
        if self.model is not None:
            column_names = [desc[0] for desc in cur.description]
            return [self.model._from_row(row, column_names, self.session) for row in rows]
        return rows

    def first(self):
        query = self.limit(1)
        rows = query.all()
        return rows[0] if rows else None

    def first_or_404(self):
        obj = self.first()
        if obj is None:
            abort(404)
        return obj

    def scalar(self):
        row = self.limit(1).first()
        if row is None:
            return None
        if isinstance(row, tuple):
            return row[0]
        return row

    def count(self):
        sql, params = self._select_sql(count=True)
        cur = self.session.execute(sql, params)
        row = cur.fetchone()
        return int(row[0] or 0)

    def get(self, ident):
        pk_name = None
        for name, column in self.base_model.__columns__.items():
            if column.primary_key:
                pk_name = name
                break
        if pk_name is None:
            raise RuntimeError(f'No primary key defined for {self.base_model.__name__}')
        return self.filter_by(**{pk_name: ident}).first()

    def get_or_404(self, ident):
        obj = self.get(ident)
        if obj is None:
            abort(404)
        return obj

    def update(self, values, synchronize_session=False):
        base_model = self.base_model
        params = []
        assignments = []
        for key, value in values.items():
            assignments.append(f'"{key}" = %s')
            params.append(_coerce_param(value))
        sql = f'UPDATE "{base_model.__table_name__}" SET {", ".join(assignments)}'
        if self._filters:
            clauses = []
            for condition in self._filters:
                clauses.append(f'({condition.clause})')
                params.extend(condition.params)
            sql += ' WHERE ' + ' AND '.join(clauses)
        cur = self.session.execute(sql, params)
        return cur.rowcount

    def delete(self):
        base_model = self.base_model
        params = []
        sql = f'DELETE FROM "{base_model.__table_name__}"'
        if self._filters:
            clauses = []
            for condition in self._filters:
                clauses.append(f'({condition.clause})')
                params.extend(condition.params)
            sql += ' WHERE ' + ' AND '.join(clauses)
        cur = self.session.execute(sql, params)
        return cur.rowcount


class Session:
    def __init__(self, db):
        self.db = db
        self.conn = None
        self.new = OrderedDict()
        self.dirty = OrderedDict()
        self.deleted = OrderedDict()

    def _ensure_conn(self):
        if self.conn is None or self.conn.closed:
            self.conn = psycopg2.connect(self.db.dsn)
            self.conn.autocommit = False
        return self.conn

    def execute(self, statement, params=None):
        conn = self._ensure_conn()
        cur = conn.cursor()
        cur.execute(statement, params or [])
        return cur

    def query(self, *entities):
        return Query(self, *entities)

    def add(self, obj):
        obj._session = self
        if getattr(obj, '_state', 'transient') == 'transient':
            obj._state = 'pending'
            self.new[id(obj)] = obj
            self.deleted.pop(id(obj), None)
        elif getattr(obj, '_state', None) == 'deleted':
            obj._state = 'persistent'
            self.deleted.pop(id(obj), None)
            self.mark_dirty(obj)
        else:
            self.mark_dirty(obj)

    def mark_dirty(self, obj):
        if getattr(obj, '_state', None) == 'pending':
            return
        if getattr(obj, '_state', None) == 'deleted':
            return
        obj._session = self
        obj._state = 'persistent'
        self.dirty[id(obj)] = obj

    def delete(self, obj):
        for rel in getattr(obj.__class__, '__relationships__', {}).values():
            if 'delete-orphan' in rel.cascade:
                for child in getattr(obj, rel.name):
                    self.delete(child)
        if getattr(obj, '_state', None) == 'pending':
            self.new.pop(id(obj), None)
            obj._state = 'transient'
            return
        obj._session = self
        obj._state = 'deleted'
        self.dirty.pop(id(obj), None)
        self.deleted[id(obj)] = obj

    def _save_new(self, obj):
        columns = []
        values = []
        params = []
        pk_name = None
        for name, column in obj.__class__.__columns__.items():
            if column.primary_key:
                pk_name = name
                if getattr(obj, name, None) not in (None, ''):
                    columns.append(name)
                    values.append('%s')
                    params.append(_coerce_param(getattr(obj, name)))
                continue
            columns.append(name)
            values.append('%s')
            params.append(_coerce_param(getattr(obj, name)))

        quoted_columns = ', '.join([f'"{column}"' for column in columns])
        sql = f'INSERT INTO "{obj.__class__.__table_name__}" ({quoted_columns}) VALUES ({", ".join(values)})'
        if pk_name and getattr(obj, pk_name, None) in (None, ''):
            sql += f' RETURNING "{pk_name}"'
            cur = self.execute(sql, params)
            pk_value = cur.fetchone()[0]
            obj.__dict__[pk_name] = pk_value
        else:
            self.execute(sql, params)
        obj._state = 'persistent'

    def _save_dirty(self, obj):
        pk_name = None
        pk_value = None
        assignments = []
        params = []
        for name, column in obj.__class__.__columns__.items():
            value = getattr(obj, name)
            if column.primary_key:
                pk_name = name
                pk_value = value
                continue
            assignments.append(f'"{name}" = %s')
            params.append(_coerce_param(value))
        params.append(pk_value)
        sql = f'UPDATE "{obj.__class__.__table_name__}" SET {", ".join(assignments)} WHERE "{pk_name}" = %s'
        self.execute(sql, params)

    def _delete_obj(self, obj):
        pk_name = None
        pk_value = None
        for name, column in obj.__class__.__columns__.items():
            if column.primary_key:
                pk_name = name
                pk_value = getattr(obj, name)
                break
        if pk_name is None:
            return
        sql = f'DELETE FROM "{obj.__class__.__table_name__}" WHERE "{pk_name}" = %s'
        self.execute(sql, [pk_value])
        obj._state = 'transient'

    def flush(self):
        for obj in list(self.new.values()):
            self._save_new(obj)
        self.new.clear()
        for obj in list(self.dirty.values()):
            self._save_dirty(obj)
        self.dirty.clear()
        for obj in list(self.deleted.values()):
            self._delete_obj(obj)
        self.deleted.clear()

    def commit(self):
        conn = self._ensure_conn()
        try:
            self.flush()
            conn.commit()
        except Exception:
            conn.rollback()
            raise

    def rollback(self):
        if self.conn and not self.conn.closed:
            self.conn.rollback()
        self.new.clear()
        self.dirty.clear()
        self.deleted.clear()

    def close(self):
        try:
            if self.conn and not self.conn.closed:
                self.conn.close()
        finally:
            self.conn = None
            self.new.clear()
            self.dirty.clear()
            self.deleted.clear()


