import { useCallback, useEffect, useState } from 'react';
import SaleFloatingMenu from './sale/SaleFloatingMenu';
import InventoryScreen from './sale/InventoryScreen';
import OrderScreen from './sale/OrderScreen';
import PaymentScreen from './sale/PaymentScreen';
import RepairJobScreen from './sale/RepairJobScreen';
import { OrderListScreen, SavedTransactionsModal } from './sale/SavedScreens';
import { API, BUY_GOLD_OTHER_OPTION, DEFAULT_RATES, INVENTORY_TXS, NUMBER_FONT, SAVED_SALE_KEY, SOLD_STATUS, S, UI_FONT, createDefaultLine, createEmptyCustomerInfo, createRepairLine, fmtVN, formatBuyGoldProductLabel, formatWeight, genOrderId, genRepairId, getGoldAgeProductValues, getGoldLineEffectiveQuantity, getLineSellLaborAmount, getTradeCompensationAmount, getTradeCompensationQuantity, getTradeCompensationUnitAmount, getTradeNetAmount, getTradeOldGoldQuantity, getTradeQuantityDirection, hasCustomerInfo, isPositiveTransaction, normalizeTradeRate, parseFmt, parseWeight, readSavedSales, sanitizeLineInventoryState } from './sale/shared';

const serializeOrderLines = (saleLines = []) => saleLines.map((line, index) => ({
    stt: index + 1,
    line_id: line.id || index + 1,
    loai_giao_dich: line.tx || '',
    nhom_hang: line.cat || '',
    ma_hang: line.productCode || line.itemId || '',
    ten_hang: line.itemName || line.product || line.customerProduct || '',
    san_pham: line.product || '',
    san_pham_khach: line.customerProduct || '',
    so_luong: String(line.qty ?? ''),
    so_luong_khach: String(line.customerQty ?? ''),
    don_gia: Math.round(parseFmt(line.tx === 'buy' ? line.customBuy : line.tx === 'trade' ? (line.customTrade ?? line.customSell) : line.customSell || 0)),
    thanh_tien: Math.round(Number(line.value || 0)),
}));

const resolveOrderTypeFromLines = (saleLines = []) => {
    const txs = [...new Set((saleLines || []).map(line => String(line?.tx || '').trim().toLowerCase()).filter(Boolean))];
    if (txs.includes('trade')) return 'Đổi';
    if (txs.length > 1) return 'Tổng hợp POS';
    if (txs.includes('sell')) return 'Bán';
    if (txs.includes('buy')) return 'Mua';
    return 'POS';
};

const ORDER_TIME_ZONE = 'Asia/Ho_Chi_Minh';

const formatDatePartsInTimeZone = (value = new Date(), timeZone = ORDER_TIME_ZONE) => {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    });
    const parts = {};
    for (const part of formatter.formatToParts(date)) {
        if (part.type !== 'literal') parts[part.type] = part.value;
    }
    if (!parts.year || !parts.month || !parts.day || !parts.hour || !parts.minute || !parts.second) {
        return null;
    }
    return parts;
};

const formatOrderDateTimeForStorage = (value = new Date()) => {
    const raw = String(value ?? '').trim();
    if (raw) {
        const normalized = raw.replace('T', ' ').replace(/\.\d+$/, '');
        if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return `${normalized} 00:00:00`;
        if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(normalized)) return `${normalized}:00`;
        if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(normalized)) return normalized;
    }
    const parts = formatDatePartsInTimeZone(value);
    if (!parts) {
        return raw || '';
    }
    return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
};

export default function SalePosMobile() {
    const [screen, setScreen] = useState('order'); // 'order' | 'payment' | 'repair' | 'inventory' | 'list'
    const [navMenuOpen, setNavMenuOpen] = useState(false);
    const [rates, setRates] = useState(DEFAULT_RATES);
    const [lines, setLines] = useState([]);
    const [customerInfo, setCustomerInfo] = useState(createEmptyCustomerInfo);
    const [customerInfoOpen, setCustomerInfoOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [repairLoading, setRepairLoading] = useState(false);
    const [orders, setOrders] = useState([]);
    const [orderId, setOrderId] = useState(genOrderId);
    const [orderCreatedAt, setOrderCreatedAt] = useState(() => formatOrderDateTimeForStorage(new Date()));
    const [repairId, setRepairId] = useState(genRepairId);
    const [repairMode, setRepairMode] = useState('sua');
    const [repairLines, setRepairLines] = useState([createRepairLine()]);
    const [repairNote, setRepairNote] = useState('');
    const [repairMessage, setRepairMessage] = useState('');
    const [settleLoading, setSettleLoading] = useState(false);
    const [inventoryItems, setInventoryItems] = useState([]);
    const [nhomHangList, setNhomHangList] = useState([]);
    const [quayNhoList, setQuayNhoList] = useState([]);
    const [tuoiVangList, setTuoiVangList] = useState([]);
    const [savedDrafts, setSavedDrafts] = useState([]);
    const [savedModalOpen, setSavedModalOpen] = useState(false);
    const [draftMessage, setDraftMessage] = useState('');

    /* compute total from lines */
    const total = lines.reduce((s, l) => {
        const v = l.tx === 'trade'
            ? Number(l.value || 0)
            : (isPositiveTransaction(l.tx) ? Math.abs(l.value || 0) : -Math.abs(l.value || 0));
        return s + v;
    }, 0);

    const formula = lines.map(l => {
        const effectiveCat = l.tx === 'trade' ? 'gold' : l.cat;
        const r = rates[effectiveCat]?.[l.product] || [0, 0];
        const rate = normalizeTradeRate(
            effectiveCat,
            l.tx === 'buy' ? (l.customBuy ?? r[1]) : l.tx === 'trade' ? (l.customTrade ?? r[0]) : (l.customSell ?? r[0])
        );
        const sign = l.tx === 'trade'
            ? (Number(l.value || 0) >= 0 ? '+' : '-')
            : (isPositiveTransaction(l.tx) ? '+' : '-');
        const productLabel = l.tx === 'buy' && effectiveCat === 'gold' ? formatBuyGoldProductLabel(l.product) : l.product;
        const itemRef = l.productCode ? ` [${l.productCode}]` : '';
        if (l.tx === 'trade') {
            const hasCustomerCustomBuy = l.customerCustomBuy !== undefined && String(l.customerCustomBuy).trim() !== '';
            const customerRate = normalizeTradeRate('gold', hasCustomerCustomBuy ? l.customerCustomBuy : (rates.gold?.[l.customerProduct]?.[1] || 0));
            const customerQty = getTradeOldGoldQuantity(l);
            const labor = getLineSellLaborAmount(l);
            const actualQty = getGoldLineEffectiveQuantity(l);
            const tradeDirection = getTradeQuantityDirection(l);
            const tradeCompQty = getTradeCompensationQuantity(l);
            const tradeCompUnitAmount = getTradeCompensationUnitAmount(l);
            const tradeCompAmount = getTradeCompensationAmount(l);
            const tradeAmount = getTradeNetAmount(l, rate, customerRate);
            const baseLeftQty = tradeDirection === 'old' ? customerQty : actualQty;
            const baseRightQty = tradeDirection === 'old' ? actualQty : customerQty;
            const baseRate = tradeDirection === 'old' ? customerRate : rate;
            const baseLabel = baseRightQty > 0
                ? `(${formatWeight(baseLeftQty)}-${formatWeight(baseRightQty)}) x ${fmtVN(baseRate)}`
                : `${formatWeight(baseLeftQty)} x ${fmtVN(baseRate)}`;
            const tradeNote = [
                labor > 0 ? ` | Cong: ${fmtVN(labor)}` : '',
                tradeCompAmount !== 0 ? ` | Bu ${tradeCompAmount > 0 ? '+' : '-'}: ${fmtVN(tradeCompUnitAmount)} x ${formatWeight(tradeCompQty)}` : '',
            ].join('');
            const oldGoldSegment = customerQty > 0
                ? ` - ${formatBuyGoldProductLabel(l.customerProduct)} ${fmtVN(customerRate)} x ${formatWeight(customerQty)}`
                : '';
            return `${sign}Vang moi ${l.product}${itemRef} ${fmtVN(rate)} x ${formatWeight(actualQty)}${oldGoldSegment} | Chenh lech: ${baseLabel}${tradeNote} = ${fmtVN(Math.abs(tradeAmount))}`;
        }
        if (l.tx === 'sell' && effectiveCat === 'gold') {
            const labor = parseFmt(l.sellLabor || 0);
            const addedGold = parseWeight(l.sellAddedGold || 0);
            const cutGold = parseWeight(l.sellCutGold || 0);
            const baseWeight = l.itemId
                ? (parseWeight(l.itemGoldWeight || 0) || 1)
                : parseWeight(l.qty || 0);
            const actualQty = Math.max(0, baseWeight + addedGold - cutGold);
            const detailParts = [];
            if (l.itemId) detailParts.push(`TL gốc: ${formatWeight(baseWeight)}`);
            if (labor > 0) detailParts.push(`Công: ${fmtVN(labor)}`);
            if (addedGold > 0) detailParts.push(`Thêm vàng: ${formatWeight(addedGold)}`);
            if (cutGold > 0) detailParts.push(`Cắt vàng: ${formatWeight(cutGold)}`);
            if (addedGold > 0 || cutGold > 0) detailParts.push(`KL thực: ${formatWeight(actualQty)}`);
            const weightNote = detailParts.length ? ` | ${detailParts.join(' | ')}` : '';
            return `${sign}${productLabel}${itemRef} ${fmtVN(rate)} x ${formatWeight(actualQty)}${weightNote} = ${fmtVN(l.value || 0)}`;
        }
        return `${sign}${productLabel}${itemRef} ${fmtVN(rate)} x ${l.qty} = ${fmtVN(l.value || 0)}`;
    }).join('\n') + `\nTOTAL: ${fmtVN(total)} VND`;

    const loadInventoryItems = useCallback(async () => {
        try {
            const response = await fetch(`${API}/api/items`);
            if (!response.ok) return [];
            const payload = await response.json();
            const nextItems = Array.isArray(payload) ? payload : [];
            setInventoryItems(nextItems);
            return nextItems;
        } catch {
            return [];
        }
    }, []);

    /* load refs + rates from backend */
    useEffect(() => {
        const load = async () => {
            try {
                const [nhomRes, quayRes, tuoiRes] = await Promise.all([
                    fetch(`${API}/api/nhom_hang`),
                    fetch(`${API}/api/quay_nho`),
                    fetch(`${API}/api/tuoi_vang`),
                ]);
                if (nhomRes.ok) setNhomHangList(await nhomRes.json());
                if (quayRes.ok) setQuayNhoList(await quayRes.json());
                if (tuoiRes.ok) {
                    const tuoiData = await tuoiRes.json();
                    const normalized = Array.isArray(tuoiData) ? tuoiData : [];
                    setTuoiVangList(normalized);
                    const gold = {};
                    normalized.forEach(item => {
                        if (item?.ten_tuoi) {
                            gold[item.ten_tuoi] = [
                                normalizeTradeRate('gold', item.gia_ban || 0),
                                normalizeTradeRate('gold', item.gia_mua ?? item.gia_ban ?? 0),
                            ];
                        }
                    });
                    if (Object.keys(gold).length > 0) {
                        setRates(prev => ({ ...prev, gold }));
                    }
                }
                await loadInventoryItems();
            } catch {
                return;
            }
        };
        load();
    }, [loadInventoryItems]);

    /* initial line */
    useEffect(() => {
        setLines([createDefaultLine(rates)]);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        setSavedDrafts(readSavedSales());
    }, []);

    useEffect(() => {
        const goldAgeProductValues = getGoldAgeProductValues(rates);
        setLines(prev => {
            if (!prev.length) return [createDefaultLine(rates)];
            return prev.map(line => {
                const availableProducts = line.cat === 'gold'
                    ? (line.tx === 'buy'
                        ? [...goldAgeProductValues, BUY_GOLD_OTHER_OPTION]
                        : goldAgeProductValues)
                    : Object.keys(rates[line.cat] || {});
                if (!availableProducts.length || availableProducts.includes(line.product)) return line;
                return { ...line, product: availableProducts[0] };
            });
        });
    }, [rates]);

    useEffect(() => {
        if (!draftMessage) return undefined;
        const timer = setTimeout(() => setDraftMessage(''), 2200);
        return () => clearTimeout(timer);
    }, [draftMessage]);

    useEffect(() => {
        if (!repairMessage) return undefined;
        const timer = setTimeout(() => setRepairMessage(''), 2600);
        return () => clearTimeout(timer);
    }, [repairMessage]);

    useEffect(() => {
        setNavMenuOpen(false);
    }, [screen]);

    /* load orders */
    const loadOrders = useCallback(async () => {
        try {
            const r = await fetch(`${API}/api/don_hang?today=1`);
            if (r.ok) setOrders(await r.json());
        } catch {
            return;
        }
    }, []);
    useEffect(() => { loadOrders(); }, [loadOrders]);

    const persistSavedDrafts = (drafts) => {
        if (typeof window !== 'undefined') {
            try {
                window.localStorage.setItem(SAVED_SALE_KEY, JSON.stringify(drafts));
            } catch {
                // ignore storage quota errors
            }
        }
        setSavedDrafts(drafts);
    };

    const deleteSavedDraft = useCallback((draftId) => {
        const nextDrafts = savedDrafts.filter(item => (item.id || item.orderId) !== draftId);
        persistSavedDrafts(nextDrafts);
    }, [savedDrafts]);

    const clearSavedDrafts = useCallback(() => {
        persistSavedDrafts([]);
    }, []);

    const saveDraft = () => {
        const draft = {
            id: orderId,
            orderId,
            savedAt: new Date().toISOString(),
            orderCreatedAt,
            total,
            formula,
            lines: lines.map(line => ({ ...line })),
            customerInfo: { ...customerInfo },
        };
        const nextDrafts = [draft, ...savedDrafts.filter(item => item.id !== draft.id)].slice(0, 30);
        persistSavedDrafts(nextDrafts);
        setDraftMessage('Đã lưu giao dịch tạm');
    };

    const loadSavedDraft = (draft) => {
        if (!draft || !Array.isArray(draft.lines) || !draft.lines.length) return;
        setLines(draft.lines.map((line, index) => ({
            ...sanitizeLineInventoryState(line),
            id: line.id || Date.now() + index,
        })));
        const nextCustomerInfo = { ...createEmptyCustomerInfo(), ...(draft.customerInfo || {}) };
        setCustomerInfo(nextCustomerInfo);
        setCustomerInfoOpen(hasCustomerInfo(nextCustomerInfo));
        setOrderId(draft.orderId || genOrderId());
        setOrderCreatedAt(formatOrderDateTimeForStorage(draft.orderCreatedAt || draft.savedAt || new Date()));
        deleteSavedDraft(draft.id || draft.orderId);
        setSavedModalOpen(false);
        setScreen('order');
        setDraftMessage(`Đã nạp ${draft.orderId || 'giao dịch lưu'}`);
    };

    const markSoldInventoryItems = useCallback(async (saleLines) => {
        const itemIds = [...new Set(
            (saleLines || [])
                .filter(line => INVENTORY_TXS.has(line?.tx) && line?.cat === 'gold' && line?.itemId)
                .map(line => line.itemId)
        )];
        if (!itemIds.length) return { updatedCount: 0, failedCount: 0 };

        const results = await Promise.allSettled(itemIds.map(async (itemId) => {
            const response = await fetch(`${API}/api/items/${itemId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: SOLD_STATUS }),
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(payload.error || `HTTP ${response.status}`);
            }
            return payload;
        }));

        await loadInventoryItems();
        return {
            updatedCount: results.filter(result => result.status === 'fulfilled').length,
            failedCount: results.filter(result => result.status === 'rejected').length,
        };
    }, [loadInventoryItems]);

    const handleResetOrderForm = useCallback(() => {
        setOrderId(genOrderId());
        setOrderCreatedAt(formatOrderDateTimeForStorage(new Date()));
        setLines([createDefaultLine(rates, { qty: '0' })]);
        setCustomerInfo(createEmptyCustomerInfo());
        setCustomerInfoOpen(false);
        setDraftMessage('');
    }, [rates]);

    const handleRepairSubmit = async () => {
        const selectedLines = repairLines.filter(line => line.itemId);
        if (!selectedLines.length) {
            alert('Chọn ít nhất 1 sản phẩm từ kho để tạo phiếu.');
            return;
        }
        if (repairMode === 'sua' && selectedLines.some(line => parseWeight(line.them_tl_vang) <= 0 && parseWeight(line.bot_tl_vang) <= 0)) {
            alert('Phiếu sửa cần nhập thêm hoặc bớt trọng lượng vàng cho từng sản phẩm đã chọn.');
            return;
        }

        setRepairLoading(true);
        try {
            const response = await fetch(`${API}/api/hang_sua_bo`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ma_phieu: repairId,
                    loai_xu_ly: repairMode,
                    ghi_chu: repairNote,
                    nguoi_tao: 'POS Mobile',
                    items: selectedLines.map(line => ({
                        item_id: line.itemId,
                        ma_hang: line.productCode,
                        ten_hang: line.itemName,
                        nhom_hang: line.nhom_hang,
                        quay_nho: line.quay_nho,
                        tuoi_vang: line.tuoi_vang,
                        status: line.status,
                        tl_vang_hien_tai: line.tl_vang_hien_tai,
                        them_tl_vang: repairMode === 'sua' ? (line.them_tl_vang || '') : '',
                        bot_tl_vang: repairMode === 'sua' ? (line.bot_tl_vang || '') : '',
                        ghi_chu: line.ghi_chu || '',
                    })),
                }),
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(payload.error || `HTTP ${response.status}`);
            }
            await loadInventoryItems();
            setRepairId(genRepairId());
            setRepairMode('sua');
            setRepairLines([createRepairLine()]);
            setRepairNote('');
            setRepairMessage(
                repairMode === 'sua'
                    ? `Đã tạo phiếu sửa ${payload.ma_phieu || repairId}.`
                    : `Đã tạo phiếu bỏ hàng ${payload.ma_phieu || repairId}.`
            );
        } catch (error) {
            alert(error.message || 'Không tạo được phiếu sửa/bỏ hàng.');
        } finally {
            setRepairLoading(false);
        }
    };

    const persistOrderToBackend = useCallback(async (payload = {}, options = {}) => {
        const nextCustomerInfo = {
            ...createEmptyCustomerInfo(),
            ...customerInfo,
            ...(options.customerInfoOverride || {}),
        };
        const rawTotal = Number.isFinite(Number(payload.totalRaw)) ? Number(payload.totalRaw) : Number(total || 0);
        const totalSign = rawTotal > 0 ? 1 : rawTotal < 0 ? -1 : 0;
        const cashValue = Math.max(
            0,
            Math.round(Math.abs(parseFmt(
                payload.cash ?? payload.cashRaw ?? payload.cashText ?? 0,
            ))),
        );
        const bankValue = Math.max(
            0,
            Math.round(Math.abs(parseFmt(
                payload.bank ?? payload.bankcashRaw ?? payload.bankcash ?? 0,
            ))),
        );
        const frontImageRef = nextCustomerInfo.frontImage.trim().startsWith('data:') ? '' : nextCustomerInfo.frontImage.trim();
        const backImageRef = nextCustomerInfo.backImage.trim().startsWith('data:') ? '' : nextCustomerInfo.backImage.trim();
        const customerName = nextCustomerInfo.name.trim() || payload.frombank || 'POS Customer';
        const contactAddress = nextCustomerInfo.address.trim() || nextCustomerInfo.residence.trim();
        const customerNote = [
            nextCustomerInfo.name.trim() ? `Khách hàng: ${nextCustomerInfo.name.trim()}` : '',
            nextCustomerInfo.cccd.trim() ? `CCCD: ${nextCustomerInfo.cccd.trim()}` : '',
            nextCustomerInfo.oldId.trim() ? `CMND cũ: ${nextCustomerInfo.oldId.trim()}` : '',
            nextCustomerInfo.dob.trim() ? `Ngày sinh: ${nextCustomerInfo.dob.trim()}` : '',
            nextCustomerInfo.gender.trim() ? `Giới tính: ${nextCustomerInfo.gender.trim()}` : '',
            nextCustomerInfo.nationality.trim() ? `Quốc tịch: ${nextCustomerInfo.nationality.trim()}` : '',
            nextCustomerInfo.origin.trim() ? `Quê quán: ${nextCustomerInfo.origin.trim()}` : '',
            nextCustomerInfo.residence.trim() ? `Thường trú: ${nextCustomerInfo.residence.trim()}` : '',
            nextCustomerInfo.issueDate.trim() ? `Ngày cấp CCCD: ${nextCustomerInfo.issueDate.trim()}` : '',
            nextCustomerInfo.expiry.trim() ? `Có giá trị đến: ${nextCustomerInfo.expiry.trim()}` : '',
            nextCustomerInfo.phone.trim() ? `SĐT: ${nextCustomerInfo.phone.trim()}` : '',
            nextCustomerInfo.address.trim() ? `Địa chỉ liên hệ: ${nextCustomerInfo.address.trim()}` : '',
            payload.companyBankLabel ? `Tài khoản công ty: ${payload.companyBankLabel}` : '',
            frontImageRef ? `Ảnh CCCD mặt trước: ${frontImageRef}` : '',
            backImageRef ? `Ảnh CCCD mặt sau: ${backImageRef}` : '',
            nextCustomerInfo.backText.trim() ? `OCR mặt sau:\n${nextCustomerInfo.backText.trim()}` : '',
        ].filter(Boolean);
        const requestBody = {
            ma_don: orderId,
            loai_don: options.orderType || resolveOrderTypeFromLines(lines),
            khach_hang: customerName,
            cccd: nextCustomerInfo.cccd.trim(),
            so_dien_thoai: nextCustomerInfo.phone.trim(),
            dia_chi_kh: contactAddress,
            dia_chi: contactAddress,
            ngay_dat: formatOrderDateTimeForStorage(options.orderDate || orderCreatedAt),
            tong_tien: Math.abs(Math.round(rawTotal)),
            dat_coc: cashValue,
            cash_payment: cashValue * totalSign,
            bank_payment: bankValue * totalSign,
            company_bank_account_id: payload.companyBankAccountId || '',
            company_bank_ledger_key: payload.companyBankLedgerKey || '',
            company_bank_account_no: payload.companyBankAccountNo || '',
            items: serializeOrderLines(lines),
            trang_thai: options.status || (options.finalize ? 'Đã ghi nhận POS' : 'Nháp POS'),
            ghi_chu: [...customerNote, payload.formula || formula, payload.note || options.note].filter(Boolean).join('\n').trim(),
            nguoi_tao: 'POS Mobile',
            apply_payment_bookings: Boolean(options.finalize),
        };
        if (options.documents !== undefined) {
            requestBody.chung_tu = options.documents;
        }
        if (options.financialInvoiceData !== undefined) {
            requestBody.hoa_don_tai_chinh = options.financialInvoiceData;
        }
        const response = await fetch(`${API}/api/don_hang`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(data.error || `HTTP ${response.status}`);
        }
        if (options.refreshOrders !== false) {
            await loadOrders();
        }
        return { data, customerInfoUsed: nextCustomerInfo, requestBody };
    }, [customerInfo, formula, lines, loadOrders, orderCreatedAt, orderId, total]);

    const ensureOrderPersisted = useCallback(async (payload = {}, options = {}) => {
        setLoading(true);
        try {
            return await persistOrderToBackend(payload, {
                ...options,
                refreshOrders: options.refreshOrders ?? false,
            });
        } catch (error) {
            if (!options.silent) {
                alert('Error: ' + error.message);
            }
            throw error;
        } finally {
            setLoading(false);
        }
    }, [persistOrderToBackend]);

    /* send order */
    const handleSend = async (payload, options = {}) => {
        const finalize = options.finalize !== false;
        const markSold = options.markSold !== undefined ? options.markSold : finalize;
        const preserveScreenOnFinalize = Boolean(options.preserveScreenOnFinalize);
        const preserveStateOnFinalize = Boolean(options.preserveStateOnFinalize);
        setLoading(true);
        try {
            const { data } = await persistOrderToBackend(payload, {
                ...options,
                finalize,
            });
            const soldUpdate = markSold ? await markSoldInventoryItems(lines) : { updatedCount: 0, failedCount: 0 };
            if (finalize) {
                if (!preserveStateOnFinalize) {
                    persistSavedDrafts(savedDrafts.filter(item => item.id !== orderId));
                    setOrderId(genOrderId());
                    setOrderCreatedAt(formatOrderDateTimeForStorage(new Date()));
                    setLines([createDefaultLine(rates)]);
                    setCustomerInfo(createEmptyCustomerInfo());
                    setCustomerInfoOpen(false);
                }
                if (!preserveScreenOnFinalize) {
                    setScreen('order');
                }
                if (soldUpdate.failedCount > 0) {
                    alert(`Đơn đã tạo xong nhưng còn ${soldUpdate.failedCount} sản phẩm chưa đổi sang trạng thái đã bán.`);
                }
            }
            return { data, soldUpdate };
        } catch (e) {
            if (!options.silent) {
                alert('Error: ' + e.message);
            }
            throw e;
        } finally {
            setLoading(false);
        }
    };

    /* settle */
    const handleSettle = async () => {
        setSettleLoading(true);
        // Closing day = local reset only (no dedicated backend endpoint yet)
        setTimeout(() => { setOrders([]); setSettleLoading(false); }, 800);
    };

    const openNavScreen = (nextScreen) => {
        if (nextScreen === 'order' && !lines.length) {
            setLines([createDefaultLine(rates)]);
        }
        if (nextScreen === 'repair' && !repairLines.length) {
            setRepairLines([createRepairLine()]);
        }
        setScreen(nextScreen);
    };

    const handleOpenPaymentScreen = useCallback(async () => {
        await ensureOrderPersisted({}, { refreshOrders: false });
        setScreen('payment');
    }, [ensureOrderPersisted]);

    const showFloatingMenu = screen === 'order' || screen === 'repair' || screen === 'inventory';
    return (
        <div className="sale-ui-root" style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', flexDirection: 'column', background: 'linear-gradient(180deg, #f8fcff 0%, #f1fbf3 42%, #dff1ff 100%)', fontFamily: UI_FONT }}>
            <style>{`
                .sale-ui-root,
                .sale-ui-root * {
                    font-family: ${UI_FONT} !important;
                }
                .sale-ui-root [data-sale-title="true"] {
                    font-family: ${UI_FONT} !important;
                }
                .sale-ui-root [data-sale-amount="true"],
                .sale-ui-root [data-sale-number="true"],
                .sale-ui-root input[type="number"],
                .sale-ui-root input[inputmode="numeric"],
                .sale-ui-root input[inputmode="decimal"] {
                    font-family: ${NUMBER_FONT} !important;
                    font-variant-numeric: tabular-nums;
                }
                .sale-ui-root input,
                .sale-ui-root textarea,
                .sale-ui-root button,
                .sale-ui-root select {
                    font-family: ${UI_FONT} !important;
                }
                .sale-ui-root input::placeholder,
                .sale-ui-root textarea::placeholder,
                .sale-pos-catalog-input::placeholder {
                    font-family: ${UI_FONT} !important;
                    color: #cbd5e1;
                    font-weight: 300;
                    font-size: 75%;
                    letter-spacing: 0;
                    opacity: 1;
                }
            `}</style>
            <SaleFloatingMenu
                show={showFloatingMenu}
                navMenuOpen={navMenuOpen}
                setNavMenuOpen={setNavMenuOpen}
                screen={screen}
                openNavScreen={openNavScreen}
                setSavedModalOpen={setSavedModalOpen}
                savedDrafts={savedDrafts}
            />
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', position: 'relative' }}>
                {screen === 'order' && (
                    <OrderScreen rates={rates} inventoryItems={inventoryItems} lines={lines} setLines={setLines}
                        total={total} formula={formula} orderId={orderId}
                        onNext={handleOpenPaymentScreen}
                        onEnsureOrder={ensureOrderPersisted}
                        onSaveDraft={saveDraft}
                        onResetForm={handleResetOrderForm}
                        draftMessage={draftMessage}
                        customerInfo={customerInfo}
                        setCustomerInfo={setCustomerInfo}
                        customerInfoOpen={customerInfoOpen}
                        setCustomerInfoOpen={setCustomerInfoOpen} />
                )}
                {screen === 'payment' && (
                    <PaymentScreen total={total} orderId={orderId} formula={formula}
                        lines={lines}
                        setLines={setLines}
                        rates={rates}
                        customerInfo={customerInfo}
                        setCustomerInfo={setCustomerInfo}
                        loading={loading}
                        onBack={() => setScreen('order')}
                        onSend={handleSend}
                        onEnsureOrder={ensureOrderPersisted} />
                )}
                {screen === 'repair' && (
                    <RepairJobScreen
                        inventoryItems={inventoryItems}
                        repairLines={repairLines}
                        setRepairLines={setRepairLines}
                        repairId={repairId}
                        repairMode={repairMode}
                        setRepairMode={setRepairMode}
                        repairNote={repairNote}
                        setRepairNote={setRepairNote}
                        repairMessage={repairMessage}
                        loading={repairLoading}
                        onSubmit={handleRepairSubmit}
                    />
                )}
                {screen === 'inventory' && (
                    <InventoryScreen
                        nhomHangList={nhomHangList}
                        quayNhoList={quayNhoList}
                        tuoiVangList={tuoiVangList}
                        onSaved={() => { loadInventoryItems(); loadOrders(); }}
                    />
                )}
                {screen === 'list' && (
                    <OrderListScreen orders={orders} settleLoading={settleLoading}
                        onClose={() => setScreen('order')}
                        onSettle={handleSettle} />
                )}
            </div>

            <SavedTransactionsModal
                open={savedModalOpen}
                drafts={savedDrafts}
                onClose={() => setSavedModalOpen(false)}
                onLoad={loadSavedDraft}
                onDeleteDraft={deleteSavedDraft}
                onDeleteAll={clearSavedDrafts}
            />
        </div>
    );
}
