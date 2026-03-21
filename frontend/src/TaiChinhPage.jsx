import { useState, useEffect, useCallback, useRef } from 'react';

const API = import.meta.env.VITE_API_URL || '';
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

// ── Document Upload + OCR Section ────────────────────────────────────
function OcrModal({ file, onClose }) {
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState('');
    const [preview, setPreview] = useState('');

    useEffect(() => {
        if (!file) return;
        const url = URL.createObjectURL(file);
        setPreview(url);
        runOcr(file);
        return () => URL.revokeObjectURL(url);
    }, [file]);

    const runOcr = async (f) => {
        setLoading(true); setResult('');
        try {
            const reader = new FileReader();
            reader.onload = async (ev) => {
                const base64 = ev.target.result.split(',')[1];
                const mime = f.type || 'image/jpeg';
                const res = await fetch(`${API}/api/ocr`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ image_base64: base64, mime_type: mime, file_name: f.name }),
                });
                const data = await res.json();
                setResult(data.text || data.error || 'Không đọc được nội dung');
                setLoading(false);
            };
            reader.readAsDataURL(f);
        } catch (e) {
            setResult('Lỗi kết nối: ' + e.message);
            setLoading(false);
        }
    };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000, padding: 20 }}>
            <div style={{ background: 'white', borderRadius: 16, width: '100%', maxWidth: 820, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 60px rgba(0,0,0,.3)' }}>
                <div style={{ padding: '14px 20px', background: '#1e293b', borderRadius: '16px 16px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ color: 'white', fontWeight: 800, fontSize: 14 }}>🔍 OCR — {file?.name}</div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'white', fontSize: 22, cursor: 'pointer' }}>×</button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', flex: 1, overflow: 'hidden', minHeight: 0 }}>
                    {/* Preview */}
                    <div style={{ borderRight: '1px solid #e2e8f0', padding: 16, overflowY: 'auto', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {preview && (file?.type?.startsWith('image') ?
                            <img src={preview} style={{ maxWidth: '100%', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,.1)' }} alt="preview" /> :
                            <div style={{ textAlign: 'center', color: '#64748b', fontSize: 13 }}>📄 {file?.name}</div>
                        )}
                    </div>
                    {/* OCR Result */}
                    <div style={{ padding: 16, overflowY: 'auto' }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 10, letterSpacing: .4 }}>NỘI DUNG TRÍCH XUẤT</div>
                        {loading ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '40px 0', color: '#64748b' }}>
                                <div style={{ width: 36, height: 36, border: '3px solid #e2e8f0', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                                <div style={{ fontSize: 13 }}>Đang nhận dạng bằng AI...</div>
                            </div>
                        ) : (
                            <div style={{ fontSize: 13, lineHeight: 1.7, whiteSpace: 'pre-wrap', color: '#1e293b', background: '#f0f4f8', borderRadius: 8, padding: 14, fontFamily: 'monospace', userSelect: 'all' }}>
                                {result || '—'}
                            </div>
                        )}
                        {result && (
                            <button onClick={() => navigator.clipboard.writeText(result)}
                                style={{ marginTop: 10, padding: '7px 16px', borderRadius: 7, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#6366f1' }}>
                                📋 Copy nội dung
                            </button>
                        )}
                    </div>
                </div>
            </div>
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
            {ocrTarget && <OcrModal file={ocrTarget} onClose={() => setOcrTarget(null)} />}
            <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
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

function LoanForm({ form, setForm, loaiVangList, onSubmit, onClose, isEdit }) {
    const effRate = form.loai_lai === 'tha_noi'
        ? (parseFloat(form.lai_co_so || 0) + parseFloat(form.bien_do || 0)).toFixed(2)
        : form.lai_suat_ht;

    const schedule = buildSchedule({
        so_tien_vay: +form.so_tien_vay || 0,
        lai_suat_ht: +effRate || 0,
        ky_han_thang: +form.ky_han_thang || 0,
        loai_tra_no: form.loai_tra_no,
        ngay_bat_dau: form.ngay_bat_dau,
    });
    const firstRow = schedule[0];

    return (
        <form onSubmit={onSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
                <Field label="Mã hợp đồng *">
                    <input required style={inp} value={form.ma_hd} onChange={e => setForm({ ...form, ma_hd: e.target.value })} placeholder="VD: VCB-2026-001" />
                </Field>
                <Field label="Ngân hàng *">
                    <input required style={inp} value={form.ngan_hang} onChange={e => setForm({ ...form, ngan_hang: e.target.value })} placeholder="VD: Vietcombank" />
                </Field>
                <Field label="Số tiền vay (₫) *">
                    <input required type="number" style={inp} value={form.so_tien_vay} onChange={e => setForm({ ...form, so_tien_vay: e.target.value })} placeholder="VD: 5000000000" />
                    {form.so_tien_vay > 0 && <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>= {fmtB(+form.so_tien_vay)}</div>}
                </Field>
                <Field label="Phí ban đầu (₫)">
                    <input type="number" style={inp} value={form.phi_ban_dau} onChange={e => setForm({ ...form, phi_ban_dau: e.target.value })} placeholder="0" />
                </Field>
                <Field label="Loại lãi suất">
                    <select style={inp} value={form.loai_lai} onChange={e => setForm({ ...form, loai_lai: e.target.value })}>
                        <option value="co_dinh">Cố định</option>
                        <option value="tha_noi">Thả nổi (Base + Margin)</option>
                    </select>
                </Field>
                {form.loai_lai === 'tha_noi' ? (<>
                    <Field label="Lãi cơ sở %/năm">
                        <input type="number" step="0.01" style={inp} value={form.lai_co_so} onChange={e => setForm({ ...form, lai_co_so: e.target.value, lai_suat_ht: (parseFloat(e.target.value || 0) + parseFloat(form.bien_do || 0)).toFixed(2) })} />
                    </Field>
                    <Field label="Biên độ (Margin) %/năm">
                        <input type="number" step="0.01" style={inp} value={form.bien_do} onChange={e => setForm({ ...form, bien_do: e.target.value, lai_suat_ht: (parseFloat(form.lai_co_so || 0) + parseFloat(e.target.value || 0)).toFixed(2) })} />
                    </Field>
                    <Field label="Lãi suất hiệu lực (tự tính)">
                        <div style={{ ...inp, background: '#f0fdf4', color: '#15803d', fontWeight: 700, display: 'flex', alignItems: 'center' }}>{effRate}%/năm</div>
                    </Field>
                </>) : (
                    <Field label="Lãi suất %/năm *">
                        <input required type="number" step="0.01" style={inp} value={form.lai_suat_ht} onChange={e => setForm({ ...form, lai_suat_ht: e.target.value })} placeholder="VD: 9.5" />
                    </Field>
                )}
                <Field label="Kỳ hạn (tháng)">
                    <input type="number" style={inp} value={form.ky_han_thang} onChange={e => setForm({ ...form, ky_han_thang: e.target.value })} />
                </Field>
                <Field label="Hình thức trả nợ">
                    <select style={inp} value={form.loai_tra_no} onChange={e => setForm({ ...form, loai_tra_no: e.target.value })}>
                        {Object.entries(LOAI_TRA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                </Field>
                <Field label="Ngày giải ngân (dd/mm/yyyy)">
                    <input style={inp} value={form.ngay_giai_ngan} onChange={e => setForm({ ...form, ngay_giai_ngan: e.target.value })} placeholder="20/03/2026" />
                </Field>
                <Field label="Ngày bắt đầu tính lãi">
                    <input style={inp} value={form.ngay_bat_dau} onChange={e => setForm({ ...form, ngay_bat_dau: e.target.value })} placeholder="20/03/2026" />
                </Field>
                <Field label="Ngày tất toán dự kiến">
                    <input style={inp} value={form.ngay_tat_toan} onChange={e => setForm({ ...form, ngay_tat_toan: e.target.value })} placeholder="20/03/2028" />
                </Field>
                <Field label="Phạt trả trước (%)">
                    <input type="number" step="0.1" style={inp} value={form.phi_tra_truoc} onChange={e => setForm({ ...form, phi_tra_truoc: e.target.value })} placeholder="0" />
                </Field>
                <Field label="Trạng thái">
                    <select style={inp} value={form.trang_thai} onChange={e => setForm({ ...form, trang_thai: e.target.value })}>
                        {Object.entries(STATUS).map(([k, { label }]) => <option key={k} value={k}>{label}</option>)}
                    </select>
                </Field>
            </div>

            {/* Tài sản đảm bảo */}
            <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 16, marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 10, letterSpacing: .4 }}>🏠 TÀI SẢN ĐẢM BẢO & MỤC ĐÍCH</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    <Field label="Tài sản đảm bảo">
                        <textarea style={{ ...inp, height: 70, resize: 'vertical' }} value={form.tai_san_dam_bao} onChange={e => setForm({ ...form, tai_san_dam_bao: e.target.value })} placeholder="VD: QSDĐ 500m² tại số 11 Lê Thị Pha..." />
                    </Field>
                    <Field label="Mục đích vay">
                        <textarea style={{ ...inp, height: 70, resize: 'vertical' }} value={form.muc_dich} onChange={e => setForm({ ...form, muc_dich: e.target.value })} placeholder="VD: Bổ sung vốn lưu động..." />
                    </Field>
                </div>
            </div>

            {/* Covenant */}
            <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 16, marginBottom: 16 }}>
                <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: .4 }}>📊 CAM KẾT TÀI CHÍNH (COVENANT)</div>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>Các ngưỡng tài chính ngân hàng yêu cầu duy trì — vi phạm có thể bị thu hồi nợ trước hạn</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
                    <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 3, textTransform: 'uppercase', letterSpacing: .5 }}>DSCR tối thiểu</div>
                        <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 6 }}>Khả năng trả nợ từ lợi nhuận · phải ≥ ngưỡng</div>
                        <input type="number" step="0.1" style={inp} value={form.dscr_min} onChange={e => setForm({ ...form, dscr_min: e.target.value })} />
                    </div>
                    <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 3, textTransform: 'uppercase', letterSpacing: .5 }}>D/E tối đa</div>
                        <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 6 }}>Đòn bẩy tài chính (Nợ / Vốn CSH) · phải ≤ ngưỡng</div>
                        <input type="number" step="0.1" style={inp} value={form.de_ratio_max} onChange={e => setForm({ ...form, de_ratio_max: e.target.value })} />
                    </div>
                    <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 3, textTransform: 'uppercase', letterSpacing: .5 }}>EBITDA / tháng (₫)</div>
                        <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 6 }}>Lợi nhuận trước thuế + khấu hao · dùng tính DSCR</div>
                        <input type="number" style={inp} value={form.ebitda_thang} onChange={e => setForm({ ...form, ebitda_thang: e.target.value })} placeholder="0" />
                    </div>
                    <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 3, textTransform: 'uppercase', letterSpacing: .5 }}>Vốn chủ sở hữu (₫)</div>
                        <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 6 }}>Tổng vốn CSH hiện tại · dùng tính tỷ lệ D/E</div>
                        <input type="number" style={inp} value={form.von_chu_so_huu} onChange={e => setForm({ ...form, von_chu_so_huu: e.target.value })} placeholder="0" />
                    </div>
                </div>
            </div>

            {/* Preview lịch trả kỳ 1 */}
            {firstRow && (
                <div style={{ background: '#f0fdf4', borderRadius: 10, padding: '12px 16px', marginBottom: 16, border: '1px solid #bbf7d0' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#15803d', marginBottom: 6 }}>📅 DỰ KIẾN KỲ 1 ({firstRow.ngay_tra})</div>
                    <div style={{ display: 'flex', gap: 24, fontSize: 13 }}>
                        <span>Gốc: <strong>{fmt(firstRow.tien_goc)} ₫</strong></span>
                        <span>Lãi: <strong style={{ color: '#dc2626' }}>{fmt(firstRow.tien_lai)} ₫</strong></span>
                        <span>Tổng: <strong style={{ color: '#1d4ed8' }}>{fmt(firstRow.tong_tra)} ₫</strong></span>
                    </div>
                </div>
            )}

            <Field label="Ghi chú">
                <textarea style={{ ...inp, height: 60, resize: 'vertical' }} value={form.ghi_chu} onChange={e => setForm({ ...form, ghi_chu: e.target.value })} />
            </Field>

            {/* ── CHỨNG TỪ ĐÍNH KÈM ── */}
            <DocUploadSection docs={form.chung_tu || []} onChange={docs => setForm({ ...form, chung_tu: docs })} />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
                <button type="button" onClick={onClose} style={{ padding: '9px 22px', borderRadius: 8, border: '1.5px solid #e2e8f0', background: 'white', cursor: 'pointer', fontSize: 13 }}>Hủy</button>
                <button type="submit" style={{ padding: '9px 22px', borderRadius: 8, border: 'none', background: '#1e293b', color: 'white', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                    {isEdit ? 'Lưu thay đổi' : 'Tạo khoản vay'}
                </button>
            </div>
        </form>
    );
}

// ═══════════════════════════════════════════════════════════════════════
export default function TaiChinhPage() {
    const [loans, setLoans] = useState([]);
    const [modal, setModal] = useState(null); // null | 'add' | loan
    const [scheduleModal, setScheduleModal] = useState(null); // loan object
    const [form, setForm] = useState(EMPTY_FORM);
    const [activeTab, setActiveTab] = useState('dashboard'); // dashboard | loans

    const load = useCallback(async () => {
        const r = await fetch(`${API}/api/khoan_vay`);
        if (r.ok) setLoans(await r.json());
    }, []);
    useEffect(() => { load(); }, [load]);

    const openAdd = () => { setForm({ ...EMPTY_FORM, ngay_bat_dau: today(), ngay_giai_ngan: today() }); setModal('add'); };
    const openEdit = l => { setForm({ ...EMPTY_FORM, ...l, so_tien_vay: String(l.so_tien_vay || ''), phi_ban_dau: String(l.phi_ban_dau || ''), ebitda_thang: String(l.ebitda_thang || ''), tong_tai_san: String(l.tong_tai_san || ''), von_chu_so_huu: String(l.von_chu_so_huu || ''), ky_han_thang: String(l.ky_han_thang || 12), dscr_min: String(l.dscr_min || 1.2), de_ratio_max: String(l.de_ratio_max || 3.0) }); setModal(l); };

    const save = async e => {
        e.preventDefault();
        const effRate = form.loai_lai === 'tha_noi'
            ? parseFloat(form.lai_co_so || 0) + parseFloat(form.bien_do || 0)
            : parseFloat(form.lai_suat_ht || 0);
        const payload = {
            ...form, lai_suat_ht: effRate,
            so_tien_vay: +form.so_tien_vay || 0, phi_ban_dau: +form.phi_ban_dau || 0,
            phi_tra_truoc: +form.phi_tra_truoc || 0, ky_han_thang: +form.ky_han_thang || 12,
            dscr_min: +form.dscr_min || 1.2, de_ratio_max: +form.de_ratio_max || 3.0,
            ebitda_thang: +form.ebitda_thang || 0, tong_tai_san: +form.tong_tai_san || 0,
            von_chu_so_huu: +form.von_chu_so_huu || 0,
        };
        const isEdit = modal !== 'add';
        await fetch(isEdit ? `${API}/api/khoan_vay/${modal.id}` : `${API}/api/khoan_vay`, {
            method: isEdit ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        setModal(null); load();
    };

    const del = async id => {
        if (!window.confirm('Xóa khoản vay này?')) return;
        await fetch(`${API}/api/khoan_vay/${id}`, { method: 'DELETE' });
        load();
    };

    const markPaid = async (loanId, rowId) => {
        await fetch(`${API}/api/khoan_vay/${loanId}/lich_tra/${rowId}/tra`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ngay_da_tra: today() }) });
        setScheduleModal(prev => prev ? ({ ...prev, lich_tra: prev.lich_tra.map(r => r.id === rowId ? { ...r, trang_thai: 'da_tra', ngay_da_tra: today() } : r) }) : prev);
    };

    // ── Tính tổng / WACC ─────────────────────────────────────────────
    const active = loans.filter(l => l.trang_thai === 'dang_vay');
    const tongDuNo = active.reduce((s, l) => s + (l.so_tien_vay || 0), 0);
    const wacc = tongDuNo > 0
        ? active.reduce((s, l) => s + (l.lai_suat_ht || 0) * (l.so_tien_vay || 0), 0) / tongDuNo
        : 0;

    // Lịch 12 tháng tới
    const now = new Date();
    const upcoming = [];
    active.forEach(loan => {
        (loan.lich_tra || []).forEach(row => {
            if (row.trang_thai !== 'da_tra') {
                try {
                    const d = parseDate(row.ngay_tra);
                    const diffM = (d.getFullYear() - now.getFullYear()) * 12 + (d.getMonth() - now.getMonth());
                    if (diffM >= 0 && diffM < 12) upcoming.push({ ...row, ngan_hang: loan.ngan_hang, ma_hd: loan.ma_hd, loan_id: loan.id });
                } catch { }
            }
        });
    });
    upcoming.sort((a, b) => parseDate(a.ngay_tra) - parseDate(b.ngay_tra));

    // Covenant alerts
    const allAlerts = [];
    active.forEach(loan => {
        const monthly = (loan.lich_tra || []).find(r => r.trang_thai !== 'da_tra');
        const { alerts } = calcCovenant({ ...loan, _monthly_payment: monthly?.tong_tra || 0 });
        alerts.forEach(a => allAlerts.push({ ...a, ngan_hang: loan.ngan_hang, ma_hd: loan.ma_hd }));
    });

    const TABS = [
        { key: 'dashboard', label: '📊 Dashboard' },
        { key: 'loans', label: '📋 Danh sách vay' },
    ];

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#f0f4f8' }}>
            {/* Sub-tabs */}
            <div style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '0 28px', display: 'flex', gap: 4 }}>
                {TABS.map(t => (
                    <button key={t.key} onClick={() => setActiveTab(t.key)} style={{ padding: '12px 18px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, background: 'none', color: activeTab === t.key ? '#1e293b' : '#94a3b8', borderBottom: activeTab === t.key ? '2.5px solid #f59e0b' : '2.5px solid transparent', transition: 'all .15s' }}>{t.label}</button>
                ))}
            </div>

            <div style={{ flex: 1, padding: '24px 28px', overflowY: 'auto' }}>

                {activeTab === 'dashboard' && (
                    <>
                        {/* KPI Cards */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 20 }}>
                            {[
                                { label: 'Tổng dư nợ', value: fmtB(tongDuNo) + ' ₫', sub: `${active.length} hợp đồng`, color: '#1d4ed8', bg: '#dbeafe' },
                                { label: 'WACC bình quân', value: wacc.toFixed(2) + '%', sub: 'Lãi suất gia quyền', color: '#7c3aed', bg: '#ede9fe' },
                                { label: 'Cảnh báo Covenant', value: allAlerts.length, sub: allAlerts.filter(a => a.level === 'danger').length + ' vi phạm', color: allAlerts.some(a => a.level === 'danger') ? '#dc2626' : '#d97706', bg: allAlerts.some(a => a.level === 'danger') ? '#fee2e2' : '#fef9c3' },
                                { label: 'Thanh toán 30 ngày', value: fmtB(upcoming.filter(r => { try { const d = parseDate(r.ngay_tra); return (d - now) / (1000 * 86400) <= 30; } catch { return false } }).reduce((s, r) => s + (r.tong_tra || 0), 0)) + ' ₫', sub: 'Cần chuẩn bị', color: '#15803d', bg: '#dcfce7' },
                            ].map(({ label, value, sub, color, bg }) => (
                                <div key={label} style={{ background: 'white', borderRadius: 14, padding: '18px 20px', boxShadow: '0 1px 6px rgba(0,0,0,.06)', border: '1px solid #e2e8f0' }}>
                                    <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 8, letterSpacing: .4, display: 'flex', alignItems: 'center' }}>
                                        {label}<InfoTip text={KPI_TIPS[label]} />
                                    </div>
                                    <div style={{ fontSize: 20, fontWeight: 900, color, marginBottom: 4 }}>{value}</div>
                                    <div style={{ display: 'inline-block', background: bg, color, borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 700 }}>{sub}</div>
                                </div>
                            ))}
                        </div>

                        {/* Alerts */}
                        {allAlerts.length > 0 && (
                            <div style={{ background: 'white', borderRadius: 14, padding: '16px 20px', marginBottom: 20, border: '1px solid #e2e8f0', boxShadow: '0 1px 6px rgba(0,0,0,.06)' }}>
                                <div style={{ fontSize: 12, fontWeight: 800, color: '#1e293b', marginBottom: 12 }}>⚠️ CẢNH BÁO COVENANT</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    {allAlerts.map((a, i) => (
                                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderRadius: 8, background: a.level === 'danger' ? '#fee2e2' : '#fef9c3', border: `1px solid ${a.level === 'danger' ? '#fca5a5' : '#fde68a'}` }}>
                                            <span style={{ fontSize: 16 }}>{a.level === 'danger' ? '🔴' : '🟡'}</span>
                                            <div>
                                                <div style={{ fontSize: 12, fontWeight: 700, color: a.level === 'danger' ? '#dc2626' : '#92400e' }}>{a.ma_hd} — {a.ngan_hang}</div>
                                                <div style={{ fontSize: 11, color: a.level === 'danger' ? '#b91c1c' : '#78350f' }}>{a.msg}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Dư nợ theo ngân hàng */}
                        {active.length > 0 && (
                            <div style={{ background: 'white', borderRadius: 14, padding: '16px 20px', marginBottom: 20, border: '1px solid #e2e8f0', boxShadow: '0 1px 6px rgba(0,0,0,.06)' }}>
                                <div style={{ fontSize: 12, fontWeight: 800, color: '#1e293b', marginBottom: 14 }}>🏦 DƯ NỢ THEO NGÂN HÀNG</div>
                                {active.map(l => {
                                    const pct = tongDuNo > 0 ? (l.so_tien_vay / tongDuNo * 100) : 0;
                                    return (
                                        <div key={l.id} style={{ marginBottom: 12 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                                                <span style={{ fontWeight: 700 }}>{l.ngan_hang} <span style={{ color: '#94a3b8', fontWeight: 400, fontSize: 11 }}>({l.ma_hd})</span></span>
                                                <span style={{ fontWeight: 800, color: '#1d4ed8' }}>{fmtB(l.so_tien_vay)} ₫ <span style={{ color: '#64748b', fontWeight: 400 }}>— {(l.lai_suat_ht || 0).toFixed(2)}%/năm</span></span>
                                            </div>
                                            <div style={{ height: 6, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
                                                <div style={{ height: '100%', background: '#3b82f6', width: `${pct}%`, borderRadius: 4, transition: 'width .3s' }} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* Lịch trả 12 tháng */}
                        <div style={{ background: 'white', borderRadius: 14, padding: '16px 20px', border: '1px solid #e2e8f0', boxShadow: '0 1px 6px rgba(0,0,0,.06)' }}>
                            <div style={{ fontSize: 12, fontWeight: 800, color: '#1e293b', marginBottom: 14 }}>📅 LỊCH TRẢ NỢ 12 THÁNG TỚI</div>
                            {upcoming.length === 0
                                ? <div style={{ textAlign: 'center', padding: 30, color: '#94a3b8' }}>Chưa có lịch trả nợ</div>
                                : <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                        <thead>
                                            <tr style={{ background: '#f8fafc' }}>
                                                {['Ngân hàng', 'HĐ', 'Kỳ', 'Ngày trả', 'Tiền gốc', 'Tiền lãi', 'Tổng trả', 'Trạng thái'].map(h => (
                                                    <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 700, color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {upcoming.slice(0, 20).map((r, i) => {
                                                const st = PAY_STATUS[r.trang_thai] || PAY_STATUS.cho_tra;
                                                return (
                                                    <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                        <td style={{ padding: '7px 10px', fontWeight: 600 }}>{r.ngan_hang}</td>
                                                        <td style={{ padding: '7px 10px', color: '#64748b' }}>{r.ma_hd}</td>
                                                        <td style={{ padding: '7px 10px', textAlign: 'center' }}>{r.ky_so}</td>
                                                        <td style={{ padding: '7px 10px', fontWeight: 600 }}>{r.ngay_tra}</td>
                                                        <td style={{ padding: '7px 10px', textAlign: 'right' }}>{fmt(r.tien_goc)}</td>
                                                        <td style={{ padding: '7px 10px', textAlign: 'right', color: '#dc2626' }}>{fmt(r.tien_lai)}</td>
                                                        <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 800, color: '#1d4ed8' }}>{fmt(r.tong_tra)}</td>
                                                        <td style={{ padding: '7px 10px' }}><span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700, background: st.bg, color: st.text }}>{st.label}</span></td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            }
                        </div>
                    </>
                )}

                {activeTab === 'loans' && (
                    <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                            <div style={{ fontSize: 13, color: '#64748b' }}>{loans.length} khoản vay</div>
                            <button onClick={openAdd} style={{ padding: '9px 20px', borderRadius: 8, border: 'none', background: '#1e293b', color: 'white', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>+ Thêm khoản vay</button>
                        </div>

                        {loans.length === 0
                            ? <div style={{ textAlign: 'center', padding: 80, background: 'white', borderRadius: 14, border: '1px solid #e2e8f0', color: '#94a3b8' }}>Chưa có khoản vay nào</div>
                            : loans.map(loan => {
                                const st = STATUS[loan.trang_thai] || STATUS.dang_vay;
                                const monthly = (loan.lich_tra || []).find(r => r.trang_thai !== 'da_tra');
                                const { dscr, de_ratio, alerts } = calcCovenant({ ...loan, _monthly_payment: monthly?.tong_tra || 0 });
                                const dueCount = (loan.lich_tra || []).filter(r => r.trang_thai === 'cho_tra').length;
                                const paidCount = (loan.lich_tra || []).filter(r => r.trang_thai === 'da_tra').length;
                                const totalKy = loan.lich_tra?.length || 0;
                                return (
                                    <div key={loan.id} style={{ background: 'white', borderRadius: 14, border: '1px solid #e2e8f0', marginBottom: 14, overflow: 'hidden', boxShadow: '0 1px 6px rgba(0,0,0,.05)' }}>
                                        {/* Header */}
                                        <div style={{ padding: '14px 20px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                                <div>
                                                    <div style={{ fontWeight: 800, fontSize: 14, color: '#1e293b' }}>{loan.ngan_hang}</div>
                                                    <div style={{ fontSize: 11, color: '#94a3b8' }}>{loan.ma_hd}</div>
                                                </div>
                                                <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: st.bg, color: st.text }}>{st.label}</span>
                                                {alerts.length > 0 && <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: alerts[0].level === 'danger' ? '#fee2e2' : '#fef9c3', color: alerts[0].level === 'danger' ? '#dc2626' : '#92400e' }}>⚠️ {alerts.length} cảnh báo</span>}
                                            </div>
                                            <div style={{ display: 'flex', gap: 8 }}>
                                                <button onClick={() => setScheduleModal(loan)} style={{ padding: '6px 14px', borderRadius: 7, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#1d4ed8' }}>📅 Lịch trả</button>
                                                <button onClick={() => openEdit(loan)} style={{ padding: '6px 14px', borderRadius: 7, border: '1px solid #cbd5e1', background: 'white', cursor: 'pointer', fontSize: 12 }}>✏️</button>
                                                <button onClick={() => del(loan.id)} style={{ padding: '6px 14px', borderRadius: 7, border: '1px solid #fca5a5', background: '#fff1f2', cursor: 'pointer', fontSize: 12, color: '#dc2626' }}>🗑</button>
                                            </div>
                                        </div>
                                        {/* Body */}
                                        <div style={{ padding: '14px 20px', display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 14 }}>
                                            {[
                                                { label: 'Dư nợ', value: fmtB(loan.so_tien_vay) + ' ₫', bold: true },
                                                { label: 'Lãi suất', value: `${(loan.lai_suat_ht || 0).toFixed(2)}% (${LOAI_LAI[loan.loai_lai]})` },
                                                { label: 'Kỳ hạn', value: `${paidCount}/${totalKy || loan.ky_han_thang} tháng` },
                                                { label: 'Trả kỳ tới', value: monthly ? fmt(monthly.tong_tra) + ' ₫' : '—' },
                                                { label: 'Tất toán', value: loan.ngay_tat_toan || '—' },
                                            ].map(({ label, value, bold }) => (
                                                <div key={label}>
                                                    <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, marginBottom: 2 }}>{label}</div>
                                                    <div style={{ fontSize: 13, fontWeight: bold ? 800 : 600, color: '#1e293b' }}>{value}</div>
                                                </div>
                                            ))}
                                        </div>
                                        {/* Covenant indicators */}
                                        {(dscr !== null || de_ratio !== null) && (
                                            <div style={{ padding: '0 20px 14px', display: 'flex', gap: 16 }}>
                                                {dscr !== null && <div style={{ fontSize: 11, color: dscr < (loan.dscr_min || 1.2) ? '#dc2626' : '#15803d', fontWeight: 700 }}>DSCR: {dscr.toFixed(2)} (min {loan.dscr_min})</div>}
                                                {de_ratio !== null && <div style={{ fontSize: 11, color: de_ratio > (loan.de_ratio_max || 3) ? '#dc2626' : '#15803d', fontWeight: 700 }}>D/E: {de_ratio.toFixed(2)} (max {loan.de_ratio_max})</div>}
                                                {loan.tai_san_dam_bao && <div style={{ fontSize: 11, color: '#64748b' }}>🏠 {loan.tai_san_dam_bao.slice(0, 60)}{loan.tai_san_dam_bao.length > 60 ? '...' : ''}</div>}
                                            </div>
                                        )}
                                    </div>
                                );
                            })
                        }
                    </>
                )}
            </div>

            {/* Modal thêm/sửa */}
            <Modal open={!!modal} onClose={() => setModal(null)} title={modal === 'add' ? '+ Thêm khoản vay mới' : '✏️ Chỉnh sửa khoản vay'} maxWidth={800}>
                <LoanForm form={form} setForm={setForm} onSubmit={save} onClose={() => setModal(null)} isEdit={modal !== 'add'} />
            </Modal>

            {/* Modal lịch trả nợ */}
            <Modal open={!!scheduleModal} onClose={() => setScheduleModal(null)}
                title={`📅 Lịch trả nợ — ${scheduleModal?.ngan_hang} (${scheduleModal?.ma_hd})`} maxWidth={860}>
                {scheduleModal && (() => {
                    const rows = scheduleModal.lich_tra || buildSchedule(scheduleModal);
                    const paid = rows.filter(r => r.trang_thai === 'da_tra').reduce((s, r) => s + (r.tong_tra || 0), 0);
                    const remain = rows.filter(r => r.trang_thai !== 'da_tra').reduce((s, r) => s + (r.tong_tra || 0), 0);
                    return (
                        <>
                            <div style={{ display: 'flex', gap: 20, marginBottom: 16 }}>
                                {[
                                    { label: 'Đã trả', value: fmt(paid) + ' ₫', color: '#15803d' },
                                    { label: 'Còn lại', value: fmt(remain) + ' ₫', color: '#dc2626' },
                                    { label: 'Tổng cộng', value: fmt(paid + remain) + ' ₫', color: '#1d4ed8' },
                                ].map(({ label, value, color }) => (
                                    <div key={label} style={{ background: '#f8fafc', borderRadius: 10, padding: '10px 16px', flex: 1, textAlign: 'center' }}>
                                        <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700 }}>{label}</div>
                                        <div style={{ fontSize: 16, fontWeight: 900, color, marginTop: 4 }}>{value}</div>
                                    </div>
                                ))}
                            </div>
                            <div style={{ overflowX: 'auto', maxHeight: 450 }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                    <thead style={{ position: 'sticky', top: 0, background: '#f8fafc' }}>
                                        <tr>
                                            {['Kỳ', 'Ngày trả', 'Số dư đầu', 'Tiền gốc', 'Tiền lãi', 'Tổng trả', 'Số dư cuối', 'TT', ''].map(h => (
                                                <th key={h} style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: '#64748b', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap', ':first-child': { textAlign: 'center' } }}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rows.map((r, i) => {
                                            const st = PAY_STATUS[r.trang_thai] || PAY_STATUS.cho_tra;
                                            return (
                                                <tr key={i} style={{ borderBottom: '1px solid #f1f5f9', background: r.trang_thai === 'da_tra' ? '#f0fdf4' : r.trang_thai === 'qua_han' ? '#fff1f2' : undefined }}>
                                                    <td style={{ padding: '7px 10px', textAlign: 'center', fontWeight: 700 }}>{r.ky_so}</td>
                                                    <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 600 }}>{r.ngay_tra}</td>
                                                    <td style={{ padding: '7px 10px', textAlign: 'right', color: '#64748b' }}>{fmt(r.so_du_dau)}</td>
                                                    <td style={{ padding: '7px 10px', textAlign: 'right' }}>{fmt(r.tien_goc)}</td>
                                                    <td style={{ padding: '7px 10px', textAlign: 'right', color: '#dc2626' }}>{fmt(r.tien_lai)}</td>
                                                    <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 800, color: '#1d4ed8' }}>{fmt(r.tong_tra)}</td>
                                                    <td style={{ padding: '7px 10px', textAlign: 'right', color: '#64748b' }}>{fmt(r.so_du_cuoi)}</td>
                                                    <td style={{ padding: '7px 10px' }}><span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700, background: st.bg, color: st.text, whiteSpace: 'nowrap' }}>{st.label}</span></td>
                                                    <td style={{ padding: '7px 10px' }}>
                                                        {r.trang_thai !== 'da_tra' && r.id && (
                                                            <button onClick={() => markPaid(scheduleModal.id, r.id)} style={{ padding: '3px 10px', borderRadius: 6, border: '1px solid #bbf7d0', background: '#f0fdf4', color: '#15803d', cursor: 'pointer', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>✓ Đã trả</button>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    );
                })()}
            </Modal>
        </div>
    );
}
