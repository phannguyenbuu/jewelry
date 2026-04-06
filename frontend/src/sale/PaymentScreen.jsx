import { useEffect, useState } from 'react';

import { IoChevronDownOutline, IoChevronForward, IoChevronUpOutline, IoDocumentTextOutline, IoPrintOutline, IoQrCodeOutline } from 'react-icons/io5';

import { buildEasyInvoicePayload, createEasyInvoiceDraft, createPaymentVoucherPreview, getBuyVoucherRows, hasBuyVoucherRows, resolveBuyVoucherCustomerInfo } from './printPaymentVoucher';

import { copySaleReceiptImageToClipboard, downloadSaleReceiptImage } from './printSaleReceipt';
import FormattedNumberInput from './FormattedNumberInput';

import DocumentPreviewModal from './DocumentPreviewModal';

import EasyInvoicePaper from './EasyInvoicePaper';

import { ConfirmDialog } from './Dialogs';

import { buildCompanyBankLabel, fetchCompanyBankAccounts, withFallbackCompanyBankAccounts } from '../lib/companyBankAccounts';
import { API, NEUTRAL_BORDER, NUMBER_FONT, POS_RED, fmtCalc, getLineSellAddedGoldWeight, getLineSellCutGoldWeight, getLineSellLaborAmount, getTradeNetAmount, getTradeOldGoldQuantity, normalizeTradeRate, nowStr, parseFmt, parseWeight, S } from './shared';

import { VIET_QR_BANKS, findVietQrBank, formatVietQrBankLabel, getVietQrBankLogoUrl } from './vietQrBanks';


const FIXED_QR_NOTE = 'Mua hang tai cong ty van kim';
const DIRECT_ISSUE_DISABLED_REASON = 'Tạm khóa phát hành trực tiếp, vui lòng xuất HĐ nháp.';
const BUY_VOUCHER_MANUAL_SERIAL = '........';
const RECEIPT_PREVIEW_PRINT_TARGETS = {
    1: {
        machineName: 'LAPTOP_PHAT',
        hostName: 'LAPTOP_PHAT',
        deviceName: 'LAPTOP_PHAT',
        printerName: 'Canon LBP2900',
        uncPath: '\\\\LAPTOP_PHAT\\Canon LBP2900',
    },
    2: {
        machineName: 'LAPTOP_KHACHIEU',
        hostName: 'LAPTOP_KHACHIEU',
        deviceName: 'LAPTOP_KHACHIEU',
        printerName: 'Canon LBP2900',
        uncPath: '\\\\LAPTOP_KHACHIEU\\Canon LBP2900',
    },
    3: {
        machineName: 'MAY01',
        hostName: 'MAY01',
        deviceName: 'MAY01',
        printerName: 'Canon LBP2900',
        uncPath: '\\\\MAY01\\Canon LBP2900',
    },
    4: {
        machineName: 'DESKTOP-563MTH4',
        hostName: 'DESKTOP-563MTH4',
        deviceName: 'DESKTOP-563MTH4',
        printerName: 'Canon LBP2900',
        uncPath: '\\\\DESKTOP-563MTH4\\Canon LBP2900',
    },
    5: {
        machineName: 'May05',
        hostName: 'May05',
        deviceName: 'May05',
        printerName: 'Canon LBP2900 (Copy 2)',
        uncPath: '\\\\May05\\Canon LBP2900 (Copy 2)',
    },
};
const RECEIPT_PREVIEW_PRINTER_OPTIONS = [
    { key: 1, label: '1', title: '\\\\LAPTOP_PHAT\\Canon LBP2900' },
    { key: 2, label: '2', title: '\\\\LAPTOP_KHACHIEU\\Canon LBP2900' },
    { key: 3, label: '3', title: '\\\\MAY01\\Canon LBP2900' },
    { key: 4, label: '4', title: '\\\\DESKTOP-563MTH4\\Canon LBP2900' },
    { key: 5, label: '5', title: '\\\\May05\\Canon LBP2900 (Copy 2)' },
];
const BUY_VOUCHER_PREVIEW_PRINT_TARGETS = RECEIPT_PREVIEW_PRINT_TARGETS;
const BUY_VOUCHER_PREVIEW_PRINTER_OPTIONS = RECEIPT_PREVIEW_PRINTER_OPTIONS;

const createDocumentPreviewState = (kind = 'buy') => ({
    loading: false,
    url: '',
    title: kind === 'receipt' ? 'Biên nhận' : 'Phiếu kê mua hàng',
    subtitle: kind === 'receipt' ? 'File PNG preview cho biên nhận.' : 'File PNG preview cho phiếu kê mua hàng.',
    fileName: kind === 'receipt' ? 'bien-nhan.png' : 'phieu-ke-mua-hang.png',
    documentName: kind === 'receipt' ? 'Biên nhận' : 'Phiếu kê mua hàng',
    error: '',
    actionMessage: '',
    actionError: false,
    sending: false,
});

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

    const sellLabor = getLineSellLaborAmount(nextLine);

    const sellAddedGold = getLineSellAddedGoldWeight(nextLine);

    const sellCutGold = getLineSellCutGoldWeight(nextLine);

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

    const tradeAmount = nextLine.tx === 'trade' ? getTradeNetAmount(nextLine, currentRate, customerRate) : 0;

    return {

        ...nextLine,

        value: nextLine.tx === 'trade'

            ? tradeAmount

            : goldEditorAmount,

    };

};

const parseInvoiceQuantityValue = (value) => {

    const quantityValue = Number(String(value ?? 0).replace(/,/g, '.'));

    return Number.isFinite(quantityValue) && quantityValue > 0 ? Number(quantityValue.toFixed(4)) : 0;

};

const parseInvoiceMoneyValue = (value) => Math.max(0, Math.round(parseFmt(value || 0)));

const computeInvoiceComponentAmount = (quantity, componentPrice) => Math.max(0, Math.round(Number(quantity || 0) * Math.max(0, Math.round(componentPrice || 0))));

const resolveInvoiceNetAmount = (total, labor) => Math.max(0, Math.round(Number(total || 0)) - parseInvoiceMoneyValue(labor));

const normalizeInvoiceLockedField = (value) => (value === 'componentPrice' ? 'componentPrice' : 'quantity');

const resolveInvoiceComponentPriceFromLockedTotal = ({ quantity, total, labor }) => {

    const safeQuantity = Number(quantity || 0);

    if (!(safeQuantity > 0)) return 0;

    const netAmount = resolveInvoiceNetAmount(total, labor);

    return parseInvoiceMoneyValue(netAmount / safeQuantity);

};

const resolveInvoiceQuantityFromLockedTotal = ({ componentPrice, total, labor }) => {

    const safeComponentPrice = parseInvoiceMoneyValue(componentPrice);

    if (!(safeComponentPrice > 0)) return 0;

    const netAmount = resolveInvoiceNetAmount(total, labor);

    return parseInvoiceQuantityValue(netAmount / safeComponentPrice);

};

const normalizeInvoiceItem = (item) => {

    const quantity = parseInvoiceQuantityValue(item?.quantity ?? 0);

    const componentPrice = parseInvoiceMoneyValue(item?.componentPrice || 0);

    const rawLabor = parseInvoiceMoneyValue(item?.labor || 0);

    const computedTotal = Math.round(computeInvoiceComponentAmount(quantity, componentPrice) + rawLabor);

    const fixedTotal = Math.max(0, Math.round(parseFmt(item?.fixedTotal ?? item?.total ?? computedTotal)));

    const labor = Math.max(0, Math.min(fixedTotal, rawLabor));

    return {

        ...item,

        manual: Boolean(item?.manual),
        lockedField: normalizeInvoiceLockedField(item?.lockedField),

        unit: pickText(item?.unit, 'chi'),

        quantity,

        componentPrice,

        labor,

        fixedTotal,

        total: fixedTotal,

    };

};

const rebalanceInvoiceItemForLockedTotal = (item, field, value) => {

    const normalizedItem = normalizeInvoiceItem(item);

    const fixedTotal = Math.max(0, Math.round(Number(normalizedItem?.fixedTotal ?? normalizedItem?.total ?? 0)));

    let quantity = normalizedItem.quantity;

    let componentPrice = normalizedItem.componentPrice;

    let labor = normalizedItem.labor;
    const lockedField = normalizeInvoiceLockedField(normalizedItem.lockedField);

    if (field === 'lockedField') {
        return normalizeInvoiceItem({ ...normalizedItem, lockedField: value, fixedTotal });
    }

    if (field === 'quantity') {

        quantity = parseInvoiceQuantityValue(value);

        componentPrice = resolveInvoiceComponentPriceFromLockedTotal({ quantity, total: fixedTotal, labor });

        return normalizeInvoiceItem({ ...normalizedItem, quantity, componentPrice, labor, fixedTotal });

    }

    if (field === 'componentPrice') {

        componentPrice = parseInvoiceMoneyValue(value);

        quantity = resolveInvoiceQuantityFromLockedTotal({ componentPrice, total: fixedTotal, labor });

        return normalizeInvoiceItem({ ...normalizedItem, quantity, componentPrice, labor, fixedTotal });

    }

    if (field === 'labor') {

        labor = Math.min(parseInvoiceMoneyValue(value), fixedTotal);
        if (lockedField === 'componentPrice') {
            quantity = resolveInvoiceQuantityFromLockedTotal({ componentPrice, total: fixedTotal, labor });
        } else {
            componentPrice = resolveInvoiceComponentPriceFromLockedTotal({ quantity, total: fixedTotal, labor });
        }

        return normalizeInvoiceItem({ ...normalizedItem, quantity, componentPrice, labor, fixedTotal });

    }

    return normalizeInvoiceItem({ ...normalizedItem, [field]: value, fixedTotal });

};

function EditableNumericInput({ value, onValueChange, style, readOnly = false, showStepper = false, step = 1000, min = 0, commitOnBlur = false }) {
    const applyNextValue = (nextValue) => {

        const safeValue = Math.max(min, Math.round(Number(nextValue || 0)));

        onValueChange?.(String(safeValue));

    };



    if (readOnly) {

        return <input style={style} type="text" value={fmtMoneyDisplay(value)} readOnly />;

    }



    return (

        <div style={{ position: 'relative', width: '100%' }}>
            <FormattedNumberInput
                style={showStepper ? { ...style, paddingRight: 32 } : style}
                value={value}
                onValueChange={onValueChange}
                inputMode="numeric"
                commitOnBlur={commitOnBlur}
                emptyWhenZero={false}
            />

            {showStepper ? (

                <div style={{ position: 'absolute', right: 6, top: 5, bottom: 5, width: 22, display: 'flex', flexDirection: 'column', gap: 3 }}>

                    <button

                        type="button"

                        onMouseDown={e => e.preventDefault()}

                        onClick={() => applyNextValue(Number(value || 0) + step)}

                        style={{ flex: 1, borderRadius: 7, border: '1px solid #dbe4ee', background: '#f8fafc', color: '#475569', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0, cursor: 'pointer' }}

                        aria-label="Tăng giá trị"

                        title="Tăng giá trị"

                    >

                        <IoChevronUpOutline style={{ fontSize: 12 }} />

                    </button>

                    <button

                        type="button"

                        onMouseDown={e => e.preventDefault()}

                        onClick={() => applyNextValue(Number(value || 0) - step)}

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

export default function PaymentScreen({ total, orderId, formula, lines, setLines, rates, customerInfo, setCustomerInfo, onBack, onSend, onEnsureOrder, loading }) {

    const isIn = total >= 0;

    const absTotal = Math.abs(total);

    const totalPrefix = total > 0 ? '+' : total < 0 ? '-' : '';

    const totalLabel = total > 0 ? 'KHÁCH TRẢ' : total < 0 ? 'KHÁCH NHẬN' : 'TỔNG TẠM TÍNH';

    const hasBuyVoucherData = hasBuyVoucherRows(lines);
    const hasCountedNewGoldLine = (lines || []).some((line) => {
        if (!line || !['sell', 'trade'].includes(line.tx)) return false;
        const effectiveCat = line.tx === 'trade' ? 'gold' : line.cat;
        if (effectiveCat !== 'gold') return false;
        if (line.tx === 'trade' && line.tradeNewExpanded === false) return false;
        const baseQty = parseWeight(line.qty || 0);
        const addGold = getLineSellAddedGoldWeight(line);
        const cutGold = getLineSellCutGoldWeight(line);
        const itemGoldWeight = parseWeight(line.itemGoldWeight || 0);
        const baseGoldWeight = line.itemId ? (itemGoldWeight || 1) : baseQty;
        return Math.max(0, baseGoldWeight + addGold - cutGold) > 0;
    });
    const hasReceiptLineData = (lines || []).some((line) => {
        if (!line) return false;
        if (line.tx === 'buy' && line.cat === 'gold') {
            return parseWeight(line.qty || 0) > 0;
        }
        if (!['sell', 'trade'].includes(line.tx)) return false;
        const effectiveCat = line.tx === 'trade' ? 'gold' : line.cat;
        if (effectiveCat !== 'gold') return false;
        const baseQty = parseWeight(line.qty || 0);
        const addGold = getLineSellAddedGoldWeight(line);
        const cutGold = getLineSellCutGoldWeight(line);
        const itemGoldWeight = parseWeight(line.itemGoldWeight || 0);
        const baseGoldWeight = line.itemId ? (itemGoldWeight || 1) : baseQty;
        const hasNewGold = Math.max(0, baseGoldWeight + addGold - cutGold) > 0;
        const hasOldGold = line.tx === 'trade' && getTradeOldGoldQuantity(line) > 0;
        return hasNewGold || hasOldGold;
    });
    const hasNewGoldForReceipt = hasReceiptLineData;

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

    const [buyVoucherPreviewState, setBuyVoucherPreviewState] = useState(() => createDocumentPreviewState('buy'));

    const [receiptPreviewState, setReceiptPreviewState] = useState(() => createDocumentPreviewState('receipt'));

    const [voucherPreviewKind, setVoucherPreviewKind] = useState('buy');

    const voucherPreviewSendLabel = voucherPreviewKind === 'receipt' ? 'In Biên Nhận' : 'In Phiếu Kê';

    const activeDocumentPreviewState = voucherPreviewKind === 'receipt' ? receiptPreviewState : buyVoucherPreviewState;
    const updateDocumentPreviewState = (kind, patch) => {
        const setState = kind === 'receipt' ? setReceiptPreviewState : setBuyVoucherPreviewState;
        setState((prev) => ({ ...prev, ...patch }));
    };
    const getDocumentPreviewState = (kind) => (kind === 'receipt' ? receiptPreviewState : buyVoucherPreviewState);
    const modalPreviewState = activeDocumentPreviewState || createDocumentPreviewState(voucherPreviewKind);
    const modalPreviewFileName = modalPreviewState.fileName;
    const buyVoucherPreviewLoading = buyVoucherPreviewState.loading;
    const buyVoucherPreviewUrl = buyVoucherPreviewState.url;
    const buyVoucherPreviewError = buyVoucherPreviewState.error;
    const buyVoucherPreviewActionMessage = buyVoucherPreviewState.actionMessage;
    const buyVoucherPreviewActionError = buyVoucherPreviewState.actionError;
    const buyVoucherSending = buyVoucherPreviewState.sending;

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

        code: pickText(easyInvoiceDraft?.customer?.code),

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

    const createOrderReason = isIn ? requiredCustomerReason : '';

    const showInvoiceTab = hasEasyInvoiceItems && hasCountedNewGoldLine;

    const effectiveExportInvoiceReason = requiredCustomerReason || exportInvoiceReason;

    const effectiveIssueInvoiceReason = DIRECT_ISSUE_DISABLED_REASON;

    const canIssueEasyInvoice = false;

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
    const selectedCompanyBankTitle = selectedCompanyBankAccount
        ? [
            pickText(selectedCompanyBankAccount?.bank_name || selectedCompanyBankAccount?.bank_code),
            pickText(selectedCompanyBankAccount?.display_name || selectedCompanyBankAccount?.account_name),
        ].filter(Boolean).join(' · ') || selectedCompanyBankLabel
        : '';

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

    const syncEasyInvoiceItemToHomeLine = (key, nextItem) => {

        if (!setLines || !nextItem) return;

        setLines(prevLines => prevLines.map(line => {

            const matchedItem = easyInvoiceItems.find(item => String(item?.key) === String(key));

            if (!matchedItem || String(line?.id) !== String(matchedItem?.lineId)) return line;

            const nextComponentPrice = Math.max(0, Math.round(parseFmt(nextItem?.componentPrice || 0)));

            const nextLabor = Math.max(0, Math.round(parseFmt(nextItem?.labor || 0)));

            const patch = {

                [line.tx === 'trade' ? 'customTrade' : 'customSell']: nextComponentPrice,

                sellLabor: nextLabor,

            };

            return recomputeLinkedSaleLine(line, rates, patch);

        }));

    };

    const updateEasyInvoiceItem = (key, field, value) => {

        setEasyInvoiceEditorError('');

        const currentItem = (easyInvoiceDraft?.items || []).find(item => String(item?.key) === String(key));

        const nextItem = currentItem ? rebalanceInvoiceItemForLockedTotal(currentItem, field, value) : null;

        setEasyInvoiceDraft(prev => ({

            ...prev,

            items: (prev?.items || []).map(item => {
                if (String(item?.key) !== String(key)) return item;
                return nextItem || rebalanceInvoiceItemForLockedTotal(item, field, value);
            }),

        }));

        return nextItem;

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

    const getVoucherFileName = () => {

        const normalizedOrderId = String(orderId || 'sale').trim().replace(/[^a-zA-Z0-9_-]+/g, '-');

        return `phieu-ke-mua-hang-${normalizedOrderId}.png`;

    };

    const getReceiptFileName = () => {

        const normalizedOrderId = String(orderId || 'sale').trim().replace(/[^a-zA-Z0-9_-]+/g, '-');

        return `bien-nhan-${normalizedOrderId}.png`;

    };

    const extractBase64FromDataUrl = (imageUrl) => {

        const matched = String(imageUrl || '').match(/^data:(.+?);base64,(.+)$/i);

        if (!matched) throw new Error('Không đọc được dữ liệu PNG để gửi agent.');

        return {

            contentType: matched[1] || 'image/png',

            imageBase64: matched[2] || '',

        };

    };

    const queueVoucherToAgent = async ({ kind = 'buy', imageUrl, targetOverride }) => {

        const previewState = getDocumentPreviewState(kind);
        const resolvedImageUrl = imageUrl || previewState.url;
        const { contentType, imageBase64 } = extractBase64FromDataUrl(resolvedImageUrl);
        if (!targetOverride) {
            throw new Error(kind === 'receipt' ? 'Không tìm thấy máy in biên nhận.' : 'Không tìm thấy máy in phiếu kê.');
        }
        const target = targetOverride;

        updateDocumentPreviewState(kind, {
            sending: true,
            actionError: false,
            actionMessage: `Đang gửi PNG tới ${target.machineName}...`,
        });

        try {

            const response = await fetch(`${API}/api/print/dispatch-image`, {

                method: 'POST',

                headers: { 'Content-Type': 'application/json' },

                body: JSON.stringify({

                    image_base64: imageBase64,

                    content_type: contentType,

                    document_name: previewState.documentName || (kind === 'receipt' ? 'Biên nhận' : 'Phiếu kê mua hàng'),

                    file_name: previewState.fileName || (kind === 'receipt' ? 'bien-nhan.png' : 'phieu-ke-mua-hang.png'),

                    requested_by: 'POS Mobile',

                    machine_name: target.machineName,

                    host_name: target.hostName,

                    device_name: target.deviceName,

                    printer_name: target.printerName,

                    unc_path: target.uncPath,

                    options: {},

                }),

            });

            const payload = await response.json().catch(() => ({}));

            if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);

            const agentName = payload?.agent?.machine_name || payload?.agent?.device_name || payload?.agent?.agent_key || target.machineName;

            const printerName = payload?.printer?.printer_name || payload?.command?.printer_name || target.printerName;

            updateDocumentPreviewState(kind, {
                actionMessage: printerName ? `Đã gửi PNG tới ${agentName} / ${printerName}.` : `Đã gửi PNG tới ${agentName}.`,
            });

            return payload;

        } catch (error) {

            updateDocumentPreviewState(kind, {
                actionError: true,
                actionMessage: error.message || 'Không gửi được PNG tới agent.',
            });

            throw error;

        } finally {

            updateDocumentPreviewState(kind, { sending: false });

        }

    };

    const handleVoucherDownload = () => {

        if (!modalPreviewState.url) return;

        downloadSaleReceiptImage(modalPreviewState.url, modalPreviewFileName);

        updateDocumentPreviewState(voucherPreviewKind, {
            actionError: false,
            actionMessage: `Đã tải ${modalPreviewFileName}.`,
        });

    };

    const handleVoucherCopy = async () => {

        if (!modalPreviewState.url) return;

        updateDocumentPreviewState(voucherPreviewKind, {
            actionError: false,
            actionMessage: '',
        });

        try {

            await copySaleReceiptImageToClipboard(modalPreviewState.url);

            updateDocumentPreviewState(voucherPreviewKind, {
                actionMessage: 'Đã copy PNG vào clipboard.',
            });

        } catch (error) {

            updateDocumentPreviewState(voucherPreviewKind, {
                actionError: true,
                actionMessage: error.message || 'Không copy được PNG.',
            });

        }

    };

    const applyDocumentPreviewState = ({ imageUrl, model }, kind = 'buy') => {

        const isReceiptPreview = kind === 'receipt';
        const documentTitle = model?.title || (isReceiptPreview ? 'Biên nhận' : 'Phiếu kê mua hàng');
        const previewSubtitle = isReceiptPreview
            ? `PNG preview. Đơn hàng: ${model?.orderId || orderId || 'PHIEU-TAM'}`
            : `PNG preview. Số phiếu: ${BUY_VOUCHER_MANUAL_SERIAL}`;

        updateDocumentPreviewState(kind, {
            title: documentTitle,
            subtitle: previewSubtitle,
            fileName: isReceiptPreview ? getReceiptFileName() : getVoucherFileName(),
            documentName: documentTitle,
            url: imageUrl,
            error: '',
        });
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

            serialNoOverride: BUY_VOUCHER_MANUAL_SERIAL,

            modeOverride: options.modeOverride || 'buy',

        });

        applyDocumentPreviewState(preview, 'buy');

        return preview;

    };

    const createReceiptPreviewData = async () => {

        const settlement = buildSettlementPayload();

        const preview = await createPaymentVoucherPreview({

            orderId,

            total,

            customerInfo: isIn ? buildEasyInvoiceCustomerInfo() : sharedCustomerInfo,

            lines,

            rates,

            settlement,

            modeOverride: 'receipt',

        });

        applyDocumentPreviewState(preview, 'receipt');

        return preview;

    };

    const openDocumentPreview = async ({
        kind = 'buy',
        skipOrderPersist = false,
        persistOptions,
        createPreview,
        errorMessage,
    }) => {

        if (!skipOrderPersist) {
            try {
                await persistCurrentOrder(persistOptions || {});
            } catch (error) {
                const message = error.message || 'Không ghi được đơn hàng vào backend.';
                updateDocumentPreviewState(kind, {
                    error: message,
                    actionError: true,
                    actionMessage: message,
                });
                return null;
            }
        }

        setVoucherPreviewKind(kind);
        setVoucherPreviewOpen(true);

        updateDocumentPreviewState(kind, {
            loading: true,
            error: '',
            url: '',
            actionMessage: '',
            actionError: false,
        });

        try {

            return await createPreview();

        } catch (error) {

            updateDocumentPreviewState(kind, {
                error: error.message || errorMessage,
                actionError: true,
                actionMessage: error.message || errorMessage,
            });

            return null;

        } finally {

            updateDocumentPreviewState(kind, { loading: false });

        }

    };

    const openBuyVoucherPreview = async (options = {}) => {

        return openDocumentPreview({
            kind: 'buy',
            skipOrderPersist: options.skipOrderPersist,
            persistOptions: {
                customerInfoOverride: buildBuyVoucherCustomerInfo(),
            },
            createPreview: () => createBuyVoucherPreviewData(options),
            errorMessage: 'Không tạo được file PNG cho phiếu kê mua hàng.',
        });

    };

    const openReceiptPreview = async (options = {}) => openDocumentPreview({
        kind: 'receipt',
        skipOrderPersist: options.skipOrderPersist,
        persistOptions: {
            customerInfoOverride: isIn ? buildEasyInvoiceCustomerInfo() : sharedCustomerInfo,
        },
        createPreview: createReceiptPreviewData,
        errorMessage: 'Không tạo được file PNG cho biên nhận.',
    });

    useEffect(() => {

        if (activePanel !== 'voucher') return undefined;

        if (!hasBuyVoucherData) {

            updateDocumentPreviewState('buy', {
                loading: false,
                error: '',
                url: '',
                actionMessage: '',
                actionError: false,
            });

            return undefined;

        }

        let cancelled = false;

        updateDocumentPreviewState('buy', {
            loading: true,
            error: '',
        });

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

                applyDocumentPreviewState(preview, 'buy');

                if (cancelled || !preview) return;

            } catch (error) {

                if (cancelled) return;

                updateDocumentPreviewState('buy', {
                    error: error.message || 'Không tạo được file PNG cho phiếu kê mua hàng.',
                });

            } finally {

                if (!cancelled) {

                    updateDocumentPreviewState('buy', { loading: false });

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

        code: pickText(easyInvoiceDraft?.customer?.code),

    });

    const buildBuyVoucherCustomerInfo = () => resolveBuyVoucherCustomerInfo(sharedCustomerInfo);

    const persistCurrentOrder = async (options = {}) => {
        if (!onEnsureOrder) return null;
        const settlement = options.settlement || buildSettlementPayload();
        const customerInfoOverride = options.customerInfoOverride === undefined
            ? (isIn ? buildEasyInvoiceCustomerInfo() : sharedCustomerInfo)
            : options.customerInfoOverride;
        try {
            return await onEnsureOrder(settlement, {
                ...options,
                customerInfoOverride,
                refreshOrders: options.refreshOrders ?? false,
                silent: true,
            });
        } catch (error) {
            const message = error.message || 'Không ghi được đơn hàng vào backend.';
            setActionMessage(message);
            throw error;
        }
    };

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

        if (!hasReceiptLineData) {
            return;
        }

        setActionMessage('');

        await openReceiptPreview();

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

                order_id: result.order_id || orderId,

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

                refreshOrders: false,

                silent: true,

            });

            await handleExportEasyInvoice();

            setInvoiceLoading(false);

            if (hasBuyVoucherData) {

                const preview = await openBuyVoucherPreview({ modeOverride: 'buy', skipOrderPersist: true });

                void preview;

                setActionMessage('Đã xuất HĐ nháp. Chọn máy 1-5 để in phiếu kê mua hàng.');

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

    const openInvoiceConfirm = async (action) => {

        const reason = action === 'draft' ? effectiveExportInvoiceReason : effectiveIssueInvoiceReason;

        if (reason) {

            setEasyInvoiceEditorError(reason);

            setActionMessage(reason);

            setPendingInvoiceAction(null);

            return;

        }

        setEasyInvoiceEditorError('');

        setActionMessage('');

        try {
            await persistCurrentOrder({
                customerInfoOverride: buildEasyInvoiceCustomerInfo(),
            });
        } catch {
            return;
        }

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

                refreshOrders: false,

                silent: true,

            });

            const response = await fetch(`${API}/api/easyinvoice/issue`, {

                method: 'POST',

                headers: { 'Content-Type': 'application/json' },

                body: JSON.stringify({ order_id: orderId, total, customer_info: easyInvoiceCustomerInfo, settlement, invoice_data: invoiceData }),

            });

            const result = await response.json().catch(() => ({}));

            if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);

            const amountValue = Math.round(Number(result?.amount ?? invoiceData?.invoice?.amount ?? 0));
            const modalPayload = {
                ...result,
                message: result.msg || 'Đã phát hành EasyInvoice thành công.',
                amount_text: `${fmtMoneyDisplay(amountValue)} VND`,
                buyer: result.buyer || easyInvoiceCustomerInfo.name || 'Khách lẻ',
                order_id: result.order_id || orderId,
            };
            setEasyInvoiceResult(modalPayload);
            setEasyInvoiceResultOpen(true);

            setIssueConfirmOpen(false);

            if (hasBuyVoucherData) {

                const preview = await openBuyVoucherPreview({ modeOverride: 'buy', skipOrderPersist: true });

                void preview;

                setActionMessage(result.msg || 'Đã phát hành EasyInvoice. Chọn máy 1-5 để in phiếu kê mua hàng.');

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



    const handleTabChange = async (nextTab) => {

        if (nextTab === activePanel) return;

        const customerInfoOverride = nextTab === 'voucher'

            ? buildBuyVoucherCustomerInfo()

            : (isIn ? buildEasyInvoiceCustomerInfo() : sharedCustomerInfo);

        try {

            await persistCurrentOrder({ customerInfoOverride });

            setActivePanel(nextTab);

        } catch {

            // persistCurrentOrder already shows error

        }

    };

    const handleVoucherPreviewAction = async () => {

        try {

            await persistCurrentOrder({

                customerInfoOverride: buildBuyVoucherCustomerInfo(),

            });

        } catch {

            return;

        }

        if (buyVoucherPreviewUrl) {
            setVoucherPreviewKind('buy');
            setVoucherPreviewOpen(true);

            return;

        }

        await openBuyVoucherPreview({ modeOverride: 'buy', skipOrderPersist: true });

    };

    const handleVoucherPrintAction = async () => {

        try {

            await persistCurrentOrder({

                customerInfoOverride: buildBuyVoucherCustomerInfo(),

            });

        } catch {

            return;

        }

        updateDocumentPreviewState('buy', {
            actionMessage: '',
            actionError: false,
            error: '',
        });
        const hasExistingPreview = Boolean(buyVoucherPreviewUrl);
        if (!hasExistingPreview) {
            updateDocumentPreviewState('buy', { loading: true });
        }

        try {

            const preview = hasExistingPreview
                ? { imageUrl: buyVoucherPreviewUrl }
                : await createBuyVoucherPreviewData({ modeOverride: 'buy' });

            const buyVoucherTarget = BUY_VOUCHER_PREVIEW_PRINT_TARGETS[1];
            await queueVoucherToAgent({
                kind: 'buy',
                imageUrl: preview?.imageUrl || buyVoucherPreviewUrl,
                targetOverride: buyVoucherTarget,
            });

        } catch (error) {

            const message = error.message || 'Không gửi được phiếu kê tới máy in.';

            updateDocumentPreviewState('buy', {
                actionError: true,
                actionMessage: message,
                ...(buyVoucherPreviewUrl ? {} : { error: message }),
            });

        } finally {

            if (!hasExistingPreview) {
                updateDocumentPreviewState('buy', { loading: false });
            }

        }

    };

    const handlePreviewSend = async (printerKey = null, previewKindOverride = voucherPreviewKind) => {
        const previewKind = previewKindOverride || voucherPreviewKind;

        if (previewKind !== 'receipt') {
            const buyVoucherTarget = BUY_VOUCHER_PREVIEW_PRINT_TARGETS[printerKey];
            if (!buyVoucherTarget) {
                updateDocumentPreviewState('buy', {
                    actionError: true,
                    actionMessage: 'Không tìm thấy máy in phiếu kê.',
                });
                return;
            }
            try {
                await queueVoucherToAgent({
                    kind: 'buy',
                    targetOverride: buyVoucherTarget,
                });
            } catch {
                return;
            }
            return;
        }

        const receiptTarget = RECEIPT_PREVIEW_PRINT_TARGETS[printerKey];
        if (!receiptTarget) {
            updateDocumentPreviewState('receipt', {
                actionError: true,
                actionMessage: 'Không tìm thấy máy in biên nhận.',
            });
            return;
        }

        try {
            await queueVoucherToAgent({
                kind: 'receipt',
                targetOverride: receiptTarget,
            });
        } catch {
            return;
        }

        updateDocumentPreviewState('receipt', {
            actionError: false,
            actionMessage: `Đã gửi biên nhận tới máy ${printerKey}. Đang chốt đơn...`,
        });

        try {
            await onSend(buildSettlementPayload(), {
                customerInfoOverride: isIn ? buildEasyInvoiceCustomerInfo() : null,
                finalize: true,
                markSold: true,
                preserveScreenOnFinalize: true,
                preserveStateOnFinalize: true,
            });
            const successMessage = `Đã gửi biên nhận tới máy ${printerKey} và ghi nhận đơn hàng.`;
            setActionMessage(successMessage);
            setVoucherPreviewOpen(false);
        } catch (error) {
            const message = `Đã gửi biên nhận tới máy ${printerKey} nhưng chưa chốt đơn: ${error.message || 'Lỗi không xác định.'}`;
            updateDocumentPreviewState('receipt', {
                actionError: true,
                actionMessage: message,
            });
            setActionMessage(message);
        }

    };

 
    const screenTabs = [

        { key: 'payment', label: isIn ? 'Thanh toán' : 'Chi trả' },

        ...(showInvoiceTab ? [{ key: 'invoice', label: 'Hóa Đơn Đỏ' }] : []),

        ...(hasBuyVoucherData ? [{ key: 'voucher', label: 'Phiếu Kê MH' }] : []),

    ];

    useEffect(() => {

        if (activePanel === 'invoice' && !showInvoiceTab) {

            setActivePanel('payment');

            return;

        }

        if (hasBuyVoucherData || activePanel !== 'voucher') return;

        setActivePanel('payment');

    }, [activePanel, hasBuyVoucherData, showInvoiceTab]);

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

                        <EditableNumericInput value={bank} onValueChange={handleBankChange} style={isIn ? { ...numericInputStyle, color: '#2563eb' } : { ...largeNumericInputStyle, color: '#2563eb' }} />

                    </div>

                    <div>

                        <span style={S.label}>Tiền mặt</span>

                        <EditableNumericInput value={cash} onValueChange={handleCashChange} style={isIn ? { ...numericInputStyle, color: POS_RED } : { ...largeNumericInputStyle, color: POS_RED }} />

                    </div>

                    {isIn ? (
                        <div>

                            <span style={S.label}>Tài khoản công ty nhận</span>

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
                                                {selectedCompanyBankTitle || selectedCompanyBankLabel}
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
                    ) : null}

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

                            <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>{qrNote}</div>

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

                        onClick={() => { void openInvoiceConfirm('draft'); }}

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

                        onClick={() => { void openInvoiceConfirm('issue'); }}

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

                    const nextItem = updateEasyInvoiceItem(key, field, value);

                    if (field === 'componentPrice' || field === 'labor') {

                        syncEasyInvoiceItemToHomeLine(key, nextItem);

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
                <button
                    type="button"
                    onClick={() => {
                        if (buyVoucherPreviewUrl) {
                            setVoucherPreviewKind('buy');
                            setVoucherPreviewOpen(true);
                        }
                    }}
                    disabled={buyVoucherPreviewLoading || !buyVoucherPreviewUrl}
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
                        width: '100%',
                        cursor: buyVoucherPreviewLoading || !buyVoucherPreviewUrl ? 'default' : 'pointer',
                        appearance: 'none',
                    }}
                >
                    {buyVoucherPreviewLoading ? (
                        <div style={{ fontSize: 12, color: '#475569', fontWeight: 700 }}>Đang tạo preview PNG...</div>
                    ) : buyVoucherPreviewError ? (
                        <div style={{ fontSize: 11, color: '#dc2626', lineHeight: 1.55, textAlign: 'center' }}>{buyVoucherPreviewError}</div>
                    ) : buyVoucherPreviewUrl ? (
                        <img src={buyVoucherPreviewUrl} alt="preview-phieu-ke-mua-hang" style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 16, background: '#ffffff', boxShadow: '0 10px 24px rgba(15,23,42,.10)' }} />
                    ) : null}
                </button>

                {hasBuyVoucherData ? (
                    <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
                        {buyVoucherPreviewActionMessage ? (
                            <div style={{ fontSize: 10, lineHeight: 1.45, color: buyVoucherPreviewActionError ? '#dc2626' : '#0f766e', textAlign: 'center' }}>
                                {buyVoucherPreviewActionMessage}
                            </div>
                        ) : null}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                            {BUY_VOUCHER_PREVIEW_PRINTER_OPTIONS.map((printer) => (
                                <button
                                    key={printer.key}
                                    type="button"
                                    onClick={() => { void handlePreviewSend(printer.key, 'buy'); }}
                                    disabled={buyVoucherPreviewLoading || !buyVoucherPreviewUrl || buyVoucherSending}
                                    title={printer.title || `Máy in ${printer.label}`}
                                    aria-label={printer.title || `Máy in ${printer.label}`}
                                    style={{
                                        width: 38,
                                        height: 38,
                                        borderRadius: '50%',
                                        border: 'none',
                                        background: 'linear-gradient(135deg,#15803d,#22c55e)',
                                        color: '#ffffff',
                                        fontWeight: 900,
                                        fontSize: 13,
                                        cursor: buyVoucherPreviewLoading || !buyVoucherPreviewUrl || buyVoucherSending ? 'not-allowed' : 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        boxShadow: '0 10px 18px rgba(34,197,94,.24)',
                                        opacity: buyVoucherPreviewLoading || !buyVoucherPreviewUrl || buyVoucherSending ? 0.55 : 1,
                                    }}
                                >
                                    {printer.label}
                                </button>
                            ))}
                        </div>
                    </div>
                ) : null}

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

                        <button key={tab.key} type="button" onClick={() => { void handleTabChange(tab.key); }} style={tabButtonStyle(activePanel === tab.key)} disabled={loading || invoiceLoading}>

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

                <div style={{ minWidth: 0, flex: 1 }}><div style={{ fontSize: 9, color: '#64748b', fontWeight: 700, marginBottom: 4 }}>{totalLabel}</div><div data-sale-amount="true" style={S.totalAmt(total < 0)}>{totalPrefix}{fmtCalc(total)}</div></div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>

                    <button onClick={onBack} title="Quay lại" aria-label="Quay lại" style={{ ...S.iconBtn('transparent'), width: 40, height: 40, background: 'transparent', border: 'none', boxShadow: 'none', color: '#94a3b8', fontSize: 22, padding: 0 }}><IoChevronForward style={{ transform: 'scaleX(-1)' }} /></button>

                    {hasReceiptLineData ? <button onClick={handleSend} disabled={loading} title="In Biên Nhận" aria-label="In Biên Nhận" style={footerPillStyle('linear-gradient(135deg,#15803d,#22c55e)', loading)}><IoPrintOutline style={{ fontSize: 18 }} /><span>In Biên Nhận</span></button> : null}

                </div>

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

                loading={modalPreviewState.loading}

                imageUrl={modalPreviewState.url}

                error={modalPreviewState.error}

                title={modalPreviewState.title}

                subtitle={modalPreviewState.subtitle}

                onClose={() => setVoucherPreviewOpen(false)}

                onDownload={handleVoucherDownload}

                onCopy={handleVoucherCopy}

                onSendToAgent={() => handlePreviewSend()}

                onSendToPrinter={handlePreviewSend}

                actionMessage={modalPreviewState.actionMessage}

                actionError={modalPreviewState.actionError}

                sending={modalPreviewState.sending || (voucherPreviewKind === 'receipt' && loading)}

                sendLabel={voucherPreviewSendLabel}

                showCopy={voucherPreviewKind !== 'receipt'}

                printerOptions={voucherPreviewKind === 'receipt' ? RECEIPT_PREVIEW_PRINTER_OPTIONS : voucherPreviewKind === 'buy' ? BUY_VOUCHER_PREVIEW_PRINTER_OPTIONS : []}

            />

        </div>

    );

}
