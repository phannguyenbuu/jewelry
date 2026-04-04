import { IoCloseOutline } from 'react-icons/io5';

const LOCKED_POS_NUMBERS = new Set([2]);

export default function SaleReceiptPreviewModal({
    open,
    loading,
    imageUrl,
    error,
    orderId,
    onClose,
    onPrint,
    actionMessage,
    actionError,
    printingPosNos = [],
}) {
    if (!open) return null;

    return (
        <div
            onClick={onClose}
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 1750,
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
                        <div data-sale-title="true" style={{ fontSize: 15, fontWeight: 900, color: '#111827' }}>Xem trước PNG</div>
                        <div style={{ marginTop: 4, fontSize: 10, lineHeight: 1.5, color: '#64748b' }}>
                            {orderId || 'Phiếu giao dịch POS'}
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
                            <img src={imageUrl} alt="preview-phieu-pos" style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 16, background: '#ffffff', boxShadow: '0 10px 24px rgba(15,23,42,.10)' }} />
                        ) : (
                            <div style={{ fontSize: 11, color: '#64748b' }}>Chưa có preview receipt.</div>
                        )}
                    </div>
                </div>

                <div style={{ padding: '0 18px 18px', display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
                    {actionMessage ? (
                        <div style={{ fontSize: 10, lineHeight: 1.45, color: actionError ? '#dc2626' : '#0f766e', textAlign: 'center' }}>
                            {actionMessage}
                        </div>
                    ) : null}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap', width: '100%' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                            {[1, 2, 3, 4, 5].map(posNo => (
                                (() => {
                                    const isLocked = LOCKED_POS_NUMBERS.has(posNo);
                                    const isPrinting = printingPosNos.includes(posNo);
                                    const isDisabled = loading || !imageUrl || isLocked || isPrinting;
                                    return (
                                        <button
                                            key={posNo}
                                            type="button"
                                            onClick={() => onPrint?.(posNo)}
                                            disabled={isDisabled}
                                            title={isLocked ? `POS ${posNo} đã khóa` : `POS ${posNo}`}
                                            aria-label={isLocked ? `POS ${posNo} đã khóa` : `In POS ${posNo}`}
                                            style={{
                                                width: 38,
                                                height: 38,
                                                borderRadius: '50%',
                                                border: 'none',
                                                background: isLocked ? '#cbd5e1' : isPrinting ? 'linear-gradient(135deg,#0f172a,#334155)' : 'linear-gradient(135deg,#15803d,#22c55e)',
                                                color: '#ffffff',
                                                fontWeight: 900,
                                                fontSize: 13,
                                                cursor: isDisabled ? 'not-allowed' : 'pointer',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                boxShadow: isLocked ? 'none' : isPrinting ? '0 10px 18px rgba(15,23,42,.22)' : '0 10px 18px rgba(34,197,94,.24)',
                                                opacity: isDisabled ? 0.55 : 1,
                                            }}
                                        >
                                            {posNo}
                                        </button>
                                    );
                                })()
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
