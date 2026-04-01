import uuid

from .models import HeThongCauHinh
from .state import db
from .setup import _parse_bigint
from .utils import _clean_text, now_str


COMPANY_BANK_ACCOUNTS_CONFIG_KEY = 'company_bank_accounts'
LEGACY_BANK_LEDGER_NAME = 'Tài Khoản Ngân Hàng'
BANK_LEDGER_PREFIX = 'bank_account:'


def build_company_bank_ledger_key(account_id):
    account_key = _clean_text(account_id)
    return f'{BANK_LEDGER_PREFIX}{account_key}' if account_key else ''


def parse_company_bank_ledger_key(value):
    text = _clean_text(value)
    if not text.startswith(BANK_LEDGER_PREFIX):
        return ''
    return text[len(BANK_LEDGER_PREFIX):]


def _get_or_create_company_bank_accounts_config():
    obj = HeThongCauHinh.query.filter_by(config_key=COMPANY_BANK_ACCOUNTS_CONFIG_KEY).first()
    if obj:
        if not isinstance(obj.data, dict):
            obj.data = {'accounts': []}
        elif not isinstance(obj.data.get('accounts'), list):
            obj.data = {**obj.data, 'accounts': []}
        return obj

    now = now_str()
    obj = HeThongCauHinh(
        config_key=COMPANY_BANK_ACCOUNTS_CONFIG_KEY,
        data={'accounts': []},
        ghi_chu='Danh sách tài khoản ngân hàng công ty dùng cho POS chuyển khoản.',
        ngay_tao=now,
        cap_nhat_luc=now,
    )
    db.session.add(obj)
    db.session.flush()
    return obj


def _company_bank_account_label(display_name='', bank_name='', account_no=''):
    if display_name:
        return display_name
    parts = [part for part in [bank_name, account_no] if part]
    return ' · '.join(parts) if parts else 'Tài khoản ngân hàng'


def normalize_company_bank_account(raw, existing_created_at=''):
    item = dict(raw or {})
    account_id = _clean_text(item.get('id')) or uuid.uuid4().hex
    bank_code = _clean_text(item.get('bank_code') or item.get('bankCode')).upper()
    bank_name = _clean_text(item.get('bank_name') or item.get('bankName'))
    account_no = _clean_text(item.get('account_no') or item.get('accountNo'))
    account_name = _clean_text(item.get('account_name') or item.get('accountName'))
    display_name = _clean_text(item.get('display_name') or item.get('displayName'))
    note = _clean_text(item.get('note') or item.get('ghi_chu'))
    max_incoming_amount = max(0, _parse_bigint(
        item.get('max_incoming_amount', item.get('maxIncomingAmount')),
        0,
    ))
    created_at = _clean_text(item.get('created_at') or item.get('ngay_tao')) or existing_created_at or now_str()
    updated_at = _clean_text(item.get('updated_at') or item.get('cap_nhat_luc')) or now_str()
    label = _company_bank_account_label(display_name, bank_name or bank_code, account_no)
    return {
        'id': account_id,
        'bank_code': bank_code,
        'bank_name': bank_name,
        'account_no': account_no,
        'account_name': account_name,
        'display_name': display_name,
        'label': label,
        'max_incoming_amount': max_incoming_amount,
        'ledger_key': build_company_bank_ledger_key(account_id),
        'note': note,
        'created_at': created_at,
        'updated_at': updated_at,
    }


def normalize_company_bank_accounts(items):
    normalized = []
    seen = set()
    for raw in list(items or []):
        existing_created_at = ''
        if isinstance(raw, dict):
            existing_created_at = _clean_text(raw.get('created_at') or raw.get('ngay_tao'))
        item = normalize_company_bank_account(raw, existing_created_at=existing_created_at)
        if not item.get('id') or item['id'] in seen:
            continue
        seen.add(item['id'])
        normalized.append(item)
    return normalized


def list_company_bank_accounts():
    obj = _get_or_create_company_bank_accounts_config()
    raw_accounts = []
    if isinstance(obj.data, dict):
        raw_accounts = obj.data.get('accounts') or []
    normalized = normalize_company_bank_accounts(raw_accounts)
    if raw_accounts != normalized:
        obj.data = {'accounts': normalized}
        obj.cap_nhat_luc = now_str()
    return obj, normalized


def save_company_bank_accounts(items):
    obj, _ = list_company_bank_accounts()
    normalized = normalize_company_bank_accounts(items)
    obj.data = {'accounts': normalized}
    obj.cap_nhat_luc = now_str()
    if not obj.ngay_tao:
        obj.ngay_tao = obj.cap_nhat_luc
    return obj, normalized


def find_company_bank_account(account_id='', ledger_key='', account_no=''):
    _, accounts = list_company_bank_accounts()
    target_id = _clean_text(account_id)
    target_ledger_key = _clean_text(ledger_key)
    target_account_no = _clean_text(account_no)

    if target_id:
        for account in accounts:
            if account.get('id') == target_id:
                return account

    if target_ledger_key:
        for account in accounts:
            if account.get('ledger_key') == target_ledger_key:
                return account

    if target_account_no:
        for account in accounts:
            if account.get('account_no') == target_account_no:
                return account

    return None
