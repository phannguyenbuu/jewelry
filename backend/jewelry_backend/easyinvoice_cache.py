import datetime
import hashlib
import json
import os
import threading
import time
from contextlib import closing

import psycopg2
from psycopg2.extras import Json
from flask import jsonify, request

from . import easyinvoice_client
from .models import HeThongCauHinh
from .orders_routes import _easyinvoice_config
from .state import app, db
from .utils import _clean_text, now_str


EASYINVOICE_CACHE_TABLE = 'easyinvoice_cache_invoice'
EASYINVOICE_CACHE_STATE_TABLE = 'easyinvoice_cache_state'
EASYINVOICE_CACHE_LOG_TABLE = 'easyinvoice_cache_log'
EASYINVOICE_CACHE_KEY = 'default'
EASYINVOICE_CACHE_LOCK_KEY = 5800884170
EASYINVOICE_CACHE_BOOTSTRAP_LOCK_KEY = EASYINVOICE_CACHE_LOCK_KEY + 1
EASYINVOICE_CACHE_LOG_LIMIT = 3
EASYINVOICE_CACHE_MIN_INTERVAL_SECONDS = 30

_easyinvoice_cache_bootstrap_lock = threading.Lock()
_easyinvoice_cache_bootstrapped = False
_easyinvoice_cache_worker_lock = threading.Lock()
_easyinvoice_cache_worker_started = False


def _easyinvoice_cache_connect():
    return psycopg2.connect(app.config['DATABASE_URL'])


def _easyinvoice_cache_parse_int(value, default=0):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _easyinvoice_cache_parse_bool(value, default=False):
    if isinstance(value, bool):
        return value
    text = _clean_text(value).strip().lower()
    if text in ('1', 'true', 'yes', 'on'):
        return True
    if text in ('0', 'false', 'no', 'off'):
        return False
    return default


def _easyinvoice_cache_parse_bigint(value, default=0):
    text = _clean_text(value).replace(',', '')
    if not text:
        return default
    try:
        return int(round(float(text)))
    except (TypeError, ValueError):
        return default


def _easyinvoice_cache_date_key(value):
    text = _clean_text(value)
    if not text:
        return 0
    for fmt in ('%d/%m/%Y', '%d/%m/%Y %H:%M:%S', '%Y-%m-%d'):
        try:
            parsed = datetime.datetime.strptime(text[:19], fmt)
            return int(parsed.strftime('%Y%m%d'))
        except ValueError:
            continue
    return 0


def _easyinvoice_cache_datetime_key(value):
    text = _clean_text(value)
    if not text:
        return 0
    for fmt in (
        '%d/%m/%Y %H:%M:%S',
        '%d/%m/%Y',
        '%Y-%m-%d %H:%M:%S',
        '%Y-%m-%d',
    ):
        try:
            parsed = datetime.datetime.strptime(text[:19], fmt)
            return int(parsed.strftime('%Y%m%d%H%M%S'))
        except ValueError:
            continue
    return 0


def _easyinvoice_cache_today_date():
    return now_str().split(' ')[0]


def _easyinvoice_cache_parse_date_range(args):
    from_date = _clean_text((args or {}).get('FromDate')) or '01/01/2026'
    to_date = _clean_text((args or {}).get('ToDate')) or _easyinvoice_cache_today_date()
    return from_date, to_date


def _easyinvoice_cache_settings():
    sync_interval_seconds = 60
    cache_from_date = '01/01/2026'
    polling_enabled = True
    config_obj = HeThongCauHinh.query.filter_by(config_key='easyinvoice_settings').first()
    config_data = config_obj.data if config_obj and isinstance(config_obj.data, dict) else {}

    raw_interval = (
        os.getenv('EASYINVOICE_SYNC_INTERVAL_SECONDS')
        or config_data.get('sync_interval_seconds')
        or config_data.get('cache_poll_seconds')
        or config_data.get('cache_sync_seconds')
        or sync_interval_seconds
    )
    raw_from_date = (
        os.getenv('EASYINVOICE_CACHE_FROM_DATE')
        or config_data.get('cache_from_date')
        or config_data.get('sync_from_date')
        or cache_from_date
    )
    raw_polling_enabled = (
        os.getenv('EASYINVOICE_POLLING_ENABLED')
        if os.getenv('EASYINVOICE_POLLING_ENABLED') is not None
        else config_data.get('polling_enabled', polling_enabled)
    )

    sync_interval_seconds = max(
        EASYINVOICE_CACHE_MIN_INTERVAL_SECONDS,
        _easyinvoice_cache_parse_int(raw_interval, 60),
    )
    cache_from_date = _clean_text(raw_from_date) or cache_from_date
    return {
        'sync_interval_seconds': sync_interval_seconds,
        'cache_from_date': cache_from_date,
        'polling_enabled': _easyinvoice_cache_parse_bool(raw_polling_enabled, polling_enabled),
    }


def _easyinvoice_cache_bootstrap_tables():
    global _easyinvoice_cache_bootstrapped
    if _easyinvoice_cache_bootstrapped:
        return
    with _easyinvoice_cache_bootstrap_lock:
        if _easyinvoice_cache_bootstrapped:
            return
        now_value = now_str()
        with closing(_easyinvoice_cache_connect()) as conn:
            conn.autocommit = True
            with conn.cursor() as cur:
                cur.execute('SELECT pg_advisory_lock(%s)', [EASYINVOICE_CACHE_BOOTSTRAP_LOCK_KEY])
                try:
                    cur.execute(
                        f'''
                        CREATE TABLE IF NOT EXISTS {EASYINVOICE_CACHE_TABLE} (
                            id SERIAL PRIMARY KEY,
                            invoice_key VARCHAR(160) NOT NULL UNIQUE,
                            invoice_no VARCHAR(120) DEFAULT '',
                            lookup_code VARCHAR(120) DEFAULT '',
                            ikey VARCHAR(120) DEFAULT '',
                            buyer VARCHAR(255) DEFAULT '',
                            search_text TEXT DEFAULT '',
                            amount_value BIGINT DEFAULT 0,
                            invoice_status INTEGER DEFAULT -1,
                            invoice_type INTEGER DEFAULT -1,
                            arising_date VARCHAR(20) DEFAULT '',
                            arising_date_key INTEGER DEFAULT 0,
                            arising_datetime_key BIGINT DEFAULT 0,
                            raw_json JSON,
                            created_at VARCHAR(30) DEFAULT '',
                            updated_at VARCHAR(30) DEFAULT ''
                        )
                        '''
                    )
                    cur.execute(
                        f'ALTER TABLE {EASYINVOICE_CACHE_TABLE} ADD COLUMN IF NOT EXISTS arising_datetime_key BIGINT DEFAULT 0'
                    )
                    cur.execute(
                        f'''
                        CREATE TABLE IF NOT EXISTS {EASYINVOICE_CACHE_STATE_TABLE} (
                            cache_key VARCHAR(80) PRIMARY KEY,
                            is_running BOOLEAN DEFAULT FALSE,
                            last_status VARCHAR(30) DEFAULT 'idle',
                            last_trigger VARCHAR(40) DEFAULT '',
                            last_started_at VARCHAR(30) DEFAULT '',
                            last_finished_at VARCHAR(30) DEFAULT '',
                            last_duration_ms INTEGER DEFAULT 0,
                            last_row_count INTEGER DEFAULT 0,
                            last_error TEXT DEFAULT '',
                            next_run_at VARCHAR(30) DEFAULT '',
                            sync_from_date VARCHAR(20) DEFAULT '',
                            sync_to_date VARCHAR(20) DEFAULT '',
                            updated_at VARCHAR(30) DEFAULT ''
                        )
                        '''
                    )
                    cur.execute(
                        f'''
                        CREATE TABLE IF NOT EXISTS {EASYINVOICE_CACHE_LOG_TABLE} (
                            id SERIAL PRIMARY KEY,
                            trigger_source VARCHAR(40) DEFAULT '',
                            status VARCHAR(30) DEFAULT '',
                            started_at VARCHAR(30) DEFAULT '',
                            finished_at VARCHAR(30) DEFAULT '',
                            duration_ms INTEGER DEFAULT 0,
                            row_count INTEGER DEFAULT 0,
                            new_invoice_count INTEGER DEFAULT 0,
                            new_total_amount BIGINT DEFAULT 0,
                            sync_from_date VARCHAR(20) DEFAULT '',
                            sync_to_date VARCHAR(20) DEFAULT '',
                            message TEXT DEFAULT '',
                            error_text TEXT DEFAULT '',
                            created_at VARCHAR(30) DEFAULT ''
                        )
                        '''
                    )
                    cur.execute(
                        f'ALTER TABLE {EASYINVOICE_CACHE_LOG_TABLE} ADD COLUMN IF NOT EXISTS new_invoice_count INTEGER DEFAULT 0'
                    )
                    cur.execute(
                        f'ALTER TABLE {EASYINVOICE_CACHE_LOG_TABLE} ADD COLUMN IF NOT EXISTS new_total_amount BIGINT DEFAULT 0'
                    )
                    cur.execute(
                        f'CREATE INDEX IF NOT EXISTS ix_easyinvoice_cache_invoice_date ON {EASYINVOICE_CACHE_TABLE} (arising_date_key DESC)'
                    )
                    cur.execute(
                        f'CREATE INDEX IF NOT EXISTS ix_easyinvoice_cache_invoice_datetime ON {EASYINVOICE_CACHE_TABLE} (arising_datetime_key DESC)'
                    )
                    cur.execute(
                        f'CREATE INDEX IF NOT EXISTS ix_easyinvoice_cache_invoice_amount ON {EASYINVOICE_CACHE_TABLE} (amount_value)'
                    )
                    cur.execute(
                        f'CREATE INDEX IF NOT EXISTS ix_easyinvoice_cache_invoice_status ON {EASYINVOICE_CACHE_TABLE} (invoice_status)'
                    )
                    cur.execute(
                        f'CREATE INDEX IF NOT EXISTS ix_easyinvoice_cache_invoice_lookup ON {EASYINVOICE_CACHE_TABLE} (lookup_code)'
                    )
                    cur.execute(
                        f'CREATE INDEX IF NOT EXISTS ix_easyinvoice_cache_invoice_ikey ON {EASYINVOICE_CACHE_TABLE} (ikey)'
                    )
                    cur.execute(
                        f'''
                        INSERT INTO {EASYINVOICE_CACHE_STATE_TABLE} (
                            cache_key, is_running, last_status, updated_at
                        )
                        VALUES (%s, FALSE, 'idle', %s)
                        ON CONFLICT (cache_key) DO NOTHING
                        ''',
                        [EASYINVOICE_CACHE_KEY, now_value],
                    )
                finally:
                    cur.execute('SELECT pg_advisory_unlock(%s)', [EASYINVOICE_CACHE_BOOTSTRAP_LOCK_KEY])
        _easyinvoice_cache_bootstrapped = True


def bootstrap_easyinvoice_cache():
    with app.app_context():
        _easyinvoice_cache_bootstrap_tables()


def _easyinvoice_cache_invoice_key(invoice):
    payload = {
        'ikey': _clean_text(invoice.get('Ikey') or invoice.get('ikey')),
        'lookup_code': _clean_text(invoice.get('LookupCode') or invoice.get('Code')),
        'invoice_no': _clean_text(invoice.get('InvoiceNo') or invoice.get('No') or invoice.get('InvNo')),
        'buyer': _clean_text(invoice.get('Buyer') or invoice.get('CusName') or invoice.get('CustomerName')),
        'arising_date': _clean_text(invoice.get('ArisingDate') or invoice.get('PublishDate') or invoice.get('InvDate')),
        'amount': _easyinvoice_cache_parse_bigint(invoice.get('Amount') or invoice.get('TotalAmount') or invoice.get('Total') or 0),
    }
    encoded = json.dumps(payload, ensure_ascii=False, sort_keys=True)
    return hashlib.sha1(encoded.encode('utf-8')).hexdigest()


def _easyinvoice_cache_compare_key_from_parts(ikey='', lookup_code='', invoice_no='', fallback=''):
    ikey_value = _clean_text(ikey)
    lookup_value = _clean_text(lookup_code)
    invoice_value = _clean_text(invoice_no)
    if ikey_value:
        return f'ikey:{ikey_value}'
    if lookup_value:
        return f'lookup:{lookup_value}'
    if invoice_value:
        return f'invoice:{invoice_value}'
    return _clean_text(fallback)


def _easyinvoice_cache_compare_key(invoice):
    return _easyinvoice_cache_compare_key_from_parts(
        invoice.get('Ikey') or invoice.get('ikey'),
        invoice.get('LookupCode') or invoice.get('Code'),
        invoice.get('InvoiceNo') or invoice.get('No') or invoice.get('InvNo'),
        _easyinvoice_cache_invoice_key(invoice),
    )


def _easyinvoice_cache_search_text(invoice):
    parts = [
        _clean_text(invoice.get('InvoiceNo') or invoice.get('No') or invoice.get('InvNo')),
        _clean_text(invoice.get('LookupCode') or invoice.get('Code')),
        _clean_text(invoice.get('Ikey') or invoice.get('ikey')),
        _clean_text(invoice.get('Buyer') or invoice.get('CusName') or invoice.get('CustomerName')),
    ]
    return ' '.join(part for part in parts if part)


def _easyinvoice_cache_existing_compare_keys(cur):
    cur.execute(
        f'''
        SELECT
            ikey,
            lookup_code,
            invoice_no,
            invoice_key
        FROM {EASYINVOICE_CACHE_TABLE}
        '''
    )
    existing = set()
    for row in cur.fetchall():
        existing.add(_easyinvoice_cache_compare_key_from_parts(
            row[0] or '',
            row[1] or '',
            row[2] or '',
            row[3] or '',
        ))
    return existing


def _easyinvoice_cache_new_invoice_stats(existing_compare_keys, invoices):
    existing = set(existing_compare_keys or set())
    seen = set()
    new_invoice_count = 0
    new_total_amount = 0

    for invoice in list(invoices or []):
        compare_key = _easyinvoice_cache_compare_key(invoice)
        if not compare_key or compare_key in existing or compare_key in seen:
            continue
        seen.add(compare_key)
        new_invoice_count += 1
        new_total_amount += _easyinvoice_cache_parse_bigint(
            invoice.get('Amount') or invoice.get('TotalAmount') or invoice.get('Total') or 0
        )

    return new_invoice_count, new_total_amount


def _easyinvoice_cache_insert_rows(cur, invoices):
    timestamp = now_str()
    rows = []
    for invoice in list(invoices or []):
        invoice_no = _clean_text(invoice.get('InvoiceNo') or invoice.get('No') or invoice.get('InvNo'))
        lookup_code = _clean_text(invoice.get('LookupCode') or invoice.get('Code'))
        ikey = _clean_text(invoice.get('Ikey') or invoice.get('ikey'))
        buyer = _clean_text(invoice.get('Buyer') or invoice.get('CusName') or invoice.get('CustomerName'))
        arising_date = _clean_text(invoice.get('ArisingDate') or invoice.get('PublishDate') or invoice.get('InvDate'))
        rows.append((
            _easyinvoice_cache_invoice_key(invoice),
            invoice_no,
            lookup_code,
            ikey,
            buyer,
            _easyinvoice_cache_search_text(invoice),
            _easyinvoice_cache_parse_bigint(invoice.get('Amount') or invoice.get('TotalAmount') or invoice.get('Total') or 0),
            _easyinvoice_cache_parse_int(invoice.get('InvoiceStatus'), -1),
            _easyinvoice_cache_parse_int(invoice.get('InvoiceType'), -1),
            arising_date,
            _easyinvoice_cache_date_key(arising_date),
            _easyinvoice_cache_datetime_key(arising_date),
            Json(invoice),
            timestamp,
            timestamp,
        ))
    if not rows:
        return 0
    cur.executemany(
        f'''
        INSERT INTO {EASYINVOICE_CACHE_TABLE} (
            invoice_key,
            invoice_no,
            lookup_code,
            ikey,
            buyer,
            search_text,
            amount_value,
            invoice_status,
            invoice_type,
            arising_date,
            arising_date_key,
            arising_datetime_key,
            raw_json,
            created_at,
            updated_at
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ''',
        rows,
    )
    return len(rows)


def _easyinvoice_cache_write_log(cur, payload):
    cur.execute(
        f'''
        INSERT INTO {EASYINVOICE_CACHE_LOG_TABLE} (
            trigger_source,
            status,
            started_at,
            finished_at,
            duration_ms,
            row_count,
            new_invoice_count,
            new_total_amount,
            sync_from_date,
            sync_to_date,
            message,
            error_text,
            created_at
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ''',
        [
            _clean_text(payload.get('trigger_source')),
            _clean_text(payload.get('status')),
            _clean_text(payload.get('started_at')),
            _clean_text(payload.get('finished_at')),
            _easyinvoice_cache_parse_int(payload.get('duration_ms'), 0),
            _easyinvoice_cache_parse_int(payload.get('row_count'), 0),
            _easyinvoice_cache_parse_int(payload.get('new_invoice_count'), 0),
            _easyinvoice_cache_parse_bigint(payload.get('new_total_amount'), 0),
            _clean_text(payload.get('sync_from_date')),
            _clean_text(payload.get('sync_to_date')),
            _clean_text(payload.get('message')),
            _clean_text(payload.get('error_text')),
            _clean_text(payload.get('created_at')) or now_str(),
        ],
    )
    cur.execute(
        f'''
        DELETE FROM {EASYINVOICE_CACHE_LOG_TABLE}
        WHERE id NOT IN (
            SELECT id
            FROM {EASYINVOICE_CACHE_LOG_TABLE}
            ORDER BY id DESC
            LIMIT %s
        )
        ''',
        [EASYINVOICE_CACHE_LOG_LIMIT],
    )


def _easyinvoice_cache_update_state(cur, payload):
    cur.execute(
        f'''
        UPDATE {EASYINVOICE_CACHE_STATE_TABLE}
        SET
            is_running = %s,
            last_status = %s,
            last_trigger = %s,
            last_started_at = %s,
            last_finished_at = %s,
            last_duration_ms = %s,
            last_row_count = %s,
            last_error = %s,
            next_run_at = %s,
            sync_from_date = %s,
            sync_to_date = %s,
            updated_at = %s
        WHERE cache_key = %s
        ''',
        [
            bool(payload.get('is_running')),
            _clean_text(payload.get('last_status')),
            _clean_text(payload.get('last_trigger')),
            _clean_text(payload.get('last_started_at')),
            _clean_text(payload.get('last_finished_at')),
            _easyinvoice_cache_parse_int(payload.get('last_duration_ms'), 0),
            _easyinvoice_cache_parse_int(payload.get('last_row_count'), 0),
            _clean_text(payload.get('last_error')),
            _clean_text(payload.get('next_run_at')),
            _clean_text(payload.get('sync_from_date')),
            _clean_text(payload.get('sync_to_date')),
            _clean_text(payload.get('updated_at')) or now_str(),
            EASYINVOICE_CACHE_KEY,
        ],
    )


def _easyinvoice_cache_save_settings(changes):
    now_value = now_str()
    config_obj = HeThongCauHinh.query.filter_by(config_key='easyinvoice_settings').first()
    if not config_obj:
        config_obj = HeThongCauHinh(
            config_key='easyinvoice_settings',
            data={},
            ghi_chu='Cấu hình EasyInvoice.',
            ngay_tao=now_value,
            cap_nhat_luc=now_value,
        )
        db.session.add(config_obj)
        db.session.flush()

    updated = dict(config_obj.data or {})
    updated.update(changes or {})
    config_obj.data = updated
    config_obj.cap_nhat_luc = now_value
    db.session.commit()
    return updated


def _easyinvoice_cache_fetch_state_and_logs():
    _easyinvoice_cache_bootstrap_tables()
    with closing(_easyinvoice_cache_connect()) as conn:
        with conn.cursor() as cur:
            cur.execute(
                f'''
                SELECT
                    is_running,
                    last_status,
                    last_trigger,
                    last_started_at,
                    last_finished_at,
                    last_duration_ms,
                    last_row_count,
                    last_error,
                    next_run_at,
                    sync_from_date,
                    sync_to_date,
                    updated_at
                FROM {EASYINVOICE_CACHE_STATE_TABLE}
                WHERE cache_key = %s
                ''',
                [EASYINVOICE_CACHE_KEY],
            )
            row = cur.fetchone()
            state = {
                'is_running': bool(row[0]) if row else False,
                'last_status': row[1] if row else 'idle',
                'last_trigger': row[2] if row else '',
                'last_started_at': row[3] if row else '',
                'last_finished_at': row[4] if row else '',
                'last_duration_ms': int(row[5] or 0) if row else 0,
                'last_duration_seconds': round((int(row[5] or 0) if row else 0) / 1000, 2),
                'last_row_count': int(row[6] or 0) if row else 0,
                'last_error': row[7] if row else '',
                'next_run_at': row[8] if row else '',
                'sync_from_date': row[9] if row else '',
                'sync_to_date': row[10] if row else '',
                'updated_at': row[11] if row else '',
            }
            cur.execute(
                f'''
                SELECT
                    id,
                    trigger_source,
                    status,
                    started_at,
                    finished_at,
                    duration_ms,
                    row_count,
                    new_invoice_count,
                    new_total_amount,
                    sync_from_date,
                    sync_to_date,
                    message,
                    error_text,
                    created_at
                FROM {EASYINVOICE_CACHE_LOG_TABLE}
                ORDER BY id DESC
                LIMIT %s
                ''',
                [EASYINVOICE_CACHE_LOG_LIMIT],
            )
            logs = []
            for log_row in cur.fetchall():
                duration_ms = int(log_row[5] or 0)
                logs.append({
                    'id': int(log_row[0]),
                    'trigger_source': log_row[1] or '',
                    'status': log_row[2] or '',
                    'started_at': log_row[3] or '',
                    'finished_at': log_row[4] or '',
                    'duration_ms': duration_ms,
                    'duration_seconds': round(duration_ms / 1000, 2),
                    'row_count': int(log_row[6] or 0),
                    'new_invoice_count': int(log_row[7] or 0),
                    'new_total_amount': _easyinvoice_cache_parse_bigint(log_row[8], 0),
                    'sync_from_date': log_row[9] or '',
                    'sync_to_date': log_row[10] or '',
                    'message': log_row[11] or '',
                    'error_text': log_row[12] or '',
                    'created_at': log_row[13] or '',
                })
            return state, logs


def _easyinvoice_cache_attach_settings(state, settings):
    state = dict(state or {})
    config = dict(settings or {})
    state['poll_interval_seconds'] = config.get('sync_interval_seconds', 60)
    state['polling_enabled'] = bool(config.get('polling_enabled', True))
    if not state['polling_enabled']:
        state['next_run_at'] = ''
    return state


def _easyinvoice_cache_try_lock(conn):
    with conn.cursor() as cur:
        cur.execute('SELECT pg_try_advisory_lock(%s)', [EASYINVOICE_CACHE_LOCK_KEY])
        row = cur.fetchone()
        return bool(row[0]) if row else False


def _easyinvoice_cache_unlock(conn):
    with conn.cursor() as cur:
        cur.execute('SELECT pg_advisory_unlock(%s)', [EASYINVOICE_CACHE_LOCK_KEY])


def sync_easyinvoice_cache_once(trigger_source='manual'):
    _easyinvoice_cache_bootstrap_tables()
    started_monotonic = time.perf_counter()
    started_at = now_str()
    settings = None

    with closing(_easyinvoice_cache_connect()) as lock_conn:
        lock_conn.autocommit = True
        if not _easyinvoice_cache_try_lock(lock_conn):
            state, logs = _easyinvoice_cache_fetch_state_and_logs()
            return {
                'ok': False,
                'skipped': True,
                'reason': 'busy',
                'state': state,
                'logs': logs,
            }

        try:
            with app.app_context():
                settings = _easyinvoice_cache_settings()
                from_date = settings['cache_from_date']
                to_date = _easyinvoice_cache_today_date()
                config = _easyinvoice_config()
                missing = [key for key in ('password', 'tax_code') if not config.get(key)]

                with closing(_easyinvoice_cache_connect()) as state_conn:
                    state_conn.autocommit = False
                    with state_conn.cursor() as cur:
                        _easyinvoice_cache_update_state(cur, {
                            'is_running': True,
                            'last_status': 'running',
                            'last_trigger': trigger_source,
                            'last_started_at': started_at,
                            'last_finished_at': '',
                            'last_duration_ms': 0,
                            'last_row_count': 0,
                            'last_error': '',
                            'next_run_at': '',
                            'sync_from_date': from_date,
                            'sync_to_date': to_date,
                            'updated_at': started_at,
                        })
                    state_conn.commit()

                if missing:
                    raise RuntimeError(f"Thiếu cấu hình EasyInvoice: {', '.join(missing)}")

                result = easyinvoice_client.search_invoices(
                    config,
                    from_date=from_date,
                    to_date=to_date,
                    pattern=config.get('pattern', ''),
                    keyword='',
                    invoice_type=-1,
                    status=-1,
                    start=0,
                    length=0,
                    timeout=60,
                )

                invoices = []
                if isinstance(result, dict):
                    if isinstance(result.get('Data'), dict) and isinstance(result['Data'].get('Invoices'), list):
                        invoices = list(result['Data']['Invoices'])
                    elif isinstance(result.get('Rows'), list):
                        invoices = list(result['Rows'])
                    elif isinstance(result.get('data'), list):
                        invoices = list(result['data'])

                finished_at = now_str()
                duration_ms = int(round((time.perf_counter() - started_monotonic) * 1000))
                next_run_at = (
                    datetime.datetime.strptime(finished_at, '%d/%m/%Y %H:%M:%S')
                    + datetime.timedelta(seconds=settings['sync_interval_seconds'])
                ).strftime('%d/%m/%Y %H:%M:%S')

                with closing(_easyinvoice_cache_connect()) as data_conn:
                    data_conn.autocommit = False
                    with data_conn.cursor() as cur:
                        existing_compare_keys = _easyinvoice_cache_existing_compare_keys(cur)
                        new_invoice_count, new_total_amount = _easyinvoice_cache_new_invoice_stats(existing_compare_keys, invoices)
                        cur.execute(f'DELETE FROM {EASYINVOICE_CACHE_TABLE}')
                        row_count = _easyinvoice_cache_insert_rows(cur, invoices)
                        _easyinvoice_cache_update_state(cur, {
                            'is_running': False,
                            'last_status': 'success',
                            'last_trigger': trigger_source,
                            'last_started_at': started_at,
                            'last_finished_at': finished_at,
                            'last_duration_ms': duration_ms,
                            'last_row_count': row_count,
                            'last_error': '',
                            'next_run_at': next_run_at,
                            'sync_from_date': from_date,
                            'sync_to_date': to_date,
                            'updated_at': finished_at,
                        })
                        _easyinvoice_cache_write_log(cur, {
                            'trigger_source': trigger_source,
                            'status': 'success',
                            'started_at': started_at,
                            'finished_at': finished_at,
                            'duration_ms': duration_ms,
                            'row_count': row_count,
                            'new_invoice_count': new_invoice_count,
                            'new_total_amount': new_total_amount,
                            'sync_from_date': from_date,
                            'sync_to_date': to_date,
                            'message': (
                                f'Tải {row_count} hóa đơn trong {round(duration_ms / 1000, 2)} giây. '
                                f'Mới: {new_invoice_count} hóa đơn · +{new_total_amount:,} VNĐ.'
                            ),
                            'error_text': '',
                            'created_at': finished_at,
                        })
                    data_conn.commit()

                state, logs = _easyinvoice_cache_fetch_state_and_logs()
                return {
                    'ok': True,
                    'skipped': False,
                    'row_count': len(invoices),
                    'new_invoice_count': new_invoice_count,
                    'new_total_amount': new_total_amount,
                    'duration_ms': duration_ms,
                    'duration_seconds': round(duration_ms / 1000, 2),
                    'state': state,
                    'logs': logs,
                }
        except Exception as exc:
            finished_at = now_str()
            duration_ms = int(round((time.perf_counter() - started_monotonic) * 1000))
            next_run_at = ''
            if settings:
                next_run_at = (
                    datetime.datetime.strptime(finished_at, '%d/%m/%Y %H:%M:%S')
                    + datetime.timedelta(seconds=settings['sync_interval_seconds'])
                ).strftime('%d/%m/%Y %H:%M:%S')
            with closing(_easyinvoice_cache_connect()) as error_conn:
                error_conn.autocommit = False
                with error_conn.cursor() as cur:
                    _easyinvoice_cache_update_state(cur, {
                        'is_running': False,
                        'last_status': 'error',
                        'last_trigger': trigger_source,
                        'last_started_at': started_at,
                        'last_finished_at': finished_at,
                        'last_duration_ms': duration_ms,
                        'last_row_count': 0,
                        'last_error': str(exc),
                        'next_run_at': next_run_at,
                        'sync_from_date': settings['cache_from_date'] if settings else '',
                        'sync_to_date': _easyinvoice_cache_today_date(),
                        'updated_at': finished_at,
                    })
                    _easyinvoice_cache_write_log(cur, {
                        'trigger_source': trigger_source,
                        'status': 'error',
                        'started_at': started_at,
                        'finished_at': finished_at,
                        'duration_ms': duration_ms,
                        'row_count': 0,
                        'new_invoice_count': 0,
                        'new_total_amount': 0,
                        'sync_from_date': settings['cache_from_date'] if settings else '',
                        'sync_to_date': _easyinvoice_cache_today_date(),
                        'message': '',
                        'error_text': str(exc),
                        'created_at': finished_at,
                    })
                error_conn.commit()
            state, logs = _easyinvoice_cache_fetch_state_and_logs()
            return {
                'ok': False,
                'skipped': False,
                'error': str(exc),
                'state': state,
                'logs': logs,
            }
        finally:
            try:
                _easyinvoice_cache_unlock(lock_conn)
            except Exception:
                pass


def _easyinvoice_cache_worker_loop():
    with app.app_context():
        settings = _easyinvoice_cache_settings()
    if settings['polling_enabled']:
        sync_easyinvoice_cache_once('startup')
    while True:
        with app.app_context():
            settings = _easyinvoice_cache_settings()
        time.sleep(settings['sync_interval_seconds'])
        if not settings['polling_enabled']:
            continue
        sync_easyinvoice_cache_once('scheduler')


def ensure_easyinvoice_cache_worker_started():
    global _easyinvoice_cache_worker_started
    _easyinvoice_cache_bootstrap_tables()
    with _easyinvoice_cache_worker_lock:
        if _easyinvoice_cache_worker_started:
            return False
        worker = threading.Thread(
            target=_easyinvoice_cache_worker_loop,
            name='easyinvoice-cache-sync',
            daemon=True,
        )
        worker.start()
        _easyinvoice_cache_worker_started = True
        return True


@app.before_request
def _easyinvoice_cache_before_request():
    path = request.path or ''
    if path.startswith('/api/easyinvoice'):
        ensure_easyinvoice_cache_worker_started()


def query_easyinvoice_cache_response(args):
    _easyinvoice_cache_bootstrap_tables()
    from_date, to_date = _easyinvoice_cache_parse_date_range(args)
    from_key = _easyinvoice_cache_date_key(from_date)
    to_key = _easyinvoice_cache_date_key(to_date)
    keyword = _clean_text((args or {}).get('Keyword'))
    min_amount = _easyinvoice_cache_parse_bigint((args or {}).get('MinAmount'), 0)
    max_amount = _easyinvoice_cache_parse_bigint((args or {}).get('MaxAmount'), 0)
    status = _easyinvoice_cache_parse_int((args or {}).get('Status'), -1)
    start = max(0, _easyinvoice_cache_parse_int((args or {}).get('start'), 0))
    length = _easyinvoice_cache_parse_int((args or {}).get('length'), 100)

    where_clauses = ['arising_date_key BETWEEN %s AND %s']
    params = [from_key, to_key]

    if keyword:
        where_clauses.append('(search_text ILIKE %s)')
        params.append(f'%{keyword}%')
    if status >= 0:
        where_clauses.append('invoice_status = %s')
        params.append(status)
    if min_amount > 0:
        where_clauses.append('amount_value >= %s')
        params.append(min_amount)
    if max_amount > 0:
        where_clauses.append('amount_value <= %s')
        params.append(max_amount)

    where_sql = ' AND '.join(where_clauses)
    state, logs = _easyinvoice_cache_fetch_state_and_logs()
    settings = _easyinvoice_cache_settings()
    state = _easyinvoice_cache_attach_settings(state, settings)

    with closing(_easyinvoice_cache_connect()) as conn:
        with conn.cursor() as cur:
            cur.execute(
                f'SELECT COUNT(*) FROM {EASYINVOICE_CACHE_TABLE} WHERE {where_sql}',
                params,
            )
            total_records = int((cur.fetchone() or [0])[0] or 0)
            cur.execute(
                f'''
                SELECT
                    COUNT(DISTINCT NULLIF(TRIM(buyer), '')),
                    COALESCE(SUM(amount_value), 0)
                FROM {EASYINVOICE_CACHE_TABLE}
                WHERE {where_sql}
                ''',
                params,
            )
            stats_row = cur.fetchone() or [0, 0]
            customer_count = int(stats_row[0] or 0)
            total_amount = int(stats_row[1] or 0)

            data_sql = (
                f'SELECT raw_json FROM {EASYINVOICE_CACHE_TABLE} '
                f'WHERE {where_sql} '
                f'ORDER BY arising_datetime_key DESC, arising_date_key DESC, id DESC'
            )
            data_params = list(params)
            if length > 0:
                data_sql += ' OFFSET %s LIMIT %s'
                data_params.extend([start, length])
            cur.execute(data_sql, data_params)
            rows = []
            for row in cur.fetchall():
                payload = row[0]
                if isinstance(payload, str):
                    try:
                        payload = json.loads(payload)
                    except ValueError:
                        payload = {}
                rows.append(payload if isinstance(payload, dict) else {})

    response_payload = {
        'Status': 2,
        'source': 'cache',
        'Rows': rows,
        'data': rows,
        'TotalRecords': total_records,
        'FetchedRecords': len(rows),
        'start': start,
        'length': length,
        'stats': {
            'invoice_count': total_records,
            'customer_count': customer_count,
            'total_amount': total_amount,
        },
        'Data': {
            'Invoices': rows,
            'TotalRecords': total_records,
            'FetchedRecords': len(rows),
            'Source': 'cache',
            'Stats': {
                'InvoiceCount': total_records,
                'CustomerCount': customer_count,
                'TotalAmount': total_amount,
            },
        },
        'sync': state,
        'logs': logs,
        'poll_interval_seconds': settings['sync_interval_seconds'],
    }
    return jsonify(response_payload)


@app.route('/api/easyinvoice/cache-status', methods=['GET'])
def api_easyinvoice_cache_status():
    state, logs = _easyinvoice_cache_fetch_state_and_logs()
    settings = _easyinvoice_cache_settings()
    state = _easyinvoice_cache_attach_settings(state, settings)
    return jsonify({
        'ok': True,
        'sync': state,
        'logs': logs,
        'poll_interval_seconds': settings['sync_interval_seconds'],
    })


@app.route('/api/easyinvoice/cache-sync', methods=['POST'])
def api_easyinvoice_cache_sync():
    ensure_easyinvoice_cache_worker_started()
    threading.Thread(
        target=sync_easyinvoice_cache_once,
        args=('manual',),
        name='easyinvoice-cache-manual-sync',
        daemon=True,
    ).start()
    state, logs = _easyinvoice_cache_fetch_state_and_logs()
    settings = _easyinvoice_cache_settings()
    state = _easyinvoice_cache_attach_settings(state, settings)
    return jsonify({
        'ok': True,
        'queued': True,
        'sync': state,
        'logs': logs,
        'poll_interval_seconds': settings['sync_interval_seconds'],
    }), 202


@app.route('/api/easyinvoice/cache-polling', methods=['POST'])
def api_easyinvoice_cache_polling():
    payload = request.get_json(silent=True) or {}
    enabled = _easyinvoice_cache_parse_bool(payload.get('enabled'), True)
    _easyinvoice_cache_save_settings({'polling_enabled': enabled})

    if enabled:
        ensure_easyinvoice_cache_worker_started()
        threading.Thread(
            target=sync_easyinvoice_cache_once,
            args=('resume',),
            name='easyinvoice-cache-resume-sync',
            daemon=True,
        ).start()

    state, logs = _easyinvoice_cache_fetch_state_and_logs()
    settings = _easyinvoice_cache_settings()
    state = _easyinvoice_cache_attach_settings(state, settings)
    return jsonify({
        'ok': True,
        'polling_enabled': enabled,
        'queued': bool(enabled),
        'sync': state,
        'logs': logs,
        'poll_interval_seconds': settings['sync_interval_seconds'],
    })
