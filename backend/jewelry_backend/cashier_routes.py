import base64
import datetime
import json
import os
import urllib.request
from decimal import Decimal

from flask import jsonify, request, send_from_directory

from .state import app, db
from .models import *
from .catalog_routes import _thu_ngan_json
from .setup import *
from .utils import *

def _parse_vi_datetime(value):
    try:
        return datetime.datetime.strptime(value or '', '%d/%m/%Y %H:%M:%S')
    except Exception:
        return datetime.datetime.min


def _load_thu_ngan_rows():
    kho_map = {k.id: k.ten_kho for k in Kho.query.order_by(Kho.id).all()}
    nhan_vien_map = {n.id: n for n in NhanVien.query.order_by(NhanVien.id).all()}
    quays_by_thu_ngan = {}
    for q in QuayNho.query.order_by(QuayNho.id).all():
        if not q.thu_ngan_id:
            continue
        quays_by_thu_ngan.setdefault(q.thu_ngan_id, []).append(q)
    return [
        _thu_ngan_json(obj, kho_map, nhan_vien_map, quays_by_thu_ngan)
        for obj in ThuNgan.query.order_by(ThuNgan.kho_id, ThuNgan.id).all()
    ]


def _make_thu_ngan_so_quy_detail_row(tuoi_vang='', ton_dau_ky=0, so_du_hien_tai=0, gia_tri_lech=0, row_id='', input_mode=False):
    parser = _parse_thu_ngan_amount_input if input_mode else _parse_bigint
    return {
        'row_id': _clean_text(row_id) or uuid.uuid4().hex,
        'tuoi_vang': _clean_text(tuoi_vang),
        'ton_dau_ky': parser(ton_dau_ky, 0),
        'so_du_hien_tai': parser(so_du_hien_tai, 0),
        'gia_tri_lech': parser(gia_tri_lech, 0),
    }


def _normalize_thu_ngan_so_quy_detail_rows(rows, fallback_so_tien_dau_ngay=0, fallback_so_tien_hien_tai=0, fallback_chenh_lech=None, input_mode=False):
    normalized_rows = []
    changed = False
    fallback_opening = _parse_bigint(fallback_so_tien_dau_ngay, 0)
    fallback_current = _parse_bigint(fallback_so_tien_hien_tai, 0)
    fallback_diff = _parse_bigint(
        fallback_chenh_lech,
        fallback_current - fallback_opening,
    )
    parser = _parse_thu_ngan_amount_input if input_mode else _parse_bigint

    for row in list(rows or []):
        item = dict(row or {})
        original = dict(item)
        ton_dau_ky = parser(
            item.get('ton_dau_ky', item.get('so_tien_dau_ngay')),
            0,
        )
        so_du_hien_tai = parser(
            item.get('so_du_hien_tai', item.get('so_tien_hien_tai')),
            0,
        )
        default_diff = so_du_hien_tai - ton_dau_ky
        raw_diff = item.get('gia_tri_lech', item.get('chenh_lech'))
        normalized_item = _make_thu_ngan_so_quy_detail_row(
            tuoi_vang=item.get('tuoi_vang', ''),
            ton_dau_ky=ton_dau_ky,
            so_du_hien_tai=so_du_hien_tai,
            gia_tri_lech=default_diff if raw_diff in (None, '') else parser(raw_diff, default_diff),
            row_id=item.get('row_id', ''),
            input_mode=False,
        )
        if normalized_item != original:
            changed = True
        normalized_rows.append(normalized_item)

    if not normalized_rows and (fallback_opening or fallback_current or fallback_diff):
        normalized_rows.append(_make_thu_ngan_so_quy_detail_row(
            ton_dau_ky=fallback_opening,
            so_du_hien_tai=fallback_current,
            gia_tri_lech=fallback_diff,
        ))
        changed = True

    return normalized_rows, changed


def _thu_ngan_so_quy_detail_row_json(row):
    item = row or {}
    return {
        'row_id': item.get('row_id') or uuid.uuid4().hex,
        'tuoi_vang': item.get('tuoi_vang') or '',
        'ton_dau_ky': _format_thu_ngan_amount_output(item.get('ton_dau_ky')),
        'so_du_hien_tai': _format_thu_ngan_amount_output(item.get('so_du_hien_tai')),
        'gia_tri_lech': _format_thu_ngan_amount_output(item.get('gia_tri_lech')),
    }


def _sum_thu_ngan_so_quy_detail_rows(rows):
    totals = {'so_tien_dau_ngay': 0, 'so_tien_hien_tai': 0, 'chenh_lech': 0}
    for row in rows or []:
        totals['so_tien_dau_ngay'] += _parse_bigint((row or {}).get('ton_dau_ky'), 0)
        totals['so_tien_hien_tai'] += _parse_bigint((row or {}).get('so_du_hien_tai'), 0)
        totals['chenh_lech'] += _parse_bigint((row or {}).get('gia_tri_lech'), 0)
    return totals


def _sync_thu_ngan_so_quy_detail_totals(obj):
    detail_rows, detail_changed = _normalize_thu_ngan_so_quy_detail_rows(
        obj.chi_tiet or [],
        fallback_so_tien_dau_ngay=obj.so_tien_dau_ngay or 0,
        fallback_so_tien_hien_tai=obj.so_tien_hien_tai or 0,
        fallback_chenh_lech=(obj.so_tien_hien_tai or 0) - (obj.so_tien_dau_ngay or 0),
    )
    changed = detail_changed
    if detail_changed:
        obj.chi_tiet = detail_rows
        flag_modified(obj, 'chi_tiet')
    totals = _sum_thu_ngan_so_quy_detail_rows(detail_rows)
    if int(obj.so_tien_dau_ngay or 0) != totals['so_tien_dau_ngay']:
        obj.so_tien_dau_ngay = totals['so_tien_dau_ngay']
        changed = True
    if int(obj.so_tien_hien_tai or 0) != totals['so_tien_hien_tai']:
        obj.so_tien_hien_tai = totals['so_tien_hien_tai']
        changed = True
    return changed


def thu_ngan_so_quy_row_json(cashier, obj, ngay=None):
    chi_tiet = []
    if obj:
        chi_tiet, _ = _normalize_thu_ngan_so_quy_detail_rows(
            obj.chi_tiet or [],
            fallback_so_tien_dau_ngay=obj.so_tien_dau_ngay or 0,
            fallback_so_tien_hien_tai=obj.so_tien_hien_tai or 0,
            fallback_chenh_lech=(obj.so_tien_hien_tai or 0) - (obj.so_tien_dau_ngay or 0),
        )
    totals = _sum_thu_ngan_so_quy_detail_rows(chi_tiet)
    so_tien_dau_ngay = totals['so_tien_dau_ngay'] if chi_tiet else (obj.so_tien_dau_ngay if obj else 0)
    so_tien_hien_tai = totals['so_tien_hien_tai'] if chi_tiet else (obj.so_tien_hien_tai if obj else 0)
    chenh_lech = totals['chenh_lech'] if chi_tiet else (so_tien_hien_tai - so_tien_dau_ngay)
    return {
        'id': obj.id if obj else None,
        'ngay': obj.ngay if obj else (ngay or today_iso()),
        'thu_ngan_id': cashier['id'],
        'ten_thu_ngan': cashier.get('ten_thu_ngan', ''),
        'kho_id': cashier.get('kho_id'),
        'ten_kho': cashier.get('ten_kho', ''),
        'nhan_vien_id': cashier.get('nhan_vien_id'),
        'nguoi_quan_ly': cashier.get('nguoi_quan_ly', ''),
        'quay_ids': cashier.get('quay_ids', []),
        'quays': cashier.get('quays', []),
        'so_quay': cashier.get('so_quay', 0),
        'so_tien_dau_ngay': _format_thu_ngan_amount_output(so_tien_dau_ngay),
        'so_tien_hien_tai': _format_thu_ngan_amount_output(so_tien_hien_tai),
        'chenh_lech': _format_thu_ngan_amount_output(chenh_lech),
        'chi_tiet': [_thu_ngan_so_quy_detail_row_json(item) for item in chi_tiet],
        'lich_su_chot': (obj.lich_su_chot or []) if obj else [],
        'ghi_chu': (obj.ghi_chu or '') if obj else '',
        'ngay_tao': (obj.ngay_tao or '') if obj else '',
        'cap_nhat_luc': (obj.cap_nhat_luc or '') if obj else '',
    }


def _get_or_create_thu_ngan_so_quy_row(ngay, thu_ngan_id):
    obj = ThuNganSoQuyTheoNguoi.query.filter_by(ngay=ngay, thu_ngan_id=thu_ngan_id).first()
    if obj:
        return obj
    obj = ThuNganSoQuyTheoNguoi(
        ngay=ngay,
        thu_ngan_id=thu_ngan_id,
        so_tien_dau_ngay=0,
        so_tien_hien_tai=0,
        chi_tiet=[],
        lich_su_chot=[],
        ghi_chu='',
        ngay_tao=now_str(),
        cap_nhat_luc=now_str(),
    )
    db.session.add(obj)
    db.session.flush()
    return obj


def _normalize_thu_ngan_so_quy_history_entries(entries, fallback_so_tien_dau_ngay=0, fallback_so_tien_hien_tai=0, fallback_chenh_lech=None):
    normalized_entries = []
    changed = False
    fallback_value = _parse_bigint(fallback_so_tien_dau_ngay, 0)
    fallback_current = _parse_bigint(fallback_so_tien_hien_tai, 0)
    fallback_diff = _parse_bigint(fallback_chenh_lech, fallback_current - fallback_value)

    first_known = None
    for entry in list(entries or []):
        raw_so_tien_dau_ngay = (entry or {}).get('so_tien_dau_ngay')
        if raw_so_tien_dau_ngay is None or _clean_text(raw_so_tien_dau_ngay) == '':
            continue
        first_known = _parse_bigint(raw_so_tien_dau_ngay, fallback_value)
        break
    last_known = fallback_value if first_known is None else first_known

    for entry in list(entries or []):
        item = dict(entry or {})
        original = dict(item)

        if not _clean_text(item.get('entry_id')):
            item['entry_id'] = uuid.uuid4().hex

        raw_so_tien_dau_ngay = item.get('so_tien_dau_ngay')
        if raw_so_tien_dau_ngay is None or _clean_text(raw_so_tien_dau_ngay) == '':
            item['so_tien_dau_ngay'] = last_known
        else:
            item['so_tien_dau_ngay'] = _parse_bigint(raw_so_tien_dau_ngay, last_known)

        item['so_tien'] = _parse_bigint(item.get('so_tien'), 0)
        item['so_tien_chenh_lech'] = _parse_bigint(
            item.get('so_tien_chenh_lech', item.get('chenh_lech')),
            item['so_tien'] - item['so_tien_dau_ngay'],
        )
        detail_rows, detail_changed = _normalize_thu_ngan_so_quy_detail_rows(
            item.get('chi_tiet') or [],
            fallback_so_tien_dau_ngay=item['so_tien_dau_ngay'],
            fallback_so_tien_hien_tai=item['so_tien'],
            fallback_chenh_lech=item['so_tien_chenh_lech'],
        )
        if detail_rows:
            detail_totals = _sum_thu_ngan_so_quy_detail_rows(detail_rows)
            item['so_tien_dau_ngay'] = detail_totals['so_tien_dau_ngay']
            item['so_tien'] = detail_totals['so_tien_hien_tai']
            item['so_tien_chenh_lech'] = detail_totals['chenh_lech']
        elif not item.get('chi_tiet') and (fallback_value or fallback_current or fallback_diff):
            item['so_tien_chenh_lech'] = _parse_bigint(item.get('so_tien_chenh_lech'), fallback_diff)
        item['chi_tiet'] = detail_rows
        item['ghi_chu'] = item.get('ghi_chu') or ''
        item['thoi_gian'] = item.get('thoi_gian') or ''
        last_known = item['so_tien_dau_ngay']

        if item != original or detail_changed:
            changed = True
        normalized_entries.append(item)
    return normalized_entries, changed


def _sync_thu_ngan_so_quy_from_history(obj):
    entries, history_changed = _normalize_thu_ngan_so_quy_history_entries(
        obj.lich_su_chot or [],
        fallback_so_tien_dau_ngay=obj.so_tien_dau_ngay or 0,
        fallback_so_tien_hien_tai=obj.so_tien_hien_tai or 0,
        fallback_chenh_lech=(obj.so_tien_hien_tai or 0) - (obj.so_tien_dau_ngay or 0),
    )
    changed = history_changed
    if history_changed:
        obj.lich_su_chot = entries
        flag_modified(obj, 'lich_su_chot')
    if entries:
        latest = entries[0]
        latest_so_tien_dau_ngay = _parse_bigint(latest.get('so_tien_dau_ngay'), 0)
        latest_so_tien = _parse_bigint(latest.get('so_tien'), 0)
        latest_chi_tiet, _ = _normalize_thu_ngan_so_quy_detail_rows(
            latest.get('chi_tiet') or [],
            fallback_so_tien_dau_ngay=latest_so_tien_dau_ngay,
            fallback_so_tien_hien_tai=latest_so_tien,
            fallback_chenh_lech=latest.get('so_tien_chenh_lech'),
        )
        latest_ghi_chu = latest.get('ghi_chu') or ''
        latest_cap_nhat_luc = latest.get('thoi_gian') or now_str()
        if int(obj.so_tien_dau_ngay or 0) != latest_so_tien_dau_ngay:
            obj.so_tien_dau_ngay = latest_so_tien_dau_ngay
            changed = True
        if int(obj.so_tien_hien_tai or 0) != latest_so_tien:
            obj.so_tien_hien_tai = latest_so_tien
            changed = True
        if (obj.chi_tiet or []) != latest_chi_tiet:
            obj.chi_tiet = latest_chi_tiet
            flag_modified(obj, 'chi_tiet')
            changed = True
        if (obj.ghi_chu or '') != latest_ghi_chu:
            obj.ghi_chu = latest_ghi_chu
            changed = True
        if (obj.cap_nhat_luc or '') != latest_cap_nhat_luc:
            obj.cap_nhat_luc = latest_cap_nhat_luc
            changed = True
        return changed
    if int(obj.so_tien_dau_ngay or 0) != 0:
        obj.so_tien_dau_ngay = 0
        changed = True
    if int(obj.so_tien_hien_tai or 0) != 0:
        obj.so_tien_hien_tai = 0
        changed = True
    if obj.chi_tiet:
        obj.chi_tiet = []
        flag_modified(obj, 'chi_tiet')
        changed = True
    if obj.ghi_chu:
        obj.ghi_chu = ''
        changed = True
    obj.cap_nhat_luc = now_str()
    return True


def _find_thu_ngan_history_index(entries, entry_id='', thoi_gian='', so_tien_dau_ngay=0, so_tien=0, ghi_chu=''):
    normalized_entry_id = _clean_text(entry_id)
    for index, entry in enumerate(entries):
        if normalized_entry_id and _clean_text(entry.get('entry_id')) == normalized_entry_id:
            return index
        if (
            _clean_text(entry.get('thoi_gian')) == _clean_text(thoi_gian)
            and int(entry.get('so_tien_dau_ngay') or 0) == int(so_tien_dau_ngay or 0)
            and int(entry.get('so_tien') or 0) == int(so_tien or 0)
            and _clean_text(entry.get('ghi_chu')) == _clean_text(ghi_chu)
        ):
            return index
    return -1


def _build_thu_ngan_so_quy_payload(ngay):
    cashiers = _load_thu_ngan_rows()
    record_map = {
        row.thu_ngan_id: row
        for row in ThuNganSoQuyTheoNguoi.query.filter_by(ngay=ngay).all()
    }
    payload_changed = False
    rows = []
    for cashier in cashiers:
        record = record_map.get(cashier['id'])
        if record:
            payload_changed = _sync_thu_ngan_so_quy_detail_totals(record) or payload_changed
        rows.append(thu_ngan_so_quy_row_json(cashier, record, ngay=ngay))

    history = []
    for row in rows:
        for entry in row.get('lich_su_chot', []):
            entry_chi_tiet, _ = _normalize_thu_ngan_so_quy_detail_rows(
                entry.get('chi_tiet') or [],
                fallback_so_tien_dau_ngay=entry.get('so_tien_dau_ngay', 0),
                fallback_so_tien_hien_tai=entry.get('so_tien', 0),
                fallback_chenh_lech=entry.get('so_tien_chenh_lech', 0),
            )
            history.append({
                'entry_id': entry.get('entry_id') or '',
                'thu_ngan_id': row['thu_ngan_id'],
                'ten_thu_ngan': row['ten_thu_ngan'],
                'ten_kho': row['ten_kho'],
                'thoi_gian': entry.get('thoi_gian', ''),
                'so_tien_dau_ngay': _format_thu_ngan_amount_output(entry.get('so_tien_dau_ngay', 0)),
                'so_tien': _format_thu_ngan_amount_output(entry.get('so_tien', 0)),
                'so_tien_chenh_lech': _format_thu_ngan_amount_output(entry.get('so_tien_chenh_lech', 0)),
                'chi_tiet': [_thu_ngan_so_quy_detail_row_json(item) for item in entry_chi_tiet],
                'so_dong_chi_tiet': len(entry_chi_tiet),
                'ghi_chu': entry.get('ghi_chu', ''),
            })
    history.sort(key=lambda item: _parse_vi_datetime(item.get('thoi_gian')), reverse=True)
    if payload_changed:
        db.session.commit()
    return {'ngay': ngay, 'rows': rows, 'history': history}


@app.route('/api/thu_ngan_so_quy', methods=['GET'])
def get_thu_ngan_so_quy():
    ngay = (request.args.get('ngay') or '').strip() or today_iso()
    return jsonify(_build_thu_ngan_so_quy_payload(ngay))


@app.route('/api/thu_ngan_so_quy', methods=['PUT'])
def save_thu_ngan_so_quy():
    d = request.json or {}
    ngay = str(d.get('ngay') or '').strip() or today_iso()
    thu_ngan_id = _parse_int_id(d.get('thu_ngan_id'))
    if thu_ngan_id is None:
        return jsonify({'error': 'Thiếu thu ngân cần lưu.'}), 400
    if not ThuNgan.query.get(thu_ngan_id):
        return jsonify({'error': 'Thu ngân không tồn tại.'}), 404
    obj = _get_or_create_thu_ngan_so_quy_row(ngay, thu_ngan_id)
    if 'chi_tiet' in d:
        obj.chi_tiet, _ = _normalize_thu_ngan_so_quy_detail_rows(d.get('chi_tiet') or [], input_mode=True)
        flag_modified(obj, 'chi_tiet')
        detail_totals = _sum_thu_ngan_so_quy_detail_rows(obj.chi_tiet or [])
        obj.so_tien_dau_ngay = detail_totals['so_tien_dau_ngay']
        obj.so_tien_hien_tai = detail_totals['so_tien_hien_tai']
    else:
        if 'so_tien_dau_ngay' in d:
            obj.so_tien_dau_ngay = _parse_thu_ngan_amount_input(d.get('so_tien_dau_ngay'), 0)
        if 'so_tien_hien_tai' in d:
            obj.so_tien_hien_tai = _parse_thu_ngan_amount_input(d.get('so_tien_hien_tai'), 0)
        _sync_thu_ngan_so_quy_detail_totals(obj)
    if 'ghi_chu' in d:
        obj.ghi_chu = d.get('ghi_chu') or ''
    obj.cap_nhat_luc = now_str()
    db.session.commit()
    return jsonify(_build_thu_ngan_so_quy_payload(ngay))


@app.route('/api/thu_ngan_so_quy/chot', methods=['POST'])
def chot_thu_ngan_so_quy():
    d = request.json or {}
    ngay = str(d.get('ngay') or '').strip() or today_iso()
    thu_ngan_id = _parse_int_id(d.get('thu_ngan_id'))
    if thu_ngan_id is None:
        return jsonify({'error': 'Thiếu thu ngân cần chốt.'}), 400
    if not ThuNgan.query.get(thu_ngan_id):
        return jsonify({'error': 'Thu ngân không tồn tại.'}), 404

    obj = _get_or_create_thu_ngan_so_quy_row(ngay, thu_ngan_id)
    chi_tiet_source = d.get('chi_tiet') if 'chi_tiet' in d else (obj.chi_tiet or [])
    chi_tiet, _ = _normalize_thu_ngan_so_quy_detail_rows(chi_tiet_source or [], input_mode=('chi_tiet' in d))
    detail_totals = _sum_thu_ngan_so_quy_detail_rows(chi_tiet)
    so_tien_dau_ngay = detail_totals['so_tien_dau_ngay'] if 'chi_tiet' in d else _parse_thu_ngan_amount_input(d.get('so_tien_dau_ngay'), 0)
    so_tien_hien_tai = detail_totals['so_tien_hien_tai'] if 'chi_tiet' in d else _parse_thu_ngan_amount_input(d.get('so_tien_hien_tai'), 0)
    so_tien_chenh_lech = detail_totals['chenh_lech'] if 'chi_tiet' in d else (so_tien_hien_tai - so_tien_dau_ngay)
    ghi_chu = d.get('ghi_chu') or ''

    obj.so_tien_dau_ngay = so_tien_dau_ngay
    obj.so_tien_hien_tai = so_tien_hien_tai
    obj.chi_tiet = chi_tiet
    obj.ghi_chu = ghi_chu
    flag_modified(obj, 'chi_tiet')
    if not obj.lich_su_chot:
        obj.lich_su_chot = []
    obj.lich_su_chot.insert(0, {
        'entry_id': uuid.uuid4().hex,
        'thoi_gian': now_str(),
        'so_tien_dau_ngay': so_tien_dau_ngay,
        'so_tien': so_tien_hien_tai,
        'so_tien_chenh_lech': so_tien_chenh_lech,
        'chi_tiet': chi_tiet,
        'ghi_chu': ghi_chu,
    })
    flag_modified(obj, 'lich_su_chot')
    obj.cap_nhat_luc = now_str()
    db.session.commit()
    return jsonify(_build_thu_ngan_so_quy_payload(ngay))


@app.route('/api/thu_ngan_so_quy/history/delete', methods=['POST'])
def delete_thu_ngan_so_quy_history():
    d = request.json or {}
    ngay = str(d.get('ngay') or '').strip() or today_iso()
    thu_ngan_id = _parse_int_id(d.get('thu_ngan_id'))
    if thu_ngan_id is None:
        return jsonify({'error': 'Thiếu thu ngân cần xóa lịch sử.'}), 400

    obj = ThuNganSoQuyTheoNguoi.query.filter_by(ngay=ngay, thu_ngan_id=thu_ngan_id).first()
    if not obj:
        return jsonify({'error': 'Không tìm thấy bản ghi thu ngân trong ngày này.'}), 404

    entries = list(obj.lich_su_chot or [])
    target_index = _find_thu_ngan_history_index(
        entries,
        entry_id=d.get('entry_id') or '',
        thoi_gian=d.get('thoi_gian') or '',
        so_tien_dau_ngay=_parse_thu_ngan_amount_input(d.get('so_tien_dau_ngay'), 0),
        so_tien=_parse_thu_ngan_amount_input(d.get('so_tien'), 0),
        ghi_chu=d.get('ghi_chu') or '',
    )
    if target_index < 0:
        return jsonify({'error': 'Không tìm thấy dòng lịch sử cần xóa.'}), 404

    entries.pop(target_index)
    obj.lich_su_chot = entries
    flag_modified(obj, 'lich_su_chot')
    obj.cap_nhat_luc = now_str()
    db.session.commit()
    return jsonify(_build_thu_ngan_so_quy_payload(ngay))


@app.route('/api/thu_ngan_so_quy/reset_all', methods=['POST'])
def reset_all_thu_ngan_so_quy():
    d = request.json or {}
    ngay = str(d.get('ngay') or '').strip() or today_iso()
    rows = ThuNganSoQuyTheoNguoi.query.filter_by(ngay=ngay).all()
    for obj in rows:
        db.session.delete(obj)
    db.session.commit()
    return jsonify(_build_thu_ngan_so_quy_payload(ngay))
