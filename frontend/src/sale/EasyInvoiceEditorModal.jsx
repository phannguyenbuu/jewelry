import { IoAddOutline, IoCloseOutline, IoDocumentTextOutline, IoTrashOutline } from 'react-icons/io5';
import { S } from './shared';

const CORNER_SVG_URL = '/border.svg';
const SIGN_BG_URL = '/sign-check.jfif';

const SELLER = {
    name: 'CÔNG TY TNHH VÀNG BẠC ĐÁ QUÝ VẠN KIM',
    taxCode: '5800884170',
    address: 'Số 11 Lê Thị Pha, Phường 1 Bảo Lộc, Tỉnh Lâm Đồng, Việt Nam',
    serial: '2C26MYY',
};

const fmtMoney = (value) => Math.round(Number(value || 0)).toLocaleString('en-US');
const pad2 = (value) => String(value || '').padStart(2, '0');
const todayText = () => {
    const now = new Date();
    return `${pad2(now.getDate())}/${pad2(now.getMonth() + 1)}/${now.getFullYear()}`;
};
const buildMissingText = (missingFields = []) => missingFields.length ? `Vui lòng nhập đủ: ${missingFields.join(', ')}.` : '';
const words1k = (num) => {
    const d = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
    const h = Math.floor(num / 100);
    const t = Math.floor((num % 100) / 10);
    const u = num % 10;
    const parts = [];
    if (h > 0) parts.push(d[h], 'trăm');
    if (t > 1) {
        parts.push(d[t], 'mươi');
        if (u === 1) parts.push('mốt');
        else if (u === 5) parts.push('lăm');
        else if (u > 0) parts.push(d[u]);
        return parts.join(' ');
    }
    if (t === 1) {
        parts.push('mười');
        if (u === 5) parts.push('lăm');
        else if (u > 0) parts.push(d[u]);
        return parts.join(' ');
    }
    if (u > 0) {
        if (h > 0) parts.push('linh');
        parts.push(u === 5 && h > 0 ? 'năm' : d[u]);
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
    for (let i = groups.length - 1; i >= 0; i -= 1) {
        if (!groups[i]) continue;
        parts.push(words1k(groups[i]));
        if (units[i]) parts.push(units[i]);
    }
    const text = parts.join(' ').replace(/\s+/g, ' ').trim();
    return `${text.charAt(0).toUpperCase()}${text.slice(1)} đồng.`;
};

const UI = {
    divider: { height: 1, background: 'rgba(120,53,15,.2)' },
    subEn: { fontSize: 11, color: '#64748b', fontStyle: 'italic', marginLeft: 4 },
    field: { display: 'grid', gap: 4 },
    fieldBox: { display: 'flex', alignItems: 'center', minHeight: 32, borderBottom: '1px dashed rgba(120,53,15,.42)' },
    fieldInput: { width: '100%', border: 'none', background: 'transparent', outline: 'none', padding: '4px 2px', fontSize: 15, fontWeight: 700, color: '#111827', fontFamily: "'Times New Roman', serif" },
    cellInput: { width: '100%', minHeight: 34, borderRadius: 10, border: '1px solid rgba(120,53,15,.18)', background: 'rgba(255,255,255,.82)', outline: 'none', padding: '6px 8px', fontSize: 13, fontWeight: 700, color: '#111827', fontFamily: "'Times New Roman', serif", boxSizing: 'border-box' },
    cellLabel: { display: 'block', fontSize: 10, color: '#7c2d12', marginBottom: 4, textTransform: 'uppercase', letterSpacing: .3, fontWeight: 700 },
    th: { border: '1px solid rgba(120,53,15,.22)', padding: '10px 6px', fontSize: 12 },
    td: { border: '1px solid rgba(120,53,15,.18)', padding: 8, verticalAlign: 'top' },
};

function PaperField({ label, en, value, onChange, type = 'text', align = 'left' }) {
    return (
        <label style={UI.field}>
            <div style={{ fontSize: 15 }}>
                <span>{label}</span>
                {en ? <span style={UI.subEn}>({en})</span> : null}
            </div>
            <div style={UI.fieldBox}>
                <input style={{ ...UI.fieldInput, textAlign: align }} type={type} value={value || ''} onChange={onChange} />
            </div>
        </label>
    );
}

function CellField({ label, value, onChange, align = 'left', inputMode = undefined }) {
    return (
        <div>
            <span style={UI.cellLabel}>{label}</span>
            <input style={{ ...UI.cellInput, textAlign: align }} type="text" inputMode={inputMode} value={value ?? ''} onChange={onChange} />
        </div>
    );
}

export default function EasyInvoiceEditorModal({
    open,
    loading = false,
    draft,
    missingFields = [],
    publishDisabled = false,
    publishHint = '',
    errorText = '',
    onClose,
    onApplyDefaultCustomer,
    onCustomerFieldChange,
    onInvoiceFieldChange,
    onItemFieldChange,
    onAddManualItem,
    onRemoveItem,
    onPublish,
}) {
    if (!open) return null;

    const compact = typeof window !== 'undefined' ? window.innerWidth < 980 : false;
    const customer = draft?.customer || {};
    const invoice = draft?.invoice || {};
    const items = Array.isArray(draft?.items) ? draft.items : [];
    const rows = [...items];
    while (rows.length < 8) rows.push(null);
    const total = items.reduce((sum, item) => sum + Math.round(Number(item?.total || 0)), 0);
    const statusText = errorText || buildMissingText(missingFields) || (publishDisabled ? publishHint : '');
    const issueDate = invoice.arisingDate || todayText();
    const [issueDay = '', issueMonth = '', issueYear = ''] = String(issueDate).split('/');
    const cornerSize = compact ? 148 : 230;

    return (
        <div onClick={loading ? undefined : onClose} style={{ position: 'fixed', inset: 0, zIndex: 1760, background: 'rgba(15,23,42,.58)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: compact ? 0 : 18 }}>
            <div onClick={(event) => event.stopPropagation()} style={{ width: '100%', maxWidth: 1360, height: compact ? '100dvh' : 'min(96vh, 980px)', borderRadius: compact ? 0 : 28, background: 'linear-gradient(180deg, rgba(255,255,255,.98), rgba(248,250,252,.98))', boxShadow: '0 28px 64px rgba(15,23,42,.28)', border: '1px solid rgba(15,23,42,.08)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '16px 18px', display: 'flex', justifyContent: 'space-between', gap: 12, borderBottom: '1px solid rgba(15,23,42,.08)', background: 'rgba(255,255,255,.94)' }}>
                    <div>
                        <div data-sale-title="true" style={{ fontSize: 18, fontWeight: 900, color: '#111827' }}>Phát hành EasyInvoice</div>
                        <div style={{ marginTop: 4, fontSize: 11, lineHeight: 1.6, color: '#64748b' }}>Dùng mẫu hóa đơn đỏ để sửa trực tiếp trên mặt hóa đơn trước khi phát hành.</div>
                    </div>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        <button type="button" onClick={onApplyDefaultCustomer} disabled={loading} style={{ ...S.pillBtn('#ffffff', '#1d4ed8'), border: '1px solid #dbe4ee', boxShadow: 'none', opacity: loading ? 0.55 : 1 }}>Điền mặc định</button>
                        <button type="button" onClick={onClose} disabled={loading} style={{ ...S.pillBtn('#ffffff', '#111827'), border: '1px solid #dbe4ee', boxShadow: 'none', opacity: loading ? 0.55 : 1 }}><IoCloseOutline /><span>Đóng</span></button>
                        <button type="button" onClick={onPublish} disabled={loading || publishDisabled} title={publishDisabled ? publishHint : 'Phát hành EasyInvoice'} style={{ ...S.pillBtn('linear-gradient(135deg,#15803d,#22c55e)', '#ffffff'), opacity: loading || publishDisabled ? 0.55 : 1 }}><IoDocumentTextOutline /><span>{loading ? 'Đang phát hành...' : 'Phát hành'}</span></button>
                    </div>
                </div>

                {statusText ? <div style={{ padding: '10px 18px', borderBottom: '1px solid rgba(15,23,42,.06)', background: errorText ? '#fef2f2' : publishDisabled ? '#fff7ed' : '#eff6ff', color: errorText ? '#b91c1c' : publishDisabled ? '#9a3412' : '#1d4ed8', fontSize: 12, lineHeight: 1.6, fontWeight: 700 }}>{statusText}</div> : null}

                <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', background: 'linear-gradient(180deg, #eef2f7 0%, #e8eef5 100%)' }}>
                    <div style={{ maxWidth: 1080, margin: '0 auto', padding: compact ? '14px 10px 24px' : '24px 18px 40px' }}>
                        <div style={{ position: 'relative', borderRadius: 22, backgroundColor: '#ffffff', border: '3px double rgba(120,53,15,.55)', boxShadow: '0 28px 56px rgba(120,53,15,.14), 0 10px 24px rgba(15,23,42,.06)', padding: compact ? '18px 12px 20px' : '26px 24px 24px', overflow: 'hidden', fontFamily: "'Times New Roman', serif", color: '#111827' }}>
                            <img src={CORNER_SVG_URL} alt="" aria-hidden="true" style={{ position: 'absolute', left: 0, bottom: 0, width: cornerSize, height: 'auto', opacity: 0.58, pointerEvents: 'none', userSelect: 'none' }} />
                            <img src={CORNER_SVG_URL} alt="" aria-hidden="true" style={{ position: 'absolute', left: 0, top: 0, width: cornerSize, height: 'auto', opacity: 0.58, pointerEvents: 'none', userSelect: 'none', transform: 'scaleY(-1)' }} />
                            <img src={CORNER_SVG_URL} alt="" aria-hidden="true" style={{ position: 'absolute', right: 0, bottom: 0, width: cornerSize, height: 'auto', opacity: 0.58, pointerEvents: 'none', userSelect: 'none', transform: 'scaleX(-1)' }} />
                            <img src={CORNER_SVG_URL} alt="" aria-hidden="true" style={{ position: 'absolute', right: 0, top: 0, width: cornerSize, height: 'auto', opacity: 0.58, pointerEvents: 'none', userSelect: 'none', transform: 'scale(-1,-1)' }} />
                            <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
                                <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : '160px minmax(0,1fr) 220px', gap: 14, alignItems: 'start' }}>
                                    <div style={{ minHeight: 106, borderRadius: 18, border: '2px double rgba(120,53,15,.5)', background: 'rgba(255,255,255,.65)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', color: '#7c2d12', padding: 12 }}>
                                        <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: 1.2 }}>VẠN KIM</div>
                                        <div style={{ fontSize: 11, marginTop: 4 }}>5800884170</div>
                                    </div>
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ fontSize: 28, fontWeight: 900, textTransform: 'uppercase' }}>Hóa đơn bán hàng</div>
                                        <div style={{ marginTop: 2, fontSize: 16, fontWeight: 700 }}>(KHỞI TẠO TỪ MÁY TÍNH TIỀN)</div>
                                        <div style={{ marginTop: 6, fontSize: 14, fontStyle: 'italic', color: '#475569' }}>(Bản thể hiện của hóa đơn điện tử)</div>
                                        <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, flexWrap: 'wrap', fontSize: 15 }}><span>Ngày</span><div style={{ ...UI.fieldBox, minWidth: 40, justifyContent: 'center' }}><input style={{ ...UI.fieldInput, textAlign: 'center' }} type="text" value={issueDay} onChange={(event) => onInvoiceFieldChange('arisingDate', `${event.target.value}/${issueMonth}/${issueYear}`)} /></div><span>tháng</span><div style={{ ...UI.fieldBox, minWidth: 40, justifyContent: 'center' }}><input style={{ ...UI.fieldInput, textAlign: 'center' }} type="text" value={issueMonth} onChange={(event) => onInvoiceFieldChange('arisingDate', `${issueDay}/${event.target.value}/${issueYear}`)} /></div><span>năm</span><div style={{ ...UI.fieldBox, minWidth: 64, justifyContent: 'center' }}><input style={{ ...UI.fieldInput, textAlign: 'center' }} type="text" value={issueYear} onChange={(event) => onInvoiceFieldChange('arisingDate', `${issueDay}/${issueMonth}/${event.target.value}`)} /></div></div>
                                    </div>
                                    <div style={{ borderRadius: 18, border: '1px solid rgba(120,53,15,.22)', background: 'rgba(255,255,255,.7)', padding: 12, display: 'grid', gap: 8 }}>
                                        <div style={{ fontSize: 14 }}><span style={{ fontWeight: 700 }}>Ký hiệu</span><span style={UI.subEn}>(Serial)</span>: <b>{invoice.serial || SELLER.serial}</b></div>
                                        <div style={{ fontSize: 14 }}><span style={{ fontWeight: 700 }}>Số</span><span style={UI.subEn}>(No.)</span>: <b>{invoice.number || 'Sẽ sinh khi phát hành'}</b></div>
                                        <div style={{ fontSize: 12, lineHeight: 1.5, color: '#64748b' }}>Mẫu này chỉ để chỉnh và kiểm trước khi gọi API phát hành.</div>
                                    </div>
                                </div>

                                <div style={UI.divider} />
                                <div style={{ display: 'grid', gap: 6, fontSize: 15 }}>
                                    <div><span>Đơn vị bán hàng</span><span style={UI.subEn}>(Seller)</span>: <b>{SELLER.name}</b></div>
                                    <div><span>Mã số thuế</span><span style={UI.subEn}>(Tax code)</span>: <b style={{ letterSpacing: 2 }}>{SELLER.taxCode}</b></div>
                                    <div><span>Địa chỉ</span><span style={UI.subEn}>(Address)</span>: <b>{SELLER.address}</b></div>
                                </div>

                                <div style={UI.divider} />
                                <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : '1.1fr .9fr', gap: 12 }}>
                                    <PaperField label="Họ tên người mua hàng" en="Buyer" value={customer.name || ''} onChange={(event) => onCustomerFieldChange('name', event.target.value)} />
                                    <PaperField label="Tên đơn vị" en="Company" value={customer.company || ''} onChange={(event) => onCustomerFieldChange('company', event.target.value)} />
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
                                    <PaperField label="Mã số thuế" en="Tax code" value={customer.taxCode || ''} onChange={(event) => onCustomerFieldChange('taxCode', event.target.value)} />
                                    <PaperField label="Điện thoại" en="Tel" value={customer.phone || ''} onChange={(event) => onCustomerFieldChange('phone', event.target.value)} />
                                    <div style={compact ? undefined : { gridColumn: '1 / -1' }}><PaperField label="Địa chỉ" en="Address" value={customer.address || ''} onChange={(event) => onCustomerFieldChange('address', event.target.value)} /></div>
                                    <PaperField label="Căn cước công dân" en="Citizen ID" value={customer.cccd || ''} onChange={(event) => onCustomerFieldChange('cccd', event.target.value)} />
                                    <PaperField label="Mã khách" en="Code" value={customer.code || ''} onChange={(event) => onCustomerFieldChange('code', event.target.value)} />
                                    <PaperField label="Hình thức thanh toán" en="Payment method" value={invoice.paymentMethod || ''} onChange={(event) => onInvoiceFieldChange('paymentMethod', event.target.value)} />
                                    <PaperField label="Đơn vị tiền tệ" en="Currency" value={invoice.currencyUnit || 'VND'} onChange={(event) => onInvoiceFieldChange('currencyUnit', event.target.value)} />
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                                    <div style={{ fontSize: 13, color: '#7c2d12', fontWeight: 700 }}>Các input đã được đưa lên trực tiếp trên mẫu hóa đơn.</div>
                                    <button type="button" onClick={onAddManualItem} style={{ ...S.pillBtn('linear-gradient(135deg,#b45309,#c2410c)', '#ffffff'), minHeight: 36, height: 36, padding: '0 14px', boxShadow: '0 8px 18px rgba(120,53,15,.18)' }}><IoAddOutline /><span>Thêm dòng</span></button>
                                </div>

                                <div style={{ position: 'relative', borderRadius: 18, overflow: 'hidden', border: '1px solid rgba(120,53,15,.22)', background: '#ffffff' }}>
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
                                                <th style={{ ...UI.th, width: '7%' }}>STT<br /><i style={UI.subEn}>(No.)</i></th>
                                                <th style={{ ...UI.th, width: '39%' }}>Tên hàng hóa, dịch vụ<br /><i style={UI.subEn}>(Name)</i></th>
                                                <th style={{ ...UI.th, width: '12%' }}>Đơn vị tính<br /><i style={UI.subEn}>(Unit)</i></th>
                                                <th style={{ ...UI.th, width: '12%' }}>Số lượng<br /><i style={UI.subEn}>(Qty)</i></th>
                                                <th style={{ ...UI.th, width: '14%' }}>Đơn giá / Công<br /><i style={UI.subEn}>(Price / Labor)</i></th>
                                                <th style={{ ...UI.th, width: '16%' }}>Thành tiền<br /><i style={UI.subEn}>(Amount)</i></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {rows.map((item, index) => (
                                                <tr key={item?.key || `blank-${index}`}>
                                                    <td style={{ ...UI.td, textAlign: 'center' }}>
                                                        {item ? <div style={{ display: 'grid', gap: 8, justifyItems: 'center' }}><strong>{index + 1}</strong>{item.manual ? <button type="button" onClick={() => onRemoveItem(item.key)} style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid rgba(239,68,68,.28)', background: '#fff1f2', color: '#b91c1c', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><IoTrashOutline /></button> : null}</div> : <div style={{ minHeight: 92 }} />}
                                                    </td>
                                                    <td style={UI.td}>{item ? <div style={{ display: 'grid', gap: 8 }}><CellField label="Mã hàng" value={item.code || ''} onChange={(event) => onItemFieldChange(item.key, 'code', event.target.value)} /><CellField label="Tên hàng" value={item.name || ''} onChange={(event) => onItemFieldChange(item.key, 'name', event.target.value)} /></div> : <div style={{ minHeight: 92 }} />}</td>
                                                    <td style={UI.td}>{item ? <CellField label="Đơn vị" value={item.unit || 'chi'} onChange={(event) => onItemFieldChange(item.key, 'unit', event.target.value)} align="center" /> : <div style={{ minHeight: 92 }} />}</td>
                                                    <td style={UI.td}>{item ? <CellField label="Số lượng" value={item.quantity ?? ''} onChange={(event) => onItemFieldChange(item.key, 'quantity', event.target.value)} align="right" inputMode="decimal" /> : <div style={{ minHeight: 92 }} />}</td>
                                                    <td style={UI.td}>{item ? <div style={{ display: 'grid', gap: 8 }}><CellField label="Giá thành phần" value={item.componentPrice ?? 0} onChange={(event) => onItemFieldChange(item.key, 'componentPrice', event.target.value)} align="right" inputMode="numeric" /><CellField label="Tiền công" value={item.labor ?? 0} onChange={(event) => onItemFieldChange(item.key, 'labor', event.target.value)} align="right" inputMode="numeric" /></div> : <div style={{ minHeight: 92 }} />}</td>
                                                    <td style={UI.td}>{item ? <div><span style={UI.cellLabel}>Thành tiền</span><input style={{ ...UI.cellInput, textAlign: 'right', background: '#f8fafc', color: '#166534', fontWeight: 800 }} type="text" value={fmtMoney(item.total || 0)} readOnly /></div> : <div style={{ minHeight: 92 }} />}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                <PaperField label="Ghi chú" en="Note" value={invoice.note || ''} onChange={(event) => onInvoiceFieldChange('note', event.target.value)} />
                                <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : '1fr 220px', gap: 12, alignItems: 'center' }}>
                                    <div style={{ fontSize: 15, lineHeight: 1.6 }}><span style={{ fontWeight: 700 }}>Số tiền viết bằng chữ</span><span style={UI.subEn}>(Amount in words)</span>: <b>{moneyToWords(total)}</b></div>
                                    <div style={{ borderRadius: 16, border: '1px solid rgba(22,163,74,.22)', background: 'rgba(240,253,244,.85)', padding: '12px 14px', textAlign: 'right' }}><div style={{ fontSize: 11, color: '#166534', textTransform: 'uppercase', fontWeight: 800 }}>Tổng thanh toán</div><div data-sale-amount="true" style={{ marginTop: 4, fontSize: 28, lineHeight: 1, fontWeight: 900, color: '#166534' }}>{fmtMoney(total)}</div></div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : '1fr 1fr', gap: 24, paddingTop: 10 }}>
                                    <div style={{ textAlign: 'center' }}><div style={{ fontSize: 15, fontWeight: 700 }}>Người mua hàng <span style={UI.subEn}>(Buyer)</span></div><div style={{ marginTop: 6, fontSize: 12, color: '#64748b' }}>(Ký, ghi rõ họ tên)</div><div style={{ minHeight: 92 }} /></div>
                                    <div style={{ textAlign: 'center' }}><div style={{ fontSize: 15, fontWeight: 700 }}>Người bán hàng <span style={UI.subEn}>(Seller)</span></div><div style={{ marginTop: 6, fontSize: 12, color: '#64748b' }}>(Ký, ghi rõ họ tên)</div><div style={{ minHeight: 92 }} /></div>
                                </div>

                                <div style={{ display: 'grid', gap: 6, paddingTop: 6, borderTop: '1px solid rgba(120,53,15,.18)' }}>
                                    <div style={{ fontSize: 13 }}><span style={{ fontWeight: 700 }}>Mã của cơ quan thuế</span><span style={UI.subEn}>(Tax authority code)</span>: <b>Sẽ có sau khi phát hành</b></div>
                                    <div style={{ fontSize: 13 }}><span style={{ fontWeight: 700 }}>Trang tra cứu</span><span style={UI.subEn}>(Portal)</span>: <u style={{ color: '#2563eb' }}>http://5800884170hd.easyinvoice.com.vn</u></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
