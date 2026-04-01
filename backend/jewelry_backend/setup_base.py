import datetime
import re
import unicodedata
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

from pgcompat import flag_modified, inspect, text

from .state import db
from .models import *
from .utils import _clean_text


SEED_KHO = [
    {'ten_kho': 'Kho Tổng', 'dia_chi': '11 Lê Thị Pha, P.1, Bảo Lộc'},
    {'ten_kho': 'Chi nhánh Q1'},
    {'ten_kho': 'Chi nhánh Q3'},
]

DEFAULT_KHO_NAME = 'Kho Tổng'

DEFAULT_KHO_LOOKUP = 'kho tong'

DEFAULT_KHO_ALIASES = {
    'Kho Tổng',
    'Kho Tong',
    'Kho Tá»•ng',
    'Kho TÃ¡Â»â€¢ng',
}

SEED_LOAI_VANG = [
    # SJC miếng
    {'ma_loai': 'SJC-1L',   'ten_loai': 'Vàng SJC miếng 1L/10L/1KG',
     'gia_ban': 17_610_000, 'gia_mua': 17_310_000,
     'sjc_key': 'Vàng SJC 1L, 10L, 1KG'},
    {'ma_loai': 'SJC-5C',   'ten_loai': 'Vàng SJC miếng 5 chỉ',
     'gia_ban': 17_612_000, 'gia_mua': 17_310_000,
     'sjc_key': 'Vàng SJC 5 chỉ'},
    {'ma_loai': 'SJC-1C',   'ten_loai': 'Vàng SJC miếng 0.5-2 chỉ',
     'gia_ban': 17_613_000, 'gia_mua': 17_310_000,
     'sjc_key': 'Vàng SJC 0.5 chỉ, 1 chỉ, 2 chỉ'},
    # Nhẫn SJC
    {'ma_loai': 'NHAN-9999', 'ten_loai': 'Vàng nhẫn SJC 99,99% 1-5 chỉ',
     'gia_ban': 17_580_000, 'gia_mua': 17_280_000,
     'sjc_key': 'Vàng nhẫn SJC 99,99% 1 chỉ, 2 chỉ, 5 chỉ'},
    {'ma_loai': 'NHAN-05C', 'ten_loai': 'Vàng nhẫn SJC 99,99% 0.3-0.5 chỉ',
     'gia_ban': 17_590_000, 'gia_mua': 17_280_000,
     'sjc_key': 'Vàng nhẫn SJC 99,99% 0.5 chỉ, 0.3 chỉ'},
    # Nữ trang
    {'ma_loai': 'NT-9999',  'ten_loai': 'Nữ trang 99,99% (24K)',
     'gia_ban': 17_430_000, 'gia_mua': 17_080_000,
     'sjc_key': 'Nữ trang 99,99%'},
    {'ma_loai': 'NT-990',   'ten_loai': 'Nữ trang 99%',
     'gia_ban': 17_257_400, 'gia_mua': 16_607_400,
     'sjc_key': 'Nữ trang 99%'},
    {'ma_loai': '750',      'ten_loai': 'Vàng 750 / Nữ trang 75% (18K)',
     'gia_ban': 13_088_800, 'gia_mua': 12_198_800,
     'sjc_key': 'Nữ trang 75%'},
    {'ma_loai': 'NT-68',    'ten_loai': 'Nữ trang 68%',
     'gia_ban': 11_868_600, 'gia_mua': 10_978_600,
     'sjc_key': 'Nữ trang 68%'},
    {'ma_loai': 'NT-61',    'ten_loai': 'Nữ trang 61%',
     'gia_ban': 10_648_400, 'gia_mua':  9_758_400,
     'sjc_key': 'Nữ trang 61%'},
    {'ma_loai': '583',      'ten_loai': 'Vàng 583 / Nữ trang 58,3% (14K)',
     'gia_ban': 10_177_700, 'gia_mua':  9_287_700,
     'sjc_key': ''},
    {'ma_loai': '416',      'ten_loai': 'Vàng 416 / Nữ trang 41,7% (10K)',
     'gia_ban':  7_284_000, 'gia_mua':  6_394_000,
     'sjc_key': ''},
]

THU_NGAN_AMOUNT_SCALE = 1000

THU_NGAN_AMOUNT_SCALE_DECIMAL = Decimal(str(THU_NGAN_AMOUNT_SCALE))

THU_NGAN_AMOUNT_QUANT = Decimal('0.001')

THU_NGAN_AMOUNT_MIGRATION_KEY = 'thu_ngan_so_quy_amount_scale_v1'


def _scale_legacy_thu_ngan_detail_rows(rows):
    changed = False
    scaled_rows = []
    for row in list(rows or []):
        item = dict(row or {})
        original = dict(item)
        for field in ['ton_dau_ky', 'so_du_hien_tai', 'gia_tri_lech', 'so_tien_dau_ngay', 'so_tien_hien_tai', 'chenh_lech']:
            if field in item and item.get(field) not in (None, ''):
                item[field] = _parse_bigint(item.get(field), 0) * THU_NGAN_AMOUNT_SCALE
        if item != original:
            changed = True
        scaled_rows.append(item)
    return scaled_rows, changed


def _scale_legacy_thu_ngan_history_entries(entries):
    changed = False
    scaled_entries = []
    for entry in list(entries or []):
        item = dict(entry or {})
        original = dict(item)
        for field in ['so_tien_dau_ngay', 'so_tien', 'so_tien_chenh_lech', 'chenh_lech']:
            if field in item and item.get(field) not in (None, ''):
                item[field] = _parse_bigint(item.get(field), 0) * THU_NGAN_AMOUNT_SCALE
        detail_rows, detail_changed = _scale_legacy_thu_ngan_detail_rows(item.get('chi_tiet') or [])
        if detail_changed:
            item['chi_tiet'] = detail_rows
        if item != original or detail_changed:
            changed = True
        scaled_entries.append(item)
    return scaled_entries, changed


def _migrate_thu_ngan_so_quy_amount_scale():
    marker = HeThongCauHinh.query.filter_by(config_key=THU_NGAN_AMOUNT_MIGRATION_KEY).first()
    if marker:
        return

    timestamp = datetime.datetime.now().strftime('%d/%m/%Y %H:%M:%S')
    any_changed = False
    for model in (ThuNganSoQuy, ThuNganSoQuyTheoNguoi):
        for obj in model.query.all():
            old_dau_ky = _parse_bigint(obj.so_tien_dau_ngay, 0)
            old_hien_tai = _parse_bigint(obj.so_tien_hien_tai, 0)
            obj.so_tien_dau_ngay = old_dau_ky * THU_NGAN_AMOUNT_SCALE
            obj.so_tien_hien_tai = old_hien_tai * THU_NGAN_AMOUNT_SCALE
            if old_dau_ky or old_hien_tai:
                any_changed = True

            if hasattr(obj, 'chi_tiet'):
                scaled_rows, detail_changed = _scale_legacy_thu_ngan_detail_rows(getattr(obj, 'chi_tiet', None) or [])
                if detail_changed:
                    obj.chi_tiet = scaled_rows
                    flag_modified(obj, 'chi_tiet')
                    any_changed = True

            scaled_history, history_changed = _scale_legacy_thu_ngan_history_entries(obj.lich_su_chot or [])
            if history_changed:
                obj.lich_su_chot = scaled_history
                flag_modified(obj, 'lich_su_chot')
                any_changed = True

    db.session.add(HeThongCauHinh(
        config_key=THU_NGAN_AMOUNT_MIGRATION_KEY,
        data={'scale': THU_NGAN_AMOUNT_SCALE},
        ghi_chu='Scale thu ngan amounts to thousandths',
        ngay_tao=timestamp,
        cap_nhat_luc=timestamp,
    ))
    db.session.commit()


def _normalize_kho_name(value):
    normalized = unicodedata.normalize('NFKD', str(value or '').replace('đ', 'd').replace('Đ', 'D'))
    stripped = ''.join(ch for ch in normalized if not unicodedata.combining(ch))
    return re.sub(r'\s+', ' ', stripped).strip().lower()


def _is_default_kho_name(value):
    text = re.sub(r'\s+', ' ', str(value or '')).strip()
    if text in DEFAULT_KHO_ALIASES:
        return True
    normalized = _normalize_kho_name(text)
    return normalized == DEFAULT_KHO_LOOKUP or bool(re.fullmatch(r'kho t\S*ng', normalized))


def _get_or_create_default_kho():
    matches = [k for k in Kho.query.order_by(Kho.id).all() if _is_default_kho_name(k.ten_kho)]
    for kho in matches:
        if kho.ten_kho == DEFAULT_KHO_NAME:
            return kho
    if matches:
        return matches[0]
    kho = Kho(ten_kho=DEFAULT_KHO_NAME, ngay_tao=datetime.datetime.now().strftime('%d/%m/%Y %H:%M:%S'))
    db.session.add(kho)
    db.session.flush()
    return kho


def _ensure_item_tuoi_vang_column():
    item_table = Item.__table__.name
    column_names = {col['name'] for col in inspect(db.engine).get_columns(item_table)}
    if 'tuoi_vang' in column_names:
        return
    db.session.execute(text(f'ALTER TABLE {item_table} ADD COLUMN tuoi_vang VARCHAR(100)'))
    db.session.commit()


def _ensure_tuoi_vang_columns():
    tuoi_table = TuoiVang.__table__.name
    inspector = inspect(db.engine)
    if tuoi_table not in inspector.get_table_names():
        return
    column_names = {col['name'] for col in inspector.get_columns(tuoi_table)}
    alter_statements = []
    if 'gia_ban' not in column_names:
        alter_statements.append(f'ALTER TABLE {tuoi_table} ADD COLUMN gia_ban BIGINT DEFAULT 0')
    if 'gia_mua' not in column_names:
        alter_statements.append(f'ALTER TABLE {tuoi_table} ADD COLUMN gia_mua BIGINT DEFAULT 0')
    if 'trong_luong_rieng' not in column_names:
        alter_statements.append(f'ALTER TABLE {tuoi_table} ADD COLUMN trong_luong_rieng FLOAT DEFAULT 0')
    if 'lich_su' not in column_names:
        alter_statements.append(f'ALTER TABLE {tuoi_table} ADD COLUMN lich_su JSON')
    for sql in alter_statements:
        db.session.execute(text(sql))
    if alter_statements:
        db.session.commit()


def _ensure_quay_nho_thu_ngan_column():
    quay_table = QuayNho.__table__.name
    inspector = inspect(db.engine)
    if quay_table not in inspector.get_table_names():
        return
    column_names = {col['name'] for col in inspector.get_columns(quay_table)}
    if 'thu_ngan_id' in column_names:
        return
    db.session.execute(text(f'ALTER TABLE {quay_table} ADD COLUMN thu_ngan_id INTEGER'))
    db.session.commit()


def _ensure_thu_ngan_so_quy_detail_columns():
    table_name = ThuNganSoQuyTheoNguoi.__table__.name
    inspector = inspect(db.engine)
    if table_name not in inspector.get_table_names():
        return
    column_names = {col['name'] for col in inspector.get_columns(table_name)}
    if 'chi_tiet' in column_names:
        return
    db.session.execute(text(f'ALTER TABLE {table_name} ADD COLUMN chi_tiet JSON'))
    db.session.commit()


def _ensure_khach_hang_sao_column():
    table_name = KhachHang.__table__.name
    inspector = inspect(db.engine)
    if table_name not in inspector.get_table_names():
        return
    column_names = {col['name'] for col in inspector.get_columns(table_name)}
    if 'sao' in column_names:
        return
    db.session.execute(text(f'ALTER TABLE {table_name} ADD COLUMN sao INTEGER DEFAULT 0'))
    db.session.commit()


def _ensure_khach_hang_favorite_column():
    table_name = KhachHang.__table__.name
    inspector = inspect(db.engine)
    if table_name not in inspector.get_table_names():
        return
    column_names = {col['name'] for col in inspector.get_columns(table_name)}
    if 'yeu_thich' in column_names:
        return
    db.session.execute(text(f'ALTER TABLE {table_name} ADD COLUMN yeu_thich INTEGER DEFAULT 0'))
    db.session.commit()


def _ensure_khach_hang_cccd_image_columns():
    table_name = KhachHang.__table__.name
    inspector = inspect(db.engine)
    if table_name not in inspector.get_table_names():
        return
    column_names = {col['name'] for col in inspector.get_columns(table_name)}
    alter_statements = []
    if 'anh_mat_truoc' not in column_names:
        alter_statements.append(f'ALTER TABLE {table_name} ADD COLUMN anh_mat_truoc TEXT')
    if 'anh_mat_sau' not in column_names:
        alter_statements.append(f'ALTER TABLE {table_name} ADD COLUMN anh_mat_sau TEXT')
    for sql in alter_statements:
        db.session.execute(text(sql))
    if alter_statements:
        db.session.commit()


def _ensure_khach_hang_photo_gallery_column():
    table_name = KhachHang.__table__.name
    inspector = inspect(db.engine)
    if table_name not in inspector.get_table_names():
        return
    column_names = {col['name'] for col in inspector.get_columns(table_name)}
    if 'anh_bo_suu_tap' in column_names:
        return
    db.session.execute(text(f'ALTER TABLE {table_name} ADD COLUMN anh_bo_suu_tap JSON'))
    db.session.commit()


def _parse_int_id(value):
    try:
        if value in (None, ''):
            return None
        return int(value)
    except (TypeError, ValueError):
        return None


def _normalize_quay_ids(values):
    ids = []
    seen = set()
    for value in values or []:
        qid = _parse_int_id(value)
        if qid is None or qid in seen:
            continue
        seen.add(qid)
        ids.append(qid)
    return ids


def _parse_bigint(value, fallback=0):
    text = _clean_text(value).replace(',', '')
    if not text:
        return fallback
    try:
        return int(Decimal(text))
    except (InvalidOperation, ValueError):
        return fallback


def _parse_float_value(value, fallback=0.0):
    text = _clean_text(value).replace(',', '')
    if not text:
        return fallback
    try:
        return float(Decimal(text))
    except (InvalidOperation, ValueError):
        return fallback


def _parse_thu_ngan_amount_input(value, fallback=0):
    text = _clean_text(value).replace(',', '')
    if not text:
        return fallback
    try:
        scaled = (Decimal(text) * THU_NGAN_AMOUNT_SCALE_DECIMAL).quantize(Decimal('1'), rounding=ROUND_HALF_UP)
        return int(scaled)
    except (InvalidOperation, ValueError):
        return fallback


def _format_thu_ngan_amount_output(value):
    scaled = _parse_bigint(value, 0)
    return float((Decimal(scaled) / THU_NGAN_AMOUNT_SCALE_DECIMAL).quantize(THU_NGAN_AMOUNT_QUANT))



def _ensure_search_indexes():
    """Tao cac index cho cac cot thuong xuyen query neu chua ton tai.
    An toan voi ca SQLite va PostgreSQL vi dung CREATE INDEX IF NOT EXISTS.
    """
    inspector = inspect(db.engine)

    index_specs = [
        # (table_name, index_name, column_name)
        ('item',       'ix_item_ma_hang',           'ma_hang'),
        ('item',       'ix_item_status',             'status'),
        ('khach_hang', 'ix_khach_hang_cccd',         'cccd'),
        ('khach_hang', 'ix_khach_hang_ten',          'ten'),
        ('khach_hang', 'ix_khach_hang_so_dien_thoai','so_dien_thoai'),
        ('khach_hang', 'ix_khach_hang_yeu_thich',    'yeu_thich'),
    ]

    existing_tables = set(inspector.get_table_names())
    for table_name, index_name, column_name in index_specs:
        if table_name not in existing_tables:
            continue
        try:
            db.session.execute(
                text(f'CREATE INDEX IF NOT EXISTS {index_name} ON {table_name} ({column_name})')
            )
            db.session.commit()
        except Exception:
            db.session.rollback()


__all__ = [name for name in globals() if not name.startswith('__')]
