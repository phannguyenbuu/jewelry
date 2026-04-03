import { IoChevronDownOutline, IoChevronUpOutline } from 'react-icons/io5';

import FormattedNumberInput from './FormattedNumberInput';
import TxLineExtras, { MoneyField } from './TxLineExtras.jsx';
import TxLineInventoryLookup, { InventoryProductLookupField } from './TxLineInventoryLookup';
import { S, fmtCalc, normalizeTradeRate } from './shared';

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
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, alignItems: 'end' }}>
                <div style={{ width: '100%' }}>
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
                        <div style={{ overflow: 'hidden', display: 'grid', gap: 10, paddingTop: showGroupFields ? 2 : 0 }}>
                            {titleProductBlock}

                            {inlineRateAndLabor ? (
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, alignItems: 'end' }}>
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
                                <div style={{ overflow: 'hidden', display: 'grid', gap: 10, paddingTop: showSupplementalFields ? 2 : 0 }}>
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
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, alignItems: 'end' }}>
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
                    <div style={{ overflow: 'hidden', display: 'grid', gap: 10, paddingTop: showSupplementalFields ? 2 : 0 }}>
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
                <div style={titledPanelStyle}>
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
                        <div style={{ overflow: 'hidden', display: 'grid', gap: 10, paddingTop: showGroupFields ? 2 : 0 }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, alignItems: 'end' }}>
                                <div style={{ width: '100%' }}>
                                    <ProductSelect
                                        value={product}
                                        onChange={onProductChange}
                                        options={productOptions}
                                        width={tradeComboWidth}
                                    />
                                </div>
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

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, alignItems: 'end' }}>
                                <div>
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
