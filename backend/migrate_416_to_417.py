import sys
sys.path.insert(0, '/var/www/jewelry/backend')
from app_jewelry import app, db, Item, LoaiVang

with app.app_context():
    # Đếm trước
    count_416 = Item.query.filter_by(loai_vang='416').count()
    print(f"Tim thay {count_416} san pham co loai_vang = '416'")

    if count_416 > 0:
        updated = Item.query.filter_by(loai_vang='416').update({'loai_vang': '417'})
        db.session.commit()
        print(f"Da cap nhat {updated} ban ghi: 416 -> 417")

    # Cập nhật bảng LoaiVang nếu có
    lv = LoaiVang.query.filter_by(ma_loai='416').first()
    if lv:
        lv.ma_loai = '417'
        db.session.commit()
        print(f"Da cap nhat loai_vang: '{lv.ten_loai}' -> ma_loai = 417")
    else:
        print("Bang loai_vang: khong co ma_loai = '416'")

    # Xác nhận
    remain = Item.query.filter_by(loai_vang='416').count()
    new_c  = Item.query.filter_by(loai_vang='417').count()
    print(f"Ket qua: con 416 = {remain}, tong 417 = {new_c}")
    print("XONG!")
