import base64
import datetime
import hashlib
import json
import os
import random
import string
import urllib.error
import urllib.request
from decimal import Decimal
import xml.etree.ElementTree as ET
from xml.sax.saxutils import escape

from flask import jsonify, request, send_from_directory

from . import easyinvoice_client
from .state import app, db
from .models import ChungTu, DonHang, HangSuaBo, HeThongCauHinh, Item, KhachHang, NhanVien, ThuChi, ThuNgan
from .setup import *
from .utils import *

EASYINVOICE_DEFAULTS = {
    'api_url': 'https://api.easyinvoice.vn',
    'username': 'API',
    'password': 'dTFVLQq8nzBF',
    'tax_code': '5800884170',
    'pattern': '2C26MYY',
    'serial': '',
    'book_code': '',
}


def don_json(d):
    return {'id': d.id, 'ma_don': d.ma_don, 'loai_don': getattr(d, 'loai_don', 'Mua') or 'Mua',
            'khach_hang': d.khach_hang, 'cccd': getattr(d, 'cccd', '') or '', 'so_dien_thoai': d.so_dien_thoai,
            'dia_chi_kh': getattr(d, 'dia_chi_kh', '') or '', 'dia_chi': d.dia_chi, 'ngay_dat': d.ngay_dat,
            'ngay_giao': d.ngay_giao, 'items': d.items or [], 'tong_tien': d.tong_tien,
            'dat_coc': d.dat_coc, 'trang_thai': d.trang_thai, 'ghi_chu': d.ghi_chu,
            'chung_tu': getattr(d, 'chung_tu', []) or [], 'nguoi_tao': d.nguoi_tao, 'ngay_tao': d.ngay_tao}


def khach_hang_json(obj):
    return {
        'id': obj.id,
        'ten': obj.ten or '',
        'cccd': obj.cccd or '',
        'cmnd_cu': obj.cmnd_cu or '',
        'ngay_sinh': obj.ngay_sinh or '',
        'gioi_tinh': obj.gioi_tinh or '',
        'quoc_tich': obj.quoc_tich or '',
        'que_quan': obj.que_quan or '',
        'noi_thuong_tru': obj.noi_thuong_tru or '',
        'dia_chi': obj.dia_chi or '',
        'so_dien_thoai': obj.so_dien_thoai or '',
        'ngay_cap_cccd': obj.ngay_cap_cccd or '',
        'han_the': obj.han_the or '',
        'sao': obj.sao or 0,
        'ocr_mat_sau': obj.ocr_mat_sau or '',
        'anh_mat_truoc': obj.anh_mat_truoc or '',
        'anh_mat_sau': obj.anh_mat_sau or '',
        'nguoi_tao': obj.nguoi_tao or '',
        'ngay_tao': obj.ngay_tao or '',
        'cap_nhat_luc': obj.cap_nhat_luc or '',
    }


def _match_customer_value(value):
    return _clean_text(value).casefold()


def _parse_overwrite_flag(value):
    if isinstance(value, bool):
        return value
    return str(value or '').strip().lower() in {'1', 'true', 'yes', 'y', 'on'}


def _parse_customer_rating(value):
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return 0
    return max(0, min(5, parsed))


def _find_customer_duplicates(raw_id, ten, cccd, so_dien_thoai):
    target_id = None
    if raw_id not in (None, ''):
        try:
            target_id = int(raw_id)
        except (TypeError, ValueError):
            target_id = None

    expected_name = _match_customer_value(ten)
    expected_cccd = _match_customer_value(cccd)
    expected_phone = _match_customer_value(so_dien_thoai)
    matches = []

    for row in KhachHang.query.order_by(KhachHang.id.desc()).all():
        if target_id is not None and row.id == target_id:
            continue
        matched_fields = []
        if expected_name and _match_customer_value(row.ten) == expected_name:
            matched_fields.append('ten')
        if expected_cccd and _match_customer_value(row.cccd) == expected_cccd:
            matched_fields.append('cccd')
        if expected_phone and _match_customer_value(row.so_dien_thoai) == expected_phone:
            matched_fields.append('so_dien_thoai')
        if matched_fields:
            matches.append({
                'record': khach_hang_json(row),
                'matched_fields': matched_fields,
            })
    return matches


def _duplicate_match_priority(match):
    fields = set(match.get('matched_fields') or [])
    if 'cccd' in fields:
        return (0, -(match.get('record') or {}).get('id', 0))
    if 'so_dien_thoai' in fields:
        return (1, -(match.get('record') or {}).get('id', 0))
    return (2, -(match.get('record') or {}).get('id', 0))


@app.route('/api/khach_hang', methods=['GET'])
def get_khach_hang():
    rows = KhachHang.query.order_by(KhachHang.id.desc()).all()
    query = _ascii_fold(request.args.get('q'))
    if query:
        rows = [
            row for row in rows
            if query in _ascii_fold(row.ten)
            or query in _ascii_fold(row.cccd)
            or query in _ascii_fold(row.so_dien_thoai)
        ]
    return jsonify([khach_hang_json(row) for row in rows])


@app.route('/api/khach_hang', methods=['POST'])
def save_khach_hang():
    d = request.json or {}
    raw_id = d.get('id')
    ten = _clean_text(d.get('ten') or d.get('name'))
    cccd = _clean_text(d.get('cccd'))
    so_dien_thoai = _clean_text(d.get('so_dien_thoai') or d.get('phone'))
    overwrite = _parse_overwrite_flag(d.get('overwrite') or d.get('force'))

    if not ten and not cccd and not so_dien_thoai:
        return jsonify({'error': 'Cần nhập ít nhất tên, CCCD hoặc số điện thoại để lưu khách hàng.'}), 400

    duplicates = _find_customer_duplicates(raw_id, ten, cccd, so_dien_thoai)
    if duplicates and not overwrite:
        primary_duplicate = sorted(duplicates, key=_duplicate_match_priority)[0]
        return jsonify({
            'error': 'Đã có khách hàng trùng tên, CCCD hoặc số điện thoại.',
            'duplicate_exists': True,
            'duplicate_count': len(duplicates),
            'primary_duplicate': primary_duplicate,
            'duplicates': duplicates[:5],
        }), 409

    obj = None
    if raw_id not in (None, ''):
        try:
            obj = KhachHang.query.get(int(raw_id))
        except (TypeError, ValueError):
            obj = None
    if obj is None and duplicates:
        target_duplicate = sorted(duplicates, key=_duplicate_match_priority)[0]
        target_record = target_duplicate.get('record') or {}
        target_id = target_record.get('id')
        if target_id not in (None, ''):
            obj = KhachHang.query.get(target_id)

    created = obj is None
    timestamp = now_str()
    if created:
        obj = KhachHang(ngay_tao=timestamp)
        db.session.add(obj)

    obj.ten = ten
    obj.cccd = cccd
    obj.cmnd_cu = _clean_text(d.get('cmnd_cu') or d.get('old_id'))
    obj.ngay_sinh = _clean_text(d.get('ngay_sinh') or d.get('dob'))
    obj.gioi_tinh = _clean_text(d.get('gioi_tinh') or d.get('gender'))
    obj.quoc_tich = _clean_text(d.get('quoc_tich') or d.get('nationality'))
    obj.que_quan = _clean_text(d.get('que_quan') or d.get('origin'))
    obj.noi_thuong_tru = _clean_text(d.get('noi_thuong_tru') or d.get('residence'))
    obj.dia_chi = _clean_text(d.get('dia_chi') or d.get('address'))
    obj.so_dien_thoai = so_dien_thoai
    obj.ngay_cap_cccd = _clean_text(d.get('ngay_cap_cccd') or d.get('issue_date'))
    obj.han_the = _clean_text(d.get('han_the') or d.get('expiry'))
    obj.sao = _parse_customer_rating(d.get('sao'))
    obj.ocr_mat_sau = _clean_text(d.get('ocr_mat_sau') or d.get('back_text'))
    if any(key in d for key in ('anh_mat_truoc', 'front_image', 'frontImage')):
        obj.anh_mat_truoc = _clean_text(d.get('anh_mat_truoc') or d.get('front_image') or d.get('frontImage'))
    if any(key in d for key in ('anh_mat_sau', 'back_image', 'backImage')):
        obj.anh_mat_sau = _clean_text(d.get('anh_mat_sau') or d.get('back_image') or d.get('backImage'))
    obj.nguoi_tao = _clean_text(d.get('nguoi_tao')) or obj.nguoi_tao or 'POS Mobile'
    obj.cap_nhat_luc = timestamp

    db.session.commit()
    return jsonify({
        'msg': 'Created' if created else 'Updated',
        'record': khach_hang_json(obj),
    }), 201 if created else 200


@app.route('/api/khach_hang/<int:customer_id>', methods=['DELETE'])
def delete_khach_hang(customer_id):
    obj = KhachHang.query.get(customer_id)
    if obj is None:
        return jsonify({'error': 'Không tìm thấy khách hàng.'}), 404
    db.session.delete(obj)
    db.session.commit()
    return jsonify({'msg': 'Deleted', 'id': customer_id}), 200


def _easyinvoice_setting(config_data, env_key, *fallback_keys, default=''):
    env_value = _clean_text(os.getenv(env_key))
    if env_value:
        return env_value
    for key in fallback_keys:
        raw_value = ''
        if isinstance(config_data, dict):
            raw_value = _clean_text(config_data.get(key))
        if raw_value:
            return raw_value
    return default


def _easyinvoice_config():
    config_obj = HeThongCauHinh.query.filter_by(config_key='easyinvoice_settings').first()
    config_data = config_obj.data if config_obj and isinstance(config_obj.data, dict) else {}
    return {
        'api_url': _easyinvoice_setting(config_data, 'EASYINVOICE_API_URL', 'api_url', default=EASYINVOICE_DEFAULTS['api_url']),
        'username': _easyinvoice_setting(config_data, 'EASYINVOICE_USERNAME', 'username', default=EASYINVOICE_DEFAULTS['username']),
        'password': _easyinvoice_setting(config_data, 'EASYINVOICE_PASSWORD', 'password', default=EASYINVOICE_DEFAULTS['password']),
        'tax_code': _easyinvoice_setting(config_data, 'EASYINVOICE_TAX_CODE', 'tax_code', 'mst', default=EASYINVOICE_DEFAULTS['tax_code']),
        'pattern': _easyinvoice_setting(config_data, 'EASYINVOICE_PATTERN', 'pattern', default=EASYINVOICE_DEFAULTS['pattern']),
        'serial': _easyinvoice_setting(config_data, 'EASYINVOICE_SERIAL', 'serial', default=EASYINVOICE_DEFAULTS['serial']),
        'book_code': _easyinvoice_setting(config_data, 'EASYINVOICE_BOOK_CODE', 'book_code', default=EASYINVOICE_DEFAULTS['book_code']),
    }


BUY_VOUCHER_SERIAL_CONFIG_KEY = 'buy_voucher_serial_counter'


def _get_or_create_system_config(config_key, default_data=None, ghi_chu=''):
    obj = HeThongCauHinh.query.filter_by(config_key=config_key).first()
    if obj:
        if obj.data is None:
            obj.data = default_data or {}
        if ghi_chu and not obj.ghi_chu:
            obj.ghi_chu = ghi_chu
        return obj
    now = now_str()
    obj = HeThongCauHinh(
        config_key=config_key,
        data=default_data or {},
        ghi_chu=ghi_chu,
        ngay_tao=now,
        cap_nhat_luc=now,
    )
    db.session.add(obj)
    db.session.flush()
    return obj


def _positive_counter(value, default=1):
    try:
        parsed = int(value)
    except Exception:
        parsed = default
    return parsed if parsed > 0 else default


def _claim_buy_voucher_serial():
    obj = _get_or_create_system_config(
        BUY_VOUCHER_SERIAL_CONFIG_KEY,
        default_data={'next_serial': 1},
        ghi_chu='Bộ đếm số phiếu kê mua hàng in từ POS Mobile.',
    )
    data = dict(obj.data or {})
    serial_no = _positive_counter(data.get('next_serial'), 1)
    data['next_serial'] = serial_no + 1
    obj.data = data
    obj.cap_nhat_luc = now_str()
    db.session.commit()
    return serial_no


def _easyinvoice_nonce(length=16):
    alphabet = string.ascii_letters + string.digits
    return ''.join(random.choice(alphabet) for _ in range(length))


def _easyinvoice_auth_value(http_method, username, password, tax_code):
    timestamp = str(int(datetime.datetime.utcnow().timestamp() * 1000))
    nonce = _easyinvoice_nonce()
    signature_src = f'{http_method.upper()}{timestamp}{nonce}'
    signature = base64.b64encode(hashlib.md5(signature_src.encode('utf-8')).digest()).decode('utf-8')
    return f'{signature}:{nonce}:{timestamp}:{username}:{password}:{tax_code}'


def _easyinvoice_numeric_text(value, max_decimals=0):
    try:
        decimal_value = Decimal(str(value if value not in (None, '') else 0))
    except Exception:
        decimal_value = Decimal('0')
    return _format_decimal(decimal_value, max_decimals=max_decimals)


def _easyinvoice_safe_vat_rate(value):
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return 0
    return parsed if parsed in {0, 5, 8, 10} else 0


def _easyinvoice_find_value(node, candidate_keys):
    if isinstance(node, dict):
        for key, value in node.items():
            if str(key).lower() in candidate_keys and value not in (None, '', [], {}):
                return value
        for value in node.values():
            found = _easyinvoice_find_value(value, candidate_keys)
            if found not in (None, '', [], {}):
                return found
    elif isinstance(node, list):
        for item in node:
            found = _easyinvoice_find_value(item, candidate_keys)
            if found not in (None, '', [], {}):
                return found
    return None


def _easyinvoice_error_message(payload):
    if not isinstance(payload, (dict, list)):
        return _clean_text(payload)
    message = _easyinvoice_find_value(payload, {
        'error', 'errors', 'errormessage', 'message', 'msg', 'description',
        'detail', 'reason', 'devmessage',
    })
    if isinstance(message, list):
        return '; '.join(_clean_text(item) for item in message if _clean_text(item))
    return _clean_text(message)


def _easyinvoice_extract_links(payload):
    return {
        'link_view': _clean_text(_easyinvoice_find_value(payload, {
            'linkview', 'viewlink', 'invoiceviewurl', 'lookupurl', 'tracuulink',
            'invoiceurl', 'linktrauu', 'link_tra_cuu',
        })),
        'lookup_code': _clean_text(_easyinvoice_find_value(payload, {
            'lookupcode', 'searchcode', 'sobaomat', 'securecode', 'codeverify',
        })),
        'invoice_no': _clean_text(_easyinvoice_find_value(payload, {
            'invoiceno', 'invoicenumber', 'invoicecode', 'sohoadon', 'so_hd',
        })),
        'ikey': _clean_text(_easyinvoice_find_value(payload, {
            'ikey', 'invoicekey', 'transactionkey',
        })),
    }


def _easyinvoice_invoice_xml(invoice_data):
    customer = invoice_data.get('customer') if isinstance(invoice_data, dict) else {}
    customer = customer if isinstance(customer, dict) else {}
    invoice = invoice_data.get('invoice') if isinstance(invoice_data, dict) else {}
    invoice = invoice if isinstance(invoice, dict) else {}
    items = invoice.get('items') if isinstance(invoice.get('items'), list) else []

    if not items:
        raise ValueError('Chua co dong hang hoa de gui EasyInvoice.')
    def add_text(parent, tag, value):
        child = ET.SubElement(parent, tag)
        child.text = '' if value is None else str(value)
        return child

    def add_optional_text(parent, tag, value):
        if value in (None, ''):
            return None
        return add_text(parent, tag, value)

    def normalize_ikey(value):
        raw = _clean_text(value) or datetime.datetime.now().strftime('EI-%Y%m%d%H%M%S')
        cleaned = ''.join(ch if ch.isalnum() or ch in {'-', '_', '.'} else '-' for ch in raw)
        cleaned = cleaned.strip('-') or datetime.datetime.now().strftime('EI-%Y%m%d%H%M%S')
        return cleaned[:80]

    normalized_items = []
    gross_values = {0: 0, 5: 0, 8: 0, 10: 0}
    vat_amounts = {0: 0, 5: 0, 8: 0, 10: 0}
    amounts = {0: 0, 5: 0, 8: 0, 10: 0}
    discount_total = 0

    for index, item in enumerate(items, start=1):
        row = item if isinstance(item, dict) else {}
        row_total = max(0, int(round(float(row.get('total') or row.get('amount') or 0))))
        row_discount = max(0, int(round(float(row.get('discountAmount') or 0))))
        row_amount = max(0, int(round(float(row.get('amount') or row_total))))
        row_vat_amount = max(0, int(round(float(row.get('vatAmount') or 0))))
        row_rate = _easyinvoice_safe_vat_rate(row.get('vatRate'))
        gross_values[row_rate] += row_total
        vat_amounts[row_rate] += row_vat_amount
        amounts[row_rate] += row_amount
        discount_total += row_discount
        normalized_items.append({
            'code': _clean_text(row.get('code') or f'ITEM-{index}'),
            'no': index,
            'feature': int(row.get('feature') or 1),
            'name': _clean_text(row.get('name') or f'San pham {index}'),
            'unit': _clean_text(row.get('unit') or 'lan'),
            'quantity': _easyinvoice_numeric_text(row.get('quantity'), max_decimals=4),
            'price': _easyinvoice_numeric_text(row.get('price'), max_decimals=0),
            'discount_amount': _easyinvoice_numeric_text(row_discount, max_decimals=0),
            'total': _easyinvoice_numeric_text(row_total, max_decimals=0),
            'vat_rate': row_rate,
            'vat_amount': _easyinvoice_numeric_text(row_vat_amount, max_decimals=0),
            'amount': _easyinvoice_numeric_text(row_amount, max_decimals=0),
            'extra': json.dumps(row.get('extra'), ensure_ascii=False) if isinstance(row.get('extra'), dict) else _clean_text(row.get('extra')),
        })

    total_before_tax = sum(gross_values.values())
    vat_total = sum(vat_amounts.values())
    amount_total = sum(amounts.values())
    invoice_extra = invoice.get('extra') if isinstance(invoice.get('extra'), dict) else {}
    order_key = invoice_data.get('ikey') or invoice.get('ikey') or invoice_data.get('orderId') or invoice_extra.get('orderId')
    invoice_vat_rate = _easyinvoice_safe_vat_rate(invoice.get('vatRate'))

    root = ET.Element('Invoices')
    inv = ET.SubElement(root, 'Inv')
    invoice_node = ET.SubElement(inv, 'Invoice')
    add_text(invoice_node, 'Ikey', normalize_ikey(order_key))
    add_text(invoice_node, 'CusCode', _clean_text(customer.get('code')))
    add_text(invoice_node, 'Buyer', _clean_text(customer.get('buyer') or customer.get('name') or 'Khach le'))
    add_text(invoice_node, 'CusName', _clean_text(customer.get('name') or customer.get('buyer') or 'Khach le'))
    add_optional_text(invoice_node, 'CusEmails', _clean_text(customer.get('emails')))
    add_optional_text(invoice_node, 'Email', _clean_text(customer.get('email')))
    add_optional_text(invoice_node, 'EmailCC', _clean_text(customer.get('emailCc')))
    add_text(invoice_node, 'CusAddress', _clean_text(customer.get('address')))
    add_optional_text(invoice_node, 'CusIdentification', _clean_text(customer.get('identification') or customer.get('cccd')))
    add_optional_text(invoice_node, 'CusBankName', _clean_text(customer.get('bankName')))
    add_optional_text(invoice_node, 'CusBankNo', _clean_text(customer.get('bankNo')))
    add_text(invoice_node, 'CusPhone', _clean_text(customer.get('phone')))
    add_optional_text(invoice_node, 'CusTaxCode', _clean_text(customer.get('taxCode')))
    add_text(invoice_node, 'PaymentMethod', _clean_text(invoice.get('paymentMethod') or 'Tien mat'))
    add_text(invoice_node, 'ArisingDate', _clean_text(invoice.get('arisingDate') or datetime.datetime.now().strftime('%d/%m/%Y')))
    add_text(invoice_node, 'ExchangeRate', _clean_text(invoice.get('exchangeRate') or '1'))
    add_text(invoice_node, 'CurrencyUnit', _clean_text(invoice.get('currencyUnit') or 'VND'))
    add_optional_text(invoice_node, 'Extra', json.dumps(invoice_extra, ensure_ascii=False) if invoice_extra else '')

    products = ET.SubElement(invoice_node, 'Products')
    for row in normalized_items:
        product = ET.SubElement(products, 'Product')
        add_text(product, 'Code', row['code'])
        add_text(product, 'No', row['no'])
        add_text(product, 'Feature', row['feature'])
        add_text(product, 'ProdName', row['name'])
        add_text(product, 'ProdUnit', row['unit'])
        add_text(product, 'ProdQuantity', row['quantity'])
        add_text(product, 'ProdPrice', row['price'])
        add_text(product, 'Discount', 0)
        add_text(product, 'DiscountAmount', row['discount_amount'])
        add_text(product, 'Total', row['total'])
        add_text(product, 'VATRate', row['vat_rate'])
        add_text(product, 'VATRateOther', 0)
        add_text(product, 'VATAmount', row['vat_amount'])
        add_text(product, 'Amount', row['amount'])
        add_text(product, 'Extra', row['extra'])

    add_text(invoice_node, 'Total', _easyinvoice_numeric_text(total_before_tax, max_decimals=0))
    add_text(invoice_node, 'VATRate', invoice_vat_rate)
    add_text(invoice_node, 'VATRateOther', 0)
    add_text(invoice_node, 'VATAmount', _easyinvoice_numeric_text(vat_total, max_decimals=0))
    add_text(invoice_node, 'Amount', _easyinvoice_numeric_text(amount_total, max_decimals=0))
    add_text(invoice_node, 'DiscountAmount', _easyinvoice_numeric_text(discount_total, max_decimals=0))
    add_text(invoice_node, 'GrossValue', 0)
    add_text(invoice_node, 'GrossValue0', _easyinvoice_numeric_text(gross_values[0], max_decimals=0))
    add_text(invoice_node, 'GrossValue5', _easyinvoice_numeric_text(gross_values[5], max_decimals=0))
    add_text(invoice_node, 'GrossValue10', _easyinvoice_numeric_text(gross_values[10], max_decimals=0))
    add_text(invoice_node, 'GrossValueNDeclared', 0)
    add_text(invoice_node, 'GrossValueContractor', 0)
    add_text(invoice_node, 'VatAmount0', _easyinvoice_numeric_text(vat_amounts[0], max_decimals=0))
    add_text(invoice_node, 'VatAmount5', _easyinvoice_numeric_text(vat_amounts[5], max_decimals=0))
    add_text(invoice_node, 'VatAmount10', _easyinvoice_numeric_text(vat_amounts[10], max_decimals=0))
    add_text(invoice_node, 'VatAmountNDeclared', 0)
    add_text(invoice_node, 'VatAmountContractor', 0)
    add_text(invoice_node, 'Amount0', _easyinvoice_numeric_text(amounts[0], max_decimals=0))
    add_text(invoice_node, 'Amount5', _easyinvoice_numeric_text(amounts[5], max_decimals=0))
    add_text(invoice_node, 'Amount10', _easyinvoice_numeric_text(amounts[10], max_decimals=0))
    add_text(invoice_node, 'AmountNDeclared', 0)
    add_text(invoice_node, 'AmountOther', 0)
    add_text(invoice_node, 'GrossValue8', _easyinvoice_numeric_text(gross_values[8], max_decimals=0))
    add_text(invoice_node, 'VatAmount8', _easyinvoice_numeric_text(vat_amounts[8], max_decimals=0))
    add_text(invoice_node, 'Amount8', _easyinvoice_numeric_text(amounts[8], max_decimals=0))
    add_text(invoice_node, 'GrossCTTC', 0)
    add_text(invoice_node, 'VatAmountCTTC', 0)
    add_text(invoice_node, 'AmountCTTC', 0)
    add_text(invoice_node, 'AmountInWords', _clean_text(invoice.get('amountInWords')) or f'{amount_total} dong')

    if hasattr(ET, 'indent'):
        ET.indent(root, space='  ')
    return ET.tostring(root, encoding='unicode')


def _easyinvoice_status_text(status_value):
    mapping = {
        -1: 'Reserved strip / waiting sign',
        0: 'Unsigned',
        1: 'Signed',
        2: 'Declared to tax authority',
        3: 'Replaced',
        4: 'Adjusted',
    }
    try:
        return mapping.get(int(status_value), _clean_text(status_value))
    except (TypeError, ValueError):
        return _clean_text(status_value)


def _submit_easyinvoice(issue_now=False):
    d = request.json or {}
    invoice_data = d.get('invoice_data') if isinstance(d.get('invoice_data'), dict) else {}
    order_id = _clean_text(d.get('order_id') or invoice_data.get('orderId'))

    if not invoice_data:
        return jsonify({'error': 'Thieu invoice_data de gui EasyInvoice.'}), 400

    invoice = invoice_data.get('invoice') if isinstance(invoice_data.get('invoice'), dict) else {}
    invoice_amount = int(invoice.get('amount') or 0)
    if invoice_amount <= 0:
        return jsonify({'error': 'Chi xuat hoa don do cho giao dich khach tra.'}), 400

    config = _easyinvoice_config()
    missing = [key for key in ('username', 'password', 'tax_code', 'pattern') if not config.get(key)]
    if missing:
        return jsonify({'error': f"Thieu cau hinh EasyInvoice: {', '.join(missing)}"}), 400

    try:
        xml_data = _easyinvoice_invoice_xml(invoice_data)
    except ValueError as exc:
        return jsonify({'error': str(exc)}), 400
    try:
        result = easyinvoice_client.issue_invoice(config, xml_data, timeout=60) if issue_now else easyinvoice_client.import_invoice(config, xml_data, timeout=60)
    except easyinvoice_client.EasyInvoiceApiError as exc:
        return jsonify({'error': exc.message, 'detail': exc.payload}), exc.status_code

    extracted = easyinvoice_client.extract_links(result)
    lookup_payload = {}
    lookup_invoice = {}
    state_payload = {}
    if extracted.get('ikey'):
        try:
            lookup_payload = easyinvoice_client.get_invoices_by_ikeys(config, [extracted['ikey']], timeout=60)
            lookup_invoice = easyinvoice_client.first_invoice_from_lookup(lookup_payload)
        except easyinvoice_client.EasyInvoiceApiError:
            lookup_payload = {}
            lookup_invoice = {}
        try:
            state_payload = easyinvoice_client.check_invoice_state(config, [extracted['ikey']], timeout=60)
        except easyinvoice_client.EasyInvoiceApiError:
            state_payload = {}
    if lookup_invoice:
        lookup_links = easyinvoice_client.extract_links(lookup_invoice)
        extracted = {
            'link_view': lookup_links.get('link_view') or extracted.get('link_view', ''),
            'lookup_code': lookup_links.get('lookup_code') or extracted.get('lookup_code', ''),
            'invoice_no': lookup_links.get('invoice_no') or extracted.get('invoice_no', ''),
            'ikey': lookup_links.get('ikey') or extracted.get('ikey', ''),
        }
    invoice_status = lookup_invoice.get('InvoiceStatus') if isinstance(lookup_invoice, dict) else None
    record_code = f"EI-{order_id or datetime.datetime.now().strftime('%y%m%d%H%M%S')}"
    doc = ChungTu.query.filter_by(ma_ct=record_code).first()
    created = doc is None
    if created:
        doc = ChungTu(ma_ct=record_code, ngay_tao=now_str())
        db.session.add(doc)

    customer = invoice_data.get('customer') if isinstance(invoice_data.get('customer'), dict) else {}
    doc.loai_ct = 'Hoa don do EasyInvoice'
    doc.ngay_lap = datetime.date.today().strftime('%d/%m/%Y')
    doc.ngay_hach_toan = doc.ngay_lap
    doc.doi_tuong = _clean_text(customer.get('name') or customer.get('buyer')) or 'Khach le'
    doc.mo_ta = f'EasyInvoice {order_id or record_code}'
    doc.so_tien = invoice_amount
    doc.thue_suat = float(_easyinvoice_safe_vat_rate(invoice.get('vatRate')))
    doc.trang_thai = f"Da phat hanh {_easyinvoice_status_text(invoice_status) or 'EasyInvoice'}" if issue_now else 'Da tao unsigned'
    doc.nguoi_lap = 'POS Mobile'
    doc.file_dinh_kem = [{
        'source': 'easyinvoice',
        'order_id': order_id,
        'link_view': extracted['link_view'],
        'lookup_code': extracted['lookup_code'],
        'invoice_no': extracted['invoice_no'],
        'ikey': extracted['ikey'],
        'request': {
            'pattern': config['pattern'],
            'serial': config.get('serial', ''),
            'book_code': config.get('book_code', ''),
        },
        'response': result,
        'lookup': lookup_payload,
        'invoice': lookup_invoice,
        'state': state_payload,
        'issued_at': now_str(),
    }]
    db.session.commit()

    return jsonify({
        'msg': 'Da phat hanh EasyInvoice thanh cong.' if issue_now else 'Da tao EasyInvoice thanh cong.',
        'issued': issue_now,
        'created': created,
        'record': {
            'id': doc.id,
            'ma_ct': doc.ma_ct,
            'so_tien': doc.so_tien,
            'trang_thai': doc.trang_thai,
        },
        'link_view': extracted['link_view'],
        'lookup_code': extracted['lookup_code'],
        'invoice_no': extracted['invoice_no'],
        'ikey': extracted['ikey'],
        'pattern': config['pattern'],
        'serial': config.get('serial', ''),
        'buyer': _clean_text(lookup_invoice.get('Buyer') or lookup_invoice.get('CustomerName') or customer.get('name') or customer.get('buyer')),
        'amount': lookup_invoice.get('Amount') or invoice_amount,
        'invoice_status': invoice_status,
        'status_text': _easyinvoice_status_text(invoice_status),
        'invoice': lookup_invoice,
        'state': state_payload,
        'raw': result,
    })


@app.route('/api/easyinvoice/export', methods=['POST'])
def export_easyinvoice():
    return _submit_easyinvoice(issue_now=False)


@app.route('/api/easyinvoice/issue', methods=['POST'])
def issue_easyinvoice():
    return _submit_easyinvoice(issue_now=True)


@app.route('/api/payment-voucher/buy-serial', methods=['POST'])
def claim_buy_voucher_serial():
    serial_no = _claim_buy_voucher_serial()
    return jsonify({
        'serial_no': serial_no,
        'next_serial': serial_no + 1,
        'issued_at': now_str(),
    })


def _unique_hang_sua_bo_code(base_code):
    code = _clean_text(base_code) or f"SB{datetime.datetime.now().strftime('%y%m%d%H%M%S')}"
    next_code = code
    idx = 2
    while HangSuaBo.query.filter_by(ma_phieu=next_code).first():
        next_code = f'{code}-{idx}'
        idx += 1
    return next_code


def _sum_weight_key(items, key):
    total = Decimal('0')
    for item in items or []:
        total += _decimal_or_none((item or {}).get(key)) or Decimal('0')
    return _format_decimal(total, max_decimals=4)


def _append_item_history(item, action, by='POS Mobile'):
    history = list(item.history or [])
    history.append({
        'date': now_str(),
        'action': action,
        'by': by or 'POS Mobile',
    })
    item.history = history
    flag_modified(item, 'history')


def _normalize_hang_sua_bo_item(raw_item, loai_xu_ly, line_no):
    payload = raw_item if isinstance(raw_item, dict) else {}
    item_id = _parse_int_id(payload.get('item_id'))
    inventory_item = Item.query.get(item_id) if item_id is not None else None

    if item_id is not None and inventory_item is None:
        return None, None, (f'Sản phẩm dòng {line_no} không tồn tại trong kho.', 404)

    ma_hang = _clean_text(payload.get('ma_hang') or (inventory_item.ma_hang if inventory_item else ''))
    if not ma_hang:
        return None, None, (f'Dòng {line_no} thiếu mã hàng.', 400)

    ten_hang = _clean_text(payload.get('ten_hang') or payload.get('ncc') or (inventory_item.ncc if inventory_item else ''))
    nhom_hang = _clean_text(payload.get('nhom_hang') or (inventory_item.nhom_hang if inventory_item else ''))
    quay_nho = _clean_text(payload.get('quay_nho') or (inventory_item.quay_nho if inventory_item else ''))
    tuoi_vang = _clean_text(payload.get('tuoi_vang') or (inventory_item.tuoi_vang if inventory_item else ''))
    status = _clean_text(payload.get('status') or (inventory_item.status if inventory_item else ''))
    tl_vang_hien_tai = _normalize_weight_text(payload.get('tl_vang_hien_tai') or payload.get('tl_vang') or (inventory_item.tl_vang if inventory_item else ''))
    ghi_chu = _clean_text(payload.get('ghi_chu'))

    them_tl_vang = ''
    bot_tl_vang = ''
    tl_vang_sau_xu_ly = tl_vang_hien_tai

    if loai_xu_ly == 'sua':
        them_tl_vang = _normalize_weight_text(payload.get('them_tl_vang'))
        bot_tl_vang = _normalize_weight_text(payload.get('bot_tl_vang'))
        them_decimal = _decimal_or_none(them_tl_vang) or Decimal('0')
        bot_decimal = _decimal_or_none(bot_tl_vang) or Decimal('0')
        if them_decimal <= 0 and bot_decimal <= 0:
            return None, None, (f'Dòng {line_no} cần nhập thêm hoặc bớt trọng lượng vàng.', 400)
        tl_hien_tai_decimal = _decimal_or_none(tl_vang_hien_tai) or Decimal('0')
        if tl_hien_tai_decimal + them_decimal - bot_decimal < 0:
            return None, None, (f'DÃ²ng {line_no} cÃ³ trá»ng lÆ°á»£ng vÃ ng sau xá»­ lÃ½ Ã¢m.', 400)
        tl_vang_sau_xu_ly = _format_decimal(tl_hien_tai_decimal + them_decimal - bot_decimal, max_decimals=4)

    normalized = {
        'item_id': inventory_item.id if inventory_item else item_id,
        'ma_hang': ma_hang,
        'ten_hang': ten_hang,
        'nhom_hang': nhom_hang,
        'quay_nho': quay_nho,
        'tuoi_vang': tuoi_vang,
        'status': status,
        'tl_vang_hien_tai': tl_vang_hien_tai,
        'them_tl_vang': them_tl_vang,
        'bot_tl_vang': bot_tl_vang,
        'tl_vang_sau_xu_ly': tl_vang_sau_xu_ly,
        'ghi_chu': ghi_chu,
    }
    return normalized, inventory_item, None


def hang_sua_bo_json(obj):
    items = obj.items or []
    return {
        'id': obj.id,
        'ma_phieu': obj.ma_phieu or '',
        'loai_xu_ly': obj.loai_xu_ly or 'sua',
        'tong_dong': obj.tong_dong or len(items),
        'tong_them_tl': obj.tong_them_tl or _sum_weight_key(items, 'them_tl_vang'),
        'tong_bot_tl': obj.tong_bot_tl or _sum_weight_key(items, 'bot_tl_vang'),
        'ghi_chu': obj.ghi_chu or '',
        'nguoi_tao': obj.nguoi_tao or '',
        'trang_thai': obj.trang_thai or 'Mới',
        'ngay_tao': obj.ngay_tao or '',
        'cap_nhat_luc': obj.cap_nhat_luc or '',
        'items': items,
    }


def _match_hang_sua_bo_date(obj, date_text):
    text = _clean_text(date_text)
    if not text:
        return True
    parsed = _parse_local_datetime(obj.ngay_tao or obj.cap_nhat_luc)
    if parsed is None:
        return False
    if re.fullmatch(r'\d{4}-\d{2}-\d{2}', text):
        return parsed.strftime('%Y-%m-%d') == text
    return parsed.strftime('%d/%m/%Y') == text


@app.route('/api/hang_sua_bo', methods=['GET'])
def get_hang_sua_bo():
    rows = HangSuaBo.query.order_by(HangSuaBo.id.desc()).all()
    date = _clean_text(request.args.get('date'))
    today = _clean_text(request.args.get('today')).lower()
    if today in ('1', 'true', 'yes'):
        date = datetime.date.today().strftime('%Y-%m-%d')
    if date:
        rows = [row for row in rows if _match_hang_sua_bo_date(row, date)]
    return jsonify([hang_sua_bo_json(row) for row in rows])


@app.route('/api/hang_sua_bo', methods=['POST'])
def add_hang_sua_bo():
    d = request.json or {}
    loai_xu_ly = _clean_text(d.get('loai_xu_ly') or 'sua').lower()
    if loai_xu_ly not in {'sua', 'bo'}:
        return jsonify({'error': 'Loại xử lý không hợp lệ.'}), 400

    raw_items = d.get('items') or []
    if not isinstance(raw_items, list) or not raw_items:
        return jsonify({'error': 'Cần chọn ít nhất 1 sản phẩm trong kho.'}), 400

    ma_phieu = _unique_hang_sua_bo_code(d.get('ma_phieu') or f"SB{datetime.datetime.now().strftime('%y%m%d%H%M%S')}")
    nguoi_tao = _clean_text(d.get('nguoi_tao')) or 'POS Mobile'
    next_status = 'Đang sửa' if loai_xu_ly == 'sua' else 'Đã bỏ'
    blocked_statuses = {
        _clean_text('Đã bán').lower(),
        _clean_text('Đang sửa').lower(),
        _clean_text('Đã bỏ').lower(),
    }

    normalized_items = []
    item_updates = []
    seen_item_ids = set()
    for line_no, raw_item in enumerate(raw_items, start=1):
        normalized, inventory_item, error = _normalize_hang_sua_bo_item(raw_item, loai_xu_ly, line_no)
        if error:
            return jsonify({'error': error[0]}), error[1]
        if inventory_item is None:
            return jsonify({'error': f'Dòng {line_no} cần chọn sản phẩm từ kho hàng.'}), 400
        if inventory_item.id in seen_item_ids:
            return jsonify({'error': f'Sản phẩm {normalized["ma_hang"]} đang bị lặp trong phiếu.'}), 400
        seen_item_ids.add(inventory_item.id)
        if _clean_text(inventory_item.status).lower() in blocked_statuses:
            return jsonify({'error': f'Sản phẩm {normalized["ma_hang"]} đang ở trạng thái {inventory_item.status}, không thể tạo phiếu mới.'}), 400
        normalized['status'] = next_status
        normalized_items.append(normalized)
        item_updates.append((normalized, inventory_item))

    now_value = now_str()
    obj = HangSuaBo(
        ma_phieu=ma_phieu,
        loai_xu_ly=loai_xu_ly,
        items=normalized_items,
        tong_dong=len(normalized_items),
        tong_them_tl=_sum_weight_key(normalized_items, 'them_tl_vang'),
        tong_bot_tl=_sum_weight_key(normalized_items, 'bot_tl_vang'),
        ghi_chu=_clean_text(d.get('ghi_chu')),
        nguoi_tao=nguoi_tao,
        trang_thai=_clean_text(d.get('trang_thai')) or 'Mới',
        ngay_tao=now_value,
        cap_nhat_luc=now_value,
    )
    db.session.add(obj)

    for normalized, inventory_item in item_updates:
        inventory_item.status = next_status
        if loai_xu_ly == 'sua':
            delta_parts = []
            if normalized.get('them_tl_vang'):
                delta_parts.append(f"+{normalized['them_tl_vang']}")
            if normalized.get('bot_tl_vang'):
                delta_parts.append(f"-{normalized['bot_tl_vang']}")
            delta_text = ' / '.join(delta_parts) if delta_parts else 'không điều chỉnh'
            action = (
                f"Phiếu sửa {ma_phieu}: {delta_text} vàng"
                f" -> dự kiến {normalized.get('tl_vang_sau_xu_ly') or normalized.get('tl_vang_hien_tai') or '0'}"
            )
        else:
            action = f"Phiếu bỏ hàng {ma_phieu}"
        _append_item_history(inventory_item, action, by=nguoi_tao)

    db.session.commit()
    return jsonify({'msg': 'Created', 'id': obj.id, 'ma_phieu': obj.ma_phieu, 'record': hang_sua_bo_json(obj)}), 201


@app.route('/api/don_hang', methods=['GET'])
def get_don_hang():
    rows = DonHang.query.order_by(DonHang.id.desc()).all()
    date = request.args.get('date', '').strip()
    today = request.args.get('today', '').strip()
    if today in ('1', 'true', 'yes'):
        date = datetime.datetime.now().strftime('%Y-%m-%d')
    if date:
        rows = [
            row for row in rows
            if str(getattr(row, 'ngay_dat', '') or '').strip().startswith(date)
        ]
    return jsonify([don_json(d) for d in rows])


@app.route('/api/don_hang', methods=['POST'])
def add_don_hang():
    d = request.json or {}
    ma = d.get('ma_don') or f"DH{datetime.datetime.now().strftime('%y%m%d%H%M%S')}"
    obj = DonHang.query.filter_by(ma_don=ma).first()
    created = obj is None
    if created:
        obj = DonHang(ma_don=ma, ngay_tao=now_str())
        db.session.add(obj)
    obj.khach_hang = d.get('khach_hang', '')
    obj.so_dien_thoai = d.get('so_dien_thoai', '')
    obj.dia_chi = d.get('dia_chi', '')
    obj.ngay_dat = d.get('ngay_dat', '')
    obj.ngay_giao = d.get('ngay_giao', '')
    obj.items = d.get('items', [])
    obj.tong_tien = int(d.get('tong_tien') or 0)
    obj.dat_coc = int(d.get('dat_coc') or 0)
    obj.trang_thai = d.get('trang_thai', 'Mới')
    obj.ghi_chu = d.get('ghi_chu', '')
    obj.nguoi_tao = d.get('nguoi_tao', '')
    db.session.commit()
    return jsonify({'msg': 'Created' if created else 'Updated', 'id': obj.id, 'ma_don': obj.ma_don}), 201 if created else 200


@app.route('/api/don_hang/<int:did>', methods=['GET','PUT','DELETE'])
def update_don_hang(did):
    obj = DonHang.query.get_or_404(did)
    if request.method == 'GET': return jsonify(don_json(obj))
    if request.method == 'DELETE':
        db.session.delete(obj); db.session.commit(); return jsonify({'msg':'Deleted'})
    d = request.json or {}
    for f in ['khach_hang','so_dien_thoai','dia_chi',
               'ngay_dat','ngay_giao','trang_thai','ghi_chu','nguoi_tao']:
        if f in d: setattr(obj, f, d[f])
    if 'items'    in d: obj.items    = d['items']
    if 'tong_tien' in d: obj.tong_tien = int(d['tong_tien'] or 0)
    if 'dat_coc'   in d: obj.dat_coc   = int(d['dat_coc'] or 0)
    db.session.commit(); return jsonify({'msg':'Updated'})


def nv_json(n):
    return {'id':n.id,'ma_nv':n.ma_nv,'ho_ten':n.ho_ten,'chuc_vu':n.chuc_vu,
            'phong_ban':n.phong_ban,'so_dien_thoai':n.so_dien_thoai,'email':n.email,
            'dia_chi':n.dia_chi,'ngay_vao':n.ngay_vao,'luong_co_ban':n.luong_co_ban,
            'trang_thai':n.trang_thai,'ghi_chu':n.ghi_chu,'ngay_tao':n.ngay_tao}


@app.route('/api/nhan_vien', methods=['GET'])
def get_nhan_vien():
    return jsonify([nv_json(n) for n in NhanVien.query.order_by(NhanVien.id.desc()).all()])


@app.route('/api/nhan_vien', methods=['POST'])
def add_nhan_vien():
    d = request.json or {}
    ma = d.get('ma_nv') or f"NV{datetime.datetime.now().strftime('%y%m%d%H%M%S')}"
    obj = NhanVien(ma_nv=ma, ho_ten=d.get('ho_ten',''), chuc_vu=d.get('chuc_vu',''),
                   phong_ban=d.get('phong_ban',''), so_dien_thoai=d.get('so_dien_thoai',''),
                   email=d.get('email',''), dia_chi=d.get('dia_chi',''),
                   ngay_vao=d.get('ngay_vao',''), luong_co_ban=int(d.get('luong_co_ban') or 0),
                   trang_thai=d.get('trang_thai','Đang làm'), ghi_chu=d.get('ghi_chu',''), ngay_tao=now_str())
    db.session.add(obj); db.session.commit()
    return jsonify({'msg':'Created','id':obj.id}), 201


@app.route('/api/nhan_vien/<int:nid>', methods=['GET','PUT','DELETE'])
def update_nhan_vien(nid):
    obj = NhanVien.query.get_or_404(nid)
    if request.method == 'GET': return jsonify(nv_json(obj))
    if request.method == 'DELETE':
        ThuNgan.query.filter_by(nhan_vien_id=obj.id).update({'nhan_vien_id': None}, synchronize_session=False)
        db.session.delete(obj); db.session.commit(); return jsonify({'msg':'Deleted'})
    d = request.json or {}
    for f in ['ho_ten','chuc_vu','phong_ban','so_dien_thoai','email','dia_chi','ngay_vao','trang_thai','ghi_chu']:
        if f in d: setattr(obj, f, d[f])
    if 'luong_co_ban' in d: obj.luong_co_ban = int(d['luong_co_ban'] or 0)
    db.session.commit(); return jsonify({'msg':'Updated'})


def tc_json(t):
    return {'id':t.id,'loai':t.loai,'danh_muc':t.danh_muc,'so_tien':t.so_tien,
            'ngay':t.ngay,'mo_ta':t.mo_ta,'doi_tuong':t.doi_tuong,
            'phuong_thuc':t.phuong_thuc,'ngay_tao':t.ngay_tao}


@app.route('/api/thu_chi', methods=['GET'])
def get_thu_chi():
    return jsonify([tc_json(t) for t in ThuChi.query.order_by(ThuChi.id.desc()).all()])


@app.route('/api/thu_chi', methods=['POST'])
def add_thu_chi():
    d = request.json or {}
    obj = ThuChi(loai=d.get('loai','Thu'), danh_muc=d.get('danh_muc',''),
                 so_tien=int(d.get('so_tien') or 0), ngay=d.get('ngay',''),
                 mo_ta=d.get('mo_ta',''), doi_tuong=d.get('doi_tuong',''),
                 phuong_thuc=d.get('phuong_thuc','Tiền mặt'), ngay_tao=now_str())
    db.session.add(obj); db.session.commit()
    return jsonify({'msg':'Created','id':obj.id}), 201


@app.route('/api/thu_chi/<int:tid>', methods=['PUT','DELETE'])
def update_thu_chi(tid):
    obj = ThuChi.query.get_or_404(tid)
    if request.method == 'DELETE':
        db.session.delete(obj); db.session.commit(); return jsonify({'msg':'Deleted'})
    d = request.json or {}
    for f in ['loai','danh_muc','ngay','mo_ta','doi_tuong','phuong_thuc']:
        if f in d: setattr(obj, f, d[f])
    if 'so_tien' in d: obj.so_tien = int(d['so_tien'] or 0)
    db.session.commit(); return jsonify({'msg':'Updated'})
