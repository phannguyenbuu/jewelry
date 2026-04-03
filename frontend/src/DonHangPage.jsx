import { useEffect, useMemo, useState } from 'react';
import SalePosMobile from './SalePosMobile';
import ImageOcrUpload from './components/ImageOcrUpload';
import { API_BASE } from './lib/api';
import { archiveOrder, getOrderArchiveKey, pruneArchivedOrderKeys, readArchivedOrderKeys, unarchiveOrder } from './lib/orderArchive';

const API = API_BASE;

const fmt = n => n ? Number(n).toLocaleString('vi-VN') : '0';
const pad2 = value => String(value).padStart(2, '0');
const parseOrderDateValue = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return null;
    const normalized = raw.replace('T', ' ').replace(/\.\d+$/, '');
    const matched = normalized.match(/^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2})(?::(\d{2}))?)?$/);
    if (matched) {
        const [, year, month, day, hour = '00', minute = '00', second = '00'] = matched;
        return new Date(
            Number(year),
            Number(month) - 1,
            Number(day),
            Number(hour),
            Number(minute),
            Number(second),
        );
    }
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};
const toDateTimeInputValue = (value = new Date()) => {
    const date = parseOrderDateValue(value) || (value instanceof Date ? value : new Date());
    if (Number.isNaN(date.getTime())) return '';
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
};
const toOrderDateStorageValue = (value) => {
    const date = parseOrderDateValue(value);
    if (!date || Number.isNaN(date.getTime())) return String(value || '').trim();
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
};
const splitOrderDateDisplay = (value) => {
    const date = parseOrderDateValue(value);
    if (!date || Number.isNaN(date.getTime())) {
        return {
            dateText: String(value || '').trim() || '-',
            timeText: '--:--:--',
        };
    }
    return {
        dateText: `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`,
        timeText: `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`,
    };
};
const today = () => toDateTimeInputValue(new Date());

const STATUS_CFG = {
    'Mới': { bg: '#dbeafe', text: '#1d4ed8', dot: '#3b82f6' },
    'Xử lý': { bg: '#fef3c7', text: '#92400e', dot: '#f59e0b' },
    'Hoàn thành': { bg: '#dcfce7', text: '#166534', dot: '#16a34a' },
    'Hủy': { bg: '#fee2e2', text: '#991b1b', dot: '#dc2626' },
};

const LOAI_DON = [
    { key: 'Mua', icon: '🛒', color: '#6366f1', bg: '#eef2ff' },
    { key: 'Bán', icon: '💰', color: '#16a34a', bg: '#f0fdf4' },
    { key: 'Trao đổi', icon: '🔄', color: '#ea580c', bg: '#fff7ed' },
];

const EMPTY_FORM = {
    loai_don: 'Mua', khach_hang: '', cccd: '', so_dien_thoai: '',
    dia_chi_kh: '', dia_chi: '', ngay_dat: today(), ngay_giao: '',
    items: [], tong_tien: '', dat_coc: '', trang_thai: 'Mới',
    ghi_chu: '', nguoi_tao: '', chung_tu: [],
};

const inp = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box', outline: 'none' };
const btn = (bg, c = 'white') => ({ padding: '8px 18px', borderRadius: 8, border: 'none', background: bg, color: c, fontWeight: 700, cursor: 'pointer', fontSize: 13 });

/* ─── Modal ──────────────────────────────────────────────────────────── */
function Modal({ open, onClose, title, children, maxWidth = 640 }) {
    if (!open) return null;
    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
            onClick={e => e.target === e.currentTarget && onClose()}>
            <div style={{ background: 'white', borderRadius: 16, width: '100%', maxWidth, maxHeight: '92vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,.3)' }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: 'white', zIndex: 1 }}>
                    <span style={{ fontWeight: 800, fontSize: 15 }}>{title}</span>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#94a3b8' }}>×</button>
                </div>
                <div style={{ padding: 20 }}>{children}</div>
            </div>
        </div>
    );
}

function Field({ label, children, required }) {
    return (
        <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: .5 }}>
                {label}{required && <span style={{ color: '#dc2626', marginLeft: 2 }}>*</span>}
            </label>
            {children}
        </div>
    );
}

function StatusBadge({ s }) {
    const cfg = STATUS_CFG[s] || { bg: '#f1f5f9', text: '#64748b', dot: '#94a3b8' };
    return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: cfg.bg, color: cfg.text, borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 700 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.dot, display: 'inline-block' }} />
            {s}
        </span>
    );
}

function LoaiBadge({ l }) {
    const cfg = LOAI_DON.find(x => x.key === l) || LOAI_DON[0];
    return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: cfg.bg, color: cfg.color, borderRadius: 20, padding: '3px 9px', fontSize: 11, fontWeight: 700 }}>{cfg.icon} {l}</span>;
}

/* ─── Main Page ──────────────────────────────────────────────────────── */
export default function DonHangPage() {
    const [list, setList] = useState([]);
    const [archivedOrderKeys, setArchivedOrderKeys] = useState(() => readArchivedOrderKeys());
    const [modal, setModal] = useState(null);
    const [form, setForm] = useState(EMPTY_FORM);
    const [search, setSearch] = useState('');
    const [filterStatus, setFilterStatus] = useState('');
    const [filterLoai, setFilterLoai] = useState('');
    const [detailModal, setDetailModal] = useState(null);
    const [confirmDel, setConfirmDel] = useState(null);
    const [confirmDelAll, setConfirmDelAll] = useState(false);
    const [isDeletingAll, setIsDeletingAll] = useState(false);
    const [posOpen, setPosOpen] = useState(false);
    const [archiveModalOpen, setArchiveModalOpen] = useState(false);

    const load = async () => {
        const r = await fetch(`${API}/api/don_hang`);
        const rows = await r.json();
        setList(rows);
        setArchivedOrderKeys(pruneArchivedOrderKeys(rows));
    };

    useEffect(() => {
        let cancelled = false;
        const fetchList = async () => {
            const r = await fetch(`${API}/api/don_hang`);
            const data = await r.json();
            if (!cancelled) {
                setList(data);
                setArchivedOrderKeys(pruneArchivedOrderKeys(data));
            }
        };
        fetchList().catch(() => { });
        return () => {
            cancelled = true;
        };
    }, []);

    const openAdd = () => { setForm({ ...EMPTY_FORM }); setModal('add'); };
    const openEdit = d => {
        setForm({
            ...EMPTY_FORM,
            ...d,
            ngay_dat: toDateTimeInputValue(d?.ngay_dat || new Date()),
            chung_tu: d.chung_tu || [],
        });
        setModal(d);
    };

    const save = async e => {
        e.preventDefault();
        const isEdit = modal !== 'add';
        await fetch(isEdit ? `${API}/api/don_hang/${modal.id}` : `${API}/api/don_hang`, {
            method: isEdit ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ...form,
                ngay_dat: toOrderDateStorageValue(form.ngay_dat),
                tong_tien: Number(form.tong_tien || 0),
                dat_coc: Number(form.dat_coc || 0),
            }),
        });
        setModal(null); load();
    };

    const del = async () => {
        await fetch(`${API}/api/don_hang/${confirmDel}`, { method: 'DELETE' });
        setConfirmDel(null); load();
    };

    const delAll = async () => {
        setIsDeletingAll(true);
        try {
            const chunk = 10;
            for (let i = 0; i < list.length; i += chunk) {
                const batch = list.slice(i, i + chunk);
                await Promise.all(batch.map(d => fetch(`${API}/api/don_hang/${d.id}`, { method: 'DELETE' })));
            }
        } finally {
            setIsDeletingAll(false);
            setConfirmDelAll(false);
            load();
        }
    };

    const activeOrders = useMemo(() => list.filter(d => !archivedOrderKeys.has(getOrderArchiveKey(d))), [archivedOrderKeys, list]);
    const archivedOrders = useMemo(() => list.filter(d => archivedOrderKeys.has(getOrderArchiveKey(d))), [archivedOrderKeys, list]);

    const filtered = activeOrders.filter(d => {
        const q = search.toLowerCase();
        const matchSearch = !q || (d.ma_don || '').toLowerCase().includes(q) || (d.khach_hang || '').toLowerCase().includes(q) || (d.so_dien_thoai || '').includes(q) || (d.cccd || '').includes(q);
        const matchStatus = !filterStatus || d.trang_thai === filterStatus;
        const matchLoai = !filterLoai || d.loai_don === filterLoai;
        return matchSearch && matchStatus && matchLoai;
    });

    const stats = {
        total: activeOrders.length,
        mua: activeOrders.filter(d => d.loai_don === 'Mua').length,
        ban: activeOrders.filter(d => d.loai_don === 'Bán').length,
        traoDoi: activeOrders.filter(d => d.loai_don === 'Trao đổi').length,
        hoanThanh: activeOrders.filter(d => d.trang_thai === 'Hoàn thành').length,
        tongTien: activeOrders.filter(d => d.trang_thai !== 'Hủy').reduce((s, d) => s + (d.tong_tien || 0), 0),
    };

    const handleArchiveOrder = (order) => {
        archiveOrder(order);
        setArchivedOrderKeys(readArchivedOrderKeys());
    };

    const handleUnarchiveOrder = (order) => {
        unarchiveOrder(order);
        setArchivedOrderKeys(readArchivedOrderKeys());
    };

    const isTD = form.loai_don === 'Trao đổi';

    // Thêm ảnh chứng từ vào list
    const removeChungTu = idx => setForm(f => ({ ...f, chung_tu: f.chung_tu.filter((_, i) => i !== idx) }));

    return (
        <>
            <div>
                {/* Stats */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 12, marginBottom: 20 }}>
                    {[
                        { label: 'Tổng đơn', value: stats.total, color: '#6366f1', icon: '📦' },
                        { label: 'Đơn mua', value: stats.mua, color: '#6366f1', icon: '🛒' },
                        { label: 'Đơn bán', value: stats.ban, color: '#16a34a', icon: '💰' },
                        { label: 'Trao đổi', value: stats.traoDoi, color: '#ea580c', icon: '🔄' },
                        { label: 'Hoàn thành', value: stats.hoanThanh, color: '#16a34a', icon: '✅' },
                        { label: 'Doanh thu', value: fmt(stats.tongTien) + ' ₫', color: '#dc2626', icon: '💰', wide: true },
                    ].map(s => (
                        <div key={s.label} style={{ background: 'white', borderRadius: 12, padding: '14px 16px', border: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(0,0,0,.04)', gridColumn: s.wide ? 'span 2' : undefined }}>
                            <div style={{ fontSize: 20, marginBottom: 6 }}>{s.icon}</div>
                            <div style={{ fontSize: 22, fontWeight: 900, color: s.color }}>{s.value}</div>
                            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{s.label}</div>
                        </div>
                    ))}
                </div>

                {/* Toolbar */}
                <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                    <input placeholder="🔍 Tìm đơn, khách, CCCD..." value={search} onChange={e => setSearch(e.target.value)}
                        style={{ ...inp, width: 240 }} />
                    <select value={filterLoai} onChange={e => setFilterLoai(e.target.value)} style={{ ...inp, width: 140 }}>
                        <option value="">Tất cả loại</option>
                        {LOAI_DON.map(l => <option key={l.key}>{l.key}</option>)}
                    </select>
                    <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ ...inp, width: 150 }}>
                        <option value="">Tất cả trạng thái</option>
                        {Object.keys(STATUS_CFG).map(s => <option key={s}>{s}</option>)}
                    </select>
                    <div style={{ flex: 1 }} />
                    <button onClick={() => setArchiveModalOpen(true)} style={{ ...btn('#f8fafc', '#475569'), display: 'flex', alignItems: 'center', gap: 6 }}>
                        🗃 Hộp Lưu Trữ Lâu Dài {archivedOrders.length ? `(${archivedOrders.length})` : ''}
                    </button>
                    <button onClick={() => setConfirmDelAll(true)} style={{ ...btn('#fee2e2', '#dc2626'), display: 'flex', alignItems: 'center', gap: 6 }}>🗑 Xóa toàn bộ</button>
                    <button onClick={() => setPosOpen(true)} style={{ ...btn('#1e293b'), display: 'flex', alignItems: 'center', gap: 6 }}>📱 POS</button>
                    <button onClick={openAdd} style={{ ...btn('#6366f1'), display: 'flex', alignItems: 'center', gap: 6 }}>+ Tạo đơn hàng</button>
                </div>

                {/* Table */}
                <div style={{ background: 'white', borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                            <tr style={{ background: '#f8fafc' }}>
                                {['Mã đơn', 'Loại', 'Khách hàng', 'Ngày đặt', 'Tổng tiền', 'Tiền mặt', 'Trạng thái', ''].map(h => (
                                    <th key={h} style={{ padding: '11px 14px', textAlign: 'left', fontWeight: 700, fontSize: 11, color: '#64748b', borderBottom: '1.5px solid #e2e8f0', whiteSpace: 'nowrap' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.length === 0 && (
                                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>Chưa có đơn hàng</td></tr>
                            )}
                            {filtered.map((d, i) => (
                                <tr key={d.id} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? 'white' : '#fafafa' }}
                                    onMouseEnter={e => e.currentTarget.style.background = '#f0f9ff'}
                                    onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? 'white' : '#fafafa'}>
                                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#6366f1', cursor: 'pointer' }} onClick={() => setDetailModal(d)}>{d.ma_don}</td>
                                    <td style={{ padding: '10px 14px' }}><LoaiBadge l={d.loai_don || 'Mua'} /></td>
                                    <td style={{ padding: '10px 14px' }}>
                                        <div style={{ fontWeight: 600 }}>{d.khach_hang}</div>
                                        <div style={{ fontSize: 11, color: '#94a3b8' }}>{d.so_dien_thoai}{d.cccd && ` · CCCD: ${d.cccd}`}</div>
                                    </td>
                                    <td style={{ padding: '10px 14px', color: '#64748b' }}>
                                        <div>{splitOrderDateDisplay(d.ngay_dat).dateText}</div>
                                        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{splitOrderDateDisplay(d.ngay_dat).timeText}</div>
                                    </td>
                                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#16a34a' }}>{fmt(d.tong_tien)} ₫</td>
                                    <td style={{ padding: '10px 14px', color: '#c2410c' }}>{fmt(d.dat_coc)} ₫</td>
                                    <td style={{ padding: '10px 14px' }}><StatusBadge s={d.trang_thai} /></td>
                                    <td style={{ padding: '10px 14px' }}>
                                        <div style={{ display: 'flex', gap: 6 }}>
                                            <button onClick={() => handleArchiveOrder(d)} title="Đưa vào Hộp Lưu Trữ Lâu Dài" style={{ ...btn('#fff7ed', '#c2410c'), padding: '5px 10px', fontSize: 11 }}>🗃</button>
                                            <button onClick={() => openEdit(d)} style={{ ...btn('#f1f5f9', '#475569'), padding: '5px 10px', fontSize: 11 }}>✏️</button>
                                            <button onClick={() => setConfirmDel(d.id)} style={{ ...btn('#fee2e2', '#dc2626'), padding: '5px 10px', fontSize: 11 }}>🗑</button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* ─── FORM MODAL ─── */}
                <Modal open={!!modal} onClose={() => setModal(null)}
                    title={modal === 'add' ? '+ Tạo đơn hàng mới' : `✏️ Sửa đơn — ${modal?.ma_don}`}
                    maxWidth={700}>
                    <form onSubmit={save}>

                        {/* Chọn loại đơn */}
                        <div style={{ marginBottom: 18 }}>
                            <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 8, textTransform: 'uppercase', letterSpacing: .5 }}>Loại đơn hàng</label>
                            <div style={{ display: 'flex', gap: 10 }}>
                                {LOAI_DON.map(l => {
                                    const active = form.loai_don === l.key;
                                    return (
                                        <button key={l.key} type="button"
                                            onClick={() => setForm({ ...form, loai_don: l.key })}
                                            style={{
                                                flex: 1, padding: '10px 14px', borderRadius: 12,
                                                border: `2px solid ${active ? l.color : '#e2e8f0'}`,
                                                background: active ? l.bg : 'white',
                                                color: active ? l.color : '#64748b',
                                                fontWeight: 800, fontSize: 13, cursor: 'pointer',
                                                transition: 'all .15s',
                                                boxShadow: active ? `0 0 0 3px ${l.color}22` : 'none',
                                            }}>
                                            {l.icon} {l.key}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Trao đổi header */}
                        {isTD && (
                            <div style={{ background: '#fff7ed', border: '1.5px solid #fed7aa', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 12, color: '#92400e' }}>
                                🔄 <strong>Đơn trao đổi</strong> — Yêu cầu CCCD và số điện thoại khách hàng. Không có địa chỉ giao hàng.
                            </div>
                        )}

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                            <Field label="Khách hàng" required>
                                <input required style={inp} value={form.khach_hang} onChange={e => setForm({ ...form, khach_hang: e.target.value })} />
                            </Field>
                            <Field label="Số điện thoại" required={isTD}>
                                <input required={isTD} style={{ ...inp, borderColor: isTD ? '#fb923c' : undefined }} value={form.so_dien_thoai} onChange={e => setForm({ ...form, so_dien_thoai: e.target.value })} />
                            </Field>

                            {/* CCCD — chỉ Trao đổi */}
                            {isTD && (
                                <Field label="Số CCCD / CMND" required>
                                    <input required pattern="\d{9}|\d{12}" title="9 hoặc 12 chữ số"
                                        style={{ ...inp, borderColor: '#fb923c' }}
                                        value={form.cccd} onChange={e => setForm({ ...form, cccd: e.target.value })}
                                        placeholder="123456789012" />
                                </Field>
                            )}

                            <Field label="Ngày đặt">
                                <input type="datetime-local" style={inp} value={form.ngay_dat} onChange={e => setForm({ ...form, ngay_dat: e.target.value })} />
                            </Field>

                            {/* Ngày giao — chỉ Mua/Bán */}
                            {!isTD && (
                                <Field label="Ngày giao">
                                    <input type="date" style={inp} value={form.ngay_giao} onChange={e => setForm({ ...form, ngay_giao: e.target.value })} />
                                </Field>
                            )}

                            <Field label="Tổng tiền (₫)">
                                <input type="number" style={inp} value={form.tong_tien} onChange={e => setForm({ ...form, tong_tien: e.target.value })} />
                            </Field>
                            <Field label="Tiền mặt (₫)">
                                <input type="number" style={inp} value={form.dat_coc} onChange={e => setForm({ ...form, dat_coc: e.target.value })} />
                            </Field>

                            <Field label="Trạng thái">
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                    {Object.entries(STATUS_CFG).map(([s, cfg]) => {
                                        const active = form.trang_thai === s;
                                        return (
                                            <button key={s} type="button" onClick={() => setForm({ ...form, trang_thai: s })}
                                                style={{
                                                    display: 'inline-flex', alignItems: 'center', gap: 5,
                                                    padding: '6px 12px', borderRadius: 999,
                                                    border: `2px solid ${active ? cfg.dot : 'transparent'}`,
                                                    background: active ? cfg.bg : '#f1f5f9',
                                                    color: active ? cfg.text : '#94a3b8',
                                                    fontWeight: 700, fontSize: 11, cursor: 'pointer',
                                                    transition: 'all .15s', whiteSpace: 'nowrap',
                                                }}>
                                                <span style={{ width: 6, height: 6, borderRadius: '50%', background: active ? cfg.dot : '#cbd5e1' }} />
                                                {s}
                                            </button>
                                        );
                                    })}
                                </div>
                            </Field>

                            <Field label="Người tạo">
                                <input style={inp} value={form.nguoi_tao} onChange={e => setForm({ ...form, nguoi_tao: e.target.value })} />
                            </Field>
                        </div>

                        {/* Địa chỉ — phân nhánh */}
                        {isTD ? (
                            <Field label="Địa chỉ khách hàng">
                                <input style={inp} placeholder="Số nhà, đường, phường/xã, quận/huyện, tỉnh/TP..."
                                    value={form.dia_chi_kh} onChange={e => setForm({ ...form, dia_chi_kh: e.target.value })} />
                            </Field>
                        ) : (
                            <Field label="Địa chỉ giao hàng">
                                <input style={inp} value={form.dia_chi} onChange={e => setForm({ ...form, dia_chi: e.target.value })} />
                            </Field>
                        )}

                        <Field label="Ghi chú">
                            <textarea style={{ ...inp, height: 64, resize: 'vertical' }} value={form.ghi_chu} onChange={e => setForm({ ...form, ghi_chu: e.target.value })} />
                        </Field>

                        {/* ─── Upload chứng từ / OCR — có tất cả loại, nhưng bắt buộc hiển thị ở Trao đổi ─── */}
                        <div style={{ marginBottom: 16 }}>
                            <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 8, textTransform: 'uppercase', letterSpacing: .5 }}>
                                {isTD ? '📄 Chứng từ trao đổi (CCCD, Giấy tờ xe...)' : '📄 Chứng từ đính kèm'}
                            </label>

                            {/* Danh sách ảnh đã upload */}
                            {form.chung_tu && form.chung_tu.length > 0 && (
                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                                    {form.chung_tu.map((ct, idx) => (
                                        <div key={idx} style={{ position: 'relative', display: 'inline-block' }}>
                                            <img src={ct.url} alt={ct.name}
                                                style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 8, border: '1.5px solid #e2e8f0', cursor: 'pointer' }}
                                                onClick={() => window.open(ct.url, '_blank')} />
                                            <button type="button" onClick={() => removeChungTu(idx)}
                                                style={{ position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: '50%', background: '#dc2626', color: 'white', border: 'none', fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900 }}>×</button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* OCR component — khi "Dùng làm mô tả" sẽ điền vào ghi_chu */}
                            <ImageOcrUpload
                                apiUrl={API}
                                accentColor={isTD ? '#ea580c' : '#6366f1'}
                                label={isTD ? '📷 Upload chứng từ / OCR' : '📎 Đính kèm / OCR'}
                                onExtracted={text => setForm(f => ({ ...f, ghi_chu: (f.ghi_chu ? f.ghi_chu + '\n\n' : '') + '[OCR]\n' + text }))}
                            />
                            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>
                                Kết quả OCR sẽ được thêm vào ô Ghi chú bên trên.
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
                            <button type="button" onClick={() => setModal(null)} style={{ ...btn('#f1f5f9', '#475569') }}>Hủy</button>
                            <button type="submit" style={{ ...btn(isTD ? '#ea580c' : '#6366f1') }}>
                                {modal === 'add' ? 'Tạo đơn' : 'Lưu thay đổi'}
                            </button>
                        </div>
                    </form>
                </Modal>

                {/* ─── DETAIL MODAL ─── */}
                <Modal open={!!detailModal} onClose={() => setDetailModal(null)} title={`📦 Chi tiết — ${detailModal?.ma_don}`} maxWidth={680}>
                    {detailModal && (
                        <div>
                            {/* Loại đơn badge */}
                            <div style={{ marginBottom: 14 }}><LoaiBadge l={detailModal.loai_don || 'Mua'} /></div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 12, marginBottom: 16 }}>
                                {[
                                    ['Tên Khách hàng - CCCD', `${detailModal.khach_hang}${detailModal.cccd ? ' - ' + detailModal.cccd : ''}`],
                                    ['Địa chỉ', detailModal.dia_chi_kh || detailModal.dia_chi || '—'],
                                    ['SĐT', detailModal.so_dien_thoai || '—'],
                                ].map(([k, v]) => (
                                    <div key={k} style={{ background: '#f8fafc', borderRadius: 8, padding: '10px 14px' }}>
                                        <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, marginBottom: 3 }}>{k.toUpperCase()}</div>
                                        <div style={{ fontSize: 13, fontWeight: 600 }}>{v}</div>
                                    </div>
                                ))}
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
                                <div style={{ background: '#f0fdf4', borderRadius: 8, padding: '10px 14px', border: '1px solid #bbf7d0' }}>
                                    <div style={{ fontSize: 10, color: '#16a34a', fontWeight: 700, marginBottom: 3 }}>TỔNG TIỀN</div>
                                    <div style={{ fontSize: 16, fontWeight: 900, color: '#15803d' }}>{fmt(detailModal.tong_tien)} ₫</div>
                                </div>
                                <div style={{ background: '#fff7ed', borderRadius: 8, padding: '10px 14px', border: '1px solid #fed7aa' }}>
                                    <div style={{ fontSize: 10, color: '#c2410c', fontWeight: 700, marginBottom: 3 }}>TIỀN MẶT</div>
                                    <div style={{ fontSize: 16, fontWeight: 900, color: '#c2410c' }}>{fmt(detailModal.dat_coc)} ₫</div>
                                </div>
                                <div style={{ background: '#fef3c7', borderRadius: 8, padding: '10px 14px', border: '1px solid #fde68a' }}>
                                    <div style={{ fontSize: 10, color: '#92400e', fontWeight: 700, marginBottom: 3 }}>CHUYỂN KHOẢN</div>
                                    <div style={{ fontSize: 16, fontWeight: 900, color: '#92400e' }}>{fmt((detailModal.tong_tien || 0) - (detailModal.dat_coc || 0))} ₫</div>
                                </div>
                            </div>

                            {detailModal.ghi_chu && <div style={{ background: '#f8fafc', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#475569', marginBottom: 12, whiteSpace: 'pre-wrap' }}>💬 {detailModal.ghi_chu}</div>}

                            {/* Chứng từ */}
                            {detailModal.chung_tu && detailModal.chung_tu.length > 0 && (
                                <div>
                                    <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 8 }}>📄 CHỨNG TỪ</div>
                                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                        {detailModal.chung_tu.map((ct, idx) => (
                                            <img key={idx} src={ct.url} alt={ct.name}
                                                style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, border: '1.5px solid #e2e8f0', cursor: 'pointer' }}
                                                onClick={() => window.open(ct.url, '_blank')} />
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </Modal>

                {/* Confirm Delete All */}
                <Modal open={archiveModalOpen} onClose={() => setArchiveModalOpen(false)} title="🗃 Hộp Lưu Trữ Lâu Dài" maxWidth={760}>
                    <div style={{ fontSize: 12, color: '#64748b', marginBottom: 14 }}>
                        Đơn hàng trong hộp này sẽ không còn hiển thị ở danh sách chính và sẽ không được tính vào <b>/Thu Ngan</b>.
                    </div>
                    <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                            <thead>
                                <tr style={{ background: '#f8fafc' }}>
                                    {['Mã đơn', 'Loại', 'Khách hàng', 'Ngày đặt', 'Tổng tiền', ''].map(h => (
                                        <th key={h} style={{ padding: '11px 14px', textAlign: 'left', fontWeight: 700, fontSize: 11, color: '#64748b', borderBottom: '1.5px solid #e2e8f0', whiteSpace: 'nowrap' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {archivedOrders.length === 0 && (
                                    <tr><td colSpan={6} style={{ textAlign: 'center', padding: 34, color: '#94a3b8' }}>Chưa có đơn nào trong Hộp Lưu Trữ Lâu Dài</td></tr>
                                )}
                                {archivedOrders.map((d, i) => (
                                    <tr key={d.id} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? 'white' : '#fafafa' }}>
                                        <td style={{ padding: '10px 14px', fontWeight: 700, color: '#6366f1' }}>{d.ma_don}</td>
                                        <td style={{ padding: '10px 14px' }}><LoaiBadge l={d.loai_don || 'Mua'} /></td>
                                        <td style={{ padding: '10px 14px' }}>
                                            <div style={{ fontWeight: 600 }}>{d.khach_hang}</div>
                                            <div style={{ fontSize: 11, color: '#94a3b8' }}>{d.so_dien_thoai}{d.cccd && ` · CCCD: ${d.cccd}`}</div>
                                        </td>
                                        <td style={{ padding: '10px 14px', color: '#64748b' }}>
                                            <div>{splitOrderDateDisplay(d.ngay_dat).dateText}</div>
                                            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{splitOrderDateDisplay(d.ngay_dat).timeText}</div>
                                        </td>
                                        <td style={{ padding: '10px 14px', fontWeight: 700, color: '#16a34a' }}>{fmt(d.tong_tien)} ₫</td>
                                        <td style={{ padding: '10px 14px' }}>
                                            <button onClick={() => handleUnarchiveOrder(d)} style={{ ...btn('#ecfeff', '#0f766e'), padding: '5px 10px', fontSize: 11 }}>↩ Khôi phục</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Modal>

                {/* Confirm Delete All */}
                {confirmDelAll && (
                    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <div style={{ background: 'white', borderRadius: 14, padding: 28, maxWidth: 360, width: '90%', textAlign: 'center' }}>
                            <div style={{ fontSize: 32, marginBottom: 12 }}>🧨</div>
                            <div style={{ fontWeight: 700, marginBottom: 8 }}>Xóa {list.length} đơn hàng?</div>
                            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>Bạn có chắc muốn xóa <b>tất cả đơn hàng hiện có</b> không? Hành động này sẽ không thể hoàn tác.</div>
                            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                                <button onClick={() => setConfirmDelAll(false)} disabled={isDeletingAll} style={{ ...btn('#f1f5f9', '#475569') }}>Hủy</button>
                                <button onClick={delAll} disabled={isDeletingAll} style={{ ...btn('#dc2626') }}>{isDeletingAll ? 'Đang xóa...' : 'Xóa tất cả'}</button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Confirm Delete */}
                {confirmDel && (
                    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <div style={{ background: 'white', borderRadius: 14, padding: 28, maxWidth: 360, width: '90%', textAlign: 'center' }}>
                            <div style={{ fontSize: 32, marginBottom: 12 }}>🗑️</div>
                            <div style={{ fontWeight: 700, marginBottom: 8 }}>Xóa đơn hàng này?</div>
                            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>Hành động không thể hoàn tác.</div>
                            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                                <button onClick={() => setConfirmDel(null)} style={{ ...btn('#f1f5f9', '#475569') }}>Hủy</button>
                                <button onClick={del} style={{ ...btn('#dc2626') }}>Xóa</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
            {posOpen && <SalePosMobile onClose={() => { setPosOpen(false); load(); }} />}
        </>
    );
}
