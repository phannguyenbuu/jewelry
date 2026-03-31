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

def build_amortization(loan, commit=True):
    """ Tự động sinh lịch trả nợ khi tạo khoản vay """
    P = loan.so_tien_vay or 0
    rate = ((loan.lai_suat_ht or 0) / 100) / 12
    n = loan.ky_han_thang or 0
    if not P or not n:
        return
    # Parse ngày bắt đầu
    try:
        parts = (loan.ngay_bat_dau or '').split('/')
        start = datetime.date(int(parts[2]), int(parts[1]), int(parts[0]))
    except:
        start = datetime.date.today()

    balance = P
    for k in range(1, n + 1):
        # Ngày trả kỳ k
        m = (start.month - 1 + k) % 12 + 1
        y = start.year + (start.month - 1 + k) // 12
        day = min(start.day, [31,28,29,30,31,30,31,31,30,31,30,31][m-1])
        pay_date = datetime.date(y, m, day)

        interest = int(balance * rate)
        if loan.loai_tra_no == 'deu' and rate > 0:
            total = int(P * rate * (1+rate)**n / ((1+rate)**n - 1))
            principal = total - interest
        elif loan.loai_tra_no == 'cuoi_ky':
            principal = P if k == n else 0
            total = principal + interest
        else:  # du_no
            principal = int(P / n)
            if k == n: principal = balance
            total = principal + interest

        row = LichTraNo(
            loan_id=loan.id, ky_so=k,
            ngay_tra=pay_date.strftime('%d/%m/%Y'),
            so_du_dau=balance, tien_goc=principal,
            tien_lai=interest, tong_tra=total,
            so_du_cuoi=max(0, balance - principal),
        )
        db.session.add(row)
        balance = max(0, balance - principal)
    if commit:
        db.session.commit()


def loan_json(l):
    lt = [{'id':r.id,'ky_so':r.ky_so,'ngay_tra':r.ngay_tra,
           'so_du_dau':r.so_du_dau,'tien_goc':r.tien_goc,'tien_lai':r.tien_lai,
           'tong_tra':r.tong_tra,'so_du_cuoi':r.so_du_cuoi,
           'trang_thai':r.trang_thai,'ngay_da_tra':r.ngay_da_tra,'ghi_chu':r.ghi_chu}
          for r in sorted(l.lich_tra, key=lambda x: x.ky_so)]
    return {'id':l.id,'ma_hd':l.ma_hd,'ngan_hang':l.ngan_hang,
            'so_tien_vay':l.so_tien_vay,'loai_lai':l.loai_lai,
            'lai_co_so':l.lai_co_so,'bien_do':l.bien_do,'lai_suat_ht':l.lai_suat_ht,
            'phi_ban_dau':l.phi_ban_dau,'phi_tra_truoc':l.phi_tra_truoc,
            'ngay_giai_ngan':l.ngay_giai_ngan,'ngay_bat_dau':l.ngay_bat_dau,
            'ngay_tat_toan':l.ngay_tat_toan,'ky_han_thang':l.ky_han_thang,
            'loai_tra_no':l.loai_tra_no,'tai_san_dam_bao':l.tai_san_dam_bao,
            'muc_dich':l.muc_dich,'trang_thai':l.trang_thai,
            'dscr_min':l.dscr_min,'de_ratio_max':l.de_ratio_max,
            'ebitda_thang':l.ebitda_thang,'tong_tai_san':l.tong_tai_san,
            'von_chu_so_huu':l.von_chu_so_huu,'ghi_chu':l.ghi_chu,
            'nguoi_tao':l.nguoi_tao,'ngay_tao':l.ngay_tao,
            'lich_tra':lt}


@app.route('/api/khoan_vay', methods=['GET'])
def get_khoan_vay():
    return jsonify([loan_json(l) for l in KhoanVay.query.order_by(KhoanVay.id).all()])


@app.route('/api/khoan_vay', methods=['POST'])
def add_khoan_vay():
    d = request.json or {}
    loan = KhoanVay(
        ma_hd=d.get('ma_hd',''), ngan_hang=d.get('ngan_hang',''),
        so_tien_vay=int(d.get('so_tien_vay') or 0),
        loai_lai=d.get('loai_lai','co_dinh'),
        lai_co_so=float(d.get('lai_co_so') or 0),
        bien_do=float(d.get('bien_do') or 0),
        lai_suat_ht=float(d.get('lai_suat_ht') or 0),
        phi_ban_dau=int(d.get('phi_ban_dau') or 0),
        phi_tra_truoc=float(d.get('phi_tra_truoc') or 0),
        ngay_giai_ngan=d.get('ngay_giai_ngan',''),
        ngay_bat_dau=d.get('ngay_bat_dau',''),
        ngay_tat_toan=d.get('ngay_tat_toan',''),
        ky_han_thang=int(d.get('ky_han_thang') or 12),
        loai_tra_no=d.get('loai_tra_no','du_no'),
        tai_san_dam_bao=d.get('tai_san_dam_bao',''),
        muc_dich=d.get('muc_dich',''),
        trang_thai=d.get('trang_thai','dang_vay'),
        dscr_min=float(d.get('dscr_min') or 1.2),
        de_ratio_max=float(d.get('de_ratio_max') or 3.0),
        ebitda_thang=int(d.get('ebitda_thang') or 0),
        tong_tai_san=int(d.get('tong_tai_san') or 0),
        von_chu_so_huu=int(d.get('von_chu_so_huu') or 0),
        ghi_chu=d.get('ghi_chu',''),
        nguoi_tao='Admin', ngay_tao=now_str(),
    )
    db.session.add(loan); db.session.flush()  # get loan.id
    build_amortization(loan, commit=False)
    db.session.commit()
    return jsonify({'msg':'Created','id':loan.id}), 201


@app.route('/api/khoan_vay/<int:lid>', methods=['PUT','DELETE'])
def update_khoan_vay(lid):
    loan = KhoanVay.query.get_or_404(lid)
    if request.method == 'DELETE':
        db.session.delete(loan); db.session.commit(); return jsonify({'msg':'Deleted'})
    d = request.json or {}
    for f in ['ma_hd','ngan_hang','loai_lai','ngay_giai_ngan','ngay_bat_dau',
              'ngay_tat_toan','loai_tra_no','tai_san_dam_bao','muc_dich','trang_thai','ghi_chu']:
        if f in d: setattr(loan, f, d[f])
    for f_float in ['lai_co_so','bien_do','lai_suat_ht','phi_tra_truoc','dscr_min','de_ratio_max']:
        if f_float in d: setattr(loan, f_float, float(d[f_float] or 0))
    for f_int in ['so_tien_vay','phi_ban_dau','ky_han_thang','ebitda_thang','tong_tai_san','von_chu_so_huu']:
        if f_int in d: setattr(loan, f_int, int(d[f_int] or 0))
    # Tái tạo lịch trả nếu các thông số chính thay đổi
    if any(k in d for k in ['so_tien_vay','lai_suat_ht','ky_han_thang','loai_tra_no','ngay_bat_dau']):
        LichTraNo.query.filter_by(loan_id=lid, trang_thai='cho_tra').delete()
        build_amortization(loan, commit=False)
    db.session.commit(); return jsonify({'msg':'Updated'})


@app.route('/api/khoan_vay/<int:lid>/lich_tra/<int:rid>/tra', methods=['PUT'])
def mark_paid(lid, rid):
    row = LichTraNo.query.filter_by(id=rid, loan_id=lid).first_or_404()
    d = request.json or {}
    row.trang_thai = 'da_tra'
    row.ngay_da_tra = d.get('ngay_da_tra', now_str())
    db.session.commit()
    return jsonify({'msg':'Marked paid'})
