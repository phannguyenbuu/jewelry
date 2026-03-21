import React, { useState, useEffect, useCallback } from 'react';
import SalePosMobile from './SalePosMobile';

const API = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'https://jewelry.n-lux.com' : '';

const fmt = n => n ? Number(n).toLocaleString('vi-VN') : '0';
const today = () => new Date().toISOString().slice(0, 10);

const STATUS_CFG = {
    'Mới': { bg: '#dbeafe', text: '#1d4ed8', dot: '#3b82f6' },
    'Xử lý': { bg: '#fef3c7', text: '#92400e', dot: '#f59e0b' },
    'Hoàn thành': { bg: '#dcfce7', text: '#166534', dot: '#16a34a' },
    'Hủy': { bg: '#fee2e2', text: '#991b1b', dot: '#dc2626' },
};

const inp = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box', outline: 'none' };
const btn = (bg, c = 'white') => ({ padding: '8px 18px', borderRadius: 8, border: 'none', background: bg, color: c, fontWeight: 700, cursor: 'pointer', fontSize: 13 });

const EMPTY_FORM = { khach_hang: '', so_dien_thoai: '', dia_chi: '', ngay_dat: today(), ngay_giao: '', items: [], tong_tien: '', dat_coc: '', trang_thai: 'Mới', ghi_chu: '', nguoi_tao: '' };

function Modal({ open, onClose, title, children, maxWidth = 600 }) {
    if (!open) return null;
    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
            onClick={e => e.target === e.currentTarget && onClose()}>
            <div style={{ background: 'white', borderRadius: 16, width: '100%', maxWidth, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,.3)' }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: 'white', zIndex: 1 }}>
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

export default function DonHangPage() {
    const [list, setList] = useState([]);
    const [modal, setModal] = useState(null); // null | 'add' | obj
    const [form, setForm] = useState(EMPTY_FORM);
    const [search, setSearch] = useState('');
    const [filterStatus, setFilterStatus] = useState('');
    const [detailModal, setDetailModal] = useState(null);
    const [confirmDel, setConfirmDel] = useState(null);
    const [posOpen, setPosOpen] = useState(false);

    const load = useCallback(async () => {
        const r = await fetch(`${API}/api/don_hang`);
        setList(await r.json());
    }, []);

    useEffect(() => { load(); }, [load]);

    const openAdd = () => { setForm({ ...EMPTY_FORM }); setModal('add'); };
    const openEdit = d => { setForm({ ...d }); setModal(d); };

    const save = async e => {
        e.preventDefault();
        const isEdit = modal !== 'add';
        await fetch(isEdit ? `${API}/api/don_hang/${modal.id}` : `${API}/api/don_hang`, {
            method: isEdit ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...form, tong_tien: Number(form.tong_tien || 0), dat_coc: Number(form.dat_coc || 0) }),
        });
        setModal(null); load();
    };

    const del = async () => {
        await fetch(`${API}/api/don_hang/${confirmDel}`, { method: 'DELETE' });
        setConfirmDel(null); load();
    };

    const filtered = list.filter(d => {
        const q = search.toLowerCase();
        const matchSearch = !q || (d.ma_don || '').toLowerCase().includes(q) || (d.khach_hang || '').toLowerCase().includes(q) || (d.so_dien_thoai || '').includes(q);
        const matchStatus = !filterStatus || d.trang_thai === filterStatus;
        return matchSearch && matchStatus;
    });

    // Stats
    const stats = {
        total: list.length,
        moi: list.filter(d => d.trang_thai === 'Mới').length,
        xuLy: list.filter(d => d.trang_thai === 'Xử lý').length,
        hoanThanh: list.filter(d => d.trang_thai === 'Hoàn thành').length,
        tongTien: list.filter(d => d.trang_thai !== 'Hủy').reduce((s, d) => s + (d.tong_tien || 0), 0),
    };

    const StatusBadge = ({ s }) => {
        const cfg = STATUS_CFG[s] || { bg: '#f1f5f9', text: '#64748b', dot: '#94a3b8' };
        return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: cfg.bg, color: cfg.text, borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 700 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.dot, display: 'inline-block' }} />{s}
        </span>;
    };

    return (
        <React.Fragment>
            <div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 12, marginBottom: 20 }}>
                    {[
                        { label: 'Tổng đơn', value: stats.total, color: '#6366f1', icon: '📦' },
                        { label: 'Đơn mới', value: stats.moi, color: '#3b82f6', icon: '🆕' },
                        { label: 'Đang xử lý', value: stats.xuLy, color: '#f59e0b', icon: '⚙️' },
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
                    <input placeholder="🔍 Tìm đơn hàng, khách hàng..." value={search} onChange={e => setSearch(e.target.value)}
                        style={{ ...inp, width: 260 }} />
                    <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                        style={{ ...inp, width: 160 }}>
                        <option value="">Tất cả trạng thái</option>
                        {Object.keys(STATUS_CFG).map(s => <option key={s}>{s}</option>)}
                    </select>
                    <div style={{ flex: 1 }} />
                    <button onClick={() => setPosOpen(true)} style={{ ...btn('#1e293b'), display: 'flex', alignItems: 'center', gap: 6 }}>📱 POS Mobile</button>
                    <button onClick={openAdd} style={{ ...btn('#6366f1'), display: 'flex', alignItems: 'center', gap: 6 }}>+ Tạo đơn hàng</button>
                </div>

                {/* Table */}
                <div style={{ background: 'white', borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                            <tr style={{ background: '#f8fafc' }}>
                                {['Mã đơn', 'Khách hàng', 'Ngày đặt', 'Ngày giao', 'Tổng tiền', 'Đặt cọc', 'Trạng thái', ''].map(h => (
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
                                    <td style={{ padding: '10px 14px' }}>
                                        <div style={{ fontWeight: 600 }}>{d.khach_hang}</div>
                                        <div style={{ fontSize: 11, color: '#94a3b8' }}>{d.so_dien_thoai}</div>
                                    </td>
                                    <td style={{ padding: '10px 14px', color: '#64748b' }}>{d.ngay_dat}</td>
                                    <td style={{ padding: '10px 14px', color: '#64748b' }}>{d.ngay_giao || '—'}</td>
                                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#16a34a' }}>{fmt(d.tong_tien)} ₫</td>
                                    <td style={{ padding: '10px 14px', color: '#c2410c' }}>{fmt(d.dat_coc)} ₫</td>
                                    <td style={{ padding: '10px 14px' }}><StatusBadge s={d.trang_thai} /></td>
                                    <td style={{ padding: '10px 14px' }}>
                                        <div style={{ display: 'flex', gap: 6 }}>
                                            <button onClick={() => openEdit(d)} style={{ ...btn('#f1f5f9', '#475569'), padding: '5px 10px', fontSize: 11 }}>✏️</button>
                                            <button onClick={() => setConfirmDel(d.id)} style={{ ...btn('#fee2e2', '#dc2626'), padding: '5px 10px', fontSize: 11 }}>🗑</button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Form Modal */}
                <Modal open={!!modal} onClose={() => setModal(null)} title={modal === 'add' ? '+ Tạo đơn hàng mới' : `✏️ Sửa đơn — ${modal?.ma_don}`} maxWidth={700}>
                    <form onSubmit={save}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                            <Field label="Khách hàng *"><input required style={inp} value={form.khach_hang} onChange={e => setForm({ ...form, khach_hang: e.target.value })} /></Field>
                            <Field label="Số điện thoại"><input style={inp} value={form.so_dien_thoai} onChange={e => setForm({ ...form, so_dien_thoai: e.target.value })} /></Field>
                            <Field label="Ngày đặt"><input type="date" style={inp} value={form.ngay_dat} onChange={e => setForm({ ...form, ngay_dat: e.target.value })} /></Field>
                            <Field label="Ngày giao"><input type="date" style={inp} value={form.ngay_giao} onChange={e => setForm({ ...form, ngay_giao: e.target.value })} /></Field>
                            <Field label="Tổng tiền (₫)"><input type="number" style={inp} value={form.tong_tien} onChange={e => setForm({ ...form, tong_tien: e.target.value })} /></Field>
                            <Field label="Đặt cọc (₫)"><input type="number" style={inp} value={form.dat_coc} onChange={e => setForm({ ...form, dat_coc: e.target.value })} /></Field>
                            <Field label="Trạng thái">
                                <div style={{ display: 'flex', gap: 8, flexWrap: 'nowrap' }}>
                                    {Object.entries(STATUS_CFG).map(([s, cfg]) => {
                                        const active = form.trang_thai === s;
                                        return (
                                            <button key={s} type="button"
                                                onClick={() => setForm({ ...form, trang_thai: s })}
                                                style={{
                                                    display: 'inline-flex', alignItems: 'center', gap: 6,
                                                    padding: '6px 14px', borderRadius: 999,
                                                    border: `2px solid ${active ? cfg.dot : 'transparent'}`,
                                                    background: active ? cfg.bg : '#f1f5f9',
                                                    color: active ? cfg.text : '#94a3b8',
                                                    fontWeight: 700, fontSize: 12, cursor: 'pointer',
                                                    transition: 'all .15s',
                                                    boxShadow: active ? `0 0 0 3px ${cfg.dot}22` : 'none',
                                                }}>
                                                <span style={{ width: 7, height: 7, borderRadius: '50%', background: active ? cfg.dot : '#cbd5e1', flexShrink: 0 }} />
                                                {s}
                                            </button>
                                        );
                                    })}
                                </div>
                            </Field>
                            <Field label="Người tạo"><input style={inp} value={form.nguoi_tao} onChange={e => setForm({ ...form, nguoi_tao: e.target.value })} /></Field>
                        </div>
                        <Field label="Địa chỉ giao hàng"><input style={inp} value={form.dia_chi} onChange={e => setForm({ ...form, dia_chi: e.target.value })} /></Field>
                        <Field label="Ghi chú"><textarea style={{ ...inp, height: 70, resize: 'vertical' }} value={form.ghi_chu} onChange={e => setForm({ ...form, ghi_chu: e.target.value })} /></Field>
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
                            <button type="button" onClick={() => setModal(null)} style={{ ...btn('#f1f5f9', '#475569') }}>Hủy</button>
                            <button type="submit" style={{ ...btn('#6366f1') }}>{modal === 'add' ? 'Tạo đơn' : 'Lưu thay đổi'}</button>
                        </div>
                    </form>
                </Modal>

                {/* Detail Modal */}
                <Modal open={!!detailModal} onClose={() => setDetailModal(null)} title={`📦 Chi tiết đơn — ${detailModal?.ma_don}`} maxWidth={660}>
                    {detailModal && (
                        <div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                                {[
                                    ['Khách hàng', detailModal.khach_hang],
                                    ['SĐT', detailModal.so_dien_thoai],
                                    ['Ngày đặt', detailModal.ngay_dat],
                                    ['Ngày giao', detailModal.ngay_giao || '—'],
                                    ['Địa chỉ', detailModal.dia_chi || '—'],
                                    ['Người tạo', detailModal.nguoi_tao || '—'],
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
                                    <div style={{ fontSize: 10, color: '#c2410c', fontWeight: 700, marginBottom: 3 }}>ĐẶT CỌC</div>
                                    <div style={{ fontSize: 16, fontWeight: 900, color: '#c2410c' }}>{fmt(detailModal.dat_coc)} ₫</div>
                                </div>
                                <div style={{ background: '#fef3c7', borderRadius: 8, padding: '10px 14px', border: '1px solid #fde68a' }}>
                                    <div style={{ fontSize: 10, color: '#92400e', fontWeight: 700, marginBottom: 3 }}>CÒN LẠI</div>
                                    <div style={{ fontSize: 16, fontWeight: 900, color: '#92400e' }}>{fmt((detailModal.tong_tien || 0) - (detailModal.dat_coc || 0))} ₫</div>
                                </div>
                            </div>
                            {detailModal.ghi_chu && <div style={{ background: '#f8fafc', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#475569' }}>💬 {detailModal.ghi_chu}</div>}
                        </div>
                    )}
                </Modal>

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
        </React.Fragment>
    );
}
