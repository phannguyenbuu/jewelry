import { API_BASE } from '../lib/api';

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
    gridTemplateColumns: 'minmax(122px, 0.8fr) repeat(3, minmax(116px, 1fr)) 76px',
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

const TIEN_MAT_TUOI = 'Tiền mặt';

// Tạo 1 row Tiền mặt mới hoặc kế thừa từ dữ liệu có sẵn
const tienMatDetailRow = (existing) => ({
    row_id: existing?.row_id || `tien_mat_fixed`,
    tuoi_vang: TIEN_MAT_TUOI,
    ton_dau_ky: formatMoneyInput(existing?.ton_dau_ky ?? 0),
    so_du_hien_tai: formatMoneyInput(existing?.so_du_hien_tai ?? 0),
    gia_tri_lech: formatMoneyInput(existing?.gia_tri_lech ?? 0),
});

// Đảm bảo chi_tiet luôn có row Tiền mặt ở đầu, các row khác giữ nguyên
const ensureTienMatRow = (chi_tiet) => {
    const tienMatIdx = (chi_tiet || []).findIndex((r) => r.tuoi_vang === TIEN_MAT_TUOI);
    const tienMatRow = tienMatDetailRow(tienMatIdx >= 0 ? chi_tiet[tienMatIdx] : null);
    const rest = (chi_tiet || []).filter((r) => r.tuoi_vang !== TIEN_MAT_TUOI);
    return [tienMatRow, ...rest];
};

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
            chi_tiet: ensureTienMatRow(
                Array.isArray(row.chi_tiet) ? row.chi_tiet.map(toFormDetailRow) : []
            ),
        },
    ]),
);

const lineDiff = line => (
    line.gia_tri_lech !== ''
        ? toNumber(line.gia_tri_lech)
        : (toNumber(line.so_du_hien_tai) - toNumber(line.ton_dau_ky))
);

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

export {
    API,
    TIEN_MAT_TUOI,
    actionBtn,
    buildFormMap,
    buildPayload,
    cashierAmountStyle,
    detailGridStyle,
    emptyDetailRow,
    ensureTienMatRow,
    fmt,
    formatMoneyInput,
    inputBase,
    metricCardStyle,
    panelStyle,
    sameMoney,
    serverEchoesDetailRows,
    statusMeta,
    textareaStyle,
    toNumber,
    today,
    totalsFromForm,
};

