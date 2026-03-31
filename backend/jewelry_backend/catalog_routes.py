import base64
import datetime
import json
import os
import urllib.request
from decimal import Decimal

from flask import jsonify, request, send_from_directory

from .state import app, db
from .models import *
from .setup import *
from .utils import *

def _thu_ngan_json(obj, kho_map=None, nhan_vien_map=None, quays_by_thu_ngan=None):
    kho_map = kho_map or {}
    nhan_vien_map = nhan_vien_map or {}
    quays = list((quays_by_thu_ngan or {}).get(obj.id, []))
    manager = nhan_vien_map.get(obj.nhan_vien_id)
    return {
        'id': obj.id,
        'ten_thu_ngan': obj.ten_thu_ngan,
        'kho_id': obj.kho_id,
        'ten_kho': kho_map.get(obj.kho_id, ''),
        'nhan_vien_id': obj.nhan_vien_id,
        'nguoi_quan_ly': manager.ho_ten if manager else '',
        'ghi_chu': obj.ghi_chu or '',
        'ngay_tao': obj.ngay_tao or '',
        'quay_ids': [q.id for q in quays],
        'quays': [{'id': q.id, 'ten_quay': q.ten_quay} for q in quays],
        'so_quay': len(quays),
    }


def _save_thu_ngan_record(obj, data, is_new=False):
    ten_thu_ngan = str((data or {}).get('ten_thu_ngan') or '').strip()
    if not ten_thu_ngan:
        return None, ('Thiếu tên thu ngân.', 400)

    kho_id = _parse_int_id((data or {}).get('kho_id'))
    if kho_id is None:
        return None, ('Thiếu kho quản lý.', 400)
    kho = Kho.query.get(kho_id)
    if not kho:
        return None, ('Kho không tồn tại.', 404)

    nhan_vien_id = _parse_int_id((data or {}).get('nhan_vien_id'))
    if nhan_vien_id is not None and not NhanVien.query.get(nhan_vien_id):
        return None, ('Nhân sự quản lý không tồn tại.', 404)

    quay_ids = _normalize_quay_ids((data or {}).get('quay_ids'))
    assigned_quays = []
    if quay_ids:
        assigned_quays = QuayNho.query.filter(QuayNho.id.in_(quay_ids)).all()
        found_ids = {q.id for q in assigned_quays}
        missing_ids = [qid for qid in quay_ids if qid not in found_ids]
        if missing_ids:
            return None, (f'Quầy nhỏ không tồn tại: {", ".join(str(qid) for qid in missing_ids)}.', 404)
        wrong_kho = [q.ten_quay for q in assigned_quays if q.kho_id != kho.id]
        if wrong_kho:
            return None, (f'Quầy nhỏ không thuộc kho đã chọn: {", ".join(wrong_kho)}.', 400)

    obj.ten_thu_ngan = ten_thu_ngan
    obj.kho_id = kho.id
    obj.nhan_vien_id = nhan_vien_id
    obj.ghi_chu = (data or {}).get('ghi_chu', obj.ghi_chu or '')
    if is_new and not obj.ngay_tao:
        obj.ngay_tao = now_str()

    db.session.add(obj)
    db.session.flush()

    QuayNho.query.filter_by(thu_ngan_id=obj.id).update({'thu_ngan_id': None}, synchronize_session=False)
    for quay in assigned_quays:
        quay.thu_ngan_id = obj.id

    db.session.commit()
    return obj, None


def _resolve_thu_ngan_for_quay(kho_id, thu_ngan_id):
    if thu_ngan_id is None:
        return None, None
    thu_ngan = ThuNgan.query.get(thu_ngan_id)
    if not thu_ngan:
        return None, ('Thu ngân không tồn tại.', 404)
    if thu_ngan.kho_id != kho_id:
        return None, ('Thu ngân không thuộc kho đã chọn.', 400)
    return thu_ngan, None


@app.route('/api/kho', methods=['GET'])
def get_kho():
    return jsonify([{'id':k.id,'ten_kho':k.ten_kho,'dia_chi':k.dia_chi,'ghi_chu':k.ghi_chu,
                     'nguoi_phu_trach':k.nguoi_phu_trach or '','ngay_tao':k.ngay_tao or ''}
                    for k in Kho.query.order_by(Kho.id).all()])


@app.route('/api/kho', methods=['POST'])
def add_kho():
    d = request.json or {}
    k = Kho(ten_kho=d.get('ten_kho',''), dia_chi=d.get('dia_chi',''), ghi_chu=d.get('ghi_chu',''),
            nguoi_phu_trach=d.get('nguoi_phu_trach',''), ngay_tao=now_str())
    db.session.add(k); db.session.commit()
    return jsonify({'msg':'Created','id':k.id})


@app.route('/api/kho/<int:kid>', methods=['PUT','DELETE'])
def update_kho(kid):
    k = Kho.query.get_or_404(kid)
    if request.method == 'DELETE':
        if _is_default_kho_name(k.ten_kho):
            return jsonify({'error':'Không thể xóa Kho Tổng mặc định.'}), 400
        default_kho = _get_or_create_default_kho()
        child_cashiers = ThuNgan.query.filter_by(kho_id=k.id).all()
        child_cashier_ids = [obj.id for obj in child_cashiers]
        if child_cashier_ids:
            QuayNho.query.filter(QuayNho.thu_ngan_id.in_(child_cashier_ids)).update({'thu_ngan_id': None}, synchronize_session=False)
            for obj in child_cashiers:
                db.session.delete(obj)
        for q in QuayNho.query.filter_by(kho_id=k.id).all():
            q.kho_id = default_kho.id
            q.thu_ngan_id = None
        db.session.delete(k)
        db.session.commit()
        return jsonify({'msg':'Deleted'})
    d = request.json or {}
    k.ten_kho         = d.get('ten_kho', k.ten_kho)
    k.dia_chi         = d.get('dia_chi', k.dia_chi)
    k.ghi_chu         = d.get('ghi_chu', k.ghi_chu)
    k.nguoi_phu_trach = d.get('nguoi_phu_trach', k.nguoi_phu_trach or '')
    db.session.commit(); return jsonify({'msg':'Updated'})


@app.route('/api/thu_ngan', methods=['GET'])
def get_thu_ngan():
    kho_map = {k.id: k.ten_kho for k in Kho.query.order_by(Kho.id).all()}
    nhan_vien_map = {n.id: n for n in NhanVien.query.order_by(NhanVien.id).all()}
    quays_by_thu_ngan = {}
    for q in QuayNho.query.order_by(QuayNho.id).all():
        if not q.thu_ngan_id:
            continue
        quays_by_thu_ngan.setdefault(q.thu_ngan_id, []).append(q)
    return jsonify([
        _thu_ngan_json(obj, kho_map, nhan_vien_map, quays_by_thu_ngan)
        for obj in ThuNgan.query.order_by(ThuNgan.kho_id, ThuNgan.id).all()
    ])


@app.route('/api/thu_ngan', methods=['POST'])
def add_thu_ngan():
    obj, error = _save_thu_ngan_record(ThuNgan(), request.json or {}, is_new=True)
    if error:
        return jsonify({'error': error[0]}), error[1]
    return jsonify({'msg':'Created','id':obj.id})


@app.route('/api/thu_ngan/<int:tid>', methods=['PUT','DELETE'])
def update_thu_ngan(tid):
    obj = ThuNgan.query.get_or_404(tid)
    if request.method == 'DELETE':
        QuayNho.query.filter_by(thu_ngan_id=obj.id).update({'thu_ngan_id': None}, synchronize_session=False)
        db.session.delete(obj)
        db.session.commit()
        return jsonify({'msg':'Deleted'})
    saved, error = _save_thu_ngan_record(obj, request.json or {}, is_new=False)
    if error:
        return jsonify({'error': error[0]}), error[1]
    return jsonify({'msg':'Updated','id':saved.id})


@app.route('/api/quay_nho', methods=['GET'])
def get_quay():
    kho_map = {k.id: k.ten_kho for k in Kho.query.all()}
    thu_ngan_map = {t.id: t.ten_thu_ngan for t in ThuNgan.query.all()}
    return jsonify([{'id':q.id,'ten_quay':q.ten_quay,'kho_id':q.kho_id,
                     'ten_kho':kho_map.get(q.kho_id,''),'ghi_chu':q.ghi_chu,
                     'nguoi_phu_trach':q.nguoi_phu_trach or '','ngay_tao':q.ngay_tao or '',
                     'thu_ngan_id':q.thu_ngan_id,'ten_thu_ngan':thu_ngan_map.get(q.thu_ngan_id,'')}
                    for q in QuayNho.query.order_by(QuayNho.id).all()])


@app.route('/api/quay_nho', methods=['POST'])
def add_quay():
    d = request.json or {}
    kho_id = _parse_int_id(d.get('kho_id')) or _get_or_create_default_kho().id
    thu_ngan_id = _parse_int_id(d.get('thu_ngan_id'))
    thu_ngan, error = _resolve_thu_ngan_for_quay(kho_id, thu_ngan_id)
    if error:
        return jsonify({'error': error[0]}), error[1]
    q = QuayNho(ten_quay=d.get('ten_quay',''), kho_id=kho_id, ghi_chu=d.get('ghi_chu',''),
                nguoi_phu_trach=d.get('nguoi_phu_trach',''), ngay_tao=now_str(),
                thu_ngan_id=thu_ngan.id if thu_ngan else None)
    db.session.add(q); db.session.commit()
    return jsonify({'msg':'Created','id':q.id})


@app.route('/api/quay_nho/<int:qid>', methods=['PUT','DELETE'])
def update_quay(qid):
    q = QuayNho.query.get_or_404(qid)
    if request.method == 'DELETE':
        db.session.delete(q); db.session.commit(); return jsonify({'msg':'Deleted'})
    d = request.json or {}
    new_kho_id = _parse_int_id(d.get('kho_id')) or _get_or_create_default_kho().id
    next_thu_ngan_id = q.thu_ngan_id
    if 'thu_ngan_id' in d:
        next_thu_ngan_id = _parse_int_id(d.get('thu_ngan_id'))
    elif next_thu_ngan_id:
        assigned_cashier = ThuNgan.query.get(next_thu_ngan_id)
        if not assigned_cashier or assigned_cashier.kho_id != new_kho_id:
            next_thu_ngan_id = None
    thu_ngan, error = _resolve_thu_ngan_for_quay(new_kho_id, next_thu_ngan_id)
    if error:
        return jsonify({'error': error[0]}), error[1]
    q.ten_quay          = d.get('ten_quay', q.ten_quay)
    q.kho_id            = new_kho_id
    q.ghi_chu           = d.get('ghi_chu', q.ghi_chu)
    q.nguoi_phu_trach   = d.get('nguoi_phu_trach', q.nguoi_phu_trach or '')
    q.thu_ngan_id       = thu_ngan.id if thu_ngan else None
    db.session.commit(); return jsonify({'msg':'Updated'})


def vang_json(v):
    return {'id':v.id,'ma_loai':v.ma_loai,'ten_loai':v.ten_loai,
            'gia_ban':v.gia_ban,'gia_mua':v.gia_mua,'sjc_key':v.sjc_key or '',
            'nguoi_phu_trach':v.nguoi_phu_trach or '','ngay_tao':v.ngay_tao or '',
            'lich_su':v.lich_su or []}


@app.route('/api/loai_vang', methods=['GET'])
def get_loai_vang():
    return jsonify([vang_json(v) for v in LoaiVang.query.order_by(LoaiVang.id).all()])


@app.route('/api/loai_vang', methods=['POST'])
def add_loai_vang():
    d = request.json or {}
    v = LoaiVang(ma_loai=d.get('ma_loai',''), ten_loai=d.get('ten_loai',''),
                 gia_ban=int(d.get('gia_ban') or 0), gia_mua=int(d.get('gia_mua') or 0),
                 sjc_key=d.get('sjc_key',''),
                 nguoi_phu_trach=d.get('nguoi_phu_trach',''), ngay_tao=now_str())
    db.session.add(v)
    _sync_tuoi_vang_from_loai_vang_record(v, record_history=False)
    db.session.commit()
    return jsonify({'msg':'Created','id':v.id})


@app.route('/api/loai_vang/auto-map-sjc', methods=['POST'])
def auto_map_loai_vang_sjc():
    d = request.json or {}
    updates = _auto_map_loai_vang_sjc_keys(force=bool(d.get('force', True)))
    return jsonify({'updated': len(updates), 'items': updates})


@app.route('/api/loai_vang/<int:vid>', methods=['PUT','DELETE'])
def update_loai_vang(vid):
    v = LoaiVang.query.get_or_404(vid)
    if request.method == 'DELETE':
        db.session.delete(v); db.session.commit(); return jsonify({'msg':'Deleted'})
    d = request.json or {}
    old_ma_loai = v.ma_loai
    old_ten_loai = v.ten_loai
    old_sjc_key = v.sjc_key or ''
    old_ban, old_mua = v.gia_ban, v.gia_mua
    new_ban = int(d.get('gia_ban') or old_ban)
    new_mua = int(d.get('gia_mua') or old_mua)
    v.ma_loai           = d.get('ma_loai',  v.ma_loai)
    v.ten_loai          = d.get('ten_loai', v.ten_loai)
    v.sjc_key           = d.get('sjc_key',  v.sjc_key or '')
    v.nguoi_phu_trach   = d.get('nguoi_phu_trach', v.nguoi_phu_trach or '')
    v.gia_ban  = new_ban
    v.gia_mua  = new_mua
    if not v.lich_su: v.lich_su = []
    if old_ban != new_ban or old_mua != new_mua:
        v.lich_su.append({
            'date': now_str(), 'gia_ban': new_ban, 'gia_mua': new_mua,
            'delta_ban': new_ban - old_ban, 'delta_mua': new_mua - old_mua,
            'note': d.get('note',''), 'by': d.get('by','Admin'),
        })
        flag_modified(v,'lich_su')
    _sync_tuoi_vang_from_loai_vang_record(
        v,
        old_ma_loai=old_ma_loai,
        old_ten_loai=old_ten_loai,
        old_sjc_key=old_sjc_key,
        record_history=True,
    )
    db.session.commit()
    return jsonify({'msg':'Updated'})


@app.route('/api/sjc-price', methods=['GET'])
def get_sjc_price():
    try:
        import requests as req

        headers = {
            'User-Agent':       'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0',
            'Referer':          'https://sjc.com.vn/',
            'X-Requested-With': 'XMLHttpRequest',
        }
        r = req.get('https://sjc.com.vn/GoldPrice/Services/PriceService.ashx',
                    headers=headers, timeout=15)
        j = r.json()
        if not j.get('success'):
            return jsonify({'error': 'SJC API không thành công'}), 502

        timestamp = j.get('latestDate', '')
        # Lọc chỉ lấy Hồ Chí Minh
        hcm_rows = []
        for item in j.get('data', []):
            if item.get('BranchName','') != 'Hồ Chí Minh':
                continue
            hcm_rows.append({
                'loai': item['TypeName'],
                'mua':  item['Buy'],    # chuỗi "173,100" (ngàn đồng/lượng)
                'ban':  item['Sell'],
            })
        return jsonify({'timestamp': timestamp, 'rows': hcm_rows, 'fetched_at': now_str()})

    except Exception as e:
        return jsonify({'error': str(e)}), 500
