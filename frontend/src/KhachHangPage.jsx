import React, { useEffect, useMemo, useState } from 'react';
import { API_BASE } from './lib/api';

const API = API_BASE;

const KH_KEY = 'jewelry_khachhang';
const inp = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box', outline: 'none' };
const btn = (bg, c = 'white') => ({ padding: '8px 18px', borderRadius: 8, border: 'none', background: bg, color: c, fontWeight: 700, cursor: 'pointer', fontSize: 13 });
const today = () => new Date().toISOString().slice(0, 10);

function loadKH() {
    try {
        return JSON.parse(localStorage.getItem(KH_KEY)) || [];
    } catch {
        return [];
    }
}

function saveKH(list) {
    localStorage.setItem(KH_KEY, JSON.stringify(list));
}

const EMPTY_FORM = {
    id: null,
    ten: '',
    cccd: '',
    so_dien_thoai: '',
    email: '',
    dia_chi: '',
    noi_thuong_tru: '',
    que_quan: '',
    ngay_sinh: '',
    loai_khach: 'Cá nhân',
    nguon: '',
    sao: 0,
    ghi_chu: '',
    ngay_them: today(),
    nguoi_tao: '',
    backendSynced: false,
};

const trimText = (value) => String(value || '').trim();
const normalizeSearchText = (value) => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
const normalizedMatchValue = (value) => trimText(value).toLowerCase();

function normalizeCustomerRecord(raw = {}) {
    return {
        id: raw.id ?? null,
        ten: trimText(raw.ten),
        cccd: trimText(raw.cccd),
        cmnd_cu: trimText(raw.cmnd_cu),
        ngay_sinh: trimText(raw.ngay_sinh),
        gioi_tinh: trimText(raw.gioi_tinh),
        quoc_tich: trimText(raw.quoc_tich),
        que_quan: trimText(raw.que_quan),
        noi_thuong_tru: trimText(raw.noi_thuong_tru),
        dia_chi: trimText(raw.dia_chi),
        so_dien_thoai: trimText(raw.so_dien_thoai),
        ngay_cap_cccd: trimText(raw.ngay_cap_cccd),
        han_the: trimText(raw.han_the),
        ocr_mat_sau: trimText(raw.ocr_mat_sau),
        nguoi_tao: trimText(raw.nguoi_tao),
        ngay_them: trimText(raw.ngay_tao),
        cap_nhat_luc: trimText(raw.cap_nhat_luc),
        email: trimText(raw.email),
        loai_khach: trimText(raw.loai_khach) || 'Cá nhân',
        nguon: trimText(raw.nguon) || trimText(raw.nguoi_tao),
        sao: Number(raw.sao || 0),
        ghi_chu: trimText(raw.ghi_chu) || trimText(raw.ocr_mat_sau),
        backendSynced: raw.backendSynced !== false,
    };
}

function sameIdentity(a, b) {
    if (!a || !b) return false;
    if (a.id != null && b.id != null && String(a.id) === String(b.id)) return true;
    const aCccd = normalizedMatchValue(a.cccd);
    const bCccd = normalizedMatchValue(b.cccd);
    if (aCccd && bCccd && aCccd === bCccd) return true;
    const aPhone = normalizedMatchValue(a.so_dien_thoai);
    const bPhone = normalizedMatchValue(b.so_dien_thoai);
    if (aPhone && bPhone && aPhone === bPhone) return true;
    return false;
}

function mergeCustomers(backendRows, localRows) {
    const normalizedLocal = (Array.isArray(localRows) ? localRows : []).map((row) => normalizeCustomerRecord({ ...row, backendSynced: !!row.backendSynced }));
    const consumedLocal = new Set();
    const mergedBackend = (Array.isArray(backendRows) ? backendRows : []).map((row) => {
        const normalizedBackend = normalizeCustomerRecord({ ...row, backendSynced: true });
        const localIndex = normalizedLocal.findIndex((item, index) => !consumedLocal.has(index) && sameIdentity(item, normalizedBackend));
        if (localIndex === -1) return normalizedBackend;
        consumedLocal.add(localIndex);
        const localMatch = normalizedLocal[localIndex];
        return {
            ...localMatch,
            ...normalizedBackend,
            email: localMatch.email || normalizedBackend.email,
            loai_khach: localMatch.loai_khach || normalizedBackend.loai_khach || 'Cá nhân',
            nguon: localMatch.nguon || normalizedBackend.nguon || normalizedBackend.nguoi_tao,
            sao: Number(localMatch.sao || normalizedBackend.sao || 0),
            ghi_chu: localMatch.ghi_chu || normalizedBackend.ghi_chu || normalizedBackend.ocr_mat_sau,
            backendSynced: true,
        };
    });
    const localOnly = normalizedLocal.filter((_, index) => !consumedLocal.has(index));
    return [...mergedBackend, ...localOnly];
}

function buildCustomerPayload(form) {
    return {
        id: form.id,
        ten: trimText(form.ten),
        cccd: trimText(form.cccd),
        ngay_sinh: trimText(form.ngay_sinh),
        que_quan: trimText(form.que_quan),
        noi_thuong_tru: trimText(form.noi_thuong_tru),
        dia_chi: trimText(form.dia_chi),
        so_dien_thoai: trimText(form.so_dien_thoai),
        sao: Number(form.sao || 0),
        ocr_mat_sau: trimText(form.ghi_chu),
        nguoi_tao: trimText(form.nguon) || 'Admin',
    };
}

function StarRating({ value, onChange, size = 20, readOnly = false }) {
    const [hover, setHover] = useState(0);
    return (
        <span style={{ display: 'inline-flex', gap: 2, cursor: readOnly ? 'default' : 'pointer' }}>
            {[1, 2, 3, 4, 5].map((i) => (
                <span
                    key={i}
                    onMouseEnter={() => !readOnly && setHover(i)}
                    onMouseLeave={() => !readOnly && setHover(0)}
                    onClick={() => !readOnly && onChange && onChange(i)}
                    style={{ fontSize: size, color: i <= (hover || value) ? '#f59e0b' : '#e2e8f0', transition: 'color .1s', lineHeight: 1 }}
                >
                    ★
                </span>
            ))}
        </span>
    );
}

function Modal({ open, onClose, title, children, maxWidth = 620 }) {
    if (!open) return null;
    return (
        <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
            onClick={(e) => e.target === e.currentTarget && onClose()}
        >
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

function Field({ label, required, children }) {
    return (
        <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {label}
                {required && <span style={{ color: '#dc2626', marginLeft: 2 }}>*</span>}
            </label>
            {children}
        </div>
    );
}

function Avatar({ name, size = 40 }) {
    const safeName = trimText(name) || '?';
    const colors = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
    const color = colors[safeName.charCodeAt(0) % colors.length];
    const initials = safeName.split(' ').slice(-2).map((w) => w[0]).join('').toUpperCase().slice(0, 2);
    return (
        <div style={{ width: size, height: size, borderRadius: '50%', background: color, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: size * 0.38, flexShrink: 0, letterSpacing: 0.5 }}>
            {initials}
        </div>
    );
}

export default function KhachHangPage() {
    const [list, setList] = useState(loadKH);
    const [modal, setModal] = useState(null);
    const [detailModal, setDetailModal] = useState(null);
    const [form, setForm] = useState(EMPTY_FORM);
    const [search, setSearch] = useState('');
    const [filterSao, setFilterSao] = useState('');
    const [confirmDel, setConfirmDel] = useState(null);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [deleteLoading, setDeleteLoading] = useState(false);
    const [error, setError] = useState('');

    const refreshCustomers = async () => {
        setLoading(true);
        setError('');
        try {
            const response = await fetch(`${API}/api/khach_hang`);
            const payload = await response.json().catch(() => []);
            if (!response.ok) {
                throw new Error(Array.isArray(payload) ? `HTTP ${response.status}` : (payload.error || payload.msg || `HTTP ${response.status}`));
            }
            const merged = mergeCustomers(payload, loadKH());
            setList(merged);
            saveKH(merged);
        } catch (err) {
            setError(err.message || 'Không tải được khách hàng từ backend.');
            setList(loadKH());
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        refreshCustomers();
    }, []);

    const persistList = (nextList) => {
        setList(nextList);
        saveKH(nextList);
    };

    const save = async (e) => {
        e.preventDefault();
        setSaving(true);
        setError('');
        try {
            const response = await fetch(`${API}/api/khach_hang`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(buildCustomerPayload(form)),
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(payload.error || payload.msg || `HTTP ${response.status}`);
            }
            const normalizedSaved = normalizeCustomerRecord({ ...(payload.record || {}), email: form.email, loai_khach: form.loai_khach, nguon: form.nguon, sao: form.sao, ghi_chu: form.ghi_chu, backendSynced: true });
            const baseList = list.filter((item) => !sameIdentity(item, normalizedSaved) && !(form.id != null && String(item.id) === String(form.id)));
            const nextList = [normalizedSaved, ...baseList];
            persistList(nextList);
            setModal(null);
            setDetailModal(normalizedSaved);
        } catch (err) {
            window.alert(err.message || 'Không lưu được khách hàng.');
        } finally {
            setSaving(false);
        }
    };

    const del = async () => {
        if (!confirmDel) return;
        setDeleteLoading(true);
        try {
            if (confirmDel.backendSynced && confirmDel.id != null) {
                const response = await fetch(`${API}/api/khach_hang/${confirmDel.id}`, { method: 'DELETE' });
                const payload = await response.json().catch(() => ({}));
                if (!response.ok) {
                    throw new Error(payload.error || payload.msg || `HTTP ${response.status}`);
                }
            }
            const nextList = list.filter((item) => !sameIdentity(item, confirmDel) && String(item.id) !== String(confirmDel.id));
            persistList(nextList);
            setConfirmDel(null);
            setDetailModal(null);
        } catch (err) {
            window.alert(err.message || 'Không xóa được khách hàng.');
        } finally {
            setDeleteLoading(false);
        }
    };

    const openAdd = () => {
        setForm({ ...EMPTY_FORM, ngay_them: today() });
        setModal('add');
    };

    const openEdit = (kh) => {
        setForm({ ...EMPTY_FORM, ...kh });
        setModal(kh);
    };

    const filtered = useMemo(() => list.filter((k) => {
        const q = normalizeSearchText(search);
        const match = !q
            || normalizeSearchText(k.ten).includes(q)
            || normalizeSearchText(k.so_dien_thoai).includes(q)
            || normalizeSearchText(k.email).includes(q)
            || normalizeSearchText(k.cccd).includes(q);
        const starMatch = !filterSao || String(k.sao) === filterSao;
        return match && starMatch;
    }), [filterSao, list, search]);

    const stats = useMemo(() => ({
        total: list.length,
        avg_sao: list.length ? (list.reduce((sum, k) => sum + (k.sao || 0), 0) / list.length).toFixed(1) : 0,
        c5: list.filter((k) => k.sao === 5).length,
        c4: list.filter((k) => k.sao >= 4).length,
    }), [list]);

    return (
        <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
                {[
                    { label: 'Tổng khách hàng', value: stats.total, icon: '👥', color: '#6366f1', bg: '#f5f3ff', border: '#ddd6fe' },
                    { label: 'Đánh giá TB', value: `${stats.avg_sao} ★`, icon: '⭐', color: '#f59e0b', bg: '#fffbeb', border: '#fde68a' },
                    { label: 'Khách 5 sao', value: stats.c5, icon: '🌟', color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
                    { label: 'Khách ≥ 4 sao', value: stats.c4, icon: '💎', color: '#0ea5e9', bg: '#f0f9ff', border: '#bae6fd' },
                ].map((s) => (
                    <div key={s.label} style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: 12, padding: '14px 16px' }}>
                        <div style={{ fontSize: 11, color: s.color, fontWeight: 700, marginBottom: 4 }}>{s.icon} {s.label.toUpperCase()}</div>
                        <div style={{ fontSize: 22, fontWeight: 900, color: s.color }}>{s.value}</div>
                    </div>
                ))}
            </div>

            <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                <input placeholder="🔍  Tìm tên, SĐT, email..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ ...inp, width: 260, flex: 'none' }} />
                <select value={filterSao} onChange={(e) => setFilterSao(e.target.value)} style={{ ...inp, width: 150 }}>
                    <option value="">Tất cả đánh giá</option>
                    {[5, 4, 3, 2, 1].map((s) => <option key={s} value={s}>{s} sao</option>)}
                </select>
                {(search || filterSao) && <button onClick={() => { setSearch(''); setFilterSao(''); }} style={{ ...btn('#f1f5f9', '#475569'), padding: '8px 12px' }}>✕ Reset</button>}
                <button onClick={refreshCustomers} disabled={loading} style={{ ...btn('#e2e8f0', '#334155'), padding: '8px 12px' }}>{loading ? 'Đang tải...' : 'Làm mới'}</button>
                <div style={{ flex: 1 }} />
                <button onClick={openAdd} style={{ ...btn('#6366f1') }}>+ Thêm khách hàng</button>
            </div>

            {error && (
                <div style={{ marginBottom: 14, background: '#fff7ed', border: '1px solid #fdba74', color: '#9a3412', borderRadius: 10, padding: '10px 12px', fontSize: 13 }}>
                    Không đồng bộ được backend: {error}
                </div>
            )}

            {filtered.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 0', color: '#94a3b8', background: 'white', borderRadius: 14, border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: 40, marginBottom: 12 }}>👥</div>
                    <div style={{ fontWeight: 700, marginBottom: 6 }}>{search || filterSao ? 'Không tìm thấy khách hàng' : 'Chưa có khách hàng'}</div>
                    <div style={{ fontSize: 13 }}>Nhấn "+ Thêm khách hàng" để bắt đầu</div>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 14 }}>
                    {filtered.map((kh) => (
                        <div
                            key={`${kh.id || 'local'}-${kh.cccd || kh.so_dien_thoai || kh.ten}`}
                            onClick={() => setDetailModal(kh)}
                            style={{ background: 'white', borderRadius: 14, border: '1px solid #e2e8f0', padding: 16, cursor: 'pointer', transition: 'all .15s', boxShadow: '0 1px 3px rgba(0,0,0,.05)' }}
                            onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 8px 24px rgba(99,102,241,.12)'; e.currentTarget.style.borderColor = '#a5b4fc'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,.05)'; e.currentTarget.style.borderColor = '#e2e8f0'; }}
                        >
                            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 10 }}>
                                <Avatar name={kh.ten || '?'} size={44} />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontWeight: 800, fontSize: 14, color: '#1e293b', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{kh.ten || 'Khách chưa đặt tên'}</div>
                                    <div style={{ fontSize: 12, color: '#64748b' }}>{kh.so_dien_thoai || kh.cccd || kh.email || '—'}</div>
                                    <div style={{ marginTop: 4 }}>
                                        <StarRating value={kh.sao || 0} readOnly size={16} />
                                    </div>
                                </div>
                                <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 20, background: kh.loai_khach === 'VIP' ? '#fef3c7' : '#f1f5f9', color: kh.loai_khach === 'VIP' ? '#92400e' : '#64748b', whiteSpace: 'nowrap', flexShrink: 0 }}>
                                    {kh.loai_khach || 'Cá nhân'}
                                </span>
                            </div>
                            {kh.ghi_chu && (
                                <div style={{ fontSize: 12, color: '#475569', background: '#f8fafc', borderRadius: 8, padding: '8px 10px', borderLeft: '3px solid #6366f1', lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                                    📝 {kh.ghi_chu}
                                </div>
                            )}
                            {kh.dia_chi && (
                                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8 }}>📍 {kh.dia_chi}</div>
                            )}
                            <div style={{ display: 'flex', gap: 6, marginTop: 12 }} onClick={(e) => e.stopPropagation()}>
                                <button onClick={() => openEdit(kh)} style={{ ...btn('#f1f5f9', '#475569'), padding: '5px 12px', fontSize: 12, flex: 1 }}>✏️ Sửa</button>
                                <button onClick={() => setConfirmDel(kh)} style={{ ...btn('#fee2e2', '#dc2626'), padding: '5px 10px', fontSize: 12 }}>🗑</button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <Modal open={!!modal} onClose={() => setModal(null)} title={modal === 'add' ? '👤 Thêm khách hàng mới' : `✏️ Sửa — ${modal?.ten}`} maxWidth={640}>
                <form onSubmit={save}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                        <Field label="Họ và tên" required>
                            <input required style={inp} value={form.ten} onChange={(e) => setForm({ ...form, ten: e.target.value })} placeholder="Nguyễn Văn A" />
                        </Field>
                        <Field label="Số điện thoại">
                            <input style={inp} value={form.so_dien_thoai} onChange={(e) => setForm({ ...form, so_dien_thoai: e.target.value })} placeholder="0901 234 567" />
                        </Field>
                        <Field label="CCCD">
                            <input style={inp} value={form.cccd || ''} onChange={(e) => setForm({ ...form, cccd: e.target.value })} placeholder="012345678901" />
                        </Field>
                        <Field label="Ngày sinh">
                            <input type="date" style={inp} value={form.ngay_sinh || ''} onChange={(e) => setForm({ ...form, ngay_sinh: e.target.value })} />
                        </Field>
                        <Field label="Loại khách">
                            <select style={inp} value={form.loai_khach} onChange={(e) => setForm({ ...form, loai_khach: e.target.value })}>
                                {['Cá nhân', 'Doanh nghiệp', 'VIP', 'Sỉ', 'Khác'].map((l) => <option key={l}>{l}</option>)}
                            </select>
                        </Field>
                        <Field label="Nguồn khách">
                            <input style={inp} value={form.nguon} onChange={(e) => setForm({ ...form, nguon: e.target.value })} placeholder="Facebook, giới thiệu..." />
                        </Field>
                        <Field label="Quê quán">
                            <input style={inp} value={form.que_quan || ''} onChange={(e) => setForm({ ...form, que_quan: e.target.value })} placeholder="Khánh Hòa" />
                        </Field>
                        <Field label="Nơi thường trú">
                            <input style={inp} value={form.noi_thuong_tru || ''} onChange={(e) => setForm({ ...form, noi_thuong_tru: e.target.value })} placeholder="Địa chỉ trên CCCD" />
                        </Field>
                        <Field label="Email">
                            <input type="email" style={inp} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="email@example.com" />
                        </Field>
                    </div>

                    <Field label="Địa chỉ">
                        <input style={inp} value={form.dia_chi} onChange={(e) => setForm({ ...form, dia_chi: e.target.value })} placeholder="Số nhà, đường, quận, thành phố..." />
                    </Field>

                    <Field label="Đánh giá">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0' }}>
                            <StarRating value={form.sao} onChange={(v) => setForm({ ...form, sao: v })} size={28} />
                            <span style={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}>
                                {form.sao === 0 ? 'Chưa đánh giá' : ['', 'Rất tệ', 'Tệ', 'Bình thường', 'Tốt', 'Xuất sắc'][form.sao]}
                            </span>
                            {form.sao > 0 && <button type="button" onClick={() => setForm({ ...form, sao: 0 })} style={{ fontSize: 11, color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer' }}>Xóa</button>}
                        </div>
                    </Field>

                    <Field label="📝 Ghi chú">
                        <textarea
                            style={{ ...inp, height: 120, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6, borderColor: '#a5b4fc', borderWidth: 2 }}
                            value={form.ghi_chu}
                            onChange={(e) => setForm({ ...form, ghi_chu: e.target.value })}
                            placeholder="Ghi chú CRM nội bộ hoặc OCR mặt sau..."
                        />
                    </Field>

                    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
                        <button type="button" onClick={() => setModal(null)} style={{ ...btn('#f1f5f9', '#475569') }}>Hủy</button>
                        <button type="submit" disabled={saving} style={{ ...btn('#6366f1'), opacity: saving ? 0.7 : 1 }}>
                            {saving ? 'Đang lưu...' : (modal === 'add' ? '+ Thêm khách hàng' : 'Lưu thay đổi')}
                        </button>
                    </div>
                </form>
            </Modal>

            {detailModal && (
                <Modal open onClose={() => setDetailModal(null)} title="👤 Chi tiết khách hàng" maxWidth={560}>
                    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', marginBottom: 20 }}>
                        <Avatar name={detailModal.ten || '?'} size={60} />
                        <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 900, fontSize: 20, color: '#1e293b', marginBottom: 4 }}>{detailModal.ten}</div>
                            <StarRating value={detailModal.sao || 0} readOnly size={20} />
                            <span style={{ marginLeft: 8, fontSize: 12, color: '#94a3b8' }}>{['', 'Rất tệ', 'Tệ', 'Bình thường', 'Tốt', 'Xuất sắc'][detailModal.sao || 0] || 'Chưa đánh giá'}</span>
                            <div style={{ marginTop: 6 }}>
                                <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: detailModal.loai_khach === 'VIP' ? '#fef3c7' : '#f1f5f9', color: detailModal.loai_khach === 'VIP' ? '#92400e' : '#64748b' }}>
                                    {detailModal.loai_khach || 'Cá nhân'}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                        {[
                            { label: '📞 Điện thoại', val: detailModal.so_dien_thoai },
                            { label: '🪪 CCCD', val: detailModal.cccd },
                            { label: '📧 Email', val: detailModal.email },
                            { label: '🎂 Ngày sinh', val: detailModal.ngay_sinh },
                            { label: '🌐 Nguồn', val: detailModal.nguon || detailModal.nguoi_tao },
                            { label: '🏠 Quê quán', val: detailModal.que_quan },
                            { label: '📅 Ngày thêm', val: detailModal.ngay_them },
                            { label: '🕒 Cập nhật', val: detailModal.cap_nhat_luc },
                        ].filter((f) => f.val).map((f) => (
                            <div key={f.label} style={{ background: '#f8fafc', borderRadius: 8, padding: '10px 12px' }}>
                                <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', marginBottom: 3 }}>{f.label}</div>
                                <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{f.val}</div>
                            </div>
                        ))}
                        {detailModal.dia_chi && (
                            <div style={{ gridColumn: '1/-1', background: '#f8fafc', borderRadius: 8, padding: '10px 12px' }}>
                                <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', marginBottom: 3 }}>📍 Địa chỉ</div>
                                <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{detailModal.dia_chi}</div>
                            </div>
                        )}
                    </div>

                    {detailModal.ghi_chu && (
                        <div style={{ background: '#faf5ff', border: '2px solid #a5b4fc', borderRadius: 10, padding: '14px 16px', marginBottom: 16 }}>
                            <div style={{ fontSize: 11, fontWeight: 800, color: '#6366f1', marginBottom: 8, letterSpacing: 0.4 }}>📝 GHI CHÚ</div>
                            <div style={{ fontSize: 13, color: '#1e293b', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{detailModal.ghi_chu}</div>
                        </div>
                    )}

                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button onClick={() => { setDetailModal(null); setConfirmDel(detailModal); }} style={{ ...btn('#fee2e2', '#dc2626'), fontSize: 12 }}>🗑 Xóa</button>
                        <button onClick={() => { setDetailModal(null); openEdit(detailModal); }} style={{ ...btn('#6366f1'), fontSize: 12 }}>✏️ Chỉnh sửa</button>
                    </div>
                </Modal>
            )}

            {confirmDel && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ background: 'white', borderRadius: 14, padding: 28, maxWidth: 340, textAlign: 'center' }}>
                        <div style={{ fontSize: 32, marginBottom: 10 }}>🗑️</div>
                        <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 15 }}>Xóa khách hàng này?</div>
                        <div style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>Hành động không thể hoàn tác.</div>
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                            <button onClick={() => setConfirmDel(null)} disabled={deleteLoading} style={{ ...btn('#f1f5f9', '#475569') }}>Hủy</button>
                            <button onClick={del} disabled={deleteLoading} style={{ ...btn('#dc2626'), opacity: deleteLoading ? 0.7 : 1 }}>
                                {deleteLoading ? 'Đang xóa...' : 'Xóa'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
