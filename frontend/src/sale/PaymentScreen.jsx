import { useEffect, useState } from 'react';
import { IoChevronDownOutline, IoChevronForward, IoChevronUpOutline, IoDocumentTextOutline, IoQrCodeOutline } from 'react-icons/io5';
import { buildEasyInvoicePayload, createEasyInvoiceDraft, createPaymentVoucherPreview, getBuyVoucherRows, hasBuyVoucherRows, resolveBuyVoucherCustomerInfo } from './printPaymentVoucher';
import { copySaleReceiptImageToClipboard, downloadSaleReceiptImage } from './printSaleReceipt';
import DocumentPreviewModal from './DocumentPreviewModal';
import EasyInvoicePaper from './EasyInvoicePaper';
import { ConfirmDialog } from './Dialogs';
import { API, NEUTRAL_BORDER, NUMBER_FONT, POS_RED, fmtCalc, normalizeTradeRate, nowStr, parseFmt, parseWeight, S } from './shared';

const FIXED_QR_BANK = 'ACB';
const FIXED_QR_ACCOUNT_NO = '296858';
const FIXED_QR_ACCOUNT_NAME = 'Phan Nguyen Buu';
const FIXED_QR_NOTE = 'Mua hang tai cong ty van kim';
const DEFAULT_RED_INVOICE_CUSTOMER = {
    name: 'PHAN NGUYEN BUU',
    cccd: '056086010108',
    phone: '0968974186',
    origin: 'KhÃ¡nh HÃ²a',
    address: 'Báº£o Lá»™c',
    code: '056086010108',
};
const REQUIRED_EASY_INVOICE_FIELDS = [
    { key: 'name', label: 'TÃªn khÃ¡ch hÃ ng' },
    { key: 'cccd', label: 'CCCD' },
    { key: 'phone', label: 'Sá»‘ Ä‘iá»‡n thoáº¡i' },
    { key: 'origin', label: 'QuÃª quÃ¡n' },
    { key: 'address', label: 'Äá»‹a chá»‰' },
];
const fmtMoneyDisplay = value => Math.round(Number(value || 0)).toLocaleString('en-US');
const pickText = (value, fallback = '') => String(value ?? '').trim() || fallback;
const normalizeSharedCustomerInfo = (customerInfo = {}) => ({
    ...customerInfo,
    name: pickText(customerInfo?.name),
    cccd: pickText(customerInfo?.cccd),
    phone: pickText(customerInfo?.phone),
    issueDate: pickText(customerInfo?.issueDate),
    origin: pickText(customerInfo?.origin),
    address: pickText(customerInfo?.address || customerInfo?.residence),
    residence: pickText(customerInfo?.residence || customerInfo?.address),
    taxCode: pickText(customerInfo?.taxCode),
    email: pickText(customerInfo?.email),
    emailCc: pickText(customerInfo?.emailCc),
    bankName: pickText(customerInfo?.bankName),
    bankNo: pickText(customerInfo?.bankNo),
    frontImage: pickText(customerInfo?.frontImage),
    backImage: pickText(customerInfo?.backImage),
});
const recomputeLinkedSaleLine = (line, rates, overrides = {}) => {
    const nextLine = { ...line, ...overrides };
    const effectiveCat = nextLine.tx === 'trade' ? 'gold' : nextLine.cat;
    const rate = rates?.[effectiveCat]?.[nextLine.product] || [0, 0];
    const sellRate = normalizeTradeRate(effectiveCat, nextLine.customSell !== undefined ? nextLine.customSell : rate[0]);
    const tradeRate = normalizeTradeRate(effectiveCat, nextLine.customTrade !== undefined ? nextLine.customTrade : rate[0]);
    const currentRate = nextLine.tx === 'trade' ? tradeRate : sellRate;
    const customerRate = normalizeTradeRate(
        'gold',
        nextLine.customerCustomBuy !== undefined && String(nextLine.customerCustomBuy).trim() !== ''
            ? nextLine.customerCustomBuy
            : (rates?.gold?.[nextLine.customerProduct || '']?.[1] || 0),
    );
    const baseQty = parseFmt(nextLine.qty || 0);
    const customerQty = parseWeight(nextLine.customerQty || 0);
    const sellLabor = parseFmt(nextLine.sellLabor || 0);
    const sellAddedGold = parseWeight(nextLine.sellAddedGold || 0);
    const sellCutGold = parseWeight(nextLine.sellCutGold || 0);
    const itemGoldWeight = parseWeight(nextLine.itemGoldWeight || 0);
    const inventoryBaseGoldWeight = itemGoldWeight > 0 ? itemGoldWeight : 1;
    const isInventoryProductLocked = effectiveCat === 'gold' && ['sell', 'trade'].includes(nextLine.tx) && Boolean(nextLine.itemId);
    const effectiveGoldQty = (nextLine.tx === 'sell' || nextLine.tx === 'trade') && effectiveCat === 'gold'
        ? Math.max(0, (isInventoryProductLocked ? inventoryBaseGoldWeight : baseQty) + sellAddedGold - sellCutGold)
        : baseQty;
    const billableQty = (nextLine.tx === 'sell' || nextLine.tx === 'trade') && effectiveCat === 'gold' ? effectiveGoldQty : baseQty;
    const inventoryValue = Math.round(billableQty * parseFmt(currentRate));
    const goldEditorAmount = (nextLine.tx === 'sell' || nextLine.tx === 'trade') && effectiveCat === 'gold'
        ? Math.round(inventoryValue + sellLabor)
        : inventoryValue;
    const tradeAdjustmentAmount = Math.round(parseFmt(nextLine.tradeComp || 0));
    const tradeCustomerAmount = nextLine.tx === 'trade' ? Math.round(customerQty * parseFmt(customerRate)) : 0;
    return {
        ...nextLine,
        value: nextLine.tx === 'trade'
            ? Math.round(goldEditorAmount - tradeCustomerAmount + tradeAdjustmentAmount)
            : goldEditorAmount,
    };
};
const normalizeInvoiceItem = (item) => {
    const quantityValue = Number(String(item?.quantity ?? 0).replace(/,/g, '.'));
    const quantity = Number.isFinite(quantityValue) && quantityValue > 0 ? Number(quantityValue.toFixed(4)) : 0;
    const componentPrice = Math.max(0, Math.round(parseFmt(item?.componentPrice || 0)));
    const labor = Math.max(0, Math.round(parseFmt(item?.labor || 0)));
    return {
        ...item,
        manual: Boolean(item?.manual),
        unit: pickText(item?.unit, 'chi'),
        quantity,
        componentPrice,
        labor,
        total: Math.round(quantity * componentPrice + labor),
    };
};
function EditableNumericInput({ value, onValueChange, style, readOnly = false, showStepper = false, step = 1000, min = 0, commitOnBlur = false }) {
    const [text, setText] = useState(null);
    const [focused, setFocused] = useState(false);
    const displayValue = focused ? (text ?? fmtMoneyDisplay(value)) : fmtMoneyDisplay(value);
    const applyNextValue = (nextValue) => {
        const safeValue = Math.max(min, Math.round(Number(nextValue || 0)));
        setText(fmtMoneyDisplay(safeValue));
        onValueChange?.(String(safeValue));
    };

    if (readOnly) {
        return <input style={style} type="text" value={fmtMoneyDisplay(value)} readOnly />;
    }

    return (
        <div style={{ position: 'relative', width: '100%' }}>
            <input
                style={showStepper ? { ...style, paddingRight: 32 } : style}
                type="text"
                inputMode="numeric"
                value={displayValue}
                onFocus={() => setFocused(true)}
                onChange={e => {
                    const nextText = e.target.value;
                    setText(nextText);
                    if (!commitOnBlur) {
                        onValueChange?.(nextText);
                    }
                }}
                onBlur={() => {
                    if (commitOnBlur) {
                        onValueChange?.(text ?? String(value ?? 0));
                    }
                    setFocused(false);
                    setText(null);
                }}
            />
            {showStepper ? (
                <div style={{ position: 'absolute', right: 6, top: 5, bottom: 5, width: 22, display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <button
                        type="button"
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => applyNextValue((focused ? parseFmt(text ?? value) : Number(value || 0)) + step)}
                        style={{ flex: 1, borderRadius: 7, border: '1px solid #dbe4ee', background: '#f8fafc', color: '#475569', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0, cursor: 'pointer' }}
                        aria-label="TÄƒng giÃ¡ trá»‹"
                        title="TÄƒng giÃ¡ trá»‹"
                    >
                        <IoChevronUpOutline style={{ fontSize: 12 }} />
                    </button>
                    <button
                        type="button"
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => applyNextValue((focused ? parseFmt(text ?? value) : Number(value || 0)) - step)}
                        style={{ flex: 1, borderRadius: 7, border: '1px solid #dbe4ee', background: '#f8fafc', color: '#475569', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0, cursor: 'pointer' }}
                        aria-label="Giáº£m giÃ¡ trá»‹"
                        title="Giáº£m giÃ¡ trá»‹"
                    >
                        <IoChevronDownOutline style={{ fontSize: 12 }} />
                    </button>
                </div>
            ) : null}
        </div>
    );
}
const mergeEasyInvoiceDraft = (baseDraft, previousDraft) => {
    const previousItemsByKey = new Map((previousDraft?.items || []).map(item => [String(item?.key || item?.lineId || item?.code || ''), item]));
    const baseItemKeys = new Set((baseDraft.items || []).map(item => String(item?.key || item?.lineId || item?.code || '')));
    return {
        ...baseDraft,
        customer: {
            ...baseDraft.customer,
            ...(previousDraft?.customer || {}),
        },
        invoice: {
            ...(baseDraft.invoice || {}),
            ...(previousDraft?.invoice || {}),
        },
        items: [
            ...(baseDraft.items || []).map(item => {
            const previousItem = previousItemsByKey.get(String(item?.key || item?.lineId || item?.code || ''));
            return normalizeInvoiceItem(previousItem ? {
                ...item,
                code: pickText(previousItem.code, item.code),
                name: pickText(previousItem.name, item.name),
                unit: pickText(previousItem.unit, item.unit),
                quantity: previousItem.quantity ?? item.quantity,
                componentPrice: previousItem.componentPrice ?? item.componentPrice,
                labor: previousItem.labor ?? item.labor,
            } : item);
            }),
            ...(previousDraft?.items || [])
                .filter(item => Boolean(item?.manual) && !baseItemKeys.has(String(item?.key || item?.lineId || item?.code || '')))
                .map(item => normalizeInvoiceItem(item)),
        ],
    };
};
export default function PaymentScreen({ total, orderId, formula, lines, setLines, rates, customerInfo, setCustomerInfo, onBack, onSend, loading }) {
    const isIn = total >= 0;
    const absTotal = Math.abs(total);
    const totalPrefix = total > 0 ? '+' : total < 0 ? '-' : '';
    const totalLabel = total > 0 ? 'KHÃCH TRáº¢' : total < 0 ? 'KHÃCH NHáº¬N' : 'Tá»”NG Táº M TÃNH';
    const hasBuyVoucherData = hasBuyVoucherRows(lines);
    const sharedCustomerInfo = normalizeSharedCustomerInfo(customerInfo);
    const [cash, setCash] = useState(0);
    const [bank, setBank] = useState(absTotal);
    const [activePanel, setActivePanel] = useState('payment');
    const [invoiceLoading, setInvoiceLoading] = useState(false);
    const [issueConfirmOpen, setIssueConfirmOpen] = useState(false);
    const [actionMessage, setActionMessage] = useState('');
    const [easyInvoiceDraft, setEasyInvoiceDraft] = useState(() => mergeEasyInvoiceDraft(createEasyInvoiceDraft({ orderId, customerInfo, lines, rates }), null));
    const [easyInvoiceEditorError, setEasyInvoiceEditorError] = useState('');
    const [, setEasyInvoiceResult] = useState(null);
    const [, setEasyInvoiceResultOpen] = useState(false);
    const [voucherPreviewOpen, setVoucherPreviewOpen] = useState(false);
    const [voucherPreviewLoading, setVoucherPreviewLoading] = useState(false);
    const [voucherPreviewUrl, setVoucherPreviewUrl] = useState('');
    const [voucherPreviewTitle, setVoucherPreviewTitle] = useState('Phiáº¿u kÃª mua hÃ ng');
    const [voucherPreviewSubtitle, setVoucherPreviewSubtitle] = useState('File PNG preview cho phiáº¿u kÃª mua hÃ ng.');
    const [voucherPreviewFileName, setVoucherPreviewFileName] = useState('phieu-ke-mua-hang.png');
    const [voucherPreviewDocumentName, setVoucherPreviewDocumentName] = useState('Phiáº¿u kÃª mua hÃ ng');
    const [voucherPreviewError, setVoucherPreviewError] = useState('');
    const [voucherPreviewActionMessage, setVoucherPreviewActionMessage] = useState('');
    const [voucherPreviewActionError, setVoucherPreviewActionError] = useState(false);
    const [voucherSending, setVoucherSending] = useState(false);

    useEffect(() => {
        setEasyInvoiceDraft(prev => mergeEasyInvoiceDraft(createEasyInvoiceDraft({ orderId, customerInfo, lines, rates }), prev));
    }, [orderId, customerInfo, lines, rates]);
    const easyInvoiceCustomer = {
        ...sharedCustomerInfo,
        ...(easyInvoiceDraft?.customer || {}),
        code: pickText(easyInvoiceDraft?.customer?.code || sharedCustomerInfo?.cccd || sharedCustomerInfo?.phone || orderId, orderId),
    };
    const easyInvoiceItems = easyInvoiceDraft?.items || [];
    const easyInvoiceTotal = easyInvoiceItems.reduce((sum, item) => sum + Math.round(Number(item?.total || 0)), 0);
    const hasEasyInvoiceItems = easyInvoiceItems.length > 0;
    const buyVoucherSummary = getBuyVoucherRows(lines, rates);
    const buyVoucherRows = buyVoucherSummary?.rows || [];
    const missingEasyInvoiceFields = hasEasyInvoiceItems
        ? REQUIRED_EASY_INVOICE_FIELDS.filter(field => !pickText(easyInvoiceCustomer?.[field.key])).map(field => field.label)
        : [];
    const missingEasyInvoiceFieldKeys = new Set(
        hasEasyInvoiceItems
            ? REQUIRED_EASY_INVOICE_FIELDS.filter(field => !pickText(easyInvoiceCustomer?.[field.key])).map(field => field.key)
            : []
    );
    const requiredCustomerReason = missingEasyInvoiceFields.length ? `Vui lÃ²ng nháº­p Ä‘á»§: ${missingEasyInvoiceFields.join(', ')}.` : '';
    const exportInvoiceReason = !hasEasyInvoiceItems ? 'ChÆ°a cÃ³ sáº£n pháº©m cÃ³ tem Ä‘á»ƒ xuáº¥t hÃ³a Ä‘Æ¡n Ä‘á».' : easyInvoiceTotal <= 0 ? 'Tá»•ng giÃ¡ trá»‹ pháº§n bÃ¡n pháº£i lá»›n hÆ¡n 0.' : '';
    const issueInvoiceReason = !hasEasyInvoiceItems ? 'ChÃ†Â°a cÃƒÂ³ sÃ¡ÂºÂ£n phÃ¡ÂºÂ©m cÃƒÂ³ tem Ã„â€˜Ã¡Â»Æ’ xuÃ¡ÂºÂ¥t hÃƒÂ³a Ã„â€˜Ã†Â¡n Ã„â€˜Ã¡Â»Â.' : easyInvoiceTotal <= 0 ? 'TÃ¡Â»â€¢ng giÃƒÂ¡ trÃ¡Â»â€¹ phÃ¡ÂºÂ§n bÃƒÂ¡n phÃ¡ÂºÂ£i lÃ¡Â»â€ºn hÃ†Â¡n 0.' : '';
    const createOrderReason = isIn ? requiredCustomerReason : '';
    const effectiveIssueInvoiceReason = requiredCustomerReason || issueInvoiceReason;
    const canIssueEasyInvoice = !effectiveIssueInvoiceReason;
    const effectiveExportInvoiceReason = effectiveIssueInvoiceReason || exportInvoiceReason;
    const exportInvoiceButtonLabel = 'Xuất HĐ đỏ';
    const hasCustomerIdentityImages = Boolean(sharedCustomerInfo?.frontImage && sharedCustomerInfo?.backImage);
    const largeMoneyInputStyle = { ...S.inp, height: 56, minHeight: 56, fontSize: 20, lineHeight: 1, padding: '10px 16px' };
    const numericInputStyle = {
        ...S.inp,
        fontFamily: NUMBER_FONT,
        fontVariantNumeric: 'tabular-nums',
        fontFeatureSettings: '"tnum" 1',
        lineHeight: 1,
        paddingTop: 10,
        paddingBottom: 10,
    };
    const largeNumericInputStyle = {
        ...largeMoneyInputStyle,
        fontFamily: NUMBER_FONT,
        fontVariantNumeric: 'tabular-nums',
        fontFeatureSettings: '"tnum" 1',
    };
    const qrUrl = bank > 0
        ? `https://img.vietqr.io/image/${FIXED_QR_BANK}-${FIXED_QR_ACCOUNT_NO}-compact2.png?amount=${Math.abs(bank)}&addInfo=${encodeURIComponent(FIXED_QR_NOTE)}&accountName=${encodeURIComponent(FIXED_QR_ACCOUNT_NAME)}`
        : '';
    const footerPillStyle = (bg, disabled = false) => ({ ...S.pillBtn(bg, '#ffffff'), height: 52, minHeight: 52, padding: '0 16px', fontSize: 11, whiteSpace: 'nowrap', justifyContent: 'center', opacity: disabled ? 0.55 : 1, cursor: disabled ? 'not-allowed' : 'pointer' });
    const compactActionPillStyle = (bg, disabled = false) => ({ ...footerPillStyle(bg, disabled), height: 36, minHeight: 36, borderRadius: 18, padding: '0 14px', fontSize: 12 });
    const customerFieldInputStyle = key => ({ ...S.inp, textAlign: 'left', borderColor: missingEasyInvoiceFieldKeys.has(key) ? '#fca5a5' : '#dbe4ee' });

    const handleCashChange = value => { const next = Math.min(parseFmt(value), absTotal); setCash(next); setBank(absTotal - next); };
    const handleBankChange = value => { const next = Math.min(parseFmt(value), absTotal); setBank(next); setCash(absTotal - next); };
    const updateSharedCustomerInfo = (field, value) => {
        setCustomerInfo?.(prev => ({
            ...prev,
            [field]: value,
            ...(field === 'address' ? { residence: value } : {}),
        }));
        setEasyInvoiceDraft(prev => ({
            ...prev,
            customer: {
                ...(prev?.customer || {}),
                [field]: value,
                ...(field === 'address' ? { residence: value } : {}),
            },
        }));
    };
    const applyDefaultRedInvoiceCustomer = () => {
        setEasyInvoiceEditorError('');
        setCustomerInfo?.(prev => ({
            ...prev,
            ...DEFAULT_RED_INVOICE_CUSTOMER,
            address: DEFAULT_RED_INVOICE_CUSTOMER.address,
            residence: DEFAULT_RED_INVOICE_CUSTOMER.address,
        }));
        setEasyInvoiceDraft(prev => ({
            ...prev,
            customer: {
                ...(prev?.customer || {}),
                ...DEFAULT_RED_INVOICE_CUSTOMER,
                address: DEFAULT_RED_INVOICE_CUSTOMER.address,
                residence: DEFAULT_RED_INVOICE_CUSTOMER.address,
            },
        }));
    };
    const updateEasyInvoiceCustomerField = (field, value) => {
        setEasyInvoiceEditorError('');
        if (['name', 'cccd', 'phone', 'origin', 'address', 'taxCode', 'email', 'emailCc', 'bankName', 'bankNo', 'code'].includes(field)) {
            setEasyInvoiceDraft(prev => ({
                ...prev,
                customer: {
                    ...(prev?.customer || {}),
                    [field]: value,
                    ...(field === 'address' ? { residence: value } : {}),
                },
            }));
        }
        if (['name', 'cccd', 'phone', 'origin', 'address', 'taxCode', 'email', 'emailCc', 'bankName', 'bankNo'].includes(field)) {
            setCustomerInfo?.(prev => ({
                ...prev,
                [field]: value,
                ...(field === 'address' ? { residence: value } : {}),
            }));
        }
    };
    const updateEasyInvoiceInvoiceField = (field, value) => {
        setEasyInvoiceEditorError('');
        setEasyInvoiceDraft(prev => ({
            ...prev,
            invoice: {
                ...(prev?.invoice || {}),
                [field]: value,
            },
        }));
    };
    const syncEasyInvoiceItemToHomeLine = (key, field, value) => {
        if (!setLines || !['componentPrice', 'labor'].includes(field)) return;
        setLines(prevLines => prevLines.map(line => {
            const matchedItem = easyInvoiceItems.find(item => String(item?.key) === String(key));
            if (!matchedItem || String(line?.id) !== String(matchedItem?.lineId)) return line;
            const nextAmount = Math.max(0, Math.round(parseFmt(value || 0)));
            const patch = field === 'componentPrice'
                ? { [line.tx === 'trade' ? 'customTrade' : 'customSell']: nextAmount }
                : { sellLabor: nextAmount };
            return recomputeLinkedSaleLine(line, rates, patch);
        }));
    };
    const updateEasyInvoiceItem = (key, field, value) => {
        setEasyInvoiceEditorError('');
        setEasyInvoiceDraft(prev => ({
            ...prev,
            items: (prev?.items || []).map(item => String(item?.key) === String(key) ? normalizeInvoiceItem({ ...item, [field]: field === 'componentPrice' || field === 'labor' ? parseFmt(value || 0) : value }) : item),
        }));
    };
    const addEasyInvoiceManualItem = () => {
        setEasyInvoiceEditorError('');
        setEasyInvoiceDraft(prev => ({
            ...prev,
            items: [
                ...(prev?.items || []),
                normalizeInvoiceItem({
                    key: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                    lineId: null,
                    manual: true,
                    code: '',
                    name: '',
                    unit: 'chi',
                    quantity: 1,
                    componentPrice: 0,
                    labor: 0,
                }),
            ],
        }));
    };
    const removeEasyInvoiceItem = (key) => {
        setEasyInvoiceEditorError('');
        setEasyInvoiceDraft(prev => ({
            ...prev,
            items: (prev?.items || []).filter(item => String(item?.key) !== String(key)),
        }));
    };
    const getVoucherFileName = (serialNo) => {
        const normalizedOrderId = String(orderId || 'sale').trim().replace(/[^a-zA-Z0-9_-]+/g, '-');
        return `phieu-ke-mua-hang-${normalizedOrderId}${serialNo ? `-${serialNo}` : ''}.png`;
    };
    const extractBase64FromDataUrl = (imageUrl) => {
        const matched = String(imageUrl || '').match(/^data:(.+?);base64,(.+)$/i);
        if (!matched) throw new Error('KhÃ´ng Ä‘á»c Ä‘Æ°á»£c dá»¯ liá»‡u PNG Ä‘á»ƒ gá»­i agent.');
        return {
            contentType: matched[1] || 'image/png',
            imageBase64: matched[2] || '',
        };
    };
    const queueVoucherToAgent = async (imageUrl = voucherPreviewUrl) => {
        const { contentType, imageBase64 } = extractBase64FromDataUrl(imageUrl);
        setVoucherSending(true);
        setVoucherPreviewActionError(false);
        setVoucherPreviewActionMessage('');
        try {
            const response = await fetch(`${API}/api/print/dispatch-image`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    image_base64: imageBase64,
                    content_type: contentType,
                    document_name: voucherPreviewDocumentName || 'Phiáº¿u kÃª mua hÃ ng',
                    file_name: voucherPreviewFileName || 'phieu-ke-mua-hang.png',
                    requested_by: 'POS Mobile',
                }),
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
            const agentName = payload?.agent?.device_name || payload?.agent?.agent_key || 'agent';
            const printerName = payload?.printer?.printer_name || payload?.command?.printer_name || '';
            setVoucherPreviewActionMessage(printerName ? `ÄÃ£ gá»­i PNG tá»›i ${agentName} / ${printerName}.` : `ÄÃ£ gá»­i PNG tá»›i ${agentName}.`);
            return payload;
        } catch (error) {
            setVoucherPreviewActionError(true);
            setVoucherPreviewActionMessage(error.message || 'KhÃ´ng gá»­i Ä‘Æ°á»£c PNG tá»›i agent.');
            throw error;
        } finally {
            setVoucherSending(false);
        }
    };
    const handleVoucherDownload = () => {
        if (!voucherPreviewUrl) return;
        downloadSaleReceiptImage(voucherPreviewUrl, voucherPreviewFileName);
        setVoucherPreviewActionError(false);
        setVoucherPreviewActionMessage(`ÄÃ£ táº£i ${voucherPreviewFileName}.`);
    };
    const handleVoucherCopy = async () => {
        if (!voucherPreviewUrl) return;
        setVoucherPreviewActionError(false);
        setVoucherPreviewActionMessage('');
        try {
            await copySaleReceiptImageToClipboard(voucherPreviewUrl);
            setVoucherPreviewActionMessage('ÄÃ£ copy PNG vÃ o clipboard.');
        } catch (error) {
            setVoucherPreviewActionError(true);
            setVoucherPreviewActionMessage(error.message || 'KhÃ´ng copy Ä‘Æ°á»£c PNG.');
        }
    };
    const openBuyVoucherPreview = async (options = {}) => {
        setVoucherPreviewOpen(true);
        setVoucherPreviewLoading(true);
        setVoucherPreviewError('');
        setVoucherPreviewUrl('');
        setVoucherPreviewActionMessage('');
        setVoucherPreviewActionError(false);
        try {
            const settlement = buildSettlementPayload();
            const { imageUrl, model } = await createPaymentVoucherPreview({
                orderId,
                total,
                customerInfo: buildBuyVoucherCustomerInfo(),
                lines,
                rates,
                settlement,
                serialNoOverride: options.serialNoOverride,
                modeOverride: options.modeOverride || 'buy',
            });
            const serialNo = String(options.serialNoOverride || model?.serialNo || '').trim();
            const documentTitle = model?.title || 'Phiáº¿u kÃª mua hÃ ng';
            setVoucherPreviewTitle(documentTitle);
            setVoucherPreviewSubtitle(serialNo ? `PNG preview. Sá»‘ phiáº¿u: ${serialNo}.` : 'PNG preview cho phiáº¿u kÃª mua hÃ ng.');
            setVoucherPreviewFileName(getVoucherFileName(serialNo));
            setVoucherPreviewDocumentName(documentTitle);
            setVoucherPreviewUrl(imageUrl);
            return { imageUrl, model };
        } catch (error) {
            setVoucherPreviewError(error.message || 'KhÃ´ng táº¡o Ä‘Æ°á»£c file PNG cho phiáº¿u kÃª mua hÃ ng.');
            setVoucherPreviewActionError(true);
            setVoucherPreviewActionMessage(error.message || 'KhÃ´ng táº¡o Ä‘Æ°á»£c file PNG cho phiáº¿u kÃª mua hÃ ng.');
            return null;
        } finally {
            setVoucherPreviewLoading(false);
        }
    };
    const buildSettlementPayload = () => ({
        orderId,
        total: fmtMoneyDisplay(total),
        totalRaw: total,
        cashText: fmtMoneyDisplay(isIn ? cash : -cash),
        cashRaw: isIn ? cash : -cash,
        bankcash: fmtMoneyDisplay(isIn ? bank : -bank),
        bankcashRaw: isIn ? bank : -bank,
        bank,
        cash,
        frombank: `${FIXED_QR_BANK}-${FIXED_QR_ACCOUNT_NO}-${FIXED_QR_ACCOUNT_NAME}`,
        transactiontype: isIn ? 'THU' : 'CHI',
        note: FIXED_QR_NOTE,
        formula,
        paymentMethod: cash > 0 && bank > 0 ? 'Tiá»n máº·t/Chuyá»ƒn khoáº£n' : bank > 0 ? 'Chuyá»ƒn khoáº£n' : cash > 0 ? 'Tiá»n máº·t' : 'KhÃ´ng thu tiá»n',
        created_at: nowStr(),
    });
    const buildEasyInvoiceCustomerInfo = () => ({
        ...sharedCustomerInfo,
        ...(easyInvoiceDraft?.customer || {}),
        code: pickText(easyInvoiceDraft?.customer?.code || sharedCustomerInfo?.cccd || sharedCustomerInfo?.phone || orderId, orderId),
    });
    const buildBuyVoucherCustomerInfo = () => resolveBuyVoucherCustomerInfo(sharedCustomerInfo);
    const handleSend = async () => {
        if (createOrderReason) {
            setActionMessage(createOrderReason);
            return;
        }
        await onSend(buildSettlementPayload(), {
            customerInfoOverride: isIn ? buildEasyInvoiceCustomerInfo() : null,
            finalize: true,
            markSold: true,
        });
    };
    const claimBuyVoucherSerial = async () => {
        const response = await fetch(`${API}/api/payment-voucher/buy-serial`, { method: 'POST' });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
        return payload;
    };
    const handleExportEasyInvoice = async () => {
        try {
            const settlement = buildSettlementPayload();
            const easyInvoiceCustomerInfo = buildEasyInvoiceCustomerInfo();
            const invoiceData = buildEasyInvoicePayload({ orderId, customerInfo: easyInvoiceCustomerInfo, lines, rates, settlement, easyInvoiceDraft });
            const response = await fetch(`${API}/api/easyinvoice/export`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order_id: orderId, total, customer_info: easyInvoiceCustomerInfo, settlement, invoice_data: invoiceData }) });
            const result = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
            const amountValue = Math.round(Number(result?.amount ?? invoiceData?.invoice?.amount ?? 0));
            const modalPayload = {
                ...result,
                message: result.msg || 'ÄÃ£ táº¡o EasyInvoice thÃ nh cÃ´ng.',
                amount_text: `${fmtMoneyDisplay(amountValue)} VND`,
                buyer: result.buyer || easyInvoiceCustomerInfo.name || 'KhÃ¡ch láº»',
            };
            setEasyInvoiceResult(modalPayload);
            setEasyInvoiceResultOpen(true);
            setActionMessage(result.msg || 'ÄÃ£ táº¡o EasyInvoice thÃ nh cÃ´ng.');
            return modalPayload;
        } catch (error) {
            setActionMessage(error.message || 'KhÃ´ng xuáº¥t Ä‘Æ°á»£c hÃ³a Ä‘Æ¡n Ä‘á».');
            throw error;
        }
    };
    const handleExportEasyInvoiceWithOrder = async () => {
        if (effectiveExportInvoiceReason) {
            setActionMessage(effectiveExportInvoiceReason);
            return;
        }
        setInvoiceLoading(true);
        setEasyInvoiceResult(null);
        setEasyInvoiceResultOpen(false);
        setActionMessage('');
        try {
            const settlement = buildSettlementPayload();
            await onSend(settlement, {
                customerInfoOverride: buildEasyInvoiceCustomerInfo(),
                finalize: false,
                markSold: false,
                silent: true,
            });
            await handleExportEasyInvoice();
            setInvoiceLoading(false);
            if (hasBuyVoucherData) {
                const serialData = await claimBuyVoucherSerial();
                const preview = await openBuyVoucherPreview({ serialNoOverride: serialData.serial_no, modeOverride: 'buy' });
                if (preview?.imageUrl) {
                    try {
                        await queueVoucherToAgent(preview.imageUrl);
                    } catch {
                        // Preview modal already shows agent errors.
                    }
                }
                setActionMessage('ÄÃ£ táº¡o EasyInvoice. Phiáº¿u kÃª mua hÃ ng Ä‘ang á»Ÿ dáº¡ng PNG.');
            } else {
                setActionMessage('ÄÃ£ táº¡o EasyInvoice thÃ nh cÃ´ng.');
            }
        } catch (error) {
            setActionMessage(error.message || 'KhÃ´ng ghi Ä‘Æ°á»£c Ä‘Æ¡n hÃ ng vÃ o backend.');
        } finally {
            setInvoiceLoading(false);
        }
    };
    Promise.resolve(handleExportEasyInvoiceWithOrder);
    const openIssueInvoiceConfirm = () => {
        if (effectiveExportInvoiceReason) {
            setEasyInvoiceEditorError(effectiveExportInvoiceReason);
            setActionMessage(effectiveExportInvoiceReason);
            return;
        }
        setEasyInvoiceEditorError('');
        setActionMessage('');
        setIssueConfirmOpen(true);
    };
    const handleIssueEasyInvoice = async () => {
        if (effectiveIssueInvoiceReason) {
            setEasyInvoiceEditorError(effectiveIssueInvoiceReason);
            return;
        }
        setInvoiceLoading(true);
        setEasyInvoiceEditorError('');
        setActionMessage('');
        try {
            const settlement = buildSettlementPayload();
            const easyInvoiceCustomerInfo = buildEasyInvoiceCustomerInfo();
            const invoiceData = buildEasyInvoicePayload({ orderId, customerInfo: easyInvoiceCustomerInfo, lines, rates, settlement, easyInvoiceDraft });
            await onSend(settlement, {
                customerInfoOverride: easyInvoiceCustomerInfo,
                finalize: false,
                markSold: false,
                silent: true,
            });
            const response = await fetch(`${API}/api/easyinvoice/issue`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ order_id: orderId, total, customer_info: easyInvoiceCustomerInfo, settlement, invoice_data: invoiceData }),
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
            setIssueConfirmOpen(false);
            if (hasBuyVoucherData) {
                const serialData = await claimBuyVoucherSerial();
                const preview = await openBuyVoucherPreview({ serialNoOverride: serialData.serial_no, modeOverride: 'buy' });
                if (preview?.imageUrl) {
                    try {
                        await queueVoucherToAgent(preview.imageUrl);
                    } catch {
                        // Preview modal already shows agent errors.
                    }
                }
                setActionMessage(result.msg || 'Ã„ÂÃƒÂ£ phÃƒÂ¡t hÃƒÂ nh EasyInvoice. PhiÃ¡ÂºÂ¿u kÃƒÂª mua hÃƒÂ ng Ã„â€˜ang Ã¡Â»Å¸ dÃ¡ÂºÂ¡ng PNG.');
            } else {
                setActionMessage(result.msg || 'Ã„ÂÃƒÂ£ phÃƒÂ¡t hÃƒÂ nh EasyInvoice thÃƒÂ nh cÃƒÂ´ng.');
            }
        } catch (error) {
            setEasyInvoiceEditorError(error.message || 'KhÃƒÂ´ng phÃƒÂ¡t hÃƒÂ nh Ã„â€˜Ã†Â°Ã¡Â»Â£c hÃƒÂ³a Ã„â€˜Ã†Â¡n Ã„â€˜Ã¡Â»Â.');
            setActionMessage(error.message || 'KhÃƒÂ´ng ghi Ã„â€˜Ã†Â°Ã¡Â»Â£c Ã„â€˜Ã†Â¡n hÃƒÂ ng vÃƒÂ o backend.');
        } finally {
            setInvoiceLoading(false);
        }
    };

    const screenTabs = [
        { key: 'payment', label: isIn ? 'Thanh toÃ¡n' : 'Chi tráº£' },
        { key: 'invoice', label: 'HÃ³a ÄÆ¡n Äá»' },
        { key: 'voucher', label: 'Phiáº¿u KÃª MH' },
    ];
    const actionMessageColor = /HTTP|Khong|khong|error/i.test(actionMessage) ? '#dc2626' : '#166534';
    const tabButtonStyle = (active) => ({
        border: 'none',
        borderRadius: 16,
        padding: '12px 16px',
        minWidth: 0,
        flex: 1,
        background: active ? 'linear-gradient(135deg,#0f172a,#334155)' : '#ffffff',
        color: active ? '#ffffff' : '#475569',
        fontSize: 12,
        fontWeight: 800,
        cursor: 'pointer',
        boxShadow: active ? '0 12px 24px rgba(15,23,42,.14)' : '0 4px 10px rgba(15,23,42,.05)',
    });
    const sharedCustomerCard = (
        <div style={S.card}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
                <div>
                    <div style={S.sectionTitle}>Thong tin khach hang</div>
                    <div style={{ fontSize: 10, lineHeight: 1.55, color: '#64748b', marginTop: 4 }}>
                        Dung chung cho hoa don do va phieu ke mua hang, khong can nhap lai o tung tab.
                    </div>
                </div>
                <button
                    type="button"
                    onClick={applyDefaultRedInvoiceCustomer}
                    style={{ textAlign: 'right', flexShrink: 0, border: 'none', background: 'transparent', padding: 0, cursor: 'pointer' }}
                    title="Dien du lieu mac dinh"
                    aria-label="Dien du lieu mac dinh"
                >
                    <div style={{ fontSize: 11, color: '#2563eb', fontWeight: 800 }}>Dien mac dinh HD</div>
                </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                    <span style={S.label}>Ten khach hang</span>
                    <input style={customerFieldInputStyle('name')} type="text" required value={sharedCustomerInfo?.name || ''} onChange={e => updateSharedCustomerInfo('name', e.target.value)} />
                </div>
                <div>
                    <span style={S.label}>CCCD</span>
                    <input style={customerFieldInputStyle('cccd')} type="text" required value={sharedCustomerInfo?.cccd || ''} onChange={e => updateSharedCustomerInfo('cccd', e.target.value)} />
                </div>
                <div>
                    <span style={S.label}>So dien thoai</span>
                    <input style={customerFieldInputStyle('phone')} type="text" required value={sharedCustomerInfo?.phone || ''} onChange={e => updateSharedCustomerInfo('phone', e.target.value)} />
                </div>
                <div>
                    <span style={S.label}>Ngay cap CCCD</span>
                    <input style={customerFieldInputStyle('issueDate')} type="text" value={sharedCustomerInfo?.issueDate || ''} onChange={e => updateSharedCustomerInfo('issueDate', e.target.value)} />
                </div>
                <div>
                    <span style={S.label}>Que quan</span>
                    <input style={customerFieldInputStyle('origin')} type="text" required value={sharedCustomerInfo?.origin || ''} onChange={e => updateSharedCustomerInfo('origin', e.target.value)} />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                    <span style={S.label}>Dia chi</span>
                    <input style={customerFieldInputStyle('address')} type="text" required value={sharedCustomerInfo?.address || ''} onChange={e => updateSharedCustomerInfo('address', e.target.value)} />
                </div>
            </div>
            {!hasCustomerIdentityImages ? (
                <div style={{ marginTop: 12, borderRadius: 14, border: '1px dashed rgba(245,158,11,.5)', background: '#fff7ed', padding: 12, fontSize: 12, lineHeight: 1.6, color: '#9a3412' }}>
                    Chua co du anh CCCD mat truoc va mat sau. Neu can phieu ke mua hang chuan, hay bo sung o man Sale truoc khi xuat.
                </div>
            ) : null}
        </div>
    );
    const paymentPanel = (
        <>
            <div style={S.card}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: isIn ? 12 : 16 }}>
                    <div>
                        <span style={S.label}>Chuyá»ƒn khoáº£n</span>
                        <EditableNumericInput value={bank} onValueChange={handleBankChange} style={isIn ? { ...numericInputStyle, color: '#2563eb' } : { ...largeNumericInputStyle, color: '#2563eb' }} commitOnBlur />
                    </div>
                    <div>
                        <span style={S.label}>Tiá»n máº·t</span>
                        <EditableNumericInput value={cash} onValueChange={handleCashChange} style={isIn ? { ...numericInputStyle, color: POS_RED } : { ...largeNumericInputStyle, color: POS_RED }} commitOnBlur />
                    </div>
                </div>
            </div>
            {bank > 0 ? (
                <div style={S.card}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <div style={{ borderRadius: 16, border: '2px solid #6366f1', background: '#eef2ff', padding: 12 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, color: '#4338ca', fontSize: 12, fontWeight: 800 }}>
                                <IoQrCodeOutline style={{ fontSize: 18 }} />
                                <span>VietQR chuyá»ƒn khoáº£n</span>
                            </div>
                            <img src={qrUrl} alt="VietQR" style={{ width: '100%', display: 'block', borderRadius: 12, background: '#ffffff' }} />
                        </div>
                        <div style={{ ...S.inp, minHeight: 0, height: 'auto', padding: '12px 14px', textAlign: 'left', lineHeight: 1.6, background: '#f8fafc' }}>
                            <div style={{ fontSize: 10, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>ThÃ´ng tin VietQR</div>
                            <div style={{ fontSize: 13, color: '#0f172a', fontWeight: 700 }}>{FIXED_QR_BANK} Â· {FIXED_QR_ACCOUNT_NO}</div>
                            <div style={{ fontSize: 12, color: '#334155' }}>{FIXED_QR_ACCOUNT_NAME}</div>
                            <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>Ná»™i dung: {FIXED_QR_NOTE}</div>
                        </div>
                    </div>
                </div>
            ) : null}
        </>
    );
    const invoicePanel = (
        <>
            <div style={S.card}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
                    <div style={{ minWidth: 0 }}>
                        <div style={S.sectionTitle}>Hóa Đơn Đỏ</div>
                        <div style={{ fontSize: 10, lineHeight: 1.55, color: '#64748b', marginTop: 4 }}>
                            Dùng trực tiếp mẫu hóa đơn đỏ đã tạo. Sau khi kiểm tra đúng thông tin, bấm xuất để xác nhận rồi gọi API ký phát hành.
                        </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: 9, color: '#64748b', fontWeight: 700, marginBottom: 4 }}>Tổng giá trị</div>
                        <div style={{ ...S.totalAmt(false), fontSize: 26 }}>{fmtMoneyDisplay(easyInvoiceTotal)}</div>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <button
                        type="button"
                        onClick={applyDefaultRedInvoiceCustomer}
                        disabled={invoiceLoading || loading}
                        style={{ ...S.pillBtn('#ffffff', '#1d4ed8'), border: '1px solid #dbe4ee', boxShadow: 'none', opacity: invoiceLoading || loading ? 0.55 : 1 }}
                    >
                        Điền mặc định
                    </button>
                    <button
                        type="button"
                        onClick={openIssueInvoiceConfirm}
                        disabled={invoiceLoading || loading || !canIssueEasyInvoice}
                        title={canIssueEasyInvoice ? exportInvoiceButtonLabel : effectiveExportInvoiceReason}
                        aria-label={canIssueEasyInvoice ? exportInvoiceButtonLabel : effectiveExportInvoiceReason}
                        style={{ ...compactActionPillStyle('linear-gradient(135deg,#b91c1c,#ef4444)', invoiceLoading || loading || !canIssueEasyInvoice), minWidth: 214, height: 44, minHeight: 44, borderRadius: 22, padding: '0 20px' }}
                    >
                        <IoDocumentTextOutline style={{ fontSize: 18 }} />
                        <span>{invoiceLoading ? 'Đang phát hành...' : exportInvoiceButtonLabel}</span>
                    </button>
                </div>
                {easyInvoiceEditorError || effectiveExportInvoiceReason ? (
                    <div style={{ marginTop: 12, borderRadius: 14, border: `1px solid ${easyInvoiceEditorError ? 'rgba(239,68,68,.25)' : 'rgba(245,158,11,.35)'}`, background: easyInvoiceEditorError ? '#fef2f2' : '#fff7ed', padding: 12, fontSize: 12, lineHeight: 1.6, color: easyInvoiceEditorError ? '#b91c1c' : '#9a3412', fontWeight: 700 }}>
                        {easyInvoiceEditorError || effectiveExportInvoiceReason}
                    </div>
                ) : null}
            </div>
            <EasyInvoicePaper
                draft={easyInvoiceDraft}
                onCustomerFieldChange={updateEasyInvoiceCustomerField}
                onInvoiceFieldChange={updateEasyInvoiceInvoiceField}
                onItemFieldChange={(key, field, value) => {
                    updateEasyInvoiceItem(key, field, value);
                    if (field === 'componentPrice' || field === 'labor') {
                        syncEasyInvoiceItemToHomeLine(key, field, value);
                    }
                }}
                onAddManualItem={addEasyInvoiceManualItem}
                onRemoveItem={removeEasyInvoiceItem}
            />
        </>
    );
    const voucherPanel = (
        <>
            {sharedCustomerCard}
            <div style={S.card}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
                    <div>
                        <div style={S.sectionTitle}>Phieu ke mua hang</div>
                        <div style={{ fontSize: 10, lineHeight: 1.55, color: '#64748b', marginTop: 4 }}>
                            Phieu ke mua hang chi lay phan de mua vao. Voi giao dich doi, phan de cu cua khach se di vao day.
                        </div>
                    </div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: hasBuyVoucherData ? '#166534' : '#64748b' }}>
                        {hasBuyVoucherData ? 'Co du lieu mua de/doi de' : 'Chua co du lieu mua de/doi de'}
                    </div>
                </div>
                {!buyVoucherRows.length ? (
                    <div style={{ marginTop: 12, borderRadius: 14, border: '1px dashed rgba(148,163,184,.7)', background: '#f8fafc', padding: 12, fontSize: 12, lineHeight: 1.6, color: '#64748b' }}>
                        Phieu ke mua hang chi duoc in khi don co mua de hoac co phan de cu cua giao dich doi.
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {buyVoucherRows.map((row, index) => (
                            <div key={`${row.name}-${row.price}-${index}`} style={{ borderRadius: 18, border: '1px solid rgba(15,23,42,.08)', background: 'linear-gradient(180deg, rgba(248,250,252,.96), rgba(255,255,255,.99))', padding: 12 }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
                                    <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>{row.name}</div>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b' }}>Dong {index + 1}</div>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                                    <div>
                                        <span style={S.label}>So luong</span>
                                        <input style={{ ...S.inp, background: '#f8fafc', color: '#334155' }} type="text" value={row.qty || ''} readOnly />
                                    </div>
                                    <div>
                                        <span style={S.label}>Gia mua</span>
                                        <input style={{ ...S.inp, background: '#f8fafc', color: '#334155' }} type="text" value={row.price || ''} readOnly />
                                    </div>
                                    <div>
                                        <span style={S.label}>Thanh tien</span>
                                        <input style={{ ...S.inp, background: '#f8fafc', color: '#166534' }} type="text" value={fmtMoneyDisplay(row.amount || 0)} readOnly />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: 14 }}>
                    <button
                        onClick={() => openBuyVoucherPreview({ modeOverride: 'buy' })}
                        disabled={voucherPreviewLoading || !hasBuyVoucherData}
                        style={{ ...compactActionPillStyle('linear-gradient(135deg,#0f766e,#14b8a6)', voucherPreviewLoading || !hasBuyVoucherData), minWidth: 214, height: 44, minHeight: 44, borderRadius: 22, padding: '0 20px' }}
                        title={hasBuyVoucherData ? 'Xem phiáº¿u kÃª mua hÃ ng' : 'ChÆ°a cÃ³ dá»¯ liá»‡u phiáº¿u kÃª mua hÃ ng'}
                        aria-label={hasBuyVoucherData ? 'Xem phiáº¿u kÃª mua hÃ ng' : 'ChÆ°a cÃ³ dá»¯ liá»‡u phiáº¿u kÃª mua hÃ ng'}
                    >
                        <IoDocumentTextOutline style={{ fontSize: 18 }} />
                        <span>{voucherPreviewLoading ? 'Äang táº¡o phiáº¿u kÃª...' : 'Xem Phiáº¿u KÃª MH'}</span>
                    </button>
                </div>
            </div>
        </>
    );

    return (
        <div style={S.screen}>
            <div style={S.header}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <button onClick={onBack} style={{ ...S.iconBtn('#ffffff'), border: '1px solid #dbe4ee' }}><IoChevronForward style={{ transform: 'scaleX(-1)' }} /></button>
                    <div><div data-sale-title="true" style={S.title}>{isIn ? 'Thanh toÃ¡n' : 'Chi tráº£'}</div><div style={S.sub}>{orderId}</div></div>
                </div>
            </div>
            <div style={S.scrollArea}>
                <div style={{ ...S.card, padding: 12, display: 'flex', gap: 8, alignItems: 'stretch' }}>
                    {screenTabs.map(tab => (
                        <button key={tab.key} type="button" onClick={() => setActivePanel(tab.key)} style={tabButtonStyle(activePanel === tab.key)}>
                            {tab.label}
                        </button>
                    ))}
                </div>
                {actionMessage ? (
                    <div style={{ ...S.card, padding: '12px 14px', fontSize: 11, lineHeight: 1.6, color: actionMessageColor }}>
                        {actionMessage}
                    </div>
                ) : null}
                {activePanel === 'payment' ? paymentPanel : activePanel === 'invoice' ? invoicePanel : voucherPanel}
            </div>
            <div style={{ ...S.totalBar, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
                {isIn ? (
                    <>
                        <div style={{ minWidth: 0, flex: 1 }}><div style={{ fontSize: 9, color: '#64748b', fontWeight: 700, marginBottom: 4 }}>{totalLabel}</div><div data-sale-amount="true" style={S.totalAmt(total < 0)}>{totalPrefix}{fmtCalc(total)}</div></div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                            <button onClick={onBack} title="Quay láº¡i" aria-label="Quay láº¡i" style={{ ...S.iconBtn('transparent'), width: 40, height: 40, background: 'transparent', border: 'none', boxShadow: 'none', color: '#94a3b8', fontSize: 22, padding: 0 }}><IoChevronForward style={{ transform: 'scaleX(-1)' }} /></button>
                            <button onClick={handleSend} disabled={loading} title="Táº¡o Ä‘Æ¡n" aria-label="Táº¡o Ä‘Æ¡n" style={footerPillStyle('linear-gradient(135deg,#15803d,#22c55e)', loading)}><IoDocumentTextOutline style={{ fontSize: 18 }} /><span>Táº¡o ÄÆ¡n</span></button>
                        </div>
                    </>
                ) : (
                    <>
                        <div style={{ minWidth: 0, flex: 1 }}><div style={{ fontSize: 9, color: '#64748b', fontWeight: 700, marginBottom: 4 }}>{totalLabel}</div><div data-sale-amount="true" style={S.totalAmt(total < 0)}>{totalPrefix}{fmtCalc(total)}</div></div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                            <button onClick={handleSend} disabled={loading} title="Táº¡o Ä‘Æ¡n" aria-label="Táº¡o Ä‘Æ¡n" style={footerPillStyle('linear-gradient(135deg,#15803d,#22c55e)', loading)}><IoDocumentTextOutline style={{ fontSize: 18 }} /><span>Táº¡o ÄÆ¡n</span></button>
                        </div>
                    </>
                )}
            </div>
            <ConfirmDialog
                open={issueConfirmOpen}
                title="Xuất HĐ đỏ"
                message="Bạn có chắc chắn các thông tin đều đúng không?"
                confirmLabel="Chấp nhận"
                onClose={() => { if (!invoiceLoading) setIssueConfirmOpen(false); }}
                onConfirm={() => { setIssueConfirmOpen(false); handleIssueEasyInvoice(); }}
            />
            <DocumentPreviewModal
                open={voucherPreviewOpen}
                loading={voucherPreviewLoading}
                imageUrl={voucherPreviewUrl}
                error={voucherPreviewError}
                title={voucherPreviewTitle}
                subtitle={voucherPreviewSubtitle}
                onClose={() => setVoucherPreviewOpen(false)}
                onDownload={handleVoucherDownload}
                onCopy={handleVoucherCopy}
                onSendToAgent={() => queueVoucherToAgent()}
                actionMessage={voucherPreviewActionMessage}
                actionError={voucherPreviewActionError}
                sending={voucherSending}
            />
        </div>
    );
}


