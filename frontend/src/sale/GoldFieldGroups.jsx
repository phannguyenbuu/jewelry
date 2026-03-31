import { IoChevronDownOutline, IoChevronUpOutline } from 'react-icons/io5';

import FormattedNumberInput from './FormattedNumberInput';
import TxLineExtras from './TxLineExtras.jsx';
import TxLineInventoryLookup from './TxLineInventoryLookup';
import { S } from './shared';

function ProductSelect({ value, onChange, options, disabled = false, width = '100%' }) {
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
                cursor: disabled ? 'not-allowed' : 'pointer',
                opacity: disabled ? 0.72 : 1,
                backgroundColor: disabled ? '#f8fafc' : 'rgba(255,255,255,.96)',
                width,
            }}
            value={value}
            disabled={disabled}
            onChange={e => {
                if (disabled) return;
                onChange(e.target.value);
            }}
        >
            {options.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
            ))}
        </select>
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
        <div>
            <span style={S.label}>{label}</span>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 32px', gap: 6 }}>
                <input
                    style={{ ...S.inp, ...inputStyle, opacity: disabled ? 0.72 : 1, background: disabled ? '#f8fafc' : S.inp.background }}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step={step}
                    value={value}
                    readOnly={disabled}
                    onChange={e => {
                        if (disabled) return;
                        onChange(e.target.value);
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
}) {
    return (
        <>
            {title ? (
                <div style={{ gridColumn: '1 / -1', marginTop: 2, paddingTop: 10, borderTop: `1px solid ${txTheme.softBorder}` }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, alignItems: 'end' }}>
                        <span style={S.label}>{title}</span>
                        <div style={{ width: '100%' }}>
                            <ProductSelect
                                value={product}
                                onChange={onProductChange}
                                options={productOptions}
                                disabled={productLocked}
                                width={tradeComboWidth}
                            />
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

            <TxLineInventoryLookup {...inventoryLookupProps} />

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

            <div>
                <span style={S.label}>{rateLabel}</span>
                <FormattedNumberInput
                    style={{ ...S.inp, color: lineAccent }}
                    value={rateValue}
                    onValueChange={onRateChange}
                />
            </div>

            <TxLineExtras
                visible
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
            />
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
}) {
    return (
        <>
            {title ? (
                <div style={{ gridColumn: '1 / -1' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, alignItems: 'end' }}>
                        <span style={S.label}>{title}</span>
                        <div style={{ width: '100%' }}>
                            <ProductSelect
                                value={product}
                                onChange={onProductChange}
                                options={productOptions}
                                width={tradeComboWidth}
                            />
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

            <QuantityField
                label="Số lượng"
                value={qty}
                onChange={onQtyChange}
                adjust={adjustQty}
                step={quantityStep}
                lineAccent={lineAccent}
                txTheme={txTheme}
            />

            <div>
                <span style={S.label}>Giá mua</span>
                <FormattedNumberInput
                    style={{ ...S.inp, color: lineAccent }}
                    value={rateValue}
                    onValueChange={onRateChange}
                />
            </div>
        </>
    );
}
