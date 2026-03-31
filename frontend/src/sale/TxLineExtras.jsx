import { IoChevronDownOutline, IoChevronUpOutline } from 'react-icons/io5';

import FormattedNumberInput from './FormattedNumberInput';
import { S, VN_MONEY_SUGGESTIONS, fmtCalc, normalizeTradeRate } from './shared';

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

function MoneyField({
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
}) {
    if (!visible) return null;

    return (
        <div style={{ gridColumn: '1 / -1' }}>
            <div style={{ display: 'grid', gap: 10 }}>
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

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {[
                        ['sellAddedGold', 'Thêm vàng', 'Tăng thêm vàng', 'Giảm thêm vàng'],
                        ['sellCutGold', 'Cắt vàng', 'Tăng cắt vàng', 'Giảm cắt vàng'],
                    ].map(([field, label, incTitle, decTitle]) => (
                        <div key={field}>
                            <span style={S.label}>{label}</span>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 32px', gap: 6 }}>
                                <input
                                    style={S.inp}
                                    type="number"
                                    inputMode="decimal"
                                    min="0"
                                    step={goldAdjustStep}
                                    value={line[field] || ''}
                                    onChange={e => set(field, normalizeNonNegativeNumberInput(e.target.value))}
                                    placeholder="0"
                                />
                                <StepButtons
                                    txTheme={txTheme}
                                    lineAccent={lineAccent}
                                    onIncrease={() => adjustGoldField(field, goldAdjustStep)}
                                    onDecrease={() => adjustGoldField(field, -goldAdjustStep)}
                                    increaseLabel={incTitle}
                                    decreaseLabel={decTitle}
                                />
                            </div>
                        </div>
                    ))}
                </div>
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
