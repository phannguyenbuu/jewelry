import React, { useState, useEffect, useCallback } from 'react';
import { API_BASE } from './lib/api';

const API = API_BASE;

const fmt = n => n ? Number(n).toLocaleString('vi-VN') : '0';
const inp = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box' };
const btn = (bg, c = 'white') => ({ padding: '8px 18px', borderRadius: 8, border: 'none', background: bg, color: c, fontWeight: 700, cursor: 'pointer', fontSize: 13 });

const STATUSES = { 'Đang làm': { bg: '#dcfce7', text: '#166534' }, 'Nghỉ phép': { bg: '#fef3c7', text: '#92400e' }, 'Đã nghỉ việc': { bg: '#fee2e2', text: '#991b1b' } };
const COLORS = ['#6366f1', '#ec4899', '#14b8a6', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#84cc16'];
const avatarColor = name => COLORS[(name?.charCodeAt(0) || 0) % COLORS.length];
const EMPTY = { ho_ten: '', chuc_vu: '', phong_ban: '', so_dien_thoai: '', email: '', dia_chi: '', ngay_vao: '', luong_co_ban: '', trang_thai: 'Đang làm', ghi_chu: '' };

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

export default function NhanSuPage() {
    const [list, setList] = useState([]);
    const [modal, setModal] = useState(null);
    const [form, setForm] = useState(EMPTY);
    const [search, setSearch] = useState('');
    const [filterStatus, setFilterStatus] = useState('');
    const [filterPhong, setFilterPhong] = useState('');
    const [confirmDel, setConfirmDel] = useState(null);

    const load = useCallback(async () => {
        const r = await fetch(`${API}/api/nhan_vien`); setList(await r.json());
    }, []);
    useEffect(() => { load(); }, [load]);

    const save = async e => {
        e.preventDefault();
        const isEdit = modal !== 'add';
        await fetch(isEdit ? `${API}/api/nhan_vien/${modal.id}` : `${API}/api/nhan_vien`, {
            method: isEdit ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...form, luong_co_ban: Number(form.luong_co_ban || 0) }),
        });
        setModal(null); load();
    };

    const del = async () => { await fetch(`${API}/api/nhan_vien/${confirmDel}`, { method: 'DELETE' }); setConfirmDel(null); load(); };

    const phongBans = [...new Set(list.map(n => n.phong_ban).filter(Boolean))];
    const filtered = list.filter(n => {
        const q = search.toLowerCase();
        return (!q || (n.ho_ten || '').toLowerCase().includes(q) || (n.chuc_vu || '').toLowerCase().includes(q))
            && (!filterStatus || n.trang_thai === filterStatus)
            && (!filterPhong || n.phong_ban === filterPhong);
    });

    const stats = { total: list.length, dangLam: list.filter(n => n.trang_thai === 'Đang làm').length, tongLuong: list.filter(n => n.trang_thai === 'Đang làm').reduce((s, n) => s + (n.luong_co_ban || 0), 0) };

    return (
        <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 12, marginBottom: 20 }}>
                {[{ icon: '👥', label: 'Tổng nhân sự', value: stats.total, color: '#6366f1' }, { icon: '✅', label: 'Đang làm', value: stats.dangLam, color: '#16a34a' }, { icon: '🏢', label: 'Phòng ban', value: phongBans.length, color: '#0ea5e9' }, { icon: '💸', label: 'Tổng lương', value: fmt(stats.tongLuong) + ' ₫', color: '#f59e0b' }].map(s => (
                    <div key={s.label} style={{ background: 'white', borderRadius: 12, padding: '14px 16px', border: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(0,0,0,.04)' }}>
                        <div style={{ fontSize: 22, marginBottom: 4 }}>{s.icon}</div>
                        <div style={{ fontSize: 20, fontWeight: 900, color: s.color }}>{s.value}</div>
                        <div style={{ fontSize: 11, color: '#94a3b8' }}>{s.label}</div>
                    </div>
                ))}
            </div>

            <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                <input placeholder="🔍 Họ tên, chức vụ..." value={search} onChange={e => setSearch(e.target.value)} style={{ ...inp, width: 230 }} />
                <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ ...inp, width: 155 }}>
                    <option value="">Tất cả trạng thái</option>
                    {Object.keys(STATUSES).map(s => <option key={s}>{s}</option>)}
                </select>
                <select value={filterPhong} onChange={e => setFilterPhong(e.target.value)} style={{ ...inp, width: 160 }}>
                    <option value="">Tất cả phòng ban</option>
                    {phongBans.map(p => <option key={p}>{p}</option>)}
                </select>
                <div style={{ flex: 1 }} />
                <button onClick={() => { setForm({ ...EMPTY }); setModal('add'); }} style={{ ...btn('#6366f1') }}>+ Thêm nhân viên</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(270px,1fr))', gap: 14 }}>
                {filtered.length === 0 && <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 60, color: '#94a3b8' }}>Chưa có nhân viên</div>}
                {filtered.map(n => {
                    const sc = STATUSES[n.trang_thai] || { bg: '#f1f5f9', text: '#64748b' };
                    return (
                        <div key={n.id} style={{ background: 'white', borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 6px rgba(0,0,0,.05)' }}>
                            <div style={{ height: 5, background: avatarColor(n.ho_ten) }} />
                            <div style={{ padding: '14px 16px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                                    <div style={{ width: 44, height: 44, borderRadius: '50%', background: avatarColor(n.ho_ten), display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 900, fontSize: 18, flexShrink: 0 }}>
                                        {(n.ho_ten || '?')[0].toUpperCase()}
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontWeight: 800, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.ho_ten}</div>
                                        <div style={{ fontSize: 12, color: '#64748b' }}>{n.chuc_vu || '—'}</div>
                                    </div>
                                    <span style={{ background: sc.bg, color: sc.text, borderRadius: 12, padding: '2px 8px', fontSize: 10, fontWeight: 700 }}>{n.trang_thai}</span>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 12, fontSize: 11, color: '#64748b' }}>
                                    <span>🏢 {n.phong_ban || '—'}</span>
                                    <span>📞 {n.so_dien_thoai || '—'}</span>
                                    <span>📅 {n.ngay_vao || '—'}</span>
                                    <span style={{ color: '#16a34a', fontWeight: 700 }}>💸 {fmt(n.luong_co_ban)} ₫</span>
                                </div>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <button onClick={() => { setForm({ ...n, luong_co_ban: n.luong_co_ban || '' }); setModal(n); }} style={{ flex: 1, ...btn('#f1f5f9', '#475569'), padding: '6px', fontSize: 11 }}>✏️ Sửa</button>
                                    <button onClick={() => setConfirmDel(n.id)} style={{ ...btn('#fee2e2', '#dc2626'), padding: '6px 10px', fontSize: 11 }}>🗑</button>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            <Modal open={!!modal} onClose={() => setModal(null)} title={modal === 'add' ? '+ Thêm nhân viên' : `✏️ Sửa — ${modal?.ho_ten}`} maxWidth={680}>
                <form onSubmit={save}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                        <Field label="Họ và tên *"><input required style={inp} value={form.ho_ten} onChange={e => setForm({ ...form, ho_ten: e.target.value })} /></Field>
                        <Field label="Chức vụ"><input style={inp} value={form.chuc_vu} onChange={e => setForm({ ...form, chuc_vu: e.target.value })} /></Field>
                        <Field label="Phòng ban"><input style={inp} value={form.phong_ban} onChange={e => setForm({ ...form, phong_ban: e.target.value })} /></Field>
                        <Field label="Số điện thoại"><input style={inp} value={form.so_dien_thoai} onChange={e => setForm({ ...form, so_dien_thoai: e.target.value })} /></Field>
                        <Field label="Email"><input type="email" style={inp} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></Field>
                        <Field label="Ngày vào làm"><input type="date" style={inp} value={form.ngay_vao} onChange={e => setForm({ ...form, ngay_vao: e.target.value })} /></Field>
                        <Field label="Lương cơ bản (₫/tháng)"><input type="number" style={inp} value={form.luong_co_ban} onChange={e => setForm({ ...form, luong_co_ban: e.target.value })} /></Field>
                        <Field label="Trạng thái">
                            <select style={inp} value={form.trang_thai} onChange={e => setForm({ ...form, trang_thai: e.target.value })}>
                                {Object.keys(STATUSES).map(s => <option key={s}>{s}</option>)}
                            </select>
                        </Field>
                    </div>
                    <Field label="Địa chỉ"><input style={inp} value={form.dia_chi} onChange={e => setForm({ ...form, dia_chi: e.target.value })} /></Field>
                    <Field label="Ghi chú"><textarea style={{ ...inp, height: 70, resize: 'vertical' }} value={form.ghi_chu} onChange={e => setForm({ ...form, ghi_chu: e.target.value })} /></Field>
                    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
                        <button type="button" onClick={() => setModal(null)} style={{ ...btn('#f1f5f9', '#475569') }}>Hủy</button>
                        <button type="submit" style={{ ...btn('#6366f1') }}>{modal === 'add' ? 'Thêm mới' : 'Lưu thay đổi'}</button>
                    </div>
                </form>
            </Modal>

            {confirmDel && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ background: 'white', borderRadius: 14, padding: 28, maxWidth: 340, textAlign: 'center' }}>
                        <div style={{ fontSize: 32, marginBottom: 12 }}>🗑️</div>
                        <div style={{ fontWeight: 700, marginBottom: 16 }}>Xóa nhân viên này?</div>
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
