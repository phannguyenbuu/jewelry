import copy
import re
from collections import OrderedDict
from contextvars import ContextVar

import psycopg2
from flask import abort
from psycopg2 import sql as pgsql
from psycopg2.extras import Json


MODEL_REGISTRY = {}
MODEL_REGISTRY_BY_TABLE = {}


def text(statement):
    return statement


def flag_modified(obj, _attr):
    if hasattr(obj, '_mark_dirty'):
        obj._mark_dirty()


def inspect(engine):
    return Inspector(engine)


def _camel_to_snake(name):
    s1 = re.sub('(.)([A-Z][a-z]+)', r'\1_\2', name)
    return re.sub('([a-z0-9])([A-Z])', r'\1_\2', s1).lower()


def _copy_default(value):
    if hasattr(value, 'arg'):
        value = value.arg
    if callable(value):
        return value()
    if isinstance(value, (dict, list, set)):
        return copy.deepcopy(value)
    return value


def _coerce_param(value):
    if isinstance(value, (dict, list)):
        return Json(value)
    return value


class DataType:
    def __init__(self, name, length=None):
        self.name = name
        self.length = length

    def sql(self):
        if self.name == 'VARCHAR' and self.length:
            return f'VARCHAR({int(self.length)})'
        return self.name


class DefaultValue:
    def __init__(self, arg):
        self.arg = arg


class ForeignKey:
    def __init__(self, target):
        self.target = target


class Condition:
    def __init__(self, clause, params=None):
        self.clause = clause
        self.params = list(params or [])


class OrderExpr:
    def __init__(self, expr_sql, direction='ASC'):
        self.expr_sql = expr_sql
        self.direction = direction

    def sql(self):
        return f'{self.expr_sql} {self.direction}'


class ColumnExpr:
    def __init__(self, model, column_name):
        self.model = model
        self.column_name = column_name

    def sql(self):
        return f'"{self.model.__table_name__}"."{self.column_name}"'

    def __eq__(self, other):
        if other is None:
            return Condition(f'{self.sql()} IS NULL')
        return Condition(f'{self.sql()} = %s', [_coerce_param(other)])

    def __ne__(self, other):
        if other is None:
            return Condition(f'{self.sql()} IS NOT NULL')
        return Condition(f'{self.sql()} <> %s', [_coerce_param(other)])

    def in_(self, values):
        values = list(values or [])
        if not values:
            return Condition('FALSE')
        placeholders = ', '.join(['%s'] * len(values))
        return Condition(f'{self.sql()} IN ({placeholders})', [_coerce_param(v) for v in values])

    def isnot(self, value):
        if value is None:
            return Condition(f'{self.sql()} IS NOT NULL')
        return Condition(f'{self.sql()} IS DISTINCT FROM %s', [_coerce_param(value)])

    def is_(self, value):
        if value is None:
            return Condition(f'{self.sql()} IS NULL')
        return Condition(f'{self.sql()} IS NOT DISTINCT FROM %s', [_coerce_param(value)])

    def desc(self):
        return OrderExpr(self.sql(), 'DESC')

    def asc(self):
        return OrderExpr(self.sql(), 'ASC')


class AggregateExpr:
    def __init__(self, func_name, inner):
        self.func_name = func_name
        self.inner = inner

    @property
    def model(self):
        return getattr(self.inner, 'model', None)

    def sql(self):
        return f'{self.func_name}({self.inner.sql()})'


class FuncNamespace:
    def max(self, inner):
        return AggregateExpr('MAX', inner)


class Column:
    def __init__(self, data_type, *constraints, primary_key=False, nullable=True, default=None, unique=False):
        self.data_type = data_type
        self.primary_key = primary_key
        self.nullable = nullable
        self.default = DefaultValue(default)
        self.unique = unique
        self.name = None
        self.model = None
        self.foreign_key = None
        for constraint in constraints:
            if isinstance(constraint, ForeignKey):
                self.foreign_key = constraint
        if isinstance(data_type, ForeignKey):
            self.foreign_key = data_type
            self.data_type = DataType('INTEGER')

    def __set_name__(self, owner, name):
        self.name = name

    def __get__(self, instance, owner):
        if instance is None:
            return ColumnExpr(owner, self.name)
        return instance.__dict__.get(self.name)

    def __set__(self, instance, value):
        instance.__dict__[self.name] = value
        if getattr(instance, '_track_changes', False):
            instance._mark_dirty()


class Relationship:
    def __init__(self, target_name, backref=None, cascade='', lazy=True, order_by=None):
        self.target_name = target_name
        self.backref = backref
        self.cascade = cascade or ''
        self.lazy = lazy
        self.order_by = order_by
        self.name = None
        self.model = None

    def __set_name__(self, owner, name):
        self.name = name

    def _resolve(self):
        target_model = MODEL_REGISTRY[self.target_name]
        foreign_key_column = None
        expected = f'{self.model.__table_name__}.id'
        for column in target_model.__columns__.values():
            if column.foreign_key and column.foreign_key.target == expected:
                foreign_key_column = column.name
                break
        if foreign_key_column is None:
            raise RuntimeError(f'Cannot resolve relationship {self.model.__name__}.{self.name}')
        if self.backref and not hasattr(target_model, self.backref):
            setattr(target_model, self.backref, BackRef(self.model, foreign_key_column))
        return target_model, foreign_key_column

    def __get__(self, instance, owner):
        if instance is None:
            return self
        target_model, foreign_key_column = self._resolve()
        query = target_model.query.filter_by(**{foreign_key_column: instance.id})
        if self.order_by:
            exprs = []
            for part in str(self.order_by).split(','):
                token = part.strip().split('.')[-1]
                if token and token in target_model.__columns__:
                    exprs.append(getattr(target_model, token))
            if exprs:
                query = query.order_by(*exprs)
        return query.all()


class BackRef:
    def __init__(self, parent_model, foreign_key_column):
        self.parent_model = parent_model
        self.foreign_key_column = foreign_key_column

    def __get__(self, instance, owner):
        if instance is None:
            return self
        parent_id = getattr(instance, self.foreign_key_column)
        if parent_id in (None, ''):
            return None
        return self.parent_model.query.get(parent_id)


class QueryProperty:
    def __get__(self, instance, owner):
        return owner._db.session.query(owner)


class TableMetadata:
    def __init__(self, name, columns):
        self.name = name
        self.columns = columns


class ModelMeta(type):
    def __new__(mcls, name, bases, attrs):
        columns = OrderedDict()
        relationships = OrderedDict()
        for base in bases:
            columns.update(getattr(base, '__columns__', {}))
            relationships.update(getattr(base, '__relationships__', {}))

        for key, value in attrs.items():
            if isinstance(value, Column):
                columns[key] = value
            elif isinstance(value, Relationship):
                relationships[key] = value

        cls = super().__new__(mcls, name, bases, attrs)
        if name != 'Model':
            cls.__table_name__ = attrs.get('__tablename__') or _camel_to_snake(name)
            cls.__columns__ = columns
            cls.__relationships__ = relationships
            for column in columns.values():
                column.model = cls
            for relationship in relationships.values():
                relationship.model = cls
            cls.__table__ = TableMetadata(cls.__table_name__, columns)
            MODEL_REGISTRY[name] = cls
            MODEL_REGISTRY_BY_TABLE[cls.__table_name__] = cls
        return cls


class Model(metaclass=ModelMeta):
    query = QueryProperty()
    _db = None

    def __init__(self, **kwargs):
        self._session = None
        self._state = 'transient'
        self._track_changes = False
        for name, column in self.__columns__.items():
            self.__dict__[name] = _copy_default(column.default)
        for key, value in kwargs.items():
            setattr(self, key, value)
        self._track_changes = True

    @classmethod
    def _from_row(cls, row, column_names, session):
        obj = cls.__new__(cls)
        obj._session = session
        obj._state = 'persistent'
        obj._track_changes = True
        for key, value in zip(column_names, row):
            obj.__dict__[key] = value
        for name, column in cls.__columns__.items():
            if name not in obj.__dict__:
                obj.__dict__[name] = _copy_default(column.default)
        return obj

    def _mark_dirty(self):
        if getattr(self, '_state', None) == 'persistent' and self._session:
            self._session.mark_dirty(self)


class Inspector:
    def __init__(self, engine):
        self.engine = engine

    def get_table_names(self):
        with self.engine.connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT table_name
                    FROM information_schema.tables
                    WHERE table_schema = 'public'
                    ORDER BY table_name
                    """
                )
                return [row[0] for row in cur.fetchall()]

    def get_columns(self, table_name):
        with self.engine.connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT column_name, data_type
                    FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = %s
                    ORDER BY ordinal_position
                    """,
                    (table_name,),
                )
                return [{'name': row[0], 'type': row[1]} for row in cur.fetchall()]


