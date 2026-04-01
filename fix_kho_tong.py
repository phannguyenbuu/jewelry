import sys
import os
sys.path.insert(0, os.path.abspath('backend'))
os.environ['IS_DEV'] = 'true'

from app_jewelry import app, db
from jewelry_backend.models import DonHang, ThuNgan, ThuNganSoQuyTheoNguoi
from jewelry_backend.cashier_routes import _get_or_create_thu_ngan_so_quy_row, _sync_thu_ngan_so_quy_detail_totals, _make_thu_ngan_so_quy_detail_row
from sqlalchemy.orm.attributes import flag_modified
import datetime

def today_iso():
    return datetime.datetime.now().strftime('%Y-%m-%d')

with app.app_context():
    order = DonHang.query.filter_by(ma_don='DH20260401-0805').first()
    if order:
        if order.dat_coc == order.tong_tien:
            print('Fixing dat_coc for order', order.ma_don)
            # User wants it to be bank transfer, meaning Tiền mặt (dat_coc) = 0
            order.dat_coc = 0
            
            # Apply to Kho Tong
            kho_tong = ThuNgan.query.filter(ThuNgan.ten_thu_ngan.ilike('%Kho T%')).first()
            if kho_tong:
                ngay = today_iso()
                so_quy_kho = _get_or_create_thu_ngan_so_quy_row(ngay, kho_tong.id)
                chi_tiet_kho = list(so_quy_kho.chi_tiet or [])
                found = False
                for detail in chi_tiet_kho:
                    if detail.get('tuoi_vang') == 'Tài Khoản Ngân Hàng':
                        current_balance = int(detail.get('so_du_hien_tai', 0))
                        detail['so_du_hien_tai'] = current_balance + int(order.tong_tien)
                        print(f"Kho Tong bank updated from {current_balance} to {detail['so_du_hien_tai']}")
                        found = True
                        break
                if not found:
                    chi_tiet_kho.insert(0, _make_thu_ngan_so_quy_detail_row('Tài Khoản Ngân Hàng', ton_dau_ky=0, so_du_hien_tai=int(order.tong_tien)))
                    print(f"Created Kho Tong bank row with balance {int(order.tong_tien)}")
                
                so_quy_kho.chi_tiet = chi_tiet_kho
                flag_modified(so_quy_kho, 'chi_tiet')
                _sync_thu_ngan_so_quy_detail_totals(so_quy_kho)
                db.session.add(so_quy_kho)
                
            db.session.commit()
            print('Done fixing order.')
        else:
            print('Order is already adjusted.')
    else:
        print('Order not found.')
