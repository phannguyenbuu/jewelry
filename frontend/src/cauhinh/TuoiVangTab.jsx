import { useEffect, useMemo, useState } from 'react';
import { IoPencilOutline, IoTrashOutline } from 'react-icons/io5';
import { API, BtnRow, ConfirmModal, Field, Modal, inp, saveBtn } from './shared';

function normalizeAscii(text) {
    return String(text || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

function parseTuoiPermille(text) {
    const value = normalizeAscii(text);
    if (!value) return null;
    const fourDigit = value.match(/\b(\d{4})\b/);
    if (fourDigit) return Math.round(Number(fourDigit[1]) / 10);
    const threeDigit = value.match(/\b(\d{3})\b/);
    if (threeDigit) return Number(threeDigit[1]);
    const karat = value.match(/(\d+(?:[.,]\d+)?)\s*k\b/);
    if (karat) return Math.round((Number(karat[1].replace(',', '.')) / 24) * 1000);
    const pct = value.match(/(\d+(?:[.,]\d+)?)\s*%/);
    if (pct) return Math.round(Number(pct[1].replace(',', '.')) * 10);
    const small = value.match(/\b(\d+(?:[.,]\d+)?)\b/);
    if (!small) return null;
    const num = Number(small[1].replace(',', '.'));
    return num <= 100 ? Math.round(num * 10) : null;
}

function loaiVangPermille(loai) {
    return parseTuoiPermille(loai?.ma_loai) ?? parseTuoiPermille(loai?.ten_loai) ?? parseTuoiPermille(loai?.sjc_key);
}

function suggestTuoiConfig(tenTuoi, loaiList) {
    const permille = parseTuoiPermille(tenTuoi);
    const target = normalizeAscii(tenTuoi);
    let ref = null;

    for (const loai of loaiList || []) {
        const hasPrice = Boolean((loai.gia_ban || 0) || (loai.gia_mua || 0));
        const options = [loai.ma_loai, loai.ten_loai, loai.sjc_key].map(normalizeAscii).filter(Boolean);
        if (target && options.includes(target) && hasPrice) {
            ref = loai;
            break;
        }
    }

    if (!ref && permille != null) {
        let nearest = null;
        let smallestDiff = Infinity;
        for (const loai of loaiList || []) {
            const hasPrice = Boolean((loai.gia_ban || 0) || (loai.gia_mua || 0));
            const loaiPermilleValue = loaiVangPermille(loai);
            if (loaiPermilleValue == null || !hasPrice) continue;
            const diff = Math.abs(loaiPermilleValue - permille);
            if (diff < smallestDiff) {
                smallestDiff = diff;
                nearest = loai;
            }
        }
        if (nearest && smallestDiff <= 20) ref = nearest;
    }

    let giaBan = ref?.gia_ban || 0;
    let giaMua = ref?.gia_mua || 0;
    if (!giaBan && !giaMua && permille != null) {
        let pureRef = null;
        let purePermille = 0;
        for (const loai of loaiList || []) {
            const loaiPermilleValue = loaiVangPermille(loai);
            if (!loaiPermilleValue || !loai.gia_ban || !loai.gia_mua) continue;
            if (loaiPermilleValue > purePermille) {
                pureRef = loai;
                purePermille = loaiPermilleValue;
            }
        }
        if (pureRef && purePermille) {
            giaBan = Math.round((pureRef.gia_ban * permille) / purePermille);
            giaMua = Math.round((pureRef.gia_mua * permille) / purePermille);
        }
    }

    return {
        gia_ban: giaBan,
        gia_mua: giaMua,
    };
}

function parseHistoryDateMs(value) {
    if (!value) return 0;
    const text = String(value).trim();
    const normalized = text.replace(' ', 'T');
    const parsed = Date.parse(normalized);
    if (!Number.isNaN(parsed)) return parsed;
    const match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
    if (!match) return 0;
    const [, day, month, year, hour = '00', minute = '00', second = '00'] = match;
    const dt = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
    return Number.isNaN(dt.getTime()) ? 0 : dt.getTime();
}

function fmtTuoiVang(value) {
    return value || value === 0 ? Number(value).toLocaleString('en-US') : '—';
}

const iconBtnStyle = {
    width: 38,
    height: 32,
    borderRadius: 8,
    cursor: 'pointer',
    fontSize: 15,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
};

export default function TuoiVangTab() {
    const [list, setList] = useState([]);
    const [loaiList, setLoaiList] = useState([]);
    const [modal, setModal] = useState(null);
    const [form, setForm] = useState({ ten_tuoi: '', gia_ban: '', gia_mua: '', ghi_chu: '' });
    const [confirm, setConfirm] = useState(null);
    const [clearHistoryConfirm, setClearHistoryConfirm] = useState(false);

    const load = async () => {
        const [tuoiRes, loaiRes] = await Promise.all([
            fetch(`${API}/api/tuoi_vang`),
            fetch(`${API}/api/loai_vang`),
        ]);
        const [tuoiData, loaiData] = await Promise.all([tuoiRes.json(), loaiRes.json()]);
        setList(tuoiData);
        setLoaiList(loaiData);
    };

    useEffect(() => {
        let cancelled = false;
        const fetchAll = async () => {
            const [tuoiRes, loaiRes] = await Promise.all([
                fetch(`${API}/api/tuoi_vang`),
                fetch(`${API}/api/loai_vang`),
            ]);
            const [tuoiData, loaiData] = await Promise.all([tuoiRes.json(), loaiRes.json()]);
            if (!cancelled) {
                setList(tuoiData);
                setLoaiList(loaiData);
            }
        };
        fetchAll().catch(() => {});
        return () => {
            cancelled = true;
        };
    }, []);

    const openAdd = () => {
        setForm({ ten_tuoi: '', gia_ban: '', gia_mua: '', ghi_chu: '' });
        setModal('add');
    };

    const openEdit = (item) => {
        setForm({
            ten_tuoi: item.ten_tuoi || '',
            gia_ban: item.gia_ban || '',
            gia_mua: item.gia_mua || '',
            ghi_chu: item.ghi_chu || '',
        });
        setModal(item);
    };

    const handleTenTuoiChange = (value) => {
        if (modal !== 'add') {
            setForm({ ...form, ten_tuoi: value });
            return;
        }
        const suggested = suggestTuoiConfig(value, loaiList);
        setForm({
            ...form,
            ten_tuoi: value,
            gia_ban: suggested.gia_ban || '',
            gia_mua: suggested.gia_mua || '',
        });
    };

    const save = async (event) => {
        event.preventDefault();
        const isEdit = modal !== 'add';
        const response = await fetch(isEdit ? `${API}/api/tuoi_vang/${modal.id}` : `${API}/api/tuoi_vang`, {
            method: isEdit ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(form),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            window.alert(payload.error || 'Lưu tuổi vàng thất bại');
            return;
        }
        setModal(null);
        await load();
    };

    const del = async () => {
        await fetch(`${API}/api/tuoi_vang/${confirm}`, { method: 'DELETE' });
        setConfirm(null);
        await load();
    };

    const clearAllHistory = async () => {
        const response = await fetch(`${API}/api/tuoi_vang/clear-history`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            window.alert(payload.error || 'Xóa toàn bộ lịch sử giá thất bại');
            return;
        }
        await load();
    };

    const delta = (value) => {
        if (!value) return null;
        const color = value > 0 ? '#16a34a' : '#dc2626';
        return (
            <span style={{ color, fontSize: 11, fontWeight: 700 }}>
                {value > 0 ? '+' : ''}
                {Number(value).toLocaleString('en-US')}
            </span>
        );
    };

    const historyRows = useMemo(
        () =>
            list
                .flatMap((item) =>
                    (item.lich_su || []).map((entry) => ({
                        ...entry,
                        ten_tuoi: item.ten_tuoi,
                        tuoi_id: item.id,
                        sortMs: parseHistoryDateMs(entry.date),
                    })),
                )
                .sort((a, b) => b.sortMs - a.sortMs),
        [list],
    );

    const summary = useMemo(() => {
        const tongSanPham = list.reduce((acc, item) => acc + Number(item.so_hang || 0), 0);
        return {
            soTuoiVang: list.length,
            tongSanPham,
            soLanDieuChinh: historyRows.length,
        };
    }, [historyRows.length, list]);

    return (
        <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 18, flexWrap: 'wrap' }}>
                <div>
                    <div style={{ fontSize: 22, fontWeight: 900, color: '#0f172a' }}>Tuổi vàng</div>
                    <div style={{ fontSize: 13, color: '#64748b', marginTop: 4, lineHeight: 1.6, maxWidth: 720 }}>
                        Quản lý cấu hình tuổi vàng, giá mua bán và lịch sử điều chỉnh giá. Ở danh sách dòng, mỗi tuổi vàng chỉ còn thao tác sửa và xóa.
                    </div>
                </div>
                <div style={{ minWidth: 220, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10 }}>
                    <div style={{ fontSize: 12, color: '#64748b', textAlign: 'right' }}>
                        {historyRows[0]?.date ? `Cập nhật gần nhất: ${historyRows[0].date}` : 'Chưa có lịch sử điều chỉnh giá'}
                    </div>
                    <button onClick={openAdd} style={saveBtn}>+ Thêm tuổi vàng</button>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 18 }}>
                <div style={{ background: 'white', borderRadius: 16, border: '1px solid #e2e8f0', padding: 18 }}>
                    <div style={{ fontSize: 11, color: '#64748b', fontWeight: 800, marginBottom: 6 }}>SỐ TUỔI VÀNG</div>
                    <div style={{ fontSize: 28, fontWeight: 900, color: '#0f172a' }}>{summary.soTuoiVang}</div>
                </div>
                <div style={{ background: 'white', borderRadius: 16, border: '1px solid #e2e8f0', padding: 18 }}>
                    <div style={{ fontSize: 11, color: '#64748b', fontWeight: 800, marginBottom: 6 }}>TỔNG SẢN PHẨM</div>
                    <div style={{ fontSize: 28, fontWeight: 900, color: '#0f766e' }}>{fmtTuoiVang(summary.tongSanPham)}</div>
                </div>
                <div style={{ background: 'white', borderRadius: 16, border: '1px solid #e2e8f0', padding: 18 }}>
                    <div style={{ fontSize: 11, color: '#64748b', fontWeight: 800, marginBottom: 6 }}>LẦN ĐIỀU CHỈNH</div>
                    <div style={{ fontSize: 28, fontWeight: 900, color: '#d97706' }}>{fmtTuoiVang(summary.soLanDieuChinh)}</div>
                </div>
            </div>

            <div style={{ background: 'white', borderRadius: 16, border: '1px solid #e2e8f0', overflow: 'hidden', marginBottom: 18 }}>
                <div style={{ padding: '16px 18px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                    <div>
                        <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>Danh sách tuổi vàng</div>
                        <div style={{ fontSize: 12, color: '#64748b', marginTop: 3 }}>Quản lý tên tuổi vàng và giá mua bán</div>
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b', fontWeight: 700 }}>{list.length} dòng</div>
                </div>

                {list.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>Chưa có tuổi vàng nào</div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', minWidth: 980, borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ background: '#f8fafc' }}>
                                    {['Tuổi vàng', 'Giá bán', 'Giá mua', 'Sản phẩm', 'Ngày tạo', ''].map((label) => (
                                        <th key={label} style={{ padding: '12px 14px', textAlign: 'left', fontSize: 11, color: '#64748b', fontWeight: 800, borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>
                                            {label}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {list.map((item, index) => (
                                    <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9', background: index % 2 === 0 ? 'white' : '#fcfcfd' }}>
                                        <td style={{ padding: '14px' }}>
                                            <div style={{ fontSize: 13, fontWeight: 900, color: '#0f172a' }}>{item.ten_tuoi}</div>
                                            <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                                                {item.ghi_chu || `Tuổi vàng ${item.ten_tuoi}`}
                                            </div>
                                        </td>
                                        <td style={{ padding: '14px' }}>
                                            <div style={{ fontSize: 14, fontWeight: 900, color: '#15803d' }}>{fmtTuoiVang(item.gia_ban)} ₫</div>
                                        </td>
                                        <td style={{ padding: '14px' }}>
                                            <div style={{ fontSize: 14, fontWeight: 900, color: '#c2410c' }}>{fmtTuoiVang(item.gia_mua)} ₫</div>
                                        </td>
                                        <td style={{ padding: '14px' }}>
                                            <div style={{ fontSize: 13, fontWeight: 900, color: '#0f172a' }}>{fmtTuoiVang(item.so_hang || 0)}</div>
                                        </td>
                                        <td style={{ padding: '14px', fontSize: 11, color: '#64748b', whiteSpace: 'nowrap' }}>
                                            {item.ngay_tao || '—'}
                                        </td>
                                        <td style={{ padding: '14px' }}>
                                            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                                                <button
                                                    onClick={() => openEdit(item)}
                                                    title="Sửa"
                                                    aria-label="Sửa"
                                                    style={{
                                                        ...iconBtnStyle,
                                                        border: '1px solid #cbd5e1',
                                                        background: 'white',
                                                        color: '#2563eb',
                                                    }}
                                                >
                                                    <IoPencilOutline />
                                                </button>
                                                <button
                                                    onClick={() => setConfirm(item.id)}
                                                    title="Xóa"
                                                    aria-label="Xóa"
                                                    style={{
                                                        ...iconBtnStyle,
                                                        border: '1px solid #fecdd3',
                                                        background: '#fff1f2',
                                                        color: '#dc2626',
                                                    }}
                                                >
                                                    <IoTrashOutline />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <div style={{ background: 'white', borderRadius: 16, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                <div style={{ padding: '16px 18px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                    <div>
                        <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>Lịch sử điều chỉnh giá</div>
                        <div style={{ fontSize: 12, color: '#64748b', marginTop: 3 }}>Gộp toàn bộ lịch sử điều chỉnh giá của các tuổi vàng</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ fontSize: 12, color: '#64748b', fontWeight: 700 }}>{historyRows.length} lần cập nhật</div>
                        <button
                            type="button"
                            onClick={() => setClearHistoryConfirm(true)}
                            disabled={historyRows.length === 0}
                            style={{
                                padding: '7px 12px',
                                borderRadius: 8,
                                border: '1px solid #fecdd3',
                                background: historyRows.length === 0 ? '#f8fafc' : '#fff1f2',
                                color: historyRows.length === 0 ? '#cbd5e1' : '#dc2626',
                                fontWeight: 700,
                                cursor: historyRows.length === 0 ? 'default' : 'pointer',
                                fontSize: 11,
                            }}
                        >
                            Xóa toàn bộ lịch sử
                        </button>
                    </div>
                </div>

                {historyRows.length === 0 ? (
                    <div style={{ padding: 30, textAlign: 'center', color: '#94a3b8' }}>Chưa có lịch sử điều chỉnh giá.</div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', minWidth: 940, borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ background: '#f8fafc' }}>
                                    {['Thời gian', 'Tuổi vàng', 'Giá bán', 'Giá mua', 'Biến động', 'Ghi chú'].map((label) => (
                                        <th key={label} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, color: '#64748b', fontWeight: 800, borderBottom: '1px solid #e2e8f0' }}>
                                            {label}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {historyRows.map((entry, index) => (
                                    <tr key={`${entry.tuoi_id}-${entry.date}-${index}`} style={{ borderBottom: '1px solid #f1f5f9', background: index % 2 === 0 ? 'white' : '#fafafa' }}>
                                        <td style={{ padding: '12px 16px', color: '#334155', whiteSpace: 'nowrap' }}>{entry.date || '—'}</td>
                                        <td style={{ padding: '12px 16px' }}>
                                            <div style={{ fontWeight: 800, color: '#0f172a' }}>{entry.ten_tuoi}</div>
                                            {entry.by && <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>{entry.by}</div>}
                                        </td>
                                        <td style={{ padding: '12px 16px', fontWeight: 700, color: '#15803d' }}>{fmtTuoiVang(entry.gia_ban)} ₫</td>
                                        <td style={{ padding: '12px 16px', fontWeight: 700, color: '#c2410c' }}>{fmtTuoiVang(entry.gia_mua)} ₫</td>
                                        <td style={{ padding: '12px 16px' }}>
                                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                                {delta(entry.delta_ban)}
                                                {delta(entry.delta_mua)}
                                                {!entry.delta_ban && !entry.delta_mua && <span style={{ fontSize: 11, color: '#94a3b8' }}>—</span>}
                                            </div>
                                        </td>
                                        <td style={{ padding: '12px 16px', color: '#64748b' }}>{entry.note || '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <Modal open={!!modal} onClose={() => setModal(null)} title={modal === 'add' ? '+ Thêm tuổi vàng' : 'Sửa tuổi vàng'} maxWidth={580}>
                <form onSubmit={save}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                        <div style={{ gridColumn: '1 / -1' }}>
                            <Field label="Tên tuổi vàng *">
                                <input required style={inp} value={form.ten_tuoi || ''} onChange={(e) => handleTenTuoiChange(e.target.value)} placeholder="VD: 417" />
                            </Field>
                        </div>
                        <Field label="Giá bán ra (₫/chỉ)">
                            <input type="number" style={inp} value={form.gia_ban || ''} onChange={(e) => setForm({ ...form, gia_ban: e.target.value })} placeholder="VD: 7071300" />
                        </Field>
                        <Field label="Giá mua vào (₫/chỉ)">
                            <input type="number" style={inp} value={form.gia_mua || ''} onChange={(e) => setForm({ ...form, gia_mua: e.target.value })} placeholder="VD: 6181300" />
                        </Field>
                    </div>
                    <div style={{ background: '#f8fafc', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 12, color: '#64748b' }}>
                        Nhập tên tuổi vàng, hệ thống sẽ gợi ý giá để bạn chỉnh lại trước khi lưu.
                    </div>
                    <Field label="Ghi chú">
                        <textarea style={{ ...inp, height: 70, resize: 'vertical' }} value={form.ghi_chu || ''} onChange={(e) => setForm({ ...form, ghi_chu: e.target.value })} placeholder="Ghi chú tuổi vàng..." />
                    </Field>
                    <BtnRow onClose={() => setModal(null)} label={modal === 'add' ? 'Tạo tuổi vàng' : 'Lưu thay đổi'} />
                </form>
            </Modal>

            <ConfirmModal
                open={confirm !== null}
                onClose={() => setConfirm(null)}
                onConfirm={del}
                message="Xóa tuổi vàng này? Giá đã lưu và lịch sử giá sẽ mất, nhưng hàng hóa đang gắn tuổi vàng sẽ không bị xóa."
            />
            <ConfirmModal
                open={clearHistoryConfirm}
                onClose={() => setClearHistoryConfirm(false)}
                onConfirm={clearAllHistory}
                message="Xóa toàn bộ lịch sử giá? Toàn bộ lịch sử của Tuổi vàng và Loại vàng sẽ bị làm trống."
            />
        </>
    );
}
