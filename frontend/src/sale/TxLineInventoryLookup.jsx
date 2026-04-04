import { useEffect, useRef, useState } from 'react';
import { IoChevronDownOutline, IoCloseOutline, IoQrCodeOutline } from 'react-icons/io5';

import InventoryCodeScanModal from './InventoryCodeScanModal';
import { foldText, inventoryStatusLabel, isUnavailableInventoryItem } from './shared';

function InventorySuggestionList({
    suggestionItems,
    onSelectSuggestion,
}) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {suggestionItems.map((item) => {
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
                        {disabled ? (
                            <div style={{ marginTop: 3, fontSize: 10, color: '#dc2626', lineHeight: 1.35 }}>
                                {inventoryStatusLabel(item)}
                            </div>
                        ) : null}
                    </button>
                );
            })}
        </div>
    );
}

function SelectedInventoryInfo({ line, lineAccent, marginTop = 8 }) {
    if (!(line.productCode || line.itemName)) return null;

    const detailParts = [line.itemName, line.product].filter(Boolean);

    return (
        <div
            style={{
                marginTop,
                borderRadius: 14,
                border: `1px solid ${lineAccent}33`,
                background: '#f8fbff',
                padding: '9px 12px',
                boxShadow: '0 10px 22px rgba(15,23,42,.06)',
            }}
        >
            <div style={{ fontSize: 10, fontWeight: 800, color: lineAccent, lineHeight: 1.35 }}>
                Sản phẩm đã chọn
            </div>
            <div style={{ marginTop: 2, fontSize: 11, fontWeight: 800, color: '#0f172a', lineHeight: 1.4 }}>
                {line.productCode || 'Chưa có mã'}
            </div>
            {detailParts.length ? (
                <div style={{ marginTop: 2, fontSize: 10, color: '#475569', lineHeight: 1.45 }}>
                    {detailParts.join(' · ')}
                </div>
            ) : null}
        </div>
    );
}

function getLookupMessageColor(message) {
    if (!message) return '#64748b';
    if (/^(Da|Đã|Tim thay|Tìm thấy)/i.test(message)) return '#0f766e';
    return '#dc2626';
}

function normalizeLookupMessage(message) {
    const text = String(message || '').trim();
    if (!text) return '';

    const normalized = foldText(text);
    if (normalized.includes('khong tim thay') || normalized.includes('ma trong kho')) {
        return 'Sản phẩm không tìm thấy.';
    }
    if (normalized.startsWith('da chon san pham')) {
        return text
            .replace(/^Da chon san pham/i, 'Đã chọn sản phẩm')
            .replace(/khong ro ma/gi, 'không rõ mã');
    }
    if (normalized.startsWith('khong doc duoc ma san pham')) {
        return 'Không đọc được mã sản phẩm.';
    }
    if (normalized.startsWith('khong doc duoc qr hoac ma vach')) {
        return 'Không đọc được QR hoặc mã vạch.';
    }
    return text;
}

export function InventoryProductLookupField({
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
    productOptions = [],
    product,
    onProductChange,
    qtyField = null,
    width = '100%',
}) {
    const [scanOpen, setScanOpen] = useState(false);
    const [pickerOpen, setPickerOpen] = useState(false);
    const [keepPickerOpenAfterScan, setKeepPickerOpenAfterScan] = useState(false);
    const inputRef = useRef(null);

    const hasQuery = !!String(catalogQuery || '').trim();
    const showSuggestions = !!suggestionItems?.length
        && hasQuery
        && !(line.itemId && String(line.productCode || '').trim() === String(catalogQuery || '').trim());
    const normalizedQuery = foldText(catalogQuery);
    const filteredProductOptions = (hasQuery
        ? productOptions.filter((option) => [option.label, option.value].some((value) => foldText(value).includes(normalizedQuery)))
        : productOptions
    ).slice(0, 9);
    const selectedOption = productOptions.find((option) => String(option.value) === String(product));
    const pickerLoading = productOptions.length === 0;
    const hasExactInventorySelection = line.itemId && String(line.productCode || '').trim() === String(catalogQuery || '').trim();
    const pickerVisible = pickerOpen && (keepPickerOpenAfterScan || !hasExactInventorySelection);
    const displayMessage = normalizeLookupMessage(scanMessage);
    const helperColor = getLookupMessageColor(displayMessage);
    const triggerLabel = pickerLoading
        ? 'Loading...'
        : (line.itemId ? '\u00A0' : (selectedOption?.label || product || 'Chọn tuổi vàng'));

    useEffect(() => {
        if (!pickerVisible) return;
        inputRef.current?.focus();
        inputRef.current?.select?.();
    }, [pickerVisible]);

    if (!usesInventory) return null;

    const noResults = hasQuery && !showSuggestions && filteredProductOptions.length === 0;

    return (
        <div
            style={{ width: '100%' }}
            onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) {
                    setKeepPickerOpenAfterScan(false);
                    setPickerOpen(false);
                }
            }}
        >
                <InventoryCodeScanModal
                open={scanOpen}
                loading={scanLoading}
                message={displayMessage}
                onClose={() => setScanOpen(false)}
                onDetected={handleScanDetected}
                onPickFile={handleScanFile}
            />

            <div style={{ display: 'grid', gridTemplateColumns: qtyField ? 'minmax(0,1.08fr) minmax(0,.92fr)' : '1fr', gap: 10, alignItems: 'end' }}>
                <div style={{ width, minWidth: 0 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 42px', gap: 6, alignItems: 'center' }}>
                        <button
                            type="button"
                            onClick={() => {
                                if (pickerLoading) return;
                                if (pickerVisible) {
                                    setKeepPickerOpenAfterScan(false);
                                    setPickerOpen(false);
                                    return;
                                }
                                setKeepPickerOpenAfterScan(hasExactInventorySelection);
                                setPickerOpen(true);
                            }}
                            aria-expanded={pickerVisible}
                            aria-label={pickerVisible ? 'Thu gọn chọn tuổi vàng' : 'Mở chọn tuổi vàng hoặc tìm mã kho'}
                            style={{
                                ...S.inp,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: 8,
                                padding: '9px 12px',
                                cursor: pickerLoading ? 'not-allowed' : 'pointer',
                                background: pickerVisible ? '#f8fbff' : S.inp.background,
                                borderColor: pickerVisible ? txTheme.border : '#dbe4ee',
                                opacity: pickerLoading ? 0.72 : 1,
                            }}
                        >
                            <span style={{ flex: 1, minWidth: 0, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#111827' }}>
                                {triggerLabel}
                            </span>
                            <IoChevronDownOutline style={{ fontSize: 16, color: '#475569', flexShrink: 0, transform: pickerVisible ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform .18s ease' }} />
                        </button>
                        <button
                            type="button"
                            title={scanLoading ? 'Đang quét...' : 'Quét QR / mã vạch'}
                            aria-label="Quét QR / mã vạch"
                            onClick={() => {
                                setKeepPickerOpenAfterScan(true);
                                setPickerOpen(true);
                                setScanOpen(true);
                            }}
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
                </div>

                {qtyField}
            </div>

            {!pickerVisible ? <SelectedInventoryInfo line={line} lineAccent={lineAccent} marginTop={6} /> : null}
            {!pickerVisible && displayMessage ? (
                <div style={{ marginTop: 6, fontSize: 10, color: helperColor, lineHeight: 1.45 }}>
                    {displayMessage}
                </div>
            ) : null}

            {pickerVisible ? (
                <div style={{ marginTop: 8, borderRadius: 18, border: '1px solid #dbe4ee', background: '#ffffff', boxShadow: '0 18px 36px rgba(15,23,42,.12)', padding: 8, display: 'grid', gap: 8 }}>
                    <div style={{ position: 'relative' }}>
                        <input
                            ref={inputRef}
                            className="sale-pos-catalog-input"
                            style={{ ...S.inp, textAlign: 'left', width: '100%', borderRadius: 14, paddingRight: 34 }}
                            value={catalogQuery}
                            onChange={(event) => {
                                setKeepPickerOpenAfterScan(false);
                                handleCatalogInputChange(event.target.value);
                            }}
                            placeholder="Chọn tuổi vàng hoặc nhập mã để tìm trong kho"
                        />
                        {hasQuery ? (
                            <button
                                type="button"
                                title="Xóa nhanh"
                                aria-label="Xóa nhanh"
                                onClick={() => {
                                    setKeepPickerOpenAfterScan(false);
                                    handleCatalogInputChange('');
                                }}
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
                        ) : null}
                    </div>

                    {line.itemId ? (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <SelectedInventoryInfo line={line} lineAccent={lineAccent} marginTop={0} />
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    setKeepPickerOpenAfterScan(false);
                                    handleCatalogInputChange('');
                                }}
                                style={{
                                    border: `1px solid ${txTheme.softBorder}`,
                                    background: '#ffffff',
                                    color: lineAccent,
                                    borderRadius: 999,
                                    padding: '5px 10px',
                                    fontSize: 10,
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    flexShrink: 0,
                                }}
                            >
                                Bỏ mã kho
                            </button>
                        </div>
                    ) : null}

                    {showSuggestions ? (
                        <div style={{ display: 'grid', gap: 6 }}>
                            <span style={{ ...S.label, marginBottom: 0 }}>Kết quả trong kho</span>
                            <InventorySuggestionList
                                suggestionItems={suggestionItems}
                                onSelectSuggestion={(item) => {
                                    setKeepPickerOpenAfterScan(false);
                                    onSelectSuggestion?.(item);
                                    setPickerOpen(false);
                                }}
                            />
                        </div>
                    ) : null}

                    {filteredProductOptions.length ? (
                        <div style={{ display: 'grid', gap: 6 }}>
                            <span style={{ ...S.label, marginBottom: 0 }}>Tuổi vàng</span>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6 }}>
                                {filteredProductOptions.map((option) => {
                                    const active = String(option.value) === String(product);
                                    return (
                                        <button
                                            key={option.value}
                                            type="button"
                                            onClick={() => {
                                                setKeepPickerOpenAfterScan(false);
                                                onProductChange?.(option.value);
                                                setPickerOpen(false);
                                            }}
                                            style={{
                                                border: active ? 'none' : `1px solid ${txTheme.softBorder}`,
                                                background: active ? txTheme.gradient : '#ffffff',
                                                color: active ? '#ffffff' : '#111827',
                                                borderRadius: 12,
                                                padding: '10px 8px',
                                                fontSize: 11,
                                                fontWeight: 700,
                                                cursor: 'pointer',
                                                boxShadow: active ? '0 10px 20px rgba(15,23,42,.12)' : 'none',
                                            }}
                                        >
                                            {option.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ) : null}

                    {noResults ? (
                        <div style={{ borderRadius: 14, background: '#f8fafc', padding: '10px 12px', fontSize: 11, color: '#64748b', lineHeight: 1.45 }}>
                            Không thấy tuổi vàng hoặc mã kho phù hợp.
                        </div>
                    ) : null}

                    {displayMessage ? (
                        <div style={{ fontSize: 10, color: helperColor, lineHeight: 1.45 }}>
                            {displayMessage}
                        </div>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}

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
    const displayMessage = normalizeLookupMessage(scanMessage);
    const helperColor = getLookupMessageColor(displayMessage);

    if (!usesInventory) return null;

    return (
        <div style={{ gridColumn: '1 / -1' }}>
                <InventoryCodeScanModal
                open={scanOpen}
                loading={scanLoading}
                message={displayMessage}
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
                        onChange={(event) => handleCatalogInputChange(event.target.value)}
                        placeholder="Nhập hoặc quét mã để tìm trong kho"
                    />
                    {String(catalogQuery || '').trim() ? (
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
                    ) : null}
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
            {showSuggestions ? (
                <div style={{ marginTop: 8 }}>
                    <InventorySuggestionList
                        suggestionItems={suggestionItems}
                        onSelectSuggestion={onSelectSuggestion}
                    />
                </div>
            ) : null}
            <SelectedInventoryInfo line={line} lineAccent={lineAccent} />
            {displayMessage ? (
                <div style={{ marginTop: 6, fontSize: 10, color: helperColor, lineHeight: 1.45 }}>
                    {displayMessage}
                </div>
            ) : null}
        </div>
    );
}
