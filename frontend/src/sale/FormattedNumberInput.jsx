import { useState } from 'react';

import { fmtCalc, parseFmt } from './shared';

const sanitizeNumericDraft = (raw) => String(raw ?? '').replace(/[^0-9]/g, '');

export default function FormattedNumberInput({
    value,
    onValueChange,
    style,
    placeholder,
    list,
    inputMode = 'numeric',
    ...rest
}) {
    const numericValue = parseFmt(value);
    const [isFocused, setIsFocused] = useState(false);
    const [draft, setDraft] = useState('');

    return (
        <input
            {...rest}
            list={list}
            style={style}
            type="text"
            inputMode={inputMode}
            value={isFocused ? draft : (numericValue > 0 ? fmtCalc(numericValue) : '')}
            placeholder={placeholder}
            onFocus={(e) => {
                setIsFocused(true);
                setDraft(numericValue > 0 ? String(Math.round(numericValue)) : '');
                rest.onFocus?.(e);
            }}
            onBlur={(e) => {
                const sanitized = sanitizeNumericDraft(draft);
                setIsFocused(false);
                setDraft(sanitized);
                onValueChange(sanitized);
                rest.onBlur?.(e);
            }}
            onChange={(e) => {
                const sanitized = sanitizeNumericDraft(e.target.value);
                setDraft(sanitized);
                onValueChange(sanitized);
                rest.onChange?.(e);
            }}
        />
    );
}
