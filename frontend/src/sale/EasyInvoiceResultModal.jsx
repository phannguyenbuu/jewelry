import { useEffect, useState } from 'react';
import { IoCloseOutline } from 'react-icons/io5';
import { API, S } from './shared';

const DETAIL_LABELS = [
    ['Trạng thái', 'status_text'],
    ['Ikey', 'ikey'],
    ['Số hóa đơn', 'invoice_no'],
    ['Mã tra cứu', 'lookup_code'],
    ['Khách hàng', 'buyer'],
    ['Thành tiền', 'amount_text'],
];

const buildApiUrl = (path = '') => {
    if (!path) return '';
    if (/^https?:\/\//i.test(path)) return path;
    return `${API}${path}`;
};

const buildSiteUrl = (path = '') => {
    if (!path) return '';
    if (/^https?:\/\//i.test(path)) return path;
    if (typeof window === 'undefined') return path;
    return `${window.location.origin}${path.startsWith('/') ? '' : '/'}${path}`;
};

const buildWebPayload = (result) => ({
    pattern: String(result?.pattern || result?.invoice?.Pattern || '').trim(),
    ikey: String(result?.ikey || '').trim(),
    invoice_no: String(result?.invoice_no || '').trim(),
    lookup_code: String(result?.lookup_code || '').trim(),
    buyer: String(result?.buyer || '').trim(),
    amount: Math.round(Number(result?.amount || 0)) || 0,
});

const buildDebugPayload = (result) => ({
    msg: result?.message || result?.msg || '',
    created: result?.created,
    record: result?.record || null,
    link_view: result?.link_view || '',
    pattern: result?.pattern || '',
    serial: result?.serial || '',
    ikey: result?.ikey || '',
    invoice_no: result?.invoice_no || '',
    lookup_code: result?.lookup_code || '',
    buyer: result?.buyer || '',
    amount: result?.amount ?? null,
    invoice_status: result?.invoice_status ?? null,
    status_text: result?.status_text || '',
    vat_bill: result?.vat_bill || null,
    vat_bill_url: result?.vat_bill_url || '',
    vat_bill_absolute_url: result?.vat_bill_absolute_url || '',
    vat_bill_error: result?.vat_bill_error || '',
    invoice: result?.invoice || null,
    state: result?.state || null,
    raw: result?.raw || null,
});

export default function EasyInvoiceResultModal({ open, result, loading = false, onClose }) {
    const [bootstrapping, setBootstrapping] = useState(false);
    const [submittingLogin, setSubmittingLogin] = useState(false);
    const [savingVatBill, setSavingVatBill] = useState(false);
    const [viewerUrl, setViewerUrl] = useState('');
    const [captchaUrl, setCaptchaUrl] = useState('');
    const [flowId, setFlowId] = useState('');
    const [captcha, setCaptcha] = useState('');
    const [authRequired, setAuthRequired] = useState(false);
    const [sessionInfo, setSessionInfo] = useState({ username: '', taxCode: '' });
    const [tenantUrl, setTenantUrl] = useState('');
    const [noticeText, setNoticeText] = useState('');
    const [errorText, setErrorText] = useState('');
    const [copyMessage, setCopyMessage] = useState('');
    const [vatBillLink, setVatBillLink] = useState('');
    const [vatBillStatus, setVatBillStatus] = useState('');
    const [debugExpanded, setDebugExpanded] = useState(false);

    const webPayload = buildWebPayload(result);
    const isCompact = typeof window !== 'undefined' ? window.innerWidth < 920 : false;
    const debugText = JSON.stringify(buildDebugPayload(result), null, 2);

    const extractVatBillLink = (payload) => (
        String(payload?.vat_bill_absolute_url || payload?.vat_bill?.absolute_url || '').trim()
        || buildSiteUrl(String(payload?.vat_bill_url || payload?.vat_bill?.url || '').trim())
    );

    const extractVatBillHtmlFromFrame = () => {
        try {
            const innerDoc = document.getElementById('easyinvoiceFrame')?.contentWindow?.document;
            if (!innerDoc) return '';
            for (const selector of ['#printView', '#container', '.VATTEMP', '.modal-body']) {
                const node = innerDoc.querySelector(selector);
                if (node?.outerHTML) {
                    return String(node.outerHTML);
                }
            }
            return '';
        } catch {
            return '';
        }
    };

    const applyBootstrapPayload = (payload) => {
        setViewerUrl(buildApiUrl(payload?.viewer_url || ''));
        setCaptchaUrl(buildApiUrl(payload?.captcha_url || ''));
        setFlowId(String(payload?.flow_id || '').trim());
        setAuthRequired(!payload?.authenticated);
        setSessionInfo({
            username: String(payload?.username || '').trim(),
            taxCode: String(payload?.tax_code || '').trim(),
        });
        setTenantUrl(buildApiUrl(payload?.tenant_url || ''));
        setNoticeText(String(payload?.notice || '').trim());
        setCaptcha('');
    };

    const bootstrapWebViewer = async () => {
        setBootstrapping(true);
        setErrorText('');
        try {
            const response = await fetch(buildApiUrl('/api/easyinvoice/web/bootstrap'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(webPayload),
            });
            const payload = await response.json().catch(() => ({}));
            applyBootstrapPayload(payload);
            if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
        } catch (error) {
            setViewerUrl('');
            setAuthRequired(false);
            setErrorText(error.message || 'Không chuẩn bị được EasyInvoice web viewer.');
        } finally {
            setBootstrapping(false);
        }
    };

    useEffect(() => {
        if (!open || !result) return undefined;
        let active = true;
        const runBootstrap = async () => {
            setViewerUrl('');
            setCaptchaUrl('');
            setFlowId('');
            setCaptcha('');
            setAuthRequired(false);
            setSessionInfo({ username: '', taxCode: '' });
            setTenantUrl('');
            setNoticeText('');
            setErrorText('');
            setCopyMessage('');
            setVatBillLink(extractVatBillLink(result));
            setVatBillStatus(String(result?.vat_bill_error || '').trim());
            setBootstrapping(true);
            try {
                const response = await fetch(buildApiUrl('/api/easyinvoice/web/bootstrap'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify(buildWebPayload(result)),
                });
                const payload = await response.json().catch(() => ({}));
                if (!active) return;
                applyBootstrapPayload(payload);
                if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
            } catch (error) {
                if (!active) return;
                setViewerUrl('');
                setAuthRequired(false);
                setErrorText(error.message || 'Không chuẩn bị được EasyInvoice web viewer.');
            } finally {
                if (active) setBootstrapping(false);
            }
        };
        runBootstrap();
        return () => {
            active = false;
        };
    }, [open, result]);

    useEffect(() => {
        if (!open) return;
        setDebugExpanded(false);
    }, [open, result?.ikey]);

    if (!open) return null;

    if (loading && !result) {
        return (
            <div
                style={{
                    position: 'fixed',
                    inset: 0,
                    zIndex: 1760,
                    background: 'rgba(15,23,42,.48)',
                    backdropFilter: 'blur(10px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 18,
                }}
            >
                <div
                    style={{
                        width: '100%',
                        maxWidth: 420,
                        borderRadius: 28,
                        background: 'rgba(255,255,255,.98)',
                        border: '1px solid rgba(15,23,42,.08)',
                        boxShadow: '0 28px 64px rgba(15,23,42,.28)',
                        padding: '28px 24px',
                        textAlign: 'center',
                    }}
                >
                    <style>{'@keyframes easyinvoiceSpin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}'}</style>
                    <div style={{ width: 52, height: 52, margin: '0 auto 16px', borderRadius: '50%', border: '4px solid rgba(37,99,235,.16)', borderTopColor: '#2563eb', animation: 'easyinvoiceSpin 1s linear infinite' }} />
                    <div data-sale-title="true" style={{ fontSize: 18, fontWeight: 900, color: '#111827' }}>Đang xuất hóa đơn đỏ</div>
                    <div style={{ marginTop: 8, fontSize: 12, lineHeight: 1.7, color: '#64748b' }}>
                        Màn hình đang được giữ tại chỗ để tạo hóa đơn nháp, lấy <b>pattern</b> và dựng iframe EasyInvoice ngay trong modal.
                    </div>
                    <div style={{ marginTop: 14, fontSize: 11, lineHeight: 1.7, color: '#475569' }}>
                        URL đích sẽ là <b>https://5800884170.easyinvoice.com.vn/EInvoice?Pattern=&#123;pattern&#125;</b>.
                    </div>
                </div>
            </div>
        );
    }

    if (!result) return null;

    const details = DETAIL_LABELS
        .map(([label, key]) => ({ label, value: result?.[key] }))
        .filter(item => item.value);

    const handleLogin = async () => {
        setSubmittingLogin(true);
        setErrorText('');
        try {
            const response = await fetch(buildApiUrl('/api/easyinvoice/web/login'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    ...webPayload,
                    flow_id: flowId,
                    captcha,
                }),
            });
            const payload = await response.json().catch(() => ({}));
            applyBootstrapPayload(payload);
            if (!response.ok || !payload?.authenticated) {
                throw new Error(payload.error || `HTTP ${response.status}`);
            }
        } catch (error) {
            setErrorText(error.message || 'Không đăng nhập được EasyInvoice.');
        } finally {
            setSubmittingLogin(false);
        }
    };

    const handleGenerateVatBillLink = async () => {
        const htmlSnapshot = extractVatBillHtmlFromFrame();
        if (!htmlSnapshot && !result?.link_view) {
            setVatBillStatus('Không thấy HTML hóa đơn hay link_view để tạo bản public.');
            return;
        }
        setSavingVatBill(true);
        setVatBillStatus('');
        try {
            const response = await fetch(buildApiUrl('/api/easyinvoice/vat-bill/save'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    html: htmlSnapshot || '',
                    source_url: result.link_view,
                    record_id: result?.record?.id,
                    ma_ct: result?.record?.ma_ct,
                    order_id: result?.order_id,
                    ikey: result?.ikey,
                    invoice_no: result?.invoice_no,
                    lookup_code: result?.lookup_code,
                    buyer: result?.buyer,
                    amount: result?.amount,
                }),
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(payload.error || `HTTP ${response.status}`);
            }
            const publicLink = extractVatBillLink(payload);
            setVatBillLink(publicLink);
            setVatBillStatus(publicLink ? 'Đã tạo link public cho khách.' : 'Đã lưu file nhưng chưa dựng được URL.');
        } catch (error) {
            setVatBillStatus(error.message || 'Không tạo được link public.');
        } finally {
            setSavingVatBill(false);
        }
    };

    const handleCopyVatBill = async () => {
        if (!vatBillLink) return;
        try {
            await navigator.clipboard.writeText(vatBillLink);
            setVatBillStatus('Đã copy link khách.');
            window.setTimeout(() => setVatBillStatus(value => (value === 'Đã copy link khách.' ? '' : value)), 1600);
        } catch {
            setVatBillStatus('Không copy được link khách.');
            window.setTimeout(() => setVatBillStatus(value => (value === 'Không copy được link khách.' ? '' : value)), 1600);
        }
    };

    const handleCopyDebug = async () => {
        try {
            await navigator.clipboard.writeText(debugText);
            setCopyMessage('Đã copy JSON.');
            window.setTimeout(() => setCopyMessage(''), 1600);
        } catch {
            setCopyMessage('Không copy được JSON.');
            window.setTimeout(() => setCopyMessage(''), 1600);
        }
    };

    const helperText = bootstrapping
        ? 'Đang thử vào web EasyInvoice và OCR captcha tối đa 3 lần...'
        : authRequired
            ? (noticeText || 'User/pass đã lấy từ cấu hình EasyInvoice. Chỉ cần nhập captcha để mở đúng trang chỉnh sửa và phần ký số.')
            : viewerUrl
                ? (noticeText || 'EasyInvoice đã sẵn sàng trong khung bên phải.')
                : 'Nếu phiên web hết hạn, modal sẽ yêu cầu captcha mới.';

    return (
        <div
            onClick={onClose}
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 1760,
                background: 'rgba(15,23,42,.58)',
                backdropFilter: 'blur(10px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: isCompact ? 0 : 18,
            }}
        >
            <div
                onClick={event => event.stopPropagation()}
                style={{
                    width: '100%',
                    maxWidth: 1280,
                    height: isCompact ? '100dvh' : 'min(92vh, 920px)',
                    borderRadius: isCompact ? 0 : 28,
                    background: 'rgba(255,255,255,.98)',
                    boxShadow: '0 28px 64px rgba(15,23,42,.28)',
                    border: '1px solid rgba(15,23,42,.08)',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                }}
            >
                <style>{'@keyframes easyinvoiceSpin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}'}</style>
                <div style={{ padding: '16px 18px 12px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, borderBottom: '1px solid rgba(15,23,42,.08)' }}>
                    <div style={{ minWidth: 0 }}>
                        <div data-sale-title="true" style={{ fontSize: 17, fontWeight: 900, color: '#111827' }}>EasyInvoice tạo thành công</div>
                        <div style={{ marginTop: 4, fontSize: 11, lineHeight: 1.55, color: '#64748b' }}>
                            {result?.message || 'Hóa đơn đã được tạo trên EasyInvoice.'}
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        style={{
                            width: 36,
                            height: 36,
                            borderRadius: '50%',
                            border: '1px solid #dbe4ee',
                            background: '#ffffff',
                            color: '#111827',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                        }}
                    >
                        <IoCloseOutline />
                    </button>
                </div>

                <div style={{ flex: 1, minHeight: 0, display: isCompact ? 'flex' : 'grid', flexDirection: isCompact ? 'column' : 'initial', gridTemplateColumns: isCompact ? undefined : '320px minmax(0,1fr)', gridTemplateRows: isCompact ? undefined : '1fr', overflowY: isCompact ? 'auto' : 'hidden' }}>
                    <div style={{ order: isCompact ? 2 : 1, borderRight: isCompact ? 'none' : '1px solid rgba(15,23,42,.08)', borderBottom: 'none', background: '#f8fafc', padding: 16, display: 'flex', flexDirection: 'column', gap: 12, overflowY: isCompact ? 'visible' : 'auto' }}>
                        <div style={{ borderRadius: 20, border: '1px solid #dbe4ee', background: '#ffffff', padding: 14, display: 'grid', gap: 10 }}>
                            {details.map(item => (
                                <div key={item.label} style={{ display: 'grid', gridTemplateColumns: '90px 1fr', gap: 10, alignItems: 'start' }}>
                                    <div style={{ fontSize: 10, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.35 }}>{item.label}</div>
                                    <div style={{ fontSize: 12, fontWeight: 700, color: '#111827', wordBreak: 'break-word' }}>{item.value}</div>
                                </div>
                            ))}
                        </div>

                        <div style={{ borderRadius: 20, border: '1px solid #dbe4ee', background: '#ffffff', padding: 14 }}>
                            <div style={{ fontSize: 12, fontWeight: 900, color: '#111827' }}>Web Viewer</div>
                            <div style={{ marginTop: 6, fontSize: 11, lineHeight: 1.6, color: '#64748b' }}>{helperText}</div>
                            {sessionInfo.taxCode || sessionInfo.username ? (
                                <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                                    {sessionInfo.taxCode ? <div style={{ fontSize: 11, color: '#475569' }}><b>MST:</b> {sessionInfo.taxCode}</div> : null}
                                    {sessionInfo.username ? <div style={{ fontSize: 11, color: '#475569' }}><b>User:</b> {sessionInfo.username}</div> : null}
                                </div>
                            ) : null}
                            {tenantUrl ? (
                                <div style={{ marginTop: 10, fontSize: 11, lineHeight: 1.6, color: '#475569', wordBreak: 'break-word' }}>
                                    <b>Tenant URL:</b> {tenantUrl}
                                </div>
                            ) : null}
                        </div>

                        <div style={{ borderRadius: 20, border: '1px solid #dbe4ee', background: '#ffffff', padding: 14, display: 'grid', gap: 10 }}>
                            <div style={{ fontSize: 12, fontWeight: 900, color: '#111827' }}>Link tải cho khách</div>
                            <div style={{ fontSize: 11, lineHeight: 1.6, color: '#64748b' }}>
                                Backend sẽ lưu một bản public vào <b>/download/vat-bill/...</b> để khách mở trực tiếp mà không cần đăng nhập EasyInvoice.
                            </div>
                            {vatBillLink ? (
                                <div style={{ fontSize: 11, lineHeight: 1.65, color: '#0f172a', wordBreak: 'break-word' }}>
                                    <a href={vatBillLink} target="_blank" rel="noreferrer" style={{ color: '#2563eb', fontWeight: 700 }}>
                                        {vatBillLink}
                                    </a>
                                </div>
                            ) : (
                                <div style={{ fontSize: 11, lineHeight: 1.6, color: '#64748b' }}>
                                    Chưa có link public. Bấm nút bên dưới để tạo.
                                </div>
                            )}
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                <button
                                    type="button"
                                    onClick={handleGenerateVatBillLink}
                                    disabled={savingVatBill}
                                    style={{ ...S.pillBtn('#ffffff', '#111827'), border: '1px solid #dbe4ee', boxShadow: 'none', minHeight: 34, height: 34, padding: '0 12px', fontSize: 11, opacity: savingVatBill ? 0.72 : 1 }}
                                >
                                    {savingVatBill ? 'Đang tạo link...' : 'Tạo link khách'}
                                </button>
                                <button
                                    type="button"
                                    onClick={handleCopyVatBill}
                                    disabled={!vatBillLink}
                                    style={{ ...S.pillBtn('#ffffff', '#111827'), border: '1px solid #dbe4ee', boxShadow: 'none', minHeight: 34, height: 34, padding: '0 12px', fontSize: 11, opacity: vatBillLink ? 1 : 0.48 }}
                                >
                                    Copy link
                                </button>
                            </div>
                            {vatBillStatus ? (
                                <div style={{ fontSize: 11, color: /khong|chua|http/i.test(String(vatBillStatus || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()) ? '#b91c1c' : '#166534' }}>
                                    {vatBillStatus}
                                </div>
                            ) : null}
                        </div>

                        <div style={{ borderRadius: 20, border: '1px solid #dbe4ee', background: '#ffffff', padding: 14, display: 'grid', gap: 10 }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                                <div style={{ fontSize: 12, fontWeight: 900, color: '#111827' }}>Dữ liệu trả về</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                    <button
                                        type="button"
                                        onClick={() => setDebugExpanded(value => !value)}
                                        style={{ ...S.pillBtn('#ffffff', '#111827'), border: '1px solid #dbe4ee', boxShadow: 'none', minHeight: 34, height: 34, padding: '0 12px', fontSize: 11 }}
                                    >
                                        {debugExpanded ? 'Thu gọn' : 'Mở JSON'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleCopyDebug}
                                        style={{ ...S.pillBtn('#ffffff', '#111827'), border: '1px solid #dbe4ee', boxShadow: 'none', minHeight: 34, height: 34, padding: '0 12px', fontSize: 11 }}
                                    >
                                        Copy JSON
                                    </button>
                                </div>
                            </div>
                            <div style={{ fontSize: 11, lineHeight: 1.6, color: '#64748b' }}>
                                Đây là payload app đang nhận sau khi tạo hóa đơn nháp EasyInvoice.
                            </div>
                            {copyMessage ? (
                                <div style={{ fontSize: 11, color: /không/i.test(copyMessage) ? '#b91c1c' : '#166534' }}>
                                    {copyMessage}
                                </div>
                            ) : null}
                            {debugExpanded ? (
                                <pre style={{ margin: 0, maxHeight: isCompact ? 260 : 320, overflow: 'auto', borderRadius: 16, border: '1px solid #e2e8f0', background: '#0f172a', color: '#e2e8f0', padding: 12, fontSize: 10, lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                    {debugText}
                                </pre>
                            ) : (
                                <div style={{ borderRadius: 16, border: '1px dashed #cbd5e1', background: '#f8fafc', padding: 12, fontSize: 11, lineHeight: 1.6, color: '#64748b' }}>
                                    JSON đang được thu gọn. Bấm <b>Mở JSON</b> để xem chi tiết.
                                </div>
                            )}
                        </div>

                        {authRequired ? (
                            <div style={{ borderRadius: 20, border: '1px solid #dbe4ee', background: '#ffffff', padding: 14, display: 'grid', gap: 12 }}>
                                <div style={{ fontSize: 12, fontWeight: 900, color: '#111827' }}>Nhập captcha EasyInvoice</div>
                                {captchaUrl ? (
                                    <div style={{ borderRadius: 16, border: '1px solid #dbe4ee', background: '#f8fafc', padding: 12, display: 'flex', justifyContent: 'center' }}>
                                        <img src={captchaUrl} alt="Captcha EasyInvoice" style={{ maxWidth: '100%', height: 48, objectFit: 'contain' }} />
                                    </div>
                                ) : null}
                                <input
                                    style={{ ...S.inp, textAlign: 'center', letterSpacing: 4, fontWeight: 800 }}
                                    type="text"
                                    inputMode="numeric"
                                    maxLength={8}
                                    placeholder="Nhập captcha"
                                    value={captcha}
                                    onChange={event => setCaptcha(event.target.value)}
                                    onKeyDown={event => {
                                        if (event.key === 'Enter' && !submittingLogin) handleLogin();
                                    }}
                                />
                                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                    <button
                                        type="button"
                                        onClick={bootstrapWebViewer}
                                        disabled={bootstrapping || submittingLogin}
                                        style={{ ...S.pillBtn('#ffffff', '#111827'), border: '1px solid #dbe4ee', boxShadow: 'none' }}
                                    >
                                        Tải captcha mới
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleLogin}
                                        disabled={bootstrapping || submittingLogin || !captcha.trim()}
                                        style={S.pillBtn('linear-gradient(135deg,#1d4ed8,#2563eb)', '#ffffff')}
                                    >
                                        Đăng nhập EasyInvoice
                                    </button>
                                </div>
                            </div>
                        ) : null}

                        {errorText ? (
                            <div style={{ borderRadius: 18, border: '1px solid rgba(239,68,68,.18)', background: '#fef2f2', padding: 12, fontSize: 12, lineHeight: 1.6, color: '#b91c1c' }}>
                                {errorText}
                            </div>
                        ) : null}

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
                            <button
                                type="button"
                                onClick={onClose}
                                style={{ ...S.pillBtn('#ffffff', '#111827'), border: '1px solid #dbe4ee', boxShadow: 'none' }}
                            >
                                Đóng
                            </button>
                        </div>
                    </div>

                    <div style={{ order: isCompact ? 1 : 2, minHeight: isCompact ? 'calc(100dvh - 86px)' : 0, height: isCompact ? 'calc(100dvh - 86px)' : 'auto', background: '#e2e8f0', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
                        {viewerUrl && !authRequired ? (
                            <iframe
                                title="EasyInvoice Web Viewer"
                                src={viewerUrl}
                                style={{ flex: 1, width: '100%', border: 0, background: '#ffffff' }}
                            />
                        ) : (
                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
                                <div style={{ width: '100%', maxWidth: 420, borderRadius: 24, border: '1px solid rgba(15,23,42,.08)', background: 'rgba(255,255,255,.94)', padding: 20, textAlign: 'center', boxShadow: '0 24px 48px rgba(15,23,42,.12)' }}>
                                    {bootstrapping ? (
                                        <div style={{ width: 42, height: 42, margin: '0 auto 14px', borderRadius: '50%', border: '3px solid rgba(37,99,235,.18)', borderTopColor: '#2563eb', animation: 'easyinvoiceSpin 1s linear infinite' }} />
                                    ) : null}
                                    <div style={{ fontSize: 15, fontWeight: 900, color: '#111827' }}>
                                        {bootstrapping ? 'Đang mở EasyInvoice...' : authRequired ? 'Chờ captcha EasyInvoice' : 'Chưa có viewer EasyInvoice'}
                                    </div>
                                    <div style={{ marginTop: 8, fontSize: 12, lineHeight: 1.65, color: '#64748b' }}>
                                        {bootstrapping
                                            ? 'Backend đang thử vào tenant EasyInvoice, OCR captcha và dựng iframe.'
                                            : authRequired
                                                ? 'Nhập captcha ở panel bên trái để app mở đúng trang chỉnh sửa hóa đơn và vùng ký số.'
                                                : 'Khi viewer sẵn sàng, trang chỉnh sửa EasyInvoice sẽ hiện trực tiếp tại đây.'}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
