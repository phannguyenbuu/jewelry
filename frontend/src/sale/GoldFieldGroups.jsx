import { useRef, useState } from 'react';
import { IoChevronDownOutline, IoChevronUpOutline } from 'react-icons/io5';

import FormattedNumberInput from './FormattedNumberInput';
import TxLineExtras, { MoneyField } from './TxLineExtras.jsx';
import TxLineInventoryLookup, { InventoryProductLookupField } from './TxLineInventoryLookup';
import { S, fmtCalc, normalizeTradeRate } from './shared';

const TWO_COLUMN_FIELDS = 'minmax(0, 1fr) minmax(0, 1fr)';
const FIELD_COLUMN_GAP = 6;
const FIELD_STACK_GAP = 8;
const FIELD_STEPPER_WIDTH = 30;
const FIELD_STEPPER_GAP = 4;

function ProductSelect({ value, onChange, options, disabled = false, width = '100%' }) {
    const safeOptions = options.length ? options : [{ value: '', label: 'Loading...' }];
    const safeValue = safeOptions.some(option => String(option.value) === String(value)) ? value : safeOptions[0].value;
    const isDisabled = disabled || options.length === 0;
    return (
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
                cursor: isDisabled ? 'not-allowed' : 'pointer',
                opacity: isDisabled ? 0.72 : 1,
                backgroundColor: isDisabled ? '#f8fafc' : 'rgba(255,255,255,.96)',
                width,
            }}
            value={safeValue}
            disabled={isDisabled}
            onChange={e => {
                if (isDisabled) return;
                onChange(e.target.value);
            }}
        >
            {safeOptions.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
            ))}
        </select>
    );
}

function ProductGridPickerLegacy({
    value,
    onChange,
    options,
    txTheme,
    width = '100%',
    placeholder = 'Chọn tuổi vàng',
    sectionLabel = 'Tuổi vàng',
}) {
    const [open, setOpen] = useState(false);
    const rootRef = useRef(null);
    const safeOptions = options.length ? options : [{ value: '', label: 'Loading...' }];
    const selectedOption = safeOptions.find((option) => String(option.value) === String(value));
    const loading = options.length === 0;
    const pickerOpen = open && !loading;

    return (
        <div
            ref={rootRef}
            style={{ width, minWidth: 0 }}
            onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) {
                    setOpen(false);
                }
            }}
        >
            <button
                type="button"
                disabled={loading}
                onClick={() => {
                    if (loading) return;
                    setOpen((prev) => !prev);
                }}
                aria-expanded={pickerOpen}
                aria-label={pickerOpen ? 'Thu gọn chọn tuổi vàng' : 'Mở chọn tuổi vàng'}
                style={{
                    ...S.inp,
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    padding: '9px 12px',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    background: pickerOpen ? '#f8fbff' : S.inp.background,
                    borderColor: pickerOpen ? txTheme.border : '#dbe4ee',
                    opacity: loading ? 0.72 : 1,
                }}
            >
                <span style={{ flex: 1, minWidth: 0, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#111827' }}>
                    {loading ? 'Loading...' : (selectedOption?.label || value || placeholder)}
                </span>
                <IoChevronDownOutline style={{ fontSize: 16, color: '#475569', flexShrink: 0, transform: pickerOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform .18s ease' }} />
            </button>

            {pickerOpen ? (
                <div style={{ marginTop: 8, borderRadius: 18, border: '1px solid #dbe4ee', background: '#ffffff', boxShadow: '0 18px 36px rgba(15,23,42,.12)', padding: 8, display: 'grid', gap: 6 }}>
                    <span style={{ ...S.label, marginBottom: 0 }}>{sectionLabel}</span>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6 }}>
                        {safeOptions.map((option) => {
                            const active = String(option.value) === String(value);
                            return (
                                <button
                                    key={option.value}
                                    type="button"
                                    onClick={() => {
                                        onChange(option.value);
                                        setOpen(false);
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
        </div>
    );
}

function GridPickerTrigger({
    value,
    options,
    txTheme,
    open,
    onToggle,
    width = '100%',
    placeholder = 'Chá»n tuá»•i vÃ ng',
}) {
    const safeOptions = options.length ? options : [{ value: '', label: 'Loading...' }];
    const selectedOption = safeOptions.find((option) => String(option.value) === String(value));
    const loading = options.length === 0;
    const pickerOpen = open && !loading;

    return (
        <button
            type="button"
            disabled={loading}
            onClick={() => {
                if (loading) return;
                onToggle?.();
            }}
            aria-expanded={pickerOpen}
            aria-label={pickerOpen ? 'Thu gá»n chá»n tuá»•i vÃ ng' : 'Má»Ÿ chá»n tuá»•i vÃ ng'}
            style={{
                ...S.inp,
                width,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                padding: '9px 12px',
                cursor: loading ? 'not-allowed' : 'pointer',
                background: pickerOpen ? '#f8fbff' : S.inp.background,
                borderColor: pickerOpen ? txTheme.border : '#dbe4ee',
                opacity: loading ? 0.72 : 1,
            }}
        >
            <span style={{ flex: 1, minWidth: 0, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#111827' }}>
                {loading ? 'Loading...' : (selectedOption?.label || value || placeholder)}
            </span>
            <IoChevronDownOutline style={{ fontSize: 16, color: '#475569', flexShrink: 0, transform: pickerOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform .18s ease' }} />
        </button>
    );
}

function GridPickerMenu({
    value,
    onChange,
    options,
    txTheme,
    sectionLabel = 'Tuá»•i vÃ ng',
}) {
    if (!options.length) return null;

    return (
        <div style={{ marginTop: 8, borderRadius: 18, border: '1px solid #dbe4ee', background: '#ffffff', boxShadow: '0 18px 36px rgba(15,23,42,.12)', padding: 8, display: 'grid', gap: 6 }}>
            <span style={{ ...S.label, marginBottom: 0 }}>{sectionLabel}</span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6 }}>
                {options.map((option) => {
                    const active = String(option.value) === String(value);
                    return (
                        <button
                            key={option.value}
                            type="button"
                            onClick={() => onChange(option.value)}
                            style={{
                                minHeight: 54,
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
    );
}

function QuantityField({
    label,
    value,
    onChange,
    adjust,
    step,
    lineAccent,
    txTheme,
    disabled = false,
    inputStyle,
}) {
    return (
        <div style={{ minWidth: 0 }}>
            <span style={S.label}>{label}</span>
            <div style={{ display: 'grid', gridTemplateColumns: `minmax(0, 1fr) ${FIELD_STEPPER_WIDTH}px`, gap: FIELD_STEPPER_GAP }}>
                <FormattedNumberInput
                    style={{ ...S.inp, ...inputStyle, opacity: disabled ? 0.72 : 1, background: disabled ? '#f8fafc' : S.inp.background }}
                    inputMode="decimal"
                    allowDecimal
                    maxDecimals={4}
                    value={value}
                    readOnly={disabled}
                    onValueChange={raw => {
                        if (disabled) return;
                        onChange(raw);
                    }}
                />
                <div style={{ display: 'grid', gridTemplateRows: '1fr 1fr', gap: 4 }}>
                    <button
                        type="button"
                        onClick={() => {
                            if (disabled) return;
                            adjust(step);
                        }}
                        disabled={disabled}
                        style={{
                            borderRadius: 10,
                            border: `1px solid ${txTheme.softBorder}`,
                            background: txTheme.softBg,
                            color: lineAccent,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: disabled ? 'not-allowed' : 'pointer',
                            opacity: disabled ? 0.45 : 1,
                            padding: 0,
                        }}
                        aria-label={`Tăng ${label.toLowerCase()}`}
                        title={`Tăng ${label.toLowerCase()}`}
                    >
                        <IoChevronUpOutline />
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            if (disabled) return;
                            adjust(-step);
                        }}
                        disabled={disabled}
                        style={{
                            borderRadius: 10,
                            border: `1px solid ${txTheme.softBorder}`,
                            background: txTheme.softBg,
                            color: lineAccent,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: disabled ? 'not-allowed' : 'pointer',
                            opacity: disabled ? 0.45 : 1,
                            padding: 0,
                        }}
                        aria-label={`Giảm ${label.toLowerCase()}`}
                        title={`Giảm ${label.toLowerCase()}`}
                    >
                        <IoChevronDownOutline />
                    </button>
                </div>
            </div>
        </div>
    );
}

export function GoldSaleFieldGroup({
    title,
    productOptions,
    product,
    onProductChange,
    productLocked,
    tradeComboWidth,
    inventoryLookupProps,
    qty,
    onQtyChange,
    adjustQty,
    quantityStep,
    qtyLocked,
    lineAccent,
    txTheme,
    rateLabel,
    rateValue,
    onRateChange,
    line,
    goldAdjustStep,
    sellMoneyStep,
    sellMoneySuggestionId,
    tradeMoneySuggestionId,
    showTradeComp,
    normalizeNonNegativeNumberInput,
    adjustGoldField,
    adjustSellLabor,
    adjustTradeComp,
    set,
    showSupplementalFields = true,
    supplementalToggle = null,
    showGroupFields = true,
    headerToggle = null,
    inlineRateAndLabor = false,
}) {
    const rateField = (
        <div>
            <span style={S.label}>{rateLabel}</span>
            <FormattedNumberInput
                style={{ ...S.inp, color: lineAccent }}
                value={rateValue}
                onValueChange={onRateChange}
            />
        </div>
    );

    const laborField = (
        <MoneyField
            label="Tiền công"
            placeholder="Nhập tiền công"
            list={sellMoneySuggestionId}
            txTheme={txTheme}
            lineAccent={lineAccent}
            value={line.sellLabor ? fmtCalc(line.sellLabor) : ''}
            onValueChange={raw => set('sellLabor', normalizeTradeRate('money', raw))}
            onIncrease={() => adjustSellLabor(sellMoneyStep)}
            onDecrease={() => adjustSellLabor(-sellMoneyStep)}
            increaseLabel="Tăng tiền công"
            decreaseLabel="Giảm tiền công"
        />
    );

    const supplementalExtras = (
        <TxLineExtras
            visible={showSupplementalFields}
            line={line}
            txTheme={txTheme}
            lineAccent={lineAccent}
            goldAdjustStep={goldAdjustStep}
            sellMoneyStep={sellMoneyStep}
            sellMoneySuggestionId={sellMoneySuggestionId}
            tradeMoneySuggestionId={tradeMoneySuggestionId}
            showTradeComp={showTradeComp}
            normalizeNonNegativeNumberInput={normalizeNonNegativeNumberInput}
            adjustGoldField={adjustGoldField}
            adjustSellLabor={adjustSellLabor}
            adjustTradeComp={adjustTradeComp}
            set={set}
            hideLaborField
        />
    );

    const primaryQtyField = (
        <QuantityField
            label="Số lượng"
            value={qty}
            onChange={onQtyChange}
            adjust={adjustQty}
            step={quantityStep}
            lineAccent={lineAccent}
            txTheme={txTheme}
            disabled={qtyLocked}
        />
    );

    const showIntegratedInventoryPicker = Boolean(inventoryLookupProps?.integratedPicker);
    const titleProductBlock = showIntegratedInventoryPicker ? (
        <InventoryProductLookupField
            {...inventoryLookupProps}
            productOptions={productOptions}
            product={product}
            onProductChange={inventoryLookupProps?.onPickerProductChange || onProductChange}
            qtyField={primaryQtyField}
            width={tradeComboWidth}
        />
    ) : (
        <>
            <div style={{ display: 'grid', gridTemplateColumns: TWO_COLUMN_FIELDS, gap: FIELD_COLUMN_GAP, alignItems: 'end' }}>
                <div style={{ width: '100%', minWidth: 0 }}>
                    <ProductSelect
                        value={product}
                        onChange={onProductChange}
                        options={productOptions}
                        disabled={productLocked}
                        width={tradeComboWidth}
                    />
                </div>
                {primaryQtyField}
            </div>

            <TxLineInventoryLookup {...inventoryLookupProps} />
        </>
    );

    return (
        <>
            {title ? (
                <div style={{ gridColumn: '1 / -1', marginTop: 2, paddingTop: 10, borderTop: `1px solid ${txTheme.softBorder}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
                        <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#16a34a', letterSpacing: '.04em' }}>{title}</span>
                        {headerToggle}
                    </div>
                    <div
                        style={{
                            display: 'grid',
                            gridTemplateRows: showGroupFields ? '1fr' : '0fr',
                            transition: 'grid-template-rows .24s ease, opacity .24s ease',
                            opacity: showGroupFields ? 1 : 0.72,
                        }}
                    >
                        <div style={{ overflow: 'hidden', display: 'grid', gap: FIELD_STACK_GAP, paddingTop: showGroupFields ? 2 : 0 }}>
                            {titleProductBlock}

                            {inlineRateAndLabor ? (
                                <div style={{ display: 'grid', gridTemplateColumns: TWO_COLUMN_FIELDS, gap: FIELD_COLUMN_GAP, alignItems: 'end' }}>
                                    {rateField}
                                    {laborField}
                                </div>
                            ) : rateField}

                            {supplementalToggle}

                            <div
                                style={{
                                    display: 'grid',
                                    gridTemplateRows: showSupplementalFields ? '1fr' : '0fr',
                                    transition: 'grid-template-rows .24s ease, opacity .24s ease',
                                    opacity: showSupplementalFields ? 1 : 0.72,
                                }}
                            >
                                <div style={{ overflow: 'hidden', display: 'grid', gap: FIELD_STACK_GAP, paddingTop: showSupplementalFields ? 2 : 0 }}>
                                    {!inlineRateAndLabor && laborField}
                                    {supplementalExtras}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div>
                    <span style={S.label}>Tuổi vàng</span>
                    <ProductSelect
                        value={product}
                        onChange={onProductChange}
                        options={productOptions}
                        disabled={productLocked}
                    />
                </div>
            )}

            {!title && primaryQtyField}

            {!title && <TxLineInventoryLookup {...inventoryLookupProps} />}

            {!title && (inlineRateAndLabor ? (
                <div style={{ display: 'grid', gridTemplateColumns: TWO_COLUMN_FIELDS, gap: FIELD_COLUMN_GAP, alignItems: 'end' }}>
                    {rateField}
                    {laborField}
                </div>
            ) : rateField)}

            {!title && supplementalToggle}

            {!title && (
                <div
                    style={{
                        display: 'grid',
                        gridTemplateRows: showSupplementalFields ? '1fr' : '0fr',
                        transition: 'grid-template-rows .24s ease, opacity .24s ease',
                        opacity: showSupplementalFields ? 1 : 0.72,
                    }}
                >
                    <div style={{ overflow: 'hidden', display: 'grid', gap: FIELD_STACK_GAP, paddingTop: showSupplementalFields ? 2 : 0 }}>
                        {!inlineRateAndLabor && laborField}
                        {supplementalExtras}
                    </div>
                </div>
            )}
        </>
    );
}

export function GoldBuyFieldGroup({
    title,
    productOptions,
    product,
    onProductChange,
    tradeComboWidth,
    qty,
    onQtyChange,
    adjustQty,
    quantityStep,
    lineAccent,
    txTheme,
    rateValue,
    onRateChange,
    buField,
    showGroupFields = true,
    headerToggle = null,
    panelStyle = null,
}) {
    const [productPickerOpen, setProductPickerOpen] = useState(false);
    const pickerLoading = productOptions.length === 0;
    const pickerOpen = productPickerOpen && !pickerLoading;
    const titledPanelStyle = panelStyle
        ? {
            gridColumn: '1 / -1',
            padding: '10px 12px 12px',
            borderRadius: 18,
            background: '#f0fdf4',
            border: '1px solid #bbf7d0',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,.65)',
            ...panelStyle,
        }
        : { gridColumn: '1 / -1' };

    return (
        <>
            {title ? (
                <div
                    style={titledPanelStyle}
                    onBlur={(event) => {
                        if (!event.currentTarget.contains(event.relatedTarget)) {
                            setProductPickerOpen(false);
                        }
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
                        <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#16a34a', letterSpacing: '.04em' }}>{title}</span>
                        {headerToggle}
                    </div>
                    <div
                        style={{
                            display: 'grid',
                            gridTemplateRows: showGroupFields ? '1fr' : '0fr',
                            transition: 'grid-template-rows .24s ease, opacity .24s ease',
                            opacity: showGroupFields ? 1 : 0.72,
                        }}
                    >
                        <div style={{ overflow: 'hidden', display: 'grid', gap: FIELD_STACK_GAP, paddingTop: showGroupFields ? 2 : 0 }}>
                            <div style={{ display: 'grid', gridTemplateColumns: TWO_COLUMN_FIELDS, gap: FIELD_COLUMN_GAP, alignItems: 'end' }}>
                                <GridPickerTrigger
                                    value={product}
                                    options={productOptions}
                                    txTheme={txTheme}
                                    open={pickerOpen}
                                    onToggle={() => {
                                        if (pickerLoading) return;
                                        setProductPickerOpen((prev) => !prev);
                                    }}
                                    width={tradeComboWidth}
                                    placeholder="Chọn tuổi vàng"
                                />
                                <QuantityField
                                    label="Số lượng"
                                    value={qty}
                                    onChange={onQtyChange}
                                    adjust={adjustQty}
                                    step={quantityStep}
                                    lineAccent={lineAccent}
                                    txTheme={txTheme}
                                />
                            </div>

                            {pickerOpen ? (
                                <GridPickerMenu
                                    value={product}
                                    onChange={(nextProduct) => {
                                        onProductChange(nextProduct);
                                        setProductPickerOpen(false);
                                    }}
                                    options={productOptions}
                                    txTheme={txTheme}
                                    sectionLabel={title || 'Dẻ'}
                                />
                            ) : null}

                            <div style={{ display: 'grid', gridTemplateColumns: TWO_COLUMN_FIELDS, gap: FIELD_COLUMN_GAP, alignItems: 'end' }}>
                                <div style={{ minWidth: 0 }}>
                                    <span style={S.label}>Giá mua</span>
                                    <FormattedNumberInput
                                        style={{ ...S.inp, color: lineAccent }}
                                        value={rateValue}
                                        onValueChange={onRateChange}
                                    />
                                </div>
                                {buField || null}
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div>
                    <span style={S.label}>Tuổi vàng</span>
                    <ProductSelect
                        value={product}
                        onChange={onProductChange}
                        options={productOptions}
                    />
                </div>
            )}

            {!title && (
                <QuantityField
                    label="Số lượng"
                    value={qty}
                    onChange={onQtyChange}
                    adjust={adjustQty}
                    step={quantityStep}
                    lineAccent={lineAccent}
                    txTheme={txTheme}
                />
            )}

            {!title && (
                <>
                    <div>
                        <span style={S.label}>Giá mua</span>
                        <FormattedNumberInput
                            style={{ ...S.inp, color: lineAccent }}
                            value={rateValue}
                            onValueChange={onRateChange}
                        />
                    </div>

                    {buField || null}
                </>
            )}
        </>
    );
}
