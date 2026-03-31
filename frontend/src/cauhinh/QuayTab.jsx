import { useEffect, useState } from 'react';
import { API, BtnRow, ConfirmModal, Field, Modal, byName, inp, readJsonSafe, readResponse, saveBtn } from './shared';

export default function QuayTab() {
    const [list, setList] = useState([]);
    const [khos, setKhos] = useState([]);
    const [thuNgans, setThuNgans] = useState([]);
    const [modal, setModal] = useState(null);
    const [confirm, setConfirm] = useState(null);
    const [form, setForm] = useState({});

    const load = async () => {
        const [quayRes, khoRes, thuNganRes] = await Promise.all([
            fetch(`${API}/api/quay_nho`),
            fetch(`${API}/api/kho`),
            fetch(`${API}/api/thu_ngan`),
        ]);
        const [quayData, khoData, thuNganData] = await Promise.all([
            readJsonSafe(quayRes, []),
            readJsonSafe(khoRes, []),
            readJsonSafe(thuNganRes, []),
        ]);
        setList(Array.isArray(quayData) ? quayData : []);
        setKhos(Array.isArray(khoData) ? khoData : []);
        setThuNgans(Array.isArray(thuNganData) ? thuNganData : []);
    };
    useEffect(() => {
        let cancelled = false;
        const fetchAll = async () => {
            const [quayRes, khoRes, thuNganRes] = await Promise.all([
                fetch(`${API}/api/quay_nho`),
                fetch(`${API}/api/kho`),
                fetch(`${API}/api/thu_ngan`),
            ]);
            const [quayData, khoData, thuNganData] = await Promise.all([
                readJsonSafe(quayRes, []),
                readJsonSafe(khoRes, []),
                readJsonSafe(thuNganRes, []),
            ]);
            if (cancelled) return;
            setList(Array.isArray(quayData) ? quayData : []);
            setKhos(Array.isArray(khoData) ? khoData : []);
            setThuNgans(Array.isArray(thuNganData) ? thuNganData : []);
        };
        fetchAll().catch(() => { });
        return () => {
            cancelled = true;
        };
    }, []);

    const save = async (e) => {
        e.preventDefault();
        try {
            const isEdit = modal !== 'add';
            const payload = {
                ten_quay: form.ten_quay || '',
                kho_id: form.kho_id || null,
                ghi_chu: form.ghi_chu || '',
                nguoi_phu_trach: form.nguoi_phu_trach || '',
                thu_ngan_id: form.thu_ngan_id || null,
            };
            await readResponse(await fetch(
                isEdit ? `${API}/api/quay_nho/${modal.id}` : `${API}/api/quay_nho`,
                { method: isEdit ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) },
            ));
            setModal(null);
            await load();
        } catch (err) {
            window.alert(err.message);
        }
    };

    const sortedKhos = [...khos].sort(byName('ten_kho'));
    const sortedThuNgans = [...thuNgans].sort(byName('ten_thu_ngan'));
    const sortedQuays = [...list].sort(byName('ten_quay'));
    const availableThuNgans = sortedThuNgans.filter(t => t.kho_id === form.kho_id);

    const handleKhoChange = (e) => {
        const nextKhoId = e.target.value ? Number(e.target.value) : '';
        setForm(prev => {
            const keepThuNgan = sortedThuNgans.some(item => item.id === prev.thu_ngan_id && item.kho_id === nextKhoId);
            return {
                ...prev,
                kho_id: nextKhoId,
                thu_ngan_id: keepThuNgan ? prev.thu_ngan_id : '',
            };
        });
    };

    const openAdd = () => {
        setForm({ ten_quay: '', kho_id: '', ghi_chu: '', nguoi_phu_trach: '', thu_ngan_id: '' });
        setModal('add');
    };

    const openEdit = (q) => {
        setForm({
            ...q,
            kho_id: q.kho_id || '',
            thu_ngan_id: q.thu_ngan_id || '',
        });
        setModal(q);
    };

    const renderQ = q => (
        <div key={q.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 14px', borderRadius: 8, background: '#f8fafc', border: '1px solid #f1f5f9', marginBottom: 6 }}>
            <div>
                <span style={{ fontWeight: 700, color: '#1e293b', fontSize: 13 }}>🗂 {q.ten_quay}</span>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                    <span style={{ fontSize: 10, color: q.ten_thu_ngan ? '#0f766e' : '#9a3412', background: q.ten_thu_ngan ? '#ccfbf1' : '#ffedd5', borderRadius: 999, padding: '3px 8px', fontWeight: 700 }}>
                        {q.ten_thu_ngan ? `Thu ngân: ${q.ten_thu_ngan}` : 'Chưa phân thu ngân'}
                    </span>
                    {q.nguoi_phu_trach && <span style={{ fontSize: 10, color: '#4338ca', background: '#eef2ff', borderRadius: 999, padding: '3px 8px', fontWeight: 700 }}>Nhân sự quầy: {q.nguoi_phu_trach}</span>}
                    {q.ngay_tao && <span style={{ fontSize: 10, color: '#94a3b8' }}>🕐 {q.ngay_tao}</span>}
                </div>
                {q.ghi_chu && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{q.ghi_chu}</div>}
            </div>
            <div style={{ display: 'flex', gap: 5 }}>
                <button onClick={() => openEdit(q)} style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #cbd5e1', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                </button>
                <button onClick={() => setConfirm(q.id)} style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #fca5a5', background: '#fff1f2', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#dc2626' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>
                </button>
            </div>
        </div>
    );

    return (
        <>
            <div style={{ marginBottom: 14, padding: '12px 14px', borderRadius: 12, border: '1px solid #dbeafe', background: '#eff6ff', color: '#1d4ed8', fontSize: 12, lineHeight: 1.6 }}>
                Tab <b>Quầy nhỏ</b> dùng để quản lý danh sách quầy nhỏ và gán mỗi quầy nhỏ cho đúng một thu ngân. Một thu ngân có thể phụ trách nhiều quầy nhỏ.
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
                <button onClick={openAdd} style={{ ...saveBtn, padding: '8px 18px' }}>+ Thêm quầy nhỏ</button>
            </div>
            {sortedKhos.map(k => (
                <div key={k.id} style={{ background: 'white', borderRadius: 12, border: '1px solid #e2e8f0', padding: '14px 18px', marginBottom: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                        <div style={{ fontWeight: 800, fontSize: 14, color: '#1e293b' }}>🏪 {k.ten_kho}</div>
                        <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700 }}>
                            {sortedQuays.filter(q => q.kho_id === k.id).length} quầy nhỏ
                        </div>
                    </div>
                    {sortedQuays.filter(q => q.kho_id === k.id).length === 0
                        ? <div style={{ color: '#94a3b8', fontSize: 12, fontStyle: 'italic' }}>Chưa có quầy nào</div>
                        : sortedQuays.filter(q => q.kho_id === k.id).map(renderQ)}
                </div>
            ))}
            {sortedQuays.filter(q => !q.kho_id).length > 0 && (
                <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e2e8f0', padding: '14px 18px' }}>
                    <div style={{ fontWeight: 800, fontSize: 14, color: '#94a3b8', marginBottom: 10 }}>📋 Chưa phân kho</div>
                    {sortedQuays.filter(q => !q.kho_id).map(renderQ)}
                </div>
            )}
            <Modal open={!!modal} onClose={() => setModal(null)} title={modal === 'add' ? '+ Thêm quầy nhỏ' : '✏️ Sửa quầy nhỏ'}>
                <form onSubmit={save}>
                    <Field label="Tên quầy *"><input required style={inp} value={form.ten_quay || ''} onChange={e => setForm({ ...form, ten_quay: e.target.value })} /></Field>
                    <Field label="Nhân sự tại quầy"><input style={inp} placeholder="VD: Nguyễn Văn B" value={form.nguoi_phu_trach || ''} onChange={e => setForm({ ...form, nguoi_phu_trach: e.target.value })} /></Field>
                    <Field label="Thuộc kho">
                        <select style={inp} value={form.kho_id || ''} onChange={handleKhoChange}>
                            <option value="">— Chưa phân kho —</option>
                            {sortedKhos.map(k => <option key={k.id} value={k.id}>{k.ten_kho}</option>)}
                        </select>
                    </Field>
                    <Field label="Thu ngân phụ trách">
                        {!form.kho_id ? (
                            <div style={{ padding: '10px 12px', borderRadius: 8, background: '#f8fafc', border: '1px solid #e2e8f0', color: '#94a3b8', fontSize: 12 }}>
                                Chọn kho trước để phân công thu ngân cho quầy nhỏ này.
                            </div>
                        ) : (
                            <>
                                <select style={inp} value={form.thu_ngan_id || ''} onChange={e => setForm({ ...form, thu_ngan_id: e.target.value ? Number(e.target.value) : '' })}>
                                    <option value="">— Chưa phân thu ngân —</option>
                                    {availableThuNgans.map(cashier => (
                                        <option key={cashier.id} value={cashier.id}>{cashier.ten_thu_ngan}</option>
                                    ))}
                                </select>
                                <div style={{ fontSize: 11, color: '#64748b', marginTop: 6 }}>
                                    Mỗi quầy nhỏ chỉ chọn được 1 thu ngân. Danh sách lấy từ tab/kho thu ngân hiện có trong cùng kho.
                                </div>
                                {availableThuNgans.length === 0 && (
                                    <div style={{ fontSize: 11, color: '#9a3412', marginTop: 6 }}>
                                        Kho này chưa có thu ngân để phân công.
                                    </div>
                                )}
                            </>
                        )}
                    </Field>
                    <Field label="Ghi chú"><textarea style={{ ...inp, height: 64, resize: 'vertical' }} value={form.ghi_chu || ''} onChange={e => setForm({ ...form, ghi_chu: e.target.value })} /></Field>
                    <BtnRow onClose={() => setModal(null)} label={modal === 'add' ? 'Tạo mới' : 'Lưu thay đổi'} />
                </form>
            </Modal>
            <ConfirmModal open={confirm !== null} onClose={() => setConfirm(null)}
                onConfirm={async () => { await fetch(`${API}/api/quay_nho/${confirm}`, { method: 'DELETE' }); load(); }}
                message="Xóa quầy nhỏ này?" />
        </>
    );
}

// ─── GIÁ VÀNG TAB ────────────────────────────────────────────────────────────

// Dispatch notification event (picked up by App.jsx)
