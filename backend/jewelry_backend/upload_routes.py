import os
import uuid

from flask import jsonify, has_request_context, request, send_from_directory

from .state import app, db
from .models import *
from .setup import *
from .utils import *


UPLOAD_FOLDER = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'uploads'))
os.makedirs(UPLOAD_FOLDER, exist_ok=True)


def _safe_upload_extension(filename, fallback='bin'):
    raw_name = _clean_text(filename)
    if '.' not in raw_name:
        return fallback
    ext = raw_name.rsplit('.', 1)[-1].strip().lower()
    if not ext:
        return fallback
    safe_ext = ''.join(ch for ch in ext if ch.isalnum())
    return safe_ext or fallback


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


def _absolute_upload_url(filename):
    proto = 'https'
    host = _clean_text(os.environ.get('PUBLIC_HOST') or 'jewelry.n-lux.com')
    if has_request_context():
        req_proto = _clean_text(request.headers.get('X-Forwarded-Proto') or request.scheme or 'https') or 'https'
        req_host = _clean_text(request.headers.get('X-Forwarded-Host') or request.host) or host
        is_private_host = _host_is_local_or_private(req_host)
        if not is_private_host:
            host = req_host
            proto = req_proto
        elif req_proto == 'https':
            proto = 'https'
        if proto == 'http' and not is_private_host:
            proto = 'https'
    return f'{proto}://{host}/api/uploads/{filename}'


def _upload_json(filename, original_name=''):
    thumb_url = ensure_upload_thumbnail(filename)
    return {
        'url': f'/api/uploads/{filename}',
        'absolute_url': _absolute_upload_url(filename),
        'thumb_url': thumb_url,
        'thumb_absolute_url': _absolute_upload_url(extract_upload_relative_path(thumb_url)) if thumb_url else '',
        'name': original_name or filename,
        'stored_name': filename,
    }

@app.route('/api/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file'}), 400
    f = request.files['file']
    ext = _safe_upload_extension(f.filename, 'bin')
    filename = f'{uuid.uuid4()}.{ext}'
    f.save(os.path.join(UPLOAD_FOLDER, filename))
    return jsonify(_upload_json(filename, f.filename))


@app.route('/api/items/import-xls', methods=['POST'])
def import_items_xls():
    if 'file' not in request.files:
        return jsonify({'error': 'Chua co file XLS duoc upload.'}), 400

    upload = request.files['file']
    if not upload.filename:
        return jsonify({'error': 'Ten file khong hop le.'}), 400
    if not upload.filename.lower().endswith('.xls'):
        return jsonify({'error': 'Chi ho tro import file .xls theo dung mau bao cao.'}), 400

    try:
        parsed = _parse_inventory_xls(upload.read(), upload.filename)
    except ValueError as exc:
        return jsonify({'error': str(exc)}), 400
    except RuntimeError as exc:
        return jsonify({'error': str(exc)}), 500

    ts = now_str()
    detected_tuoi_vang = _clean_text(os.path.splitext(os.path.basename(upload.filename))[0])
    existing_items = {it.ma_hang: it for it in Item.query.all()}
    existing_nhom = {n.ten_nhom for n in NhomHang.query.all()}
    existing_quay = {q.ten_quay for q in QuayNho.query.all()}
    existing_loai = {_clean_text(v.ma_loai).upper() for v in LoaiVang.query.all() if _clean_text(v.ma_loai)}
    existing_tuoi = {t.ten_tuoi for t in TuoiVang.query.all()}
    next_nhom_order = (db.session.query(db.func.max(NhomHang.thu_tu)).scalar() or 0) + 1
    default_item_status = Item.__table__.columns['status'].default.arg
    default_kho_id = _get_or_create_default_kho().id

    created = 0
    added_nhom = 0
    added_quay = 0
    added_loai = 0
    added_tuoi = 0
    skipped_existing = 0
    skipped_in_file = 0
    updated_existing_tuoi_vang = 0
    seen_file_codes = set()
    duplicate_codes = []

    if detected_tuoi_vang and detected_tuoi_vang not in existing_tuoi:
        suggested = _suggest_tuoi_vang_defaults(detected_tuoi_vang)
        tuoi_obj = TuoiVang(
            ten_tuoi=detected_tuoi_vang,
            gia_ban=suggested['gia_ban'],
            gia_mua=suggested['gia_mua'],
            trong_luong_rieng=suggested['trong_luong_rieng'],
            lich_su=[],
            ngay_tao=ts,
        )
        db.session.add(tuoi_obj)
        synced_loai = _sync_loai_vang_from_tuoi_vang_record(tuoi_obj, record_history=False)
        if synced_loai and _clean_text(synced_loai.ma_loai):
            existing_loai.add(_clean_text(synced_loai.ma_loai).upper())
        existing_tuoi.add(detected_tuoi_vang)
        added_tuoi += 1

    for row in parsed['items']:
        ma_hang = row['ma_hang']
        if ma_hang in seen_file_codes:
            skipped_in_file += 1
            if len(duplicate_codes) < 20:
                duplicate_codes.append(ma_hang)
            continue
        seen_file_codes.add(ma_hang)

        if ma_hang in existing_items:
            skipped_existing += 1
            if len(duplicate_codes) < 20:
                duplicate_codes.append(ma_hang)
            existing_item = existing_items[ma_hang]
            if detected_tuoi_vang and existing_item.tuoi_vang != detected_tuoi_vang:
                existing_item.tuoi_vang = detected_tuoi_vang
                updated_existing_tuoi_vang += 1
            continue

        if row['nhom_hang'] and row['nhom_hang'] not in existing_nhom:
            db.session.add(NhomHang(
                ten_nhom=row['nhom_hang'],
                thu_tu=next_nhom_order,
                ngay_tao=ts,
            ))
            existing_nhom.add(row['nhom_hang'])
            next_nhom_order += 1
            added_nhom += 1

        if row['quay_nho'] and row['quay_nho'] not in existing_quay:
            db.session.add(QuayNho(
                ten_quay=row['quay_nho'],
                kho_id=default_kho_id,
                ngay_tao=ts,
            ))
            existing_quay.add(row['quay_nho'])
            added_quay += 1

        row_loai_vang = _clean_text(row['loai_vang']).upper()
        if row_loai_vang and row_loai_vang not in existing_loai:
            db.session.add(LoaiVang(
                ma_loai=row_loai_vang,
                ten_loai=row_loai_vang,
                ngay_tao=ts,
            ))
            existing_loai.add(row_loai_vang)
            added_loai += 1

        item = Item(
            ma_hang=ma_hang,
            ncc=row['ncc'],
            nhom_hang=row['nhom_hang'],
            quay_nho=row['quay_nho'],
            cong_le=row['cong_le'],
            cong_si=row['cong_si'],
            tong_tl=row['tong_tl'],
            tl_da=row['tl_da'],
            tl_vang=row['tl_vang'],
            loai_vang=row_loai_vang,
            tuoi_vang=detected_tuoi_vang,
            status=default_item_status,
            history=[{
                'date': ts,
                'action': f'Import XLS: {upload.filename}',
                'by': 'System',
            }],
        )
        db.session.add(item)
        existing_items[ma_hang] = item
        created += 1

    try:
        db.session.commit()
    except Exception as exc:
        db.session.rollback()
        return jsonify({'error': f'Import XLS that bai: {exc}'}), 500

    return jsonify({
        'msg': 'Imported',
        'created': created,
        'added_nhom_hang': added_nhom,
        'added_quay_nho': added_quay,
        'added_loai_vang': added_loai,
        'added_tuoi_vang': added_tuoi,
        'skipped_existing': skipped_existing,
        'skipped_in_file': skipped_in_file,
        'skipped_total': skipped_existing + skipped_in_file,
        'updated_existing_tuoi_vang': updated_existing_tuoi_vang,
        'duplicate_codes': duplicate_codes,
        'detected_loai_vang': parsed['loai_vang'],
        'detected_tuoi_vang': detected_tuoi_vang,
        'total_rows': len(parsed['items']),
        'sheet_name': parsed['sheet_name'],
    })


@app.route('/api/uploads/<path:filename>')
def uploaded_file(filename):
    return send_from_directory(UPLOAD_FOLDER, filename)
