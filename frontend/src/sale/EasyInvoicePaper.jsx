import { IoTrashOutline } from 'react-icons/io5';
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

function CellField({ label, value, onChange, align = 'left', inputMode = undefined }) {
    const isNumericField = inputMode === 'numeric' || inputMode === 'decimal';
    return (
        <div>
            <span style={UI.cellLabel}>{label}</span>
            {isNumericField ? (
                <FormattedNumberInput
                    style={{ ...UI.cellInput, textAlign: align }}
                    inputMode={inputMode}
                    allowDecimal={inputMode === 'decimal'}
                    maxDecimals={inputMode === 'decimal' ? 4 : undefined}
                    value={value ?? ''}
                    onValueChange={(nextValue) => onChange({ target: { value: nextValue } })}
                />
            ) : (
                <input
                    style={{ ...UI.cellInput, textAlign: align }}
                    type="text"
                    inputMode={inputMode}
                    value={value ?? ''}
                    onChange={onChange}
                />
            )}
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

                    <div style={{ position: 'relative', borderRadius: 0, overflow: 'hidden', border: '1px solid rgba(120,53,15,.22)', background: '#ffffff' }}>
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

                        <table style={{ position: 'relative', zIndex: 1, width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
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
                                {rows.map((item, index) => (
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
                                            <CellField label="SLG" value={item?.quantity ?? ''} onChange={(event) => onItemFieldChange(item.key, 'quantity', event.target.value)} align="right" inputMode="decimal" />
                                        </td>

                                        <td style={UI.td}>
                                            <div style={{ display: 'grid', gap: 8 }}>
                                                <CellField label="Giá TP" value={item?.componentPrice ?? 0} onChange={(event) => onItemFieldChange(item.key, 'componentPrice', event.target.value)} align="right" inputMode="numeric" />
                                                <CellField label="Tiền công" value={item?.labor ?? 0} onChange={(event) => onItemFieldChange(item.key, 'labor', event.target.value)} align="right" inputMode="numeric" />
                                            </div>
                                        </td>

                                        <td style={UI.td}>
                                            <CellDisplay label="Thành tiền" value={fmtMoney(item?.total || 0)} align="right" accent />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <PaperField label="Ghi chú" value={invoice.note || ''} onChange={(event) => onInvoiceFieldChange('note', event.target.value)} />

                    <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : '1fr 220px', gap: 12, alignItems: 'center' }}>
                        <div style={{ fontSize: 15, lineHeight: 1.6 }}>
                            <span style={{ fontWeight: 700 }}>Số tiền viết bằng chữ</span>: <b>{moneyToWords(total)}</b>
                        </div>

                        <div style={{ borderRadius: 16, border: '1px solid rgba(22,163,74,.22)', background: 'rgba(240,253,244,.85)', padding: '12px 14px', textAlign: 'right' }}>
                            <div style={{ fontSize: 11, color: '#166534', textTransform: 'uppercase', fontWeight: 800 }}>Tổng thanh toán</div>
                            <div data-sale-amount="true" style={{ marginTop: 4, fontSize: 28, lineHeight: 1, fontWeight: 900, color: '#166534' }}>{fmtMoney(total)}</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
