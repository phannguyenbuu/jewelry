/* eslint-disable react-refresh/only-export-components */
import { useRef, useState } from 'react';
import ImageOcrUpload from '../components/ImageOcrUpload';
import { API_BASE } from '../lib/api';

const API = API_BASE;
const fmt = n => n ? Number(n).toLocaleString('vi-VN') : '0';
const fmtB = n => { // format tỷ/triệu
    if (!n) return '0';
    if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(2) + ' tỷ';
    if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(0) + ' tr';
    return fmt(n);
};

// ── Tooltip ℹ ─────────────────────────────────────────────────────────
function InfoTip({ text }) {
    const [show, setShow] = useState(false);
    const ref = useRef();
    const [pos, setPos] = useState({ top: 0, left: 0 });

    const handleEnter = () => {
        if (ref.current) {
            const r = ref.current.getBoundingClientRect();
            setPos({ top: r.bottom + 8, left: Math.min(r.left - 10, window.innerWidth - 280) });
        }
        setShow(true);
    };

    return (
        <span ref={ref} style={{ position: 'relative', display: 'inline-flex', verticalAlign: 'middle', marginLeft: 5 }}
            onMouseEnter={handleEnter} onMouseLeave={() => setShow(false)}>
            <span style={{ width: 15, height: 15, borderRadius: '50%', background: '#e2e8f0', color: '#64748b', fontSize: 9, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', userSelect: 'none', lineHeight: 1 }}>i</span>
            {show && (
                <div style={{ position: 'fixed', top: pos.top, left: pos.left, background: '#1e293b', color: 'white', borderRadius: 10, padding: '10px 14px', fontSize: 12, lineHeight: 1.55, whiteSpace: 'pre-line', width: 260, boxShadow: '0 8px 24px rgba(0,0,0,.35)', zIndex: 9999, pointerEvents: 'none' }}>
                    {text}
                    <div style={{ position: 'absolute', bottom: '100%', left: 18, borderWidth: 6, borderStyle: 'solid', borderColor: 'transparent transparent #1e293b transparent' }} />
                </div>
            )}
        </span>
    );
}


const KPI_TIPS = {
    'Tổng dư nợ': 'Tổng tiền doanh nghiệp đang còn nợ ngân hàng tại thời điểm hiện tại (tất cả hợp đồng đang hoạt động cộng lại).\n\nVD: Vay VCB 3 tỷ + BIDV 2 tỷ = 5 tỷ dư nợ',
    'WACC bình quân': 'Lãi suất trung bình có trọng số của tất cả khoản vay, tính theo tỷ trọng số tiền.\n\nCông thức:\nWACC = Σ(Số tiền vay_i × Lãi suất_i) / Tổng dư nợ\n\nVD: 3 tỷ × 9% + 2 tỷ × 11% / 5 tỷ = 9.8%/năm',
    'Cảnh báo Covenant': 'Covenant = cam kết tài chính mà ngân hàng yêu cầu duy trì. Vi phạm → ngân hàng có thể thu hồi nợ trước hạn.\n\nHệ thống kiểm tra:\n• DSCR ≥ 1.2 (khả năng trả nợ từ lợi nhuận)\n• D/E ≤ 3.0 (đòn bẩy tài chính)',
    'Thanh toán 30 ngày': 'Tổng tiền (gốc + lãi) cần chuẩn bị để trả ngân hàng trong 30 ngày tới.\n\nGiúp quản lý dòng tiền ngắn hạn, tránh thiếu tiền đột ngột khi đến kỳ trả.',
};

// ── Màu trạng thái ──────────────────────────────────────────────────
const STATUS = {
    dang_vay: { label: 'Đang vay', bg: '#dbeafe', text: '#1d4ed8' },
    da_tat: { label: 'Đã tất toán', bg: '#dcfce7', text: '#15803d' },
    qua_han: { label: 'Quá hạn', bg: '#fee2e2', text: '#dc2626' },
    tam_hoan: { label: 'Tạm hoãn', bg: '#fef9c3', text: '#854d0e' },
};
const PAY_STATUS = {
    cho_tra: { label: 'Chờ trả', bg: '#f1f5f9', text: '#64748b' },
    da_tra: { label: 'Đã trả', bg: '#dcfce7', text: '#15803d' },
    qua_han: { label: 'Quá hạn', bg: '#fee2e2', text: '#dc2626' },
};
const LOAI_LAI = { co_dinh: 'Cố định', tha_noi: 'Thả nổi' };
const LOAI_TRA = { du_no: 'Dư nợ giảm dần', deu: 'Trả đều (annuity)', cuoi_ky: 'Trả cuối kỳ' };

const inp = { width: '100%', padding: '8px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', outline: 'none', fontSize: 13, boxSizing: 'border-box', background: 'white' };

// ── Tính amortization ────────────────────────────────────────────────
function buildSchedule(loan) {
    const { so_tien_vay: P, lai_suat_ht: rate, ky_han_thang: n, loai_tra_no, ngay_bat_dau } = loan;
    if (!P || !n) return [];
    const r = (rate || 0) / 100 / 12;
    let rows = [];
    let balance = P;
    let startDate = ngay_bat_dau ? parseDate(ngay_bat_dau) : new Date();

    for (let k = 1; k <= n; k++) {
        const payDate = addMonths(startDate, k);
        const interest = Math.round(balance * r);
        let principal, total;
        if (loai_tra_no === 'deu' && r > 0) {
            total = Math.round(P * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1));
            principal = total - interest;
        } else if (loai_tra_no === 'cuoi_ky') {
            principal = k === n ? P : 0;
            total = principal + interest;
        } else { // du_no (dư nợ giảm dần)
            principal = Math.round(P / n);
            if (k === n) principal = balance; // adjust last
            total = principal + interest;
        }
        rows.push({
            ky_so: k,
            ngay_tra: formatDate(payDate),
            so_du_dau: balance,
            tien_goc: principal,
            tien_lai: interest,
            tong_tra: total,
            so_du_cuoi: Math.max(0, balance - principal),
            trang_thai: 'cho_tra',
        });
        balance = Math.max(0, balance - principal);
    }
    return rows;
}

function parseDate(s) {
    if (!s) return new Date();
    const [d, m, y] = s.split('/');
    return new Date(+y, +m - 1, +d);
}
function addMonths(d, n) {
    const dt = new Date(d);
    dt.setMonth(dt.getMonth() + n);
    return dt;
}
function formatDate(d) {
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}
function today() { return formatDate(new Date()); }

// ── Alert / Covenant checker ─────────────────────────────────────────
function calcCovenant(loan) {
    const alerts = [];
    // DSCR = EBITDA_tháng * 12 / (tổng trả nợ năm)
    const ebidta_year = (loan.ebitda_thang || 0) * 12;
    const monthly_payment = loan._monthly_payment || 0;
    const annual_debt = monthly_payment * 12;
    const dscr = annual_debt > 0 ? ebidta_year / annual_debt : null;
    // D/E ratio
    const de_ratio = loan.von_chu_so_huu > 0
        ? (loan.so_tien_vay / loan.von_chu_so_huu) : null;

    if (dscr !== null) {
        const min = loan.dscr_min || 1.2;
        if (dscr < min) alerts.push({ level: 'danger', msg: `DSCR ${dscr.toFixed(2)} < ${min} (vi phạm)` });
        else if (dscr < min * 1.1) alerts.push({ level: 'warn', msg: `DSCR ${dscr.toFixed(2)} gần ngưỡng ${min}` });
    }
    if (de_ratio !== null) {
        const max = loan.de_ratio_max || 3.0;
        if (de_ratio > max) alerts.push({ level: 'danger', msg: `D/E ${de_ratio.toFixed(2)} > ${max} (vi phạm)` });
        else if (de_ratio > max * 0.9) alerts.push({ level: 'warn', msg: `D/E ${de_ratio.toFixed(2)} gần ngưỡng ${max}` });
    }
    return { dscr, de_ratio, alerts };
}

// ── Modal ────────────────────────────────────────────────────────────
function Modal({ open, onClose, title, children, maxWidth = 760 }) {
    if (!open) return null;
    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: 20 }}>
            <div style={{ background: 'white', borderRadius: 16, width: '100%', maxWidth, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 24px 60px rgba(0,0,0,.25)' }}>
                <div style={{ padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#1e293b', borderRadius: '16px 16px 0 0', position: 'sticky', top: 0, zIndex: 1 }}>
                    <h2 style={{ color: 'white', margin: 0, fontSize: 15, fontWeight: 800 }}>{title}</h2>
                    <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'white', fontSize: 22, cursor: 'pointer' }}>×</button>
                </div>
                <div style={{ padding: 24 }}>{children}</div>
            </div>
        </div>
    );
}

function Field({ label, children, half }) {
    return (
        <div style={{ gridColumn: half ? 'auto' : 'auto' }}>
            <label style={{ fontSize: 10, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4, letterSpacing: .4 }}>{label}</label>
            {children}
        </div>
    );
}


function DocUploadSection({ docs, onChange }) {
    const [ocrTarget, setOcrTarget] = useState(null); // File object for OCR

    const addFiles = (e) => {
        const files = Array.from(e.target.files);
        const newDocs = files.map(f => ({ name: f.name, size: f.size, type: f.type, url: URL.createObjectURL(f), _file: f, note: '' }));
        onChange([...docs, ...newDocs]);
        e.target.value = '';
    };

    const remove = (i) => onChange(docs.filter((_, idx) => idx !== i));

    return (
        <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 16, marginTop: 8, marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: .4 }}>📎 CHỨNG TỪ ĐÍNH KÈM ({docs.length})</div>
                <label style={{ padding: '6px 14px', borderRadius: 7, border: '1.5px solid #6366f1', background: '#f5f3ff', color: '#6366f1', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                    + Thêm file
                    <input type="file" multiple accept="image/*,.pdf" style={{ display: 'none' }} onChange={addFiles} />
                </label>
            </div>
            {docs.length === 0 && (
                <div style={{ textAlign: 'center', padding: '20px 0', color: '#94a3b8', fontSize: 13, border: '1.5px dashed #e2e8f0', borderRadius: 10 }}>
                    Chưa có chứng từ — nhấn "+ Thêm file" để upload
                </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {docs.map((doc, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', background: '#f8fafc', borderRadius: 9, border: '1px solid #e2e8f0' }}>
                        <span style={{ fontSize: 18 }}>{doc.type?.startsWith('image') ? '🖼️' : '📄'}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.name}</div>
                            <div style={{ fontSize: 10, color: '#94a3b8' }}>{doc.size ? (doc.size / 1024).toFixed(0) + ' KB' : ''}</div>
                        </div>
                        {doc.url && <a href={doc.url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: '#2563eb', textDecoration: 'none', fontWeight: 600, padding: '4px 10px', borderRadius: 6, border: '1px solid #bfdbfe', background: '#eff6ff', whiteSpace: 'nowrap' }}>👁 Xem</a>}
                        <button type="button" onClick={() => setOcrTarget(doc._file || doc)}
                            style={{ fontSize: 11, color: '#7c3aed', fontWeight: 700, padding: '4px 10px', borderRadius: 6, border: '1px solid #ddd6fe', background: '#f5f3ff', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                            📝 Note OCR
                        </button>
                        <button type="button" onClick={() => remove(i)}
                            style={{ fontSize: 16, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1, padding: '2px 4px' }}>×</button>
                    </div>
                ))}
            </div>
            {ocrTarget && (
                <ImageOcrUpload
                    initialFile={ocrTarget}
                    onClose={() => setOcrTarget(null)}
                    apiUrl={typeof API !== 'undefined' ? API : ''}
                />
            )}
        </div>
    );
}

// ── FORM thêm/sửa khoản vay ─────────────────────────────────────────
const EMPTY_FORM = {
    ma_hd: '', ngan_hang: '', so_tien_vay: '', loai_lai: 'co_dinh', lai_co_so: '',
    bien_do: '', lai_suat_ht: '', phi_ban_dau: '', phi_tra_truoc: '0',
    ngay_giai_ngan: '', ngay_bat_dau: '', ngay_tat_toan: '', ky_han_thang: '12',
    loai_tra_no: 'du_no', tai_san_dam_bao: '', muc_dich: '',
    trang_thai: 'dang_vay', dscr_min: '1.2', de_ratio_max: '3.0',
    ebitda_thang: '', tong_tai_san: '', von_chu_so_huu: '', ghi_chu: '',
};

export { API, EMPTY_FORM, fmt, fmtB, InfoTip, KPI_TIPS, STATUS, PAY_STATUS, LOAI_LAI, LOAI_TRA, inp, buildSchedule, parseDate, addMonths, formatDate, today, calcCovenant, Modal, Field, DocUploadSection };
