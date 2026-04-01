import { useEffect, useState } from 'react';

import { IoChevronDownOutline, IoChevronForward, IoChevronUpOutline, IoDocumentTextOutline, IoQrCodeOutline } from 'react-icons/io5';

import { buildEasyInvoicePayload, createEasyInvoiceDraft, createPaymentVoucherPreview, getBuyVoucherRows, hasBuyVoucherRows, resolveBuyVoucherCustomerInfo } from './printPaymentVoucher';

import { copySaleReceiptImageToClipboard, downloadSaleReceiptImage } from './printSaleReceipt';

import DocumentPreviewModal from './DocumentPreviewModal';

import EasyInvoicePaper from './EasyInvoicePaper';

import { ConfirmDialog } from './Dialogs';

import { buildCompanyBankLabel, fetchCompanyBankAccounts, withFallbackCompanyBankAccounts } from '../lib/companyBankAccounts';
import { API, NEUTRAL_BORDER, NUMBER_FONT, POS_RED, fmtCalc, getTradeCompensationAmount, normalizeTradeRate, nowStr, parseFmt, parseWeight, S } from './shared';

import { VIET_QR_BANKS, findVietQrBank, formatVietQrBankLabel, getVietQrBankLogoUrl } from './vietQrBanks';


const FIXED_QR_NOTE = 'Mua hang tai cong ty van kim';

const REQUIRED_EASY_INVOICE_FIELDS = [

    { key: 'name', label: 'Tên khách hàng' },

    { key: 'cccd', label: 'CCCD' },

    { key: 'phone', label: 'Số điện thoại' },

    { key: 'origin', label: 'Quê quán' },

    { key: 'address', label: 'Địa chỉ' },

];

const fmtMoneyDisplay = value => Math.round(Number(value || 0)).toLocaleString('en-US');

const pickText = (value, fallback = '') => String(value ?? '').trim() || fallback;

const normalizeVietQrBankCode = (value) => {

    const bank = findVietQrBank(value);

    return pickText(bank?.code || value).toUpperCase();

};

const pickPreferredCompanyBankAccount = (accounts, amount, preferredId, isIncoming = true) => {
    const normalizedAccounts = withFallbackCompanyBankAccounts(accounts, true);
    if (!normalizedAccounts.length) return null;
    const preferred = normalizedAccounts.find(account => String(account.id) === String(preferredId || '')) || null;
    if (!isIncoming) return preferred || normalizedAccounts[0] || null;

    const absAmount = Math.max(0, Math.round(Number(amount || 0)));
    const canReceive = (account) => {
        const maxIncoming = Math.max(0, Math.round(Number(account?.max_incoming_amount || 0)));
        return maxIncoming <= 0 || absAmount <= maxIncoming;
    };

    if (preferred && canReceive(preferred)) return preferred;
    return normalizedAccounts.find(canReceive) || preferred || normalizedAccounts[0] || null;
};

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

    bankCode: pickText(customerInfo?.bankCode),

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

    const tradeAdjustmentAmount = nextLine.tx === 'trade' ? getTradeCompensationAmount(nextLine) : 0;

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

                        onValueChange?.(text ?? String(value || 0));

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

                        onClick={() => applyNextValue((focused ? parseFmt(text ?? String(value || 0)) : Number(value || 0)) + step)}

                        style={{ flex: 1, borderRadius: 7, border: '1px solid #dbe4ee', background: '#f8fafc', color: '#475569', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0, cursor: 'pointer' }}

                        aria-label="Tăng giá trị"

                        title="Tăng giá trị"

                    >

                        <IoChevronUpOutline style={{ fontSize: 12 }} />

                    </button>

                    <button

                        type="button"

                        onMouseDown={e => e.preventDefault()}

                        onClick={() => applyNextValue((focused ? parseFmt(text ?? String(value || 0)) : Number(value || 0)) - step)}

                        style={{ flex: 1, borderRadius: 7, border: '1px solid #dbe4ee', background: '#f8fafc', color: '#475569', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0, cursor: 'pointer' }}

                        aria-label="Giảm giá trị"

                        title="Giảm giá trị"

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

    const totalLabel = total > 0 ? 'KHÁCH TRẢ' : total < 0 ? 'KHÁCH NHẬN' : 'TỔNG TẠM TÍNH';

    const hasBuyVoucherData = hasBuyVoucherRows(lines);

    const sharedCustomerInfo = normalizeSharedCustomerInfo(customerInfo);

    const [cash, setCash] = useState(0);

    const [bank, setBank] = useState(absTotal);

    const [activePanel, setActivePanel] = useState('payment');

    const [invoiceLoading, setInvoiceLoading] = useState(false);

    const [issueConfirmOpen, setIssueConfirmOpen] = useState(false);

    const [pendingInvoiceAction, setPendingInvoiceAction] = useState(null);

    const [actionMessage, setActionMessage] = useState('');

    const [easyInvoiceDraft, setEasyInvoiceDraft] = useState(() => mergeEasyInvoiceDraft(createEasyInvoiceDraft({ orderId, customerInfo, lines, rates }), null));

    const [easyInvoiceEditorError, setEasyInvoiceEditorError] = useState('');

    const [, setEasyInvoiceResult] = useState(null);

    const [, setEasyInvoiceResultOpen] = useState(false);

    const [voucherPreviewOpen, setVoucherPreviewOpen] = useState(false);

    const [voucherPreviewLoading, setVoucherPreviewLoading] = useState(false);

    const [voucherPreviewUrl, setVoucherPreviewUrl] = useState('');

    const [voucherPreviewTitle, setVoucherPreviewTitle] = useState('Phiếu kê mua hàng');

    const [voucherPreviewSubtitle, setVoucherPreviewSubtitle] = useState('File PNG preview cho phiếu kê mua hàng.');

    const [voucherPreviewFileName, setVoucherPreviewFileName] = useState('phieu-ke-mua-hang.png');

    const [voucherPreviewDocumentName, setVoucherPreviewDocumentName] = useState('Phiếu kê mua hàng');

    const [voucherPreviewError, setVoucherPreviewError] = useState('');

    const [voucherPreviewActionMessage, setVoucherPreviewActionMessage] = useState('');

    const [voucherPreviewActionError, setVoucherPreviewActionError] = useState(false);

    const [voucherSending, setVoucherSending] = useState(false);

    const [payoutBankMenuOpen, setPayoutBankMenuOpen] = useState(false);
    const [companyBankAccounts, setCompanyBankAccounts] = useState([]);
    const [selectedCompanyBankAccountId, setSelectedCompanyBankAccountId] = useState('');
    const [companyBankLoadError, setCompanyBankLoadError] = useState('');
    useEffect(() => {

        setEasyInvoiceDraft(prev => mergeEasyInvoiceDraft(createEasyInvoiceDraft({ orderId, customerInfo, lines, rates }), prev));

    }, [orderId, customerInfo, lines, rates]);

    useEffect(() => {
        let cancelled = false;
        fetchCompanyBankAccounts()
            .then((items) => {
                if (cancelled) return;
                setCompanyBankAccounts(withFallbackCompanyBankAccounts(items, true));
                setCompanyBankLoadError('');
            })
            .catch(() => {
                if (cancelled) return;
                setCompanyBankAccounts(withFallbackCompanyBankAccounts([], true));
                setCompanyBankLoadError('Chưa tải được danh sách tài khoản công ty, đang dùng tài khoản mặc định.');
            });
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {

        if (isIn) {

            setPayoutBankMenuOpen(false);

        }

    }, [isIn]);

    useEffect(() => {
        const preferredAccount = pickPreferredCompanyBankAccount(
            companyBankAccounts,
            bank,
            selectedCompanyBankAccountId,
            isIn,
        );
        const nextId = preferredAccount?.id || '';
        if (nextId !== selectedCompanyBankAccountId) {
            setSelectedCompanyBankAccountId(nextId);
        }
    }, [bank, companyBankAccounts, isIn, selectedCompanyBankAccountId]);

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

    const requiredCustomerReason = missingEasyInvoiceFields.length ? `Vui lòng nhập đủ: ${missingEasyInvoiceFields.join(', ')}.` : '';

    const exportInvoiceReason = !hasEasyInvoiceItems ? 'Chưa có sản phẩm có tem để xuất hóa đơn đỏ.' : easyInvoiceTotal <= 0 ? 'Tổng giá trị phần bán phải lớn hơn 0.' : '';

    const issueInvoiceReason = !hasEasyInvoiceItems ? 'Chưa có sản phẩm có tem để xuất hóa đơn đỏ.' : easyInvoiceTotal <= 0 ? 'Tổng giá trị phần bán phải lớn hơn 0.' : '';

    const createOrderReason = isIn ? requiredCustomerReason : '';

    const effectiveIssueInvoiceReason = requiredCustomerReason || issueInvoiceReason;

    const effectiveExportInvoiceReason = effectiveIssueInvoiceReason || exportInvoiceReason;

    const canIssueEasyInvoice = effectiveIssueInvoiceReason.length === 0;

    const canExportEasyInvoice = effectiveExportInvoiceReason.length === 0;

    const draftInvoiceButtonLabel = 'Xuất HĐ Nháp';

    const issueInvoiceButtonLabel = 'Phát hành HĐ';

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

    const effectiveCompanyBankAccounts = withFallbackCompanyBankAccounts(companyBankAccounts, true);

    const selectedCompanyBankAccount = effectiveCompanyBankAccounts.find((account) => String(account.id) === String(selectedCompanyBankAccountId || ''))
        || effectiveCompanyBankAccounts[0]
        || null;

    const selectedCompanyBankBank = findVietQrBank(selectedCompanyBankAccount?.bank_code || selectedCompanyBankAccount?.bank_name);

    const selectedCompanyBankLabel = selectedCompanyBankAccount ? buildCompanyBankLabel(selectedCompanyBankAccount) : '';

    const companyBankLimit = Math.max(0, Math.round(Number(selectedCompanyBankAccount?.max_incoming_amount || 0)));

    const companyBankOverLimit = isIn && bank > 0 && companyBankLimit > 0 && bank > companyBankLimit;

    const selectedPayoutBank = findVietQrBank(sharedCustomerInfo?.bankCode || sharedCustomerInfo?.bankName);

    const selectedPayoutBankLabel = selectedPayoutBank ? formatVietQrBankLabel(selectedPayoutBank) : '';

    const qrBankName = isIn
        ? pickText(selectedCompanyBankAccount?.bank_name || selectedCompanyBankAccount?.bank_code)
        : pickText(selectedPayoutBank?.shortName || sharedCustomerInfo?.bankName);

    const qrBankCode = isIn
        ? pickText(selectedCompanyBankAccount?.bank_code)
        : pickText(selectedPayoutBank?.code || sharedCustomerInfo?.bankCode);

    const qrAccountNo = isIn
        ? pickText(selectedCompanyBankAccount?.account_no)
        : pickText(sharedCustomerInfo?.bankNo);

    const qrAccountName = isIn
        ? pickText(selectedCompanyBankAccount?.account_name)
        : pickText(sharedCustomerInfo?.name);

    const qrNote = isIn ? FIXED_QR_NOTE : pickText(orderId ? `Chi tra ${orderId}` : 'Chi tra cho khach');

    const qrBlockedReason = companyBankOverLimit
        ? `So tien chuyen khoan vuot muc ${fmtMoneyDisplay(companyBankLimit)} cua tai khoan da chon.`
        : '';

    const canRenderQr = bank > 0 && Boolean(qrBankCode) && Boolean(qrAccountNo) && !companyBankOverLimit;

    const qrUrl = canRenderQr

        ? `https://img.vietqr.io/image/${qrBankCode}-${qrAccountNo}-compact2.png?amount=${Math.abs(bank)}&addInfo=${encodeURIComponent(qrNote)}${qrAccountName ? `&accountName=${encodeURIComponent(qrAccountName)}` : ''}`

        : '';

    const footerPillStyle = (bg, disabled = false) => ({ ...S.pillBtn(bg, '#ffffff'), height: 52, minHeight: 52, padding: '0 16px', fontSize: 11, whiteSpace: 'nowrap', justifyContent: 'center', opacity: disabled ? 0.55 : 1, cursor: disabled ? 'not-allowed' : 'pointer' });

    const compactActionPillStyle = (bg, disabled = false) => ({ ...footerPillStyle(bg, disabled), height: 36, minHeight: 36, borderRadius: 18, padding: '0 14px', fontSize: 12 });

    const invoiceActionPillStyle = (bg, disabled = false) => ({

        ...compactActionPillStyle(bg, disabled),

        width: '100%',

        minWidth: 0,

        height: 40,

        minHeight: 40,

        borderRadius: 20,

        padding: '0 10px',

        fontSize: 11,

        gap: 5,

        justifyContent: 'center',

        whiteSpace: 'nowrap',

    });

    const handleCashChange = value => { const next = Math.min(parseFmt(value), absTotal); setCash(next); setBank(absTotal - next); };

    const handleBankChange = value => { const next = Math.min(parseFmt(value), absTotal); setBank(next); setCash(absTotal - next); };

    const handlePayoutBankChange = (bankCode) => {

        const normalizedBankCode = normalizeVietQrBankCode(bankCode);

        const bank = VIET_QR_BANKS.find(item => String(item.code) === String(normalizedBankCode)) || null;

        setPayoutBankMenuOpen(false);

        setCustomerInfo?.(prev => ({

            ...prev,

            bankCode: bank?.code || normalizedBankCode,

            bankName: bank?.shortName || '',

        }));

        setEasyInvoiceDraft(prev => ({

            ...prev,

            customer: {

                ...(prev?.customer || {}),

                bankCode: bank?.code || normalizedBankCode,

                bankName: bank?.shortName || '',

            },

        }));

    };

    const updateEasyInvoiceCustomerField = (field, value) => {

        setEasyInvoiceEditorError('');

        const normalizedBank = ['bankCode', 'bankName'].includes(field) ? findVietQrBank(value) : null;

        const nextCustomerPatch = field === 'bankCode'

            ? {

                bankCode: normalizeVietQrBankCode(value),

                ...(normalizedBank?.shortName ? { bankName: normalizedBank.shortName } : {}),

            }

            : field === 'bankName'

                ? {

                    bankName: pickText(normalizedBank?.shortName || value),

                    ...(normalizedBank?.code ? { bankCode: normalizedBank.code } : {}),

                }

                : {

                    [field]: value,

                    ...(field === 'address' ? { residence: value } : {}),

                };

        if (['name', 'cccd', 'phone', 'origin', 'address', 'taxCode', 'email', 'emailCc', 'bankCode', 'bankName', 'bankNo', 'code'].includes(field)) {

            setEasyInvoiceDraft(prev => ({

                ...prev,

                customer: {

                    ...(prev?.customer || {}),

                    ...nextCustomerPatch,

                },

            }));

        }

        if (['name', 'cccd', 'phone', 'origin', 'address', 'taxCode', 'email', 'emailCc', 'bankCode', 'bankName', 'bankNo'].includes(field)) {

            setCustomerInfo?.(prev => ({

                ...prev,

                ...nextCustomerPatch,

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

        if (!matched) throw new Error('Không đọc được dữ liệu PNG để gửi agent.');

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

                    document_name: voucherPreviewDocumentName || 'Phiếu kê mua hàng',

                    file_name: voucherPreviewFileName || 'phieu-ke-mua-hang.png',

                    requested_by: 'POS Mobile',

                }),

            });

            const payload = await response.json().catch(() => ({}));

            if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);

            const agentName = payload?.agent?.device_name || payload?.agent?.agent_key || 'agent';

            const printerName = payload?.printer?.printer_name || payload?.command?.printer_name || '';

            setVoucherPreviewActionMessage(printerName ? `Đã gửi PNG tới ${agentName} / ${printerName}.` : `Đã gửi PNG tới ${agentName}.`);

            return payload;

        } catch (error) {

            setVoucherPreviewActionError(true);

            setVoucherPreviewActionMessage(error.message || 'Không gửi được PNG tới agent.');

            throw error;

        } finally {

            setVoucherSending(false);

        }

    };

    const handleVoucherDownload = () => {

        if (!voucherPreviewUrl) return;

        downloadSaleReceiptImage(voucherPreviewUrl, voucherPreviewFileName);

        setVoucherPreviewActionError(false);

        setVoucherPreviewActionMessage(`Đã tải ${voucherPreviewFileName}.`);

    };

    const handleVoucherCopy = async () => {

        if (!voucherPreviewUrl) return;

        setVoucherPreviewActionError(false);

        setVoucherPreviewActionMessage('');

        try {

            await copySaleReceiptImageToClipboard(voucherPreviewUrl);

            setVoucherPreviewActionMessage('Đã copy PNG vào clipboard.');

        } catch (error) {

            setVoucherPreviewActionError(true);

            setVoucherPreviewActionMessage(error.message || 'Không copy được PNG.');

        }

    };

    const applyBuyVoucherPreviewState = ({ imageUrl, model }, options = {}) => {

        const serialNo = String(options.serialNoOverride || model?.serialNo || '').trim();

        const documentTitle = model?.title || 'Phiếu kê mua hàng';

        setVoucherPreviewTitle(documentTitle);

        setVoucherPreviewSubtitle(serialNo ? `PNG preview. Số phiếu: ${serialNo}.` : 'PNG preview cho phiếu kê mua hàng.');

        setVoucherPreviewFileName(getVoucherFileName(serialNo));

        setVoucherPreviewDocumentName(documentTitle);

        setVoucherPreviewUrl(imageUrl);
    };

    const createBuyVoucherPreviewData = async (options = {}) => {

        const settlement = buildSettlementPayload();

        const preview = await createPaymentVoucherPreview({

            orderId,

            total,

            customerInfo: buildBuyVoucherCustomerInfo(),

            lines,

            rates,

            settlement,

            serialNoOverride: options.serialNoOverride,

            modeOverride: options.modeOverride || 'buy',

        });

        applyBuyVoucherPreviewState(preview, options);

        return preview;

    };

    const openBuyVoucherPreview = async (options = {}) => {

        setVoucherPreviewOpen(true);

        setVoucherPreviewLoading(true);

        setVoucherPreviewError('');

        setVoucherPreviewUrl('');

        setVoucherPreviewActionMessage('');

        setVoucherPreviewActionError(false);

        try {

            return await createBuyVoucherPreviewData(options);

        } catch (error) {

            setVoucherPreviewError(error.message || 'Không tạo được file PNG cho phiếu kê mua hàng.');

            setVoucherPreviewActionError(true);

            setVoucherPreviewActionMessage(error.message || 'Không tạo được file PNG cho phiếu kê mua hàng.');

            return null;

        } finally {

            setVoucherPreviewLoading(false);

        }

    };

    useEffect(() => {

        if (activePanel !== 'voucher') return undefined;

        if (!hasBuyVoucherData) {

            setVoucherPreviewLoading(false);

            setVoucherPreviewError('');

            setVoucherPreviewUrl('');

            return undefined;

        }

        let cancelled = false;

        setVoucherPreviewLoading(true);

        setVoucherPreviewError('');

        const run = async () => {

            try {

                const settlement = buildSettlementPayload();

                const preview = await createPaymentVoucherPreview({

                    orderId,

                    total,

                    customerInfo: buildBuyVoucherCustomerInfo(),

                    lines,

                    rates,

                    settlement,

                    modeOverride: 'buy',

                });

                applyBuyVoucherPreviewState(preview, { modeOverride: 'buy' });

                if (cancelled || !preview) return;

            } catch (error) {

                if (cancelled) return;

                setVoucherPreviewError(error.message || 'Không tạo được file PNG cho phiếu kê mua hàng.');

            } finally {

                if (!cancelled) {

                    setVoucherPreviewLoading(false);

                }

            }

        };

        run();

        return () => {

            cancelled = true;

        };

    }, [activePanel, hasBuyVoucherData, orderId, total, customerInfo, lines, rates, cash, bank]); // eslint-disable-line react-hooks/exhaustive-deps

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

        companyBankAccountId: selectedCompanyBankAccount?.id || '',

        companyBankLedgerKey: selectedCompanyBankAccount?.ledger_key || '',

        companyBankAccountNo: selectedCompanyBankAccount?.account_no || '',

        companyBankLabel: selectedCompanyBankLabel,

        companyBankMaxIncomingAmount: companyBankLimit,

        companyBankLimitExceeded: companyBankOverLimit,

        frombank: [qrBankCode || qrBankName, qrAccountNo, qrAccountName].filter(Boolean).join('-'),

        transactiontype: isIn ? 'THU' : 'CHI',

        note: qrNote,

        formula,

        paymentMethod: cash > 0 && bank > 0 ? 'Tiền mặt/Chuyển khoản' : bank > 0 ? 'Chuyển khoản' : cash > 0 ? 'Tiền mặt' : 'Không thu tiền',

        created_at: nowStr(),

    });

    const buildEasyInvoiceCustomerInfo = () => ({

        ...sharedCustomerInfo,

        ...(easyInvoiceDraft?.customer || {}),

        code: pickText(easyInvoiceDraft?.customer?.code || sharedCustomerInfo?.cccd || sharedCustomerInfo?.phone || orderId, orderId),

    });

    const buildBuyVoucherCustomerInfo = () => resolveBuyVoucherCustomerInfo(sharedCustomerInfo);

    const applyDefaultRedInvoiceCustomer = () => {

        setEasyInvoiceEditorError('');

        const baseDraft = createEasyInvoiceDraft({ orderId, customerInfo: sharedCustomerInfo, lines, rates });

        const resolvedBank = findVietQrBank(

            easyInvoiceDraft?.customer?.bankCode

            || easyInvoiceDraft?.customer?.bankName

            || sharedCustomerInfo?.bankCode

            || sharedCustomerInfo?.bankName

        );

        setEasyInvoiceDraft(prev => ({

            ...prev,

            customer: {

                ...(prev?.customer || {}),

                ...(baseDraft?.customer || {}),

                bankCode: pickText(resolvedBank?.code || prev?.customer?.bankCode || sharedCustomerInfo?.bankCode),

                bankName: pickText(resolvedBank?.shortName || prev?.customer?.bankName || sharedCustomerInfo?.bankName),

            },

        }));

    };

    void applyDefaultRedInvoiceCustomer;

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

                message: result.msg || 'Đã xuất HĐ nháp thành công.',

                amount_text: `${fmtMoneyDisplay(amountValue)} VND`,

                buyer: result.buyer || easyInvoiceCustomerInfo.name || 'Khách lẻ',

            };

            setEasyInvoiceResult(modalPayload);

            setEasyInvoiceResultOpen(true);

            setActionMessage(result.msg || 'Đã xuất HĐ nháp thành công.');

            return modalPayload;

        } catch (error) {

            setActionMessage(error.message || 'Không xuất được HĐ nháp.');

            throw error;

        }

    };

    const handleExportEasyInvoiceWithOrder = async () => {

        if (effectiveExportInvoiceReason) {

            setActionMessage(effectiveExportInvoiceReason);

            setPendingInvoiceAction(null);

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

                setActionMessage('Đã xuất HĐ nháp. Phiếu kê mua hàng đang ở dạng PNG.');

            } else {

                setActionMessage('Đã xuất HĐ nháp thành công.');

            }

        } catch (error) {

            setActionMessage(error.message || 'Không ghi được đơn hàng vào backend.');

        } finally {

            setInvoiceLoading(false);

            setPendingInvoiceAction(null);

        }

    };

    const openInvoiceConfirm = (action) => {

        const reason = action === 'draft' ? effectiveExportInvoiceReason : effectiveIssueInvoiceReason;

        if (reason) {

            setEasyInvoiceEditorError(reason);

            setActionMessage(reason);

            setPendingInvoiceAction(null);

            return;

        }

        setEasyInvoiceEditorError('');

        setActionMessage('');

        setPendingInvoiceAction(action);

        setIssueConfirmOpen(true);

    };

    const handleConfirmedInvoiceAction = () => {

        setIssueConfirmOpen(false);

        if (pendingInvoiceAction === 'draft') {

            handleExportEasyInvoiceWithOrder();

            return;

        }

        if (pendingInvoiceAction === 'issue') {

            handleIssueEasyInvoice();

            return;

        }

        setIssueConfirmOpen(false);

    };

    const handleIssueEasyInvoice = async () => {

        if (effectiveIssueInvoiceReason) {

            setEasyInvoiceEditorError(effectiveIssueInvoiceReason);

            setPendingInvoiceAction(null);

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

                setActionMessage(result.msg || 'Đã phát hành EasyInvoice. Phiếu kê mua hàng đang ở dạng PNG.');

            } else {

                setActionMessage(result.msg || 'Đã phát hành EasyInvoice thành công.');

            }

        } catch (error) {

            setEasyInvoiceEditorError(error.message || 'Không phát hành được hóa đơn đỏ.');

            setActionMessage(error.message || 'Không ghi được đơn hàng vào backend.');

        } finally {

            setInvoiceLoading(false);

            setPendingInvoiceAction(null);

        }

    };



    const screenTabs = [

        { key: 'payment', label: isIn ? 'Thanh toán' : 'Chi trả' },

        { key: 'invoice', label: 'Hóa Đơn Đỏ' },

        { key: 'voucher', label: 'Phiếu Kê MH' },

    ];

    const normalizedActionMessage = String(actionMessage || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
    const actionMessageColor = /http|error/.test(normalizedActionMessage)
        || ['khong', 'chua', 'vui long'].some(token => normalizedActionMessage.includes(token))
        ? '#dc2626'
        : '#166534';

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

    const paymentPanel = (

        <>

            <div style={S.card}>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: isIn ? 12 : 16 }}>

                    <div>

                        <span style={S.label}>Chuyển khoản</span>

                        <EditableNumericInput value={bank} onValueChange={handleBankChange} style={isIn ? { ...numericInputStyle, color: '#2563eb' } : { ...largeNumericInputStyle, color: '#2563eb' }} commitOnBlur />

                    </div>

                    <div>

                        <span style={S.label}>Tiền mặt</span>

                        <EditableNumericInput value={cash} onValueChange={handleCashChange} style={isIn ? { ...numericInputStyle, color: POS_RED } : { ...largeNumericInputStyle, color: POS_RED }} commitOnBlur />

                    </div>

                    <div>

                        <span style={S.label}>{isIn ? 'Tài khoản công ty nhận' : 'Tài khoản công ty chi'}</span>

                        <select
                            style={{ ...S.inp, width: '100%', height: 56, minHeight: 56, padding: '8px 14px', textAlign: 'left', fontWeight: 400 }}
                            value={selectedCompanyBankAccount?.id || ''}
                            onChange={(event) => setSelectedCompanyBankAccountId(event.target.value)}
                        >
                            {effectiveCompanyBankAccounts.map((account) => {
                                const maxText = Number(account?.max_incoming_amount || 0) > 0
                                    ? ` · max ${fmtMoneyDisplay(account.max_incoming_amount)}`
                                    : '';
                                return (
                                    <option key={account.id || account.ledger_key} value={account.id || ''}>
                                        {buildCompanyBankLabel(account)}{maxText}
                                    </option>
                                );
                            })}
                        </select>

                        {selectedCompanyBankAccount ? (
                            <div style={{ marginTop: 8, padding: '10px 12px', borderRadius: 14, border: `1px solid ${companyBankOverLimit ? '#fecaca' : '#dbe4ee'}`, background: companyBankOverLimit ? '#fff1f2' : '#f8fafc' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                                    {selectedCompanyBankBank ? (
                                        <img src={getVietQrBankLogoUrl(selectedCompanyBankBank)} alt={selectedCompanyBankBank.shortName} style={{ width: 28, height: 28, objectFit: 'contain', flexShrink: 0 }} />
                                    ) : (
                                        <span style={{ fontSize: 18, flexShrink: 0 }}>🏦</span>
                                    )}
                                    <div style={{ minWidth: 0, flex: 1 }}>
                                        <div style={{ fontSize: 12, fontWeight: 800, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {selectedCompanyBankLabel}
                                        </div>
                                        <div style={{ fontSize: 11, color: '#64748b' }}>
                                            {selectedCompanyBankAccount.account_no || 'Chưa có số tài khoản'}
                                            {companyBankLimit > 0 ? ` · Nhận tối đa ${fmtMoneyDisplay(companyBankLimit)}` : ' · Không giới hạn'}
                                        </div>
                                    </div>
                                </div>
                                {companyBankLoadError ? (
                                    <div style={{ marginTop: 8, fontSize: 11, color: '#9a3412' }}>{companyBankLoadError}</div>
                                ) : null}
                                {companyBankOverLimit ? (
                                    <div style={{ marginTop: 8, fontSize: 11, color: '#b91c1c' }}>
                                        So tien chuyen khoan dang vuot muc nhan toi da {fmtMoneyDisplay(companyBankLimit)} cua tai khoan nay.
                                    </div>
                                ) : null}
                            </div>
                        ) : null}

                    </div>

                    {!isIn ? (

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>

                            <div>

                                <span style={S.label}>Ngân hàng</span>

                                <div

                                    style={{ position: 'relative' }}

                                    onBlur={(event) => {

                                        if (!event.currentTarget.contains(event.relatedTarget)) {

                                            setPayoutBankMenuOpen(false);

                                        }

                                    }}

                                >

                                    <button

                                        type="button"

                                        onClick={() => setPayoutBankMenuOpen(open => !open)}

                                        style={{

                                            ...S.inp,

                                            width: '100%',

                                            height: 56,

                                            minHeight: 56,

                                            padding: '8px 14px',

                                            textAlign: 'left',

                                            fontWeight: 400,

                                            display: 'flex',

                                            alignItems: 'center',

                                            justifyContent: 'space-between',

                                            gap: 10,

                                            cursor: 'pointer',

                                        }}

                                    >

                                        {selectedPayoutBank ? (

                                            <span style={{ minWidth: 0, display: 'inline-flex', alignItems: 'center', gap: 8 }}>

                                                <img src={getVietQrBankLogoUrl(selectedPayoutBank)} alt={selectedPayoutBank.shortName} style={{ width: 40, height: 40, objectFit: 'contain', flexShrink: 0 }} />

                                                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedPayoutBankLabel}</span>

                                            </span>

                                        ) : (

                                            <span style={{ color: '#94a3b8' }}>Chọn ngân hàng nhận</span>

                                        )}

                                        <IoChevronDownOutline style={{ fontSize: 18, color: '#64748b', flexShrink: 0, transform: payoutBankMenuOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform .18s ease' }} />

                                    </button>

                                    {payoutBankMenuOpen ? (

                                        <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 20, maxHeight: 300, overflowY: 'auto', borderRadius: 18, border: '1px solid #dbe4ee', background: '#ffffff', boxShadow: '0 18px 36px rgba(15,23,42,.14)', padding: 4 }}>

                                            {VIET_QR_BANKS.map(bank => {

                                                const active = String(bank.code) === String(selectedPayoutBank?.code || sharedCustomerInfo?.bankCode || '');

                                                return (

                                                    <button

                                                        key={bank.code}

                                                        type="button"

                                                        onClick={() => handlePayoutBankChange(bank.code)}

                                                        title={bank.name || bank.shortName}

                                                        style={{

                                                            width: '100%',

                                                            border: 'none',

                                                            background: active ? 'rgba(37,99,235,.08)' : 'transparent',

                                                            borderRadius: 12,

                                                            padding: '1px 4px',

                                                            display: 'flex',

                                                            alignItems: 'center',

                                                            gap: 2,

                                                            textAlign: 'left',

                                                            cursor: 'pointer',

                                                            color: '#0f172a',

                                                            fontSize: 13,

                                                            fontWeight: active ? 800 : 600,

                                                        }}

                                                    >

                                                        <img src={getVietQrBankLogoUrl(bank)} alt={bank.shortName} style={{ width: 24, height: 24, objectFit: 'contain', flexShrink: 0 }} />

                                                        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{formatVietQrBankLabel(bank)}</span>

                                                    </button>

                                                );

                                            })}

                                        </div>

                                    ) : null}

                                </div>

                            </div>

                            <div>

                                <span style={S.label}>Số tài khoản</span>

                                <input

                                    style={{ ...S.inp, height: 56, minHeight: 56, padding: '10px 16px', textAlign: 'left', fontWeight: 400 }}

                                    type="text"

                                    inputMode="numeric"

                                    value={sharedCustomerInfo?.bankNo || ''}

                                    onChange={event => updateEasyInvoiceCustomerField('bankNo', event.target.value)}

                                    placeholder="Nhập số tài khoản nhận"

                                />

                            </div>

                        </div>

                    ) : null}

                </div>

            </div>

            {bank > 0 ? (

                <div style={S.card}>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

                        <div style={{ borderRadius: 16, border: '2px solid #6366f1', background: '#eef2ff', padding: 12 }}>

                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, color: '#4338ca', fontSize: 12, fontWeight: 800 }}>

                                <IoQrCodeOutline style={{ fontSize: 18 }} />

                                <span>VietQR chuyển khoản</span>

                            </div>

                            {qrUrl ? (

                                <img src={qrUrl} alt="VietQR" style={{ width: '100%', display: 'block', borderRadius: 12, background: '#ffffff' }} />

                            ) : (

                                <div style={{ borderRadius: 12, border: '1px dashed rgba(99,102,241,.35)', background: '#ffffff', padding: 18, fontSize: 12, lineHeight: 1.55, color: '#475569', textAlign: 'center' }}>

                                    {companyBankOverLimit
                                        ? qrBlockedReason
                                        : isIn
                                            ? 'Chua tao duoc QR chuyen khoan.'
                                            : 'Nhap ngan hang va so tai khoan de sinh VietQR cho khach nhan.'}

                                </div>

                            )}

                        </div>

                        <div style={{ ...S.inp, minHeight: 0, height: 'auto', padding: '12px 14px', textAlign: 'left', lineHeight: 1.6, background: '#f8fafc' }}>

                            <div style={{ fontSize: 10, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Thông tin VietQR</div>

                            <div style={{ fontSize: 13, color: '#0f172a', fontWeight: 700 }}>{(qrBankName || 'Chưa nhập ngân hàng')} · {(qrAccountNo || 'Chưa nhập số tài khoản')}</div>

                            {qrAccountName ? <div style={{ fontSize: 12, color: '#334155' }}>{qrAccountName}</div> : null}

                            <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>Noi dung: {qrNote}</div>

                            {isIn && selectedCompanyBankAccount ? (
                                <div style={{ fontSize: 11, color: companyBankOverLimit ? '#b91c1c' : '#64748b', marginTop: 4 }}>
                                    Gioi han nhan 1 lan: {companyBankLimit > 0 ? fmtMoneyDisplay(companyBankLimit) : 'Khong gioi han'}
                                </div>
                            ) : null}

                        </div>

                    </div>

                </div>

            ) : null}

        </>

    );

    const invoicePanel = (

        <>

            <div style={S.card}>

                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', gap: 12, marginBottom: 12 }}>

                    <div style={{ textAlign: 'right', flexShrink: 0 }}>

                        <div style={{ fontSize: 9, color: '#64748b', fontWeight: 700, marginBottom: 4 }}>Tổng giá trị</div>

                        <div style={{ ...S.totalAmt(false), fontSize: 26 }}>{fmtMoneyDisplay(easyInvoiceTotal)}</div>

                    </div>

                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, alignItems: 'stretch' }}>

                    <button

                        type="button"

                        onClick={() => openInvoiceConfirm('draft')}

                        disabled={invoiceLoading || loading || !canExportEasyInvoice}

                        title={canExportEasyInvoice ? draftInvoiceButtonLabel : effectiveExportInvoiceReason}

                        aria-label={canExportEasyInvoice ? draftInvoiceButtonLabel : effectiveExportInvoiceReason}

                        style={invoiceActionPillStyle('linear-gradient(135deg,#1d4ed8,#0ea5e9)', invoiceLoading || loading || !canExportEasyInvoice)}

                    >

                        <IoDocumentTextOutline style={{ fontSize: 18 }} />

                        <span>{invoiceLoading && pendingInvoiceAction === 'draft' ? 'Đang xuất nháp...' : draftInvoiceButtonLabel}</span>

                    </button>

                    <button

                        type="button"

                        onClick={() => openInvoiceConfirm('issue')}

                        disabled={invoiceLoading || loading || !canIssueEasyInvoice}

                        title={canIssueEasyInvoice ? issueInvoiceButtonLabel : effectiveIssueInvoiceReason}

                        aria-label={canIssueEasyInvoice ? issueInvoiceButtonLabel : effectiveIssueInvoiceReason}

                        style={invoiceActionPillStyle('linear-gradient(135deg,#b91c1c,#ef4444)', invoiceLoading || loading || !canIssueEasyInvoice)}

                    >

                        <IoDocumentTextOutline style={{ fontSize: 18 }} />

                        <span>{invoiceLoading && pendingInvoiceAction === 'issue' ? 'Đang phát hành...' : issueInvoiceButtonLabel}</span>

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
            <div style={S.card}>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>

                    <div>

                        <div style={S.sectionTitle}>Phiếu kê mua hàng</div>

                        <div style={{ fontSize: 10, lineHeight: 1.55, color: '#64748b', marginTop: 4 }}>

                            Phiếu kê mua hàng chỉ lấy phần dẻ mua vào. Với giao dịch đổi, phần dẻ cũ của khách sẽ đi vào đây.

                        </div>

                    </div>

                    <div style={{ fontSize: 10, fontWeight: 700, color: hasBuyVoucherData ? '#166534' : '#64748b' }}>

                        {hasBuyVoucherData ? 'Có dữ liệu mua dẻ/đổi dẻ' : 'Chưa có dữ liệu mua dẻ/đổi dẻ'}

                    </div>

                </div>

                {!buyVoucherRows.length ? (

                    <div style={{ marginTop: 12, borderRadius: 14, border: '1px dashed rgba(148,163,184,.7)', background: '#f8fafc', padding: 12, fontSize: 12, lineHeight: 1.6, color: '#64748b' }}>

                        Phiếu kê mua hàng chỉ được in khi đơn có mua dẻ hoặc có phần dẻ cũ của giao dịch đổi.

                    </div>

                ) : (

                    <div style={{ display: 'grid', gap: 12 }}>

                        <div style={{ fontSize: 10, lineHeight: 1.55, color: '#64748b' }}>

                            Đây là đúng bản preview PNG/in của phiếu kê mua hàng. Nội dung trong tab này sẽ khớp với file xuất PNG.

                        </div>

                        <div
                            style={{
                                minHeight: 220,
                                borderRadius: 22,
                                border: '1px solid #dbe4ee',
                                background: '#f8fafc',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                overflow: 'hidden',
                                padding: 12,
                            }}
                        >
                            {voucherPreviewLoading ? (
                                <div style={{ fontSize: 12, color: '#475569', fontWeight: 700 }}>Đang tạo preview PNG...</div>
                            ) : voucherPreviewError ? (
                                <div style={{ fontSize: 11, color: '#dc2626', lineHeight: 1.55, textAlign: 'center' }}>{voucherPreviewError}</div>
                            ) : voucherPreviewUrl ? (
                                <img src={voucherPreviewUrl} alt="preview-phieu-ke-mua-hang" style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 16, background: '#ffffff', boxShadow: '0 10px 24px rgba(15,23,42,.10)' }} />
                            ) : (
                                <div style={{ fontSize: 11, color: '#64748b' }}>Chưa có preview PNG.</div>
                            )}
                        </div>

                        {voucherPreviewActionMessage ? (
                            <div style={{ fontSize: 10, lineHeight: 1.45, color: voucherPreviewActionError ? '#dc2626' : '#0f766e', textAlign: 'center' }}>
                                {voucherPreviewActionMessage}
                            </div>
                        ) : null}

                        <div style={{ display: 'flex', justifyContent: 'center' }}>

                            <button

                                onClick={() => (voucherPreviewUrl ? setVoucherPreviewOpen(true) : openBuyVoucherPreview({ modeOverride: 'buy' }))}

                                disabled={voucherPreviewLoading || !hasBuyVoucherData}

                                style={{ ...compactActionPillStyle('linear-gradient(135deg,#0f766e,#14b8a6)', voucherPreviewLoading || !hasBuyVoucherData), minWidth: 214, height: 40, minHeight: 40, borderRadius: 20, padding: '0 18px' }}

                                title={hasBuyVoucherData ? 'Mở lớn / tải / copy / gửi agent' : 'Chưa có dữ liệu phiếu kê mua hàng'}

                                aria-label={hasBuyVoucherData ? 'Mở lớn / tải / copy / gửi agent' : 'Chưa có dữ liệu phiếu kê mua hàng'}

                            >

                                <IoDocumentTextOutline style={{ fontSize: 18 }} />

                                <span>{voucherPreviewLoading ? 'Đang tạo phiếu kê...' : 'Mở Lớn / Tác Vụ PNG'}</span>

                            </button>

                        </div>

                    </div>

                )}

            </div>

        </>

    );



    return (

        <div style={S.screen}>

            <div style={S.header}>

                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>

                    <button onClick={onBack} style={{ ...S.iconBtn('#ffffff'), border: '1px solid #dbe4ee' }}><IoChevronForward style={{ transform: 'scaleX(-1)' }} /></button>

                    <div><div data-sale-title="true" style={S.title}>{isIn ? 'Thanh toán' : 'Chi trả'}</div><div style={S.sub}>{orderId}</div></div>

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

                            <button onClick={onBack} title="Quay lại" aria-label="Quay lại" style={{ ...S.iconBtn('transparent'), width: 40, height: 40, background: 'transparent', border: 'none', boxShadow: 'none', color: '#94a3b8', fontSize: 22, padding: 0 }}><IoChevronForward style={{ transform: 'scaleX(-1)' }} /></button>

                            <button onClick={handleSend} disabled={loading} title="Tạo đơn" aria-label="Tạo đơn" style={footerPillStyle('linear-gradient(135deg,#15803d,#22c55e)', loading)}><IoDocumentTextOutline style={{ fontSize: 18 }} /><span>Tạo Đơn</span></button>

                        </div>

                    </>

                ) : (

                    <>

                        <div style={{ minWidth: 0, flex: 1 }}><div style={{ fontSize: 9, color: '#64748b', fontWeight: 700, marginBottom: 4 }}>{totalLabel}</div><div data-sale-amount="true" style={S.totalAmt(total < 0)}>{totalPrefix}{fmtCalc(total)}</div></div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>

                            <button onClick={handleSend} disabled={loading} title="Tạo đơn" aria-label="Tạo đơn" style={footerPillStyle('linear-gradient(135deg,#15803d,#22c55e)', loading)}><IoDocumentTextOutline style={{ fontSize: 18 }} /><span>Tạo Đơn</span></button>

                        </div>

                    </>

                )}

            </div>

            <ConfirmDialog

                open={issueConfirmOpen}

                title={pendingInvoiceAction === 'draft' ? draftInvoiceButtonLabel : issueInvoiceButtonLabel}

                message="Bạn đã kiểm tra kĩ thông tin chưa?"

                confirmLabel={pendingInvoiceAction === 'draft' ? draftInvoiceButtonLabel : issueInvoiceButtonLabel}

                onClose={() => {
                    if (!invoiceLoading) {
                        setIssueConfirmOpen(false);
                        setPendingInvoiceAction(null);
                    }
                }}

                onConfirm={handleConfirmedInvoiceAction}

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
