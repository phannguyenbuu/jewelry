from .state import db


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
    status       = db.Column(db.String(50),  default='Tồn kho', index=True)
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


class KhachHang(db.Model):
    __tablename__  = 'khach_hang'
    id             = db.Column(db.Integer, primary_key=True)
    ten            = db.Column(db.String(200), default='', index=True)
    cccd           = db.Column(db.String(50), default='', index=True)
    cmnd_cu        = db.Column(db.String(50), default='')
    ngay_sinh      = db.Column(db.String(30), default='')
    gioi_tinh      = db.Column(db.String(20), default='')
    quoc_tich      = db.Column(db.String(100), default='')
    que_quan       = db.Column(db.Text)
    noi_thuong_tru = db.Column(db.Text)
    dia_chi        = db.Column(db.Text)
    so_dien_thoai  = db.Column(db.String(30), default='', index=True)
    ngay_cap_cccd  = db.Column(db.String(30), default='')
    han_the        = db.Column(db.String(30), default='')
    sao            = db.Column(db.Integer, default=0)
    yeu_thich      = db.Column(db.Integer, default=0, index=True)
    ocr_mat_sau    = db.Column(db.Text)
    anh_mat_truoc  = db.Column(db.Text)
    anh_mat_sau    = db.Column(db.Text)
    anh_bo_suu_tap = db.Column(db.JSON, default=list)
    nguoi_tao      = db.Column(db.String(150), default='')
    ngay_tao       = db.Column(db.String(30), default='')
    cap_nhat_luc   = db.Column(db.String(30), default='')


class HangSuaBo(db.Model):
    __tablename__ = 'hang_sua_bo'
    id            = db.Column(db.Integer, primary_key=True)
    ma_phieu      = db.Column(db.String(80), unique=True, nullable=False)
    loai_xu_ly    = db.Column(db.String(20), default='sua')
    items         = db.Column(db.JSON, default=list)
    tong_dong     = db.Column(db.Integer, default=0)
    tong_them_tl  = db.Column(db.String(50), default='')
    tong_bot_tl   = db.Column(db.String(50), default='')
    ghi_chu       = db.Column(db.Text)
    nguoi_tao     = db.Column(db.String(150), default='')
    trang_thai    = db.Column(db.String(50), default='Mới')
    ngay_tao      = db.Column(db.String(30), default='')
    cap_nhat_luc  = db.Column(db.String(30), default='')


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


class ThuNganSoQuy(db.Model):
    __tablename__    = 'thu_ngan_so_quy'
    id               = db.Column(db.Integer, primary_key=True)
    ngay             = db.Column(db.String(20), unique=True, nullable=False)
    so_tien_dau_ngay = db.Column(db.BigInteger, default=0)
    so_tien_hien_tai = db.Column(db.BigInteger, default=0)
    lich_su_chot     = db.Column(db.JSON, default=list)
    ghi_chu          = db.Column(db.Text)
    ngay_tao         = db.Column(db.String(30), default='')
    cap_nhat_luc     = db.Column(db.String(30), default='')


class ThuNganSoQuyTheoNguoi(db.Model):
    __tablename__    = 'thu_ngan_so_quy_theo_nguoi'
    id               = db.Column(db.Integer, primary_key=True)
    ngay             = db.Column(db.String(20), nullable=False)
    thu_ngan_id      = db.Column(db.Integer, nullable=False)
    so_tien_dau_ngay = db.Column(db.BigInteger, default=0)
    so_tien_hien_tai = db.Column(db.BigInteger, default=0)
    chi_tiet         = db.Column(db.JSON, default=list)
    lich_su_chot     = db.Column(db.JSON, default=list)
    ghi_chu          = db.Column(db.Text)
    ngay_tao         = db.Column(db.String(30), default='')
    cap_nhat_luc     = db.Column(db.String(30), default='')


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


class HeThongCauHinh(db.Model):
    __tablename__ = 'he_thong_cau_hinh'
    id            = db.Column(db.Integer, primary_key=True)
    config_key    = db.Column(db.String(120), nullable=False, unique=True)
    data          = db.Column(db.JSON, default=dict)
    ghi_chu       = db.Column(db.Text)
    ngay_tao      = db.Column(db.String(30), default='')
    cap_nhat_luc  = db.Column(db.String(30), default='')


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


class PrintAgent(db.Model):
    __tablename__ = 'print_agent'
    id               = db.Column(db.Integer, primary_key=True)
    agent_key        = db.Column(db.String(80), unique=True, nullable=False)
    device_name      = db.Column(db.String(150), nullable=False, default='May in LAN agent')
    location         = db.Column(db.String(150), default='')
    machine_name     = db.Column(db.String(150), default='')
    status           = db.Column(db.String(30), default='offline')
    last_seen        = db.Column(db.String(30), default='')
    last_error       = db.Column(db.Text, default='')
    last_scan_at     = db.Column(db.String(30), default='')
    printer_count    = db.Column(db.Integer, default=0)
    created_at       = db.Column(db.String(30), default='')
    updated_at       = db.Column(db.String(30), default='')


class PrintDevice(db.Model):
    __tablename__ = 'print_device'
    id             = db.Column(db.Integer, primary_key=True)
    agent_id       = db.Column(db.Integer, db.ForeignKey('print_agent.id'), nullable=False)
    printer_name   = db.Column(db.String(255), nullable=False, default='')
    share_name     = db.Column(db.String(255), default='')
    unc_path       = db.Column(db.String(255), default='')
    system_name    = db.Column(db.String(255), default='')
    driver_name    = db.Column(db.String(255), default='')
    port_name      = db.Column(db.String(255), default='')
    location       = db.Column(db.String(255), default='')
    comment        = db.Column(db.String(255), default='')
    source         = db.Column(db.String(50), default='local')
    is_default     = db.Column(db.Boolean, default=False)
    is_network     = db.Column(db.Boolean, default=False)
    is_shared      = db.Column(db.Boolean, default=False)
    work_offline   = db.Column(db.Boolean, default=False)
    printer_status = db.Column(db.String(80), default='')
    meta           = db.Column(db.JSON, default=dict)
    last_seen      = db.Column(db.String(30), default='')
    updated_at     = db.Column(db.String(30), default='')


class PrintCommand(db.Model):
    __tablename__ = 'print_command'
    id            = db.Column(db.Integer, primary_key=True)
    agent_id      = db.Column(db.Integer, db.ForeignKey('print_agent.id'), nullable=False)
    printer_name  = db.Column(db.String(255), nullable=False, default='')
    document_name = db.Column(db.String(255), default='')
    payload       = db.Column(db.JSON, default=dict)
    status        = db.Column(db.String(20), default='pending')
    requested_by  = db.Column(db.String(80), default='Admin')
    requested_at  = db.Column(db.String(30), default='')
    dispatched_at = db.Column(db.String(30), default='')
    completed_at  = db.Column(db.String(30), default='')
    result        = db.Column(db.JSON, default=dict)
    error         = db.Column(db.Text, default='')


class NhapVangList(db.Model):
    __tablename__ = 'nhap_vang_list'
    id            = db.Column(db.Integer, primary_key=True)
    ten_danh_sach = db.Column(db.String(200), nullable=False)
    ghi_chu       = db.Column(db.Text)
    trang_thai    = db.Column(db.String(30), default='dang_mo')
    nguoi_tao     = db.Column(db.String(150), default='')
    ngay_tao      = db.Column(db.String(30), default='')
    ngay_cap_nhat = db.Column(db.String(30), default='')
    items         = db.relationship(
        'NhapVangItem',
        backref='danh_sach',
        cascade='all,delete-orphan',
        lazy=True,
        order_by='NhapVangItem.thu_tu, NhapVangItem.id'
    )


class NhapVangItem(db.Model):
    __tablename__ = 'nhap_vang_item'
    id                = db.Column(db.Integer, primary_key=True)
    list_id           = db.Column(db.Integer, db.ForeignKey('nhap_vang_list.id'), nullable=False)
    ten_hang          = db.Column(db.String(200), nullable=False)
    nhom_hang         = db.Column(db.String(150), default='')
    tuoi_vang         = db.Column(db.String(150), default='')
    trong_luong       = db.Column(db.String(50), default='')
    so_luong_yeu_cau  = db.Column(db.Integer, default=0)
    so_luong_da_nhap  = db.Column(db.Integer, default=0)
    ghi_chu           = db.Column(db.Text)
    thu_tu            = db.Column(db.Integer, default=0)
    ngay_tao          = db.Column(db.String(30), default='')
    ngay_cap_nhat     = db.Column(db.String(30), default='')
