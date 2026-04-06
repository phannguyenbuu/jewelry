import { IoLockClosedOutline, IoLockOpenOutline, IoTrashOutline } from 'react-icons/io5';
import FormattedNumberInput from './FormattedNumberInput';

const CORNER_SVG_URL = '/border.svg';
const SIGN_BG_URL = '/sign-check.jfif';

const fmtMoney = (value) => Math.round(Number(value || 0)).toLocaleString('en-US');
const pad2 = (value) => String(value || '').padStart(2, '0');

const todayText = () => {
    const now = new Date();
    return `${pad2(now.getDate())}/${pad2(now.getMonth() + 1)}/${now.getFullYear()}`;
};

const words1k = (num) => {
    const digits = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
    const hundred = Math.floor(num / 100);
    const ten = Math.floor((num % 100) / 10);
    const unit = num % 10;
    const parts = [];

    if (hundred > 0) parts.push(digits[hundred], 'trăm');
    if (ten > 1) {
        parts.push(digits[ten], 'mươi');
        if (unit === 1) parts.push('mốt');
        else if (unit === 5) parts.push('lăm');
        else if (unit > 0) parts.push(digits[unit]);
        return parts.join(' ');
    }
    if (ten === 1) {
        parts.push('mười');
        if (unit === 5) parts.push('lăm');
        else if (unit > 0) parts.push(digits[unit]);
        return parts.join(' ');
    }
    if (unit > 0) {
        if (hundred > 0) parts.push('linh');
        parts.push(unit === 5 && hundred > 0 ? 'năm' : digits[unit]);
    }
    return parts.join(' ');
};

const moneyToWords = (value) => {
    let amount = Math.round(Math.abs(Number(value || 0)));
    if (!amount) return 'Không đồng.';

    const units = ['', 'nghìn', 'triệu', 'tỷ'];
    const groups = [];
    while (amount > 0) {
        groups.push(amount % 1000);
        amount = Math.floor(amount / 1000);
    }

    const parts = [];
    for (let index = groups.length - 1; index >= 0; index -= 1) {
        if (!groups[index]) continue;
        parts.push(words1k(groups[index]));
        if (units[index]) parts.push(units[index]);
    }

    const text = parts.join(' ').replace(/\s+/g, ' ').trim();
    return `${text.charAt(0).toUpperCase()}${text.slice(1)} đồng.`;
};

const UI = {
    divider: { height: 1, background: 'rgba(120,53,15,.2)' },
    field: { display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 },
    fieldLabel: { display: 'inline-flex', alignItems: 'baseline', flexShrink: 0, whiteSpace: 'nowrap', fontSize: 15 },
    fieldBox: { display: 'flex', alignItems: 'center', minHeight: 32, flex: 1, minWidth: 0, borderBottom: '1px dashed rgba(120,53,15,.42)' },
    fieldInput: { width: '100%', border: 'none', background: 'transparent', outline: 'none', padding: '4px 2px', fontSize: 15, fontWeight: 700, color: '#111827', fontFamily: "'Times New Roman', serif" },
    cellInput: { width: '100%', minHeight: 30, borderRadius: 10, border: '1px solid rgba(120,53,15,.18)', background: 'rgba(255,255,255,.82)', outline: 'none', padding: '5px 7px', fontSize: 11, fontWeight: 700, color: '#111827', fontFamily: "'Times New Roman', serif", boxSizing: 'border-box' },
    cellDisplay: { width: '100%', minHeight: 30, borderRadius: 10, border: '1px solid rgba(120,53,15,.14)', background: '#f8fafc', padding: '5px 7px', fontSize: 11, fontWeight: 700, color: '#111827', fontFamily: "'Times New Roman', serif", boxSizing: 'border-box', display: 'flex', alignItems: 'center' },
    cellLabel: { display: 'block', fontSize: 8, color: '#7c2d12', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.3, fontWeight: 700, whiteSpace: 'nowrap' },
    th: { border: '1px solid rgba(120,53,15,.22)', padding: '7px 4px', fontSize: 7, whiteSpace: 'nowrap', lineHeight: 1.15 },
    td: { border: '1px solid rgba(120,53,15,.18)', padding: 4, verticalAlign: 'top' },
};

function PaperField({ label, value, onChange, type = 'text', align = 'left', readOnly = false }) {
    return (
        <label style={UI.field}>
            <div style={UI.fieldLabel}>
                <span>{label}</span>
            </div>
            <div style={UI.fieldBox}>
                <input
                    style={{ ...UI.fieldInput, textAlign: align }}
                    type={type}
                    value={value || ''}
                    onChange={readOnly ? undefined : onChange}
                    readOnly={readOnly}
                />
            </div>
        </label>
    );
}

function LockToggle({ active, onClick, title }) {
    return (
        <button
            type="button"
            onClick={onClick}
            style={{
                position: 'absolute',
                right: 6,
                top: '50%',
                transform: 'translateY(-50%)',
                width: 22,
                height: 22,
                borderRadius: 999,
                border: active ? 'none' : '1px solid rgba(120,53,15,.18)',
                background: active ? 'linear-gradient(135deg,#0f766e,#14b8a6)' : 'rgba(255,255,255,.94)',
                color: active ? '#ffffff' : '#7c2d12',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
                cursor: 'pointer',
                boxShadow: active ? '0 8px 16px rgba(15,118,110,.18)' : 'none',
            }}
            title={title}
            aria-label={title}
        >
            {active ? <IoLockClosedOutline style={{ fontSize: 12 }} /> : <IoLockOpenOutline style={{ fontSize: 12 }} />}
        </button>
    );
}

function CellField({ label, value, onChange, align = 'left', inputMode = undefined, trailing = null }) {
    const isNumericField = inputMode === 'numeric' || inputMode === 'decimal';
    const inputStyle = trailing ? { ...UI.cellInput, textAlign: align, paddingRight: 34 } : { ...UI.cellInput, textAlign: align };
    return (
        <div>
            <span style={UI.cellLabel}>{label}</span>
            <div style={{ position: 'relative' }}>
                {isNumericField ? (
                    <FormattedNumberInput
                        style={inputStyle}
                        inputMode={inputMode}
                        allowDecimal={inputMode === 'decimal'}
                        maxDecimals={inputMode === 'decimal' ? 4 : undefined}
                        value={value ?? ''}
                        onValueChange={(nextValue) => onChange({ target: { value: nextValue } })}
                    />
                ) : (
                    <input
                        style={inputStyle}
                        type="text"
                        inputMode={inputMode}
                        value={value ?? ''}
                        onChange={onChange}
                    />
                )}
                {trailing}
            </div>
        </div>
    );
}

function CellDisplay({ label, value, align = 'left', accent = false }) {
    return (
        <div>
            <span style={UI.cellLabel}>{label}</span>
            <div
                style={{
                    ...UI.cellDisplay,
                    justifyContent: align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start',
                    background: accent ? 'rgba(240,253,244,.92)' : UI.cellDisplay.background,
                    color: accent ? '#166534' : UI.cellDisplay.color,
                    fontWeight: accent ? 800 : UI.cellDisplay.fontWeight,
                }}
            >
                <span style={{ width: '100%', textAlign: align, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value || ''}</span>
            </div>
        </div>
    );
}

function CellPlainValue({ label, value, align = 'left', accent = false }) {
    return (
        <div>
            <span style={UI.cellLabel}>{label}</span>
            <div
                style={{
                    minHeight: 30,
                    padding: '6px 7px',
                    fontSize: 11,
                    fontWeight: 700,
                    lineHeight: 1.3,
                    color: accent ? '#166534' : '#111827',
                    textAlign: align,
                    fontFamily: "'Times New Roman', serif",
                    whiteSpace: 'normal',
                    overflowWrap: 'anywhere',
                    wordBreak: 'break-word',
                }}
            >
                {value || ''}
            </div>
        </div>
    );
}

function MobileInvoiceItems({ rows, onItemFieldChange, onRemoveItem }) {
    return (
        <div style={{ position: 'relative', zIndex: 1, display: 'grid' }}>
            {rows.map((item, index) => {
                const showBalanceLocks = Number(item?.labor || 0) > 0;
                const lockedField = item?.lockedField === 'componentPrice' ? 'componentPrice' : 'quantity';
                const isLastRow = index === rows.length - 1;
                return (
                    <div key={item?.key || `row-${index}`} style={{ display: 'grid', gridTemplateColumns: '44px minmax(0, 1fr)', borderBottom: isLastRow ? 'none' : '1px solid rgba(120,53,15,.18)' }}>
                        <div style={{ padding: 4, borderRight: '1px solid rgba(120,53,15,.18)', display: 'grid', gap: 8, justifyItems: 'center', alignContent: 'start' }}>
                            <strong>{index + 1}</strong>
                            {item?.manual ? (
                                <button type="button" onClick={() => onRemoveItem(item.key)} style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid rgba(239,68,68,.28)', background: '#fff1f2', color: '#b91c1c', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <IoTrashOutline />
                                </button>
                            ) : null}
                        </div>

                        <div style={{ padding: 4 }}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 8, alignItems: 'start' }}>
                                <div style={{ display: 'grid', gap: 8 }}>
                                    <CellDisplay label="Ma hang" value={item?.code || ''} />
                                    <CellDisplay label="Ten hang" value={item?.name || ''} />
                                </div>
                                <div style={{ display: 'grid', gap: 8 }}>
                                    <CellDisplay label="DVT" value={item?.unit || 'chi'} align="center" />
                                    <CellField label="Tien cong" value={item?.labor ?? 0} onChange={(event) => onItemFieldChange(item.key, 'labor', event.target.value)} align="right" inputMode="numeric" />
                                </div>
                            </div>

                            <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1fr 2fr 2fr', gap: 8, alignItems: 'start' }}>
                                <CellField
                                    label="SLG"
                                    value={item?.quantity ?? ''}
                                    onChange={(event) => onItemFieldChange(item.key, 'quantity', event.target.value)}
                                    align="right"
                                    inputMode="decimal"
                                    trailing={showBalanceLocks ? (
                                        <LockToggle
                                            active={lockedField === 'quantity'}
                                            onClick={() => onItemFieldChange(item.key, 'lockedField', 'quantity')}
                                            title="Khoa so luong khi doi tien cong"
                                        />
                                    ) : null}
                                />
                                <CellField
                                    label="Gia TP"
                                    value={item?.componentPrice ?? 0}
                                    onChange={(event) => onItemFieldChange(item.key, 'componentPrice', event.target.value)}
                                    align="right"
                                    inputMode="numeric"
                                    trailing={showBalanceLocks ? (
                                        <LockToggle
                                            active={lockedField === 'componentPrice'}
                                            onClick={() => onItemFieldChange(item.key, 'lockedField', 'componentPrice')}
                                            title="Khoa gia thanh phan khi doi tien cong"
                                        />
                                    ) : null}
                                />
                                <CellPlainValue label="Thanh tien" value={fmtMoney(item?.total || 0)} align="right" accent />
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

export default function EasyInvoicePaper({
    draft,
    onCustomerFieldChange,
    onInvoiceFieldChange,
    onItemFieldChange,
    onAddManualItem,
    onRemoveItem,
}) {
    void onAddManualItem;

    const compact = typeof window !== 'undefined' ? window.innerWidth < 980 : false;
    const mobileLayout = typeof window !== 'undefined' ? window.innerWidth < 640 : false;
    const customer = draft?.customer || {};
    const invoice = draft?.invoice || {};
    const items = Array.isArray(draft?.items) ? draft.items : [];
    const rows = [...items];
    const total = items.reduce((sum, item) => sum + Math.round(Number(item?.total || 0)), 0);
    const issueDate = invoice.arisingDate || todayText();
    const [issueDay = '', issueMonth = '', issueYear = ''] = String(issueDate).split('/');
    const cornerSize = compact ? 148 : 230;
    const paymentMethodValue = 'Chuyển khoản';

    return (
        <div style={{ maxWidth: 1080, margin: '0 auto', padding: compact ? '0 0 24px' : '0 0 40px' }}>
            <div style={{ position: 'relative', borderRadius: 22, backgroundColor: '#ffffff', border: '3px double rgba(120,53,15,.55)', boxShadow: '0 28px 56px rgba(120,53,15,.14), 0 10px 24px rgba(15,23,42,.06)', padding: compact ? '18px 12px 20px' : '26px 24px 24px', overflow: 'hidden', fontFamily: "'Times New Roman', serif", color: '#111827' }}>
                <img src={CORNER_SVG_URL} alt="" aria-hidden="true" style={{ position: 'absolute', left: 0, bottom: 0, width: cornerSize, height: 'auto', opacity: 0.58, pointerEvents: 'none', userSelect: 'none' }} />
                <img src={CORNER_SVG_URL} alt="" aria-hidden="true" style={{ position: 'absolute', left: 0, top: 0, width: cornerSize, height: 'auto', opacity: 0.58, pointerEvents: 'none', userSelect: 'none', transform: 'scaleY(-1)' }} />
                <img src={CORNER_SVG_URL} alt="" aria-hidden="true" style={{ position: 'absolute', right: 0, bottom: 0, width: cornerSize, height: 'auto', opacity: 0.58, pointerEvents: 'none', userSelect: 'none', transform: 'scaleX(-1)' }} />
                <img src={CORNER_SVG_URL} alt="" aria-hidden="true" style={{ position: 'absolute', right: 0, top: 0, width: cornerSize, height: 'auto', opacity: 0.58, pointerEvents: 'none', userSelect: 'none', transform: 'scale(-1,-1)' }} />

                <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 14, alignItems: 'start' }}>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: compact ? 6 : 8, flexWrap: 'nowrap', fontSize: compact ? 14 : 15 }}>
                                <span>Ngày</span>
                                <div style={{ ...UI.fieldBox, minWidth: compact ? 34 : 40, justifyContent: 'center' }}>
                                    <input style={{ ...UI.fieldInput, textAlign: 'center' }} type="text" value={issueDay} onChange={(event) => onInvoiceFieldChange('arisingDate', `${event.target.value}/${issueMonth}/${issueYear}`)} />
                                </div>
                                <span>tháng</span>
                                <div style={{ ...UI.fieldBox, minWidth: compact ? 34 : 40, justifyContent: 'center' }}>
                                    <input style={{ ...UI.fieldInput, textAlign: 'center' }} type="text" value={issueMonth} onChange={(event) => onInvoiceFieldChange('arisingDate', `${issueDay}/${event.target.value}/${issueYear}`)} />
                                </div>
                                <span>năm</span>
                                <div style={{ ...UI.fieldBox, minWidth: compact ? 54 : 64, justifyContent: 'center' }}>
                                    <input style={{ ...UI.fieldInput, textAlign: 'center' }} type="text" value={issueYear} onChange={(event) => onInvoiceFieldChange('arisingDate', `${issueDay}/${issueMonth}/${event.target.value}`)} />
                                </div>
                            </div>
                        </div>
                    </div>

                    <div style={UI.divider} />

                    <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : '1.1fr .9fr', gap: 12 }}>
                        <PaperField label="Họ & tên" value={customer.name || ''} onChange={(event) => onCustomerFieldChange('name', event.target.value)} />
                        <PaperField label="Tên đơn vị" value={customer.company || ''} onChange={(event) => onCustomerFieldChange('company', event.target.value)} />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
                        <PaperField label="Mã số thuế" value={customer.taxCode || ''} onChange={(event) => onCustomerFieldChange('taxCode', event.target.value)} />
                        <PaperField label="Điện thoại" value={customer.phone || ''} onChange={(event) => onCustomerFieldChange('phone', event.target.value)} />
                        <div style={compact ? undefined : { gridColumn: '1 / -1' }}>
                            <PaperField label="Địa chỉ" value={customer.address || ''} onChange={(event) => onCustomerFieldChange('address', event.target.value)} />
                        </div>
                        <PaperField label="CCCD" value={customer.cccd || ''} onChange={(event) => onCustomerFieldChange('cccd', event.target.value)} />
                        <PaperField label="Mã khách" value={customer.code || ''} onChange={(event) => onCustomerFieldChange('code', event.target.value)} />
                        <PaperField label="Hình thức TT" value={paymentMethodValue} readOnly />
                        <PaperField label="Đơn vị tiền tệ" value={invoice.currencyUnit || 'VND'} onChange={(event) => onInvoiceFieldChange('currencyUnit', event.target.value)} />
                    </div>

                    <div style={{ position: 'relative', borderRadius: 0, overflowX: mobileLayout ? 'hidden' : 'auto', overflowY: 'hidden', border: '1px solid rgba(120,53,15,.22)', background: '#ffffff' }}>
                        <div
                            aria-hidden="true"
                            style={{
                                position: 'absolute',
                                left: '50%',
                                top: compact ? '58%' : '57%',
                                width: compact ? '76%' : '68%',
                                height: compact ? '68%' : '64%',
                                transform: 'translate(-50%, -50%)',
                                background: `url(${SIGN_BG_URL}) center center / contain no-repeat`,
                                opacity: 0.16,
                                pointerEvents: 'none',
                                userSelect: 'none',
                                zIndex: 0,
                            }}
                        />

                        {mobileLayout ? (
                        <MobileInvoiceItems rows={rows} onItemFieldChange={onItemFieldChange} onRemoveItem={onRemoveItem} />
                        ) : false ? (
                        <table style={{ position: 'relative', zIndex: 1, width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                            <tbody>
                                {rows.map((item, index) => {
                                    const showBalanceLocks = Number(item?.labor || 0) > 0;
                                    const lockedField = item?.lockedField === 'componentPrice' ? 'componentPrice' : 'quantity';
                                    const rowKey = item?.key || `row-${index}`;
                                    return [
                                        <tr key={`${rowKey}-top`}>
                                            <td rowSpan={2} style={{ ...UI.td, width: 44, textAlign: 'center' }}>
                                                <div style={{ display: 'grid', gap: 8, justifyItems: 'center' }}>
                                                    <strong>{index + 1}</strong>
                                                    {item?.manual ? (
                                                        <button type="button" onClick={() => onRemoveItem(item.key)} style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid rgba(239,68,68,.28)', background: '#fff1f2', color: '#b91c1c', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                                                            <IoTrashOutline />
                                                        </button>
                                                    ) : null}
                                                </div>
                                            </td>
                                            <td colSpan={2} style={UI.td}>
                                                <div style={{ display: 'grid', gap: 8 }}>
                                                    <CellDisplay label="MÃ£ hÃ ng" value={item?.code || ''} />
                                                    <CellDisplay label="TÃªn hÃ ng" value={item?.name || ''} />
                                                </div>
                                            </td>
                                            <td style={{ ...UI.td, width: 72 }}>
                                                <CellDisplay label="ÄVT" value={item?.unit || 'chi'} align="center" />
                                            </td>
                                        </tr>,
                                        <tr key={`${rowKey}-bottom`}>
                                            <td style={{ ...UI.td, width: 88 }}>
                                                <CellField
                                                    label="SLG"
                                                    value={item?.quantity ?? ''}
                                                    onChange={(event) => onItemFieldChange(item.key, 'quantity', event.target.value)}
                                                    align="right"
                                                    inputMode="decimal"
                                                    trailing={showBalanceLocks ? (
                                                        <LockToggle
                                                            active={lockedField === 'quantity'}
                                                            onClick={() => onItemFieldChange(item.key, 'lockedField', 'quantity')}
                                                            title="KhÃ³a sá»‘ lÆ°á»£ng khi Ä‘á»•i tiá»n cÃ´ng"
                                                        />
                                                    ) : null}
                                                />
                                            </td>
                                            <td style={UI.td}>
                                                <div style={{ display: 'grid', gap: 8 }}>
                                                    <CellField
                                                        label="GiÃ¡ TP"
                                                        value={item?.componentPrice ?? 0}
                                                        onChange={(event) => onItemFieldChange(item.key, 'componentPrice', event.target.value)}
                                                        align="right"
                                                        inputMode="numeric"
                                                        trailing={showBalanceLocks ? (
                                                            <LockToggle
                                                                active={lockedField === 'componentPrice'}
                                                                onClick={() => onItemFieldChange(item.key, 'lockedField', 'componentPrice')}
                                                                title="KhÃ³a giÃ¡ thÃ nh pháº§n khi Ä‘á»•i tiá»n cÃ´ng"
                                                            />
                                                        ) : null}
                                                    />
                                                    <CellField label="Tiá»n cÃ´ng" value={item?.labor ?? 0} onChange={(event) => onItemFieldChange(item.key, 'labor', event.target.value)} align="right" inputMode="numeric" />
                                                </div>
                                            </td>
                                            <td style={{ ...UI.td, width: 120 }}>
                                                <CellDisplay label="ThÃ nh tiá»n" value={fmtMoney(item?.total || 0)} align="right" accent />
                                            </td>
                                        </tr>,
                                    ];
                                })}
                            </tbody>
                        </table>
                        ) : (
                        <table style={{ position: 'relative', zIndex: 1, width: '100%', minWidth: 760, borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                            <thead>
                                <tr style={{ background: 'rgba(120,53,15,.08)' }}>
                                    <th style={{ ...UI.th, width: '6%' }}>STT</th>
                                    <th style={{ ...UI.th, width: '24%' }}>Tên hàng hóa, dịch vụ</th>
                                    <th style={{ ...UI.th, width: '9%' }}>ĐVT</th>
                                    <th style={{ ...UI.th, width: '10%' }}>SLG</th>
                                    <th style={{ ...UI.th, width: '23%' }}>Giá TP / Công</th>
                                    <th style={{ ...UI.th, width: '28%' }}>Thành tiền</th>
                                </tr>
                            </thead>

                            <tbody>
                                {rows.map((item, index) => {
                                    const showBalanceLocks = Number(item?.labor || 0) > 0;
                                    const lockedField = item?.lockedField === 'componentPrice' ? 'componentPrice' : 'quantity';
                                    return (
                                    <tr key={item?.key || `row-${index}`}>
                                        <td style={{ ...UI.td, textAlign: 'center' }}>
                                            <div style={{ display: 'grid', gap: 8, justifyItems: 'center' }}>
                                                <strong>{index + 1}</strong>
                                                {item?.manual ? (
                                                    <button type="button" onClick={() => onRemoveItem(item.key)} style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid rgba(239,68,68,.28)', background: '#fff1f2', color: '#b91c1c', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                                                        <IoTrashOutline />
                                                    </button>
                                                ) : null}
                                            </div>
                                        </td>

                                        <td style={UI.td}>
                                            <div style={{ display: 'grid', gap: 8 }}>
                                                <CellDisplay label="Mã hàng" value={item?.code || ''} />
                                                <CellDisplay label="Tên hàng" value={item?.name || ''} />
                                            </div>
                                        </td>

                                        <td style={UI.td}>
                                            <CellDisplay label="ĐVT" value={item?.unit || 'chi'} align="center" />
                                        </td>

                                        <td style={UI.td}>
                                            <CellField
                                                label="SLG"
                                                value={item?.quantity ?? ''}
                                                onChange={(event) => onItemFieldChange(item.key, 'quantity', event.target.value)}
                                                align="right"
                                                inputMode="decimal"
                                                trailing={showBalanceLocks ? (
                                                    <LockToggle
                                                        active={lockedField === 'quantity'}
                                                        onClick={() => onItemFieldChange(item.key, 'lockedField', 'quantity')}
                                                        title="Khóa số lượng khi đổi tiền công"
                                                    />
                                                ) : null}
                                            />
                                        </td>

                                        <td style={UI.td}>
                                            <div style={{ display: 'grid', gap: 8 }}>
                                                <CellField
                                                    label="Giá TP"
                                                    value={item?.componentPrice ?? 0}
                                                    onChange={(event) => onItemFieldChange(item.key, 'componentPrice', event.target.value)}
                                                    align="right"
                                                    inputMode="numeric"
                                                    trailing={showBalanceLocks ? (
                                                        <LockToggle
                                                            active={lockedField === 'componentPrice'}
                                                            onClick={() => onItemFieldChange(item.key, 'lockedField', 'componentPrice')}
                                                            title="Khóa giá thành phần khi đổi tiền công"
                                                        />
                                                    ) : null}
                                                />
                                                <CellField label="Tiền công" value={item?.labor ?? 0} onChange={(event) => onItemFieldChange(item.key, 'labor', event.target.value)} align="right" inputMode="numeric" />
                                            </div>
                                        </td>

                                        <td style={UI.td}>
                                            <CellDisplay label="Thành tiền" value={fmtMoney(item?.total || 0)} align="right" accent />
                                        </td>
                                    </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                        )}
                    </div>

                    <PaperField label="Ghi chú" value={invoice.note || ''} onChange={(event) => onInvoiceFieldChange('note', event.target.value)} />

                    <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : '1fr 220px', gap: 12, alignItems: 'center' }}>
                        <div style={{ fontSize: 15, lineHeight: 1.6, minWidth: 0, whiteSpace: 'normal', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                            {mobileLayout ? (
                                <>
                                    <span style={{ display: 'block', fontWeight: 700, marginBottom: 4 }}>Số tiền viết bằng chữ</span>
                                    <b style={{ display: 'block', whiteSpace: 'normal', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{moneyToWords(total)}</b>
                                </>
                            ) : (
                                <><span style={{ fontWeight: 700 }}>Số tiền viết bằng chữ</span>: <b>{moneyToWords(total)}</b></>
                            )}
                        </div>

                        <div style={{ minWidth: 0, borderRadius: 16, border: '1px solid rgba(22,163,74,.22)', background: 'rgba(240,253,244,.85)', padding: '12px 14px', textAlign: 'right' }}>
                            <div style={{ fontSize: 11, color: '#166534', textTransform: 'uppercase', fontWeight: 800 }}>Tổng thanh toán</div>
                            <div data-sale-amount="true" style={{ marginTop: 4, fontSize: 28, lineHeight: 1.1, fontWeight: 900, color: '#166534', whiteSpace: 'normal', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{fmtMoney(total)}</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
