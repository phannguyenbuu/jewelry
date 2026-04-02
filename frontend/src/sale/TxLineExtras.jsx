import { useEffect, useState } from 'react';
import { IoChevronDownOutline, IoChevronUpOutline } from 'react-icons/io5';

import FormattedNumberInput from './FormattedNumberInput';
import { S, VN_MONEY_SUGGESTIONS, fmtCalc, normalizeTradeRate, parseWeight } from './shared';

function StepButtons({ txTheme, lineAccent, onIncrease, onDecrease, increaseLabel, decreaseLabel }) {
    return (
        <div style={{ display: 'grid', gridTemplateRows: '1fr 1fr', gap: 4 }}>
            <button
                type="button"
                onClick={onIncrease}
                style={{
                    borderRadius: 10,
                    border: `1px solid ${txTheme.softBorder}`,
                    background: txTheme.softBg,
                    color: lineAccent,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    padding: 0,
                }}
                aria-label={increaseLabel}
                title={increaseLabel}
            >
                <IoChevronUpOutline />
            </button>
            <button
                type="button"
                onClick={onDecrease}
                style={{
                    borderRadius: 10,
                    border: `1px solid ${txTheme.softBorder}`,
                    background: txTheme.softBg,
                    color: lineAccent,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    padding: 0,
                }}
                aria-label={decreaseLabel}
                title={decreaseLabel}
            >
                <IoChevronDownOutline />
            </button>
        </div>
    );
}

function GoldAdjustField({
    line,
    txTheme,
    lineAccent,
    goldAdjustStep,
    normalizeNonNegativeNumberInput,
    adjustGoldField,
    set,
}) {
    const [mode, setMode] = useState(() => {
        const added = parseWeight(line?.sellAddedGold || 0);
        const cut = parseWeight(line?.sellCutGold || 0);
        return cut > 0 && added <= 0 ? 'cut' : 'add';
    });

    useEffect(() => {
        const added = parseWeight(line?.sellAddedGold || 0);
        const cut = parseWeight(line?.sellCutGold || 0);
        if (cut > 0 && added <= 0 && mode !== 'cut') setMode('cut');
        if (added > 0 && cut <= 0 && mode !== 'add') setMode('add');
    }, [line?.sellAddedGold, line?.sellCutGold, mode]);

    const activeField = mode === 'add' ? 'sellAddedGold' : 'sellCutGold';
    const inactiveField = mode === 'add' ? 'sellCutGold' : 'sellAddedGold';
    const activeValue = line?.[activeField] || '';
    const activeLabel = mode === 'add' ? 'Thêm vàng' : 'Bớt vàng';

    const setActiveValue = (raw) => {
        const nextValue = normalizeNonNegativeNumberInput(raw);
        set(activeField, nextValue);
        if (String(line?.[inactiveField] || '').trim()) set(inactiveField, '');
    };

    const switchMode = (nextMode) => {
        if (nextMode === mode) return;
        const nextField = nextMode === 'add' ? 'sellAddedGold' : 'sellCutGold';
        const currentField = mode === 'add' ? 'sellAddedGold' : 'sellCutGold';
        const carryValue = line?.[currentField] || '';
        setMode(nextMode);
        set(currentField, '');
        set(nextField, carryValue);
    };

    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
                <span style={S.label}>{activeLabel}</span>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    {[
                        { key: 'add', label: '+', title: 'Chọn thêm vàng' },
                        { key: 'cut', label: '-', title: 'Chọn bớt vàng' },
                    ].map((item) => {
                        const active = mode === item.key;
                        return (
                            <button
                                key={item.key}
                                type="button"
                                onClick={() => switchMode(item.key)}
                                aria-label={item.title}
                                title={item.title}
                                style={{
                                    width: 28,
                                    height: 28,
                                    borderRadius: '50%',
                                    border: active ? 'none' : `1px solid ${txTheme.softBorder}`,
                                    background: active ? lineAccent : '#ffffff',
                                    color: active ? '#ffffff' : lineAccent,
                                    fontSize: 16,
                                    fontWeight: 900,
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    boxShadow: active ? '0 8px 18px rgba(15,23,42,.12)' : 'none',
                                    padding: 0,
                                    lineHeight: 1,
                                }}
                            >
                                {item.label}
                            </button>
                        );
                    })}
                </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 32px', gap: 6 }}>
                <FormattedNumberInput
                    style={S.inp}
                    inputMode="decimal"
                    allowDecimal
                    maxDecimals={4}
                    value={activeValue}
                    onValueChange={setActiveValue}
                    placeholder="0"
                />
                <StepButtons
                    txTheme={txTheme}
                    lineAccent={lineAccent}
                    onIncrease={() => adjustGoldField(activeField, goldAdjustStep)}
                    onDecrease={() => adjustGoldField(activeField, -goldAdjustStep)}
                    increaseLabel={mode === 'add' ? 'Tăng thêm vàng' : 'Tăng bớt vàng'}
                    decreaseLabel={mode === 'add' ? 'Giảm thêm vàng' : 'Giảm bớt vàng'}
                />
            </div>
        </div>
    );
}

export function MoneyField({
    label,
    placeholder,
    value,
    list,
    txTheme,
    lineAccent,
    onValueChange,
    onIncrease,
    onDecrease,
    increaseLabel,
    decreaseLabel,
}) {
    return (
        <div>
            <span style={S.label}>{label}</span>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 32px', gap: 6 }}>
                <FormattedNumberInput
                    list={list}
                    style={{ ...S.inp, color: lineAccent }}
                    value={value}
                    onValueChange={onValueChange}
                    placeholder={placeholder}
                />
                <StepButtons
                    txTheme={txTheme}
                    lineAccent={lineAccent}
                    onIncrease={onIncrease}
                    onDecrease={onDecrease}
                    increaseLabel={increaseLabel}
                    decreaseLabel={decreaseLabel}
                />
            </div>
        </div>
    );
}

export default function TxLineExtras({
    visible,
    line,
    txTheme,
    lineAccent,
    goldAdjustStep,
    sellMoneyStep,
    sellMoneySuggestionId,
    tradeMoneySuggestionId,
    showTradeComp = false,
    normalizeNonNegativeNumberInput,
    adjustGoldField,
    adjustSellLabor,
    adjustTradeComp,
    set,
    hideLaborField = false,
}) {
    if (!visible) return null;

    return (
        <div style={{ gridColumn: '1 / -1' }}>
            <div style={{ display: 'grid', gap: 10 }}>
                {!hideLaborField && (
                    <div style={{ display: 'grid', gridTemplateColumns: showTradeComp ? '1fr 1fr' : '1fr', gap: 10 }}>
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
                        {showTradeComp && (
                            <MoneyField
                                label="Bù"
                                placeholder="Nhập tiền bù"
                                list={tradeMoneySuggestionId || sellMoneySuggestionId}
                                txTheme={txTheme}
                                lineAccent={lineAccent}
                                value={line.tradeComp ? fmtCalc(line.tradeComp) : ''}
                                onValueChange={raw => set('tradeComp', normalizeTradeRate('money', raw))}
                                onIncrease={() => adjustTradeComp(sellMoneyStep)}
                                onDecrease={() => adjustTradeComp(-sellMoneyStep)}
                                increaseLabel="Tăng bù"
                                decreaseLabel="Giảm bù"
                            />
                        )}
                    </div>
                )}

                <GoldAdjustField
                    line={line}
                    txTheme={txTheme}
                    lineAccent={lineAccent}
                    goldAdjustStep={goldAdjustStep}
                    normalizeNonNegativeNumberInput={normalizeNonNegativeNumberInput}
                    adjustGoldField={adjustGoldField}
                    set={set}
                />
            </div>
            <datalist id={sellMoneySuggestionId}>
                {VN_MONEY_SUGGESTIONS.map(option => (
                    <option key={option} value={option} />
                ))}
            </datalist>
            {showTradeComp && tradeMoneySuggestionId && tradeMoneySuggestionId !== sellMoneySuggestionId && (
                <datalist id={tradeMoneySuggestionId}>
                    {VN_MONEY_SUGGESTIONS.map(option => (
                        <option key={option} value={option} />
                    ))}
                </datalist>
            )}
        </div>
    );
}

export function TradeMoneyFields() {
    return null;
}
