import { useEffect, useLayoutEffect, useRef, useState } from 'react';

const RAW_CHAR_PATTERN = /[0-9.-]/;

const addThousandsSeparators = (value) => String(value || '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');

const sanitizeNumericDraft = (raw, { allowDecimal = false, allowNegative = false, maxDecimals = undefined } = {}) => {
    const text = String(raw ?? '');
    let negative = false;
    let integer = '';
    let decimal = '';
    let hasDecimal = false;

    for (const char of text) {
        if (char >= '0' && char <= '9') {
            if (hasDecimal) {
                if (maxDecimals === undefined || decimal.length < maxDecimals) decimal += char;
            } else {
                integer += char;
            }
            continue;
        }
        if (allowDecimal && char === '.' && !hasDecimal) {
            hasDecimal = true;
            continue;
        }
        if (allowNegative && char === '-' && !negative && !integer && !decimal && !hasDecimal) {
            negative = true;
        }
    }

    integer = integer.replace(/^0+(?=\d)/, '');
    if (!integer && !decimal && !hasDecimal) return negative ? '-' : '';
    if (!integer && hasDecimal) integer = '0';
    return `${negative ? '-' : ''}${integer}${hasDecimal ? `.${decimal}` : ''}`;
};

const formatNumericDraft = (raw, { allowDecimal = false, emptyWhenZero = false } = {}) => {
    const normalized = String(raw ?? '');
    if (!normalized) return '';
    if (normalized === '-') return '-';

    const negative = normalized.startsWith('-');
    const unsigned = negative ? normalized.slice(1) : normalized;
    const hasTrailingDecimal = allowDecimal && unsigned.endsWith('.');
    const [integerPartRaw = '', decimalPart = ''] = unsigned.split('.');
    const integerPart = integerPartRaw || '0';
    const groupedInteger = addThousandsSeparators(integerPart);
    const formatted = `${negative ? '-' : ''}${groupedInteger}${hasTrailingDecimal ? '.' : decimalPart ? `.${decimalPart}` : ''}`;

    if (!emptyWhenZero) return formatted;
    return Number(normalized || 0) === 0 && !hasTrailingDecimal ? '' : formatted;
};

const mapRawLengthToCaret = (formatted, rawLength) => {
    if (rawLength <= 0) return 0;
    let consumed = 0;
    for (let index = 0; index < formatted.length; index += 1) {
        if (RAW_CHAR_PATTERN.test(formatted[index])) consumed += 1;
        if (consumed >= rawLength) return index + 1;
    }
    return formatted.length;
};

export default function FormattedNumberInput({
    value,
    onValueChange,
    style,
    placeholder,
    list,
    inputMode = 'numeric',
    allowDecimal = false,
    allowNegative = false,
    maxDecimals = undefined,
    commitOnBlur = false,
    emptyWhenZero = false,
    ...rest
}) {
    const options = { allowDecimal, allowNegative, maxDecimals };
    const inputRef = useRef(null);
    const [isFocused, setIsFocused] = useState(false);
    const [draft, setDraft] = useState(() => {
        const sanitized = sanitizeNumericDraft(value, options);
        return formatNumericDraft(sanitized, { allowDecimal, emptyWhenZero });
    });
    const draftRawRef = useRef(sanitizeNumericDraft(value, options));
    const selectionRef = useRef(null);

    useEffect(() => {
        const sanitized = sanitizeNumericDraft(value, options);
        if (isFocused && sanitized === draftRawRef.current) return;
        draftRawRef.current = sanitized;
        setDraft(formatNumericDraft(sanitized, { allowDecimal, emptyWhenZero }));
    }, [allowDecimal, allowNegative, emptyWhenZero, isFocused, maxDecimals, value]);

    useLayoutEffect(() => {
        if (selectionRef.current === null || !inputRef.current) return;
        inputRef.current.setSelectionRange(selectionRef.current, selectionRef.current);
        selectionRef.current = null;
    }, [draft]);

    return (
        <input
            {...rest}
            ref={inputRef}
            list={list}
            style={style}
            type="text"
            inputMode={inputMode}
            value={draft}
            placeholder={placeholder}
            onFocus={(e) => {
                setIsFocused(true);
                rest.onFocus?.(e);
            }}
            onBlur={(e) => {
                setIsFocused(false);
                const sanitized = sanitizeNumericDraft(draft, options);
                draftRawRef.current = sanitized;
                const formatted = formatNumericDraft(sanitized, { allowDecimal, emptyWhenZero });
                setDraft(formatted);
                if (commitOnBlur) onValueChange?.(sanitized);
                rest.onBlur?.(e);
            }}
            onChange={(e) => {
                const nextValue = e.target.value;
                const caretPosition = e.target.selectionStart ?? nextValue.length;
                const sanitized = sanitizeNumericDraft(nextValue, options);
                const sanitizedBeforeCaret = sanitizeNumericDraft(nextValue.slice(0, caretPosition), options);
                const formatted = formatNumericDraft(sanitized, { allowDecimal, emptyWhenZero: false });
                draftRawRef.current = sanitized;
                selectionRef.current = mapRawLengthToCaret(formatted, sanitizedBeforeCaret.length);
                setDraft(formatted);
                if (!commitOnBlur) onValueChange?.(sanitized);
                rest.onChange?.(e);
            }}
        />
    );
}
