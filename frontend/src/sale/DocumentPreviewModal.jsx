import { IoCloseOutline, IoCopyOutline, IoDownloadOutline, IoPrintOutline } from 'react-icons/io5';

import { S } from './shared';

export default function DocumentPreviewModal({
    open,
    loading,
    imageUrl,
    error,
    title,
    subtitle,
    onClose,
    onDownload,
    onCopy,
    onSendToAgent,
    actionMessage,
    actionError,
    sending,
    sendLabel = 'In Phiếu Kê',
    showCopy = true,
    printerOptions = [],
    onSendToPrinter,
}) {
    if (!open) return null;

    const resolvedSendLabel = String(sendLabel || 'In Phiếu Kê').trim() || 'In Phiếu Kê';
    const sendingLabel = `Đang ${resolvedSendLabel.toLowerCase()}`;
    const hasPrinterOptions = Array.isArray(printerOptions) && printerOptions.length > 0;
    const actionDisabled = loading || !imageUrl;

    return (
        <div
            onClick={onClose}
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 1755,
                background: 'rgba(15,23,42,.56)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 18,
            }}
        >
            <div
                onClick={(event) => event.stopPropagation()}
                style={{
                    width: '100%',
                    maxWidth: 430,
                    maxHeight: '92vh',
                    display: 'flex',
                    flexDirection: 'column',
                    borderRadius: 26,
                    background: 'rgba(255,255,255,.98)',
                    boxShadow: '0 28px 64px rgba(15,23,42,.28)',
                    border: '1px solid rgba(15,23,42,.08)',
                    overflow: 'hidden',
                }}
            >
                <div style={{ padding: '16px 18px 12px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ minWidth: 0 }}>
                        <div data-sale-title="true" style={{ fontSize: 15, fontWeight: 900, color: '#111827' }}>{title || 'Xem trước PNG'}</div>
                        <div style={{ marginTop: 4, fontSize: 10, lineHeight: 1.5, color: '#64748b' }}>
                            {subtitle || 'Preview PNG tài liệu in'}
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        style={{
                            width: 34,
                            height: 34,
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

                <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 18px 18px' }}>
                    <div
                        style={{
                            minHeight: 220,
                            borderRadius: 22,
                            border: '1px solid #dbe4ee',
                            background: '#f8fafc',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            overflow: 'hidden',
                            padding: 12,
                        }}
                    >
                        {loading ? (
                            <div style={{ fontSize: 12, color: '#475569', fontWeight: 700 }}>Đang tạo preview PNG...</div>
                        ) : error ? (
                            <div style={{ fontSize: 11, color: '#dc2626', lineHeight: 1.55, textAlign: 'center' }}>{error}</div>
                        ) : imageUrl ? (
                            <img src={imageUrl} alt="preview-document-png" style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 16, background: '#ffffff', boxShadow: '0 10px 24px rgba(15,23,42,.10)' }} />
                        ) : (
                            <div style={{ fontSize: 11, color: '#64748b' }}>Chưa có preview PNG.</div>
                        )}
                    </div>
                </div>

                <div style={{ padding: '0 18px 18px', display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
                    {actionMessage ? (
                        <div style={{ fontSize: 10, lineHeight: 1.45, color: actionError ? '#dc2626' : '#0f766e', textAlign: 'center' }}>
                            {actionMessage}
                        </div>
                    ) : null}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center', width: '100%' }}>
                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
                            <button
                                type="button"
                                onClick={onDownload}
                                disabled={actionDisabled}
                                style={{ ...S.pillBtn('#ffffff', '#111827'), border: '1px solid #dbe4ee', boxShadow: 'none', opacity: actionDisabled ? 0.55 : 1 }}
                            >
                                <IoDownloadOutline />
                                <span>PNG</span>
                            </button>
                            {showCopy ? (
                                <button
                                    type="button"
                                    onClick={onCopy}
                                    disabled={actionDisabled}
                                    style={{ ...S.pillBtn('#ffffff', '#111827'), border: '1px solid #dbe4ee', boxShadow: 'none', opacity: actionDisabled ? 0.55 : 1 }}
                                >
                                    <IoCopyOutline />
                                    <span>Copy</span>
                                </button>
                            ) : null}
                            {!hasPrinterOptions ? (
                                <button
                                    type="button"
                                    onClick={onSendToAgent}
                                    disabled={actionDisabled || sending}
                                    style={{ ...S.pillBtn('linear-gradient(135deg,#15803d,#22c55e)', '#ffffff'), opacity: actionDisabled || sending ? 0.55 : 1 }}
                                >
                                    <IoPrintOutline />
                                    <span>{sending ? sendingLabel : resolvedSendLabel}</span>
                                </button>
                            ) : null}
                        </div>
                        {hasPrinterOptions ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                                {printerOptions.map((printer) => (
                                    <button
                                        key={printer.key}
                                        type="button"
                                        onClick={() => onSendToPrinter?.(printer.key)}
                                        disabled={actionDisabled || sending}
                                        title={printer.title || `Máy in ${printer.label}`}
                                        aria-label={printer.title || `Máy in ${printer.label}`}
                                        style={{
                                            width: 38,
                                            height: 38,
                                            borderRadius: '50%',
                                            border: 'none',
                                            background: 'linear-gradient(135deg,#15803d,#22c55e)',
                                            color: '#ffffff',
                                            fontWeight: 900,
                                            fontSize: 13,
                                            cursor: actionDisabled || sending ? 'not-allowed' : 'pointer',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            boxShadow: '0 10px 18px rgba(34,197,94,.24)',
                                            opacity: actionDisabled || sending ? 0.55 : 1,
                                        }}
                                    >
                                        {printer.label}
                                    </button>
                                ))}
                            </div>
                        ) : null}
                    </div>
                </div>
            </div>
        </div>
    );
}
