import { useEffect, useState } from 'react';
import InvoiceOcrBtn from './InvoiceOcrBtn';
import { API, CT_STATUS, Field, LOAI_CT, Modal, btn, fmt, inp, today } from './shared';

export default function ChungTuTab() {
    const [list, setList] = useState([]);
    const [modal, setModal] = useState(null);
    const [form, setForm] = useState({ loai_ct: '', ngay_lap: today(), ngay_hach_toan: today(), doi_tuong: '', mo_ta: '', so_tien: '', thue_suat: 0, trang_thai: 'Nháp', nguoi_lap: '' });
    const [filterTT, setFilterTT] = useState('');
    const [confirmDel, setConfirmDel] = useState(null);

    const load = async () => {
        const r = await fetch(`${API}/api/chung_tu`);
        setList(await r.json());
    };
    useEffect(() => {
        let cancelled = false;
        const fetchList = async () => {
            const r = await fetch(`${API}/api/chung_tu`);
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
