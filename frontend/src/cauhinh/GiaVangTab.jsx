import { useCallback, useEffect, useRef, useState } from 'react';
import { API, BtnRow, ConfirmModal, Field, HistPage, Modal, fmt, inp, saveBtn } from './shared';

function dispatchNotif(title, body) {
    window.dispatchEvent(new CustomEvent('jewelry-notification', { detail: { title, body, date: new Date().toISOString() } }));
}

export default function GiaVangTab() {
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
    const [autoMapping, setAutoMapping] = useState(false);
    const intervalRef = useRef(null);
    const prevPricesRef = useRef({});   // key→{ban,mua}
    const parseSjcPriceToVndPerChi = useCallback((raw) => {
        const amountPerLuongInThousand = Number(String(raw || '').replace(/[^\d.-]/g, ''));
        if (!Number.isFinite(amountPerLuongInThousand) || amountPerLuongInThousand <= 0) return 0;
        return Math.round(amountPerLuongInThousand * 100);
    }, []);

    const load = async () => {
        const r = await fetch(`${API}/api/loai_vang`);
        setList(await r.json());
    };
    useEffect(() => {
        let cancelled = false;
        const fetchList = async () => {
            const r = await fetch(`${API}/api/loai_vang`);
            const data = await r.json();
            if (!cancelled) setList(data);
        };
        fetchList().catch(() => { });
        return () => {
            cancelled = true;
        };
    }, []);

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

    const autoMapSjc = async () => {
        setAutoMapping(true);
        setSjcError('');
        try {
            const r = await fetch(`${API}/api/loai_vang/auto-map-sjc`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ force: true }),
            });
            const j = await r.json();
            if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
            await load();
            dispatchNotif('🧭 Mapping SJC', j.updated
                ? `Đã cập nhật ${j.updated} loại vàng theo tuổi vàng hiện có.`
                : 'Không có loại vàng nào cần cập nhật mapping.');
        } catch (e) {
            setSjcError('Lỗi mapping SJC: ' + e.message);
        } finally {
            setAutoMapping(false);
        }
    };

    // Áp giá SJC vào 1 item
    // Tạo mới loai_vang từ SJC row (chưa có mapping)
    const createFromSjc = async (sjcRow) => {
        // Sinh mã tự động từ tên SJC (vd: "Vàng SJC 5 chỉ" → "SJC-5chi")
        const ma = 'SJC-' + sjcRow.loai.replace(/[^\w\d]/g, '').slice(-8);
        const res = await fetch(`${API}/api/loai_vang`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ma_loai: ma,
                ten_loai: sjcRow.loai,
                sjc_key: sjcRow.loai,
                gia_ban: parseSjcPriceToVndPerChi(sjcRow.ban),
                gia_mua: parseSjcPriceToVndPerChi(sjcRow.mua),
                nguoi_phu_trach: '',
            })
        });
        load();
        return res;
    };

    // Áp giá SJC vào TẤT CẢ — tự tạo mới nếu chưa có mapping
    const applyAllSjc = async () => {
        if (!sjcData?.rows?.length) return;
        const tuoiRes = await fetch(`${API}/api/tuoi_vang`);
        const tuoiList = await tuoiRes.json().catch(() => []);
        const tuoiByName = {};
        (Array.isArray(tuoiList) ? tuoiList : []).forEach(item => {
            if (item?.ten_tuoi) tuoiByName[item.ten_tuoi] = item;
        });
        const promises = (sjcData.rows || []).map(async row => {
            const item = keyToItem[row.loai];
            const nextGiaBan = parseSjcPriceToVndPerChi(row.ban);
            const nextGiaMua = parseSjcPriceToVndPerChi(row.mua);
            if (item) {
                const tuoiItem = tuoiByName[item.ma_loai] || null;
                if (tuoiItem) {
                    return fetch(`${API}/api/tuoi_vang/${tuoiItem.id}`, {
                        method: 'PUT', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ gia_ban: nextGiaBan, gia_mua: nextGiaMua, note: `SJC ${sjcData?.timestamp}`, by: 'SJC' })
                    });
                }
                return fetch(`${API}/api/loai_vang/${item.id}`, {
                    method: 'PUT', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ gia_ban: nextGiaBan, gia_mua: nextGiaMua, note: `SJC ${sjcData?.timestamp}`, by: 'SJC' })
                });
            } else {
                // Chưa có → tạo mới
                const ma = 'SJC-' + row.loai.replace(/[^\w\d]/g, '').slice(-8);
                return fetch(`${API}/api/loai_vang`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        ma_loai: ma, ten_loai: row.loai, sjc_key: row.loai,
                        gia_ban: nextGiaBan, gia_mua: nextGiaMua, nguoi_phu_trach: ''
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
                <button onClick={autoMapSjc} disabled={autoMapping}
                    style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#f59e0b', color: 'white', fontWeight: 700, cursor: autoMapping ? 'wait' : 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {autoMapping ? '⏳' : '🧭'} {autoMapping ? 'Đang mapping...' : 'Map nhanh theo tuổi vàng'}
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
