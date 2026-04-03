import { useEffect, useMemo, useRef, useState } from 'react';
import { fmtCalc } from '../sale/shared';
import { API_BASE } from '../lib/api';

const PAGE_SIZE_OPTIONS = [50, 100, 200];
const POLL_INTERVAL_MS = 60 * 1000;
const RETRYABLE_STATUS_CODES = new Set([500, 502, 503, 504]);

function todayStr() {
    const d = new Date();
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
}

function Spinner({ size = 24 }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ animation: 'spin 1s linear infinite' }}>
            <circle cx="12" cy="12" r="10" stroke="#94a3b8" strokeWidth="3" strokeDasharray="31.4 31.4" strokeLinecap="round" />
            <style>{'@keyframes spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}'}</style>
        </svg>
    );
}

function normalizeAmountText(value) {
    return String(value || '').replace(/[^0-9]/g, '');
}

function getInvoiceNo(item) {
    return item.InvoiceNo || item.invoice_no || item.No || item.InvNo || '-';
}

function getInvoiceDate(item) {
    return item.ArisingDate || item.PublishDate || item.InvDate || item.date || '-';
}

function getInvoiceDateTimeSource(item) {
    return item.ModifiedDate
        || item.IssueDate
        || item.ArisingDate
        || item.PublishDate
        || item.InvDate
        || item.date
        || '-';
}

function parseInvoiceDate(value) {
    const raw = String(value || '').trim();
    if (!raw || raw === '-') return null;

    const normalized = raw.replace('T', ' ').replace(/\.\d+$/, '');
    let match = normalized.match(/^(\d{2})\/(\d{2})\/(\d{4})(?: (\d{2}):(\d{2})(?::(\d{2}))?)?$/);
    if (match) {
        const [, day, month, year, hour = '00', minute = '00', second = '00'] = match;
        return new Date(
            Number(year),
            Number(month) - 1,
            Number(day),
            Number(hour),
            Number(minute),
            Number(second),
        );
    }

    match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2})(?::(\d{2}))?)?$/);
    if (match) {
        const [, year, month, day, hour = '00', minute = '00', second = '00'] = match;
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
}

function formatInvoiceDateTime(value) {
    const date = parseInvoiceDate(value);
    if (!date) return { dateText: String(value || '-').trim() || '-', timeText: '' };
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yyyy = date.getFullYear();
    const hh = String(date.getHours()).padStart(2, '0');
    const mi = String(date.getMinutes()).padStart(2, '0');
    const ss = String(date.getSeconds()).padStart(2, '0');
    return {
        dateText: `${dd}/${mm}/${yyyy}`,
        timeText: `${hh}:${mi}:${ss}`,
    };
}

function getLookupCode(item) {
    return item.LookupCode || item.Code || item.Ikey || '-';
}

function getBuyer(item) {
    return item.Buyer || item.CusName || item.CustomerName || item.customer_name || '-';
}

function getAmount(item) {
    return Number(item.Amount || item.TotalAmount || item.Total || item.amount || 0);
}

function formatDuration(seconds) {
    const value = Number(seconds || 0);
    if (!Number.isFinite(value) || value <= 0) return '0 giây';
    if (value < 1) return `${Math.round(value * 1000)} ms`;
    return `${value.toFixed(value >= 10 ? 1 : 2)} giây`;
}

function formatPollInterval(seconds) {
    const value = Number(seconds || 60);
    if (!Number.isFinite(value) || value <= 0) return '1 phút / lần';
    if (value % 60 === 0) {
        const minutes = value / 60;
        return `${minutes} phút / lần`;
    }
    return `${value} giây / lần`;
}

function syncStatusMeta(syncInfo) {
    if (syncInfo?.is_running) return { label: 'Đang đồng bộ', bg: '#fef3c7', color: '#92400e' };
    if (syncInfo?.polling_enabled === false) return { label: 'Tạm dừng polling', bg: '#fef3c7', color: '#b45309' };
    if (syncInfo?.last_status === 'success') return { label: 'Đã đồng bộ', bg: '#dcfce7', color: '#166534' };
    if (syncInfo?.last_status === 'error') return { label: 'Lỗi đồng bộ', bg: '#fee2e2', color: '#b91c1c' };
    return { label: 'Chưa đồng bộ', bg: '#e2e8f0', color: '#475569' };
}

async function readJsonOrError(response) {
    const text = (await response.text()).trim();
    if (!text) {
        return { ok: response.ok, payload: null, message: `Tải dữ liệu thất bại (HTTP ${response.status})` };
    }
    try {
        const payload = JSON.parse(text);
        return {
            ok: response.ok,
            payload,
            message: payload?.error || payload?.message || text,
        };
    } catch {
        const message = text.startsWith('<!DOCTYPE') || text.startsWith('<html')
            ? `Tải dữ liệu thất bại (HTTP ${response.status})`
            : text;
        return { ok: response.ok, payload: null, message };
    }
}

function delay(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function fetchJsonWithRetry(url, options = {}, { retries = 2, backoffMs = 500 } = {}) {
    let lastResult = null;
    let lastError = null;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
        try {
            const response = await fetch(url, options);
            const result = await readJsonOrError(response);
            lastResult = result;

            if (result.ok || !RETRYABLE_STATUS_CODES.has(response.status) || attempt >= retries) {
                return result;
            }
        } catch (error) {
            lastError = error;
            if (attempt >= retries) break;
        }

        await delay(backoffMs * (attempt + 1));
    }

    if (lastResult) return lastResult;
    throw lastError || new Error('Không tải được dữ liệu.');
}

export default function HoaDonTab() {
    const [inputFromDate, setInputFromDate] = useState('01/01/2026');
    const [inputToDate, setInputToDate] = useState(todayStr());
    const [fromDate, setFromDate] = useState('01/01/2026');
    const [toDate, setToDate] = useState(todayStr());
    const [searchText, setSearchText] = useState('');
    const [minAmount, setMinAmount] = useState('');
    const [maxAmount, setMaxAmount] = useState('');
    const [rows, setRows] = useState([]);
    const [totalRecords, setTotalRecords] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(100);
    const [reloadNonce, setReloadNonce] = useState(0);
    const [syncInfo, setSyncInfo] = useState(null);
    const [syncLogs, setSyncLogs] = useState([]);
    const [pollingActionLoading, setPollingActionLoading] = useState(false);
    const [summary, setSummary] = useState({
        invoiceCount: 0,
        customerCount: 0,
        totalAmount: 0,
    });

    const latestParamsRef = useRef(null);
    const requestIdRef = useRef(0);

    latestParamsRef.current = {
        fromDate,
        toDate,
        searchText,
        minAmount,
        maxAmount,
        page,
        pageSize,
    };

    const totalPages = pageSize === 0 ? 1 : Math.max(1, Math.ceil(totalRecords / pageSize));
    const pollIntervalLabel = formatPollInterval(syncInfo?.poll_interval_seconds || 60);
    const isPollingEnabled = syncInfo?.polling_enabled !== false;
    const visibleSyncLogs = syncLogs.slice(0, 3);

    useEffect(() => {
        if (page > totalPages) setPage(totalPages);
    }, [page, totalPages]);

    const fetchStatus = async () => {
        try {
            const { ok, payload, message } = await fetchJsonWithRetry(`${API_BASE}/api/easyinvoice/cache-status`);
            if (!ok) throw new Error(message);
            if (payload?.sync) setSyncInfo(payload.sync);
            if (Array.isArray(payload?.logs)) setSyncLogs(payload.logs);
        } catch {
        }
    };

    const fetchData = async ({ silent = false, params = null } = {}) => {
        const activeParams = params || latestParamsRef.current;
        const currentRequestId = requestIdRef.current + 1;
        requestIdRef.current = currentRequestId;

        if (!silent) {
            setLoading(true);
            setError(null);
        }

        try {
            const query = new URLSearchParams();
            query.set('FromDate', activeParams.fromDate);
            query.set('ToDate', activeParams.toDate);
            if (activeParams.searchText) query.set('Keyword', activeParams.searchText);
            if (activeParams.minAmount) query.set('MinAmount', normalizeAmountText(activeParams.minAmount));
            if (activeParams.maxAmount) query.set('MaxAmount', normalizeAmountText(activeParams.maxAmount));
            query.set('start', activeParams.pageSize === 0 ? '0' : String((activeParams.page - 1) * activeParams.pageSize));
            query.set('length', String(activeParams.pageSize));

            const { ok, payload, message } = await fetchJsonWithRetry(`${API_BASE}/api/easyinvoice/list?${query.toString()}`);
            if (!ok) throw new Error(message);

            if (currentRequestId !== requestIdRef.current) return;

            const list = Array.isArray(payload?.Data?.Invoices)
                ? payload.Data.Invoices
                : Array.isArray(payload?.Rows)
                    ? payload.Rows
                    : Array.isArray(payload?.data)
                        ? payload.data
                        : [];

            setRows(list);
            setTotalRecords(Number(payload?.TotalRecords || payload?.Data?.TotalRecords || list.length || 0));
            setSummary({
                invoiceCount: Number(payload?.stats?.invoice_count || payload?.Data?.Stats?.InvoiceCount || payload?.TotalRecords || 0),
                customerCount: Number(payload?.stats?.customer_count || payload?.Data?.Stats?.CustomerCount || 0),
                totalAmount: Number(payload?.stats?.total_amount || payload?.Data?.Stats?.TotalAmount || 0),
            });
            if (payload?.sync) setSyncInfo(payload.sync);
            if (Array.isArray(payload?.logs)) setSyncLogs(payload.logs);
            setError(null);
        } catch (err) {
            if (currentRequestId !== requestIdRef.current) return;
            setError(err.message || 'Không tải được dữ liệu hóa đơn.');
        } finally {
            if (!silent && currentRequestId === requestIdRef.current) {
                setLoading(false);
            }
        }
    };

    useEffect(() => {
        const handle = window.setTimeout(() => {
            fetchData({ silent: false });
            fetchStatus();
        }, 200);
        return () => window.clearTimeout(handle);
    }, [fromDate, toDate, searchText, minAmount, maxAmount, page, pageSize, reloadNonce]);

    useEffect(() => {
        const intervalId = window.setInterval(() => {
            fetchData({ silent: true });
            fetchStatus();
        }, POLL_INTERVAL_MS);
        return () => window.clearInterval(intervalId);
    }, []);

    const handleAmountChange = (setter) => (e) => {
        const value = normalizeAmountText(e.target.value);
        setter(value ? fmtCalc(value) : '');
        setPage(1);
    };

    const handleApplyRange = () => {
        setPage(1);
        setFromDate(inputFromDate);
        setToDate(inputToDate);
        setReloadNonce((current) => current + 1);
    };

    const handleTogglePolling = async () => {
        const nextEnabled = !isPollingEnabled;
        setPollingActionLoading(true);
        try {
            const { ok, payload, message } = await fetchJsonWithRetry(`${API_BASE}/api/easyinvoice/cache-polling`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled: nextEnabled }),
            });
            if (!ok) throw new Error(message);
            if (payload?.sync) setSyncInfo(payload.sync);
            if (Array.isArray(payload?.logs)) setSyncLogs(payload.logs);

            if (nextEnabled) {
                window.setTimeout(() => {
                    fetchData({ silent: true });
                    fetchStatus();
                }, 1500);
            }
        } catch (err) {
            setError(err.message || 'Không cập nhật được trạng thái polling.');
        } finally {
            setPollingActionLoading(false);
        }
    };

    const handlePageButton = (key, label, onClick, active = false, disabled = false) => (
        <button
            key={key}
            type="button"
            onClick={onClick}
            disabled={disabled}
            style={{
                width: 32,
                height: 32,
                borderRadius: 6,
                border: active ? 'none' : '1.5px solid #cbd5e1',
                background: active ? '#1e293b' : disabled ? '#f8fafc' : 'white',
                color: active ? 'white' : disabled ? '#cbd5e1' : '#334155',
                fontWeight: active ? 800 : 600,
                fontSize: 13,
                cursor: disabled ? 'default' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
            }}
        >
            {label}
        </button>
    );

    const paginationButtons = useMemo(() => {
        if (pageSize === 0 || totalPages <= 1) return [];

        const ellipsis = (key) => (
            <span
                key={key}
                style={{
                    width: 32,
                    textAlign: 'center',
                    color: '#94a3b8',
                    fontWeight: 700,
                    fontSize: 14,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}
            >
                ...
            </span>
        );

        const buttons = [];
        buttons.push(handlePageButton('prev', '←', () => setPage((current) => Math.max(1, current - 1)), false, page === 1));

        if (totalPages <= 7) {
            for (let i = 1; i <= totalPages; i += 1) {
                buttons.push(handlePageButton(i, i, () => setPage(i), i === page, false));
            }
        } else {
            buttons.push(handlePageButton(1, 1, () => setPage(1), page === 1, false));
            if (page > 3) buttons.push(ellipsis('e1'));
            const lo = Math.max(2, page - 1);
            const hi = Math.min(totalPages - 1, page + 1);
            for (let i = lo; i <= hi; i += 1) {
                buttons.push(handlePageButton(i, i, () => setPage(i), i === page, false));
            }
            if (page < totalPages - 2) buttons.push(ellipsis('e2'));
            buttons.push(handlePageButton(totalPages, totalPages, () => setPage(totalPages), page === totalPages, false));
        }

        buttons.push(handlePageButton('next', '→', () => setPage((current) => Math.min(totalPages, current + 1)), false, page >= totalPages));
        return buttons;
    }, [page, pageSize, totalPages]);

    const statusMeta = syncStatusMeta(syncInfo);

    return (
        <div>
            <div style={{ background: 'white', padding: '14px 16px', borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 1px 6px rgba(0,0,0,.04)', marginBottom: 14 }}>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <label style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>Từ ngày</label>
                        <input
                            type="text"
                            value={inputFromDate}
                            onChange={(e) => setInputFromDate(e.target.value)}
                            placeholder="DD/MM/YYYY"
                            style={{ padding: '8px 12px', border: '1.5px solid #cbd5e1', borderRadius: 10, width: 120, outline: 'none', fontSize: 13 }}
                        />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <label style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>Đến ngày</label>
                        <input
                            type="text"
                            value={inputToDate}
                            onChange={(e) => setInputToDate(e.target.value)}
                            placeholder="DD/MM/YYYY"
                            style={{ padding: '8px 12px', border: '1.5px solid #cbd5e1', borderRadius: 10, width: 120, outline: 'none', fontSize: 13 }}
                        />
                    </div>

                    <button
                        type="button"
                        onClick={handleApplyRange}
                        disabled={loading}
                        style={{
                            padding: '8px 16px',
                            background: loading ? '#94a3b8' : '#2563eb',
                            color: 'white',
                            border: 'none',
                            borderRadius: 10,
                            fontWeight: 700,
                            cursor: loading ? 'wait' : 'pointer',
                            fontSize: 13,
                            height: 38,
                        }}
                    >
                        {loading ? 'Đang tải...' : 'Tải Dữ Liệu'}
                    </button>

                    <div style={{ width: 1, alignSelf: 'stretch', background: '#e2e8f0', margin: '0 4px' }} />

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <label style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>Tìm kiếm</label>
                        <input
                            type="text"
                            value={searchText}
                            onChange={(e) => {
                                setSearchText(e.target.value);
                                setPage(1);
                            }}
                            placeholder="Tên, mã số..."
                            style={{ padding: '8px 12px', border: '1.5px solid #cbd5e1', borderRadius: 10, width: 220, outline: 'none', fontSize: 13 }}
                        />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <label style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>Tiền (Min)</label>
                        <input
                            type="text"
                            value={minAmount}
                            onChange={handleAmountChange(setMinAmount)}
                            placeholder="VNĐ"
                            style={{ padding: '8px 12px', border: '1.5px solid #cbd5e1', borderRadius: 10, width: 120, outline: 'none', fontSize: 13, textAlign: 'right' }}
                        />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <label style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>Tiền (Max)</label>
                        <input
                            type="text"
                            value={maxAmount}
                            onChange={handleAmountChange(setMaxAmount)}
                            placeholder="VNĐ"
                            style={{ padding: '8px 12px', border: '1.5px solid #cbd5e1', borderRadius: 10, width: 120, outline: 'none', fontSize: 13, textAlign: 'right' }}
                        />
                    </div>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1.1fr) minmax(300px, 1fr)', gap: 14, marginBottom: 14 }}>
                <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 1px 6px rgba(0,0,0,.04)', padding: '14px 16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                        <div>
                            <div style={{ fontSize: 12, fontWeight: 800, color: '#475569', letterSpacing: 0.4 }}>ĐỒNG BỘ EASYINVOICE</div>
                            <div style={{ marginTop: 4, fontSize: 22, fontWeight: 900, color: '#1e293b' }}>Polling {pollIntervalLabel}</div>
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                            <span style={{ padding: '4px 10px', borderRadius: 999, fontSize: 12, fontWeight: 800, background: statusMeta.bg, color: statusMeta.color }}>
                                {statusMeta.label}
                            </span>
                            <button
                                type="button"
                                onClick={handleTogglePolling}
                                disabled={pollingActionLoading}
                                style={{
                                    padding: '6px 12px',
                                    borderRadius: 999,
                                    border: 'none',
                                    background: isPollingEnabled ? '#f59e0b' : '#16a34a',
                                    color: 'white',
                                    fontSize: 12,
                                    fontWeight: 800,
                                    cursor: pollingActionLoading ? 'wait' : 'pointer',
                                }}
                            >
                                {pollingActionLoading ? 'Đang cập nhật...' : (isPollingEnabled ? 'Pause Polling' : 'Start Polling')}
                            </button>
                        </div>
                    </div>

                    <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
                        <div style={{ padding: '10px 12px', borderRadius: 10, background: '#eff6ff', border: '1px solid #bfdbfe' }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#1d4ed8' }}>Theo bộ lọc hiện tại</div>
                            <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                <span style={{ display: 'inline-flex', alignItems: 'center', padding: '4px 10px', borderRadius: 999, background: '#dbeafe', color: '#1d4ed8', fontSize: 12, fontWeight: 800 }}>
                                    {summary.invoiceCount} hóa đơn
                                </span>
                                <span style={{ display: 'inline-flex', alignItems: 'center', padding: '4px 10px', borderRadius: 999, background: '#dcfce7', color: '#166534', fontSize: 12, fontWeight: 800 }}>
                                    {summary.customerCount} khách hàng
                                </span>
                                <span style={{ display: 'inline-flex', alignItems: 'center', padding: '4px 10px', borderRadius: 999, background: '#ede9fe', color: '#6d28d9', fontSize: 12, fontWeight: 800 }}>
                                    {fmtCalc(summary.totalAmount)} VNĐ
                                </span>
                            </div>
                        </div>
                        <div style={{ padding: '10px 12px', borderRadius: 10, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Cache gần nhất</div>
                            <div style={{ marginTop: 4, fontSize: 16, fontWeight: 800, color: '#0f172a' }}>{syncInfo?.last_row_count || 0} hóa đơn</div>
                        </div>
                        <div style={{ padding: '10px 12px', borderRadius: 10, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Thời gian tải gần nhất</div>
                            <div style={{ marginTop: 4, fontSize: 16, fontWeight: 800, color: '#0f172a' }}>{formatDuration(syncInfo?.last_duration_seconds)}</div>
                        </div>
                    </div>

                    <div style={{ marginTop: 12, fontSize: 13, color: '#475569', lineHeight: 1.6 }}>
                        <div>Lần xong gần nhất: <b>{syncInfo?.last_finished_at || 'Chưa có'}</b></div>
                        <div>Dải cache: <b>{syncInfo?.sync_from_date || fromDate}</b> tới <b>{syncInfo?.sync_to_date || toDate}</b></div>
                        {syncInfo?.last_error ? (
                            <div style={{ color: '#dc2626' }}>Lỗi gần nhất: {syncInfo.last_error}</div>
                        ) : null}
                    </div>
                </div>

                <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 1px 6px rgba(0,0,0,.04)', padding: '14px 16px' }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: '#475569', letterSpacing: 0.4, marginBottom: 10 }}>NHẬT KÝ POLLING</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {visibleSyncLogs.length === 0 ? (
                            <div style={{ fontSize: 13, color: '#64748b' }}>Chưa có log đồng bộ.</div>
                        ) : (
                            visibleSyncLogs.map((log) => (
                                <div key={log.id} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid #e2e8f0', background: log.status === 'error' ? '#fff7f7' : '#f8fafc' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                                        <span style={{ fontSize: 12, fontWeight: 800, color: log.status === 'error' ? '#b91c1c' : '#166534' }}>
                                            {log.status === 'error' ? 'Lỗi' : 'Hoàn tất'} · {log.trigger_source || 'scheduler'}
                                        </span>
                                        <span style={{ fontSize: 12, color: '#64748b' }}>{log.finished_at || log.created_at || '-'}</span>
                                    </div>
                                    {log.status === 'error' ? (
                                        <div style={{ fontSize: 13, color: '#334155' }}>
                                            {log.error_text || 'Đồng bộ thất bại.'}
                                        </div>
                                    ) : (
                                        <>
                                            <div style={{ fontSize: 13, color: '#334155' }}>
                                                {`${log.row_count || 0} hóa đơn · ${formatDuration(log.duration_seconds)}`}
                                            </div>
                                            <div style={{ marginTop: 4, fontSize: 12, color: '#64748b' }}>
                                                {`So với lần trước: +${log.new_invoice_count || 0} hóa đơn mới · +${fmtCalc(log.new_total_amount || 0)} VNĐ`}
                                            </div>
                                        </>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 6px rgba(0,0,0,.04)' }}>
                {loading ? (
                    <div style={{ padding: 40, textAlign: 'center' }}>
                        <Spinner size={32} />
                        <div style={{ marginTop: 12, color: '#64748b' }}>Đang tải hóa đơn từ cache...</div>
                    </div>
                ) : error ? (
                    <div style={{ padding: 40, textAlign: 'center', color: '#ef4444' }}>
                        <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>Lỗi tải dữ liệu</div>
                        <div>{error}</div>
                    </div>
                ) : rows.length === 0 ? (
                    <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
                        {syncInfo?.is_running ? 'Cache đang đồng bộ, dữ liệu sẽ tự cập nhật sau ít phút.' : 'Không có hóa đơn phù hợp.'}
                    </div>
                ) : (
                    <>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 860 }}>
                                <thead>
                                    <tr style={{ background: '#1e293b', color: 'white' }}>
                                        <th style={{ padding: '10px 12px', fontWeight: 700, fontSize: 12, letterSpacing: 0.4, whiteSpace: 'nowrap', textAlign: 'left' }}>STT</th>
                                        <th style={{ padding: '10px 12px', fontWeight: 700, fontSize: 12, letterSpacing: 0.4, whiteSpace: 'nowrap', textAlign: 'left' }}>Số HĐ</th>
                                        <th style={{ padding: '10px 12px', fontWeight: 700, fontSize: 12, letterSpacing: 0.4, whiteSpace: 'nowrap', textAlign: 'left' }}>Ngày</th>
                                        <th style={{ padding: '10px 12px', fontWeight: 700, fontSize: 12, letterSpacing: 0.4, whiteSpace: 'nowrap', textAlign: 'left' }}>Mã tra cứu</th>
                                        <th style={{ padding: '10px 12px', fontWeight: 700, fontSize: 12, letterSpacing: 0.4, whiteSpace: 'nowrap', textAlign: 'left' }}>Người mua</th>
                                        <th style={{ padding: '10px 12px', fontWeight: 700, fontSize: 12, letterSpacing: 0.4, whiteSpace: 'nowrap', textAlign: 'right' }}>Tổng tiền (VNĐ)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((item, index) => {
                                        const rowIndex = (pageSize === 0 ? 0 : (page - 1) * pageSize) + index + 1;
                                        const baseBg = index % 2 === 0 ? 'white' : '#f8fafc';
                                        const invoiceNo = getInvoiceNo(item);
                                        const isUnsignedInvoice = String(invoiceNo).trim() === '0';
                                        const invoiceDate = formatInvoiceDateTime(getInvoiceDateTimeSource(item));
                                        return (
                                            <tr
                                                key={`${getLookupCode(item)}-${rowIndex}`}
                                                style={{ borderBottom: '1px solid #f1f5f9', background: baseBg, transition: 'background .1s' }}
                                                onMouseEnter={(e) => {
                                                    e.currentTarget.style.background = '#eff6ff';
                                                }}
                                                onMouseLeave={(e) => {
                                                    e.currentTarget.style.background = baseBg;
                                                }}
                                            >
                                                <td style={{ padding: '9px 12px', color: '#94a3b8', fontWeight: 600 }}>{rowIndex}</td>
                                                <td style={{ padding: '9px 12px', fontWeight: isUnsignedInvoice ? 500 : 800, color: isUnsignedInvoice ? '#dc2626' : '#1e293b', whiteSpace: 'nowrap' }}>
                                                    {isUnsignedInvoice ? 'Unsigned' : invoiceNo}
                                                </td>
                                                <td style={{ padding: '9px 12px', color: '#475569', whiteSpace: 'nowrap' }}>
                                                    <div>{invoiceDate.dateText}</div>
                                                    <div style={{ marginTop: 2, fontSize: 11, color: '#94a3b8' }}>{invoiceDate.timeText || '--:--:--'}</div>
                                                </td>
                                                <td style={{ padding: '9px 12px', fontFamily: 'monospace', color: '#2563eb', whiteSpace: 'nowrap' }}>{getLookupCode(item)}</td>
                                                <td style={{ padding: '9px 12px', color: '#334155', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={getBuyer(item)}>
                                                    {getBuyer(item)}
                                                </td>
                                                <td style={{ padding: '9px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                                    <span style={{ fontWeight: 700, color: '#0369a1' }}>{fmtCalc(getAmount(item))}</span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        <div style={{ padding: '10px 18px 14px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', background: '#f8fafc' }}>
                            <span style={{ fontSize: 13, color: '#64748b' }}>
                                Hiển thị <b>{rows.length}</b>/{totalRecords} hóa đơn
                            </span>

                            <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                <span style={{ fontSize: 13, color: '#64748b', marginRight: 6 }}>Hiển thị</span>
                                <select
                                    value={pageSize}
                                    onChange={(e) => {
                                        setPageSize(Number(e.target.value));
                                        setPage(1);
                                    }}
                                    style={{ padding: '5px 10px', borderRadius: 8, border: '1.5px solid #cbd5e1', outline: 'none', background: 'white', fontSize: 13, cursor: 'pointer', marginRight: 8 }}
                                >
                                    <option value={0}>Tất cả</option>
                                    {PAGE_SIZE_OPTIONS.map((option) => (
                                        <option key={option} value={option}>
                                            {option} / trang
                                        </option>
                                    ))}
                                </select>

                                {paginationButtons}
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
