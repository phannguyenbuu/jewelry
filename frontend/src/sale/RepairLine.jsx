import { useEffect, useRef, useState } from 'react';
import { IoCloseOutline, IoQrCodeOutline } from 'react-icons/io5';
import { APP_GRADIENT_BRIGHT, S, filterInventoryItems, normalizeGoldEntryMode, computeRepairNextWeight, scanCodeFromFile, findInventoryByCode, isUnavailableInventoryItem, inventoryStatusLabel } from './shared';

export default function RepairLine({ line, inventoryItems, repairMode, onChange, onRemove, showRemove }) {
    const fileInputRef = useRef(null);
    const [catalogQuery, setCatalogQuery] = useState(line.productCode || '');
    const [lookupMessage, setLookupMessage] = useState('');
    const [scanLoading, setScanLoading] = useState(false);

    const entryMode = normalizeGoldEntryMode(line.entryMode);
    const catalogMatches = filterInventoryItems(inventoryItems, catalogQuery);
    const nextWeight = computeRepairNextWeight(line, repairMode);

    useEffect(() => {
        setCatalogQuery(line.productCode || '');
    }, [line.productCode]);

    const applyInventoryItem = (item, source = entryMode) => {
        if (!item) {
            setLookupMessage('Không tìm thấy sản phẩm trong kho.');
            return;
        }
        if (isUnavailableInventoryItem(item)) {
            setLookupMessage(`Sản phẩm ${item.ma_hang || item.ncc || ''} đang ở trạng thái ${inventoryStatusLabel(item)}, không thể chọn.`);
            return;
        }
        onChange({
            entryMode: source,
            itemId: item.id,
            productCode: item.ma_hang || '',
            itemName: item.ncc || '',
            nhom_hang: item.nhom_hang || '',
            quay_nho: item.quay_nho || '',
            tuoi_vang: item.tuoi_vang || '',
            status: item.status || '',
            tl_vang_hien_tai: item.tl_vang || '',
        });
        setCatalogQuery(item.ma_hang || item.ncc || '');
        setLookupMessage(`Đã chọn ${item.ma_hang || 'sản phẩm'}${item.ncc ? ` · ${item.ncc}` : ''}.`);
    };

    const handleScanFile = async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        setScanLoading(true);
        try {
            const scannedCode = await scanCodeFromFile(file);
            onChange({ productCode: scannedCode, entryMode: 'camera' });
            const matched = findInventoryByCode(inventoryItems, scannedCode);
            if (matched) {
                applyInventoryItem(matched, 'camera');
            } else {
                setLookupMessage(`Đã quét được mã ${scannedCode}, nhưng chưa thấy trong kho.`);
            }
        } catch (err) {
            setLookupMessage(err.message || 'Không quét được QR.');
        } finally {
            setScanLoading(false);
        }
    };

    return (
        <div style={{ ...S.card, border: '1.5px solid rgba(15,23,42,.08)' }}>
            {showRemove && (
                <button onClick={onRemove} style={{ ...S.iconBtn('#ef4444'), width: 28, height: 28, fontSize: 13, position: 'absolute', top: -8, right: -8, zIndex: 2 }}>×</button>
            )}

            <div>
                <span style={S.label}>Chọn hàng từ kho</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                    <input
                        className="sale-pos-catalog-input"
                        style={{ ...S.inp, textAlign: 'left', flex: 1, borderRadius: 16 }}
                        value={catalogQuery}
                        onChange={e => {
                            setCatalogQuery(e.target.value);
                            setLookupMessage('');
                            onChange({ entryMode: 'catalog' });
                        }}
                        placeholder="Nhập hoặc quét mã để tìm trong kho"
                    />
                    <button
                        type="button"
                        title={scanLoading ? 'Đang quét...' : 'Quét QR / mã vạch'}
                        aria-label="Quét QR / mã vạch"
                        onClick={() => fileInputRef.current?.click()}
                        style={{
                            ...S.iconBtn(APP_GRADIENT_BRIGHT),
                            width: 42,
                            height: 42,
                            flexShrink: 0,
                            color: 'white',
                            fontSize: 20,
                        }}
                    >
                        <IoQrCodeOutline />
                    </button>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        style={{ display: 'none' }}
                        onChange={handleScanFile}
                    />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                    {catalogQuery ? (
                        catalogMatches.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {catalogMatches.map(item => {
                                    const unavailable = isUnavailableInventoryItem(item);
                                    return (
                                        <button
                                            key={item.id}
                                            type="button"
                                            disabled={unavailable}
                                            onClick={() => applyInventoryItem(item, entryMode === 'camera' ? 'camera' : 'catalog')}
                                            style={{
                                                borderRadius: 16,
                                                border: unavailable ? '1px dashed #fca5a5' : '1px solid #dbe4ee',
                                                background: 'white',
                                                padding: '10px 12px',
                                                textAlign: 'left',
                                                cursor: unavailable ? 'not-allowed' : 'pointer',
                                                opacity: unavailable ? 0.72 : 1,
                                            }}
                                        >
                                            <div style={{ fontSize: 11, fontWeight: 800, color: unavailable ? '#94a3b8' : '#111827', textDecoration: unavailable ? 'line-through' : 'none' }}>
                                                {item.ma_hang || 'Không có mã'}
                                            </div>
                                            <div style={{ fontSize: 10, color: '#64748b', marginTop: 3, textDecoration: unavailable ? 'line-through' : 'none' }}>
                                                {item.ncc || 'Không có tên'} · {item.tuoi_vang || 'Chưa có tuổi vàng'} · {inventoryStatusLabel(item)}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        ) : (
                            <div style={{ fontSize: 10, color: '#64748b' }}>Không có kết quả phù hợp trong kho hàng.</div>
                        )
                    ) : null}
                </div>
            </div>

            {(line.productCode || line.itemName) && (
                <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 16, background: 'white', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: 11, fontWeight: 900, color: '#111827' }}>
                        {line.productCode || 'Chưa có mã'}{line.itemName ? ` · ${line.itemName}` : ''}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
                        <div>
                            <div style={{ fontSize: 8, color: '#6b7280', fontWeight: 700 }}>TUỔI VÀNG</div>
                            <div style={{ fontSize: 10, color: '#111827', fontWeight: 700 }}>{line.tuoi_vang || '—'}</div>
                        </div>
                        <div>
                            <div style={{ fontSize: 8, color: '#6b7280', fontWeight: 700 }}>QUẦY NHỎ</div>
                            <div style={{ fontSize: 10, color: '#111827', fontWeight: 700 }}>{line.quay_nho || '—'}</div>
                        </div>
                        <div>
                            <div style={{ fontSize: 8, color: '#6b7280', fontWeight: 700 }}>TL HIỆN TẠI</div>
                            <div style={{ fontSize: 10, color: '#111827', fontWeight: 700 }}>{line.tl_vang_hien_tai || '0'}</div>
                        </div>
                        <div>
                            <div style={{ fontSize: 8, color: '#6b7280', fontWeight: 700 }}>TRẠNG THÁI</div>
                            <div style={{ fontSize: 10, color: '#111827', fontWeight: 700 }}>{line.status || 'Tồn kho'}</div>
                        </div>
                    </div>
                </div>
            )}

            {repairMode === 'sua' ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
                    <div>
                        <span style={S.label}>Thêm TL vàng</span>
                        <input
                            style={{ ...S.inp, textAlign: 'left' }}
                            type="number"
                            inputMode="decimal"
                            min="0"
                            step="0.0001"
                            value={line.them_tl_vang || ''}
                            onChange={e => onChange({ them_tl_vang: e.target.value })}
                            placeholder="0.0000"
                        />
                    </div>
                    <div>
                        <span style={S.label}>Bớt TL vàng</span>
                        <input
                            style={{ ...S.inp, textAlign: 'left' }}
                            type="number"
                            inputMode="decimal"
                            min="0"
                            step="0.0001"
                            value={line.bot_tl_vang || ''}
                            onChange={e => onChange({ bot_tl_vang: e.target.value })}
                            placeholder="0.0000"
                        />
                    </div>
                    <div style={{ gridColumn: '1 / -1', padding: '9px 12px', borderRadius: 12, background: 'rgba(15,23,42,.04)', color: '#334155', fontSize: 10, fontWeight: 700 }}>
                        TL vàng dự kiến sau sửa: {nextWeight || '0'}
                    </div>
                </div>
            ) : (
                <div style={{ marginTop: 10, padding: '9px 12px', borderRadius: 12, background: '#fff7ed', color: '#9a3412', fontSize: 10, lineHeight: 1.5 }}>
                    Phiếu bỏ hàng sẽ chuyển sản phẩm sang trạng thái `Đã bỏ` và không yêu cầu nhập thêm hoặc bớt trọng lượng vàng.
                </div>
            )}

            <div style={{ marginTop: 10 }}>
                <span style={S.label}>Ghi chú dòng hàng</span>
                <textarea
                    style={{ ...S.inp, minHeight: 72, resize: 'none', textAlign: 'left', padding: 10 }}
                    value={line.ghi_chu || ''}
                    onChange={e => onChange({ ghi_chu: e.target.value })}
                    placeholder="Ghi chú cho sản phẩm này"
                />
            </div>

            {lookupMessage && (
                <div style={{ marginTop: 8, fontSize: 10, color: '#1d4ed8', lineHeight: 1.45 }}>{lookupMessage}</div>
            )}
        </div>
    );
}
