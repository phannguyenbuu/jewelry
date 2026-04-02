import base64
import datetime
import hashlib
import json
import os
import random
import string
import urllib.error
import urllib.parse
import urllib.request
from decimal import Decimal
import xml.etree.ElementTree as ET
from xml.sax.saxutils import escape

from flask import has_request_context, jsonify, request, send_from_directory
try:
    from pgcompat import flag_modified
except ImportError:
    from sqlalchemy.orm.attributes import flag_modified

from .company_bank_accounts import (
    LEGACY_BANK_LEDGER_NAME,
    find_company_bank_account,
    list_company_bank_accounts,
)
from . import easyinvoice_client
from .state import app, db
from .models import ChungTu, DonHang, HangSuaBo, HeThongCauHinh, Item, KhachHang, NhanVien, ThuChi, ThuNgan
from .setup import *
from .utils import *

EASYINVOICE_DEFAULTS = {
    'api_url': 'https://api.easyinvoice.vn',
    'username': '',   # set qua EASYINVOICE_USERNAME (env var) hoac DB config
    'api_username': 'API',
    'password': '',   # set qua EASYINVOICE_PASSWORD (env var) hoac DB config
    'tax_code': '',   # set qua EASYINVOICE_TAX_CODE (env var) hoac DB config
    'pattern': '',    # set qua EASYINVOICE_PATTERN (env var) hoac DB config
    'serial': '',
    'book_code': '',
}

PUBLIC_ASSET_HOST = _clean_text(os.environ.get('PUBLIC_HOST') or 'jewelry.n-lux.com') or 'jewelry.n-lux.com'


def _host_is_local_or_private(hostname):
    host = _clean_text(hostname).split(':', 1)[0].lower()
    if host in {'localhost', '127.0.0.1', '0.0.0.0', '::1'}:
        return True
    if host.startswith('192.168.') or host.startswith('10.'):
        return True
    parts = host.split('.')
    if len(parts) == 4 and parts[0] == '172':
        try:
            second = int(parts[1])
        except ValueError:
            return False
        return 16 <= second <= 31
    return False


def _public_asset_base():
    proto = 'https'
    host = PUBLIC_ASSET_HOST
    if has_request_context():
        req_proto = _clean_text(request.headers.get('X-Forwarded-Proto') or request.scheme or 'https') or 'https'
        req_host = _clean_text(request.headers.get('X-Forwarded-Host') or request.host) or host
        if not _host_is_local_or_private(req_host):
            host = req_host
            proto = req_proto
        if proto == 'http':
            proto = 'https'
    return f'{proto}://{host}'


def _normalize_public_upload_url(value):
    text = _clean_text(value)
    if not text:
        return ''
    lowered = text.lower()
    if lowered.startswith('data:image/') or lowered.startswith('blob:'):
        return text
    base = _public_asset_base()
    try:
        candidate = text
        if '://' not in text:
            candidate = urllib.parse.urljoin(f'{base}/', text.lstrip('/'))
        parsed = urllib.parse.urlparse(candidate)
        if parsed.scheme not in {'http', 'https'}:
            return text
        if _host_is_local_or_private(parsed.hostname or parsed.netloc):
            suffix = parsed.path or '/'
            if parsed.query:
                suffix = f'{suffix}?{parsed.query}'
            if parsed.fragment:
                suffix = f'{suffix}#{parsed.fragment}'
            return urllib.parse.urljoin(f'{base}/', suffix.lstrip('/'))
        return parsed.geturl()
    except Exception:
        return text


def _build_customer_image_asset(value):
    full_url = _normalize_public_upload_url(value)
    thumb_url = _normalize_public_upload_url(ensure_upload_thumbnail(value))
    return {
        'url': full_url,
        'thumb_url': thumb_url or full_url,
    }


def _build_customer_gallery_assets(values):
    assets = []
    seen = set()
    raw_values = values if isinstance(values, list) else []
    for item in raw_values:
        asset = _build_customer_image_asset(item)
        url = asset.get('url')
        if not url or url in seen:
            continue
        seen.add(url)
        assets.append(asset)
    return assets


def don_json(d):
    return {'id': d.id, 'ma_don': d.ma_don, 'loai_don': getattr(d, 'loai_don', 'Mua') or 'Mua',
            'khach_hang': d.khach_hang, 'cccd': getattr(d, 'cccd', '') or '', 'so_dien_thoai': d.so_dien_thoai,
            'dia_chi_kh': getattr(d, 'dia_chi_kh', '') or '', 'dia_chi': d.dia_chi, 'ngay_dat': d.ngay_dat,
            'ngay_giao': d.ngay_giao, 'items': d.items or [], 'tong_tien': d.tong_tien,
            'dat_coc': d.dat_coc, 'trang_thai': d.trang_thai, 'ghi_chu': d.ghi_chu,
            'chung_tu': getattr(d, 'chung_tu', []) or [],
            'hoa_don_tai_chinh': getattr(d, 'hoa_don_tai_chinh', {}) or {},
            'da_hach_toan_so_quy': int(getattr(d, 'da_hach_toan_so_quy', 0) or 0),
            'nguoi_tao': d.nguoi_tao, 'ngay_tao': d.ngay_tao,
            'cap_nhat_luc': getattr(d, 'cap_nhat_luc', '') or ''}


def khach_hang_json(obj):
    gallery_assets = _build_customer_gallery_assets(obj.anh_bo_suu_tap if isinstance(obj.anh_bo_suu_tap, list) else [])
    photo_gallery = [asset['url'] for asset in gallery_assets if asset.get('url')]
    photo_gallery_thumbs = [asset.get('thumb_url') or asset.get('url') for asset in gallery_assets if asset.get('url')]
    front_asset = _build_customer_image_asset(obj.anh_mat_truoc)
    back_asset = _build_customer_image_asset(obj.anh_mat_sau)
    front_image = front_asset.get('url', '')
    back_image = back_asset.get('url', '')
    front_thumb = front_asset.get('thumb_url') or front_image
    back_thumb = back_asset.get('thumb_url') or back_image
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
        'yeu_thich': bool(obj.yeu_thich or 0),
        'favorite': bool(obj.yeu_thich or 0),
        'ocr_mat_sau': obj.ocr_mat_sau or '',
        'anh_mat_truoc': front_image,
        'anh_mat_truoc_thumb': front_thumb,
        'anh_mat_sau': back_image,
        'anh_mat_sau_thumb': back_thumb,
        'frontThumb': front_thumb,
        'backThumb': back_thumb,
        'anh_bo_suu_tap': photo_gallery,
        'anh_bo_suu_tap_thumb': photo_gallery_thumbs,
        'photo_gallery': photo_gallery,
        'photo_gallery_thumbs': photo_gallery_thumbs,
        'photo_gallery_assets': gallery_assets,
        'photoGallery': photo_gallery,
        'photoGalleryThumbs': photo_gallery_thumbs,
        'photoGalleryAssets': gallery_assets,
        'ghi_chu': obj.ghi_chu or '',
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


def _parse_customer_favorite(value):
    if isinstance(value, bool):
        return 1 if value else 0
    return 1 if str(value or '').strip().lower() in {'1', 'true', 'yes', 'y', 'on'} else 0


def _parse_customer_photo_gallery(value):
    raw_items = value
    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            raw_items = []
        else:
            try:
                raw_items = json.loads(stripped)
            except ValueError:
                raw_items = [value]
    if not isinstance(raw_items, list):
        raw_items = [raw_items]
    cleaned = []
    seen = set()
    for item in raw_items:
        text = _normalize_public_upload_url(item) or _clean_text(item)
        if not text or text in seen:
            continue
        seen.add(text)
        cleaned.append(text)
    return cleaned[:24]


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

    if not expected_name and not expected_cccd and not expected_phone:
        return []

    
    query = KhachHang.query.order_by(KhachHang.id.desc())
    if target_id is not None:
        try:
            query = query.filter(KhachHang.id != target_id)
        except Exception:
            pass
    rows = query.all()
    if target_id is not None:
        rows = [r for r in rows if r.id != target_id]

    matches = []
    for row in rows:
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


TIEN_MAT_CATEGORY = 'Tiền mặt'
BANK_ACCOUNT_CATEGORY = LEGACY_BANK_LEDGER_NAME


def _normalize_so_quy_ngay(value):
    text = str(value or '').strip()
    if not text:
        return today_iso()
    return text[:10]


def _apply_signed_amount_to_cashier_detail(thu_ngan_obj, ngay, category_name, amount_vnd):
    amount = _parse_bigint(amount_vnd, 0)
    if not thu_ngan_obj or amount == 0:
        return False

    from .cashier_routes import (
        _get_or_create_thu_ngan_so_quy_row,
        _make_thu_ngan_so_quy_detail_row,
        _sync_thu_ngan_so_quy_detail_totals,
    )

    scaled_amount = _parse_thu_ngan_amount_input(amount, 0)
    if scaled_amount == 0:
        return False

    so_quy = _get_or_create_thu_ngan_so_quy_row(ngay, thu_ngan_obj.id)
    chi_tiet = list(so_quy.chi_tiet or [])

    for detail in chi_tiet:
        if _clean_text(detail.get('tuoi_vang')) != category_name:
            continue
        opening = _parse_bigint(detail.get('ton_dau_ky', detail.get('so_tien_dau_ngay')), 0)
        current = _parse_bigint(detail.get('so_du_hien_tai', detail.get('so_tien_hien_tai')), 0)
        next_current = current + scaled_amount
        detail['so_du_hien_tai'] = next_current
        detail['gia_tri_lech'] = next_current - opening
        break
    else:
        chi_tiet.insert(0, _make_thu_ngan_so_quy_detail_row(
            category_name,
            ton_dau_ky=0,
            so_du_hien_tai=scaled_amount,
            gia_tri_lech=scaled_amount,
        ))

    so_quy.chi_tiet = chi_tiet
    flag_modified(so_quy, 'chi_tiet')
    _sync_thu_ngan_so_quy_detail_totals(so_quy)
    so_quy.cap_nhat_luc = now_str()
    db.session.add(so_quy)
    return True


def _resolve_company_bank_ledger_name(account_id='', ledger_key='', account_no=''):
    account = find_company_bank_account(
        account_id=account_id,
        ledger_key=ledger_key,
        account_no=account_no,
    )
    if account:
        return account.get('ledger_key') or BANK_ACCOUNT_CATEGORY

    _, accounts = list_company_bank_accounts()
    if accounts:
        return (accounts[0] or {}).get('ledger_key') or BANK_ACCOUNT_CATEGORY

    return BANK_ACCOUNT_CATEGORY


def _apply_sale_payment_bookings(
    ngay,
    cash_payment=0,
    bank_payment=0,
    company_bank_account_id='',
    company_bank_ledger_key='',
    company_bank_account_no='',
):
    updated = False
    cash = _parse_bigint(cash_payment, 0)
    bank = _parse_bigint(bank_payment, 0)

    # /sale gui so tien co dau: duong = khach tra, am = cua hang chi tra lai khach.
    if cash != 0:
        tn1 = ThuNgan.query.filter(ThuNgan.ten_thu_ngan.ilike('%TN1%')).order_by(ThuNgan.id).first()
        if tn1:
            updated = _apply_signed_amount_to_cashier_detail(tn1, ngay, TIEN_MAT_CATEGORY, cash) or updated
        else:
            print('Khong tim thay thu ngan TN1 de cap nhat tien mat cho don hang.')

    if bank != 0:
        kho_tong = ThuNgan.query.filter(ThuNgan.ten_thu_ngan.ilike('%Kho Tổng%')).order_by(ThuNgan.id).first()
        if kho_tong:
            bank_category = _resolve_company_bank_ledger_name(
                account_id=company_bank_account_id,
                ledger_key=company_bank_ledger_key,
                account_no=company_bank_account_no,
            )
            updated = _apply_signed_amount_to_cashier_detail(kho_tong, ngay, bank_category, bank) or updated
        else:
            print('Khong tim thay Kho Tong de cap nhat tai khoan ngan hang cho don hang.')

    return updated


def _normalize_order_json_list(value):
    return list(value) if isinstance(value, list) else []


def _normalize_order_json_object(value):
    return dict(value) if isinstance(value, dict) else {}


def _upsert_order_financial_invoice(
    order_id,
    customer_info,
    settlement,
    invoice_data,
    result,
    extracted,
    lookup_invoice,
    lookup_payload,
    state_payload,
    issue_now,
    chung_tu_record=None,
    public_vat_bill=None,
    public_vat_bill_error='',
):
    order_key = _clean_text(order_id)
    if not order_key:
        return None, False

    now_value = now_str()
    obj = DonHang.query.filter_by(ma_don=order_key).first()
    created = obj is None
    if created:
        obj = DonHang(
            ma_don=order_key,
            trang_thai='Nháp POS',
            nguoi_tao='POS Mobile',
            ngay_tao=now_value,
            cap_nhat_luc=now_value,
        )
        db.session.add(obj)

    customer_payload = _normalize_order_json_object(customer_info)
    settlement_payload = _normalize_order_json_object(settlement)
    invoice_payload = _normalize_order_json_object(invoice_data)
    extracted_payload = _normalize_order_json_object(extracted)
    lookup_invoice_payload = _normalize_order_json_object(lookup_invoice)
    lookup_payload_data = _normalize_order_json_object(lookup_payload)
    state_payload_data = _normalize_order_json_object(state_payload)
    doc_payload = _normalize_order_json_object(chung_tu_record)

    if not _clean_text(obj.khach_hang):
        obj.khach_hang = _clean_text(customer_payload.get('name') or customer_payload.get('buyer')) or 'Khach le'
    if not _clean_text(getattr(obj, 'cccd', '')):
        obj.cccd = _clean_text(customer_payload.get('cccd'))
    if not _clean_text(obj.so_dien_thoai):
        obj.so_dien_thoai = _clean_text(customer_payload.get('phone'))
    if not _clean_text(getattr(obj, 'dia_chi_kh', '')):
        obj.dia_chi_kh = _clean_text(customer_payload.get('address') or customer_payload.get('residence'))
    if not _clean_text(obj.dia_chi):
        obj.dia_chi = _clean_text(customer_payload.get('address') or customer_payload.get('residence'))

    invoice_status = lookup_invoice_payload.get('InvoiceStatus')
    obj.hoa_don_tai_chinh = {
        'status': 'issued' if issue_now else 'draft',
        'updated_at': now_value,
        'order_id': order_key,
        'customer_info': customer_payload,
        'settlement': settlement_payload,
        'invoice_data': invoice_payload,
        'easyinvoice': {
            'link_view': _clean_text(extracted_payload.get('link_view')),
            'lookup_code': _clean_text(extracted_payload.get('lookup_code')),
            'invoice_no': _clean_text(extracted_payload.get('invoice_no')),
            'ikey': _clean_text(extracted_payload.get('ikey')),
            'invoice_status': invoice_status,
            'status_text': _easyinvoice_status_text(invoice_status),
            'result': result,
            'lookup': lookup_payload_data,
            'invoice': lookup_invoice_payload,
            'state': state_payload_data,
            'public_vat_bill': public_vat_bill or None,
            'public_vat_bill_error': _clean_text(public_vat_bill_error),
        },
        'record': doc_payload,
    }
    flag_modified(obj, 'hoa_don_tai_chinh')

    next_docs = _normalize_order_json_list(getattr(obj, 'chung_tu', []))
    next_entry = {
        'source': 'easyinvoice',
        'status': 'issued' if issue_now else 'draft',
        'updated_at': now_value,
        'ma_ct': _clean_text(doc_payload.get('ma_ct')),
        'invoice_no': _clean_text(extracted_payload.get('invoice_no')),
        'lookup_code': _clean_text(extracted_payload.get('lookup_code')),
        'link_view': _clean_text(extracted_payload.get('link_view')),
        'ikey': _clean_text(extracted_payload.get('ikey')),
    }
    next_docs = [
        entry for entry in next_docs
        if _clean_text((entry or {}).get('ma_ct')) != next_entry['ma_ct']
    ]
    next_docs.append(next_entry)
    obj.chung_tu = next_docs
    flag_modified(obj, 'chung_tu')
    obj.cap_nhat_luc = now_value
    db.session.add(obj)
    db.session.commit()
    return obj, created


@app.route('/api/khach_hang', methods=['GET'])
def get_khach_hang():
    rows = KhachHang.query.order_by(KhachHang.yeu_thich.desc(), KhachHang.id.desc()).all()
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
    obj.yeu_thich = _parse_customer_favorite(d.get('yeu_thich') if 'yeu_thich' in d else d.get('favorite') if 'favorite' in d else d.get('favourite'))
    obj.ocr_mat_sau = _clean_text(d.get('ocr_mat_sau') or d.get('back_text') or d.get('backText'))
    obj.ghi_chu = _clean_text(d.get('ghi_chu') or d.get('note') or d.get('notes') or d.get('ghi_chu_nhanh'))
    if any(key in d for key in ('anh_mat_truoc', 'front_image', 'frontImage')):
        obj.anh_mat_truoc = _normalize_public_upload_url(d.get('anh_mat_truoc') or d.get('front_image') or d.get('frontImage'))
    if any(key in d for key in ('anh_mat_sau', 'back_image', 'backImage')):
        obj.anh_mat_sau = _normalize_public_upload_url(d.get('anh_mat_sau') or d.get('back_image') or d.get('backImage'))
    if any(key in d for key in ('anh_bo_suu_tap', 'photo_gallery', 'photoGallery')):
        obj.anh_bo_suu_tap = _parse_customer_photo_gallery(
            d.get('anh_bo_suu_tap')
            if 'anh_bo_suu_tap' in d else d.get('photo_gallery')
            if 'photo_gallery' in d else d.get('photoGallery')
        )
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
        'api_username': _easyinvoice_setting(config_data, 'EASYINVOICE_API_USERNAME', 'api_username', 'list_username', default=EASYINVOICE_DEFAULTS['api_username']),
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


def _easyinvoice_vat_bill_slug(value, fallback='hoa-don'):
    text = _clean_text(value).lower()
    if not text:
        return fallback
    text = re.sub(r'[^a-z0-9]+', '-', text)
    text = re.sub(r'-{2,}', '-', text).strip('-')
    return text or fallback


def _easyinvoice_vat_bill_public_roots():
    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
    env_root = _clean_text(os.environ.get('VAT_BILL_PUBLIC_ROOT'))
    dist_candidates = [candidate for candidate in (
        env_root,
        os.path.join(project_root, 'dist'),
        os.path.join(project_root, 'frontend', 'dist'),
    ) if candidate]
    for candidate in dist_candidates:
        if os.path.isdir(candidate):
            return os.path.abspath(candidate), True

    upload_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'uploads'))
    return upload_root, False


def _easyinvoice_vat_bill_storage_dir():
    public_root, is_static_dist = _easyinvoice_vat_bill_public_roots()
    target_root = (
        os.path.join(public_root, 'download', 'vat-bill')
        if is_static_dist else
        os.path.join(public_root, 'vat-bill')
    )
    os.makedirs(target_root, exist_ok=True)
    return target_root, is_static_dist


def _easyinvoice_vat_bill_relative_url(relative_path, is_static_dist):
    normalized = str(relative_path or '').replace('\\', '/').strip('/')
    if not normalized:
        return ''
    if is_static_dist:
        return f'/download/vat-bill/{normalized}'
    return f'/api/uploads/vat-bill/{normalized}'


def _easyinvoice_vat_bill_absolute_url(relative_url):
    relative_url = _clean_text(relative_url)
    if not relative_url:
        return ''
    if relative_url.startswith('http://') or relative_url.startswith('https://'):
        return relative_url

    proto = 'https'
    host = _clean_text(os.environ.get('PUBLIC_HOST') or 'jewelry.n-lux.com')
    if has_request_context():
        proto = _clean_text(request.headers.get('X-Forwarded-Proto') or request.scheme or 'https') or 'https'
        host = _clean_text(request.headers.get('X-Forwarded-Host') or request.host) or host
        host_name = host.split(':', 1)[0].lower()
        if (
            proto == 'http' and
            host_name not in {'localhost', '127.0.0.1'} and
            not host_name.startswith('192.168.') and
            not host_name.startswith('10.')
        ):
            proto = 'https'
    return f'{proto}://{host}{relative_url if relative_url.startswith("/") else "/" + relative_url}'


def _easyinvoice_vat_bill_title(payload):
    invoice_no = _clean_text((payload or {}).get('invoice_no'))
    buyer = _clean_text((payload or {}).get('buyer'))
    if invoice_no and buyer:
        return f'Hoa don VAT {invoice_no} - {buyer}'
    if invoice_no:
        return f'Hoa don VAT {invoice_no}'
    if buyer:
        return f'Hoa don VAT - {buyer}'
    return 'Hoa don VAT'


def _easyinvoice_vat_bill_wrap_html(raw_html, title):
    html_text = str(raw_html or '').strip()
    if not html_text:
        raise ValueError('Khong co HTML hoa don de luu.')
    if '<html' in html_text.lower():
        return html_text
    return f"""<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{escape(title)}</title>
  <style>
    html, body {{
      margin: 0;
      background: #f1f5f9;
      color: #0f172a;
      font-family: Arial, sans-serif;
    }}
    body {{
      padding: 16px;
      display: flex;
      justify-content: center;
      box-sizing: border-box;
    }}
    .vat-bill-shell {{
      width: 100%;
      max-width: 1120px;
    }}
  </style>
</head>
<body>
  <div class="vat-bill-shell">{html_text}</div>
</body>
</html>"""


def _easyinvoice_vat_bill_fetch_source_html(source_url):
    source_url = _clean_text(source_url)
    if not source_url:
        raise ValueError('Thieu link hoa don de tai ve.')

    parsed = urllib.parse.urlsplit(source_url)
    host = (parsed.hostname or '').lower()
    if parsed.scheme not in {'http', 'https'}:
        raise ValueError('Link hoa don khong hop le.')
    if host and not (
        host.endswith('easyinvoice.com.vn') or
        host.endswith('easyinvoice.vn') or
        host.endswith('jewelry.n-lux.com')
    ):
        raise ValueError('Chi ho tro link hoa don EasyInvoice.')

    request_obj = urllib.request.Request(
        source_url,
        headers={
            'User-Agent': (
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
                'AppleWebKit/537.36 (KHTML, like Gecko) '
                'Chrome/135.0.0.0 Safari/537.36'
            ),
            'Accept': 'text/html,application/xhtml+xml',
        },
    )
    with urllib.request.urlopen(request_obj, timeout=12) as response:
        content_type = response.headers.get('Content-Type', 'text/html')
        charset = response.headers.get_content_charset() or 'utf-8'
        html_text = response.read().decode(charset, errors='replace')
        final_url = response.geturl()

    lowered = html_text.lower()
    if 'text/html' not in content_type.lower() and not lowered.lstrip().startswith('<'):
        raise ValueError('Link hoa don khong tra ve HTML de luu.')
    if '/account/logon' in (final_url or '').lower() or ('name="password"' in lowered and 'name="captch"' in lowered):
        raise ValueError('Link hoa don hien dang yeu cau dang nhap, chua the xuat public truc tiep.')
    return html_text, final_url


def _easyinvoice_vat_bill_file_name(payload):
    payload = payload if isinstance(payload, dict) else {}
    month_key = datetime.date.today().strftime('%Y-%m')
    stamp = datetime.datetime.now().strftime('%Y%m%d%H%M%S')
    stable_key = '|'.join([
        _clean_text(payload.get('ikey')),
        _clean_text(payload.get('invoice_no')),
        _clean_text(payload.get('lookup_code')),
        _clean_text(payload.get('order_id')),
        _clean_text(payload.get('buyer')),
    ])
    hash_key = hashlib.md5(stable_key.encode('utf-8')).hexdigest()[:10]
    parts = ['vat-bill']
    invoice_no = _clean_text(payload.get('invoice_no'))
    if invoice_no and 'chua cap so' not in invoice_no.lower():
        parts.append(_easyinvoice_vat_bill_slug(invoice_no, 'so'))
    elif _clean_text(payload.get('lookup_code')):
        parts.append(_easyinvoice_vat_bill_slug(payload.get('lookup_code'), 'lookup'))
    elif _clean_text(payload.get('ikey')):
        parts.append(_easyinvoice_vat_bill_slug(payload.get('ikey'), 'ikey'))
    elif _clean_text(payload.get('order_id')):
        parts.append(_easyinvoice_vat_bill_slug(payload.get('order_id'), 'order'))
    parts.append(stamp)
    parts.append(hash_key)
    return month_key, '-'.join(part for part in parts if part) + '.html'


def _easyinvoice_attach_public_vat_bill(payload, vat_bill):
    payload = payload if isinstance(payload, dict) else {}
    vat_bill = vat_bill if isinstance(vat_bill, dict) else {}

    doc = None
    record_id = payload.get('record_id')
    if record_id not in (None, ''):
        try:
            doc = ChungTu.query.filter_by(id=int(record_id)).first()
        except (TypeError, ValueError):
            doc = None

    ma_ct = _clean_text(payload.get('ma_ct'))
    if doc is None and ma_ct:
        doc = ChungTu.query.filter_by(ma_ct=ma_ct).first()

    order_id = _clean_text(payload.get('order_id'))
    if doc is None and order_id:
        doc = ChungTu.query.filter_by(ma_ct=f'EI-{order_id}').first()

    if doc is None:
        return None

    attachments = list(doc.file_dinh_kem or [])
    updated = False
    for index, item in enumerate(attachments):
        if not isinstance(item, dict):
            continue
        if item.get('source') != 'easyinvoice':
            continue
        attachments[index] = {**item, 'public_vat_bill': dict(vat_bill)}
        updated = True
        break

    if not updated:
        attachments.append({
            'source': 'public_vat_bill',
            'public_vat_bill': dict(vat_bill),
        })

    doc.file_dinh_kem = attachments
    flag_modified(doc, 'file_dinh_kem')
    db.session.commit()
    return doc.id


def _easyinvoice_save_vat_bill_snapshot(payload, persist_record=False):
    payload = payload if isinstance(payload, dict) else {}
    html_value = payload.get('html')
    source_url = _clean_text(payload.get('source_url') or payload.get('sourceUrl') or payload.get('link_view'))
    source_kind = 'html'
    resolved_source_url = ''

    if html_value in (None, '') and not source_url:
        raise ValueError('Thieu html hoac link hoa don de luu.')

    if html_value not in (None, ''):
        document_html = _easyinvoice_vat_bill_wrap_html(html_value, _easyinvoice_vat_bill_title(payload))
    else:
        fetched_html, resolved_source_url = _easyinvoice_vat_bill_fetch_source_html(source_url)
        document_html = _easyinvoice_vat_bill_wrap_html(fetched_html, _easyinvoice_vat_bill_title(payload))
        source_kind = 'source_url'

    storage_root, is_static_dist = _easyinvoice_vat_bill_storage_dir()
    month_key, filename = _easyinvoice_vat_bill_file_name(payload)
    target_dir = os.path.join(storage_root, month_key)
    os.makedirs(target_dir, exist_ok=True)
    target_path = os.path.join(target_dir, filename)

    with open(target_path, 'w', encoding='utf-8') as handle:
        handle.write(document_html)

    relative_file = f'{month_key}/{filename}'
    relative_url = _easyinvoice_vat_bill_relative_url(relative_file, is_static_dist)
    result = {
        'saved': True,
        'source': source_kind,
        'url': relative_url,
        'absolute_url': _easyinvoice_vat_bill_absolute_url(relative_url),
        'stored_name': filename,
        'folder': month_key,
        'source_url': resolved_source_url or source_url,
        'saved_at': now_str(),
        'title': _easyinvoice_vat_bill_title(payload),
    }

    if persist_record:
        record_id = _easyinvoice_attach_public_vat_bill(payload, result)
        if record_id:
            result['record_id'] = record_id

    return result


def _easyinvoice_call_and_lookup(config, xml_data, issue_now):
    """Goi API EasyInvoice va lookup ket qua.
    Tra ve (result, extracted, lookup_invoice, lookup_payload, state_payload).
    Raise EasyInvoiceApiError neu API that bai.
    """
    if issue_now:
        result = easyinvoice_client.issue_invoice(config, xml_data, timeout=60)
    else:
        result = easyinvoice_client.import_invoice(config, xml_data, timeout=60)

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
    return result, extracted, lookup_invoice, lookup_payload, state_payload


def _easyinvoice_upsert_chung_tu(order_id, customer, invoice, config,
                                   extracted, result, lookup_invoice,
                                   lookup_payload, state_payload, issue_now,
                                   public_vat_bill=None, public_vat_bill_error=''):
    """Tao hoac cap nhat buc ghi ChungTu cho hoa don EasyInvoice. Commit DB."""
    invoice_amount = int(invoice.get('amount') or 0)
    invoice_status = lookup_invoice.get('InvoiceStatus') if isinstance(lookup_invoice, dict) else None
    record_code = f"EI-{order_id or datetime.datetime.now().strftime('%y%m%d%H%M%S')}"

    doc = ChungTu.query.filter_by(ma_ct=record_code).first()
    created = doc is None
    if created:
        doc = ChungTu(ma_ct=record_code, ngay_tao=now_str())
        db.session.add(doc)

    doc.loai_ct = 'Hoa don do EasyInvoice'
    doc.ngay_lap = datetime.date.today().strftime('%d/%m/%Y')
    doc.ngay_hach_toan = doc.ngay_lap
    doc.doi_tuong = _clean_text(customer.get('name') or customer.get('buyer')) or 'Khach le'
    doc.mo_ta = f'EasyInvoice {order_id or record_code}'
    doc.so_tien = invoice_amount
    doc.thue_suat = float(_easyinvoice_safe_vat_rate(invoice.get('vatRate')))
    doc.trang_thai = (
        f"Da phat hanh {_easyinvoice_status_text(invoice_status) or 'EasyInvoice'}"
        if issue_now else 'Da tao unsigned'
    )
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
        'public_vat_bill': public_vat_bill or None,
        'public_vat_bill_error': _clean_text(public_vat_bill_error),
    }]
    db.session.commit()
    return doc, created, invoice_status


def _submit_easyinvoice(issue_now=False):
    """Orchestrator: parse -> validate -> build XML -> call API -> save -> respond."""
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
        result, extracted, lookup_invoice, lookup_payload, state_payload = (
            _easyinvoice_call_and_lookup(config, xml_data, issue_now)
        )
    except easyinvoice_client.EasyInvoiceApiError as exc:
        return jsonify({'error': exc.message, 'detail': exc.payload}), exc.status_code

    public_vat_bill = None
    public_vat_bill_error = ''
    if extracted.get('link_view'):
        try:
            public_vat_bill = _easyinvoice_save_vat_bill_snapshot({
                'source_url': extracted.get('link_view'),
                'order_id': order_id,
                'invoice_no': extracted.get('invoice_no'),
                'lookup_code': extracted.get('lookup_code'),
                'ikey': extracted.get('ikey'),
                'buyer': _clean_text(
                    lookup_invoice.get('Buyer') or lookup_invoice.get('CustomerName')
                    or (invoice_data.get('customer') or {}).get('name')
                    or (invoice_data.get('customer') or {}).get('buyer')
                ),
                'amount': lookup_invoice.get('Amount') or invoice_amount,
            })
        except Exception as exc:
            public_vat_bill_error = _clean_text(exc)

    customer = invoice_data.get('customer') if isinstance(invoice_data.get('customer'), dict) else {}
    doc, created, invoice_status = _easyinvoice_upsert_chung_tu(
        order_id, customer, invoice, config,
        extracted, result, lookup_invoice, lookup_payload, state_payload, issue_now,
        public_vat_bill=public_vat_bill,
        public_vat_bill_error=public_vat_bill_error,
    )
    order_customer_info = d.get('customer_info') if isinstance(d.get('customer_info'), dict) else customer
    order_settlement = d.get('settlement') if isinstance(d.get('settlement'), dict) else {}
    order_record, order_created = _upsert_order_financial_invoice(
        order_id=order_id,
        customer_info=order_customer_info,
        settlement=order_settlement,
        invoice_data=invoice_data,
        result=result,
        extracted=extracted,
        lookup_invoice=lookup_invoice,
        lookup_payload=lookup_payload,
        state_payload=state_payload,
        issue_now=issue_now,
        chung_tu_record={
            'id': doc.id,
            'ma_ct': doc.ma_ct,
            'so_tien': doc.so_tien,
            'trang_thai': doc.trang_thai,
        },
        public_vat_bill=public_vat_bill,
        public_vat_bill_error=public_vat_bill_error,
    )

    return jsonify({
        'msg': 'Da phat hanh EasyInvoice thanh cong.' if issue_now else 'Da tao EasyInvoice thanh cong.',
        'issued': issue_now,
        'created': created,
        'order_id': order_id,
        'order_saved': bool(order_record),
        'order_created': order_created,
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
        'buyer': _clean_text(
            lookup_invoice.get('Buyer') or lookup_invoice.get('CustomerName')
            or customer.get('name') or customer.get('buyer')
        ),
        'amount': lookup_invoice.get('Amount') or invoice_amount,
        'invoice_status': invoice_status,
        'status_text': _easyinvoice_status_text(invoice_status),
        'invoice': lookup_invoice,
        'state': state_payload,
        'vat_bill': public_vat_bill,
        'vat_bill_url': (public_vat_bill or {}).get('url', ''),
        'vat_bill_absolute_url': (public_vat_bill or {}).get('absolute_url', ''),
        'vat_bill_error': public_vat_bill_error,
        'raw': result,
    })



@app.route('/api/easyinvoice/vat-bill/save', methods=['POST'])
def save_easyinvoice_vat_bill():
    payload = request.json or {}
    try:
        result = _easyinvoice_save_vat_bill_snapshot(payload, persist_record=True)
    except ValueError as exc:
        return jsonify({'error': str(exc)}), 400
    except urllib.error.HTTPError as exc:
        return jsonify({'error': f'EasyInvoice HTTP {exc.code}: {exc.reason}'}), 502
    except urllib.error.URLError as exc:
        return jsonify({'error': f'Khong ket noi duoc link hoa don: {exc.reason}'}), 502
    except Exception as exc:
        return jsonify({'error': f'Khong luu duoc hoa don cong khai: {exc}'}), 500
    return jsonify(result)


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
    now_value = now_str()
    if created:
        obj = DonHang(ma_don=ma, ngay_tao=now_value)
        db.session.add(obj)
    obj.loai_don = _clean_text(d.get('loai_don') or getattr(obj, 'loai_don', '') or 'Mua') or 'Mua'
    obj.khach_hang = d.get('khach_hang', '')
    obj.cccd = _clean_text(d.get('cccd'))
    obj.so_dien_thoai = d.get('so_dien_thoai', '')
    obj.dia_chi_kh = _clean_text(d.get('dia_chi_kh') or d.get('dia_chi'))
    obj.dia_chi = d.get('dia_chi', '')
    obj.ngay_dat = d.get('ngay_dat', '')
    obj.ngay_giao = d.get('ngay_giao', '')
    obj.items = _normalize_order_json_list(d.get('items', []))
    obj.tong_tien = int(d.get('tong_tien') or 0)
    obj.dat_coc = int(d.get('dat_coc') or 0)
    obj.trang_thai = d.get('trang_thai', 'Mới')
    obj.ghi_chu = d.get('ghi_chu', '')
    obj.nguoi_tao = d.get('nguoi_tao', '') or obj.nguoi_tao or 'POS Mobile'
    if 'chung_tu' in d:
        obj.chung_tu = _normalize_order_json_list(d.get('chung_tu'))
        flag_modified(obj, 'chung_tu')
    if 'hoa_don_tai_chinh' in d:
        obj.hoa_don_tai_chinh = _normalize_order_json_object(d.get('hoa_don_tai_chinh'))
        flag_modified(obj, 'hoa_don_tai_chinh')
    obj.cap_nhat_luc = now_value
    db.session.commit()

    should_apply_payment_bookings = _parse_overwrite_flag(
        d.get('apply_payment_bookings') or d.get('finalize') or d.get('book_payment')
    )
    has_payment_values = _parse_bigint(d.get('cash_payment'), 0) != 0 or _parse_bigint(d.get('bank_payment'), 0) != 0
    if should_apply_payment_bookings and has_payment_values and not int(getattr(obj, 'da_hach_toan_so_quy', 0) or 0):
        try:
            updated = _apply_sale_payment_bookings(
                _normalize_so_quy_ngay(d.get('ngay_dat')),
                cash_payment=d.get('cash_payment'),
                bank_payment=d.get('bank_payment'),
                company_bank_account_id=d.get('company_bank_account_id'),
                company_bank_ledger_key=d.get('company_bank_ledger_key'),
                company_bank_account_no=d.get('company_bank_account_no'),
            )
            if updated:
                obj.da_hach_toan_so_quy = 1
                obj.cap_nhat_luc = now_str()
                db.session.add(obj)
                db.session.commit()
        except Exception as e:
            db.session.rollback()
            print("Loi cap nhat thu ngan:", e)

    return jsonify({'msg': 'Created' if created else 'Updated', 'id': obj.id, 'ma_don': obj.ma_don}), 201 if created else 200


@app.route('/api/don_hang/<int:did>', methods=['GET','PUT','DELETE'])
def update_don_hang(did):
    obj = DonHang.query.get_or_404(did)
    if request.method == 'GET':
        return jsonify(don_json(obj))
    if request.method == 'DELETE':
        db.session.delete(obj)
        db.session.commit()
        return jsonify({'msg': 'Deleted'})
    d = request.json or {}
    for f in ['loai_don', 'khach_hang', 'cccd', 'so_dien_thoai', 'dia_chi_kh', 'dia_chi',
               'ngay_dat', 'ngay_giao', 'trang_thai', 'ghi_chu', 'nguoi_tao']:
        if f in d:
            setattr(obj, f, d[f])
    if 'items' in d:
        obj.items = _normalize_order_json_list(d['items'])
    if 'tong_tien' in d:
        obj.tong_tien = int(d['tong_tien'] or 0)
    if 'dat_coc' in d:
        obj.dat_coc = int(d['dat_coc'] or 0)
    if 'chung_tu' in d:
        obj.chung_tu = _normalize_order_json_list(d['chung_tu'])
        flag_modified(obj, 'chung_tu')
    if 'hoa_don_tai_chinh' in d:
        obj.hoa_don_tai_chinh = _normalize_order_json_object(d['hoa_don_tai_chinh'])
        flag_modified(obj, 'hoa_don_tai_chinh')
    obj.cap_nhat_luc = now_str()
    db.session.commit()
    return jsonify({'msg': 'Updated'})


def nv_json(n):
    return {
        'id': n.id, 'ma_nv': n.ma_nv, 'ho_ten': n.ho_ten, 'chuc_vu': n.chuc_vu,
        'phong_ban': n.phong_ban, 'so_dien_thoai': n.so_dien_thoai, 'email': n.email,
        'dia_chi': n.dia_chi, 'ngay_vao': n.ngay_vao, 'luong_co_ban': n.luong_co_ban,
        'trang_thai': n.trang_thai, 'ghi_chu': n.ghi_chu, 'ngay_tao': n.ngay_tao,
    }


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
    db.session.add(obj)
    db.session.commit()
    return jsonify({'msg': 'Created', 'id': obj.id}), 201


@app.route('/api/nhan_vien/<int:nid>', methods=['GET','PUT','DELETE'])
def update_nhan_vien(nid):
    obj = NhanVien.query.get_or_404(nid)
    if request.method == 'GET':
        return jsonify(nv_json(obj))
    if request.method == 'DELETE':
        ThuNgan.query.filter_by(nhan_vien_id=obj.id).update({'nhan_vien_id': None}, synchronize_session=False)
        db.session.delete(obj)
        db.session.commit()
        return jsonify({'msg': 'Deleted'})
    d = request.json or {}
    for f in ['ho_ten', 'chuc_vu', 'phong_ban', 'so_dien_thoai', 'email', 'dia_chi', 'ngay_vao', 'trang_thai', 'ghi_chu']:
        if f in d:
            setattr(obj, f, d[f])
    if 'luong_co_ban' in d:
        obj.luong_co_ban = int(d['luong_co_ban'] or 0)
    db.session.commit()
    return jsonify({'msg': 'Updated'})


def tc_json(t):
    return {
        'id': t.id, 'loai': t.loai, 'danh_muc': t.danh_muc, 'so_tien': t.so_tien,
        'ngay': t.ngay, 'mo_ta': t.mo_ta, 'doi_tuong': t.doi_tuong,
        'phuong_thuc': t.phuong_thuc, 'ngay_tao': t.ngay_tao,
    }


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
        db.session.delete(obj)
        db.session.commit()
        return jsonify({'msg': 'Deleted'})
    d = request.json or {}
    for f in ['loai', 'danh_muc', 'ngay', 'mo_ta', 'doi_tuong', 'phuong_thuc']:
        if f in d:
            setattr(obj, f, d[f])
    if 'so_tien' in d:
        obj.so_tien = int(d['so_tien'] or 0)
    db.session.commit()
    return jsonify({'msg': 'Updated'})
