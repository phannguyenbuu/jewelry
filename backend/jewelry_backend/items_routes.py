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

@app.route('/api/items', methods=['GET'])
def get_items():
    return jsonify([_item_json(it) for it in Item.query.order_by(Item.id).all()])


@app.route('/api/items', methods=['POST'])
def add_item():
    d = request.json or {}
    it = Item(
        ma_hang=d.get('ma_hang',''), ncc=d.get('ncc',''),
        nhom_hang=d.get('nhom_hang',''), quay_nho=d.get('quay_nho',''),
        cong_le=d.get('cong_le',''), cong_si=d.get('cong_si',''),
        tong_tl=d.get('tong_tl',''), tl_da=d.get('tl_da',''), tl_vang=d.get('tl_vang',''),
        loai_vang=d.get('loai_vang',''), tuoi_vang=d.get('tuoi_vang',''), status=d.get('status','Tồn kho'),
        images=d.get('images',[]), certificates=d.get('certificates',[]),
        history=[{'date': now_str(), 'action': f"Nhập kho: {d.get('quay_nho')}", 'by': 'Admin'}],
        gia_vang_mua=int(d.get('gia_vang_mua') or 0),
        gia_hat=int(d.get('gia_hat') or 0),
        gia_nhan_cong=int(d.get('gia_nhan_cong') or 0),
        dieu_chinh=int(d.get('dieu_chinh') or 0),
    )
    db.session.add(it); db.session.commit()
    return jsonify({'msg': 'Created', 'id': it.id})


@app.route('/api/items/<int:item_id>', methods=['PUT','DELETE'])
def update_item(item_id):
    it = Item.query.get_or_404(item_id)
    if request.method == 'DELETE':
        db.session.delete(it); db.session.commit(); return jsonify({'msg': 'Deleted'})
    d = request.json or {}
    old_wh, new_wh = it.quay_nho, d.get('quay_nho', it.quay_nho)
    old_st, new_st = it.status,   d.get('status',   it.status)
    for f in ['ma_hang','ncc','nhom_hang','quay_nho','cong_le','cong_si',
              'tong_tl','tl_da','tl_vang','loai_vang','tuoi_vang','status']:
        setattr(it, f, d.get(f, getattr(it, f)))
    # Giá mua
    for f in ['gia_vang_mua','gia_hat','gia_nhan_cong','dieu_chinh']:
        if f in d: setattr(it, f, int(d[f] or 0))
    if d.get('images')       is not None: it.images = d['images'];       flag_modified(it,'images')
    if d.get('certificates') is not None: it.certificates = d['certificates']; flag_modified(it,'certificates')
    if not it.history: it.history = []
    if old_wh != new_wh:
        it.history.append({'date': now_str(), 'action': f"Luân chuyển: {old_wh} → {new_wh}", 'by': 'System'})
    if old_st != new_st:
        it.history.append({'date': now_str(), 'action': f"Trạng thái: {old_st} → {new_st}", 'by': 'System'})
    flag_modified(it,'history')
    db.session.commit()
    return jsonify({'msg': 'Updated'})


@app.route('/api/items/purge_sold', methods=['POST'])
def purge_sold_items():
    sold_status = _clean_text('Đã bán').lower()
    sold_items = [
        it for it in Item.query.order_by(Item.id).all()
        if _clean_text(it.status).lower() == sold_status
    ]
    deleted_count = len(sold_items)
    for it in sold_items:
        db.session.delete(it)
    db.session.commit()
    return jsonify({'msg': 'Purged sold items', 'deleted_count': deleted_count})


@app.route('/api/items/purge_all', methods=['POST'])
def purge_all_items():
    payload = request.json or {}
    if str(payload.get('password') or '').strip() != '123321':
        return jsonify({'error': 'Mật khẩu không đúng.'}), 403

    items = Item.query.order_by(Item.id).all()
    deleted_count = len(items)
    for item in items:
        db.session.delete(item)
    db.session.commit()
    return jsonify({'msg': 'Purged all items', 'deleted_count': deleted_count})
