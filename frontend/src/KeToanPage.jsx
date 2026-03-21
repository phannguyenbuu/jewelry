import React, { useState, useEffect, useCallback, useRef } from 'react';

const API = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'https://jewelry.n-lux.com' : '';

const fmt = n => n ? Number(n).toLocaleString('vi-VN') : '0';
const today = () => new Date().toISOString().slice(0, 10);
const inp = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box' };
const btn = (bg, c = 'white') => ({ padding: '8px 18px', borderRadius: 8, border: 'none', background: bg, color: c, fontWeight: 700, cursor: 'pointer', fontSize: 13 });

// ─── DANH MỤC (dynamic, localStorage) ───────────────────────────────────────
const DM_KEY = 'jewelry_danhmuc';
const DM_DEFAULT = {
    thu: ['Doanh thu bán hàng', 'Thu từ đặt cọc', 'Hoàn tiền', 'Khác'],
    chi: ['Nhập hàng', 'Lương nhân viên', 'Thuê mặt bằng', 'Điện nước', 'Vận chuyển', 'Marketing', 'Khác'],
};
function loadDM() { try { return JSON.parse(localStorage.getItem(DM_KEY)) || DM_DEFAULT; } catch { return DM_DEFAULT; } }
function saveDM(dm) { localStorage.setItem(DM_KEY, JSON.stringify(dm)); }

function Modal({ open, onClose, title, children, maxWidth = 600 }) {
    if (!open) return null;
    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
            onClick={e => e.target === e.currentTarget && onClose()}>
            <div style={{ background: 'white', borderRadius: 16, width: '100%', maxWidth, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,.3)' }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: 'white' }}>
                    <span style={{ fontWeight: 800, fontSize: 15 }}>{title}</span>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#94a3b8' }}>×</button>
                </div>
                <div style={{ padding: 20 }}>{children}</div>
            </div>
        </div>
    );
}

function Field({ label, children }) {
    return <div style={{ marginBottom: 14 }}><label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: .5 }}>{label}</label>{children}</div>;
}

// ─── OCR Upload cho Chuyển khoản ─────────────────────────────────────────────
function InvoiceOcrBtn({ onExtracted }) {
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState('');
    const [preview, setPreview] = useState('');
    const fileRef = useRef();

    const runOcr = async (file) => {
        setLoading(true); setResult('');
        const reader = new FileReader();
        reader.onload = async (ev) => {
            const base64 = ev.target.result.split(',')[1];
            try {
                const res = await fetch(`${API}/api/ocr`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ image_base64: base64, mime_type: file.type || 'image/jpeg', file_name: file.name }),
                });
                const data = await res.json();
                setResult(data.text || data.error || 'Không đọc được');
            } catch (e) { setResult('Lỗi: ' + e.message); }
            setLoading(false);
        };
        reader.readAsDataURL(file);
    };

    const onFile = (e) => {
        const f = e.target.files[0]; if (!f) return;
        setPreview(URL.createObjectURL(f)); setOpen(true); setResult('');
        runOcr(f); e.target.value = '';
    };

    return (
        <>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 7, border: '1.5px solid #6366f1', background: '#f5f3ff', color: '#6366f1', cursor: 'pointer', fontSize: 12, fontWeight: 700, marginTop: 6 }}>
                📷 Upload hóa đơn / OCR
                <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onFile} />
            </label>
            {open && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(3px)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
                    <div style={{ background: 'white', borderRadius: 16, width: '100%', maxWidth: 780, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 60px rgba(0,0,0,.3)' }}>
                        <div style={{ padding: '13px 20px', background: '#1e293b', borderRadius: '16px 16px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ color: 'white', fontWeight: 800, fontSize: 14 }}>🔍 OCR Hóa đơn chuyển khoản</div>
                            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: 'white', fontSize: 22, cursor: 'pointer' }}>×</button>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', flex: 1, overflow: 'hidden', minHeight: 300 }}>
                            <div style={{ padding: 16, background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRight: '1px solid #e2e8f0', overflowY: 'auto' }}>
                                {preview && <img src={preview} style={{ maxWidth: '100%', borderRadius: 8 }} alt="" />}
                            </div>
                            <div style={{ padding: 16, overflowY: 'auto' }}>
                                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 8 }}>NỘI DUNG TRÍCH XUẤT</div>
                                {loading ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '30px 0', color: '#64748b' }}>
                                        <div style={{ width: 32, height: 32, border: '3px solid #e2e8f0', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                                        Đang nhận dạng AI...
                                    </div>
                                ) : (
                                    <div style={{ fontSize: 12, lineHeight: 1.7, whiteSpace: 'pre-wrap', background: '#f0f4f8', borderRadius: 8, padding: 12, fontFamily: 'monospace', userSelect: 'all', color: '#1e293b' }}>
                                        {result || '—'}
                                    </div>
                                )}
                                {result && (
                                    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                                        <button onClick={() => navigator.clipboard.writeText(result)} style={{ ...btn('#6366f1'), fontSize: 12, padding: '6px 14px' }}>📋 Copy</button>
                                        <button onClick={() => { onExtracted && onExtracted(result); setOpen(false); }} style={{ ...btn('#16a34a'), fontSize: 12, padding: '6px 14px' }}>✓ Dùng làm mô tả</button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
            <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
        </>
    );
}

// ─── TAB: THU CHI HÀNG NGÀY ──────────────────────────────────────────────────
function ThuChiTab({ dm }) {
    const [list, setList] = useState([]);
    const [modal, setModal] = useState(null);
    const [form, setForm] = useState({ loai: 'Thu', danh_muc: '', so_tien: '', ngay: today(), mo_ta: '', doi_tuong: '', phuong_thuc: 'Tiền mặt' });
    const [filterLoai, setFilterLoai] = useState('');
    const [filterNgay, setFilterNgay] = useState('');
    const [confirmDel, setConfirmDel] = useState(null);

    const load = useCallback(async () => {
        const r = await fetch(`${API}/api/thu_chi`); setList(await r.json());
    }, []);
    useEffect(() => { load(); }, [load]);

    const save = async e => {
        e.preventDefault();
        const isEdit = modal !== 'add';
        await fetch(isEdit ? `${API}/api/thu_chi/${modal.id}` : `${API}/api/thu_chi`, {
            method: isEdit ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...form, so_tien: Number(form.so_tien || 0) }),
        });
        setModal(null); load();
    };

    const del = async () => { await fetch(`${API}/api/thu_chi/${confirmDel}`, { method: 'DELETE' }); setConfirmDel(null); load(); };
    const filtered = list.filter(t => (!filterLoai || t.loai === filterLoai) && (!filterNgay || t.ngay === filterNgay));
    const tongThu = filtered.filter(t => t.loai === 'Thu').reduce((s, t) => s + (t.so_tien || 0), 0);
    const tongChi = filtered.filter(t => t.loai === 'Chi').reduce((s, t) => s + (t.so_tien || 0), 0);

    return (
        <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 20 }}>
                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12, padding: '14px 16px' }}>
                    <div style={{ fontSize: 11, color: '#16a34a', fontWeight: 700, marginBottom: 4 }}>TỔNG THU</div>
                    <div style={{ fontSize: 22, fontWeight: 900, color: '#15803d' }}>+{fmt(tongThu)} ₫</div>
                </div>
                <div style={{ background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: 12, padding: '14px 16px' }}>
                    <div style={{ fontSize: 11, color: '#dc2626', fontWeight: 700, marginBottom: 4 }}>TỔNG CHI</div>
                    <div style={{ fontSize: 22, fontWeight: 900, color: '#dc2626' }}>-{fmt(tongChi)} ₫</div>
                </div>
                <div style={{ background: tongThu - tongChi >= 0 ? '#eff6ff' : '#fff1f2', border: `1px solid ${tongThu - tongChi >= 0 ? '#bfdbfe' : '#fecdd3'}`, borderRadius: 12, padding: '14px 16px' }}>
                    <div style={{ fontSize: 11, color: '#1d4ed8', fontWeight: 700, marginBottom: 4 }}>CÂN ĐỐI</div>
                    <div style={{ fontSize: 22, fontWeight: 900, color: tongThu - tongChi >= 0 ? '#1d4ed8' : '#dc2626' }}>{tongThu - tongChi >= 0 ? '+' : ''}{fmt(tongThu - tongChi)} ₫</div>
                </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
                <select value={filterLoai} onChange={e => setFilterLoai(e.target.value)} style={{ ...inp, width: 140 }}>
                    <option value="">Tất cả loại</option>
                    <option>Thu</option><option>Chi</option>
                </select>
                <input type="date" value={filterNgay} onChange={e => setFilterNgay(e.target.value)} style={{ ...inp, width: 160 }} />
                {(filterLoai || filterNgay) && <button onClick={() => { setFilterLoai(''); setFilterNgay(''); }} style={{ ...btn('#f1f5f9', '#475569'), padding: '8px 12px' }}>✕ Reset</button>}
                <div style={{ flex: 1 }} />
                <button onClick={() => { setForm({ loai: 'Thu', danh_muc: '', so_tien: '', ngay: today(), mo_ta: '', doi_tuong: '', phuong_thuc: 'Tiền mặt' }); setModal('add'); }} style={{ ...btn('#16a34a') }}>+ Thêm Thu/Chi</button>
            </div>

            <div style={{ background: 'white', borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                        <tr style={{ background: '#f8fafc' }}>
                            {['Ngày', 'Loại', 'Danh mục', 'Đối tượng', 'Phương thức', 'Số tiền', 'Mô tả', ''].map(h => (
                                <th key={h} style={{ padding: '11px 14px', textAlign: 'left', fontWeight: 700, fontSize: 11, color: '#64748b', borderBottom: '1.5px solid #e2e8f0', whiteSpace: 'nowrap' }}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.length === 0 && <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>Chưa có dữ liệu</td></tr>}
                        {filtered.map((t, i) => (
                            <tr key={t.id} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? 'white' : '#fafafa' }}>
                                <td style={{ padding: '9px 14px', color: '#64748b' }}>{t.ngay}</td>
                                <td style={{ padding: '9px 14px' }}><span style={{ background: t.loai === 'Thu' ? '#dcfce7' : '#fee2e2', color: t.loai === 'Thu' ? '#16a34a' : '#dc2626', borderRadius: 12, padding: '2px 10px', fontSize: 11, fontWeight: 700 }}>{t.loai}</span></td>
                                <td style={{ padding: '9px 14px' }}>{t.danh_muc}</td>
                                <td style={{ padding: '9px 14px', color: '#64748b' }}>{t.doi_tuong || '—'}</td>
                                <td style={{ padding: '9px 14px', color: '#64748b' }}>{t.phuong_thuc}</td>
                                <td style={{ padding: '9px 14px', fontWeight: 700, color: t.loai === 'Thu' ? '#16a34a' : '#dc2626' }}>{t.loai === 'Thu' ? '+' : '-'}{fmt(t.so_tien)} ₫</td>
                                <td style={{ padding: '9px 14px', color: '#64748b', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.mo_ta || '—'}</td>
                                <td style={{ padding: '9px 14px' }}>
                                    <div style={{ display: 'flex', gap: 5 }}>
                                        <button onClick={() => { setForm({ ...t, so_tien: t.so_tien || '' }); setModal(t); }} style={{ ...btn('#f1f5f9', '#475569'), padding: '4px 8px', fontSize: 11 }}>✏️</button>
                                        <button onClick={() => setConfirmDel(t.id)} style={{ ...btn('#fee2e2', '#dc2626'), padding: '4px 8px', fontSize: 11 }}>🗑</button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <Modal open={!!modal} onClose={() => setModal(null)} title={modal === 'add' ? '+ Thêm thu/chi' : `✏️ Sửa khoản ${modal?.loai}`} maxWidth={600}>
                <form onSubmit={save}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                        <Field label="Loại *">
                            <select required style={inp} value={form.loai} onChange={e => setForm({ ...form, loai: e.target.value, danh_muc: '' })}>
                                <option>Thu</option><option>Chi</option>
                            </select>
                        </Field>
                        <Field label="Ngày">
                            <input type="date" style={inp} value={form.ngay} onChange={e => setForm({ ...form, ngay: e.target.value })} />
                        </Field>
                        <Field label="Danh mục *">
                            <select required style={inp} value={form.danh_muc} onChange={e => setForm({ ...form, danh_muc: e.target.value })}>
                                <option value="">-- Chọn --</option>
                                {(form.loai === 'Thu' ? dm.thu : dm.chi).map(d => <option key={d}>{d}</option>)}
                            </select>
                        </Field>
                        <Field label="Phương thức">
                            <select style={inp} value={form.phuong_thuc} onChange={e => setForm({ ...form, phuong_thuc: e.target.value })}>
                                {['Tiền mặt', 'Chuyển khoản', 'Thẻ', 'Khác'].map(p => <option key={p}>{p}</option>)}
                            </select>
                        </Field>
                        <Field label="Số tiền (₫) *">
                            <input type="number" required style={inp} value={form.so_tien} onChange={e => setForm({ ...form, so_tien: e.target.value })} />
                        </Field>
                        <Field label="Đối tượng">
                            <input style={inp} placeholder="Khách hàng / Nhà cung cấp" value={form.doi_tuong} onChange={e => setForm({ ...form, doi_tuong: e.target.value })} />
                        </Field>
                    </div>
                    <Field label="Mô tả">
                        <textarea style={{ ...inp, height: 70, resize: 'vertical' }} value={form.mo_ta} onChange={e => setForm({ ...form, mo_ta: e.target.value })} />
                    </Field>
                    <div style={{ marginBottom: 14 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: .5 }}>📎 Đính kèm chứng từ / OCR</div>
                        <InvoiceOcrBtn onExtracted={text => setForm(f => ({ ...f, mo_ta: (f.mo_ta ? f.mo_ta + '\n' : '') + text.slice(0, 400) }))} />
                    </div>
                    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
                        <button type="button" onClick={() => setModal(null)} style={{ ...btn('#f1f5f9', '#475569') }}>Hủy</button>
                        <button type="submit" style={{ ...btn(form.loai === 'Thu' ? '#16a34a' : '#dc2626') }}>{modal === 'add' ? 'Thêm' : 'Lưu thay đổi'}</button>
                    </div>
                </form>
            </Modal>

            {confirmDel && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ background: 'white', borderRadius: 14, padding: 28, maxWidth: 340, textAlign: 'center' }}>
                        <div style={{ fontWeight: 700, marginBottom: 16 }}>Xóa khoản thu/chi này?</div>
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                            <button onClick={() => setConfirmDel(null)} style={{ ...btn('#f1f5f9', '#475569') }}>Hủy</button>
                            <button onClick={del} style={{ ...btn('#dc2626') }}>Xóa</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── TAB: CHỨNG TỪ KẾ TOÁN ──────────────────────────────────────────────────
const CT_STATUS = { 'Nháp': { bg: '#f1f5f9', text: '#64748b' }, 'Đã duyệt': { bg: '#dcfce7', text: '#166534' }, 'Hủy': { bg: '#fee2e2', text: '#991b1b' } };
const LOAI_CT = ['Hóa đơn bán hàng', 'Hóa đơn mua hàng', 'Phiếu thu', 'Phiếu chi', 'Biên lai', 'Hóa đơn GTGT', 'Khác'];

function ChungTuTab() {
    const [list, setList] = useState([]);
    const [modal, setModal] = useState(null);
    const [form, setForm] = useState({ loai_ct: '', ngay_lap: today(), ngay_hach_toan: today(), doi_tuong: '', mo_ta: '', so_tien: '', thue_suat: 0, trang_thai: 'Nháp', nguoi_lap: '' });
    const [filterTT, setFilterTT] = useState('');
    const [confirmDel, setConfirmDel] = useState(null);

    const load = useCallback(async () => { const r = await fetch(`${API}/api/chung_tu`); setList(await r.json()); }, []);
    useEffect(() => { load(); }, [load]);

    const save = async e => {
        e.preventDefault();
        const isEdit = modal !== 'add';
        await fetch(isEdit ? `${API}/api/chung_tu/${modal.id}` : `${API}/api/chung_tu`, {
            method: isEdit ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...form, so_tien: Number(form.so_tien || 0), thue_suat: Number(form.thue_suat || 0) }),
        });
        setModal(null); load();
    };
    const del = async () => { await fetch(`${API}/api/chung_tu/${confirmDel}`, { method: 'DELETE' }); setConfirmDel(null); load(); };
    const filtered = list.filter(c => !filterTT || c.trang_thai === filterTT);

    return (
        <div>
            <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
                <select value={filterTT} onChange={e => setFilterTT(e.target.value)} style={{ ...inp, width: 180 }}>
                    <option value="">Tất cả trạng thái</option>
                    {Object.keys(CT_STATUS).map(s => <option key={s}>{s}</option>)}
                </select>
                <div style={{ flex: 1 }} />
                <button onClick={() => { setForm({ loai_ct: '', ngay_lap: today(), ngay_hach_toan: today(), doi_tuong: '', mo_ta: '', so_tien: '', thue_suat: 0, trang_thai: 'Nháp', nguoi_lap: '' }); setModal('add'); }} style={{ ...btn('#0ea5e9') }}>+ Thêm chứng từ</button>
            </div>
            <div style={{ background: 'white', borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                        <tr style={{ background: '#f8fafc' }}>
                            {['Mã CT', 'Loại', 'Ngày lập', 'Hạch toán', 'Đối tượng', 'Số tiền', 'Thuế', 'Trạng thái', ''].map(h => (
                                <th key={h} style={{ padding: '11px 14px', textAlign: 'left', fontWeight: 700, fontSize: 11, color: '#64748b', borderBottom: '1.5px solid #e2e8f0', whiteSpace: 'nowrap' }}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.length === 0 && <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>Chưa có chứng từ</td></tr>}
                        {filtered.map((c, i) => {
                            const sc = CT_STATUS[c.trang_thai] || { bg: '#f1f5f9', text: '#64748b' };
                            return (
                                <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? 'white' : '#fafafa' }}>
                                    <td style={{ padding: '9px 14px', fontWeight: 700, color: '#0ea5e9' }}>{c.ma_ct}</td>
                                    <td style={{ padding: '9px 14px' }}>{c.loai_ct}</td>
                                    <td style={{ padding: '9px 14px', color: '#64748b' }}>{c.ngay_lap}</td>
                                    <td style={{ padding: '9px 14px', color: '#64748b' }}>{c.ngay_hach_toan}</td>
                                    <td style={{ padding: '9px 14px' }}>{c.doi_tuong || '—'}</td>
                                    <td style={{ padding: '9px 14px', fontWeight: 700 }}>{fmt(c.so_tien)} ₫</td>
                                    <td style={{ padding: '9px 14px', color: '#64748b' }}>{c.thue_suat}%</td>
                                    <td style={{ padding: '9px 14px' }}><span style={{ background: sc.bg, color: sc.text, borderRadius: 12, padding: '2px 10px', fontSize: 11, fontWeight: 700 }}>{c.trang_thai}</span></td>
                                    <td style={{ padding: '9px 14px' }}>
                                        <div style={{ display: 'flex', gap: 5 }}>
                                            <button onClick={() => { setForm({ ...c, so_tien: c.so_tien || '', thue_suat: c.thue_suat || 0 }); setModal(c); }} style={{ ...btn('#f1f5f9', '#475569'), padding: '4px 8px', fontSize: 11 }}>✏️</button>
                                            <button onClick={() => setConfirmDel(c.id)} style={{ ...btn('#fee2e2', '#dc2626'), padding: '4px 8px', fontSize: 11 }}>🗑</button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            <Modal open={!!modal} onClose={() => setModal(null)} title={modal === 'add' ? '+ Thêm chứng từ' : `✏️ Sửa — ${modal?.ma_ct}`} maxWidth={620}>
                <form onSubmit={save}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                        <Field label="Loại chứng từ *">
                            <select required style={inp} value={form.loai_ct} onChange={e => setForm({ ...form, loai_ct: e.target.value })}>
                                <option value="">-- Chọn --</option>
                                {LOAI_CT.map(l => <option key={l}>{l}</option>)}
                            </select>
                        </Field>
                        <Field label="Ngày lập"><input type="date" style={inp} value={form.ngay_lap} onChange={e => setForm({ ...form, ngay_lap: e.target.value })} /></Field>
                        <Field label="Ngày hạch toán"><input type="date" style={inp} value={form.ngay_hach_toan} onChange={e => setForm({ ...form, ngay_hach_toan: e.target.value })} /></Field>
                        <Field label="Đối tượng"><input style={inp} value={form.doi_tuong} onChange={e => setForm({ ...form, doi_tuong: e.target.value })} /></Field>
                        <Field label="Số tiền (₫)"><input type="number" style={inp} value={form.so_tien} onChange={e => setForm({ ...form, so_tien: e.target.value })} /></Field>
                        <Field label="Thuế suất (%)"><input type="number" min="0" max="100" style={inp} value={form.thue_suat} onChange={e => setForm({ ...form, thue_suat: e.target.value })} /></Field>
                        <Field label="Người lập"><input style={inp} value={form.nguoi_lap} onChange={e => setForm({ ...form, nguoi_lap: e.target.value })} /></Field>
                        <Field label="Trạng thái">
                            <select style={inp} value={form.trang_thai} onChange={e => setForm({ ...form, trang_thai: e.target.value })}>
                                {Object.keys(CT_STATUS).map(s => <option key={s}>{s}</option>)}
                            </select>
                        </Field>
                    </div>
                    <Field label="Mô tả"><textarea style={{ ...inp, height: 70, resize: 'vertical' }} value={form.mo_ta} onChange={e => setForm({ ...form, mo_ta: e.target.value })} /></Field>
                    <div style={{ marginBottom: 14 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: .5 }}>📎 Đính kèm chứng từ / OCR</div>
                        <InvoiceOcrBtn onExtracted={text => setForm(f => ({ ...f, mo_ta: (f.mo_ta ? f.mo_ta + '\n' : '') + text.slice(0, 400) }))} />
                    </div>
                    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
                        <button type="button" onClick={() => setModal(null)} style={{ ...btn('#f1f5f9', '#475569') }}>Hủy</button>
                        <button type="submit" style={{ ...btn('#0ea5e9') }}>{modal === 'add' ? 'Tạo chứng từ' : 'Lưu thay đổi'}</button>
                    </div>
                </form>
            </Modal>
            {confirmDel && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ background: 'white', borderRadius: 14, padding: 28, maxWidth: 340, textAlign: 'center' }}>
                        <div style={{ fontWeight: 700, marginBottom: 16 }}>Xóa chứng từ này?</div>
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                            <button onClick={() => setConfirmDel(null)} style={{ ...btn('#f1f5f9', '#475569') }}>Hủy</button>
                            <button onClick={del} style={{ ...btn('#dc2626') }}>Xóa</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── TAB: BÁO CÁO THUẾ ──────────────────────────────────────────────────────
function BaoCaoThueTab() {
    const [chungTu, setChungTu] = useState([]);
    const [year, setYear] = useState(new Date().getFullYear());
    const [quarter, setQuarter] = useState('');

    useEffect(() => { fetch(`${API}/api/chung_tu`).then(r => r.json()).then(setChungTu); }, []);

    const filtered = chungTu.filter(c => {
        if (c.trang_thai === 'Hủy') return false;
        const y = c.ngay_lap?.slice(0, 4);
        if (String(y) !== String(year)) return false;
        if (quarter) { const m = parseInt(c.ngay_lap?.slice(5, 7) || '0'); if (Math.ceil(m / 3) !== parseInt(quarter)) return false; }
        return true;
    });

    const doanhThu = filtered.filter(c => c.loai_ct?.includes('bán') || c.loai_ct === 'Phiếu thu').reduce((s, c) => s + (c.so_tien || 0), 0);
    const chiPhi = filtered.filter(c => c.loai_ct?.includes('mua') || c.loai_ct === 'Phiếu chi').reduce((s, c) => s + (c.so_tien || 0), 0);
    const thueVAT = filtered.reduce((s, c) => s + Math.round((c.so_tien || 0) * (c.thue_suat || 0) / 100), 0);
    const loiNhuan = doanhThu - chiPhi;
    const QMAP = { '': 'Cả năm', '1': 'Quý I', '2': 'Quý II', '3': 'Quý III', '4': 'Quý IV' };
    const byMonth = Array.from({ length: 12 }, (_, i) => {
        const m = String(i + 1).padStart(2, '0');
        const rows = filtered.filter(c => c.ngay_lap?.slice(5, 7) === m);
        return { thang: `T${i + 1}`, thu: rows.filter(c => c.loai_ct?.includes('bán') || c.loai_ct === 'Phiếu thu').reduce((s, c) => s + (c.so_tien || 0), 0), chi: rows.filter(c => c.loai_ct?.includes('mua') || c.loai_ct === 'Phiếu chi').reduce((s, c) => s + (c.so_tien || 0), 0), thue: rows.reduce((s, c) => s + Math.round((c.so_tien || 0) * (c.thue_suat || 0) / 100), 0) };
    }).filter(m => m.thu || m.chi || m.thue);

    return (
        <div>
            <div style={{ display: 'flex', gap: 10, marginBottom: 20, alignItems: 'center' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>📊 Báo cáo thuế — {QMAP[quarter]} {year}</div>
                <select value={year} onChange={e => setYear(Number(e.target.value))} style={{ ...inp, width: 100 }}>
                    {[2023, 2024, 2025, 2026, 2027].map(y => <option key={y}>{y}</option>)}
                </select>
                <select value={quarter} onChange={e => setQuarter(e.target.value)} style={{ ...inp, width: 120 }}>
                    {Object.entries(QMAP).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 12, marginBottom: 24 }}>
                {[
                    { label: 'Doanh thu', value: fmt(doanhThu) + ' ₫', color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
                    { label: 'Chi phí', value: fmt(chiPhi) + ' ₫', color: '#dc2626', bg: '#fff1f2', border: '#fecdd3' },
                    { label: 'Lợi nhuận', value: fmt(loiNhuan) + ' ₫', color: loiNhuan >= 0 ? '#1d4ed8' : '#dc2626', bg: '#eff6ff', border: '#bfdbfe' },
                    { label: 'Thuế VAT', value: fmt(thueVAT) + ' ₫', color: '#f59e0b', bg: '#fffbeb', border: '#fde68a' },
                    { label: 'Số chứng từ', value: filtered.length + ' CT', color: '#6366f1', bg: '#f5f3ff', border: '#ddd6fe' },
                ].map(s => (
                    <div key={s.label} style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: 12, padding: '14px 16px' }}>
                        <div style={{ fontSize: 11, color: s.color, fontWeight: 700, marginBottom: 4 }}>{s.label.toUpperCase()}</div>
                        <div style={{ fontSize: 18, fontWeight: 900, color: s.color }}>{s.value}</div>
                    </div>
                ))}
            </div>
            {byMonth.length > 0 ? (
                <div style={{ background: 'white', borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                    <div style={{ padding: '12px 16px', background: '#1e293b', color: 'white', fontWeight: 800, fontSize: 13 }}>📅 Phân tích theo tháng</div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                            <tr style={{ background: '#f8fafc' }}>
                                {['Tháng', 'Doanh thu', 'Chi phí', 'Lợi nhuận', 'Thuế VAT'].map(h => (
                                    <th key={h} style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, fontSize: 11, color: '#64748b', borderBottom: '1.5px solid #e2e8f0' }}>{h === 'Tháng' ? <span style={{ textAlign: 'left', display: 'block' }}>{h}</span> : h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {byMonth.map((m, i) => (
                                <tr key={m.thang} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? 'white' : '#fafafa' }}>
                                    <td style={{ padding: '9px 14px', fontWeight: 700 }}>{m.thang}</td>
                                    <td style={{ padding: '9px 14px', textAlign: 'right', color: '#16a34a', fontWeight: 600 }}>{fmt(m.thu)} ₫</td>
                                    <td style={{ padding: '9px 14px', textAlign: 'right', color: '#dc2626', fontWeight: 600 }}>{fmt(m.chi)} ₫</td>
                                    <td style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 700, color: m.thu - m.chi >= 0 ? '#1d4ed8' : '#dc2626' }}>{fmt(m.thu - m.chi)} ₫</td>
                                    <td style={{ padding: '9px 14px', textAlign: 'right', color: '#f59e0b', fontWeight: 600 }}>{fmt(m.thue)} ₫</td>
                                </tr>
                            ))}
                            <tr style={{ background: '#1e293b' }}>
                                <td style={{ padding: '10px 14px', color: 'white', fontWeight: 800 }}>TỔNG</td>
                                <td style={{ padding: '10px 14px', textAlign: 'right', color: '#86efac', fontWeight: 800 }}>{fmt(doanhThu)} ₫</td>
                                <td style={{ padding: '10px 14px', textAlign: 'right', color: '#fca5a5', fontWeight: 800 }}>{fmt(chiPhi)} ₫</td>
                                <td style={{ padding: '10px 14px', textAlign: 'right', color: loiNhuan >= 0 ? '#93c5fd' : '#fca5a5', fontWeight: 800 }}>{fmt(loiNhuan)} ₫</td>
                                <td style={{ padding: '10px 14px', textAlign: 'right', color: '#fde68a', fontWeight: 800 }}>{fmt(thueVAT)} ₫</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            ) : (
                <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8', background: 'white', borderRadius: 14, border: '1px solid #e2e8f0' }}>
                    Chưa có dữ liệu chứng từ cho kỳ này
                </div>
            )}
        </div>
    );
}

// ─── TAB: CẤU HÌNH DANH MỤC ─────────────────────────────────────────────────
function DanhMucTab({ dm, setDm }) {
    const [newThu, setNewThu] = useState('');
    const [newChi, setNewChi] = useState('');

    const addItem = (type, val) => {
        const v = val.trim(); if (!v) return;
        const updated = { ...dm, [type]: [...dm[type], v] };
        setDm(updated); saveDM(updated);
        if (type === 'thu') setNewThu(''); else setNewChi('');
    };
    const removeItem = (type, idx) => {
        const updated = { ...dm, [type]: dm[type].filter((_, i) => i !== idx) };
        setDm(updated); saveDM(updated);
    };
    const resetDefault = () => { setDm(DM_DEFAULT); saveDM(DM_DEFAULT); };

    const Section = ({ type, label, color, newVal, setNewVal }) => (
        <div style={{ background: 'white', borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', background: color, color: 'white', fontWeight: 800, fontSize: 13 }}>{label}</div>
            <div style={{ padding: 16 }}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                    <input style={{ ...inp, flex: 1 }} placeholder="Tên danh mục mới..." value={newVal} onChange={e => setNewVal(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addItem(type, newVal))} />
                    <button onClick={() => addItem(type, newVal)} style={{ ...btn(color), padding: '8px 16px', whiteSpace: 'nowrap' }}>+ Thêm</button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {dm[type].map((name, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                            <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{name}</span>
                            <button onClick={() => removeItem(type, i)} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '2px 6px' }}>×</button>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>⚙️ Cấu hình danh mục Thu/Chi</div>
                <button onClick={resetDefault} style={{ ...btn('#f1f5f9', '#475569'), fontSize: 12 }}>Khôi phục mặc định</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <Section type="thu" label="🟢 Danh mục Thu" color="#16a34a" newVal={newThu} setNewVal={setNewThu} />
                <Section type="chi" label="🔴 Danh mục Chi" color="#dc2626" newVal={newChi} setNewVal={setNewChi} />
            </div>
        </div>
    );
}

// ─── MAIN PAGE ───────────────────────────────────────────────────────────────
const TABS = [
    { key: 'thu_chi', label: '💰 Thu Chi Hàng Ngày' },
    { key: 'chung_tu', label: '📄 Chứng Từ KT' },
    { key: 'bao_cao', label: '📊 Báo Cáo Thuế' },
    { key: 'danh_muc', label: '⚙️ Cấu hình danh mục' },
];

export default function KeToanPage() {
    const [tab, setTab] = useState('thu_chi');
    const [dm, setDm] = useState(loadDM);
    return (
        <div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 20, background: 'white', borderRadius: 12, padding: 5, border: '1px solid #e2e8f0', width: 'fit-content', flexWrap: 'wrap' }}>
                {TABS.map(t => (
                    <button key={t.key} onClick={() => setTab(t.key)}
                        style={{ padding: '8px 18px', borderRadius: 9, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13, background: tab === t.key ? '#1e293b' : 'transparent', color: tab === t.key ? 'white' : '#64748b', transition: 'all .15s' }}>
                        {t.label}
                    </button>
                ))}
            </div>
            {tab === 'thu_chi' && <ThuChiTab dm={dm} />}
            {tab === 'chung_tu' && <ChungTuTab />}
            {tab === 'bao_cao' && <BaoCaoThueTab />}
            {tab === 'danh_muc' && <DanhMucTab dm={dm} setDm={setDm} />}
        </div>
    );
}
