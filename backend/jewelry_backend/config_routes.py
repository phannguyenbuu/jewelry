import base64
import datetime
import json
import os
import urllib.request
from decimal import Decimal

from flask import jsonify, request, send_from_directory

from .company_bank_accounts import (
    find_company_bank_account,
    list_company_bank_accounts,
    normalize_company_bank_account,
    save_company_bank_accounts,
)
from .state import app, db
from .models import *
from .setup import *
from .utils import *

def ct_json(c):
    return {'id':c.id,'ma_ct':c.ma_ct,'loai_ct':c.loai_ct,'ngay_lap':c.ngay_lap,
            'ngay_hach_toan':c.ngay_hach_toan,'doi_tuong':c.doi_tuong,'mo_ta':c.mo_ta,
            'so_tien':c.so_tien,'thue_suat':c.thue_suat,'trang_thai':c.trang_thai,
            'file_dinh_kem':c.file_dinh_kem or [],'nguoi_lap':c.nguoi_lap,'ngay_tao':c.ngay_tao}


@app.route('/api/chung_tu', methods=['GET'])
def get_chung_tu():
    return jsonify([ct_json(c) for c in ChungTu.query.order_by(ChungTu.id.desc()).all()])


@app.route('/api/chung_tu', methods=['POST'])
def add_chung_tu():
    d = request.json or {}
    ma = d.get('ma_ct') or f"CT{datetime.datetime.now().strftime('%y%m%d%H%M%S')}"
    obj = ChungTu(ma_ct=ma, loai_ct=d.get('loai_ct',''), ngay_lap=d.get('ngay_lap',''),
                  ngay_hach_toan=d.get('ngay_hach_toan',''), doi_tuong=d.get('doi_tuong',''),
                  mo_ta=d.get('mo_ta',''), so_tien=int(d.get('so_tien') or 0),
                  thue_suat=float(d.get('thue_suat') or 0), trang_thai=d.get('trang_thai','Nháp'),
                  nguoi_lap=d.get('nguoi_lap',''), ngay_tao=now_str())
    db.session.add(obj); db.session.commit()
    return jsonify({'msg':'Created','id':obj.id}), 201


@app.route('/api/chung_tu/<int:cid>', methods=['PUT','DELETE'])
def update_chung_tu(cid):
    obj = ChungTu.query.get_or_404(cid)
    if request.method == 'DELETE':
        db.session.delete(obj); db.session.commit(); return jsonify({'msg':'Deleted'})
    d = request.json or {}
    for f in ['loai_ct','ngay_lap','ngay_hach_toan','doi_tuong','mo_ta','trang_thai','nguoi_lap']:
        if f in d: setattr(obj, f, d[f])
    if 'so_tien'   in d: obj.so_tien   = int(d['so_tien'] or 0)
    if 'thue_suat' in d: obj.thue_suat = float(d['thue_suat'] or 0)
    db.session.commit(); return jsonify({'msg':'Updated'})


def nh_json(n):
    count = Item.query.filter_by(nhom_hang=n.ten_nhom).count()
    return {'id':n.id,'ten_nhom':n.ten_nhom,'ma_nhom':n.ma_nhom,
            'mau_sac':n.mau_sac,'mo_ta':n.mo_ta,'thu_tu':n.thu_tu,
            'ngay_tao':n.ngay_tao,'so_hang':count}


@app.route('/api/nhom_hang', methods=['GET'])
def get_nhom_hang():
    return jsonify([nh_json(n) for n in NhomHang.query.order_by(NhomHang.thu_tu, NhomHang.id).all()])


@app.route('/api/nhom_hang', methods=['POST'])
def add_nhom_hang():
    d = request.json or {}
    obj = NhomHang(ten_nhom=d.get('ten_nhom',''), ma_nhom=d.get('ma_nhom',''),
                   mau_sac=d.get('mau_sac','#6366f1'), mo_ta=d.get('mo_ta',''),
                   thu_tu=int(d.get('thu_tu') or 0), ngay_tao=now_str())
    db.session.add(obj); db.session.commit()
    return jsonify({'msg':'Created','id':obj.id}), 201


@app.route('/api/nhom_hang/<int:nid>', methods=['PUT','DELETE'])
def update_nhom_hang(nid):
    obj = NhomHang.query.get_or_404(nid)
    if request.method == 'DELETE':
        db.session.delete(obj); db.session.commit(); return jsonify({'msg':'Deleted'})
    d = request.json or {}
    for f in ['ten_nhom','ma_nhom','mau_sac','mo_ta']:
        if f in d: setattr(obj, f, d[f])
    if 'thu_tu' in d: obj.thu_tu = int(d['thu_tu'] or 0)
    db.session.commit(); return jsonify({'msg':'Updated'})


def tuoi_vang_json(t):
    count = Item.query.filter_by(tuoi_vang=t.ten_tuoi).count()
    return {
        'id': t.id,
        'ten_tuoi': t.ten_tuoi,
        'gia_ban': t.gia_ban or 0,
        'gia_mua': t.gia_mua or 0,
        'trong_luong_rieng': _format_decimal(Decimal(str(t.trong_luong_rieng or 0)), max_decimals=4),
        'ghi_chu': t.ghi_chu,
        'ngay_tao': t.ngay_tao,
        'so_hang': count,
        'lich_su': t.lich_su or [],
    }


def _normalize_trao_doi_tuoi_vang_matrix(value):
    normalized = {}
    if not isinstance(value, dict):
        return normalized
    for raw_key, raw_cell in value.items():
        key = _clean_text(raw_key)
        if not key:
            continue
        cell = raw_cell if isinstance(raw_cell, dict) else {}
        plus = _clean_text(cell.get('plus'))
        minus = _clean_text(cell.get('minus'))
        if not plus and not minus:
            continue
        normalized[key] = {
            'plus': plus,
            'minus': minus,
        }
    return normalized


def _get_or_create_he_thong_cau_hinh(config_key, default_data=None, ghi_chu=''):
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


def trao_doi_tuoi_vang_config_json(obj):
    data = obj.data or {}
    return {
        'matrix': _normalize_trao_doi_tuoi_vang_matrix(data.get('matrix') or {}),
        'ngay_tao': obj.ngay_tao or '',
        'cap_nhat_luc': obj.cap_nhat_luc or '',
    }


@app.route('/api/tuoi_vang', methods=['GET'])
def get_tuoi_vang():
    return jsonify([tuoi_vang_json(t) for t in TuoiVang.query.order_by(TuoiVang.ten_tuoi, TuoiVang.id).all()])


@app.route('/api/tuoi_vang', methods=['POST'])
def add_tuoi_vang():
    d = request.json or {}
    ten_tuoi = d.get('ten_tuoi','').strip()
    if not ten_tuoi:
        return jsonify({'error':'Ten tuoi vang khong hop le'}), 400
    if TuoiVang.query.filter_by(ten_tuoi=ten_tuoi).first():
        return jsonify({'error':'Tuoi vang da ton tai'}), 400
    suggested = _suggest_tuoi_vang_defaults(ten_tuoi)
    obj = TuoiVang(
        ten_tuoi=ten_tuoi,
        gia_ban=_parse_bigint(d.get('gia_ban'), suggested['gia_ban']),
        gia_mua=_parse_bigint(d.get('gia_mua'), suggested['gia_mua']),
        trong_luong_rieng=_parse_float_value(d.get('trong_luong_rieng'), suggested['trong_luong_rieng']),
        ghi_chu=d.get('ghi_chu',''),
        lich_su=[],
        ngay_tao=now_str(),
    )
    db.session.add(obj)
    _sync_loai_vang_from_tuoi_vang_record(obj, record_history=False)
    db.session.commit()
    return jsonify({'msg':'Created','id':obj.id}), 201


@app.route('/api/tuoi_vang/<int:tid>', methods=['PUT','DELETE'])
def update_tuoi_vang(tid):
    obj = TuoiVang.query.get_or_404(tid)
    if request.method == 'DELETE':
        db.session.delete(obj); db.session.commit(); return jsonify({'msg':'Deleted'})
    d = request.json or {}
    old_ten_tuoi = obj.ten_tuoi
    new_ten_tuoi = d.get('ten_tuoi', obj.ten_tuoi).strip()
    if not new_ten_tuoi:
        return jsonify({'error':'Ten tuoi vang khong hop le'}), 400
    existing = TuoiVang.query.filter(TuoiVang.ten_tuoi == new_ten_tuoi, TuoiVang.id != obj.id).first()
    if existing:
        return jsonify({'error':'Tuoi vang da ton tai'}), 400
    suggested = _suggest_tuoi_vang_defaults(new_ten_tuoi)
    old_ban, old_mua = obj.gia_ban or 0, obj.gia_mua or 0
    new_ban = _parse_bigint(d.get('gia_ban'), old_ban)
    new_mua = _parse_bigint(d.get('gia_mua'), old_mua)
    obj.ten_tuoi = new_ten_tuoi
    obj.gia_ban = new_ban
    obj.gia_mua = new_mua
    obj.trong_luong_rieng = _parse_float_value(
        d.get('trong_luong_rieng'),
        obj.trong_luong_rieng or suggested['trong_luong_rieng'],
    )
    obj.ghi_chu = d.get('ghi_chu', obj.ghi_chu)
    if obj.lich_su is None:
        obj.lich_su = []
    if old_ban != new_ban or old_mua != new_mua:
        obj.lich_su.append({
            'date': now_str(),
            'gia_ban': new_ban,
            'gia_mua': new_mua,
            'delta_ban': new_ban - old_ban,
            'delta_mua': new_mua - old_mua,
            'note': d.get('note',''),
            'by': d.get('by','Admin'),
        })
        flag_modified(obj, 'lich_su')
    _sync_loai_vang_from_tuoi_vang_record(obj, old_ten_tuoi=old_ten_tuoi, record_history=True)
    db.session.commit(); return jsonify({'msg':'Updated'})


@app.route('/api/tuoi_vang/clear-history', methods=['POST'])
def clear_all_tuoi_vang_history():
    cleared_tuoi_vang = 0
    cleared_loai_vang = 0

    for obj in TuoiVang.query.order_by(TuoiVang.id).all():
        if obj.lich_su:
            obj.lich_su = []
            flag_modified(obj, 'lich_su')
            cleared_tuoi_vang += 1

    for obj in LoaiVang.query.order_by(LoaiVang.id).all():
        if obj.lich_su:
            obj.lich_su = []
            flag_modified(obj, 'lich_su')
            cleared_loai_vang += 1

    db.session.commit()
    return jsonify({
        'msg': 'Cleared',
        'tuoi_vang': cleared_tuoi_vang,
        'loai_vang': cleared_loai_vang,
    })


@app.route('/api/cau_hinh/trao_doi_tuoi_vang', methods=['GET', 'PUT'])
def cau_hinh_trao_doi_tuoi_vang():
    obj = _get_or_create_he_thong_cau_hinh(
        TRAO_DOI_TUOI_VANG_CONFIG_KEY,
        default_data={'matrix': {}},
        ghi_chu='Bang trao doi theo tuoi vang',
    )
    if request.method == 'GET':
        return jsonify(trao_doi_tuoi_vang_config_json(obj))

    d = request.json or {}
    normalized_matrix = _normalize_trao_doi_tuoi_vang_matrix(d.get('matrix') or {})
    obj.data = {'matrix': normalized_matrix}
    obj.cap_nhat_luc = now_str()
    if not obj.ngay_tao:
        obj.ngay_tao = obj.cap_nhat_luc
    db.session.commit()
    return jsonify(trao_doi_tuoi_vang_config_json(obj))


def _company_bank_account_json(item):
    row = normalize_company_bank_account(item, existing_created_at=_clean_text((item or {}).get('created_at')))
    return {
        'id': row.get('id', ''),
        'bank_code': row.get('bank_code', ''),
        'bank_name': row.get('bank_name', ''),
        'account_no': row.get('account_no', ''),
        'account_name': row.get('account_name', ''),
        'display_name': row.get('display_name', ''),
        'label': row.get('label', ''),
        'max_incoming_amount': row.get('max_incoming_amount', 0),
        'ledger_key': row.get('ledger_key', ''),
        'note': row.get('note', ''),
        'created_at': row.get('created_at', ''),
        'updated_at': row.get('updated_at', ''),
    }


def _validate_company_bank_account_payload(data):
    item = normalize_company_bank_account(data or {})
    if not item.get('bank_code'):
        return None, 'Thiếu mã ngân hàng.'
    if not item.get('bank_name'):
        return None, 'Thiếu tên ngân hàng.'
    if not item.get('account_no'):
        return None, 'Thiếu số tài khoản.'
    return item, None


@app.route('/api/cau_hinh/tai_khoan_ngan_hang', methods=['GET', 'POST'])
def cau_hinh_tai_khoan_ngan_hang():
    obj, accounts = list_company_bank_accounts()
    if request.method == 'GET':
        return jsonify({
            'items': [_company_bank_account_json(item) for item in accounts],
            'ngay_tao': obj.ngay_tao or '',
            'cap_nhat_luc': obj.cap_nhat_luc or '',
        })

    normalized_item, error = _validate_company_bank_account_payload(request.json or {})
    if error:
        return jsonify({'error': error}), 400

    next_accounts = list(accounts)
    next_accounts.append(normalized_item)
    obj, saved_accounts = save_company_bank_accounts(next_accounts)
    db.session.commit()
    created = find_company_bank_account(
        account_id=normalized_item.get('id'),
        account_no=normalized_item.get('account_no'),
    ) or normalized_item
    return jsonify({
        'msg': 'Created',
        'item': _company_bank_account_json(created),
        'items': [_company_bank_account_json(item) for item in saved_accounts],
        'ngay_tao': obj.ngay_tao or '',
        'cap_nhat_luc': obj.cap_nhat_luc or '',
    }), 201


@app.route('/api/cau_hinh/tai_khoan_ngan_hang/<account_id>', methods=['PUT', 'DELETE'])
def update_cau_hinh_tai_khoan_ngan_hang(account_id):
    obj, accounts = list_company_bank_accounts()
    target_id = _clean_text(account_id)
    target = next((item for item in accounts if item.get('id') == target_id), None)
    if not target:
        return jsonify({'error': 'Không tìm thấy tài khoản ngân hàng.'}), 404

    if request.method == 'DELETE':
        next_accounts = [item for item in accounts if item.get('id') != target_id]
        obj, saved_accounts = save_company_bank_accounts(next_accounts)
        db.session.commit()
        return jsonify({
            'msg': 'Deleted',
            'id': target_id,
            'items': [_company_bank_account_json(item) for item in saved_accounts],
            'ngay_tao': obj.ngay_tao or '',
            'cap_nhat_luc': obj.cap_nhat_luc or '',
        })

    payload = dict(request.json or {})
    payload['id'] = target_id
    if not payload.get('created_at'):
        payload['created_at'] = target.get('created_at') or ''
    normalized_item, error = _validate_company_bank_account_payload(payload)
    if error:
        return jsonify({'error': error}), 400

    next_accounts = [
        normalized_item if item.get('id') == target_id else item
        for item in accounts
    ]
    obj, saved_accounts = save_company_bank_accounts(next_accounts)
    db.session.commit()
    updated = next((item for item in saved_accounts if item.get('id') == target_id), normalized_item)
    return jsonify({
        'msg': 'Updated',
        'item': _company_bank_account_json(updated),
        'items': [_company_bank_account_json(item) for item in saved_accounts],
        'ngay_tao': obj.ngay_tao or '',
        'cap_nhat_luc': obj.cap_nhat_luc or '',
    })
