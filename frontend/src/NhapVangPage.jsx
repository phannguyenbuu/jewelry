import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { API_BASE } from './lib/api';

const API = API_BASE;

const cardStyle = {
    background: 'white',
    borderRadius: 16,
    border: '1px solid #e2e8f0',
    boxShadow: '0 8px 28px rgba(15,23,42,.05)',
};

const inputStyle = {
    width: '100%',
    padding: '9px 12px',
    borderRadius: 10,
    border: '1.5px solid #dbe3ef',
    fontSize: 13,
    boxSizing: 'border-box',
    background: 'white',
};

const labelStyle = {
    fontSize: 11,
    fontWeight: 700,
    color: '#64748b',
    display: 'block',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
};

const buttonStyle = (bg, color = 'white') => ({
    padding: '9px 16px',
    borderRadius: 10,
    border: 'none',
    background: bg,
    color,
    fontWeight: 700,
    cursor: 'pointer',
    fontSize: 13,
});

const STATUS_META = {
    dang_mo: { label: 'Đang mở', bg: '#dbeafe', text: '#1d4ed8' },
    tam_dung: { label: 'Tạm dừng', bg: '#fef3c7', text: '#92400e' },
    hoan_thanh: { label: 'Hoàn thành', bg: '#dcfce7', text: '#166534' },
};

const emptyListForm = () => ({
    ten_danh_sach: '',
    trang_thai: 'dang_mo',
    ghi_chu: '',
});

const emptyItemForm = () => ({
    id: null,
    ten_hang: '',
    nhom_hang: '',
    tuoi_vang: '',
    trong_luong: '',
    so_luong_yeu_cau: '1',
    so_luong_da_nhap: '0',
    ghi_chu: '',
    thu_tu: '0',
});

function Modal({ open, onClose, title, children, maxWidth = 720 }) {
    if (!open) return null;
    return (
        <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.48)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
            onClick={(e) => e.target === e.currentTarget && onClose()}
        >
            <div style={{ ...cardStyle, width: '100%', maxWidth, maxHeight: '92vh', overflow: 'auto' }}>
                <div style={{ padding: '18px 22px', borderBottom: '1px solid #eef2f7', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ fontWeight: 800, fontSize: 17, color: '#0f172a' }}>{title}</div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 24, cursor: 'pointer' }}>×</button>
                </div>
                <div style={{ padding: 22 }}>{children}</div>
            </div>
        </div>
    );
}

function Field({ label, children }) {
    return (
        <div>
            <label style={labelStyle}>{label}</label>
            {children}
        </div>
    );
}

export default function NhapVangPage() {
    const [lists, setLists] = useState([]);
    const [selectedId, setSelectedId] = useState(null);
    const [nhomHangList, setNhomHangList] = useState([]);
    const [tuoiVangList, setTuoiVangList] = useState([]);
    const [loading, setLoading] = useState(false);
    const [listModalOpen, setListModalOpen] = useState(false);
    const [itemModalOpen, setItemModalOpen] = useState(false);
    const [listForm, setListForm] = useState(emptyListForm());
    const [itemForm, setItemForm] = useState(emptyItemForm());
    const [editingListId, setEditingListId] = useState(null);
    const [notice, setNotice] = useState('');

    const selectedList = lists.find((entry) => entry.id === selectedId) || lists[0] || null;

    const loadAll = useCallback(async () => {
        setLoading(true);
        try {
            const [listsRes, nhomRes, tuoiRes] = await Promise.all([
                fetch(`${API}/api/nhap_vang_lists`),
                fetch(`${API}/api/nhom_hang`),
                fetch(`${API}/api/tuoi_vang`),
            ]);

            const listsData = listsRes.ok ? await listsRes.json() : [];
            setLists(Array.isArray(listsData) ? listsData : []);
            setSelectedId((prev) => {
                if (prev && listsData.some((entry) => entry.id === prev)) return prev;
                return listsData[0]?.id || null;
            });

            if (nhomRes.ok) setNhomHangList(await nhomRes.json());
            if (tuoiRes.ok) setTuoiVangList(await tuoiRes.json());
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadAll().catch(console.error);
    }, [loadAll]);

    const stats = useMemo(() => {
        const totalLists = lists.length;
        const openLists = lists.filter((entry) => entry.trang_thai !== 'hoan_thanh').length;
        const totalRequired = lists.reduce((sum, entry) => sum + (entry.tong_so_luong || 0), 0);
        const totalImported = lists.reduce((sum, entry) => sum + (entry.da_nhap || 0), 0);
        return { totalLists, openLists, totalRequired, totalImported };
    }, [lists]);

    const openCreateList = () => {
        setEditingListId(null);
        setListForm(emptyListForm());
        setListModalOpen(true);
    };

    const openEditList = (entry) => {
        setEditingListId(entry.id);
        setListForm({
            ten_danh_sach: entry.ten_danh_sach || '',
            trang_thai: entry.trang_thai || 'dang_mo',
            ghi_chu: entry.ghi_chu || '',
        });
        setListModalOpen(true);
    };

    const saveList = async (e) => {
        e.preventDefault();
        const method = editingListId ? 'PUT' : 'POST';
        const url = editingListId ? `${API}/api/nhap_vang_lists/${editingListId}` : `${API}/api/nhap_vang_lists`;
        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(listForm),
        });
        const data = await response.json();
        if (!response.ok) {
            window.alert(data.error || 'Không lưu được danh sách.');
            return;
        }
        setListModalOpen(false);
        setNotice(editingListId ? 'Đã cập nhật danh sách nhập vàng.' : 'Đã tạo danh sách nhập vàng.');
        await loadAll();
        setSelectedId(data.id || selectedId);
    };

    const deleteList = async (entry) => {
        if (!window.confirm(`Xóa danh sách "${entry.ten_danh_sach}"?`)) return;
        const response = await fetch(`${API}/api/nhap_vang_lists/${entry.id}`, { method: 'DELETE' });
        if (!response.ok) {
            window.alert('Không xóa được danh sách.');
            return;
        }
        setNotice('Đã xóa danh sách nhập vàng.');
        await loadAll();
    };

    const openCreateItem = () => {
        setItemForm(emptyItemForm());
        setItemModalOpen(true);
    };

    const openEditItem = (item) => {
        setItemForm({
            id: item.id,
            ten_hang: item.ten_hang || '',
            nhom_hang: item.nhom_hang || '',
            tuoi_vang: item.tuoi_vang || '',
            trong_luong: item.trong_luong || '',
            so_luong_yeu_cau: String(item.so_luong_yeu_cau ?? 1),
            so_luong_da_nhap: String(item.so_luong_da_nhap ?? 0),
            ghi_chu: item.ghi_chu || '',
            thu_tu: String(item.thu_tu ?? 0),
        });
        setItemModalOpen(true);
    };

    const saveItem = async (e) => {
        e.preventDefault();
        if (!selectedList) return;
        const payload = {
            ten_hang: itemForm.ten_hang,
            nhom_hang: itemForm.nhom_hang,
            tuoi_vang: itemForm.tuoi_vang,
            trong_luong: itemForm.trong_luong,
            so_luong_yeu_cau: Number(itemForm.so_luong_yeu_cau || 0),
            so_luong_da_nhap: Number(itemForm.so_luong_da_nhap || 0),
            ghi_chu: itemForm.ghi_chu,
            thu_tu: Number(itemForm.thu_tu || 0),
        };
        const method = itemForm.id ? 'PUT' : 'POST';
        const url = itemForm.id
            ? `${API}/api/nhap_vang_items/${itemForm.id}`
            : `${API}/api/nhap_vang_lists/${selectedList.id}/items`;

        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const data = await response.json();
        if (!response.ok) {
            window.alert(data.error || 'Không lưu được dòng nhập.');
            return;
        }
        setItemModalOpen(false);
        setNotice(itemForm.id ? 'Đã cập nhật dòng nhập vàng.' : 'Đã thêm dòng nhập vàng.');
        await loadAll();
    };

    const deleteItem = async (item) => {
        if (!window.confirm(`Xóa dòng "${item.ten_hang}"?`)) return;
        const response = await fetch(`${API}/api/nhap_vang_items/${item.id}`, { method: 'DELETE' });
        if (!response.ok) {
            window.alert('Không xóa được dòng nhập.');
            return;
        }
        setNotice('Đã xóa dòng nhập vàng.');
        await loadAll();
    };

    const updateProgress = async (item, delta) => {
        const response = await fetch(`${API}/api/nhap_vang_items/${item.id}/progress`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ delta }),
        });
        if (!response.ok) {
            window.alert('Không cập nhật được tiến độ.');
            return;
        }
        await loadAll();
    };

    return (
        <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 18 }}>
                {[
                    { label: 'Tổng danh sách', value: stats.totalLists, color: '#1d4ed8' },
                    { label: 'Đang mở', value: stats.openLists, color: '#0f766e' },
                    { label: 'Tổng cần nhập', value: stats.totalRequired, color: '#b45309' },
                    { label: 'Đã nhập', value: stats.totalImported, color: '#7c3aed' },
                ].map((item) => (
                    <div key={item.label} style={{ ...cardStyle, padding: '16px 18px' }}>
                        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>{item.label}</div>
                        <div style={{ fontSize: 28, fontWeight: 900, color: item.color }}>{item.value}</div>
                    </div>
                ))}
            </div>

            <div style={{ ...cardStyle, padding: '16px 18px', marginBottom: 18, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 260 }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>Nhập vàng</div>
                    <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>Admin tạo danh sách sản phẩm cần nhập để mobile `/sale` đối chiếu theo checklist.</div>
                </div>
                {notice && <div style={{ fontSize: 12, color: '#0f766e', fontWeight: 700 }}>{notice}</div>}
                <button onClick={() => loadAll().catch(console.error)} style={buttonStyle('#e2e8f0', '#334155')}>Làm mới</button>
                <button onClick={openCreateList} style={buttonStyle('#0f766e')}>+ Tạo danh sách</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '320px minmax(0, 1fr)', gap: 18, alignItems: 'start' }}>
                <div style={{ ...cardStyle, padding: 16 }}>
                    <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: 12 }}>Danh sách cần nhập</div>
                    {loading && lists.length === 0 ? (
                        <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>Đang tải...</div>
                    ) : lists.length === 0 ? (
                        <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>Chưa có danh sách nào.</div>
                    ) : (
                        <div style={{ display: 'grid', gap: 10 }}>
                            {lists.map((entry) => {
                                const active = selectedList?.id === entry.id;
                                const meta = STATUS_META[entry.trang_thai] || STATUS_META.dang_mo;
                                return (
                                    <div
                                        key={entry.id}
                                        onClick={() => setSelectedId(entry.id)}
                                        style={{
                                            borderRadius: 14,
                                            border: active ? '1.5px solid #0f766e' : '1px solid #e2e8f0',
                                            background: active ? '#f0fdfa' : '#fff',
                                            padding: 14,
                                            cursor: 'pointer',
                                        }}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                                            <div>
                                                <div style={{ fontWeight: 800, color: '#0f172a', fontSize: 14 }}>{entry.ten_danh_sach}</div>
                                                <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>{entry.ngay_cap_nhat || entry.ngay_tao || '—'}</div>
                                            </div>
                                            <span style={{ background: meta.bg, color: meta.text, borderRadius: 999, padding: '4px 10px', fontSize: 11, fontWeight: 700 }}>
                                                {meta.label}
                                            </span>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 10, fontSize: 11, color: '#475569' }}>
                                            <div><strong>{entry.tong_so_luong || 0}</strong><br />Cần nhập</div>
                                            <div><strong>{entry.da_nhap || 0}</strong><br />Đã nhập</div>
                                            <div><strong>{entry.con_lai || 0}</strong><br />Còn lại</div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                <div style={{ ...cardStyle, padding: 16 }}>
                    {!selectedList ? (
                        <div style={{ padding: 30, textAlign: 'center', color: '#94a3b8' }}>Chọn một danh sách để xem và quản lý chi tiết.</div>
                    ) : (
                        <>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                                <div>
                                    <div style={{ fontSize: 20, fontWeight: 900, color: '#0f172a' }}>{selectedList.ten_danh_sach}</div>
                                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>{selectedList.ghi_chu || 'Chưa có ghi chú'}</div>
                                </div>
                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                    <button onClick={() => openEditList(selectedList)} style={buttonStyle('#e2e8f0', '#334155')}>Sửa danh sách</button>
                                    <button onClick={openCreateItem} style={buttonStyle('#1d4ed8')}>+ Thêm dòng</button>
                                    <button onClick={() => deleteList(selectedList)} style={buttonStyle('#fee2e2', '#b91c1c')}>Xóa</button>
                                </div>
                            </div>

                            {selectedList.items?.length ? (
                                <div style={{ display: 'grid', gap: 12 }}>
                                    {selectedList.items.map((item) => (
                                        <div key={item.id} style={{ border: '1px solid #e2e8f0', borderRadius: 14, padding: '14px 16px', background: '#fbfdff' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                                                <div>
                                                    <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>{item.ten_hang}</div>
                                                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                                                        {item.nhom_hang || '—'} · {item.tuoi_vang || '—'} · {item.trong_luong || '—'}
                                                    </div>
                                                </div>
                                                <div style={{ textAlign: 'right' }}>
                                                    <div style={{ fontSize: 18, fontWeight: 900, color: item.hoan_thanh ? '#15803d' : '#1d4ed8' }}>
                                                        {item.so_luong_da_nhap}/{item.so_luong_yeu_cau}
                                                    </div>
                                                    <div style={{ fontSize: 11, color: '#64748b' }}>đã nhập / cần nhập</div>
                                                </div>
                                            </div>

                                            {item.ghi_chu && (
                                                <div style={{ marginTop: 8, fontSize: 12, color: '#475569', background: '#f8fafc', borderRadius: 10, padding: '8px 10px' }}>
                                                    {item.ghi_chu}
                                                </div>
                                            )}

                                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
                                                <div style={{ display: 'flex', gap: 8 }}>
                                                    <button onClick={() => updateProgress(item, -1)} style={buttonStyle('#e2e8f0', '#334155')}>-1</button>
                                                    <button onClick={() => updateProgress(item, 1)} style={buttonStyle('#0f766e')}>+1</button>
                                                </div>
                                                <div style={{ display: 'flex', gap: 8 }}>
                                                    <button onClick={() => openEditItem(item)} style={buttonStyle('#e2e8f0', '#334155')}>Sửa</button>
                                                    <button onClick={() => deleteItem(item)} style={buttonStyle('#fee2e2', '#b91c1c')}>Xóa</button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div style={{ padding: 30, textAlign: 'center', color: '#94a3b8' }}>Danh sách này chưa có dòng hàng nào.</div>
                            )}
                        </>
                    )}
                </div>
            </div>

            <Modal open={listModalOpen} onClose={() => setListModalOpen(false)} title={editingListId ? 'Cập nhật danh sách nhập vàng' : 'Tạo danh sách nhập vàng'} maxWidth={640}>
                <form onSubmit={saveList} style={{ display: 'grid', gap: 14 }}>
                    <Field label="Tên danh sách">
                        <input style={inputStyle} value={listForm.ten_danh_sach} onChange={(e) => setListForm({ ...listForm, ten_danh_sach: e.target.value })} required />
                    </Field>
                    <Field label="Trạng thái">
                        <select style={inputStyle} value={listForm.trang_thai} onChange={(e) => setListForm({ ...listForm, trang_thai: e.target.value })}>
                            {Object.entries(STATUS_META).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}
                        </select>
                    </Field>
                    <Field label="Ghi chú">
                        <textarea style={{ ...inputStyle, minHeight: 100, resize: 'vertical' }} value={listForm.ghi_chu} onChange={(e) => setListForm({ ...listForm, ghi_chu: e.target.value })} />
                    </Field>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                        <button type="button" onClick={() => setListModalOpen(false)} style={buttonStyle('#e2e8f0', '#334155')}>Hủy</button>
                        <button type="submit" style={buttonStyle('#0f766e')}>{editingListId ? 'Lưu thay đổi' : 'Tạo danh sách'}</button>
                    </div>
                </form>
            </Modal>

            <Modal open={itemModalOpen} onClose={() => setItemModalOpen(false)} title={itemForm.id ? 'Cập nhật dòng nhập vàng' : 'Thêm dòng nhập vàng'}>
                <form onSubmit={saveItem} style={{ display: 'grid', gap: 14 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                        <Field label="Tên hàng">
                            <input style={inputStyle} value={itemForm.ten_hang} onChange={(e) => setItemForm({ ...itemForm, ten_hang: e.target.value })} required />
                        </Field>
                        <Field label="Trọng lượng">
                            <input style={inputStyle} value={itemForm.trong_luong} onChange={(e) => setItemForm({ ...itemForm, trong_luong: e.target.value })} placeholder="VD: 1.2 chỉ / 4.5g" />
                        </Field>
                        <Field label="Nhóm hàng">
                            <select style={inputStyle} value={itemForm.nhom_hang} onChange={(e) => setItemForm({ ...itemForm, nhom_hang: e.target.value })}>
                                <option value="">-- Chọn nhóm --</option>
                                {nhomHangList.map((item) => <option key={item.id} value={item.ten_nhom}>{item.ten_nhom}</option>)}
                            </select>
                        </Field>
                        <Field label="Tuổi vàng">
                            <select style={inputStyle} value={itemForm.tuoi_vang} onChange={(e) => setItemForm({ ...itemForm, tuoi_vang: e.target.value })}>
                                <option value="">-- Chọn tuổi vàng --</option>
                                {tuoiVangList.map((item) => <option key={item.id} value={item.ten_tuoi}>{item.ten_tuoi}</option>)}
                            </select>
                        </Field>
                        <Field label="Số lượng cần nhập">
                            <input style={inputStyle} type="number" min="0" value={itemForm.so_luong_yeu_cau} onChange={(e) => setItemForm({ ...itemForm, so_luong_yeu_cau: e.target.value })} />
                        </Field>
                        <Field label="Số lượng đã nhập">
                            <input style={inputStyle} type="number" min="0" value={itemForm.so_luong_da_nhap} onChange={(e) => setItemForm({ ...itemForm, so_luong_da_nhap: e.target.value })} />
                        </Field>
                        <Field label="Thứ tự">
                            <input style={inputStyle} type="number" min="0" value={itemForm.thu_tu} onChange={(e) => setItemForm({ ...itemForm, thu_tu: e.target.value })} />
                        </Field>
                    </div>
                    <Field label="Ghi chú">
                        <textarea style={{ ...inputStyle, minHeight: 90, resize: 'vertical' }} value={itemForm.ghi_chu} onChange={(e) => setItemForm({ ...itemForm, ghi_chu: e.target.value })} />
                    </Field>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                        <button type="button" onClick={() => setItemModalOpen(false)} style={buttonStyle('#e2e8f0', '#334155')}>Hủy</button>
                        <button type="submit" style={buttonStyle('#1d4ed8')}>{itemForm.id ? 'Lưu thay đổi' : 'Thêm dòng'}</button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}
