import React, { useState, useEffect, useCallback, useRef } from 'react';

const API = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'https://jewelry.n-lux.com' : '';

const fmt = n => n ? Number(n).toLocaleString('vi-VN') : '—';

// ─── Shared UI ────────────────────────────────────────────────────────────────

function Modal({ open, onClose, title, children, maxWidth = 560 }) {
    if (!open) return null;
    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: 16 }}>
            <div style={{ background: 'white', borderRadius: 16, width: '100%', maxWidth, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 60px rgba(0,0,0,.2)' }}>
                <div style={{ padding: '15px 22px', background: '#1e293b', borderRadius: '16px 16px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 1 }}>
                    <span style={{ color: 'white', fontWeight: 800, fontSize: 15 }}>{title}</span>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'white', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>&times;</button>
                </div>
                <div style={{ padding: 24 }}>{children}</div>
            </div>
        </div>
    );
}

function ConfirmModal({ open, onClose, onConfirm, message }) {
    if (!open) return null;
    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2100, padding: 16 }}>
            <div style={{ background: 'white', borderRadius: 14, width: 380, boxShadow: '0 20px 50px rgba(0,0,0,.2)', padding: 28, textAlign: 'center' }}>
                <div style={{ fontSize: 38, marginBottom: 10 }}>⚠️</div>
                <p style={{ fontSize: 14, color: '#334155', margin: '0 0 22px', lineHeight: 1.6 }}>{message}</p>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                    <button onClick={onClose} style={{ padding: '9px 22px', borderRadius: 8, border: '1.5px solid #cbd5e1', background: 'white', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>Huỷ</button>
                    <button onClick={() => { onConfirm(); onClose(); }} style={{ padding: '9px 22px', borderRadius: 8, border: 'none', background: '#dc2626', color: 'white', fontWeight: 800, cursor: 'pointer', fontSize: 13 }}>Xác nhận xóa</button>
                </div>
            </div>
        </div>
    );
}

const Field = ({ label, children }) => (
    <div style={{ marginBottom: 14 }}>
        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 5, letterSpacing: .3 }}>{label}</label>
        {children}
    </div>
);
const inp = { padding: '8px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', outline: 'none', fontSize: 13, width: '100%', boxSizing: 'border-box' };
const saveBtn = { padding: '9px 22px', borderRadius: 8, border: 'none', background: '#2563eb', color: 'white', fontWeight: 800, cursor: 'pointer', fontSize: 13 };
const cancelBtn = { padding: '9px 20px', borderRadius: 8, border: '1.5px solid #cbd5e1', background: 'white', fontWeight: 700, cursor: 'pointer', fontSize: 13 };

function BtnRow({ onClose, label = 'Lưu' }) {
    return (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
            <button type="button" onClick={onClose} style={cancelBtn}>Huỷ</button>
            <button type="submit" style={saveBtn}>{label}</button>
        </div>
    );
}

// ─── HIST PAGE (lịch sử giá có paging) ──────────────────────────────────────
function HistPage({ manual, sjcHist, maxLen, totalPages, PAGE_SIZE, fmt, delta }) {
    const [page, setPage] = useState(1);
    const start = (page - 1) * PAGE_SIZE;
    const end = start + PAGE_SIZE;
    const pageRows = Array.from({ length: Math.min(PAGE_SIZE, maxLen - start) }, (_, i) => start + i);

    const HistRow = ({ h }) => h ? (
        <div style={{ padding: '8px 10px', borderBottom: '1px solid #f1f5f9' }}>
            <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 3 }}>📅 {h.date}</div>
            <div style={{ fontSize: 12 }}>
                <span style={{ color: '#15803d', fontWeight: 700 }}>{fmt(h.gia_ban)} ₫</span>
                <span style={{ color: '#94a3b8', margin: '0 4px' }}>/</span>
                <span style={{ color: '#c2410c', fontWeight: 700 }}>{fmt(h.gia_mua)} ₫</span>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                {h.delta_ban !== 0 && delta(h.delta_ban)}
                {h.delta_mua !== 0 && delta(h.delta_mua)}
            </div>
            {h.note && <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>💬 {h.note}</div>}
        </div>
    ) : <div style={{ padding: '8px 10px', color: '#e2e8f0', fontSize: 11, textAlign: 'center' }}>—</div>;

    return (
        <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ background: '#1e293b', color: 'white', padding: '9px 12px', fontWeight: 800, fontSize: 12, textAlign: 'center', borderRight: '1px solid rgba(255,255,255,.1)' }}>✏️ Giá tự chỉnh</div>
                <div style={{ background: '#0ea5e9', color: 'white', padding: '9px 12px', fontWeight: 800, fontSize: 12, textAlign: 'center' }}>📡 Giá theo SJC</div>
                {pageRows.map((i) => (
                    <React.Fragment key={i}>
                        <div style={{ borderRight: '1px solid #e2e8f0', background: i % 2 === 0 ? 'white' : '#f8fafc' }}><HistRow h={manual[i]} /></div>
                        <div style={{ background: i % 2 === 0 ? '#f0f9ff' : '#e0f2fe' }}><HistRow h={sjcHist[i]} /></div>
                    </React.Fragment>
                ))}
            </div>
            {/* Paging */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>
                    Tự chỉnh: {manual.length} lần · SJC sync: {sjcHist.length} lần
                </div>
                {totalPages > 1 && (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                            style={{ padding: '5px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', background: page === 1 ? '#f8fafc' : 'white', color: page === 1 ? '#cbd5e1' : '#1e293b', fontWeight: 700, cursor: page === 1 ? 'default' : 'pointer', fontSize: 12 }}>‹ Trước</button>
                        <span style={{ fontSize: 12, color: '#64748b', fontWeight: 700 }}>Trang {page} / {totalPages}</span>
                        <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                            style={{ padding: '5px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', background: page === totalPages ? '#f8fafc' : 'white', color: page === totalPages ? '#cbd5e1' : '#1e293b', fontWeight: 700, cursor: page === totalPages ? 'default' : 'pointer', fontSize: 12 }}>Sau ›</button>
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── KHO TAB ─────────────────────────────────────────────────────────────────

function KhoTab() {
    const [list, setList] = useState([]);
    const [modal, setModal] = useState(null);
    const [confirm, setConfirm] = useState(null);
    const [form, setForm] = useState({});

    const load = useCallback(async () => {
        const r = await fetch(`${API}/api/kho`);
        setList(await r.json());
    }, []);
    useEffect(() => { load(); }, [load]);

    const save = async (e) => {
        e.preventDefault();
        const isEdit = modal !== 'add';
        await fetch(isEdit ? `${API}/api/kho/${modal.id}` : `${API}/api/kho`,
            { method: isEdit ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
        setModal(null); load();
    };

    return (
        <>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
                <button onClick={() => { setForm({ ten_kho: '', dia_chi: '', ghi_chu: '', nguoi_phu_trach: '' }); setModal('add'); }}
                    style={{ ...saveBtn, padding: '8px 18px' }}>+ Thêm kho</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 14 }}>
                {list.map(k => (
                    <div key={k.id} style={{ background: 'white', borderRadius: 12, border: '1px solid #e2e8f0', padding: 18, boxShadow: '0 1px 4px rgba(0,0,0,.04)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                                <div style={{ fontWeight: 800, fontSize: 15, color: '#1e293b' }}>🏪 {k.ten_kho}</div>
                                {k.dia_chi && <div style={{ fontSize: 12, color: '#64748b', marginTop: 3 }}>📍 {k.dia_chi}</div>}
                                {k.nguoi_phu_trach && <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>👤 {k.nguoi_phu_trach}</div>}
                                {k.ngay_tao && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>🕐 {k.ngay_tao}</div>}
                                {k.ghi_chu && <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>💬 {k.ghi_chu}</div>}
                            </div>
                            <div style={{ display: 'flex', gap: 6 }}>
                                <button onClick={() => { setForm({ ...k }); setModal(k); }} style={{ width: 30, height: 30, borderRadius: 7, border: '1px solid #cbd5e1', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb' }}>
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                                </button>
                                <button onClick={() => setConfirm(k.id)} style={{ width: 30, height: 30, borderRadius: 7, border: '1px solid #fca5a5', background: '#fff1f2', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#dc2626' }}>
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
            <Modal open={!!modal} onClose={() => setModal(null)} title={modal === 'add' ? '+ Thêm kho' : '✏️ Sửa kho'}>
                <form onSubmit={save}>
                    <Field label="Tên kho *"><input required style={inp} value={form.ten_kho || ''} onChange={e => setForm({ ...form, ten_kho: e.target.value })} /></Field>
                    <Field label="Địa chỉ"><input style={inp} value={form.dia_chi || ''} onChange={e => setForm({ ...form, dia_chi: e.target.value })} /></Field>
                    <Field label="Người phụ trách"><input style={inp} placeholder="VD: Nguyễn Văn A" value={form.nguoi_phu_trach || ''} onChange={e => setForm({ ...form, nguoi_phu_trach: e.target.value })} /></Field>
                    <Field label="Ghi chú"><textarea style={{ ...inp, height: 72, resize: 'vertical' }} value={form.ghi_chu || ''} onChange={e => setForm({ ...form, ghi_chu: e.target.value })} /></Field>
                    <BtnRow onClose={() => setModal(null)} label={modal === 'add' ? 'Tạo mới' : 'Lưu thay đổi'} />
                </form>
            </Modal>
            <ConfirmModal open={confirm !== null} onClose={() => setConfirm(null)}
                onConfirm={async () => { await fetch(`${API}/api/kho/${confirm}`, { method: 'DELETE' }); load(); }}
                message="Xác nhận xóa kho này?" />
        </>
    );
}

// ─── QUẦY NHỎ TAB ────────────────────────────────────────────────────────────

function QuayTab() {
    const [list, setList] = useState([]);
    const [khos, setKhos] = useState([]);
    const [modal, setModal] = useState(null);
    const [confirm, setConfirm] = useState(null);
    const [form, setForm] = useState({});

    const load = useCallback(async () => {
        const [q, k] = await Promise.all([
            fetch(`${API}/api/quay_nho`).then(r => r.json()),
            fetch(`${API}/api/kho`).then(r => r.json()),
        ]);
        setList(q); setKhos(k);
    }, []);
    useEffect(() => { load(); }, [load]);

    const save = async (e) => {
        e.preventDefault();
        const isEdit = modal !== 'add';
        await fetch(isEdit ? `${API}/api/quay_nho/${modal.id}` : `${API}/api/quay_nho`,
            { method: isEdit ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
        setModal(null); load();
    };

    const renderQ = q => (
        <div key={q.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 14px', borderRadius: 8, background: '#f8fafc', border: '1px solid #f1f5f9', marginBottom: 6 }}>
            <div>
                <span style={{ fontWeight: 700, color: '#1e293b', fontSize: 13 }}>🗂 {q.ten_quay}</span>
                {q.nguoi_phu_trach && <span style={{ fontSize: 11, color: '#64748b', marginLeft: 8 }}>👤 {q.nguoi_phu_trach}</span>}
                {q.ngay_tao && <span style={{ fontSize: 10, color: '#94a3b8', marginLeft: 8 }}>🕐 {q.ngay_tao}</span>}
                {q.ghi_chu && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{q.ghi_chu}</div>}
            </div>
            <div style={{ display: 'flex', gap: 5 }}>
                <button onClick={() => { setForm({ ...q }); setModal(q); }} style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #cbd5e1', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb' }}>
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
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
                <button onClick={() => { setForm({ ten_quay: '', kho_id: '', ghi_chu: '', nguoi_phu_trach: '' }); setModal('add'); }} style={{ ...saveBtn, padding: '8px 18px' }}>+ Thêm quầy</button>
            </div>
            {khos.map(k => (
                <div key={k.id} style={{ background: 'white', borderRadius: 12, border: '1px solid #e2e8f0', padding: '14px 18px', marginBottom: 12 }}>
                    <div style={{ fontWeight: 800, fontSize: 14, color: '#1e293b', marginBottom: 10 }}>🏪 {k.ten_kho}</div>
                    {list.filter(q => q.kho_id === k.id).length === 0
                        ? <div style={{ color: '#94a3b8', fontSize: 12, fontStyle: 'italic' }}>Chưa có quầy nào</div>
                        : list.filter(q => q.kho_id === k.id).map(renderQ)}
                </div>
            ))}
            {list.filter(q => !q.kho_id).length > 0 && (
                <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e2e8f0', padding: '14px 18px' }}>
                    <div style={{ fontWeight: 800, fontSize: 14, color: '#94a3b8', marginBottom: 10 }}>📋 Chưa phân kho</div>
                    {list.filter(q => !q.kho_id).map(renderQ)}
                </div>
            )}
            <Modal open={!!modal} onClose={() => setModal(null)} title={modal === 'add' ? '+ Thêm quầy nhỏ' : '✏️ Sửa quầy nhỏ'}>
                <form onSubmit={save}>
                    <Field label="Tên quầy *"><input required style={inp} value={form.ten_quay || ''} onChange={e => setForm({ ...form, ten_quay: e.target.value })} /></Field>
                    <Field label="Người phụ trách"><input style={inp} placeholder="VD: Nguyễn Văn B" value={form.nguoi_phu_trach || ''} onChange={e => setForm({ ...form, nguoi_phu_trach: e.target.value })} /></Field>
                    <Field label="Thuộc kho">
                        <select style={inp} value={form.kho_id || ''} onChange={e => setForm({ ...form, kho_id: e.target.value ? Number(e.target.value) : null })}>
                            <option value="">— Chưa phân kho —</option>
                            {khos.map(k => <option key={k.id} value={k.id}>{k.ten_kho}</option>)}
                        </select>
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
function dispatchNotif(title, body) {
    window.dispatchEvent(new CustomEvent('jewelry-notification', { detail: { title, body, date: new Date().toISOString() } }));
}

function GiaVangTab() {
    const [list, setList] = useState([]);
    const [modal, setModal] = useState(null);
    const [priceModal, setPriceModal] = useState(null);
    const [histModal, setHistModal] = useState(null);
    const [confirm, setConfirm] = useState(null);
    const [form, setForm] = useState({});
    const [priceForm, setPriceForm] = useState({ gia_ban: '', gia_mua: '', note: '' });

    // SJC
    const [sjcModal, setSjcModal] = useState(false);
    const [sjcData, setSjcData] = useState(null);   // {timestamp, rows, fetched_at}
    const [sjcLoading, setSjcLoading] = useState(false);
    const [sjcError, setSjcError] = useState('');
    const [refreshMins, setRefreshMins] = useState(60);
    const [nextFetch, setNextFetch] = useState(null);   // countdown display
    const intervalRef = useRef(null);
    const prevPricesRef = useRef({});   // key→{ban,mua}

    const load = useCallback(async () => {
        const r = await fetch(`${API}/api/loai_vang`);
        setList(await r.json());
    }, []);
    useEffect(() => { load(); }, [load]);

    // Auto-fetch SJC
    const fetchSJC = useCallback(async (silent = false) => {
        if (!silent) setSjcLoading(true);
        setSjcError('');
        try {
            const r = await fetch(`${API}/api/sjc-price`);
            const j = await r.json();
            if (j.error) { setSjcError(j.error); return; }
            // Detect changes vs previous fetch
            const prev = prevPricesRef.current;
            const changes = [];
            (j.rows || []).forEach(row => {
                const key = row.loai;
                if (prev[key] && (prev[key].ban !== row.ban || prev[key].mua !== row.mua)) {
                    changes.push(`${key}: Bán ${prev[key].ban}→${row.ban} | Mua ${prev[key].mua}→${row.mua}`);
                }
                prev[key] = { ban: row.ban, mua: row.mua };
            });
            prevPricesRef.current = { ...prev };
            if (changes.length > 0) {
                dispatchNotif('📈 Giá SJC thay đổi', changes.join('\n'));
            }
            setSjcData(j);
            if (!silent) setSjcModal(true);
        } catch (e) {
            setSjcError('Lỗi kết nối: ' + e.message);
        } finally {
            if (!silent) setSjcLoading(false);
        }
    }, []);

    // Setup interval
    useEffect(() => {
        if (intervalRef.current) clearInterval(intervalRef.current);
        if (refreshMins > 0) {
            const ms = refreshMins * 60 * 1000;
            intervalRef.current = setInterval(() => fetchSJC(true), ms);
            setNextFetch(new Date(Date.now() + ms));
        }
        return () => clearInterval(intervalRef.current);
    }, [refreshMins, fetchSJC]);

    const openAdd = () => { setForm({ ma_loai: '', ten_loai: '', gia_ban: '', gia_mua: '', sjc_key: '', nguoi_phu_trach: '' }); setModal('add'); };
    const openEdit = v => { setForm({ ...v }); setModal(v); };
    const openPrice = v => { setPriceForm({ gia_ban: v.gia_ban, gia_mua: v.gia_mua, note: '' }); setPriceModal(v); };

    const save = async (e) => {
        e.preventDefault();
        const isEdit = modal !== 'add';
        await fetch(isEdit ? `${API}/api/loai_vang/${modal.id}` : `${API}/api/loai_vang`,
            { method: isEdit ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
        setModal(null); load();
    };

    const updatePrice = async (e) => {
        e.preventDefault();
        await fetch(`${API}/api/loai_vang/${priceModal.id}`,
            { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(priceForm) });
        setPriceModal(null); load();
    };

    // Áp giá SJC vào 1 item
    const applySjcRow = async (item, sjcRow) => {
        const parseNum = s => Math.round(parseFloat(s.replace(/,/g, '')) * 100_000);
        await fetch(`${API}/api/loai_vang/${item.id}`,
            {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ gia_ban: parseNum(sjcRow.ban), gia_mua: parseNum(sjcRow.mua), note: `SJC ${sjcData?.timestamp}`, by: 'SJC' })
            });
        load();
    };

    // Tạo mới loai_vang từ SJC row (chưa có mapping)
    const createFromSjc = async (sjcRow) => {
        const parseNum = s => Math.round(parseFloat(s.replace(/,/g, '')) * 100_000);
        // Sinh mã tự động từ tên SJC (vd: "Vàng SJC 5 chỉ" → "SJC-5chi")
        const ma = 'SJC-' + sjcRow.loai.replace(/[^\w\d]/g, '').slice(-8);
        const res = await fetch(`${API}/api/loai_vang`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ma_loai: ma,
                ten_loai: sjcRow.loai,
                sjc_key: sjcRow.loai,
                gia_ban: parseNum(sjcRow.ban),
                gia_mua: parseNum(sjcRow.mua),
                nguoi_phu_trach: '',
            })
        });
        load();
        return res;
    };

    // Áp giá SJC vào TẤT CẢ — tự tạo mới nếu chưa có mapping
    const applyAllSjc = async () => {
        if (!sjcData?.rows?.length) return;
        const parseNum = s => Math.round(parseFloat(s.replace(/,/g, '')) * 100_000);
        const promises = (sjcData.rows || []).map(async row => {
            const item = keyToItem[row.loai];
            if (item) {
                // Đã có mapping → update giá
                return fetch(`${API}/api/loai_vang/${item.id}`, {
                    method: 'PUT', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ gia_ban: parseNum(row.ban), gia_mua: parseNum(row.mua), note: `SJC ${sjcData?.timestamp}`, by: 'SJC' })
                });
            } else {
                // Chưa có → tạo mới
                const ma = 'SJC-' + row.loai.replace(/[^\w\d]/g, '').slice(-8);
                return fetch(`${API}/api/loai_vang`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        ma_loai: ma, ten_loai: row.loai, sjc_key: row.loai,
                        gia_ban: parseNum(row.ban), gia_mua: parseNum(row.mua), nguoi_phu_trach: ''
                    })
                });
            }
        });
        await Promise.all(promises);
        setSjcModal(false);
        load();
    };

    const delta = n => {
        if (!n) return null;
        const c = n > 0 ? '#16a34a' : '#dc2626';
        return <span style={{ color: c, fontSize: 11, fontWeight: 700 }}>{n > 0 ? '+' : ''}{Number(n).toLocaleString('vi-VN')}</span>;
    };

    // Map sjc_key → our item for SJC modal
    const keyToItem = {};
    list.forEach(v => { if (v.sjc_key) keyToItem[v.sjc_key] = v; });

    return (
        <>
            {/* Action bar */}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
                {/* Auto-refresh setting */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'white', border: '1.5px solid #e2e8f0', borderRadius: 8, padding: '5px 12px', fontSize: 12, color: '#64748b' }}>
                    <span>🔄 Tự động lấy mỗi</span>
                    <input type="number" min="0" value={refreshMins}
                        onChange={e => setRefreshMins(Number(e.target.value))}
                        style={{ width: 48, padding: '2px 6px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12, textAlign: 'center' }} />
                    <span>phút</span>
                    {nextFetch && refreshMins > 0 && <span style={{ color: '#94a3b8', marginLeft: 4 }}>(lần tới: {nextFetch.toLocaleTimeString('vi-VN')})</span>}
                </div>
                <button onClick={() => fetchSJC(false)} disabled={sjcLoading}
                    style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#0ea5e9', color: 'white', fontWeight: 700, cursor: sjcLoading ? 'wait' : 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {sjcLoading ? '⏳' : '📡'} {sjcLoading ? 'Đang lấy...' : 'Lấy giá từ SJC'}
                </button>
                <button onClick={openAdd} style={{ ...saveBtn, padding: '8px 18px' }}>+ Thêm loại vàng</button>
            </div>
            {sjcError && <div style={{ background: '#fff1f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '8px 14px', marginBottom: 12, color: '#dc2626', fontSize: 13 }}>⚠️ {sjcError}</div>}

            {/* Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 14 }}>
                {list.map(v => (
                    <div key={v.id} style={{ background: 'white', borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 6px rgba(0,0,0,.05)' }}>
                        {/* Card header */}
                        <div style={{ background: 'linear-gradient(135deg,#f59e0b,#d97706)', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                                <div style={{ color: 'white', fontWeight: 900, fontSize: 18 }}>{v.ma_loai}</div>
                                <div style={{ color: 'rgba(255,255,255,.85)', fontSize: 11, marginTop: 1 }}>{v.ten_loai}</div>
                                {v.sjc_key && (
                                    <div style={{ marginTop: 5, display: 'inline-block', background: 'rgba(0,0,0,.2)', borderRadius: 12, padding: '2px 8px', fontSize: 10, color: 'white' }}>
                                        🔗 {v.sjc_key}
                                    </div>
                                )}
                                {v.nguoi_phu_trach && (
                                    <div style={{ marginTop: 4, fontSize: 10, color: 'rgba(255,255,255,.75)' }}>👤 {v.nguoi_phu_trach}{v.ngay_tao ? ` · ${v.ngay_tao}` : ''}</div>
                                )}
                            </div>
                            <div style={{ display: 'flex', gap: 5 }}>
                                <button onClick={() => openEdit(v)} style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid rgba(255,255,255,.3)', background: 'rgba(255,255,255,.15)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                                </button>
                                <button onClick={() => setConfirm(v.id)} style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid rgba(255,255,255,.3)', background: 'rgba(220,38,38,.3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>
                                </button>
                            </div>
                        </div>
                        {/* Prices */}
                        <div style={{ padding: '12px 16px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                                <div style={{ background: '#f0fdf4', borderRadius: 8, padding: '8px 12px', border: '1px solid #bbf7d0' }}>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: '#16a34a', marginBottom: 3, letterSpacing: .3 }}>GIÁ BÁN RA</div>
                                    <div style={{ fontSize: 15, fontWeight: 900, color: '#15803d' }}>{fmt(v.gia_ban)}<span style={{ fontSize: 10 }}> ₫</span></div>
                                </div>
                                <div style={{ background: '#fff7ed', borderRadius: 8, padding: '8px 12px', border: '1px solid #fed7aa' }}>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: '#c2410c', marginBottom: 3, letterSpacing: .3 }}>GIÁ MUA VÀO</div>
                                    <div style={{ fontSize: 15, fontWeight: 900, color: '#c2410c' }}>{fmt(v.gia_mua)}<span style={{ fontSize: 10 }}> ₫</span></div>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button onClick={() => openPrice(v)} style={{ flex: 1, padding: '7px', borderRadius: 7, border: '1.5px solid #2563eb', background: 'white', color: '#2563eb', fontWeight: 700, cursor: 'pointer', fontSize: 11 }}>💹 Cập nhật giá</button>
                                <button onClick={() => setHistModal(v)} style={{ flex: 1, padding: '7px', borderRadius: 7, border: '1.5px solid #e2e8f0', background: 'white', color: '#64748b', fontWeight: 700, cursor: 'pointer', fontSize: 11 }}>📋 Lịch sử ({v.lich_su?.length || 0})</button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Edit info modal */}
            <Modal open={!!modal} onClose={() => setModal(null)} title={modal === 'add' ? '+ Thêm loại vàng' : '✏️ Sửa loại vàng'}>
                <form onSubmit={save}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                        <Field label="Mã loại *"><input required style={inp} value={form.ma_loai || ''} onChange={e => setForm({ ...form, ma_loai: e.target.value })} /></Field>
                        <Field label="Tên đầy đủ"><input style={inp} value={form.ten_loai || ''} onChange={e => setForm({ ...form, ten_loai: e.target.value })} /></Field>
                        <Field label="Giá bán ra (₫/chỉ)"><input type="number" style={inp} value={form.gia_ban || ''} onChange={e => setForm({ ...form, gia_ban: e.target.value })} /></Field>
                        <Field label="Giá mua vào (₫/chỉ)"><input type="number" style={inp} value={form.gia_mua || ''} onChange={e => setForm({ ...form, gia_mua: e.target.value })} /></Field>
                        <Field label="👤 Người phụ trách"><input style={inp} placeholder="VD: Nguyễn Văn A" value={form.nguoi_phu_trach || ''} onChange={e => setForm({ ...form, nguoi_phu_trach: e.target.value })} /></Field>
                    </div>
                    <Field label="🔗 Mapping SJC (tên hàng tương ứng bên SJC)">
                        <input style={inp} placeholder="VD: Nữ trang 75%" value={form.sjc_key || ''} onChange={e => setForm({ ...form, sjc_key: e.target.value })} />
                        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>Dùng để tự động áp giá khi lấy từ SJC</div>
                    </Field>
                    <BtnRow onClose={() => setModal(null)} label={modal === 'add' ? 'Tạo mới' : 'Lưu thay đổi'} />
                </form>
            </Modal>

            {/* Update price modal */}
            <Modal open={!!priceModal} onClose={() => setPriceModal(null)} title={`💹 Cập nhật giá — ${priceModal?.ma_loai}`}>
                <form onSubmit={updatePrice}>
                    <div style={{ background: '#f8fafc', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 12, color: '#64748b' }}>
                        Hiện tại: <b>{fmt(priceModal?.gia_ban)} ₫</b> (bán) / <b>{fmt(priceModal?.gia_mua)} ₫</b> (mua)
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                        <Field label="Giá bán ra mới (₫)"><input type="number" required style={inp} value={priceForm.gia_ban} onChange={e => setPriceForm({ ...priceForm, gia_ban: e.target.value })} /></Field>
                        <Field label="Giá mua vào mới (₫)"><input type="number" required style={inp} value={priceForm.gia_mua} onChange={e => setPriceForm({ ...priceForm, gia_mua: e.target.value })} /></Field>
                    </div>
                    <Field label="Ghi chú"><input style={inp} placeholder="VD: Theo thị trường ngày..." value={priceForm.note} onChange={e => setPriceForm({ ...priceForm, note: e.target.value })} /></Field>
                    <BtnRow onClose={() => setPriceModal(null)} label="Cập nhật giá" />
                </form>
            </Modal>

            {/* Price history modal — 2 columns: manual vs SJC */}
            <Modal open={!!histModal} onClose={() => setHistModal(null)} title={`📋 Lịch sử giá — ${histModal?.ma_loai}`} maxWidth={700}>
                {!histModal?.lich_su?.length
                    ? <div style={{ textAlign: 'center', color: '#94a3b8', padding: 24 }}>Chưa có lịch sử điều chỉnh.</div>
                    : (() => {
                        const PAGE_SIZE = 5;
                        const manual = [...(histModal.lich_su || [])].filter(h => h.by !== 'SJC').reverse();
                        const sjcHist = [...(histModal.lich_su || [])].filter(h => h.by === 'SJC').reverse();
                        const maxLen = Math.max(manual.length, sjcHist.length);
                        const totalPages = Math.ceil(maxLen / PAGE_SIZE) || 1;
                        // Use a local state — hoist via key trick
                        return <HistPage manual={manual} sjcHist={sjcHist} maxLen={maxLen} totalPages={totalPages} PAGE_SIZE={PAGE_SIZE} fmt={fmt} delta={delta} />;
                    })()}
            </Modal>

            {/* SJC Price modal */}
            <Modal open={sjcModal} onClose={() => setSjcModal(false)} title="📡 Bảng giá SJC — TP. Hồ Chí Minh" maxWidth={720}>
                {sjcData && (
                    <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>🕐 Giá thị trường: {sjcData.timestamp}</div>
                            <button onClick={applyAllSjc}
                                style={{ padding: '7px 18px', borderRadius: 8, border: 'none', background: '#16a34a', color: 'white', fontWeight: 800, cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                                ✅ Áp giá tất cả
                            </button>
                        </div>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                <thead>
                                    <tr style={{ background: '#f8fafc' }}>
                                        {['Loại vàng', 'Mua vào', 'Bán ra', 'Mapping nội bộ', ''].map(h => (
                                            <th key={h} style={{ padding: '9px 12px', textAlign: h === '' || h === 'Mua vào' || h === 'Bán ra' ? 'center' : 'left', fontWeight: 700, fontSize: 11, color: '#64748b', borderBottom: '1.5px solid #e2e8f0', whiteSpace: 'nowrap' }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {(sjcData.rows || []).map((row, i) => {
                                        const mapped = keyToItem[row.loai];
                                        return (
                                            <tr key={i} style={{ borderBottom: '1px solid #f1f5f9', background: mapped ? (i % 2 === 0 ? 'white' : '#fafafa') : '#fffbeb' }}>
                                                <td style={{ padding: '9px 12px', color: '#1e293b' }}>{row.loai}</td>
                                                <td style={{ padding: '9px 12px', textAlign: 'center', color: '#c2410c', fontWeight: 700 }}>{row.mua}</td>
                                                <td style={{ padding: '9px 12px', textAlign: 'center', color: '#16a34a', fontWeight: 700 }}>{row.ban}</td>
                                                <td style={{ padding: '9px 12px', textAlign: 'center' }}>
                                                    {mapped ? (
                                                        <span style={{ background: '#dbeafe', color: '#1d4ed8', borderRadius: 12, padding: '2px 10px', fontSize: 11, fontWeight: 700 }}>
                                                            {mapped.ma_loai}
                                                        </span>
                                                    ) : <span style={{ color: '#f59e0b', fontSize: 11, fontWeight: 600 }}>Chưa có</span>}
                                                </td>
                                                <td style={{ padding: '9px 12px', textAlign: 'center' }}>
                                                    {mapped
                                                        ? <span style={{ background: '#dcfce7', color: '#15803d', borderRadius: 12, padding: '2px 10px', fontSize: 11, fontWeight: 700 }}>✓ mapped</span>
                                                        : <button onClick={() => createFromSjc(row)}
                                                            style={{ padding: '4px 12px', borderRadius: 6, border: 'none', background: '#f59e0b', color: 'white', fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                                            + Tạo mới
                                                        </button>
                                                    }
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        <div style={{ marginTop: 16, padding: '10px 14px', background: '#fffbeb', borderRadius: 8, border: '1px solid #fde68a', fontSize: 12, color: '#92400e' }}>
                            ⚠️ Giá SJC tính trên lượng (37.5g). Khi bấm <b>Áp giá</b>, hệ thống tự quy đổi sang đồng/chỉ (÷10 × 1.000).
                        </div>
                    </>
                )}
            </Modal>

            <ConfirmModal open={confirm !== null} onClose={() => setConfirm(null)}
                onConfirm={async () => { await fetch(`${API}/api/loai_vang/${confirm}`, { method: 'DELETE' }); load(); }}
                message="Xóa loại vàng này? Toàn bộ lịch sử giá sẽ mất." />
        </>
    );
}

// ─── NHÓM HÀNG TAB ─────────────────────────────────────────────────────────────────

const COLOR_PRESETS = [
    '#6366f1', '#ec4899', '#14b8a6', '#f59e0b', '#8b5cf6', '#ef4444',
    '#06b6d4', '#84cc16', '#f97316', '#0ea5e9', '#10b981', '#a855f7',
];

function NhomHangTab() {
    const [list, setList] = useState([]);
    const [modal, setModal] = useState(null); // null | 'add' | obj
    const [form, setForm] = useState({ ten_nhom: '', ma_nhom: '', mau_sac: '#6366f1', mo_ta: '', thu_tu: 0 });
    const [confirm, setConfirm] = useState(null);

    const load = useCallback(async () => {
        const r = await fetch(`${API}/api/nhom_hang`);
        setList(await r.json());
    }, []);
    useEffect(() => { load(); }, [load]);

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

// ─── MAIN EXPORT ─────────────────────────────────────────────────────────────

const SUB_TABS = [
    { key: 'gia_vang', label: '🥇 Giá vàng', Component: GiaVangTab },
    { key: 'nhom_hang', label: '🏷️ Nhóm hàng', Component: NhomHangTab },
    { key: 'kho', label: '🏪 Kho', Component: KhoTab },
    { key: 'quay_nho', label: '🗂 Quầy nhỏ', Component: QuayTab },
];

export default function CauHinhPage() {
    const [tab, setTab] = useState('gia_vang');
    const Active = SUB_TABS.find(t => t.key === tab)?.Component || (() => null);

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '0 28px', display: 'flex', gap: 4 }}>
                {SUB_TABS.map(t => (
                    <button key={t.key} onClick={() => setTab(t.key)} style={{
                        padding: '12px 18px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700,
                        background: 'none', color: tab === t.key ? '#1e293b' : '#94a3b8',
                        borderBottom: tab === t.key ? '2.5px solid #f59e0b' : '2.5px solid transparent',
                        transition: 'all .15s',
                    }}>{t.label}</button>
                ))}
            </div>
            <div style={{ flex: 1, padding: '24px 28px', overflowY: 'auto', background: '#f8fafc' }}>
                <Active />
            </div>
        </div>
    );
}
