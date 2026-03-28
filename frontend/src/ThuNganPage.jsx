import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { API_BASE } from './lib/api';

const API = API_BASE;
const MONEY_EPSILON = 0.5;

const today = () => new Date().toISOString().slice(0, 10);
const fmt = value => Math.round(Number(value || 0)).toLocaleString('en-US');
const toNumber = value => {
    const normalized = typeof value === 'string' ? value.replace(/,/g, '').trim() : value;
    if (normalized === '' || normalized === '-' || normalized === '.' || normalized === '-.') return 0;
    const num = Number(normalized);
    return Number.isFinite(num) ? num : 0;
};
const formatMoneyInput = value => String(Math.round(toNumber(value)));
const sameMoney = (left, right) => Math.abs(toNumber(left) - toNumber(right)) < MONEY_EPSILON;
const makeRowId = () => `detail_${Date.now()}_${Math.random().toString(16).slice(2)}`;

const inputBase = {
    width: '100%',
    padding: '9px 10px',
    borderRadius: 10,
    border: '1.5px solid #dbe3ee',
    fontSize: 12,
    boxSizing: 'border-box',
    background: 'white',
    outline: 'none',
};

const textareaStyle = {
    ...inputBase,
    minHeight: 78,
    resize: 'vertical',
    padding: '12px 14px',
    fontSize: 13,
};

const actionBtn = (bg, color = 'white') => ({
    padding: '9px 14px',
    borderRadius: 10,
    border: 'none',
    background: bg,
    color,
    fontWeight: 800,
    cursor: 'pointer',
    fontSize: 12,
});

const panelStyle = {
    background: 'white',
    borderRadius: 14,
    border: '1px solid #e2e8f0',
    overflow: 'hidden',
    boxShadow: '0 1px 6px rgba(15, 23, 42, 0.04)',
};

const metricCardStyle = {
    background: 'white',
    borderRadius: 14,
    border: '1px solid #e2e8f0',
    padding: 16,
};

const cashierAmountStyle = color => ({
    fontSize: 14,
    fontWeight: 900,
    color,
    letterSpacing: 0.2,
    lineHeight: 0.96,
    fontFamily: "'Roboto Condensed', 'Arial Narrow', 'Be Vietnam Pro', sans-serif",
    whiteSpace: 'nowrap',
});

const detailGridStyle = {
    display: 'grid',
    gridTemplateColumns: 'minmax(122px, 0.8fr) repeat(3, minmax(116px, 1fr)) 34px',
    gap: 8,
    alignItems: 'center',
    minWidth: 540,
};

const statusMeta = {
    idle: null,
    pending: { label: 'Chờ lưu nháp', color: '#ea580c', bg: '#fff7ed' },
    saving: { label: 'Đang lưu', color: '#2563eb', bg: '#eff6ff' },
    saved: { label: 'Đã lưu nháp', color: '#16a34a', bg: '#f0fdf4' },
    error: { label: 'Lỗi lưu', color: '#dc2626', bg: '#fff1f2' },
};

const emptyDetailRow = () => ({
    row_id: makeRowId(),
    tuoi_vang: '',
    ton_dau_ky: formatMoneyInput(0),
    so_du_hien_tai: formatMoneyInput(0),
    gia_tri_lech: formatMoneyInput(0),
});

const toFormDetailRow = row => ({
    row_id: row?.row_id || makeRowId(),
    tuoi_vang: row?.tuoi_vang || '',
    ton_dau_ky: formatMoneyInput(row?.ton_dau_ky ?? 0),
    so_du_hien_tai: formatMoneyInput(row?.so_du_hien_tai ?? 0),
    gia_tri_lech: formatMoneyInput(row?.gia_tri_lech ?? 0),
});

const buildFormMap = rows => Object.fromEntries(
    (rows || []).map(row => [
        row.thu_ngan_id,
        {
            ghi_chu: row.ghi_chu || '',
            chi_tiet: Array.isArray(row.chi_tiet) ? row.chi_tiet.map(toFormDetailRow) : [],
        },
    ]),
);

const lineDiff = line => (line.gia_tri_lech !== '' ? toNumber(line.gia_tri_lech) : (toNumber(line.so_du_hien_tai) - toNumber(line.ton_dau_ky)));

const totalsFromForm = (form, fallbackRow = null) => {
    const rows = form?.chi_tiet || [];
    if (!rows.length) {
        return {
            dauKy: toNumber(fallbackRow?.so_tien_dau_ngay),
            hienTai: toNumber(fallbackRow?.so_tien_hien_tai),
            chenhLech: toNumber(fallbackRow?.chenh_lech),
        };
    }
    return rows.reduce((acc, row) => {
        acc.dauKy += toNumber(row.ton_dau_ky);
        acc.hienTai += toNumber(row.so_du_hien_tai);
        acc.chenhLech += lineDiff(row);
        return acc;
    }, { dauKy: 0, hienTai: 0, chenhLech: 0 });
};

const buildPayload = (thuNganId, ngay, form) => {
    const chi_tiet = (form?.chi_tiet || []).map(row => ({
        row_id: row.row_id || makeRowId(),
        tuoi_vang: row.tuoi_vang || '',
        ton_dau_ky: toNumber(row.ton_dau_ky),
        so_du_hien_tai: toNumber(row.so_du_hien_tai),
        gia_tri_lech: lineDiff(row),
    }));
    const totals = totalsFromForm({ chi_tiet });
    return {
        ngay,
        thu_ngan_id: thuNganId,
        ghi_chu: form?.ghi_chu || '',
        chi_tiet,
        so_tien_dau_ngay: totals.dauKy,
        so_tien_hien_tai: totals.hienTai,
    };
};

const findCashierRow = (payload, thuNganId) => (
    (payload?.rows || []).find(row => row.thu_ngan_id === thuNganId)
);

const serverEchoesDetailRows = (payload, thuNganId, form) => {
    const expectedRows = form?.chi_tiet || [];
    if (!expectedRows.length) return true;
    const serverRow = findCashierRow(payload, thuNganId);
    return Array.isArray(serverRow?.chi_tiet) && serverRow.chi_tiet.length >= expectedRows.length;
};

export default function ThuNganPage() {
    const [ngay, setNgay] = useState(today());
    const [data, setData] = useState({ ngay: today(), rows: [], history: [] });
    const [formMap, setFormMap] = useState({});
    const [tuoiVangOptions, setTuoiVangOptions] = useState([]);
    const [loading, setLoading] = useState(false);
    const [savingMap, setSavingMap] = useState({});
    const [draftStatusMap, setDraftStatusMap] = useState({});
    const [historyDeletingKey, setHistoryDeletingKey] = useState('');
    const [resettingAll, setResettingAll] = useState(false);
    const [notice, setNotice] = useState('');
    const ngayRef = useRef(ngay);
    const pendingFormsRef = useRef({});
    const statusTimersRef = useRef({});
    const queuedDraftsRef = useRef({});
    const savePromisesRef = useRef({});

    const clearAllTimers = useCallback(() => {
        Object.values(statusTimersRef.current).forEach(clearTimeout);
        statusTimersRef.current = {};
        queuedDraftsRef.current = {};
        savePromisesRef.current = {};
    }, []);

    useEffect(() => {
        ngayRef.current = ngay;
    }, [ngay]);

    const applyPayload = useCallback((payload, fallbackNgay) => {
        const nextData = {
            ngay: payload.ngay || fallbackNgay,
            rows: Array.isArray(payload.rows) ? payload.rows : [],
            history: Array.isArray(payload.history) ? payload.history : [],
        };
        setData(nextData);
        setFormMap({
            ...buildFormMap(nextData.rows),
            ...pendingFormsRef.current,
        });
    }, []);

    const load = useCallback(async (targetNgay) => {
        setLoading(true);
        try {
            const res = await fetch(`${API}/api/thu_ngan_so_quy?ngay=${encodeURIComponent(targetNgay)}`);
            const payload = await res.json();
            if (!res.ok) throw new Error(payload.error || `HTTP ${res.status}`);
            applyPayload(payload, targetNgay);
            setNotice('');
        } catch (err) {
            setNotice(`Không tải được bảng thu ngân: ${err.message}`);
        } finally {
            setLoading(false);
        }
    }, [applyPayload]);

    useEffect(() => {
        clearAllTimers();
        pendingFormsRef.current = {};
        setDraftStatusMap({});
        load(ngay);
    }, [clearAllTimers, load, ngay]);

    useEffect(() => {
        fetch(`${API}/api/tuoi_vang`).then(r => r.json()).then(rows => {
            setTuoiVangOptions(Array.isArray(rows) ? rows : []);
        }).catch(() => setTuoiVangOptions([]));
    }, []);

    useEffect(() => () => clearAllTimers(), [clearAllTimers]);

    const flushDraftSave = useCallback((thuNganId) => {
        if (savePromisesRef.current[thuNganId]) {
            return savePromisesRef.current[thuNganId];
        }

        const task = (async () => {
            while (queuedDraftsRef.current[thuNganId]) {
                const requestNgay = ngayRef.current;
                const formToSave = queuedDraftsRef.current[thuNganId];
                delete queuedDraftsRef.current[thuNganId];
                clearTimeout(statusTimersRef.current[thuNganId]);
                setDraftStatusMap(prev => ({ ...prev, [thuNganId]: 'saving' }));
                try {
                    const res = await fetch(`${API}/api/thu_ngan_so_quy`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(buildPayload(thuNganId, requestNgay, formToSave)),
                    });
                    const payload = await res.json();
                    if (!res.ok) throw new Error(payload.error || `HTTP ${res.status}`);
                    if (ngayRef.current !== requestNgay) {
                        continue;
                    }

                    const hasQueuedUpdate = Boolean(queuedDraftsRef.current[thuNganId]);
                    const hasDetailEcho = serverEchoesDetailRows(payload, thuNganId, formToSave);
                    if (!hasQueuedUpdate && hasDetailEcho) {
                        delete pendingFormsRef.current[thuNganId];
                    } else if (hasQueuedUpdate) {
                        pendingFormsRef.current[thuNganId] = queuedDraftsRef.current[thuNganId];
                    } else {
                        pendingFormsRef.current[thuNganId] = formToSave;
                    }
                    applyPayload(payload, requestNgay);

                    if (hasQueuedUpdate) {
                        setDraftStatusMap(prev => ({ ...prev, [thuNganId]: 'pending' }));
                        continue;
                    }
                    if (hasDetailEcho) {
                        setDraftStatusMap(prev => ({ ...prev, [thuNganId]: 'saved' }));
                        statusTimersRef.current[thuNganId] = setTimeout(() => {
                            setDraftStatusMap(prev => ({ ...prev, [thuNganId]: 'idle' }));
                        }, 1600);
                    } else {
                        setDraftStatusMap(prev => ({ ...prev, [thuNganId]: 'error' }));
                        setNotice('Backend đang phản hồi bản cũ cho Thu Ngân: dòng chi tiết chưa được lưu. Hãy restart backend để nạp API mới.');
                    }
                } catch (err) {
                    if (ngayRef.current !== requestNgay) {
                        continue;
                    }
                    pendingFormsRef.current[thuNganId] = queuedDraftsRef.current[thuNganId] || formToSave;
                    setDraftStatusMap(prev => ({ ...prev, [thuNganId]: 'error' }));
                    setNotice(`Không lưu được nháp của thu ngân #${thuNganId}: ${err.message}`);
                    break;
                }
            }
        })().finally(() => {
            if (savePromisesRef.current[thuNganId] === task) {
                delete savePromisesRef.current[thuNganId];
            }
            if (queuedDraftsRef.current[thuNganId]) {
                flushDraftSave(thuNganId);
            }
        });

        savePromisesRef.current[thuNganId] = task;
        return task;
    }, [applyPayload]);

    const scheduleDraftSave = useCallback((thuNganId, nextForm) => {
        clearTimeout(statusTimersRef.current[thuNganId]);
        queuedDraftsRef.current[thuNganId] = nextForm;
        setDraftStatusMap(prev => ({ ...prev, [thuNganId]: savePromisesRef.current[thuNganId] ? 'pending' : 'saving' }));
        flushDraftSave(thuNganId);
    }, [flushDraftSave]);

    const updateCashierForm = useCallback((thuNganId, updater) => {
        setFormMap(prev => {
            const current = prev[thuNganId] || { ghi_chu: '', chi_tiet: [] };
            const nextForm = typeof updater === 'function' ? updater(current) : updater;
            pendingFormsRef.current[thuNganId] = nextForm;
            scheduleDraftSave(thuNganId, nextForm);
            return { ...prev, [thuNganId]: nextForm };
        });
    }, [scheduleDraftSave]);

    const handleAddDetailRow = useCallback((thuNganId) => {
        updateCashierForm(thuNganId, current => ({
            ...current,
            chi_tiet: [...(current.chi_tiet || []), emptyDetailRow()],
        }));
    }, [updateCashierForm]);

    const handleRemoveDetailRow = useCallback((thuNganId, rowId) => {
        updateCashierForm(thuNganId, current => ({
            ...current,
            chi_tiet: (current.chi_tiet || []).filter(row => row.row_id !== rowId),
        }));
    }, [updateCashierForm]);

    const handleDetailFieldChange = useCallback((thuNganId, rowId, key, value) => {
        updateCashierForm(thuNganId, current => ({
            ...current,
            chi_tiet: (current.chi_tiet || []).map(row => {
                if (row.row_id !== rowId) return row;
                const nextRow = { ...row, [key]: value };
                if (key === 'ton_dau_ky' || key === 'so_du_hien_tai') {
                    const prevAutoDiff = toNumber(row.so_du_hien_tai) - toNumber(row.ton_dau_ky);
                    const nextDauKy = key === 'ton_dau_ky' ? value : row.ton_dau_ky;
                    const nextHienTai = key === 'so_du_hien_tai' ? value : row.so_du_hien_tai;
                    if (row.gia_tri_lech === '' || sameMoney(row.gia_tri_lech, prevAutoDiff)) {
                        nextRow.gia_tri_lech = formatMoneyInput(toNumber(nextHienTai) - toNumber(nextDauKy));
                    }
                }
                return nextRow;
            }),
        }));
    }, [updateCashierForm]);

    const handleNoteChange = useCallback((thuNganId, value) => {
        updateCashierForm(thuNganId, current => ({ ...current, ghi_chu: value }));
    }, [updateCashierForm]);

    const handleChot = async (row) => {
        const thuNganId = row.thu_ngan_id;
        clearTimeout(statusTimersRef.current[thuNganId]);
        if (savePromisesRef.current[thuNganId]) {
            await savePromisesRef.current[thuNganId].catch(() => null);
        }
        const form = pendingFormsRef.current[thuNganId]
            || formMap[thuNganId]
            || buildFormMap([row])[thuNganId]
            || { ghi_chu: row.ghi_chu || '', chi_tiet: [] };
        setSavingMap(prev => ({ ...prev, [thuNganId]: true }));
        try {
            const res = await fetch(`${API}/api/thu_ngan_so_quy/chot`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(buildPayload(thuNganId, ngay, form)),
            });
            const payload = await res.json();
            if (!res.ok) throw new Error(payload.error || `HTTP ${res.status}`);
            const hasDetailEcho = serverEchoesDetailRows(payload, thuNganId, form);
            if (hasDetailEcho) {
                delete pendingFormsRef.current[thuNganId];
            } else {
                pendingFormsRef.current[thuNganId] = form;
            }
            applyPayload(payload, ngay);
            if (hasDetailEcho) {
                setDraftStatusMap(prev => ({ ...prev, [thuNganId]: 'saved' }));
                setNotice(`Đã chốt số tiền cho ${row.ten_thu_ngan}.`);
            } else {
                setDraftStatusMap(prev => ({ ...prev, [thuNganId]: 'error' }));
                setNotice(`Backend đang chạy bản cũ nên chưa nhận chi tiết của ${row.ten_thu_ngan}. Hãy restart backend rồi chốt lại.`);
            }
        } catch (err) {
            setDraftStatusMap(prev => ({ ...prev, [thuNganId]: 'error' }));
            setNotice(`Không chốt được ${row.ten_thu_ngan}: ${err.message}`);
        } finally {
            setSavingMap(prev => ({ ...prev, [thuNganId]: false }));
        }
    };

    const handleDeleteHistory = async (item) => {
        const key = item.entry_id || `${item.thu_ngan_id}-${item.thoi_gian}-${item.so_tien}`;
        if (!window.confirm(`Xóa lịch sử chốt lúc ${item.thoi_gian} của ${item.ten_thu_ngan}?`)) return;
        setHistoryDeletingKey(key);
        try {
            const res = await fetch(`${API}/api/thu_ngan_so_quy/history/delete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ngay,
                    thu_ngan_id: item.thu_ngan_id,
                    entry_id: item.entry_id || '',
                    thoi_gian: item.thoi_gian,
                    so_tien_dau_ngay: item.so_tien_dau_ngay,
                    so_tien: item.so_tien,
                    ghi_chu: item.ghi_chu || '',
                }),
            });
            const payload = await res.json();
            if (!res.ok) throw new Error(payload.error || `HTTP ${res.status}`);
            delete pendingFormsRef.current[item.thu_ngan_id];
            applyPayload(payload, ngay);
            setNotice(`Đã xóa lịch sử chốt của ${item.ten_thu_ngan}.`);
        } catch (err) {
            setNotice(`Không xóa được lịch sử: ${err.message}`);
        } finally {
            setHistoryDeletingKey('');
        }
    };

    const handleResetAll = async () => {
        if (!window.confirm(`Reset all ngày ${ngay} để đưa toàn bộ số liệu về 0 và xóa hết lịch sử chốt?`)) return;
        setResettingAll(true);
        try {
            const res = await fetch(`${API}/api/thu_ngan_so_quy/reset_all`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ngay }),
            });
            const payload = await res.json();
            if (!res.ok) throw new Error(payload.error || `HTTP ${res.status}`);
            clearAllTimers();
            pendingFormsRef.current = {};
            setDraftStatusMap({});
            applyPayload(payload, ngay);
            setNotice(`Đã reset toàn bộ thu ngân ngày ${ngay} về 0.`);
        } catch (err) {
            setNotice(`Không reset được thu ngân: ${err.message}`);
        } finally {
            setResettingAll(false);
        }
    };

    const summary = useMemo(() => {
        return (data.rows || []).reduce((acc, row) => {
            const form = formMap[row.thu_ngan_id] || buildFormMap([row])[row.thu_ngan_id] || { ghi_chu: '', chi_tiet: [] };
            const totals = totalsFromForm(form, row);
            acc.soThuNgan += 1;
            acc.soDong += form.chi_tiet.length;
            acc.dauKy += totals.dauKy;
            acc.hienTai += totals.hienTai;
            acc.chenhLech += totals.chenhLech;
            return acc;
        }, { soThuNgan: 0, soDong: 0, dauKy: 0, hienTai: 0, chenhLech: 0 });
    }, [data.rows, formMap]);

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '0 28px', display: 'flex', gap: 4 }}>
                <button
                    type="button"
                    style={{
                        padding: '12px 18px',
                        border: 'none',
                        cursor: 'default',
                        fontSize: 13,
                        fontWeight: 700,
                        background: 'none',
                        color: '#1e293b',
                        borderBottom: '2.5px solid #f59e0b',
                    }}
                >
                    💵 Thu ngân
                </button>
            </div>

            <div style={{ flex: 1, padding: '24px 28px', overflowY: 'auto', background: '#f8fafc' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                    <div>
                        <div style={{ fontSize: 13, color: '#64748b', marginBottom: 4 }}>{data.rows.length} thu ngân</div>
                        <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.6, maxWidth: 780 }}>
                            Mỗi thu ngân có danh sách dòng theo tuổi vàng. Bạn có thể thêm bằng nút <b>+</b>, sửa trực tiếp trên dòng, xóa bằng <b>X</b> và hệ thống tự lưu nháp trước khi chốt.
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                        <div style={{ minWidth: 180 }}>
                            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 5 }}>Ngày làm việc</label>
                            <input type="date" value={ngay} onChange={e => setNgay(e.target.value)} style={inputBase} />
                        </div>
                        <button
                            type="button"
                            onClick={handleResetAll}
                            disabled={resettingAll}
                            style={{ ...actionBtn('#dc2626'), minWidth: 140, opacity: resettingAll ? 0.7 : 1 }}
                        >
                            {resettingAll ? 'Đang reset...' : 'Reset all về 0'}
                        </button>
                    </div>
                </div>

                {notice && (
                    <div style={{ marginBottom: 16, padding: '11px 14px', borderRadius: 12, border: '1px solid #dbeafe', background: '#eff6ff', color: '#1d4ed8', fontSize: 12, lineHeight: 1.6 }}>
                        {notice}
                    </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 18 }}>
                    <div style={metricCardStyle}>
                        <div style={{ fontSize: 11, color: '#64748b', fontWeight: 800, marginBottom: 6 }}>SỐ THU NGÂN</div>
                        <div style={{ fontSize: 28, fontWeight: 900, color: '#0f172a' }}>{summary.soThuNgan}</div>
                    </div>
                    <div style={metricCardStyle}>
                        <div style={{ fontSize: 11, color: '#64748b', fontWeight: 800, marginBottom: 6 }}>TỔNG TỒN ĐẦU KỲ</div>
                        <div style={{ fontSize: 28, fontWeight: 900, color: '#0f766e' }}>{fmt(summary.dauKy)} ₫</div>
                    </div>
                    <div style={metricCardStyle}>
                        <div style={{ fontSize: 11, color: '#64748b', fontWeight: 800, marginBottom: 6 }}>TỔNG SỐ DƯ HIỆN TẠI</div>
                        <div style={{ fontSize: 28, fontWeight: 900, color: '#1d4ed8' }}>{fmt(summary.hienTai)} ₫</div>
                    </div>
                    <div style={metricCardStyle}>
                        <div style={{ fontSize: 11, color: '#64748b', fontWeight: 800, marginBottom: 6 }}>TỔNG LỆCH</div>
                        <div style={{ fontSize: 28, fontWeight: 900, color: summary.chenhLech >= 0 ? '#16a34a' : '#dc2626' }}>
                            {summary.chenhLech >= 0 ? '+' : ''}{fmt(summary.chenhLech)} ₫
                        </div>
                        <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 6 }}>{summary.soDong} dòng chi tiết</div>
                    </div>
                </div>

                {loading ? (
                    <div style={{ ...panelStyle, padding: 32, textAlign: 'center', color: '#94a3b8' }}>Đang tải dữ liệu thu ngân...</div>
                ) : data.rows.length === 0 ? (
                    <div style={{ ...panelStyle, padding: 40, textAlign: 'center', color: '#94a3b8' }}>
                        Chưa có thu ngân nào. Hãy tạo thu ngân trong phần Cài đặt trước.
                    </div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', gap: 14, marginBottom: 18 }}>
                        {data.rows.map(row => {
                            const fallbackForm = buildFormMap([row])[row.thu_ngan_id] || { ghi_chu: row.ghi_chu || '', chi_tiet: [] };
                            const form = formMap[row.thu_ngan_id] || fallbackForm;
                            const totals = totalsFromForm(form, row);
                            const isSaving = !!savingMap[row.thu_ngan_id];
                            const draftState = statusMeta[draftStatusMap[row.thu_ngan_id] || 'idle'];

                            return (
                                <div key={row.thu_ngan_id} style={panelStyle}>
                                    <div style={{ background: 'linear-gradient(135deg,#0f766e,#0f172a)', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                                        <div>
                                            <div style={{ color: 'white', fontWeight: 900, fontSize: 18 }}>{row.ten_thu_ngan}</div>
                                            <div style={{ color: 'rgba(255,255,255,.85)', fontSize: 11, marginTop: 2 }}>
                                                {row.nguoi_quan_ly || 'Chưa gán nhân sự'}
                                            </div>
                                            <div style={{ marginTop: 6, display: 'inline-block', background: 'rgba(255,255,255,.16)', borderRadius: 999, padding: '3px 8px', fontSize: 10, color: 'white' }}>
                                                🏪 {row.ten_kho || 'Chưa gán kho'}
                                            </div>
                                        </div>
                                        <div style={{ minWidth: 110, textAlign: 'right' }}>
                                            <div style={{ fontSize: 10, color: 'rgba(255,255,255,.72)', marginBottom: 4 }}>Cập nhật</div>
                                            <div style={{ fontSize: 11, color: 'white', fontWeight: 700 }}>
                                                {row.cap_nhat_luc || 'Chưa chốt'}
                                            </div>
                                        </div>
                                    </div>

                                    <div style={{ padding: '12px 16px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                                {(row.quays || []).length > 0 ? row.quays.map(quay => (
                                                    <span key={quay.id} style={{ fontSize: 10, color: '#0f766e', background: '#ccfbf1', borderRadius: 999, padding: '4px 8px', fontWeight: 700 }}>
                                                        {quay.ten_quay}
                                                    </span>
                                                )) : <span style={{ fontSize: 10, color: '#94a3b8' }}>Chưa có quầy nhỏ</span>}
                                            </div>
                                            {draftState && (
                                                <span style={{ fontSize: 10, fontWeight: 800, color: draftState.color, background: draftState.bg, borderRadius: 999, padding: '4px 8px' }}>
                                                    {draftState.label}
                                                </span>
                                            )}
                                        </div>

                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, marginBottom: 12 }}>
                                            <div style={{ background: '#f0fdf4', borderRadius: 10, padding: '10px 12px', border: '1px solid #bbf7d0' }}>
                                                <div style={{ fontSize: 10, fontWeight: 700, color: '#16a34a', marginBottom: 4 }}>TỒN ĐẦU KỲ</div>
                                                <div style={cashierAmountStyle('#15803d')}>{fmt(totals.dauKy)} ₫</div>
                                            </div>
                                            <div style={{ background: '#eff6ff', borderRadius: 10, padding: '10px 12px', border: '1px solid #bfdbfe' }}>
                                                <div style={{ fontSize: 10, fontWeight: 700, color: '#1d4ed8', marginBottom: 4 }}>SỐ DƯ HIỆN TẠI</div>
                                                <div style={cashierAmountStyle('#1d4ed8')}>{fmt(totals.hienTai)} ₫</div>
                                            </div>
                                            <div style={{ background: totals.chenhLech >= 0 ? '#f0fdf4' : '#fff1f2', borderRadius: 10, padding: '10px 12px', border: `1px solid ${totals.chenhLech >= 0 ? '#bbf7d0' : '#fecdd3'}` }}>
                                                <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', marginBottom: 4 }}>GIÁ TRỊ LỆCH</div>
                                                <div style={cashierAmountStyle(totals.chenhLech >= 0 ? '#16a34a' : '#dc2626')}>
                                                    {totals.chenhLech >= 0 ? '+' : ''}{fmt(totals.chenhLech)} ₫
                                                </div>
                                            </div>
                                        </div>

                                        <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden', marginBottom: 14 }}>
                                            <div style={{ padding: '10px 12px', borderBottom: '1px solid #eef2f7', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                                                <div>
                                                    <div style={{ fontSize: 12, fontWeight: 800, color: '#1e293b' }}>Chi tiết theo tuổi vàng</div>
                                                    <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>Thêm dòng bằng nút +, sửa trực tiếp và xóa ở cuối dòng</div>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => handleAddDetailRow(row.thu_ngan_id)}
                                                    style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid #bfdbfe', background: '#eff6ff', color: '#1d4ed8', fontWeight: 900, fontSize: 18, cursor: 'pointer', lineHeight: 1 }}
                                                    aria-label="Thêm dòng"
                                                    title="Thêm dòng"
                                                >
                                                    +
                                                </button>
                                            </div>

                                            {form.chi_tiet.length === 0 ? (
                                                <div style={{ padding: 18, textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>
                                                    Chưa có dòng nào. Bấm <b>+</b> để thêm dòng cho thu ngân này.
                                                </div>
                                            ) : (
                                                <div style={{ overflowX: 'auto', padding: 12 }}>
                                                    <div style={{ ...detailGridStyle, marginBottom: 8, color: '#64748b', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.3 }}>
                                                        <div>Tuổi vàng</div>
                                                        <div>Tồn đầu kỳ</div>
                                                        <div>Số dư hiện tại</div>
                                                        <div>Giá trị lệch</div>
                                                        <div />
                                                    </div>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                                        {form.chi_tiet.map(detail => (
                                                            <div key={detail.row_id} style={detailGridStyle}>
                                                                <select
                                                                    value={detail.tuoi_vang}
                                                                    onChange={e => handleDetailFieldChange(row.thu_ngan_id, detail.row_id, 'tuoi_vang', e.target.value)}
                                                                    style={{ ...inputBase, cursor: 'pointer' }}
                                                                >
                                                                    <option value="">-- Chọn tuổi vàng --</option>
                                                                    {tuoiVangOptions.map(option => (
                                                                        <option key={option.id || option.ten_tuoi} value={option.ten_tuoi}>
                                                                            {option.ten_tuoi}
                                                                        </option>
                                                                    ))}
                                                                </select>
                                                                <input
                                                                    type="number"
                                                                    step="1"
                                                                    value={detail.ton_dau_ky}
                                                                    onChange={e => handleDetailFieldChange(row.thu_ngan_id, detail.row_id, 'ton_dau_ky', e.target.value)}
                                                                    style={inputBase}
                                                                    placeholder="0"
                                                                />
                                                                <input
                                                                    type="number"
                                                                    step="1"
                                                                    value={detail.so_du_hien_tai}
                                                                    onChange={e => handleDetailFieldChange(row.thu_ngan_id, detail.row_id, 'so_du_hien_tai', e.target.value)}
                                                                    style={inputBase}
                                                                    placeholder="0"
                                                                />
                                                                <input
                                                                    type="number"
                                                                    step="1"
                                                                    value={detail.gia_tri_lech}
                                                                    onChange={e => handleDetailFieldChange(row.thu_ngan_id, detail.row_id, 'gia_tri_lech', e.target.value)}
                                                                    style={inputBase}
                                                                    placeholder={formatMoneyInput(toNumber(detail.so_du_hien_tai) - toNumber(detail.ton_dau_ky))}
                                                                />
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleRemoveDetailRow(row.thu_ngan_id, detail.row_id)}
                                                                    style={{ width: 34, height: 34, borderRadius: 10, border: '1px solid #fecdd3', background: '#fff1f2', color: '#dc2626', fontSize: 15, fontWeight: 900, cursor: 'pointer' }}
                                                                    aria-label="Xóa dòng"
                                                                    title="Xóa dòng"
                                                                >
                                                                    ×
                                                                </button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        <div style={{ marginBottom: 12 }}>
                                            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 5 }}>Ghi chú lần chốt</label>
                                            <textarea
                                                value={form.ghi_chu}
                                                onChange={e => handleNoteChange(row.thu_ngan_id, e.target.value)}
                                                style={textareaStyle}
                                                placeholder="Ghi chú chốt ca..."
                                            />
                                        </div>

                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                            <div style={{ fontSize: 11, color: '#94a3b8' }}>{form.chi_tiet.length} dòng chi tiết</div>
                                            <button
                                                type="button"
                                                onClick={() => handleChot(row)}
                                                disabled={isSaving}
                                                style={{ ...actionBtn('#0f172a'), minWidth: 124, opacity: isSaving ? 0.7 : 1 }}
                                            >
                                                {isSaving ? 'Đang chốt...' : 'Chốt số tiền'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                <div style={panelStyle}>
                    <div style={{ padding: '16px 18px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                        <div>
                            <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>Lịch sử chốt số tiền</div>
                            <div style={{ fontSize: 12, color: '#64748b', marginTop: 3 }}>Gộp toàn bộ các lần chốt của thu ngân trong ngày {ngay}</div>
                        </div>
                        <div style={{ fontSize: 12, color: '#64748b', fontWeight: 700 }}>{data.history.length} lần chốt</div>
                    </div>

                    {loading ? (
                        <div style={{ padding: 30, textAlign: 'center', color: '#94a3b8' }}>Đang tải lịch sử...</div>
                    ) : data.history.length === 0 ? (
                        <div style={{ padding: 30, textAlign: 'center', color: '#94a3b8' }}>Chưa có lịch sử chốt số tiền.</div>
                    ) : (
                        <div style={{ padding: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
                            {data.history.map((item, index) => {
                                const deleteKey = item.entry_id || `${item.thu_ngan_id}-${item.thoi_gian}-${item.so_tien}`;
                                const isDeleting = historyDeletingKey === deleteKey;
                                return (
                                    <div key={`${deleteKey}-${index}`} style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: '12px 14px', background: index % 2 === 0 ? 'white' : '#fafafa' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                                            <div>
                                                <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>{item.ten_thu_ngan}</div>
                                                <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>{item.ten_kho || '—'}</div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => handleDeleteHistory(item)}
                                                disabled={isDeleting}
                                                title="Xóa lịch sử này"
                                                aria-label="Xóa lịch sử này"
                                                style={{ width: 34, height: 34, borderRadius: 10, border: '1px solid #fecdd3', background: '#fff1f2', color: '#b91c1c', fontSize: 15, fontWeight: 800, cursor: isDeleting ? 'default' : 'pointer', opacity: isDeleting ? 0.7 : 1 }}
                                            >
                                                {isDeleting ? '…' : '🗑'}
                                            </button>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
                                            <div style={{ background: '#f8fafc', borderRadius: 10, padding: '8px 10px' }}>
                                                <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', marginBottom: 3 }}>TỒN ĐẦU KỲ</div>
                                                <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>{fmt(item.so_tien_dau_ngay)} ₫</div>
                                            </div>
                                            <div style={{ background: '#eff6ff', borderRadius: 10, padding: '8px 10px' }}>
                                                <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', marginBottom: 3 }}>SỐ DƯ HIỆN TẠI</div>
                                                <div style={{ fontSize: 14, fontWeight: 800, color: '#1d4ed8' }}>{fmt(item.so_tien)} ₫</div>
                                            </div>
                                        </div>
                                        <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                            <div style={{ fontSize: 11, color: (item.so_tien_chenh_lech || 0) >= 0 ? '#16a34a' : '#dc2626', fontWeight: 800 }}>
                                                Lệch: {(item.so_tien_chenh_lech || 0) >= 0 ? '+' : ''}{fmt(item.so_tien_chenh_lech || 0)} ₫
                                            </div>
                                            <div style={{ fontSize: 10, color: '#94a3b8' }}>{item.so_dong_chi_tiet || 0} dòng</div>
                                        </div>
                                        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 10 }}>🕒 {item.thoi_gian}</div>
                                        <div style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}>{item.ghi_chu || '—'}</div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

