import { useEffect, useState } from 'react';
import { IoCloseOutline } from 'react-icons/io5';
import FormattedNumberInput from './FormattedNumberInput';
import { GoldBuyFieldGroup, GoldSaleFieldGroup } from './GoldFieldGroups';
import { BUY_GOLD_OTHER_OPTION, INVENTORY_TXS, POS_RED, S, calcValueStyle, filterInventoryItems, findInventoryByCode, firstProductForCategory, fmtCalc, formatBuyGoldProductLabel, formatWeight, getTxTheme, isPositiveTransaction, isUnavailableInventoryItem, normalizeGoldEntryMode, normalizeTradeRate, parseFmt, parseWeight, sanitizeLineInventoryState, scanCodeFromFile } from './shared';

export default function TxLine({ line, rates, inventoryItems, onChange, onRemove, showRemove }) {
    const cats = Object.keys(rates);
    const effectiveCat = line.tx === 'trade' ? 'gold' : line.cat;
    const products = Object.keys(rates[effectiveCat] || {});
    const goldProducts = Object.keys(rates.gold || {});
    const goldBuyProductOptions = [
        ...goldProducts.map(product => ({ value: product, label: formatBuyGoldProductLabel(product) })),
        { value: BUY_GOLD_OTHER_OPTION, label: BUY_GOLD_OTHER_OPTION },
    ];
    const productOptions = line.tx === 'buy' && effectiveCat === 'gold'
        ? [
            ...products.map(product => ({ value: product, label: formatBuyGoldProductLabel(product) })),
            { value: BUY_GOLD_OTHER_OPTION, label: BUY_GOLD_OTHER_OPTION },
        ]
        : products.map(product => ({ value: product, label: product }));
    const selectableProducts = productOptions.map(option => option.value);
    const [catalogQuery, setCatalogQuery] = useState(line.productCode || '');
    const [lookupMessage, setLookupMessage] = useState('');
    const [scanLoading, setScanLoading] = useState(false);

    const rate = rates[effectiveCat]?.[line.product] || [0, 0];
    const sellRate = normalizeTradeRate(effectiveCat, line.customSell !== undefined ? line.customSell : rate[0]);
    const buyRate = normalizeTradeRate(effectiveCat, line.customBuy !== undefined ? line.customBuy : rate[1]);
    const tradeRate = normalizeTradeRate(effectiveCat, line.customTrade !== undefined ? line.customTrade : rate[0]);
    const curRate = line.tx === 'buy' ? buyRate : line.tx === 'trade' ? tradeRate : sellRate;
    const hasCustomerCustomBuy = line.customerCustomBuy !== undefined && String(line.customerCustomBuy).trim() !== '';
    const customerRate = normalizeTradeRate(
        'gold',
        hasCustomerCustomBuy
            ? line.customerCustomBuy
            : (rates.gold?.[line.customerProduct || '']?.[1] || 0)
    );
    const baseQty = parseFmt(line.qty);
    const customerQty = parseWeight(line.customerQty || 0);
    const sellLabor = parseFmt(line.sellLabor || 0);
    const sellAddedGold = parseWeight(line.sellAddedGold || 0);
    const sellCutGold = parseWeight(line.sellCutGold || 0);
    const itemGoldWeight = parseWeight(line.itemGoldWeight || 0);
    const inventoryBaseGoldWeight = itemGoldWeight > 0 ? itemGoldWeight : 1;
    const isGold = effectiveCat === 'gold';
    const isTrade = line.tx === 'trade';
    const usesInventory = isGold && INVENTORY_TXS.has(line.tx);
    const isInventoryProductLocked = usesInventory && Boolean(line.itemId);
    const effectiveGoldQty = (line.tx === 'sell' || line.tx === 'trade') && effectiveCat === 'gold'
        ? Math.max(0, (isInventoryProductLocked ? inventoryBaseGoldWeight : baseQty) + sellAddedGold - sellCutGold)
        : baseQty;
    const billableQty = (line.tx === 'sell' || line.tx === 'trade') && effectiveCat === 'gold' ? effectiveGoldQty : baseQty;
    const inventoryValue = Math.round(billableQty * parseFmt(curRate));
    const goldEditorAmount = (line.tx === 'sell' || line.tx === 'trade') && effectiveCat === 'gold'
        ? Math.round(inventoryValue + sellLabor)
        : inventoryValue;
    const tradeAdjustmentAmount = Math.round(parseFmt(line.tradeComp || 0));
    const tradeCustomerAmount = isTrade ? Math.round(customerQty * parseFmt(customerRate)) : 0;
    const tradeAmount = Math.round(goldEditorAmount - tradeCustomerAmount + tradeAdjustmentAmount);
    const value = line.tx === 'trade' ? tradeAmount : goldEditorAmount;
    const entryMode = usesInventory ? normalizeGoldEntryMode(line.entryMode) : '';
    const txTheme = getTxTheme(line.tx);
    const lineAccent = txTheme.accent;
    const lineBorder = txTheme.border;
    const inventorySuggestions = usesInventory && String(catalogQuery || '').trim()
        ? filterInventoryItems(inventoryItems, catalogQuery)
        : [];
    const isSellGold = line.tx === 'sell' && isGold;
    const isTradeGold = isTrade && isGold;
    const displayPositive = isTrade ? value >= 0 : isPositiveTransaction(line.tx);
    const sellBaseGoldWeight = isInventoryProductLocked ? inventoryBaseGoldWeight : baseQty;
    const formulaParts = [];
    const appendFormulaOperator = (sign) => {
        if (formulaParts.length > 0) formulaParts.push(sign);
        else if (sign === '-') formulaParts.push(sign);
    };
    const appendFormulaRateTerm = (sign, quantity, price) => {
        if (quantity <= 0 || parseFmt(price) <= 0) return;
        appendFormulaOperator(sign);
        formulaParts.push(formatWeight(quantity), '*', fmtCalc(price));
    };
    const appendFormulaMoneyTerm = (sign, amount) => {
        if (amount <= 0) return;
        appendFormulaOperator(sign);
        formulaParts.push(fmtCalc(amount));
    };
    if (isSellGold) {
        appendFormulaRateTerm('+', sellBaseGoldWeight, sellRate);
        appendFormulaMoneyTerm('+', sellLabor);
        appendFormulaRateTerm('+', sellAddedGold, sellRate);
        appendFormulaRateTerm('-', sellCutGold, sellRate);
    } else if (isTradeGold) {
        appendFormulaRateTerm('+', sellBaseGoldWeight, tradeRate);
        appendFormulaMoneyTerm('+', sellLabor);
        appendFormulaRateTerm('+', sellAddedGold, tradeRate);
        appendFormulaRateTerm('-', sellCutGold, tradeRate);
        appendFormulaRateTerm('-', customerQty, customerRate);
        appendFormulaMoneyTerm('+', parseFmt(line.tradeComp || 0));
    } else if (line.tx === 'buy' && isGold) {
        appendFormulaRateTerm('+', baseQty, buyRate);
    }
    const tradeMoneySuggestionId = `trade-money-suggestions-${line.id}`;
    const sellMoneySuggestionId = `sell-money-suggestions-${line.id}`;
    const quantityStep = 1;
    const goldAdjustStep = 0.1;
    const sellMoneyStep = 1000;
    const tradeComboWidth = '100%';
    const txOptions = [
        { key: 'sell', label: 'BÁN', color: getTxTheme('sell').gradient },
        { key: 'trade', label: 'ĐỔI', color: getTxTheme('trade').gradient },
        { key: 'buy', label: 'MUA DẺ', color: getTxTheme('buy').gradient },
    ];

    const normalizeNonNegativeNumberInput = (raw) => {
        const cleaned = String(raw ?? '')
            .replace(/,/g, '.')
            .replace(/[^0-9.]/g, '')
            .replace(/(\..*)\./g, '$1');
        if (cleaned === '') return '';
        const nextValue = Number(cleaned);
        if (!Number.isFinite(nextValue) || nextValue < 0) return '0';
        return cleaned;
    };
    const formatSteppedValue = (num, step) => (
        step < 1
            ? num.toFixed(1).replace(/\.0$/, '')
            : String(Math.max(0, Math.round(num)))
    );
    const adjustQty = (delta) => {
        const nextValue = Math.max(0, parseFmt(line.qty || 0) + delta);
        set('qty', formatSteppedValue(nextValue, quantityStep));
    };
    const adjustGoldField = (field, delta) => {
        const nextValue = Math.max(0, parseWeight(line[field] || 0) + delta);
        set(field, formatSteppedValue(nextValue, goldAdjustStep));
    };
    const adjustSellLabor = (delta) => {
        const nextValue = Math.max(0, parseFmt(line.sellLabor || 0) + delta);
        set('sellLabor', Math.round(nextValue));
    };
    const adjustTradeComp = (delta) => {
        const nextValue = Math.max(0, parseFmt(line.tradeComp || 0) + delta);
        set('tradeComp', Math.round(nextValue));
    };
    const parseInventoryLabor = (value) => {
        const raw = String(value ?? '').trim();
        if (!raw) return 0;
        let normalized = raw;
        if (raw.includes(',') && raw.includes('.')) {
            normalized = raw.replace(/,/g, '');
        } else if (raw.includes(',')) {
            const parts = raw.split(',');
            normalized = parts.length === 2 && parts[1].length <= 2
                ? `${parts[0]}.${parts[1]}`
                : raw.replace(/,/g, '');
        }
        const amount = Number(normalized);
        if (Number.isFinite(amount) && amount > 0) return Math.round(amount * 1000);
        const fallback = parseFmt(raw);
        return fallback > 0 ? Math.round(fallback * 1000) : 0;
    };

    // notify parent of computed value
    useEffect(() => {
        onChange({ value, tx: line.tx });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [line.qty, line.product, effectiveCat, line.tx, line.customSell, line.customBuy, line.customTrade, line.tradeLabor, line.tradeComp, line.sellLabor, line.sellAddedGold, line.sellCutGold, line.customerQty, line.customerProduct, line.customerCustomBuy, line.itemGoldWeight, line.itemId]);

    useEffect(() => {
        if (!isGold) return;
        if (line.product && selectableProducts.includes(line.product)) return;
        const fallbackProduct = selectableProducts[0] || '';
        if (fallbackProduct && fallbackProduct !== line.product) {
            onChange({ product: fallbackProduct });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isGold, selectableProducts.join('|')]);

    useEffect(() => {
        if (!isTrade || line.cat === 'gold') return;
        onChange({ cat: 'gold' });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isTrade, line.cat]);

    useEffect(() => {
        if (!isInventoryProductLocked) return;
        if (String(line.qty || '') === '1') return;
        onChange({ qty: '1' });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isInventoryProductLocked, line.qty]);

    useEffect(() => {
        if (!isTrade) return;
        if (!line.customerProduct && goldProducts.length) {
            onChange({ customerProduct: goldProducts[0] });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isTrade, goldProducts.join('|')]);

    useEffect(() => {
        const normalizedLine = sanitizeLineInventoryState(line);
        const patch = {};
        if ((normalizedLine.entryMode || '') !== (line.entryMode || '')) patch.entryMode = normalizedLine.entryMode;
        if ((normalizedLine.productCode || '') !== (line.productCode || '')) patch.productCode = normalizedLine.productCode;
        if ((normalizedLine.itemName || '') !== (line.itemName || '')) patch.itemName = normalizedLine.itemName;
        if ((normalizedLine.itemGoldWeight || '') !== (line.itemGoldWeight || '')) patch.itemGoldWeight = normalizedLine.itemGoldWeight || '';
        if ((normalizedLine.itemId ?? null) !== (line.itemId ?? null)) patch.itemId = normalizedLine.itemId ?? null;
        if (Object.keys(patch).length) onChange(patch);
    }, [line, onChange]);

    useEffect(() => {
        setCatalogQuery(line.productCode || '');
    }, [line.productCode]);

    const set = (k, v) => onChange({ [k]: v });
    const handleProductChange = (nextProduct) => {
        onChange({
            product: nextProduct,
            customSell: undefined,
            customBuy: undefined,
            customTrade: undefined,
        });
    };
    const handleCustomerProductChange = (nextProduct) => {
        onChange({
            customerProduct: nextProduct,
            customerCustomBuy: undefined,
        });
    };

    const applyInventoryItem = (item, source = entryMode) => {
        if (!item) {
            setLookupMessage('');
            return;
        }
        if (isUnavailableInventoryItem(item)) {
            setLookupMessage('');
            return;
        }
        const nextProduct = item.tuoi_vang && (rates.gold?.[item.tuoi_vang] || products.includes(item.tuoi_vang))
            ? item.tuoi_vang
            : (line.product || products[0] || '');
        onChange({
            entryMode: source,
            itemId: item.id,
            itemName: item.ncc || '',
            itemGoldWeight: item.tl_vang || '',
            productCode: item.ma_hang || '',
            product: nextProduct,
            customSell: undefined,
            customBuy: undefined,
            customTrade: undefined,
            sellLabor: usesInventory ? parseInventoryLabor(item.cong_le) : '',
            qty: usesInventory ? '1' : (line.qty || '0'),
        });
        setCatalogQuery(item.ma_hang || item.ncc || '');
        setLookupMessage('');
    };

    const handleCatalogInputChange = (nextQuery) => {
        setCatalogQuery(nextQuery);
        setLookupMessage('');
        if (!String(nextQuery || '').trim()) {
            onChange({
                entryMode: 'catalog',
                itemId: null,
                itemName: '',
                itemGoldWeight: '',
                productCode: '',
            });
            return;
        }
        onChange({ entryMode: 'catalog' });
        const matched = findInventoryByCode(inventoryItems, nextQuery);
        if (matched) applyInventoryItem(matched, 'catalog');
    };

    const handleScannedCode = (scannedCode, source = 'camera') => {
        const nextCode = String(scannedCode || '').trim();
        if (!nextCode) {
            setLookupMessage('Không đọc được mã sản phẩm.');
            return false;
        }
        onChange({ productCode: nextCode, entryMode: source });
        setCatalogQuery(nextCode);
        const matched = findInventoryByCode(inventoryItems, nextCode);
        if (matched) {
            applyInventoryItem(matched, source);
            setLookupMessage(`Đã đọc mã ${nextCode}.`);
            return true;
        }
        setLookupMessage('Không tìm thấy mã trong kho.');
        return true;
    };

    const handleScanDetected = async (scannedCode) => {
        setScanLoading(true);
        try {
            return handleScannedCode(scannedCode, 'camera');
        } catch {
            setLookupMessage('Không đọc được QR hoặc mã vạch.');
            return false;
        } finally {
            setScanLoading(false);
        }
    };

    const handleScanFile = async (file) => {
        if (!file) return false;
        setScanLoading(true);
        try {
            const scannedCode = await scanCodeFromFile(file);
            return handleScannedCode(scannedCode, 'camera');
        } catch {
            setLookupMessage('Không đọc được QR hoặc mã vạch.');
            return false;
        } finally {
            setScanLoading(false);
        }
    };

    return (
        <div style={{ ...S.card, border: `2px solid ${lineBorder}` }}>
            {showRemove && (
                <button
                    onClick={onRemove}
                    style={{
                        ...S.iconBtn(txTheme.gradient),
                        border: 'none',
                        width: 20,
                        height: 20,
                        fontSize: 13,
                        fontWeight: 400,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        position: 'absolute',
                        top: -4,
                        right: -4,
                        zIndex: 2,
                        color: '#ffffff',
                        padding: 0,
                    }}
                    aria-label="Xóa dòng hàng"
                    title="Xóa dòng hàng"
                >
                    <IoCloseOutline />
                </button>
            )}

            {/* Loại giao dịch */}
            <div style={S.toggleRow}>
                {txOptions.map(t => (
                    <button key={t.key} style={S.toggleOpt(line.tx === t.key, t.color)}
                        onClick={() => {
                            if (t.key === line.tx) return;
                            const nextUsesGoldEditor = t.key === 'sell' || t.key === 'trade';
                            const nextCat = t.key === 'trade' ? 'gold' : line.cat;
                            const nextProduct = t.key === 'trade'
                                ? (rates.gold?.[line.product] ? line.product : firstProductForCategory(rates, 'gold'))
                                : line.product;
                            const nextLine = sanitizeLineInventoryState({ ...line, tx: t.key, cat: nextCat, product: nextProduct });
                            onChange({
                                tx: t.key,
                                cat: nextCat,
                                product: nextProduct,
                                entryMode: nextLine.entryMode,
                                itemId: nextLine.itemId,
                                itemName: nextLine.itemName,
                                itemGoldWeight: nextLine.itemGoldWeight || '',
                                productCode: nextLine.productCode,
                                sellLabor: nextUsesGoldEditor ? (line.sellLabor || '') : '',
                                sellAddedGold: nextUsesGoldEditor ? (line.sellAddedGold || '') : '',
                                sellCutGold: nextUsesGoldEditor ? (line.sellCutGold || '') : '',
                                customerProduct: t.key === 'trade' ? (line.customerProduct || nextProduct || '') : '',
                                customerQty: t.key === 'trade' ? (line.customerQty || '') : '',
                                tradeLabor: t.key === 'trade' ? (line.tradeLabor || '') : '',
                                tradeComp: t.key === 'trade' ? (line.tradeComp || '') : '',
                            });
                            if (!INVENTORY_TXS.has(t.key)) {
                                setLookupMessage('');
                                setCatalogQuery('');
                            }
                        }}>
                        {t.label}
                    </button>
                ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
                {/* Danh mục */}
                {!isTrade && (
                    <div>
                        <span style={S.label}>Phân loại</span>
                        <div style={S.toggleRow}>
                            {cats.map(c => (
                                <button key={c} style={S.toggleOpt(line.cat === c, txTheme.gradient)}
                                    onClick={() => {
                                        const nextProduct = firstProductForCategory(rates, c);
                                        const nextLine = sanitizeLineInventoryState({ ...line, cat: c, product: nextProduct });
                                        onChange({
                                            cat: c,
                                            product: nextProduct,
                                            itemId: nextLine.itemId,
                                            itemName: nextLine.itemName,
                                            itemGoldWeight: nextLine.itemGoldWeight || '',
                                            productCode: nextLine.productCode,
                                            entryMode: nextLine.entryMode,
                                        });
                                        setLookupMessage('');
                                        setCatalogQuery('');
                                    }}>
                                    {c === 'gold' ? 'Vàng' : 'Ngoại tệ'}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {isTradeGold ? (
                    <>
                        <GoldBuyFieldGroup
                            title="DẺ"
                            productOptions={goldBuyProductOptions}
                            product={line.customerProduct || ''}
                            onProductChange={handleCustomerProductChange}
                            tradeComboWidth={tradeComboWidth}
                            qty={line.customerQty || ''}
                            onQtyChange={raw => set('customerQty', normalizeNonNegativeNumberInput(raw))}
                            adjustQty={delta => {
                                const nextValue = Math.max(0, parseWeight(line.customerQty || 0) + delta);
                                set('customerQty', formatSteppedValue(nextValue, quantityStep));
                            }}
                            quantityStep={quantityStep}
                            lineAccent={lineAccent}
                            txTheme={txTheme}
                            rateValue={fmtCalc(customerRate)}
                            onRateChange={raw => onChange({ customerCustomBuy: normalizeTradeRate('gold', raw) })}
                        />
                        <GoldSaleFieldGroup
                            title="VÀNG MỚI"
                            productOptions={products.map(option => ({ value: option, label: option }))}
                            product={line.product}
                            onProductChange={handleProductChange}
                            productLocked={isInventoryProductLocked}
                            tradeComboWidth={tradeComboWidth}
                            inventoryLookupProps={{
                                usesInventory,
                                S,
                                txTheme,
                                catalogQuery,
                                handleCatalogInputChange,
                                handleScanDetected,
                                handleScanFile,
                                scanLoading,
                                scanMessage: lookupMessage,
                                suggestionItems: inventorySuggestions,
                                onSelectSuggestion: item => applyInventoryItem(item, 'catalog'),
                                line,
                                lineAccent,
                            }}
                            qty={line.qty}
                            onQtyChange={raw => set('qty', normalizeNonNegativeNumberInput(raw))}
                            adjustQty={adjustQty}
                            quantityStep={quantityStep}
                            qtyLocked={isInventoryProductLocked}
                            lineAccent={lineAccent}
                            txTheme={txTheme}
                            rateLabel="Giá bán"
                            rateValue={fmtCalc(tradeRate)}
                            onRateChange={raw => onChange({ customTrade: normalizeTradeRate('gold', raw) })}
                            line={line}
                            goldAdjustStep={goldAdjustStep}
                            sellMoneyStep={sellMoneyStep}
                            sellMoneySuggestionId={sellMoneySuggestionId}
                            tradeMoneySuggestionId={tradeMoneySuggestionId}
                            showTradeComp
                            normalizeNonNegativeNumberInput={normalizeNonNegativeNumberInput}
                            adjustGoldField={adjustGoldField}
                            adjustSellLabor={adjustSellLabor}
                            adjustTradeComp={adjustTradeComp}
                            set={set}
                        />
                    </>
                ) : isGold && line.tx === 'sell' ? (
                    <GoldSaleFieldGroup
                        productOptions={productOptions}
                        product={line.product}
                        onProductChange={handleProductChange}
                        productLocked={isInventoryProductLocked}
                        tradeComboWidth={tradeComboWidth}
                        inventoryLookupProps={{
                            usesInventory,
                            S,
                            txTheme,
                            catalogQuery,
                            handleCatalogInputChange,
                            handleScanDetected,
                            handleScanFile,
                            scanLoading,
                            scanMessage: lookupMessage,
                            suggestionItems: inventorySuggestions,
                            onSelectSuggestion: item => applyInventoryItem(item, 'catalog'),
                            line,
                            lineAccent,
                        }}
                        qty={line.qty}
                        onQtyChange={raw => set('qty', normalizeNonNegativeNumberInput(raw))}
                        adjustQty={adjustQty}
                        quantityStep={quantityStep}
                        qtyLocked={isInventoryProductLocked}
                        lineAccent={lineAccent}
                        txTheme={txTheme}
                        rateLabel="Giá bán"
                        rateValue={fmtCalc(sellRate)}
                        onRateChange={raw => onChange({ customSell: normalizeTradeRate('gold', raw) })}
                        line={line}
                        goldAdjustStep={goldAdjustStep}
                        sellMoneyStep={sellMoneyStep}
                        sellMoneySuggestionId={sellMoneySuggestionId}
                        normalizeNonNegativeNumberInput={normalizeNonNegativeNumberInput}
                        adjustGoldField={adjustGoldField}
                        adjustSellLabor={adjustSellLabor}
                        set={set}
                    />
                ) : isGold && line.tx === 'buy' ? (
                    <GoldBuyFieldGroup
                        productOptions={goldBuyProductOptions}
                        product={line.product}
                        onProductChange={handleProductChange}
                        tradeComboWidth={tradeComboWidth}
                        qty={line.qty}
                        onQtyChange={raw => set('qty', normalizeNonNegativeNumberInput(raw))}
                        adjustQty={adjustQty}
                        quantityStep={quantityStep}
                        lineAccent={lineAccent}
                        txTheme={txTheme}
                        rateValue={fmtCalc(buyRate)}
                        onRateChange={raw => onChange({ customBuy: normalizeTradeRate('gold', raw) })}
                    />
                ) : (
                    <>
                        <div>
                            <span style={S.label}>{isGold ? 'Tuổi vàng' : 'Loại ngoại tệ'}</span>
                            <select
                                style={{
                                    ...S.inp,
                                    textAlign: 'center',
                                    textAlignLast: 'center',
                                    padding: '9px 36px 9px 12px',
                                    appearance: 'none',
                                    WebkitAppearance: 'none',
                                    MozAppearance: 'none',
                                    backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 20 20' fill='none'%3E%3Cpath d='M5 7.5L10 12.5L15 7.5' stroke='%23111827' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")",
                                    backgroundRepeat: 'no-repeat',
                                    backgroundPosition: 'calc(100% - 20px) center',
                                    backgroundSize: '14px 14px',
                                    cursor: 'pointer',
                                }}
                                value={line.product}
                                onChange={e => handleProductChange(e.target.value)}>
                                {productOptions.map(option => (
                                    <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <span style={S.label}>{isGold ? 'Số lượng' : 'Số tiền'}</span>
                            <input
                                style={S.inp}
                                type="number"
                                inputMode="decimal"
                                min="0"
                                step={quantityStep}
                                value={line.qty}
                                onChange={e => set('qty', normalizeNonNegativeNumberInput(e.target.value))}
                            />
                        </div>
                        <div>
                            <span style={S.label}>
                                {line.tx === 'buy' ? 'Tỷ giá mua' : 'Tỷ giá bán'}
                            </span>
                            <FormattedNumberInput
                                style={{ ...S.inp, color: lineAccent }}
                                value={fmtCalc(curRate)}
                                onValueChange={raw => {
                                    const v = normalizeTradeRate(line.cat, raw);
                                    if (line.tx === 'buy') onChange({ customBuy: v });
                                    else onChange({ customSell: v });
                                }}
                            />
                        </div>
                    </>
                )}
            </div>

            {/* Amount */}
            <div style={{ marginTop: 10 }}>
                {formulaParts.length > 0 && (
                    <div
                        style={{
                            marginBottom: 4,
                            fontSize: '75%',
                            lineHeight: 1.35,
                            color: '#64748b',
                            textAlign: 'right',
                            fontWeight: 500,
                        }}
                    >
                        {formulaParts.map((part, idx) => {
                            const isOperator = part === '+' || part === '-' || part === '*';
                            return (
                                <span
                                    key={`${part}-${idx}`}
                                    style={isOperator ? { color: POS_RED, fontWeight: 700 } : undefined}
                                >
                                    {part}
                                </span>
                            );
                        })}
                    </div>
                )}
                <span data-sale-amount="true" style={calcValueStyle(lineAccent, 21)}>
                    {displayPositive ? '+' : '-'}{fmtCalc(value)}
                </span>
            </div>
        </div>
    );
}

