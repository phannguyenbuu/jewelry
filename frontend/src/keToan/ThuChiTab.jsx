import { useEffect, useState } from 'react';
import InvoiceOcrBtn from './InvoiceOcrBtn';
import { API, Field, Modal, btn, fmt, inp, today } from './shared';

export default function ThuChiTab({ dm }) {
    const [list, setList] = useState([]);
    const [modal, setModal] = useState(null);
    const [form, setForm] = useState({ loai: 'Thu', danh_muc: '', so_tien: '', ngay: today(), mo_ta: '', doi_tuong: '', phuong_thuc: 'Tiền mặt' });
    const [filterLoai, setFilterLoai] = useState('');
    const [filterNgay, setFilterNgay] = useState('');
    const [confirmDel, setConfirmDel] = useState(null);

    const load = async () => {
        const r = await fetch(`${API}/api/thu_chi`);
        setList(await r.json());
    };
    useEffect(() => {
        let cancelled = false;
        const fetchList = async () => {
            const r = await fetch(`${API}/api/thu_chi`);
            const data = await r.json();
            if (!cancelled) setList(data);
        };
        fetchList().catch(() => { });
        return () => {
            cancelled = true;
        };
    }, []);

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
