import { useState } from 'react';
import { IoCloseOutline, IoQrCodeOutline } from 'react-icons/io5';
import InventoryCodeScanModal from './InventoryCodeScanModal';
import { inventoryStatusLabel, isUnavailableInventoryItem } from './shared';

export default function TxLineInventoryLookup({
    usesInventory,
    S,
    txTheme,
    catalogQuery,
    handleCatalogInputChange,
    handleScanDetected,
    handleScanFile,
    scanLoading,
    scanMessage,
    suggestionItems,
    onSelectSuggestion,
    line,
    lineAccent,
}) {
    const [scanOpen, setScanOpen] = useState(false);
    const showSuggestions = !!suggestionItems?.length
        && String(catalogQuery || '').trim()
        && !(line.itemId && String(line.productCode || '').trim() === String(catalogQuery || '').trim());

    if (!usesInventory) return null;

    return (
        <div style={{ gridColumn: '1 / -1' }}>
            <InventoryCodeScanModal
                open={scanOpen}
                loading={scanLoading}
                message={scanMessage}
                onClose={() => setScanOpen(false)}
                onDetected={handleScanDetected}
                onPickFile={handleScanFile}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ position: 'relative', flex: 1 }}>
                    <input
                        className="sale-pos-catalog-input"
                        style={{ ...S.inp, textAlign: 'left', width: '100%', borderRadius: 16, paddingRight: 34 }}
                        value={catalogQuery}
                        onChange={e => handleCatalogInputChange(e.target.value)}
                        placeholder="Nhập hoặc quét mã để tìm trong kho"
                    />
                    {!!String(catalogQuery || '').trim() && (
                        <button
                            type="button"
                            title="Xóa nhanh"
                            aria-label="Xóa nhanh"
                            onClick={() => handleCatalogInputChange('')}
                            style={{
                                position: 'absolute',
                                right: 8,
                                top: '50%',
                                transform: 'translateY(-50%)',
                                width: 20,
                                height: 20,
                                border: 'none',
                                background: 'transparent',
                                color: '#94a3b8',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                padding: 0,
                            }}
                        >
                            <IoCloseOutline />
                        </button>
                    )}
                </div>
                <button
                    type="button"
                    title={scanLoading ? 'Đang quét...' : 'Quét QR / mã vạch'}
                    aria-label="Quét QR / mã vạch"
                    onClick={() => setScanOpen(true)}
                    style={{
                        ...S.iconBtn(txTheme.gradient),
                        width: 42,
                        height: 42,
                        flexShrink: 0,
                        color: 'white',
                        fontSize: 20,
                    }}
                >
                    <IoQrCodeOutline />
                </button>
            </div>
            {showSuggestions && (
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {suggestionItems.map(item => {
                        const disabled = isUnavailableInventoryItem(item);
                        return (
                            <button
                                key={item.id || item.ma_hang}
                                type="button"
                                disabled={disabled}
                                onClick={() => {
                                    if (disabled) return;
                                    onSelectSuggestion?.(item);
                                }}
                                style={{
                                    width: '100%',
                                    textAlign: 'left',
                                    borderRadius: 14,
                                    border: `1px solid ${disabled ? '#fecaca' : '#dbe4ee'}`,
                                    background: disabled ? '#fff5f5' : '#f8fbff',
                                    padding: '9px 12px',
                                    cursor: disabled ? 'not-allowed' : 'pointer',
                                    opacity: disabled ? 0.7 : 1,
                                }}
                            >
                                <div style={{ fontSize: 11, fontWeight: 700, color: disabled ? '#b91c1c' : '#0f172a', lineHeight: 1.35 }}>
                                    {item.ma_hang || 'Chưa có mã'}
                                    {item.ncc ? ` · ${item.ncc}` : ''}
                                    {item.tuoi_vang ? ` · ${item.tuoi_vang}` : ''}
                                </div>
                                {disabled && (
                                    <div style={{ marginTop: 3, fontSize: 10, color: '#dc2626', lineHeight: 1.35 }}>
                                        {inventoryStatusLabel(item)}
                                    </div>
                                )}
                            </button>
                        );
                    })}
                </div>
            )}
            {(line.productCode || line.itemName) && (
                <div style={{ marginTop: 8, fontSize: 10, color: lineAccent, lineHeight: 1.45 }}>
                    Đã chọn {line.productCode || 'sản phẩm'}
                    {line.itemName ? ` · ${line.itemName}` : ''}
                </div>
            )}
        </div>
    );
}
