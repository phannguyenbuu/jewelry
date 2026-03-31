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
}) {
    if (!open) return null;

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
                onClick={event => event.stopPropagation()}
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
                            {subtitle || 'Phiếu kê mua hàng PNG'}
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
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
                        <button
                            type="button"
                            onClick={onDownload}
                            disabled={loading || !imageUrl}
                            style={{ ...S.pillBtn('#ffffff', '#111827'), border: '1px solid #dbe4ee', boxShadow: 'none', opacity: loading || !imageUrl ? 0.55 : 1 }}
                        >
                            <IoDownloadOutline />
                            <span>PNG</span>
                        </button>
                        <button
                            type="button"
                            onClick={onCopy}
                            disabled={loading || !imageUrl}
                            style={{ ...S.pillBtn('#ffffff', '#111827'), border: '1px solid #dbe4ee', boxShadow: 'none', opacity: loading || !imageUrl ? 0.55 : 1 }}
                        >
                            <IoCopyOutline />
                            <span>Copy</span>
                        </button>
                        <button
                            type="button"
                            onClick={onSendToAgent}
                            disabled={loading || !imageUrl || sending}
                            style={{ ...S.pillBtn('linear-gradient(135deg,#15803d,#22c55e)', '#ffffff'), opacity: loading || !imageUrl || sending ? 0.55 : 1 }}
                        >
                            <IoPrintOutline />
                            <span>{sending ? 'Đang gửi agent' : 'Gửi agent'}</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
