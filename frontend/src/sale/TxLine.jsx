import { useEffect, useState } from 'react';
import { IoChevronDownOutline, IoChevronUpOutline, IoCloseOutline } from 'react-icons/io5';
import FormattedNumberInput from './FormattedNumberInput';
import { GoldBuyFieldGroup, GoldSaleFieldGroup } from './GoldFieldGroups';
import { MoneyField } from './TxLineExtras.jsx';
import { BUY_GOLD_OTHER_OPTION, INVENTORY_TXS, POS_RED, S, TRADE_COMP_SUGGESTIONS, calcValueStyle, filterInventoryItems, findInventoryByCode, fmtCalc, formatBuyGoldProductLabel, formatWeight, getGoldAgeProductValues, getLineSellAddedGoldWeight, getLineSellCutGoldWeight, getLineSellLaborAmount, getPreferredGoldAgeProduct, getTradeBaseAmount, getTradeCompensationAmount, getTradeCompensationQuantity, getTradeCompensationUnitAmount, getTradeOldGoldQuantity, getTradeQuantityDirection, getTxTheme, inventoryStatusLabel, isPositiveTransaction, isUnavailableInventoryItem, normalizeGoldEntryMode, normalizeTradeRate, parseFmt, parseWeight, sanitizeLineInventoryState, scanCodeFromFile } from './shared';

export default function TxLine({ line, rates, inventoryItems, onChange, onRemove, showRemove }) {
    const effectiveCat = line.tx === 'trade' ? 'gold' : line.cat;
    const goldProducts = getGoldAgeProductValues(rates);
    const preferredTradeGoldProduct = getPreferredGoldAgeProduct(rates);
    const orderedTradeGoldProducts = preferredTradeGoldProduct
        ? [preferredTradeGoldProduct, ...goldProducts.filter(product => product !== preferredTradeGoldProduct)]
        : goldProducts;
    const products = effectiveCat === 'gold'
        ? (line.tx === 'trade' ? orderedTradeGoldProducts : goldProducts)
        : Object.keys(rates[effectiveCat] || {});
    const tradeOldProductOptions = orderedTradeGoldProducts.length ? [
        ...orderedTradeGoldProducts.map(product => ({ value: product, label: formatBuyGoldProductLabel(product) })),
        { value: BUY_GOLD_OTHER_OPTION, label: BUY_GOLD_OTHER_OPTION },
    ] : [];
    const tradeOldProductValues = tradeOldProductOptions.map(option => option.value);
    const goldBuyProductOptions = goldProducts.length ? [
        ...goldProducts.map(product => ({ value: product, label: formatBuyGoldProductLabel(product) })),
        { value: BUY_GOLD_OTHER_OPTION, label: BUY_GOLD_OTHER_OPTION },
    ] : [];
    const productOptions = line.tx === 'buy' && effectiveCat === 'gold'
        ? goldBuyProductOptions
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
    const effectiveCustomerProduct = line.customerProduct || preferredTradeGoldProduct || tradeOldProductValues[0] || goldProducts[0] || '';
    const _custBuyRaw = rates.gold?.[effectiveCustomerProduct]?.[1] || 0;
    const customerRate = normalizeTradeRate(
        'gold',
        hasCustomerCustomBuy
            ? line.customerCustomBuy
            : _custBuyRaw
    );
    const baseQty = parseFmt(line.qty);
    const tradeOldExpanded = Boolean(line.tradeOldExpanded);
    const tradeNewExpanded = line.tradeNewExpanded !== false; // default true
    const sellLabor = getLineSellLaborAmount(line);
    const sellAddedGold = getLineSellAddedGoldWeight(line);
    const sellCutGold = getLineSellCutGoldWeight(line);
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
    const tradeQuantityDirection = isTrade ? getTradeQuantityDirection(line) : 'equal';
    const tradeOldGoldQty = isTrade ? getTradeOldGoldQuantity(line) : 0;
    const tradeBaseAmount = isTrade ? getTradeBaseAmount(line, tradeRate, customerRate) : 0;
    const tradeCompensationQty = isTrade ? getTradeCompensationQuantity(line) : 0;
    const tradeCompensationUnitAmount = isTrade ? getTradeCompensationUnitAmount(line) : 0;
    const tradeAdjustmentAmount = isTrade ? getTradeCompensationAmount(line) : 0;
    const tradeAmount = Math.round(tradeBaseAmount + sellLabor + tradeAdjustmentAmount);
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
    const appendFormulaGroupedRateTerm = (sign, leftQty, rightQty, price, { allowZero = false } = {}) => {
        const normalizedPrice = Math.max(0, parseFmt(price));
        if (!allowZero && (Math.max(0, leftQty - rightQty) <= 0 || normalizedPrice <= 0)) return;
        appendFormulaOperator(sign);
        if (rightQty <= 0) {
            formulaParts.push(formatWeight(leftQty), '*', fmtCalc(normalizedPrice));
            return;
        }
        formulaParts.push(`(${formatWeight(leftQty)}-${formatWeight(rightQty)})`, '*', fmtCalc(normalizedPrice));
    };
    if (isSellGold) {
        appendFormulaRateTerm('+', sellBaseGoldWeight, sellRate);
        appendFormulaMoneyTerm('+', sellLabor);
        appendFormulaRateTerm('+', sellAddedGold, sellRate);
        appendFormulaRateTerm('-', sellCutGold, sellRate);
    } else if (isTradeGold && (effectiveGoldQty > 0 || tradeOldGoldQty > 0)) {
        const tradeBaseSign = tradeQuantityDirection === 'old' ? '-' : '+';
        const tradeBaseLeftQty = tradeQuantityDirection === 'old' ? tradeOldGoldQty : effectiveGoldQty;
        const tradeBaseRightQty = tradeQuantityDirection === 'old' ? effectiveGoldQty : tradeOldGoldQty;
        const tradeBaseRate = tradeQuantityDirection === 'old' ? customerRate : tradeRate;
        const tradeCompSign = tradeQuantityDirection === 'old' ? '-' : '+';
        appendFormulaGroupedRateTerm(tradeBaseSign, tradeBaseLeftQty, tradeBaseRightQty, tradeBaseRate, { allowZero: true });
        appendFormulaMoneyTerm('+', sellLabor);
        appendFormulaRateTerm(tradeCompSign, tradeCompensationQty, tradeCompensationUnitAmount);
    } else if (line.tx === 'buy' && isGold) {
        appendFormulaRateTerm('+', baseQty, buyRate);
    }
    const tradeMoneySuggestionId = `trade-money-suggestions-${line.id}`;
    const sellMoneySuggestionId = `sell-money-suggestions-${line.id}`;
    const quantityStep = 1;
    const goldAdjustStep = 0.1;
    const sellMoneyStep = 1000;
    const tradeComboWidth = '100%';
    const tradeGroupToggleStyle = {
        width: 28,
        height: 28,
        borderRadius: '50%',
        border: `1px solid ${txTheme.softBorder}`,
        background: '#ffffff',
        color: lineAccent,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        padding: 0,
        flexShrink: 0,
        boxShadow: '0 6px 14px rgba(15,23,42,.08)',
    };

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
    }, [line.qty, line.product, effectiveCat, line.tx, line.customSell, line.customBuy, line.customTrade, line.tradeLabor, line.tradeComp, line.sellLabor, line.sellAddedGold, line.sellCutGold, line.customerQty, line.customerProduct, line.customerCustomBuy, line.itemGoldWeight, line.itemId, line.tradeOldExpanded]);

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

    // Luon dung Vang, khong con Ngoai te
    useEffect(() => {
        if (line.cat !== 'gold') onChange({ cat: 'gold' });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [line.cat]);

    useEffect(() => {
        if (!isInventoryProductLocked) return;
        if (String(line.qty || '') === '1') return;
        onChange({ qty: '1' });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isInventoryProductLocked, line.qty]);

    useEffect(() => {
        if (!isTrade) return;
        const productValid = line.customerProduct && tradeOldProductValues.includes(line.customerProduct);
        if (!productValid && tradeOldProductValues.length) {
            onChange({ customerProduct: preferredTradeGoldProduct || tradeOldProductValues[0] });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isTrade, preferredTradeGoldProduct, tradeOldProductValues.join('|')]);

    useEffect(() => {
        const added = parseWeight(line.sellAddedGold || 0);
        const cut = parseWeight(line.sellCutGold || 0);
        if (added <= 0 || cut <= 0) return;
        const net = added - cut;
        if (net > 0) {
            onChange({ sellAddedGold: formatWeight(net), sellCutGold: '' });
            return;
        }
        if (net < 0) {
            onChange({ sellAddedGold: '', sellCutGold: formatWeight(Math.abs(net)) });
            return;
        }
        onChange({ sellAddedGold: '', sellCutGold: '' });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [line.sellAddedGold, line.sellCutGold]);

    useEffect(() => {
        const normalizedLine = sanitizeLineInventoryState(line);
        const patch = {};
        if ((normalizedLine.entryMode || '') !== (line.entryMode || '')) patch.entryMode = normalizedLine.entryMode;
        if ((normalizedLine.productCode || '') !== (line.productCode || '')) patch.productCode = normalizedLine.productCode;
        if ((normalizedLine.itemName || '') !== (line.itemName || '')) patch.itemName = normalizedLine.itemName;
        if ((normalizedLine.itemGoldWeight || '') !== (line.itemGoldWeight || '')) patch.itemGoldWeight = normalizedLine.itemGoldWeight || '';
        if ((normalizedLine.itemStoneWeight || '') !== (line.itemStoneWeight || '')) patch.itemStoneWeight = normalizedLine.itemStoneWeight || '';
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
    const handleInventoryProductChange = (nextProduct) => {
        setCatalogQuery('');
        setLookupMessage('');
        const patch = {
            product: nextProduct,
            customSell: undefined,
            customBuy: undefined,
            customTrade: undefined,
        };
        if (line.itemId || line.productCode || line.itemName || line.itemGoldWeight || line.itemStoneWeight) {
            patch.entryMode = 'catalog';
            patch.itemId = null;
            patch.itemName = '';
            patch.itemGoldWeight = '';
            patch.itemStoneWeight = '';
            patch.productCode = '';
            patch.sellLabor = '';
        }
        onChange(patch);
    };
    const handleCustomerProductChange = (nextProduct) => {
        onChange({
            customerProduct: nextProduct,
            customerCustomBuy: undefined,
        });
    };

    const buildLookupResetPatch = (nextCode = '', source = 'catalog') => ({
        entryMode: source,
        itemId: null,
        itemName: '',
        itemGoldWeight: '',
        itemStoneWeight: '',
        productCode: nextCode,
        sellLabor: '',
    });

    const applyInventoryItem = (item, source = entryMode) => {
        if (!item) {
            setLookupMessage('San pham khong tim thay.');
            return false;
        }
        if (isUnavailableInventoryItem(item)) {
            setLookupMessage(`San pham ${item.ma_hang || item.ncc || ''} dang o trang thai ${inventoryStatusLabel(item)}, khong the chon.`);
            return false;
        }
        const nextProduct = item.tuoi_vang && goldProducts.includes(item.tuoi_vang)
            ? item.tuoi_vang
            : (line.product || goldProducts[0] || '');
        onChange({
            entryMode: source,
            itemId: item.id,
            itemName: item.ncc || '',
            itemGoldWeight: item.tl_vang || '',
            itemStoneWeight: item.tl_da || '',
            productCode: item.ma_hang || '',
            product: nextProduct,
            customSell: undefined,
            customBuy: undefined,
            customTrade: undefined,
            sellLabor: usesInventory ? parseInventoryLabor(item.cong_le) : '',
            qty: usesInventory ? '1' : (line.qty || '0'),
        });
        setCatalogQuery(item.ma_hang || item.ncc || '');
        setLookupMessage(`Da chon san pham ${item.ma_hang || 'khong ro ma'}${item.ncc ? ` · ${item.ncc}` : ''}.`);
        return true;
    };

    const handleCatalogInputChange = (nextQuery) => {
        setCatalogQuery(nextQuery);
        setLookupMessage('');
        if (!String(nextQuery || '').trim()) {
            onChange(buildLookupResetPatch('', 'catalog'));
            return;
        }
        onChange(buildLookupResetPatch(nextQuery, 'catalog'));
        const matched = findInventoryByCode(inventoryItems, nextQuery);
        if (matched) applyInventoryItem(matched, 'catalog');
    };

    const handleScannedCode = (scannedCode, source = 'camera') => {
        const nextCode = String(scannedCode || '').trim();
        if (!nextCode) {
            setLookupMessage('Không đọc được mã sản phẩm.');
            return false;
        }
        onChange(buildLookupResetPatch(nextCode, source));
        setCatalogQuery(nextCode);
        const matched = findInventoryByCode(inventoryItems, nextCode);
        if (matched) return applyInventoryItem(matched, source);
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
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 0 }}>
                {isTradeGold ? (
                    <>
                        <GoldBuyFieldGroup
                            title="Dẻ"
                            productOptions={tradeOldProductOptions}
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
                            panelStyle={{
                                background: 'linear-gradient(180deg, rgba(240,253,244,.98) 0%, rgba(220,252,231,.94) 100%)',
                                border: '1px solid rgba(134,239,172,.92)',
                            }}
                            showGroupFields={tradeOldExpanded}
                            headerToggle={
                                <button
                                    type="button"
                                    onClick={() => onChange({ tradeOldExpanded: !tradeOldExpanded })}
                                    style={tradeGroupToggleStyle}
                                    aria-expanded={tradeOldExpanded}
                                    aria-label={tradeOldExpanded ? 'Thu gọn Dẻ' : 'Mở rộng Dẻ'}
                                    title={tradeOldExpanded ? 'Thu gọn Dẻ' : 'Mở rộng Dẻ'}
                                >
                                    {tradeOldExpanded ? <IoChevronUpOutline /> : <IoChevronDownOutline />}
                                </button>
                            }
                            buField={
                                <MoneyField
                                    label="Bù"
                                    placeholder="Nhập tiền bù"
                                    txTheme={txTheme}
                                    lineAccent={lineAccent}
                                    value={line.tradeComp ? fmtCalc(line.tradeComp) : ''}
                                    onValueChange={raw => set('tradeComp', normalizeTradeRate('money', raw))}
                                    onIncrease={() => adjustTradeComp(sellMoneyStep)}
                                    onDecrease={() => adjustTradeComp(-sellMoneyStep)}
                                    increaseLabel="Tăng bù"
                                    decreaseLabel="Giảm bù"
                                    suggestions={TRADE_COMP_SUGGESTIONS}
                                    onSuggestionSelect={v => set('tradeComp', normalizeTradeRate('money', v))}
                                />
                            }
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
                                integratedPicker: true,
                                onPickerProductChange: handleInventoryProductChange,
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
                            inlineRateAndLabor
                            showGroupFields={tradeNewExpanded}
                            headerToggle={
                                <button
                                    type="button"
                                    onClick={() => onChange({ tradeNewExpanded: !tradeNewExpanded })}
                                    style={tradeGroupToggleStyle}
                                    aria-expanded={tradeNewExpanded}
                                    aria-label={tradeNewExpanded ? 'Thu gọn Vàng mới' : 'Mở rộng Vàng mới'}
                                    title={tradeNewExpanded ? 'Thu gọn Vàng mới' : 'Mở rộng Vàng mới'}
                                >
                                    {tradeNewExpanded ? <IoChevronUpOutline /> : <IoChevronDownOutline />}
                                </button>
                            }
                            line={line}
                            goldAdjustStep={goldAdjustStep}
                            sellMoneyStep={sellMoneyStep}
                            sellMoneySuggestionId={sellMoneySuggestionId}
                            tradeMoneySuggestionId={tradeMoneySuggestionId}
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
                            <FormattedNumberInput
                                style={S.inp}
                                inputMode="decimal"
                                allowDecimal
                                maxDecimals={4}
                                value={line.qty}
                                onValueChange={raw => set('qty', normalizeNonNegativeNumberInput(raw))}
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

