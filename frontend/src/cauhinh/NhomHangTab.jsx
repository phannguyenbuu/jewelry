import { useEffect, useState } from 'react';
import { API, BtnRow, ConfirmModal, Field, Modal, inp, saveBtn } from './shared';

const COLOR_PRESETS = [
    '#6366f1', '#ec4899', '#14b8a6', '#f59e0b', '#8b5cf6', '#ef4444',
    '#06b6d4', '#84cc16', '#f97316', '#0ea5e9', '#10b981', '#a855f7',
];

export default function NhomHangTab() {
    const [list, setList] = useState([]);
    const [modal, setModal] = useState(null); // null | 'add' | obj
    const [form, setForm] = useState({ ten_nhom: '', ma_nhom: '', mau_sac: '#6366f1', mo_ta: '', thu_tu: 0 });
    const [confirm, setConfirm] = useState(null);

    const load = async () => {
        const r = await fetch(`${API}/api/nhom_hang`);
        setList(await r.json());
    };
    useEffect(() => {
        let cancelled = false;
        const fetchList = async () => {
            const r = await fetch(`${API}/api/nhom_hang`);
            const data = await r.json();
            if (!cancelled) setList(data);
        };
        fetchList().catch(() => { });
        return () => {
            cancelled = true;
        };
    }, []);

    const openAdd = () => {
        setForm({ ten_nhom: '', ma_nhom: '', mau_sac: '#6366f1', mo_ta: '', thu_tu: list.length });
        setModal('add');
    };
    const openEdit = n => { setForm({ ...n }); setModal(n); };

    const save = async e => {
        e.preventDefault();
        const isEdit = modal !== 'add';
        await fetch(isEdit ? `${API}/api/nhom_hang/${modal.id}` : `${API}/api/nhom_hang`, {
            method: isEdit ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...form, thu_tu: Number(form.thu_tu || 0) }),
        });
        setModal(null); load();
    };

    const del = async () => {
        await fetch(`${API}/api/nhom_hang/${confirm}`, { method: 'DELETE' });
        setConfirm(null); load();
    };

    return (
        <>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div style={{ fontSize: 13, color: '#64748b' }}>{list.length} nhóm hàng</div>
                <button onClick={openAdd} style={saveBtn}>+ Thêm nhóm hàng</button>
            </div>

            {/* Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: 14 }}>
                {list.length === 0 && (
                    <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 60, color: '#94a3b8', background: 'white', borderRadius: 14, border: '1px solid #e2e8f0' }}>
                        Chưa có nhóm hàng nào
                    </div>
                )}
                {list.map(n => (
                    <div key={n.id} style={{ background: 'white', borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 6px rgba(0,0,0,.05)' }}>
                        {/* Color bar */}
                        <div style={{ height: 6, background: n.mau_sac || '#6366f1' }} />
                        <div style={{ padding: '14px 16px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                        <span style={{ background: n.mau_sac + '22', color: n.mau_sac, borderRadius: 20, padding: '3px 12px', fontSize: 12, fontWeight: 800 }}>
                                            {n.ten_nhom}
                                        </span>
                                    </div>
                                    {n.ma_nhom && <div style={{ fontSize: 11, color: '#94a3b8' }}>Mã: {n.ma_nhom}</div>}
                                </div>
                                <div style={{ background: n.mau_sac + '18', borderRadius: 10, padding: '4px 10px', textAlign: 'center' }}>
                                    <div style={{ fontSize: 18, fontWeight: 900, color: n.mau_sac }}>{n.so_hang || 0}</div>
                                    <div style={{ fontSize: 9, color: n.mau_sac, fontWeight: 700 }}>sản phẩm</div>
                                </div>
                            </div>
                            {n.mo_ta && <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10, lineHeight: 1.4 }}>{n.mo_ta}</div>}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div style={{ flex: 1, height: 4, borderRadius: 4, background: '#f1f5f9', overflow: 'hidden' }}>
                                    <div style={{ height: '100%', background: n.mau_sac, width: `${Math.min((n.so_hang || 0) * 5, 100)}%`, transition: 'width .3s' }} />
                                </div>
                                <div style={{ display: 'flex', gap: 5 }}>
                                    <button onClick={() => openEdit(n)} style={{ ...inp, padding: '5px 10px', width: 'auto', cursor: 'pointer', fontSize: 11, background: '#f8fafc', color: '#475569', fontWeight: 600 }}>✏️</button>
                                    <button onClick={() => setConfirm(n.id)} style={{ ...inp, padding: '5px 10px', width: 'auto', cursor: 'pointer', fontSize: 11, background: '#fff1f2', color: '#dc2626', border: '1.5px solid #fecdd3', fontWeight: 600 }}>🗑</button>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Form Modal */}
            <Modal open={!!modal} onClose={() => setModal(null)} title={modal === 'add' ? '+ Thêm nhóm hàng' : '✏️ Sửa nhóm hàng'} maxWidth={520}>
                <form onSubmit={save}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                        <Field label="Tên nhóm *">
                            <input required style={inp} value={form.ten_nhom} onChange={e => setForm({ ...form, ten_nhom: e.target.value })} placeholder="VD: Nhẫn vàng" />
                        </Field>
                        <Field label="Mã nhóm">
                            <input style={inp} value={form.ma_nhom} onChange={e => setForm({ ...form, ma_nhom: e.target.value })} placeholder="VD: NV" />
                        </Field>
                    </div>
                    <Field label="Thứ tự hiển thị">
                        <input type="number" style={inp} value={form.thu_tu} onChange={e => setForm({ ...form, thu_tu: e.target.value })} />
                    </Field>
                    <Field label="Màu sắc badge">
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                            {COLOR_PRESETS.map(c => (
                                <button key={c} type="button" onClick={() => setForm({ ...form, mau_sac: c })}
                                    style={{ width: 32, height: 32, borderRadius: '50%', background: c, border: form.mau_sac === c ? '3px solid #1e293b' : '3px solid transparent', cursor: 'pointer', outline: 'none', transition: 'transform .1s', transform: form.mau_sac === c ? 'scale(1.2)' : 'scale(1)' }} />
                            ))}
                            <input type="color" value={form.mau_sac} onChange={e => setForm({ ...form, mau_sac: e.target.value })}
                                style={{ width: 32, height: 32, borderRadius: '50%', border: 'none', cursor: 'pointer', padding: 0 }} />
                        </div>
                        {/* Preview */}
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <span style={{ fontSize: 11, color: '#64748b' }}>Xem trước:</span>
                            <span style={{ background: form.mau_sac + '22', color: form.mau_sac, borderRadius: 20, padding: '3px 12px', fontSize: 12, fontWeight: 800 }}>
                                {form.ten_nhom || 'Tên nhóm'}
                            </span>
                        </div>
                    </Field>
                    <Field label="Mô tả">
                        <textarea style={{ ...inp, height: 70, resize: 'vertical' }} value={form.mo_ta} onChange={e => setForm({ ...form, mo_ta: e.target.value })} placeholder="Mô tả nhóm hàng..." />
                    </Field>
                    <BtnRow onClose={() => setModal(null)} label={modal === 'add' ? 'Tạo nhóm' : 'Lưu thay đổi'} />
                </form>
            </Modal>

            <ConfirmModal open={confirm !== null} onClose={() => setConfirm(null)}
                onConfirm={del}
                message="Xóa nhóm hàng này? Hàng hóa trong nhóm sẽ không bị xóa." />
        </>
    );
}

// ─── TRAO ĐỔI TAB ─────────────────────────────────────────────────────────────
