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

@app.route('/api/nhap_vang_lists', methods=['GET'])
def get_nhap_vang_lists():
    active_only = _clean_text(request.args.get('active_only')).lower()
    query = NhapVangList.query
    if active_only in {'1', 'true', 'yes'}:
        query = query.filter(NhapVangList.trang_thai != 'hoan_thanh')
    rows = query.order_by(NhapVangList.id.desc()).all()
    return jsonify([nhap_vang_list_json(row) for row in rows])


@app.route('/api/nhap_vang_lists', methods=['POST'])
def add_nhap_vang_list():
    d = request.json or {}
    ten_danh_sach = _clean_text(d.get('ten_danh_sach'))
    if not ten_danh_sach:
        return jsonify({'error': 'Ten danh sach khong hop le'}), 400

    now = now_str()
    obj = NhapVangList(
        ten_danh_sach=ten_danh_sach,
        ghi_chu=d.get('ghi_chu', ''),
        trang_thai=_clean_text(d.get('trang_thai')) or 'dang_mo',
        nguoi_tao=_clean_text(d.get('nguoi_tao')) or 'Admin',
        ngay_tao=now,
        ngay_cap_nhat=now,
    )
    db.session.add(obj)
    db.session.commit()
    return jsonify(nhap_vang_list_json(obj)), 201


@app.route('/api/nhap_vang_lists/<int:list_id>', methods=['GET', 'PUT', 'DELETE'])
def nhap_vang_list_detail(list_id):
    obj = NhapVangList.query.get_or_404(list_id)
    if request.method == 'GET':
        return jsonify(nhap_vang_list_json(obj))
    if request.method == 'DELETE':
        db.session.delete(obj)
        db.session.commit()
        return jsonify({'msg': 'Deleted'})

    d = request.json or {}
    ten_danh_sach = _clean_text(d.get('ten_danh_sach', obj.ten_danh_sach))
    if not ten_danh_sach:
        return jsonify({'error': 'Ten danh sach khong hop le'}), 400
    obj.ten_danh_sach = ten_danh_sach
    if 'ghi_chu' in d:
        obj.ghi_chu = d.get('ghi_chu', '')
    if 'trang_thai' in d:
        obj.trang_thai = _clean_text(d.get('trang_thai')) or obj.trang_thai
    _touch_nhap_vang_list(obj)
    db.session.commit()
    return jsonify(nhap_vang_list_json(obj))


@app.route('/api/nhap_vang_lists/<int:list_id>/items', methods=['POST'])
def add_nhap_vang_item(list_id):
    obj = NhapVangList.query.get_or_404(list_id)
    d = request.json or {}
    ten_hang = _clean_text(d.get('ten_hang'))
    if not ten_hang:
        return jsonify({'error': 'Ten hang khong hop le'}), 400

    now = now_str()
    required_qty, imported_qty = _normalize_nhap_vang_qty(
        d.get('so_luong_yeu_cau') or 0,
        d.get('so_luong_da_nhap') or 0
    )
    item = NhapVangItem(
        list_id=obj.id,
        ten_hang=ten_hang,
        nhom_hang=_clean_text(d.get('nhom_hang')),
        tuoi_vang=_clean_text(d.get('tuoi_vang')),
        trong_luong=_clean_text(d.get('trong_luong')),
        so_luong_yeu_cau=required_qty,
        so_luong_da_nhap=imported_qty,
        ghi_chu=d.get('ghi_chu', ''),
        thu_tu=int(d.get('thu_tu') or 0),
        ngay_tao=now,
        ngay_cap_nhat=now,
    )
    db.session.add(item)
    _touch_nhap_vang_list(obj)
    db.session.commit()
    return jsonify(nhap_vang_item_json(item)), 201


@app.route('/api/nhap_vang_items/<int:item_id>', methods=['PUT', 'DELETE'])
def nhap_vang_item_detail(item_id):
    item = NhapVangItem.query.get_or_404(item_id)
    parent = item.danh_sach
    if request.method == 'DELETE':
        db.session.delete(item)
        if parent:
            _touch_nhap_vang_list(parent)
        db.session.commit()
        return jsonify({'msg': 'Deleted'})

    d = request.json or {}
    ten_hang = _clean_text(d.get('ten_hang', item.ten_hang))
    if not ten_hang:
        return jsonify({'error': 'Ten hang khong hop le'}), 400
    item.ten_hang = ten_hang
    if 'nhom_hang' in d:
        item.nhom_hang = _clean_text(d.get('nhom_hang'))
    if 'tuoi_vang' in d:
        item.tuoi_vang = _clean_text(d.get('tuoi_vang'))
    if 'trong_luong' in d:
        item.trong_luong = _clean_text(d.get('trong_luong'))
    if 'so_luong_yeu_cau' in d:
        item.so_luong_yeu_cau = max(0, int(d.get('so_luong_yeu_cau') or 0))
    if 'so_luong_da_nhap' in d:
        item.so_luong_da_nhap = max(0, int(d.get('so_luong_da_nhap') or 0))
    item.so_luong_yeu_cau, item.so_luong_da_nhap = _normalize_nhap_vang_qty(
        item.so_luong_yeu_cau,
        item.so_luong_da_nhap
    )
    if 'ghi_chu' in d:
        item.ghi_chu = d.get('ghi_chu', '')
    if 'thu_tu' in d:
        item.thu_tu = int(d.get('thu_tu') or 0)
    item.ngay_cap_nhat = now_str()
    if parent:
        _touch_nhap_vang_list(parent)
    db.session.commit()
    return jsonify(nhap_vang_item_json(item))


@app.route('/api/nhap_vang_items/<int:item_id>/progress', methods=['POST'])
def nhap_vang_item_progress(item_id):
    item = NhapVangItem.query.get_or_404(item_id)
    d = request.json or {}
    if 'so_luong_da_nhap' in d:
        imported_qty = int(d.get('so_luong_da_nhap') or 0)
    else:
        imported_qty = int(item.so_luong_da_nhap or 0) + int(d.get('delta') or 0)
    _, item.so_luong_da_nhap = _normalize_nhap_vang_qty(item.so_luong_yeu_cau, imported_qty)
    item.ngay_cap_nhat = now_str()
    if item.danh_sach:
        _touch_nhap_vang_list(item.danh_sach)
    db.session.commit()
    return jsonify(nhap_vang_item_json(item))
