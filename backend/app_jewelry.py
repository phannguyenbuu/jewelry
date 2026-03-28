# pyre-ignore-all-errors
from flask import Flask, request, jsonify, send_from_directory
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from sqlalchemy import inspect, text
from sqlalchemy.orm.attributes import flag_modified
from decimal import Decimal, InvalidOperation
import os, uuid, datetime, base64, json, re, unicodedata
import urllib.request

app = Flask(__name__)
CORS(app)

# PostgreSQL on VPS, SQLite for local dev
import os as _os
_pg = 'postgresql://jewelry_user:jewelry2026@localhost/jewelry_db'
_sl = 'sqlite:///jewelry.db'
app.config['SQLALCHEMY_DATABASE_URI'] = _os.environ.get('DATABASE_URL', _pg if _os.path.exists('/var/www/jewelry') else _sl)
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)

# ─── MODELS ────────────────────────────────────────────────────────────────────

class Item(db.Model):
    id           = db.Column(db.Integer, primary_key=True)
    ma_hang      = db.Column(db.String(50),  nullable=False)
    ncc          = db.Column(db.String(200))
    nhom_hang    = db.Column(db.String(100))
    quay_nho     = db.Column(db.String(150))
    cong_le      = db.Column(db.String(50))
    cong_si      = db.Column(db.String(50))
    tong_tl      = db.Column(db.String(50))
    tl_da        = db.Column(db.String(50))
    tl_vang      = db.Column(db.String(50))
    loai_vang    = db.Column(db.String(50))
    tuoi_vang    = db.Column(db.String(100))
    status       = db.Column(db.String(50),  default='Tồn kho')
    images       = db.Column(db.JSON, default=list)
    certificates = db.Column(db.JSON, default=list)
    history      = db.Column(db.JSON, default=list)
    # —— Giá mua (giá vốn tại thời điểm nhập hàng) ——
    gia_vang_mua = db.Column(db.BigInteger, default=0)  # giá vàng đ/chỉ lúc mua
    gia_hat      = db.Column(db.BigInteger, default=0)  # giá hạt / đá
    gia_nhan_cong= db.Column(db.BigInteger, default=0)  # giá nhân công
    dieu_chinh   = db.Column(db.BigInteger, default=0)  # điều chỉnh (+/-)

class Kho(db.Model):
    id                = db.Column(db.Integer, primary_key=True)
    ten_kho           = db.Column(db.String(150), nullable=False)
    dia_chi           = db.Column(db.String(250))
    ghi_chu           = db.Column(db.Text)
    nguoi_phu_trach   = db.Column(db.String(150), default='')
    ngay_tao          = db.Column(db.String(30),  default='')

class QuayNho(db.Model):
    id                = db.Column(db.Integer, primary_key=True)
    ten_quay          = db.Column(db.String(150), nullable=False)
    kho_id            = db.Column(db.Integer, db.ForeignKey('kho.id'), nullable=True)
    thu_ngan_id       = db.Column(db.Integer, nullable=True)
    ghi_chu           = db.Column(db.Text)
    nguoi_phu_trach   = db.Column(db.String(150), default='')
    ngay_tao          = db.Column(db.String(30),  default='')


class ThuNgan(db.Model):
    __tablename__     = 'thu_ngan'
    id                = db.Column(db.Integer, primary_key=True)
    ten_thu_ngan      = db.Column(db.String(150), nullable=False)
    kho_id            = db.Column(db.Integer, db.ForeignKey('kho.id'), nullable=False)
    nhan_vien_id      = db.Column(db.Integer, nullable=True)
    ghi_chu           = db.Column(db.Text)
    ngay_tao          = db.Column(db.String(30), default='')

class LoaiVang(db.Model):
    id                = db.Column(db.Integer, primary_key=True)
    ma_loai           = db.Column(db.String(50),  nullable=False, unique=True)
    ten_loai          = db.Column(db.String(150))
    gia_ban           = db.Column(db.BigInteger,  default=0)   # VNĐ/chỉ
    gia_mua           = db.Column(db.BigInteger,  default=0)
    sjc_key           = db.Column(db.String(200), default='')  # mapping → tên hàng bên SJC
    nguoi_phu_trach   = db.Column(db.String(150), default='')
    ngay_tao          = db.Column(db.String(30),  default='')
    lich_su           = db.Column(db.JSON, default=list)

# ─── ĐƠN HÀNG ─────────────────────────────────────────────────────────────────
class DonHang(db.Model):
    id            = db.Column(db.Integer, primary_key=True)
    ma_don        = db.Column(db.String(50), unique=True)
    khach_hang    = db.Column(db.String(200))
    so_dien_thoai = db.Column(db.String(20))
    dia_chi       = db.Column(db.Text)
    ngay_dat      = db.Column(db.String(30))
    ngay_giao     = db.Column(db.String(30))
    items         = db.Column(db.JSON, default=list)   # [{ma_hang, ten, so_luong, don_gia}]
    tong_tien     = db.Column(db.BigInteger, default=0)
    dat_coc       = db.Column(db.BigInteger, default=0)
    trang_thai    = db.Column(db.String(50), default='Mới')  # Mới/Xử lý/Hoàn thành/Hủy
    ghi_chu       = db.Column(db.Text)
    nguoi_tao     = db.Column(db.String(150), default='')
    ngay_tao      = db.Column(db.String(30), default='')

# ─── NHÂN SỰ ──────────────────────────────────────────────────────────────────
class NhanVien(db.Model):
    id            = db.Column(db.Integer, primary_key=True)
    ma_nv         = db.Column(db.String(50), unique=True)
    ho_ten        = db.Column(db.String(200))
    chuc_vu       = db.Column(db.String(100))
    phong_ban     = db.Column(db.String(100))
    so_dien_thoai = db.Column(db.String(20))
    email         = db.Column(db.String(150))
    dia_chi       = db.Column(db.Text)
    ngay_vao      = db.Column(db.String(30))
    luong_co_ban  = db.Column(db.BigInteger, default=0)
    trang_thai    = db.Column(db.String(50), default='Đang làm')  # Đang làm/Nghỉ/Đã nghỉ
    ghi_chu       = db.Column(db.Text)
    ngay_tao      = db.Column(db.String(30), default='')

# ─── KẾ TOÁN: THU CHI ─────────────────────────────────────────────────────────
class ThuChi(db.Model):
    id          = db.Column(db.Integer, primary_key=True)
    loai        = db.Column(db.String(10))   # Thu / Chi
    danh_muc    = db.Column(db.String(150))
    so_tien     = db.Column(db.BigInteger, default=0)
    ngay        = db.Column(db.String(20))
    mo_ta       = db.Column(db.Text)
    doi_tuong   = db.Column(db.String(200))  # khách hàng / nhà cung cấp
    phuong_thuc = db.Column(db.String(50))   # Tiền mặt / Chuyển khoản
    ngay_tao    = db.Column(db.String(30), default='')

# ─── KẾ TOÁN: CHỨNG TỪ ───────────────────────────────────────────────────────
class ChungTu(db.Model):
    id            = db.Column(db.Integer, primary_key=True)
    ma_ct         = db.Column(db.String(50), unique=True)
    loai_ct       = db.Column(db.String(100))   # Hóa đơn mua/bán, Phiếu thu/chi...
    ngay_lap      = db.Column(db.String(20))
    ngay_hach_toan= db.Column(db.String(20))
    doi_tuong     = db.Column(db.String(200))
    mo_ta         = db.Column(db.Text)
    so_tien       = db.Column(db.BigInteger, default=0)
    thue_suat     = db.Column(db.Float, default=0)   # %
    trang_thai    = db.Column(db.String(50), default='Nháp')  # Nháp/Đã duyệt/Hủy
    file_dinh_kem = db.Column(db.JSON, default=list)
    nguoi_lap     = db.Column(db.String(150), default='')
    ngay_tao      = db.Column(db.String(30), default='')

# ─── NHÓM HÀNG ───────────────────────────────────────────────────────────────
class NhomHang(db.Model):
    id        = db.Column(db.Integer, primary_key=True)
    ten_nhom  = db.Column(db.String(150), nullable=False, unique=True)
    ma_nhom   = db.Column(db.String(50))
    mau_sac   = db.Column(db.String(20), default='#6366f1')  # hex color
    mo_ta     = db.Column(db.Text)
    thu_tu    = db.Column(db.Integer, default=0)
    ngay_tao  = db.Column(db.String(30), default='')

class TuoiVang(db.Model):
    id        = db.Column(db.Integer, primary_key=True)
    ten_tuoi  = db.Column(db.String(150), nullable=False, unique=True)
    gia_ban   = db.Column(db.BigInteger, default=0)
    gia_mua   = db.Column(db.BigInteger, default=0)
    trong_luong_rieng = db.Column(db.Float, default=0)
    ghi_chu   = db.Column(db.Text)
    lich_su   = db.Column(db.JSON, default=list)
    ngay_tao  = db.Column(db.String(30), default='')

# ─── TÀI CHÍNH: KHOẢN VAY ─────────────────────────────────────────────────────
class KhoanVay(db.Model):
    __tablename__ = 'khoan_vay'
    id              = db.Column(db.Integer, primary_key=True)
    ma_hd           = db.Column(db.String(80), unique=True)   # mã hợp đồng
    ngan_hang       = db.Column(db.String(150))               # tên ngân hàng
    so_tien_vay     = db.Column(db.BigInteger, default=0)     # VNĐ
    loai_lai        = db.Column(db.String(20), default='co_dinh')  # co_dinh / tha_noi
    lai_co_so       = db.Column(db.Float, default=0)          # base rate %/năm
    bien_do         = db.Column(db.Float, default=0)          # margin %/năm (thả nổi)
    lai_suat_ht     = db.Column(db.Float, default=0)          # hiệu lực hiện tại %/năm
    phi_ban_dau     = db.Column(db.BigInteger, default=0)     # phí ban đầu VNĐ
    phi_tra_truoc   = db.Column(db.Float, default=0)          # phạt trả trước %
    ngay_giai_ngan  = db.Column(db.String(20), default='')    # dd/mm/yyyy
    ngay_bat_dau    = db.Column(db.String(20), default='')
    ngay_tat_toan   = db.Column(db.String(20), default='')
    ky_han_thang    = db.Column(db.Integer, default=12)       # số tháng
    loai_tra_no     = db.Column(db.String(30), default='du_no')  # du_no/deu/giam_dan
    tai_san_dam_bao = db.Column(db.Text)
    muc_dich        = db.Column(db.String(200))
    trang_thai      = db.Column(db.String(30), default='dang_vay')
    # Covenant thresholds
    dscr_min        = db.Column(db.Float, default=1.2)        # DSCR tối thiểu
    de_ratio_max    = db.Column(db.Float, default=3.0)        # D/E tối đa
    # Current financial snapshot (updated manually)
    ebitda_thang    = db.Column(db.BigInteger, default=0)     # EBITDA tháng hiện tại
    tong_tai_san    = db.Column(db.BigInteger, default=0)
    von_chu_so_huu  = db.Column(db.BigInteger, default=0)
    ghi_chu         = db.Column(db.Text)
    nguoi_tao       = db.Column(db.String(150), default='')
    ngay_tao        = db.Column(db.String(30), default='')
    lich_tra        = db.relationship('LichTraNo', backref='khoan_vay',
                                      cascade='all,delete-orphan', lazy=True)

class LichTraNo(db.Model):
    __tablename__ = 'lich_tra_no'
    id          = db.Column(db.Integer, primary_key=True)
    loan_id     = db.Column(db.Integer, db.ForeignKey('khoan_vay.id'), nullable=False)
    ky_so       = db.Column(db.Integer)            # kỳ 1, 2, 3...
    ngay_tra    = db.Column(db.String(20))         # dd/mm/yyyy
    so_du_dau   = db.Column(db.BigInteger, default=0)
    tien_goc    = db.Column(db.BigInteger, default=0)
    tien_lai    = db.Column(db.BigInteger, default=0)
    tong_tra    = db.Column(db.BigInteger, default=0)
    so_du_cuoi  = db.Column(db.BigInteger, default=0)
    trang_thai  = db.Column(db.String(20), default='cho_tra')  # cho_tra/da_tra/qua_han
    ngay_da_tra = db.Column(db.String(20), default='')
    ghi_chu     = db.Column(db.String(200), default='')

# ── seed dữ liệu mặc định ─────────────────────────────────────────────────────

class ScaleAgent(db.Model):
    __tablename__ = 'scale_agent'
    id                = db.Column(db.Integer, primary_key=True)
    agent_key         = db.Column(db.String(80), unique=True, nullable=False)
    device_name       = db.Column(db.String(150), nullable=False, default='May can vang')
    model             = db.Column(db.String(80), default='AND GP-20K')
    location          = db.Column(db.String(150), default='')
    machine_name      = db.Column(db.String(150), default='')
    serial_port       = db.Column(db.String(50), default='')
    serial_settings   = db.Column(db.JSON, default=dict)
    desired_settings  = db.Column(db.JSON, default=dict)
    status            = db.Column(db.String(30), default='offline')
    last_seen         = db.Column(db.String(30), default='')
    last_error        = db.Column(db.Text, default='')
    last_weight_text  = db.Column(db.String(60), default='')
    last_weight_value = db.Column(db.Float, nullable=True)
    last_unit         = db.Column(db.String(20), default='')
    last_stable       = db.Column(db.Boolean, default=False)
    last_raw_line     = db.Column(db.String(120), default='')
    last_read_at      = db.Column(db.String(30), default='')
    created_at        = db.Column(db.String(30), default='')
    updated_at        = db.Column(db.String(30), default='')


class ScaleCommand(db.Model):
    __tablename__ = 'scale_command'
    id            = db.Column(db.Integer, primary_key=True)
    agent_id      = db.Column(db.Integer, db.ForeignKey('scale_agent.id'), nullable=False)
    command_type  = db.Column(db.String(50), default='read_weight')
    payload       = db.Column(db.JSON, default=dict)
    status        = db.Column(db.String(20), default='pending')
    requested_by  = db.Column(db.String(80), default='Admin')
    requested_at  = db.Column(db.String(30), default='')
    dispatched_at = db.Column(db.String(30), default='')
    completed_at  = db.Column(db.String(30), default='')
    result        = db.Column(db.JSON, default=dict)
    error         = db.Column(db.Text, default='')


class ScaleReading(db.Model):
    __tablename__ = 'scale_reading'
    id           = db.Column(db.Integer, primary_key=True)
    agent_id     = db.Column(db.Integer, db.ForeignKey('scale_agent.id'), nullable=False)
    command_id   = db.Column(db.Integer, db.ForeignKey('scale_command.id'), nullable=True)
    stable       = db.Column(db.Boolean, default=False)
    header       = db.Column(db.String(10), default='')
    weight_text  = db.Column(db.String(60), default='')
    weight_value = db.Column(db.Float, nullable=True)
    unit         = db.Column(db.String(20), default='')
    raw_line     = db.Column(db.String(120), default='')
    meta         = db.Column(db.JSON, default=dict)
    created_at   = db.Column(db.String(30), default='')

SEED_KHO = [
    {'ten_kho': 'Kho Tổng', 'dia_chi': '11 Lê Thị Pha, P.1, Bảo Lộc'},
    {'ten_kho': 'Chi nhánh Q1'},
    {'ten_kho': 'Chi nhánh Q3'},
]

# SJC prices are in ngàn đồng/lượng  → ÷10 = ngàn đồng/chỉ → ×1000 = đồng/chỉ
# Dùng giá HCM ngày 20/3/2026 làm seed
DEFAULT_KHO_NAME = 'Kho Tổng'
DEFAULT_KHO_LOOKUP = 'kho tong'
DEFAULT_KHO_ALIASES = {
    'Kho Tổng',
    'Kho Tong',
    'Kho Tá»•ng',
    'Kho TÃ¡Â»â€¢ng',
}


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
     'sjc_key': 'Nữ trang 58,3%'},
    {'ma_loai': '416',      'ten_loai': 'Vàng 416 / Nữ trang 41,7% (10K)',
     'gia_ban':  7_284_000, 'gia_mua':  6_394_000,
     'sjc_key': 'Nữ trang 41,7%'},
]

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


def _fold_ascii_text(text):
    normalized = unicodedata.normalize('NFKD', str(text or '').replace('đ', 'd').replace('Đ', 'D'))
    stripped = ''.join(ch for ch in normalized if not unicodedata.combining(ch))
    return re.sub(r'\s+', ' ', stripped).strip().lower()


def _tuoi_vang_permille(value):
    folded = _fold_ascii_text(value)
    if not folded:
        return None
    four_digit = re.findall(r'\b(\d{4})\b', folded)
    if four_digit:
        return int(Decimal(four_digit[0]) / Decimal('10'))
    three_digit = re.findall(r'\b(\d{3})\b', folded)
    if three_digit:
        return int(three_digit[0])
    karat_match = re.search(r'(\d+(?:[.,]\d+)?)\s*k\b', folded)
    if karat_match:
        karat = Decimal(karat_match.group(1).replace(',', '.'))
        return int((karat / Decimal('24') * Decimal('1000')).quantize(Decimal('1')))
    pct_match = re.search(r'(\d+(?:[.,]\d+)?)\s*%', folded)
    if pct_match:
        pct = Decimal(pct_match.group(1).replace(',', '.'))
        return int((pct * Decimal('10')).quantize(Decimal('1')))
    small_num = re.search(r'\b(\d+(?:[.,]\d+)?)\b', folded)
    if small_num:
        pct = Decimal(small_num.group(1).replace(',', '.'))
        if pct <= 100:
            return int((pct * Decimal('10')).quantize(Decimal('1')))
    return None


def _loai_vang_permille(loai):
    for candidate in (loai.ma_loai, loai.ten_loai, loai.sjc_key):
        permille = _tuoi_vang_permille(candidate)
        if permille is not None:
            return permille
    return None


def _suggest_trong_luong_rieng(ten_tuoi):
    permille = _tuoi_vang_permille(ten_tuoi)
    if permille is None:
        return 0.0
    preset = {
        1000: Decimal('19.3200'),
        999: Decimal('19.2500'),
        916: Decimal('17.7000'),
        750: Decimal('15.6000'),
        680: Decimal('15.0000'),
        610: Decimal('14.2000'),
        585: Decimal('13.9000'),
        583: Decimal('13.8600'),
        417: Decimal('11.8200'),
        416: Decimal('11.7800'),
        375: Decimal('10.9000'),
    }
    if permille in preset:
        return float(preset[permille])
    ratio = Decimal(permille) / Decimal('1000')
    base_ratio = Decimal('0.416')
    base_density = Decimal('11.7800')
    pure_ratio = Decimal('0.9999')
    pure_density = Decimal('19.3200')
    slope = (pure_density - base_density) / (pure_ratio - base_ratio)
    density = base_density + (ratio - base_ratio) * slope
    density = max(Decimal('10.0000'), min(Decimal('19.3200'), density))
    return float(density.quantize(Decimal('0.0001')))


def _suggest_tuoi_vang_defaults(ten_tuoi):
    permille = _tuoi_vang_permille(ten_tuoi)
    gia_ban = 0
    gia_mua = 0
    exact_ref = None
    fallback_ref = None
    fallback_ref_permille = None
    smallest_diff = None
    if ten_tuoi:
        folded_target = _fold_ascii_text(ten_tuoi)
        for loai in LoaiVang.query.order_by(LoaiVang.id).all():
            candidates = {_fold_ascii_text(loai.ma_loai), _fold_ascii_text(loai.ten_loai), _fold_ascii_text(loai.sjc_key)}
            loai_permille = _loai_vang_permille(loai)
            has_price = bool((loai.gia_ban or 0) or (loai.gia_mua or 0))
            if folded_target and folded_target in candidates and has_price:
                exact_ref = loai
                break
            if permille is None or loai_permille is None or not has_price:
                continue
            diff = abs(loai_permille - permille)
            if smallest_diff is None or diff < smallest_diff:
                smallest_diff = diff
                fallback_ref = loai
    ref = exact_ref
    if ref is None and fallback_ref is not None and smallest_diff is not None and smallest_diff <= 20:
        ref = fallback_ref
    if ref is not None:
        gia_ban = ref.gia_ban or 0
        gia_mua = ref.gia_mua or 0
    elif permille is not None:
        pure_ref = None
        pure_ref_permille = None
        for loai in LoaiVang.query.order_by(LoaiVang.id).all():
            loai_permille = _loai_vang_permille(loai)
            if loai_permille is None or not loai.gia_ban or not loai.gia_mua:
                continue
            if pure_ref_permille is None or loai_permille > pure_ref_permille:
                pure_ref = loai
                pure_ref_permille = loai_permille
        if pure_ref is not None and pure_ref_permille:
            gia_ban = int(round((pure_ref.gia_ban or 0) * permille / pure_ref_permille))
            gia_mua = int(round((pure_ref.gia_mua or 0) * permille / pure_ref_permille))
    return {
        'gia_ban': gia_ban,
        'gia_mua': gia_mua,
        'trong_luong_rieng': _suggest_trong_luong_rieng(ten_tuoi),
    }


def _backfill_tuoi_vang_defaults():
    changed = False
    for tuoi in TuoiVang.query.order_by(TuoiVang.id).all():
        suggested = _suggest_tuoi_vang_defaults(tuoi.ten_tuoi)
        if not (tuoi.gia_ban or 0) and suggested['gia_ban']:
            tuoi.gia_ban = suggested['gia_ban']
            changed = True
        if not (tuoi.gia_mua or 0) and suggested['gia_mua']:
            tuoi.gia_mua = suggested['gia_mua']
            changed = True
        if not (tuoi.trong_luong_rieng or 0) and suggested['trong_luong_rieng']:
            tuoi.trong_luong_rieng = suggested['trong_luong_rieng']
            changed = True
        if tuoi.lich_su is None:
            tuoi.lich_su = []
            changed = True
    if changed:
        db.session.commit()


def _sync_clean_text(value):
    if value is None:
        return ''
    return re.sub(r'\s+', ' ', str(value)).strip()


def _sync_now_str():
    return datetime.datetime.now().strftime('%d/%m/%Y %H:%M:%S')


def _sync_loai_vang_from_tuoi_vang_record(tuoi, old_ten_tuoi=None, record_history=False):
    ten_tuoi = _sync_clean_text(getattr(tuoi, 'ten_tuoi', ''))
    if not ten_tuoi:
        return None

    old_ten = _sync_clean_text(old_ten_tuoi)
    loai = LoaiVang.query.filter_by(ma_loai=ten_tuoi).first()
    renamed = False

    if loai is None and old_ten and old_ten != ten_tuoi:
        old_loai = LoaiVang.query.filter_by(ma_loai=old_ten).first()
        if old_loai and not LoaiVang.query.filter_by(ma_loai=ten_tuoi).first():
            loai = old_loai
            loai.ma_loai = ten_tuoi
            renamed = True

    created = False
    if loai is None:
        loai = LoaiVang(
            ma_loai=ten_tuoi,
            ten_loai=ten_tuoi,
            gia_ban=0,
            gia_mua=0,
            sjc_key='',
            nguoi_phu_trach='',
            ngay_tao=getattr(tuoi, 'ngay_tao', '') or _sync_now_str(),
            lich_su=[],
        )
        db.session.add(loai)
        created = True

    ten_loai_current = _sync_clean_text(loai.ten_loai)
    if not ten_loai_current or ten_loai_current in {old_ten, ten_tuoi}:
        loai.ten_loai = ten_tuoi

    old_ban = loai.gia_ban or 0
    old_mua = loai.gia_mua or 0
    new_ban = getattr(tuoi, 'gia_ban', 0) or 0
    new_mua = getattr(tuoi, 'gia_mua', 0) or 0

    loai.gia_ban = new_ban
    loai.gia_mua = new_mua
    if loai.lich_su is None:
        loai.lich_su = []

    if record_history and (old_ban != new_ban or old_mua != new_mua):
        loai.lich_su.append({
            'date': _sync_now_str(),
            'gia_ban': new_ban,
            'gia_mua': new_mua,
            'delta_ban': new_ban - old_ban,
            'delta_mua': new_mua - old_mua,
            'note': f'Dong bo tu tuoi vang {ten_tuoi}',
            'by': 'TuoiVangSync',
        })
        flag_modified(loai, 'lich_su')

    return loai


def _sync_all_loai_vang_from_tuoi_vang():
    for tuoi in TuoiVang.query.order_by(TuoiVang.id).all():
        _sync_loai_vang_from_tuoi_vang_record(tuoi, record_history=False)
    if db.session.new or db.session.dirty:
        db.session.commit()

with app.app_context():
    db.create_all()
    _ensure_item_tuoi_vang_column()
    _ensure_tuoi_vang_columns()
    _ensure_quay_nho_thu_ngan_column()
    if Kho.query.count() == 0:
        for k in SEED_KHO:
            db.session.add(Kho(**k))
        db.session.commit()
    if LoaiVang.query.count() == 0:
        for v in SEED_LOAI_VANG:
            db.session.add(LoaiVang(**v))
        db.session.commit()
    else:
        # Đảm bảo cột sjc_key không bị NULL cho các hàng cũ
        for v in LoaiVang.query.all():
            if v.sjc_key is None:
                v.sjc_key = ''
        db.session.commit()
    # Auto-seed NhomHang từ giá trị nhom_hang thực tế trong Item
    if NhomHang.query.count() == 0:
        existing = (
            db.session.query(Item.nhom_hang)
            .distinct()
            .filter(Item.nhom_hang.isnot(None), Item.nhom_hang != '')
            .all()
        )
        ts = datetime.datetime.now().strftime('%d/%m/%Y %H:%M:%S')
        for i, row in enumerate(sorted(r[0] for r in existing if r[0])):
            db.session.add(NhomHang(ten_nhom=row, thu_tu=i, ngay_tao=ts))
        db.session.commit()
    if TuoiVang.query.count() == 0:
        existing_tuoi = (
            db.session.query(Item.tuoi_vang)
            .distinct()
            .filter(Item.tuoi_vang.isnot(None), Item.tuoi_vang != '')
            .all()
        )
        ts = datetime.datetime.now().strftime('%d/%m/%Y %H:%M:%S')
        for row in sorted(r[0] for r in existing_tuoi if r[0]):
            suggested = _suggest_tuoi_vang_defaults(row)
            db.session.add(TuoiVang(
                ten_tuoi=row,
                gia_ban=suggested['gia_ban'],
                gia_mua=suggested['gia_mua'],
                trong_luong_rieng=suggested['trong_luong_rieng'],
                lich_su=[],
                ngay_tao=ts,
            ))
        db.session.commit()
    _backfill_tuoi_vang_defaults()
    _sync_all_loai_vang_from_tuoi_vang()
    default_kho = _get_or_create_default_kho()
    all_quays = QuayNho.query.all()
    changed = False
    for q in all_quays:
        if q.kho_id != default_kho.id:
            q.kho_id = default_kho.id
            changed = True
    duplicate_khos = [
        k for k in Kho.query.order_by(Kho.id).all()
        if k.id != default_kho.id and _is_default_kho_name(k.ten_kho)
    ]
    for kho in duplicate_khos:
        db.session.delete(kho)
        changed = True
    if changed:
        db.session.commit()

def now_str():
    return datetime.datetime.now().strftime('%d/%m/%Y %H:%M:%S')


IMPORT_HEADER_ALIASES = {
    'ma_hang': {'ma hang'},
    'ncc': {'ncc'},
    'nhom_hang': {'nhom hang'},
    'quay_nho': {'quay nho'},
    'cong_le': {'cong le'},
    'cong_si': {'cong si'},
    'tong_tl': {'tong tl'},
    'tl_da': {'tl da'},
    'tl_vang': {'tl vang'},
}


def _ascii_fold(text):
    normalized = unicodedata.normalize('NFKD', str(text or '').replace('đ', 'd').replace('Đ', 'D'))
    stripped = ''.join(ch for ch in normalized if not unicodedata.combining(ch))
    return re.sub(r'\s+', ' ', stripped).strip().lower()


def _clean_text(value):
    if value is None:
        return ''
    return re.sub(r'\s+', ' ', str(value)).strip()


def _format_decimal(value, max_decimals=None):
    if value is None:
        return ''
    if max_decimals is not None:
        quant = Decimal('1.' + ('0' * max_decimals))
        value = value.quantize(quant)
    text = format(value, 'f')
    if '.' in text:
        text = text.rstrip('0').rstrip('.')
    return '0' if text in ('', '-0') else text


def _normalize_numeric_text(value):
    text = _clean_text(value).replace(',', '')
    if not text:
        return ''
    try:
        return _format_decimal(Decimal(text))
    except (InvalidOperation, ValueError):
        return _clean_text(value)


def _normalize_weight_text(value):
    text = _clean_text(value).replace(',', '')
    if not text:
        return ''
    try:
        return _format_decimal(Decimal(text), max_decimals=4)
    except (InvalidOperation, ValueError):
        return _clean_text(value)


def _parse_local_datetime(value):
    text = _clean_text(value)
    if not text:
        return None
    try:
        return datetime.datetime.strptime(text, '%d/%m/%Y %H:%M:%S')
    except ValueError:
        return None


def _scale_agent_is_online(agent, timeout_seconds=45):
    if not agent or not agent.last_seen:
        return False
    seen_at = _parse_local_datetime(agent.last_seen)
    if seen_at is None:
        return False
    return (datetime.datetime.now() - seen_at).total_seconds() <= timeout_seconds


def _normalize_scale_settings(value):
    data = value if isinstance(value, dict) else {}

    def _int_setting(*keys, default):
        for key in keys:
            raw = data.get(key)
            if raw in (None, ''):
                continue
            try:
                return int(raw)
            except (TypeError, ValueError):
                continue
        return default

    def _float_setting(*keys, default):
        for key in keys:
            raw = data.get(key)
            if raw in (None, ''):
                continue
            try:
                return float(raw)
            except (TypeError, ValueError):
                continue
        return default

    parity = _clean_text(data.get('parity') or data.get('serial_parity') or 'E').upper()[:1] or 'E'
    if parity not in {'N', 'E', 'O'}:
        parity = 'E'

    line_ending = data.get('line_ending')
    if not isinstance(line_ending, str):
        line_ending = '\r\n'

    command = _clean_text(data.get('command') or data.get('serial_command') or 'Q').upper() or 'Q'
    data_format = _clean_text(data.get('data_format') or 'A&D').upper() or 'A&D'

    return {
        'baudrate': _int_setting('baudrate', 'baud_rate', default=2400),
        'bytesize': _int_setting('bytesize', 'data_bits', default=7),
        'parity': parity,
        'stopbits': _int_setting('stopbits', 'stop_bits', default=1),
        'timeout_seconds': _float_setting('timeout_seconds', 'timeout', default=2.5),
        'command': command,
        'line_ending': line_ending,
        'data_format': data_format,
    }


def _generate_scale_agent_key():
    return f"scale_{uuid.uuid4().hex[:24]}"


def scale_command_json(cmd):
    return {
        'id': cmd.id,
        'agent_id': cmd.agent_id,
        'command_type': cmd.command_type,
        'payload': cmd.payload or {},
        'status': cmd.status,
        'requested_by': cmd.requested_by,
        'requested_at': cmd.requested_at,
        'dispatched_at': cmd.dispatched_at,
        'completed_at': cmd.completed_at,
        'result': cmd.result or {},
        'error': cmd.error or '',
    }


def scale_reading_json(reading):
    return {
        'id': reading.id,
        'agent_id': reading.agent_id,
        'command_id': reading.command_id,
        'stable': bool(reading.stable),
        'header': reading.header or '',
        'weight_text': reading.weight_text or '',
        'weight_value': reading.weight_value,
        'unit': reading.unit or '',
        'raw_line': reading.raw_line or '',
        'meta': reading.meta or {},
        'created_at': reading.created_at or '',
    }


def scale_agent_json(agent):
    pending_count = ScaleCommand.query.filter_by(agent_id=agent.id, status='pending').count()
    inflight_count = ScaleCommand.query.filter(
        ScaleCommand.agent_id == agent.id,
        ScaleCommand.status.in_(['pending', 'dispatched'])
    ).count()
    last_command = (
        ScaleCommand.query
        .filter_by(agent_id=agent.id)
        .order_by(ScaleCommand.id.desc())
        .first()
    )
    return {
        'id': agent.id,
        'agent_key': agent.agent_key,
        'device_name': agent.device_name,
        'model': agent.model or '',
        'location': agent.location or '',
        'machine_name': agent.machine_name or '',
        'serial_port': agent.serial_port or '',
        'serial_settings': agent.serial_settings or {},
        'desired_settings': agent.desired_settings or _normalize_scale_settings({}),
        'status': 'online' if _scale_agent_is_online(agent) else 'offline',
        'reported_status': agent.status or '',
        'last_seen': agent.last_seen or '',
        'last_error': agent.last_error or '',
        'last_weight_text': agent.last_weight_text or '',
        'last_weight_value': agent.last_weight_value,
        'last_unit': agent.last_unit or '',
        'last_stable': bool(agent.last_stable),
        'last_raw_line': agent.last_raw_line or '',
        'last_read_at': agent.last_read_at or '',
        'pending_commands': pending_count,
        'inflight_commands': inflight_count,
        'last_command': scale_command_json(last_command) if last_command else None,
        'created_at': agent.created_at or '',
        'updated_at': agent.updated_at or '',
    }


def _coerce_scale_weight(value):
    if value in (None, ''):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _build_scale_command_payload(data):
    serial_command = _clean_text(data.get('serial_command') or '')
    mode = _clean_text(data.get('mode') or '')
    if not serial_command:
        serial_command = 'S' if mode == 'stable' else 'Q'
    timeout_seconds = data.get('timeout_seconds')
    try:
        timeout_seconds = float(timeout_seconds) if timeout_seconds not in (None, '') else 2.5
    except (TypeError, ValueError):
        timeout_seconds = 2.5
    return {
        'mode': mode or ('stable' if serial_command.upper() == 'S' else 'immediate'),
        'serial_command': serial_command.upper(),
        'timeout_seconds': timeout_seconds,
    }


def _decimal_or_none(value):
    text = _clean_text(value).replace(',', '')
    if not text:
        return None
    try:
        return Decimal(text)
    except (InvalidOperation, ValueError):
        return None


def _compute_tong_tl(tl_da, tl_vang, fallback=''):
    da = _decimal_or_none(tl_da)
    vang = _decimal_or_none(tl_vang)
    if da is None and vang is None:
        return _normalize_weight_text(fallback)
    return _format_decimal((da or Decimal('0')) + (vang or Decimal('0')), max_decimals=4)


def _extract_loai_vang(values):
    for value in values:
        folded = _ascii_fold(value)
        match = re.search(r'loai\s+vang\s*:?\s*(.+)', folded)
        if match:
            return match.group(1).strip(' -').upper()
    return ''


def _find_import_header(sheet):
    required = {'ma_hang', 'ncc', 'nhom_hang', 'quay_nho', 'cong_le', 'cong_si', 'tl_da', 'tl_vang'}
    for row_idx in range(sheet.nrows):
        mapping = {}
        for col_idx, value in enumerate(sheet.row_values(row_idx)):
            label = _ascii_fold(value)
            for field, aliases in IMPORT_HEADER_ALIASES.items():
                if label in aliases:
                    mapping[field] = col_idx
                    break
        if required.issubset(mapping.keys()):
            return row_idx, mapping
    raise ValueError('Khong tim thay header hop le trong file XLS.')


def _parse_inventory_xls(file_bytes, filename=''):
    try:
        import xlrd
    except ImportError as exc:
        raise RuntimeError('Server dang thieu thu vien xlrd de doc file .xls.') from exc

    try:
        book = xlrd.open_workbook(file_contents=file_bytes)
    except Exception as exc:
        raise ValueError(f'Khong mo duoc file XLS: {exc}') from exc

    sheet = book.sheet_by_index(0)
    header_row, column_map = _find_import_header(sheet)
    fallback_loai_vang = _clean_text(os.path.splitext(os.path.basename(filename))[0]).upper()
    current_loai_vang = ''

    for row_idx in range(header_row + 1):
        detected = _extract_loai_vang(sheet.row_values(row_idx))
        if detected:
            current_loai_vang = detected

    items = []
    for row_idx in range(header_row + 1, sheet.nrows):
        row_values = sheet.row_values(row_idx)
        detected = _extract_loai_vang(row_values)
        if detected:
            current_loai_vang = detected

        ma_hang = _clean_text(row_values[column_map['ma_hang']])
        if not ma_hang or _ascii_fold(ma_hang) == 'ma hang':
            continue

        tl_da = _normalize_weight_text(row_values[column_map['tl_da']])
        tl_vang = _normalize_weight_text(row_values[column_map['tl_vang']])

        items.append({
            'ma_hang': ma_hang,
            'ncc': _clean_text(row_values[column_map['ncc']]),
            'nhom_hang': _clean_text(row_values[column_map['nhom_hang']]),
            'quay_nho': _clean_text(row_values[column_map['quay_nho']]),
            'cong_le': _normalize_numeric_text(row_values[column_map['cong_le']]),
            'cong_si': _normalize_numeric_text(row_values[column_map['cong_si']]),
            'tl_da': tl_da,
            'tl_vang': tl_vang,
            'tong_tl': _compute_tong_tl(tl_da, tl_vang),
            'loai_vang': current_loai_vang or fallback_loai_vang,
        })

    if not items:
        raise ValueError('Khong tim thay dong du lieu hop le trong file XLS.')

    return {
        'items': items,
        'loai_vang': current_loai_vang or fallback_loai_vang,
        'sheet_name': sheet.name,
    }

# ─── ITEMS ─────────────────────────────────────────────────────────────────────

def _item_json(it):
    tl = 0.0
    try: tl = float(it.tl_vang or 0)
    except: pass
    gv  = it.gia_vang_mua or 0
    gh  = it.gia_hat or 0
    gnc = it.gia_nhan_cong or 0
    dc  = it.dieu_chinh or 0
    gia_mua_tinh = round(gv * tl + gh + gnc + dc)
    return {
        'id': it.id, 'ma_hang': it.ma_hang, 'ncc': it.ncc,
        'nhom_hang': it.nhom_hang, 'quay_nho': it.quay_nho,
        'cong_le': it.cong_le, 'cong_si': it.cong_si,
        'tong_tl': _compute_tong_tl(it.tl_da, it.tl_vang, it.tong_tl), 'tl_da': it.tl_da, 'tl_vang': it.tl_vang,
        'loai_vang': it.loai_vang, 'tuoi_vang': it.tuoi_vang or '', 'status': it.status,
        'images': it.images, 'certificates': it.certificates, 'history': it.history,
        'gia_vang_mua': gv, 'gia_hat': gh, 'gia_nhan_cong': gnc, 'dieu_chinh': dc,
        'gia_mua_tinh': gia_mua_tinh,
    }

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

# ─── KHO ───────────────────────────────────────────────────────────────────────

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

# ─── QUẦY NHỎ ──────────────────────────────────────────────────────────────────

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
    q = QuayNho(ten_quay=d.get('ten_quay',''), kho_id=kho_id, ghi_chu=d.get('ghi_chu',''),
                nguoi_phu_trach=d.get('nguoi_phu_trach',''), ngay_tao=now_str())
    db.session.add(q); db.session.commit()
    return jsonify({'msg':'Created','id':q.id})

@app.route('/api/quay_nho/<int:qid>', methods=['PUT','DELETE'])
def update_quay(qid):
    q = QuayNho.query.get_or_404(qid)
    if request.method == 'DELETE':
        db.session.delete(q); db.session.commit(); return jsonify({'msg':'Deleted'})
    d = request.json or {}
    new_kho_id = _parse_int_id(d.get('kho_id')) or _get_or_create_default_kho().id
    q.ten_quay          = d.get('ten_quay', q.ten_quay)
    q.kho_id            = new_kho_id
    q.ghi_chu           = d.get('ghi_chu', q.ghi_chu)
    q.nguoi_phu_trach   = d.get('nguoi_phu_trach', q.nguoi_phu_trach or '')
    if q.thu_ngan_id:
        assigned_cashier = ThuNgan.query.get(q.thu_ngan_id)
        if not assigned_cashier or assigned_cashier.kho_id != new_kho_id:
            q.thu_ngan_id = None
    db.session.commit(); return jsonify({'msg':'Updated'})

# ─── LOẠI VÀNG ─────────────────────────────────────────────────────────────────

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
    db.session.add(v); db.session.commit()
    return jsonify({'msg':'Created','id':v.id})

@app.route('/api/loai_vang/<int:vid>', methods=['PUT','DELETE'])
def update_loai_vang(vid):
    v = LoaiVang.query.get_or_404(vid)
    if request.method == 'DELETE':
        db.session.delete(v); db.session.commit(); return jsonify({'msg':'Deleted'})
    d = request.json or {}
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
    db.session.commit()
    return jsonify({'msg':'Updated'})

# ─── SJC PRICE CRAWLER ─────────────────────────────────────────────────────────

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

# ─── UPLOAD ────────────────────────────────────────────────────────────────────

UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'uploads')
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

@app.route('/api/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file'}), 400
    f = request.files['file']
    ext = f.filename.rsplit('.',1)[-1] if '.' in f.filename else 'bin'
    filename = str(uuid.uuid4()) + '.' + ext
    f.save(os.path.join(UPLOAD_FOLDER, filename))
    return jsonify({'url': f'/api/uploads/{filename}', 'name': f.filename})


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
    existing_loai = {v.ma_loai for v in LoaiVang.query.all()}
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
        _sync_loai_vang_from_tuoi_vang_record(tuoi_obj, record_history=False)
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

        if row['loai_vang'] and row['loai_vang'] not in existing_loai:
            db.session.add(LoaiVang(
                ma_loai=row['loai_vang'],
                ten_loai=row['loai_vang'],
                ngay_tao=ts,
            ))
            existing_loai.add(row['loai_vang'])
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
            loai_vang=row['loai_vang'],
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

    db.session.commit()
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

# ─── ĐƠN HÀNG CRUD ────────────────────────────────────────────────────────────

def don_json(d):
    return {'id':d.id,'ma_don':d.ma_don,'khach_hang':d.khach_hang,
            'so_dien_thoai':d.so_dien_thoai,'dia_chi':d.dia_chi,
            'ngay_dat':d.ngay_dat,'ngay_giao':d.ngay_giao,
            'items':d.items or [],'tong_tien':d.tong_tien,'dat_coc':d.dat_coc,
            'trang_thai':d.trang_thai,'ghi_chu':d.ghi_chu,
            'nguoi_tao':d.nguoi_tao,'ngay_tao':d.ngay_tao}

def don_json(d):
    return {'id':d.id,'ma_don':d.ma_don,'loai_don':d.loai_don or 'Mua',
            'khach_hang':d.khach_hang,'cccd':d.cccd or '','so_dien_thoai':d.so_dien_thoai,
            'dia_chi_kh':d.dia_chi_kh or '','dia_chi':d.dia_chi,'ngay_dat':d.ngay_dat,
            'ngay_giao':d.ngay_giao,'items':d.items or [],'tong_tien':d.tong_tien,
            'dat_coc':d.dat_coc,'trang_thai':d.trang_thai,'ghi_chu':d.ghi_chu,
            'chung_tu':d.chung_tu or [],'nguoi_tao':d.nguoi_tao,'ngay_tao':d.ngay_tao}

@app.route('/api/don_hang', methods=['GET'])
def get_don_hang():
    q = DonHang.query.order_by(DonHang.id.desc())
    date = request.args.get('date', '').strip()
    today = request.args.get('today', '').strip()
    if today in ('1', 'true', 'yes'):
        date = datetime.datetime.now().strftime('%Y-%m-%d')
    if date:
        q = q.filter(DonHang.ngay_dat.like(f'{date}%'))
    return jsonify([don_json(d) for d in q.all()])

@app.route('/api/don_hang', methods=['POST'])
def add_don_hang():
    d = request.json or {}
    ma = d.get('ma_don') or f"DH{datetime.datetime.now().strftime('%y%m%d%H%M%S')}"
    obj = DonHang(ma_don=ma, loai_don=d.get('loai_don','Mua'),
                  khach_hang=d.get('khach_hang',''), cccd=d.get('cccd',''),
                  so_dien_thoai=d.get('so_dien_thoai',''), dia_chi=d.get('dia_chi',''),
                  dia_chi_kh=d.get('dia_chi_kh',''),
                  ngay_dat=d.get('ngay_dat',''), ngay_giao=d.get('ngay_giao',''),
                  items=d.get('items',[]), tong_tien=int(d.get('tong_tien') or 0),
                  dat_coc=int(d.get('dat_coc') or 0), trang_thai=d.get('trang_thai','Mới'),
                  ghi_chu=d.get('ghi_chu',''), chung_tu=d.get('chung_tu',[]),
                  nguoi_tao=d.get('nguoi_tao',''), ngay_tao=now_str())
    db.session.add(obj); db.session.commit()
    return jsonify({'msg':'Created','id':obj.id}), 201

@app.route('/api/don_hang/<int:did>', methods=['GET','PUT','DELETE'])
def update_don_hang(did):
    obj = DonHang.query.get_or_404(did)
    if request.method == 'GET': return jsonify(don_json(obj))
    if request.method == 'DELETE':
        db.session.delete(obj); db.session.commit(); return jsonify({'msg':'Deleted'})
    d = request.json or {}
    for f in ['loai_don','khach_hang','cccd','so_dien_thoai','dia_chi','dia_chi_kh',
               'ngay_dat','ngay_giao','trang_thai','ghi_chu','nguoi_tao']:
        if f in d: setattr(obj, f, d[f])
    if 'items'    in d: obj.items    = d['items']
    if 'chung_tu' in d: obj.chung_tu = d['chung_tu']
    if 'tong_tien' in d: obj.tong_tien = int(d['tong_tien'] or 0)
    if 'dat_coc'   in d: obj.dat_coc   = int(d['dat_coc'] or 0)
    db.session.commit(); return jsonify({'msg':'Updated'})


# ─── NHÂN SỰ CRUD ─────────────────────────────────────────────────────────────

def nv_json(n):
    return {'id':n.id,'ma_nv':n.ma_nv,'ho_ten':n.ho_ten,'chuc_vu':n.chuc_vu,
            'phong_ban':n.phong_ban,'so_dien_thoai':n.so_dien_thoai,'email':n.email,
            'dia_chi':n.dia_chi,'ngay_vao':n.ngay_vao,'luong_co_ban':n.luong_co_ban,
            'trang_thai':n.trang_thai,'ghi_chu':n.ghi_chu,'ngay_tao':n.ngay_tao}

@app.route('/api/nhan_vien', methods=['GET'])
def get_nhan_vien():
    return jsonify([nv_json(n) for n in NhanVien.query.order_by(NhanVien.id.desc()).all()])

@app.route('/api/nhan_vien', methods=['POST'])
def add_nhan_vien():
    d = request.json or {}
    ma = d.get('ma_nv') or f"NV{datetime.datetime.now().strftime('%y%m%d%H%M%S')}"
    obj = NhanVien(ma_nv=ma, ho_ten=d.get('ho_ten',''), chuc_vu=d.get('chuc_vu',''),
                   phong_ban=d.get('phong_ban',''), so_dien_thoai=d.get('so_dien_thoai',''),
                   email=d.get('email',''), dia_chi=d.get('dia_chi',''),
                   ngay_vao=d.get('ngay_vao',''), luong_co_ban=int(d.get('luong_co_ban') or 0),
                   trang_thai=d.get('trang_thai','Đang làm'), ghi_chu=d.get('ghi_chu',''), ngay_tao=now_str())
    db.session.add(obj); db.session.commit()
    return jsonify({'msg':'Created','id':obj.id}), 201

@app.route('/api/nhan_vien/<int:nid>', methods=['GET','PUT','DELETE'])
def update_nhan_vien(nid):
    obj = NhanVien.query.get_or_404(nid)
    if request.method == 'GET': return jsonify(nv_json(obj))
    if request.method == 'DELETE':
        ThuNgan.query.filter_by(nhan_vien_id=obj.id).update({'nhan_vien_id': None}, synchronize_session=False)
        db.session.delete(obj); db.session.commit(); return jsonify({'msg':'Deleted'})
    d = request.json or {}
    for f in ['ho_ten','chuc_vu','phong_ban','so_dien_thoai','email','dia_chi','ngay_vao','trang_thai','ghi_chu']:
        if f in d: setattr(obj, f, d[f])
    if 'luong_co_ban' in d: obj.luong_co_ban = int(d['luong_co_ban'] or 0)
    db.session.commit(); return jsonify({'msg':'Updated'})

# ─── THU CHI CRUD ─────────────────────────────────────────────────────────────

def tc_json(t):
    return {'id':t.id,'loai':t.loai,'danh_muc':t.danh_muc,'so_tien':t.so_tien,
            'ngay':t.ngay,'mo_ta':t.mo_ta,'doi_tuong':t.doi_tuong,
            'phuong_thuc':t.phuong_thuc,'ngay_tao':t.ngay_tao}

@app.route('/api/thu_chi', methods=['GET'])
def get_thu_chi():
    return jsonify([tc_json(t) for t in ThuChi.query.order_by(ThuChi.id.desc()).all()])

@app.route('/api/thu_chi', methods=['POST'])
def add_thu_chi():
    d = request.json or {}
    obj = ThuChi(loai=d.get('loai','Thu'), danh_muc=d.get('danh_muc',''),
                 so_tien=int(d.get('so_tien') or 0), ngay=d.get('ngay',''),
                 mo_ta=d.get('mo_ta',''), doi_tuong=d.get('doi_tuong',''),
                 phuong_thuc=d.get('phuong_thuc','Tiền mặt'), ngay_tao=now_str())
    db.session.add(obj); db.session.commit()
    return jsonify({'msg':'Created','id':obj.id}), 201

@app.route('/api/thu_chi/<int:tid>', methods=['PUT','DELETE'])
def update_thu_chi(tid):
    obj = ThuChi.query.get_or_404(tid)
    if request.method == 'DELETE':
        db.session.delete(obj); db.session.commit(); return jsonify({'msg':'Deleted'})
    d = request.json or {}
    for f in ['loai','danh_muc','ngay','mo_ta','doi_tuong','phuong_thuc']:
        if f in d: setattr(obj, f, d[f])
    if 'so_tien' in d: obj.so_tien = int(d['so_tien'] or 0)
    db.session.commit(); return jsonify({'msg':'Updated'})

# ─── CHỨNG TỪ CRUD ────────────────────────────────────────────────────────────

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

# ─── NHÓM HÀNG CRUD ───────────────────────────────────────────────────────────

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

# ─── TUỔI VÀNG CRUD ────────────────────────────────────────────────────────────

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

# ─── KHOẢN VAY (LOAN MANAGEMENT) ───────────────────────────────────────────

@app.route('/api/scale/agents', methods=['GET'])
def get_scale_agents():
    agents = ScaleAgent.query.order_by(ScaleAgent.id.desc()).all()
    return jsonify([scale_agent_json(agent) for agent in agents])


@app.route('/api/scale/agents', methods=['POST'])
def add_scale_agent():
    d = request.json or {}
    agent_key = _clean_text(d.get('agent_key')) or _generate_scale_agent_key()
    if ScaleAgent.query.filter_by(agent_key=agent_key).first():
        return jsonify({'error': 'Agent key da ton tai'}), 400

    now = now_str()
    agent = ScaleAgent(
        agent_key=agent_key,
        device_name=_clean_text(d.get('device_name')) or 'May can vang',
        model=_clean_text(d.get('model')) or 'AND GP-20K',
        location=_clean_text(d.get('location')),
        serial_port=_clean_text(d.get('serial_port')),
        desired_settings=_normalize_scale_settings(d.get('desired_settings') or d.get('serial_settings')),
        created_at=now,
        updated_at=now,
    )
    db.session.add(agent)
    db.session.commit()
    return jsonify(scale_agent_json(agent)), 201


@app.route('/api/scale/agents/<int:agent_id>', methods=['GET', 'PUT', 'DELETE'])
def scale_agent_detail(agent_id):
    agent = ScaleAgent.query.get_or_404(agent_id)

    if request.method == 'GET':
        return jsonify(scale_agent_json(agent))

    if request.method == 'DELETE':
        ScaleReading.query.filter_by(agent_id=agent.id).delete()
        ScaleCommand.query.filter_by(agent_id=agent.id).delete()
        db.session.delete(agent)
        db.session.commit()
        return jsonify({'msg': 'Deleted'})

    d = request.json or {}
    new_key = _clean_text(d.get('agent_key'))
    if new_key and new_key != agent.agent_key:
        existing = ScaleAgent.query.filter(ScaleAgent.agent_key == new_key, ScaleAgent.id != agent.id).first()
        if existing:
            return jsonify({'error': 'Agent key da ton tai'}), 400
        agent.agent_key = new_key

    if 'device_name' in d:
        agent.device_name = _clean_text(d.get('device_name')) or agent.device_name
    if 'model' in d:
        agent.model = _clean_text(d.get('model')) or agent.model
    if 'location' in d:
        agent.location = _clean_text(d.get('location'))
    if 'serial_port' in d:
        agent.serial_port = _clean_text(d.get('serial_port'))
    if 'desired_settings' in d or 'serial_settings' in d:
        agent.desired_settings = _normalize_scale_settings(d.get('desired_settings') or d.get('serial_settings'))
    agent.updated_at = now_str()
    db.session.commit()
    return jsonify(scale_agent_json(agent))


@app.route('/api/scale/agents/<int:agent_id>/read', methods=['POST'])
def queue_scale_read(agent_id):
    agent = ScaleAgent.query.get_or_404(agent_id)
    d = request.json or {}

    existing = (
        ScaleCommand.query
        .filter(
            ScaleCommand.agent_id == agent.id,
            ScaleCommand.status.in_(['pending', 'dispatched'])
        )
        .order_by(ScaleCommand.id.desc())
        .first()
    )
    if existing:
        return jsonify({'message': 'Agent dang co lenh chua xu ly', 'command': scale_command_json(existing)}), 202

    cmd = ScaleCommand(
        agent_id=agent.id,
        command_type='read_weight',
        payload=_build_scale_command_payload(d),
        status='pending',
        requested_by=_clean_text(d.get('requested_by')) or 'Admin',
        requested_at=now_str(),
    )
    db.session.add(cmd)
    agent.updated_at = now_str()
    db.session.commit()
    return jsonify(scale_command_json(cmd)), 201


@app.route('/api/scale/readings', methods=['GET'])
def get_scale_readings():
    limit = request.args.get('limit', '30')
    try:
        limit = max(1, min(int(limit), 200))
    except (TypeError, ValueError):
        limit = 30

    q = ScaleReading.query
    agent_id = request.args.get('agent_id')
    if agent_id not in (None, ''):
        try:
            q = q.filter_by(agent_id=int(agent_id))
        except (TypeError, ValueError):
            return jsonify({'error': 'agent_id khong hop le'}), 400

    readings = q.order_by(ScaleReading.id.desc()).limit(limit).all()
    return jsonify([scale_reading_json(r) for r in readings])


@app.route('/api/scale/agent/heartbeat', methods=['POST'])
def scale_agent_heartbeat():
    d = request.get_json(force=True, silent=True) or {}
    agent_key = _clean_text(d.get('agent_key'))
    if not agent_key:
        return jsonify({'error': 'Thieu agent_key'}), 400

    now = now_str()
    agent = ScaleAgent.query.filter_by(agent_key=agent_key).first()
    created = False
    if agent is None:
        created = True
        agent = ScaleAgent(
            agent_key=agent_key,
            device_name=_clean_text(d.get('device_name')) or 'May can vang',
            model=_clean_text(d.get('model')) or 'AND GP-20K',
            location=_clean_text(d.get('location')),
            created_at=now,
        )
        db.session.add(agent)

    if d.get('device_name'):
        agent.device_name = _clean_text(d.get('device_name')) or agent.device_name
    if d.get('model'):
        agent.model = _clean_text(d.get('model')) or agent.model
    if 'location' in d:
        agent.location = _clean_text(d.get('location'))
    if 'machine_name' in d:
        agent.machine_name = _clean_text(d.get('machine_name'))
    if 'serial_port' in d:
        agent.serial_port = _clean_text(d.get('serial_port'))
    if 'serial_settings' in d:
        agent.serial_settings = _normalize_scale_settings(d.get('serial_settings'))
    if 'last_error' in d:
        agent.last_error = _clean_text(d.get('last_error'))
    if not agent.desired_settings:
        agent.desired_settings = _normalize_scale_settings(d.get('serial_settings'))
    agent.status = 'online'
    agent.last_seen = now
    agent.updated_at = now
    db.session.commit()
    return jsonify({'msg': 'ok', 'created': created, 'agent': scale_agent_json(agent)})


@app.route('/api/scale/agent/poll', methods=['GET'])
def scale_agent_poll():
    agent_key = _clean_text(request.args.get('agent_key'))
    if not agent_key:
        return jsonify({'error': 'Thieu agent_key'}), 400

    agent = ScaleAgent.query.filter_by(agent_key=agent_key).first()
    if agent is None:
        return jsonify({'error': 'Khong tim thay agent'}), 404

    cmd = (
        ScaleCommand.query
        .filter_by(agent_id=agent.id, status='pending')
        .order_by(ScaleCommand.id.asc())
        .first()
    )
    if cmd is None:
        return jsonify({
            'command': None,
            'desired_settings': agent.desired_settings or _normalize_scale_settings({}),
            'server_time': now_str(),
        })

    cmd.status = 'dispatched'
    cmd.dispatched_at = now_str()
    agent.status = 'online'
    agent.last_seen = now_str()
    agent.updated_at = now_str()
    db.session.commit()
    return jsonify({
        'command': scale_command_json(cmd),
        'desired_settings': agent.desired_settings or _normalize_scale_settings({}),
        'server_time': now_str(),
    })


@app.route('/api/scale/agent/commands/<int:command_id>/result', methods=['POST'])
def scale_agent_command_result(command_id):
    d = request.get_json(force=True, silent=True) or {}
    agent_key = _clean_text(d.get('agent_key'))
    if not agent_key:
        return jsonify({'error': 'Thieu agent_key'}), 400

    cmd = ScaleCommand.query.get_or_404(command_id)
    agent = ScaleAgent.query.get_or_404(cmd.agent_id)
    if agent.agent_key != agent_key:
        return jsonify({'error': 'agent_key khong khop lenh'}), 403

    now = now_str()
    status = _clean_text(d.get('status')).lower()
    failed = status in {'failed', 'error'}
    cmd.status = 'failed' if failed else 'completed'
    cmd.completed_at = now
    cmd.error = _clean_text(d.get('error'))
    cmd.result = d.get('result') if isinstance(d.get('result'), dict) else {}

    reading_payload = d.get('reading') if isinstance(d.get('reading'), dict) else None
    reading_obj = None
    if reading_payload:
        reading_obj = ScaleReading(
            agent_id=agent.id,
            command_id=cmd.id,
            stable=bool(reading_payload.get('stable')),
            header=_clean_text(reading_payload.get('header')).upper(),
            weight_text=_clean_text(reading_payload.get('weight_text')),
            weight_value=_coerce_scale_weight(reading_payload.get('weight_value')),
            unit=_clean_text(reading_payload.get('unit')),
            raw_line=_clean_text(reading_payload.get('raw_line')),
            meta=reading_payload.get('meta') if isinstance(reading_payload.get('meta'), dict) else {},
            created_at=now,
        )
        db.session.add(reading_obj)

        agent.last_weight_text = reading_obj.weight_text
        agent.last_weight_value = reading_obj.weight_value
        agent.last_unit = reading_obj.unit
        agent.last_stable = reading_obj.stable
        agent.last_raw_line = reading_obj.raw_line
        agent.last_read_at = now

    agent.status = 'online'
    agent.last_seen = now
    agent.updated_at = now
    agent.last_error = cmd.error if failed else ''

    db.session.flush()
    if reading_obj is not None:
        cmd.result = {**(cmd.result or {}), 'reading_id': reading_obj.id}
    db.session.commit()
    return jsonify({'msg': 'ok', 'command': scale_command_json(cmd)})


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

# ─── OCR VIA GEMINI VISION ───────────────────────────────────────────────────
GEMINI_KEY = os.environ.get('GEMINI_API_KEY', '')

@app.route('/api/ocr', methods=['POST'])
def ocr_image():
    if not GEMINI_KEY:
        return jsonify({'error': 'GEMINI_API_KEY chưa được cấu hình trên server'}), 500
    d = request.get_json(force=True, silent=True) or {}

    img_b64  = d.get('image_base64', '')
    mime     = d.get('mime_type', 'image/jpeg')
    if not img_b64:
        return jsonify({'error': 'Không có dữ liệu ảnh'}), 400

    # Gemini 2.0 Flash REST
    payload = {
        "contents": [{
            "parts": [
                {"inline_data": {"mime_type": mime, "data": img_b64}},
                {"text": (
                    "Bạn là công cụ OCR chuyên nghiệp cho chứng từ tài chính/ngân hàng.\n"
                    "Hãy đọc toàn bộ nội dung văn bản trong ảnh này, giữ nguyên cấu trúc bảng/danh sách nếu có.\n"
                    "Trả về nội dung thô, không thêm ghi chú hay giải thích."
                )},
            ]
        }],
        "generationConfig": {"temperature": 0, "maxOutputTokens": 4096}
    }
    url = f'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEMINI_KEY}'
    req = urllib.request.Request(
        url, data=json.dumps(payload).encode(),
        headers={'Content-Type': 'application/json'}, method='POST'
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read())
        text = result['candidates'][0]['content']['parts'][0]['text']
        return jsonify({'text': text})
    except Exception as e:
        return jsonify({'error': f'Gemini error: {str(e)}'}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001)
