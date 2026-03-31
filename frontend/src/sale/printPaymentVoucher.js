import { fmtCalc, formatBuyGoldProductLabel, formatWeight, normalizeTradeRate, parseFmt, parseWeight } from './shared';

const SALE_PAGE = {
    width: 1240,
    height: 1754,
    cssSize: 'A4 portrait',
    imageWidthMm: '190mm',
    imageMaxHeightMm: '277mm',
};
const BUY_PAGE = {
    width: 1748,
    height: 1240,
    cssSize: 'A5 landscape',
    imageWidthMm: '190mm',
    imageMaxHeightMm: '132mm',
};
const PADDING_X = 72;
const UI_FONT = "'Times New Roman', 'Be Vietnam Pro', serif";
const NUMBER_FONT = "'Roboto Condensed', 'Be Vietnam Pro', sans-serif";
const COMPANY_NAME = 'CONG TY TNHH VANG BAC DA QUY VAN KIM';
const COMPANY_TAX_CODE = '5800884170';
const BUY_APPROVER_NAME = 'LÊ THỊ MỸ HẠNH';
const BUY_VOUCHER_FALLBACK_CUSTOMER = {
    name: 'PHAN NGUYEN BUU',
    cccd: '056086010108',
    phone: '0968974186',
    address: 'Bảo Lộc',
    residence: 'Bảo Lộc',
    frontImage: '/mattruoc.jpg',
    backImage: '/matsau.jpg',
};

const moneyText = (value) => fmtCalc(Math.round(Math.abs(Number(value || 0))));
const safeText = (value, fallback = '') => {
    const text = String(value ?? '').trim();
    return text || fallback;
};
const formatBuyProductName = (product) => safeText(formatBuyGoldProductLabel(product), 'Dẻ khác');
const getTradeNewGoldQuantity = (line) => {
    const qty = parseWeight(line?.qty || 0);
    const itemGoldWeight = parseWeight(line?.itemGoldWeight || 0);
    const addGold = parseWeight(line?.sellAddedGold || 0);
    const cutGold = parseWeight(line?.sellCutGold || 0);
    const baseGoldQty = line?.itemId ? (itemGoldWeight || 1) : qty;
    return Math.max(0, baseGoldQty + addGold - cutGold);
};
const getTradeOldGoldQuantity = (line) => Math.max(0, parseWeight(line?.customerQty || 0));
const HEX10_MOD = 0x10000000000n;
const hashTextToBigInt = (value) => {
    let hash = 0n;
    const source = String(value || '');
    for (let index = 0; index < source.length; index += 1) {
        hash = (hash * 131n + BigInt(source.charCodeAt(index))) % HEX10_MOD;
    }
    return hash;
};
const buildSyntheticEasyInvoiceCode = ({ orderId, line, index }) => {
    const timestampSeed = BigInt(Date.now());
    const lineSeed = hashTextToBigInt([
        orderId,
        line?.id,
        line?.product,
        line?.customerProduct,
        line?.qty,
        index,
    ].join('|'));
    return ((timestampSeed + lineSeed) % HEX10_MOD).toString(16).toUpperCase().padStart(10, '0');
};
const wrapText = (ctx, text, width, maxLines = 3, font = `34px ${UI_FONT}`) => {
    ctx.save();
    ctx.font = font;
    const source = safeText(text);
    if (!source) {
        ctx.restore();
        return [''];
    }
    const words = source.split(/\s+/);
    const lines = [];
    let current = '';
    for (const word of words) {
        const attempt = current ? `${current} ${word}` : word;
        if (ctx.measureText(attempt).width <= width) {
            current = attempt;
            continue;
        }
        if (current) lines.push(current);
        current = word;
        if (lines.length >= maxLines - 1) break;
    }
    if (current) lines.push(current);
    ctx.restore();
    return lines.slice(0, maxLines);
};
const drawTextLine = (ctx, text, x, y, width, align = 'left', font = `34px ${UI_FONT}`, color = '#111827') => {
    ctx.save();
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textBaseline = 'middle';
    ctx.textAlign = align;
    const px = align === 'right' ? x + width : align === 'center' ? x + width / 2 : x;
    ctx.fillText(text, px, y);
    ctx.restore();
};
const fitColumnWidths = (totalWidth, baseWidths) => {
    const sum = baseWidths.reduce((acc, width) => acc + width, 0) || 1;
    const widths = baseWidths.map((width, index) => {
        if (index === baseWidths.length - 1) return 0;
        return Math.round((width / sum) * totalWidth);
    });
    widths[widths.length - 1] = totalWidth - widths.slice(0, -1).reduce((acc, width) => acc + width, 0);
    return widths;
};
const normalizeDataUrl = (value) => {
    const text = String(value || '').trim();
    if (!text) return '';
    if (text.startsWith('data:image/')) return text;
    if (text.startsWith('/')) return text;
    return '';
};
const resolveBuyVoucherCustomerInfo = (customerInfo = {}) => ({
    ...customerInfo,
    name: safeText(customerInfo?.name, BUY_VOUCHER_FALLBACK_CUSTOMER.name),
    cccd: safeText(customerInfo?.cccd, BUY_VOUCHER_FALLBACK_CUSTOMER.cccd),
    phone: safeText(customerInfo?.phone, BUY_VOUCHER_FALLBACK_CUSTOMER.phone),
    address: safeText(customerInfo?.address || customerInfo?.residence, BUY_VOUCHER_FALLBACK_CUSTOMER.address),
    residence: safeText(customerInfo?.residence || customerInfo?.address, BUY_VOUCHER_FALLBACK_CUSTOMER.residence),
    frontImage: normalizeDataUrl(customerInfo?.frontImage) || BUY_VOUCHER_FALLBACK_CUSTOMER.frontImage,
    backImage: normalizeDataUrl(customerInfo?.backImage) || BUY_VOUCHER_FALLBACK_CUSTOMER.backImage,
});
const loadImage = (src) => new Promise((resolve) => {
    const normalized = normalizeDataUrl(src);
    if (!normalized || typeof Image === 'undefined') {
        resolve(null);
        return;
    }
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = normalized;
});
const drawContainedImage = (ctx, image, x, y, width, height) => {
    if (!image) return;
    const safeX = x + 10;
    const safeY = y + 10;
    const safeWidth = width - 20;
    const safeHeight = height - 20;
    const scale = Math.min(safeWidth / image.width, safeHeight / image.height);
    const drawWidth = image.width * scale;
    const drawHeight = image.height * scale;
    const drawX = safeX + (safeWidth - drawWidth) / 2;
    const drawY = safeY + (safeHeight - drawHeight) / 2;
    ctx.save();
    ctx.beginPath();
    ctx.rect(safeX, safeY, safeWidth, safeHeight);
    ctx.clip();
    ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
    ctx.restore();
};
const drawIdentityBox = (ctx, image, x, y, width, height, label) => {
    drawTextLine(ctx, label, x, y - 18, width, 'left', `700 24px ${UI_FONT}`);
    ctx.save();
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 1.3;
    ctx.strokeRect(x, y, width, height);
    ctx.restore();
    if (image) {
        drawContainedImage(ctx, image, x, y, width, height);
        return;
    }
    drawTextLine(ctx, label, x, y + height / 2, width, 'center', `400 24px ${UI_FONT}`, '#64748b');
};
const padLeft = (value, width) => String(value || '').padStart(width, '0');
const toWordsUnderOneThousand = (num) => {
    const digits = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
    const hundred = Math.floor(num / 100);
    const ten = Math.floor((num % 100) / 10);
    const unit = num % 10;
    const parts = [];

    if (hundred > 0) {
        parts.push(digits[hundred], 'trăm');
    }
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
    if (ten === 0 && unit > 0) {
        if (hundred > 0) parts.push('linh');
        if (unit === 5 && hundred > 0) parts.push('năm');
        else parts.push(digits[unit]);
    }
    return parts.join(' ');
};
const moneyToVietnamese = (value) => {
    let amount = Math.round(Math.abs(Number(value || 0)));
    if (!amount) return 'Không đồng';
    const units = ['', 'nghìn', 'triệu', 'tỷ'];
    const groups = [];
    while (amount > 0) {
        groups.push(amount % 1000);
        amount = Math.floor(amount / 1000);
    }
    const parts = [];
    for (let index = groups.length - 1; index >= 0; index -= 1) {
        const group = groups[index];
        if (!group) continue;
        const text = toWordsUnderOneThousand(group);
        if (text) {
            parts.push(text);
            if (units[index]) parts.push(units[index]);
        }
    }
    const sentence = parts.join(' ').replace(/\s+/g, ' ').trim();
    return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)} đồng`;
};

const getSaleVoucherRows = (lines, rates) => {
    const rows = [];
    let offsetAmount = 0;

    lines.forEach((line, index) => {
        const effectiveCat = line.tx === 'trade' ? 'gold' : line.cat;
        const rate = rates?.[effectiveCat]?.[line.product] || [0, 0];
        const sellRate = normalizeTradeRate(effectiveCat, line.customSell !== undefined ? line.customSell : rate[0]);
        const buyRate = normalizeTradeRate(effectiveCat, line.customBuy !== undefined ? line.customBuy : rate[1]);
        const tradeRate = normalizeTradeRate(effectiveCat, line.customTrade !== undefined ? line.customTrade : rate[0]);
        const customerRate = normalizeTradeRate(
            'gold',
            line.customerCustomBuy !== undefined && String(line.customerCustomBuy).trim() !== ''
                ? line.customerCustomBuy
                : (rates?.gold?.[line.customerProduct || '']?.[1] || 0),
        );
        const qty = parseFmt(line.qty);
        const itemGoldWeight = parseWeight(line.itemGoldWeight || 0);
        const addGold = parseWeight(line.sellAddedGold || 0);
        const cutGold = parseWeight(line.sellCutGold || 0);
        const labor = Math.max(0, parseFmt(line.sellLabor || 0));
        const baseGoldQty = line.itemId ? (itemGoldWeight || 1) : qty;
        const actualGoldQty = Math.max(0, baseGoldQty + addGold - cutGold);
        const codeText = safeText(line.productCode || `MH-${index + 1}`);

        if (line.tx === 'sell') {
            const amount = Math.round(actualGoldQty * sellRate + labor);
            rows.push({
                stt: rows.length + 1,
                name: safeText(line.itemName || line.product || 'Vàng mới'),
                code: codeText,
                unit: 'chi',
                qty: formatWeight(actualGoldQty),
                price: moneyText(sellRate),
                amount,
            });
            return;
        }

        if (line.tx === 'buy') {
            const amount = Math.round(qty * buyRate);
            rows.push({
                stt: rows.length + 1,
                name: formatBuyProductName(line.product),
                code: codeText,
                unit: 'chi',
                qty: formatWeight(qty),
                price: moneyText(buyRate),
                amount,
            });
            return;
        }

        if (line.tx === 'trade') {
            const tradeNewGoldQty = getTradeNewGoldQuantity(line);
            const newAmount = Math.round(tradeNewGoldQty * tradeRate + labor);
            rows.push({
                stt: rows.length + 1,
                name: safeText(line.itemName || `Vàng mới ${line.product || ''}`),
                code: codeText,
                unit: 'chi',
                qty: formatWeight(tradeNewGoldQty),
                price: moneyText(tradeRate),
                amount: newAmount,
            });

            const customerQty = getTradeOldGoldQuantity(line);
            const customerAmount = Math.round(customerQty * customerRate);
            if (customerAmount > 0) {
                offsetAmount += customerAmount;
                rows.push({
                    stt: rows.length + 1,
                    name: formatBuyProductName(line.customerProduct),
                    code: '',
                    unit: 'chi',
                    qty: formatWeight(customerQty),
                    price: moneyText(customerRate),
                    amount: -customerAmount,
                });
            }

            const compensation = Math.max(0, parseFmt(line.tradeComp || 0));
            if (compensation > 0) {
                rows.push({
                    stt: rows.length + 1,
                    name: 'Bù',
                    code: '',
                    unit: 'đồng',
                    qty: '1',
                    price: moneyText(compensation),
                    amount: compensation,
                });
            }
        }
    });

    return { rows, offsetAmount };
};
const hasBuyVoucherRows = (lines) => (lines || []).some((line) => {
    if (!line) return false;
    if (line.tx === 'buy' && line.cat === 'gold') return parseWeight(line.qty || 0) > 0;
    if (line.tx === 'trade') return getTradeOldGoldQuantity(line) > 0;
    return false;
});
const getBuyVoucherRows = (lines, rates) => {
    const groupedRows = [];
    const groupedMap = new Map();
    let offsetAmount = 0;

    const appendGroup = (product, qty, rate) => {
        const safeQty = Math.max(0, Number(qty || 0));
        const safeRate = Math.max(0, Math.round(Number(rate || 0)));
        if (!safeQty || !safeRate) return;
        const key = `${safeText(product, 'Khác')}__${safeRate}`;
        const amount = Math.round(safeQty * safeRate);
        if (!groupedMap.has(key)) {
            const row = {
                stt: groupedRows.length + 1,
                name: formatBuyProductName(product),
                unit: 'chi',
                qtyValue: 0,
                priceValue: safeRate,
                amountValue: 0,
            };
            groupedMap.set(key, row);
            groupedRows.push(row);
        }
        const row = groupedMap.get(key);
        row.qtyValue += safeQty;
        row.amountValue += amount;
    };

    (lines || []).forEach((line) => {
        if (!line) return;
        if (line.tx === 'buy' && line.cat === 'gold') {
            const ratePair = rates?.gold?.[line.product] || [0, 0];
            const buyRate = normalizeTradeRate('gold', line.customBuy !== undefined ? line.customBuy : ratePair[1]);
            appendGroup(line.product, parseWeight(line.qty || 0), buyRate);
            return;
        }
        if (line.tx === 'trade') {
            const customerRate = normalizeTradeRate(
                'gold',
                line.customerCustomBuy !== undefined && String(line.customerCustomBuy).trim() !== ''
                    ? line.customerCustomBuy
                    : (rates?.gold?.[line.customerProduct || '']?.[1] || 0),
            );
            const customerQty = getTradeOldGoldQuantity(line);
            appendGroup(line.customerProduct, customerQty, customerRate);
            offsetAmount += Math.round(customerQty * customerRate);
        }
    });

    const rows = groupedRows.map((row, index) => ({
        stt: index + 1,
        name: row.name,
        unit: row.unit,
        qty: formatWeight(row.qtyValue),
        price: moneyText(row.priceValue),
        amount: Math.round(row.amountValue),
    }));
    const totalAmount = rows.reduce((sum, row) => sum + Math.round(Number(row.amount || 0)), 0);

    return {
        rows,
        offsetAmount: Math.round(offsetAmount),
        totalAmount,
    };
};

const buildSaleVoucherModel = ({ orderId, total, customerInfo, lines, rates, settlement }) => {
    const { rows, offsetAmount } = getSaleVoucherRows(lines, rates);
    if (!rows.length) throw new Error('Chưa có nội dung để in bill.');
    const isReceive = Number(total || 0) >= 0;
    const today = new Date();
    const note = safeText(settlement?.note, settlement?.paymentMethod || '');
    return {
        mode: 'sale',
        page: SALE_PAGE,
        orderId: safeText(orderId, 'PHIEU-TAM'),
        serialNo: safeText(String(orderId || '').split('-').pop(), padLeft(rows.length, 2)),
        createdAt: today,
        title: isReceive ? 'PHIẾU KÊ BÁN HÀNG' : 'PHIẾU KÊ MUA HÀNG',
        buyerName: isReceive ? safeText(customerInfo?.name, 'Khách lẻ') : COMPANY_NAME,
        sellerName: isReceive ? COMPANY_NAME : safeText(customerInfo?.name, 'Khách lẻ'),
        cccd: safeText(customerInfo?.cccd),
        issueDate: safeText(customerInfo?.issueDate),
        phone: safeText(customerInfo?.phone),
        address: safeText(customerInfo?.address || customerInfo?.residence),
        rows,
        totalAmount: Math.abs(Math.round(Number(total || 0))),
        totalInWords: moneyToVietnamese(total),
        paymentNote: note,
        bankAmount: Math.max(0, Math.round(Number(settlement?.bank || 0))),
        offsetAmount: Math.max(0, offsetAmount),
    };
};
const buildBuyVoucherModel = ({ orderId, customerInfo, lines, rates, settlement, serialNoOverride }) => {
    const { rows, offsetAmount, totalAmount } = getBuyVoucherRows(lines, rates);
    if (!rows.length) throw new Error('Chưa có mua dẻ hoặc đổi dẻ để xuất bill mua.');
    const today = new Date();
    const note = safeText(settlement?.note, settlement?.paymentMethod || '');
    const resolvedCustomerInfo = resolveBuyVoucherCustomerInfo(customerInfo);
    return {
        mode: 'buy',
        page: BUY_PAGE,
        orderId: safeText(orderId, 'PHIEU-TAM'),
        serialNo: safeText(serialNoOverride, safeText(String(orderId || '').split('-').pop(), padLeft(rows.length, 2))),
        createdAt: today,
        title: 'PHIẾU KÊ MUA HÀNG',
        buyerName: BUY_APPROVER_NAME,
        approverName: BUY_APPROVER_NAME,
        sellerName: safeText(resolvedCustomerInfo?.name, 'Khách lẻ'),
        cccd: safeText(resolvedCustomerInfo?.cccd),
        issueDate: safeText(resolvedCustomerInfo?.issueDate),
        phone: safeText(resolvedCustomerInfo?.phone),
        address: safeText(resolvedCustomerInfo?.address || resolvedCustomerInfo?.residence),
        rows,
        totalAmount,
        totalInWords: moneyToVietnamese(totalAmount),
        paymentNote: note,
        bankAmount: Math.max(0, Math.round(Number(settlement?.bank || 0))),
        offsetAmount: Math.max(0, offsetAmount),
        frontImage: normalizeDataUrl(resolvedCustomerInfo?.frontImage),
        backImage: normalizeDataUrl(resolvedCustomerInfo?.backImage),
    };
};
const buildVoucherModel = ({ orderId, total, customerInfo, lines, rates, settlement, serialNoOverride, modeOverride }) => {
    if (modeOverride === 'buy') {
        return buildBuyVoucherModel({ orderId, customerInfo, lines, rates, settlement, serialNoOverride });
    }
    if (modeOverride === 'sale') {
        return buildSaleVoucherModel({ orderId, total, customerInfo, lines, rates, settlement });
    }
    return Number(total || 0) < 0 && hasBuyVoucherRows(lines)
        ? buildBuyVoucherModel({ orderId, customerInfo, lines, rates, settlement, serialNoOverride })
        : buildSaleVoucherModel({ orderId, total, customerInfo, lines, rates, settlement });
};

const resolvePaymentMethodText = (settlement) => {
    const cash = Math.max(0, Math.round(Number(settlement?.cash || 0)));
    const bank = Math.max(0, Math.round(Number(settlement?.bank || 0)));
    if (cash > 0 && bank > 0) return 'Tiền mặt/Chuyển khoản';
    if (bank > 0) return 'Chuyển khoản';
    if (cash > 0) return 'Tiền mặt';
    return 'Không thu tiền';
};
const currentDateText = () => {
    const today = new Date();
    return `${padLeft(today.getDate(), 2)}/${padLeft(today.getMonth() + 1, 2)}/${today.getFullYear()}`;
};
const EASYINVOICE_VAT_RATE = 0;

const sanitizeEasyInvoiceName = (value, fallback = '') => {
    const raw = safeText(value, fallback);
    const cleaned = raw
        .replace(/\btem\b/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return cleaned || safeText(fallback);
};
const normalizeEasyInvoiceQuantity = (value) => {
    const amount = Number(String(value ?? 0).replace(/,/g, '.'));
    if (!Number.isFinite(amount) || amount <= 0) return 0;
    return Number(amount.toFixed(4));
};
const isSyntheticEasyInvoiceLine = (line) => {
    if (!line || !['sell', 'trade'].includes(line.tx)) return false;
    const effectiveCat = line.tx === 'trade' ? 'gold' : line.cat;
    if (effectiveCat !== 'gold') return false;
    if (line.itemId || safeText(line.productCode)) return false;
    return (line.tx === 'trade' ? getTradeNewGoldQuantity(line) : parseWeight(line.qty || 0)) > 0 && Boolean(safeText(line.product));
};
const isEasyInvoiceTaggedLine = (line) => Boolean(line && (line.itemId || safeText(line.productCode) || isSyntheticEasyInvoiceLine(line)));
const createEasyInvoiceDraft = ({ orderId, customerInfo, lines, rates }) => {
    const items = [];

    (lines || []).forEach((line, index) => {
        if (!line || !['sell', 'trade'].includes(line.tx) || !isEasyInvoiceTaggedLine(line)) return;

        const effectiveCat = line.tx === 'trade' ? 'gold' : line.cat;
        if (effectiveCat !== 'gold') return;

        const rate = rates?.[effectiveCat]?.[line.product] || [0, 0];
        const componentPrice = normalizeTradeRate(
            effectiveCat,
            line.tx === 'trade'
                ? (line.customTrade !== undefined ? line.customTrade : rate[0])
                : (line.customSell !== undefined ? line.customSell : rate[0]),
        );
        const itemGoldWeight = parseWeight(line.itemGoldWeight || 0);
        const qty = parseWeight(line.qty || 0);
        const addGold = parseWeight(line.sellAddedGold || 0);
        const cutGold = parseWeight(line.sellCutGold || 0);
        const baseGoldQty = line.itemId ? (itemGoldWeight || 1) : qty;
        const quantity = normalizeEasyInvoiceQuantity(line.tx === 'trade' ? getTradeNewGoldQuantity(line) : Math.max(0, baseGoldQty + addGold - cutGold));
        if (!quantity) return;

        const labor = Math.max(0, parseFmt(line.sellLabor || 0));
        const resolvedCode = safeText(line.productCode, buildSyntheticEasyInvoiceCode({ orderId, line, index }));
        items.push({
            key: String(line.id || `${index + 1}`),
            lineId: line.id ?? null,
            manual: false,
            code: resolvedCode,
            name: sanitizeEasyInvoiceName(line.itemName || line.product || 'Sản phẩm', 'Sản phẩm'),
            unit: 'chi',
            quantity,
            quantityText: formatWeight(quantity),
            componentPrice: Math.max(0, Math.round(componentPrice)),
            labor,
            total: Math.round(quantity * componentPrice + labor),
        });
    });

    return {
        orderId,
        customer: {
            code: safeText(customerInfo?.cccd || customerInfo?.phone || orderId, orderId),
            name: safeText(customerInfo?.name, 'Khách lẻ'),
            address: safeText(customerInfo?.address || customerInfo?.residence),
            phone: safeText(customerInfo?.phone),
            origin: safeText(customerInfo?.origin),
            cccd: safeText(customerInfo?.cccd),
            taxCode: safeText(customerInfo?.taxCode),
            email: safeText(customerInfo?.email),
            emailCc: safeText(customerInfo?.emailCc),
            bankName: safeText(customerInfo?.bankName),
            bankNo: safeText(customerInfo?.bankNo),
        },
        invoice: {
            paymentMethod: '',
            arisingDate: currentDateText(),
            currencyUnit: 'VND',
            exchangeRate: '1',
            note: '',
        },
        items,
    };
};

const buildEasyInvoicePayload = ({ orderId, customerInfo, lines, rates, settlement, easyInvoiceDraft }) => {
    const baseDraft = createEasyInvoiceDraft({ orderId, customerInfo, lines, rates });
    const draft = easyInvoiceDraft && typeof easyInvoiceDraft === 'object'
        ? {
            ...baseDraft,
            ...easyInvoiceDraft,
            customer: {
                ...baseDraft.customer,
                ...(easyInvoiceDraft.customer || {}),
            },
            invoice: {
                ...(baseDraft.invoice || {}),
                ...(easyInvoiceDraft.invoice || {}),
            },
            items: Array.isArray(easyInvoiceDraft.items) ? easyInvoiceDraft.items : baseDraft.items,
        }
        : baseDraft;

    const draftItems = (draft.items || [])
        .map((item, index) => {
            const quantity = normalizeEasyInvoiceQuantity(item?.quantity);
            const componentPrice = Math.max(0, Math.round(parseFmt(item?.componentPrice || 0)));
            const labor = Math.max(0, Math.round(parseFmt(item?.labor || 0)));
            return {
                key: safeText(item?.key || item?.lineId || item?.code || `${index + 1}`, `${index + 1}`),
                code: safeText(item?.code || `ITEM-${index + 1}`, `ITEM-${index + 1}`),
                name: sanitizeEasyInvoiceName(item?.name || `Sản phẩm ${index + 1}`, `Sản phẩm ${index + 1}`),
                unit: safeText(item?.unit, 'chi'),
                quantity,
                componentPrice,
                labor,
            };
        })
        .filter(item => item.quantity > 0);

    if (!draftItems.length) {
        throw new Error('Chưa có sản phẩm có tem để xuất EasyInvoice.');
    }

    const items = [];
    draftItems.forEach((row) => {
        const productAmount = Math.round(row.quantity * row.componentPrice);
        if (productAmount > 0) {
            items.push({
                code: row.code,
                no: items.length + 1,
                feature: 1,
                name: row.name,
                unit: 'chi',
                quantity: row.quantity,
                price: row.componentPrice,
                total: productAmount,
                vatRate: EASYINVOICE_VAT_RATE,
                vatAmount: 0,
                amount: productAmount,
                extra: {
                    Pos: String(items.length + 1),
                    lineKey: row.key,
                    lineType: 'product',
                },
            });
        }
        if (row.labor > 0) {
            items.push({
                code: `${row.code}-CONG`,
                no: items.length + 1,
                feature: 1,
                name: `${row.name} - Tiền công`,
                unit: 'lần',
                quantity: 1,
                price: row.labor,
                total: row.labor,
                vatRate: EASYINVOICE_VAT_RATE,
                vatAmount: 0,
                amount: row.labor,
                extra: {
                    Pos: String(items.length + 1),
                    lineKey: row.key,
                    lineType: 'labor',
                },
            });
        }
    });

    if (!items.length) {
        throw new Error('Chưa có giá trị sản phẩm để xuất EasyInvoice.');
    }

    const payable = items.reduce((sum, item) => sum + Math.round(item.total || 0), 0);
    if (payable <= 0) {
        throw new Error('Hóa đơn đỏ EasyInvoice hiện chỉ áp dụng cho giao dịch khách trả.');
    }

    const totalBeforeTax = items
        .filter(item => item.feature !== 3)
        .reduce((sum, item) => sum + item.total, 0);
    const discountAmount = items
        .filter(item => item.feature === 3)
        .reduce((sum, item) => sum + item.total, 0);
    const invoiceCustomer = draft.customer || {};
    const invoiceMeta = draft.invoice || {};

    return {
        orderId,
        customer: {
            code: safeText(invoiceCustomer?.code || invoiceCustomer?.cccd || invoiceCustomer?.phone || orderId, orderId),
            buyer: safeText(invoiceCustomer?.name, 'Khách lẻ'),
            name: safeText(invoiceCustomer?.name, 'Khách lẻ'),
            address: safeText(invoiceCustomer?.address),
            phone: safeText(invoiceCustomer?.phone),
            identification: safeText(invoiceCustomer?.cccd),
            taxCode: safeText(invoiceCustomer?.taxCode),
            email: safeText(invoiceCustomer?.email),
            emailCc: safeText(invoiceCustomer?.emailCc),
            bankName: safeText(invoiceCustomer?.bankName),
            bankNo: safeText(invoiceCustomer?.bankNo),
        },
        invoice: {
            currencyUnit: safeText(invoiceMeta?.currencyUnit, 'VND'),
            paymentMethod: safeText(invoiceMeta?.paymentMethod, resolvePaymentMethodText(settlement)),
            arisingDate: safeText(invoiceMeta?.arisingDate, currentDateText()),
            exchangeRate: safeText(invoiceMeta?.exchangeRate, '1'),
            total: totalBeforeTax,
            discountAmount,
            vatRate: EASYINVOICE_VAT_RATE,
            vatAmount: 0,
            amount: payable,
            amountInWords: safeText(invoiceMeta?.amountInWords, moneyToVietnamese(payable)),
            items,
            extra: {
                orderId,
                note: safeText(invoiceMeta?.note, settlement?.note),
            },
        },
    };
};

const drawSaleVoucher = (ctx, model) => {
    const pageWidth = model.page.width;
    const pageHeight = model.page.height;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, pageWidth, pageHeight);
    ctx.fillStyle = '#111827';

    let y = 84;
    drawTextLine(ctx, COMPANY_NAME, PADDING_X, y, 760, 'left', `700 28px ${UI_FONT}`);
    y += 40;
    drawTextLine(ctx, `MST: ${COMPANY_TAX_CODE}`, PADDING_X, y, 320, 'left', `700 26px ${UI_FONT}`);

    drawTextLine(ctx, model.title, 0, 150, pageWidth, 'center', `700 56px ${UI_FONT}`);
    drawTextLine(ctx, `Ngày ${model.createdAt.getDate()} tháng ${model.createdAt.getMonth() + 1} năm ${model.createdAt.getFullYear()}`, 0, 196, pageWidth, 'center', `400 30px ${UI_FONT}`);
    drawTextLine(ctx, `Số: ${model.serialNo}`, pageWidth - 320, 170, 220, 'left', `400 30px ${UI_FONT}`);

    y = 258;
    const metaFont = `400 25px ${UI_FONT}`;
    drawTextLine(ctx, `- Họ tên người mua: ${model.buyerName}`, PADDING_X, y, 820, 'left', metaFont);
    y += 44;
    drawTextLine(ctx, `- Họ tên người bán: ${model.sellerName}`, PADDING_X, y, 520, 'left', metaFont);
    drawTextLine(ctx, `Địa chỉ: ${model.address || '........................................'}`, PADDING_X + 560, y, 560, 'left', metaFont);
    y += 44;
    drawTextLine(ctx, `- Số CCCD: ${model.cccd || '........................................'}`, PADDING_X, y, 420, 'left', metaFont);
    drawTextLine(ctx, `Ngày cấp: ${model.issueDate || '........../........../..........'}`, PADDING_X + 500, y, 280, 'left', metaFont);
    drawTextLine(ctx, `Số điện thoại: ${model.phone || '..........................'}`, PADDING_X + 800, y, 320, 'left', metaFont);

    const tableTop = 354;
    const tableLeft = PADDING_X;
    const tableWidth = pageWidth - PADDING_X * 2;
    const columnWidths = fitColumnWidths(tableWidth, [90, 430, 110, 140, 150, 200]);
    const columnXs = [
        tableLeft,
        tableLeft + columnWidths[0],
        tableLeft + columnWidths[0] + columnWidths[1],
        tableLeft + columnWidths[0] + columnWidths[1] + columnWidths[2],
        tableLeft + columnWidths[0] + columnWidths[1] + columnWidths[2] + columnWidths[3],
        tableLeft + columnWidths[0] + columnWidths[1] + columnWidths[2] + columnWidths[3] + columnWidths[4],
    ];
    const headerHeight = 72;
    const rowHeight = 58;
    const visibleRows = Math.max(model.rows.length, 3);

    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 1.3;
    ctx.strokeRect(tableLeft, tableTop, tableWidth, headerHeight + rowHeight * (visibleRows + 1));
    columnXs.slice(1).forEach((x) => {
        ctx.beginPath();
        ctx.moveTo(x, tableTop);
        ctx.lineTo(x, tableTop + headerHeight + rowHeight * (visibleRows + 1));
        ctx.stroke();
    });
    ctx.beginPath();
    ctx.moveTo(tableLeft, tableTop + headerHeight);
    ctx.lineTo(tableLeft + tableWidth, tableTop + headerHeight);
    ctx.stroke();
    for (let index = 0; index < visibleRows; index += 1) {
        const lineY = tableTop + headerHeight + rowHeight * (index + 1);
        ctx.beginPath();
        ctx.moveTo(tableLeft, lineY);
        ctx.lineTo(tableLeft + tableWidth, lineY);
        ctx.stroke();
    }

    const headers = ['STT', 'Tên, quy cách, phẩm chất\nhàng hóa (vật tư, sản phẩm)', 'ĐVT', 'Số lượng', 'Đơn giá', 'Thành tiền'];
    headers.forEach((header, index) => {
        const cx = columnXs[index];
        const width = columnWidths[index];
        const headerLines = header.split('\n');
        headerLines.forEach((line, lineIndex) => {
            drawTextLine(ctx, line, cx, tableTop + 24 + lineIndex * 24, width, 'center', `700 25px ${UI_FONT}`);
        });
    });

    model.rows.forEach((row, index) => {
        const rowTop = tableTop + headerHeight + rowHeight * index;
        const rowFont = `400 24px ${UI_FONT}`;
        drawTextLine(ctx, String(row.stt), columnXs[0], rowTop + rowHeight / 2, columnWidths[0], 'center', rowFont);
        const nameLines = wrapText(ctx, row.code ? `${row.name} (${row.code})` : row.name, columnWidths[1] - 16, 2, rowFont);
        nameLines.forEach((line, lineIndex) => {
            drawTextLine(ctx, line, columnXs[1] + 8, rowTop + 18 + lineIndex * 20, columnWidths[1] - 16, 'left', rowFont);
        });
        drawTextLine(ctx, row.unit, columnXs[2], rowTop + rowHeight / 2, columnWidths[2], 'center', rowFont);
        drawTextLine(ctx, row.qty, columnXs[3], rowTop + rowHeight / 2, columnWidths[3], 'center', `400 26px ${NUMBER_FONT}`);
        drawTextLine(ctx, row.price, columnXs[4], rowTop + rowHeight / 2, columnWidths[4], 'center', `400 26px ${NUMBER_FONT}`);
        drawTextLine(
            ctx,
            row.amount < 0 ? `(${moneyText(row.amount)})` : moneyText(row.amount),
            columnXs[5] + 8,
            rowTop + rowHeight / 2,
            columnWidths[5] - 16,
            'right',
            `400 30px ${NUMBER_FONT}`,
        );
    });

    const totalRowTop = tableTop + headerHeight + rowHeight * visibleRows;
    drawTextLine(
        ctx,
        'Cộng',
        columnXs[0],
        totalRowTop + rowHeight / 2,
        columnWidths[0] + columnWidths[1] + columnWidths[2] + columnWidths[3] + columnWidths[4],
        'center',
        `700 30px ${UI_FONT}`,
    );
    drawTextLine(ctx, moneyText(model.totalAmount), columnXs[5] + 8, totalRowTop + rowHeight / 2, columnWidths[5] - 16, 'right', `700 32px ${NUMBER_FONT}`);

    y = totalRowTop + rowHeight + 60;
    drawTextLine(ctx, `- Tổng số tiền bằng chữ: ${model.totalInWords}`, PADDING_X, y, 1080, 'left', `400 30px ${UI_FONT}`);
    y += 52;
    drawTextLine(ctx, `- Ghi chú thanh toán: ${model.paymentNote || '..............................................................'}`, PADDING_X, y, 1080, 'left', `400 30px ${UI_FONT}`);
    y += 52;
    drawTextLine(ctx, `+ Số tiền thanh toán chuyển khoản: ${model.bankAmount ? moneyText(model.bankAmount) : '........................................'}`, PADDING_X, y, 1080, 'left', `400 30px ${UI_FONT}`);
    y += 52;
    drawTextLine(ctx, `+ Số tiền bù trừ khoản vàng mua lại: ${model.offsetAmount ? moneyText(model.offsetAmount) : '........................................'}`, PADDING_X, y, 1080, 'left', `400 30px ${UI_FONT}`);

    y += 136;
    drawTextLine(ctx, 'Người duyệt mua', PADDING_X + 160, y, 300, 'center', `700 32px ${UI_FONT}`);
    drawTextLine(ctx, 'Người bán', pageWidth - PADDING_X - 340, y, 300, 'center', `700 32px ${UI_FONT}`);
    y += 42;
    drawTextLine(ctx, '(Ký tên, đóng dấu)', PADDING_X + 160, y, 300, 'center', `400 30px ${UI_FONT}`);
    drawTextLine(ctx, '(Ký, họ tên)', pageWidth - PADDING_X - 340, y, 300, 'center', `400 30px ${UI_FONT}`);

    y += 256;
    drawTextLine(ctx, model.buyerName, PADDING_X + 160, y, 300, 'center', `400 30px ${UI_FONT}`);
    drawTextLine(ctx, model.sellerName, pageWidth - PADDING_X - 340, y, 300, 'center', `400 30px ${UI_FONT}`);
};
const drawBuyVoucher = (ctx, model, assets) => {
    const pageWidth = model.page.width;
    const pageHeight = model.page.height;
    const pagePaddingX = 44;
    const pagePaddingY = 42;
    const contentGap = 28;
    const innerWidth = pageWidth - pagePaddingX * 2;
    const rightWidth = Math.round(innerWidth * 0.4);
    const leftWidth = innerWidth - rightWidth - contentGap;
    const leftX = pagePaddingX;
    const rightX = leftX + leftWidth + contentGap;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, pageWidth, pageHeight);
    ctx.fillStyle = '#111827';

    let y = pagePaddingY + 8;
    drawTextLine(ctx, COMPANY_NAME, leftX, y, leftWidth, 'left', `700 22px ${UI_FONT}`);
    y += 28;
    drawTextLine(ctx, `MST: ${COMPANY_TAX_CODE}`, leftX, y, 320, 'left', `700 20px ${UI_FONT}`);

    drawTextLine(ctx, model.title, leftX, pagePaddingY + 74, leftWidth, 'center', `700 44px ${UI_FONT}`);
    drawTextLine(ctx, `Ngày ${model.createdAt.getDate()} tháng ${model.createdAt.getMonth() + 1} năm ${model.createdAt.getFullYear()}`, leftX, pagePaddingY + 108, leftWidth, 'center', `400 22px ${UI_FONT}`);
    drawTextLine(ctx, `Số: ${model.serialNo}`, leftX + leftWidth - 128, pagePaddingY + 58, 128, 'left', `400 24px ${UI_FONT}`);

    const metaFont = `400 20px ${UI_FONT}`;
    let metaY = pagePaddingY + 166;
    drawTextLine(ctx, `- Họ tên người mua: ${model.buyerName}`, leftX, metaY, leftWidth, 'left', metaFont);
    metaY += 30;
    drawTextLine(ctx, `- Họ tên người bán: ${model.sellerName}`, leftX, metaY, leftWidth * 0.55, 'left', metaFont);
    drawTextLine(ctx, `Địa chỉ: ${model.address || '........................................'}`, leftX + leftWidth * 0.56, metaY, leftWidth * 0.44, 'left', metaFont);
    metaY += 30;
    drawTextLine(ctx, `- Số CCCD: ${model.cccd || '........................................'}`, leftX, metaY, leftWidth * 0.46, 'left', metaFont);
    drawTextLine(ctx, `Ngày cấp: ${model.issueDate || '........../........../..........'}`, leftX + leftWidth * 0.47, metaY, leftWidth * 0.22, 'left', metaFont);
    drawTextLine(ctx, `Số điện thoại: ${model.phone || '..........................'}`, leftX + leftWidth * 0.73, metaY, leftWidth * 0.27, 'left', metaFont);

    const tableTop = metaY + 50;
    const tableLeft = leftX;
    const tableWidth = leftWidth;
    const columnWidths = fitColumnWidths(tableWidth, [62, 320, 80, 130, 130, 156]);
    const columnXs = [
        tableLeft,
        tableLeft + columnWidths[0],
        tableLeft + columnWidths[0] + columnWidths[1],
        tableLeft + columnWidths[0] + columnWidths[1] + columnWidths[2],
        tableLeft + columnWidths[0] + columnWidths[1] + columnWidths[2] + columnWidths[3],
        tableLeft + columnWidths[0] + columnWidths[1] + columnWidths[2] + columnWidths[3] + columnWidths[4],
    ];
    const headerHeight = 58;
    const rowHeight = 46;
    const visibleRows = Math.max(model.rows.length, 4);

    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(tableLeft, tableTop, tableWidth, headerHeight + rowHeight * (visibleRows + 1));
    columnXs.slice(1).forEach((x) => {
        ctx.beginPath();
        ctx.moveTo(x, tableTop);
        ctx.lineTo(x, tableTop + headerHeight + rowHeight * (visibleRows + 1));
        ctx.stroke();
    });
    ctx.beginPath();
    ctx.moveTo(tableLeft, tableTop + headerHeight);
    ctx.lineTo(tableLeft + tableWidth, tableTop + headerHeight);
    ctx.stroke();
    for (let index = 0; index < visibleRows; index += 1) {
        const lineY = tableTop + headerHeight + rowHeight * (index + 1);
        ctx.beginPath();
        ctx.moveTo(tableLeft, lineY);
        ctx.lineTo(tableLeft + tableWidth, lineY);
        ctx.stroke();
    }

    const headers = ['STT', 'Tên, quy cách, phẩm chất\nhàng hóa', 'ĐVT', 'Số lượng', 'Đơn giá', 'Thành tiền'];
    headers.forEach((header, index) => {
        const headerLines = header.split('\n');
        headerLines.forEach((line, lineIndex) => {
            drawTextLine(ctx, line, columnXs[index], tableTop + 18 + lineIndex * 18, columnWidths[index], 'center', `700 18px ${UI_FONT}`);
        });
    });

    model.rows.forEach((row, index) => {
        const rowTop = tableTop + headerHeight + rowHeight * index;
        const rowFont = `400 18px ${UI_FONT}`;
        drawTextLine(ctx, String(row.stt), columnXs[0], rowTop + rowHeight / 2, columnWidths[0], 'center', rowFont);
        const nameLines = wrapText(ctx, row.name, columnWidths[1] - 14, 2, rowFont);
        nameLines.forEach((line, lineIndex) => {
            drawTextLine(ctx, line, columnXs[1] + 7, rowTop + 16 + lineIndex * 16, columnWidths[1] - 14, 'left', rowFont);
        });
        drawTextLine(ctx, row.unit, columnXs[2], rowTop + rowHeight / 2, columnWidths[2], 'center', rowFont);
        drawTextLine(ctx, row.qty, columnXs[3], rowTop + rowHeight / 2, columnWidths[3], 'center', `400 18px ${NUMBER_FONT}`);
        drawTextLine(ctx, row.price, columnXs[4] + 6, rowTop + rowHeight / 2, columnWidths[4] - 12, 'right', `400 18px ${NUMBER_FONT}`);
        drawTextLine(ctx, moneyText(row.amount), columnXs[5] + 8, rowTop + rowHeight / 2, columnWidths[5] - 16, 'right', `400 20px ${NUMBER_FONT}`);
    });

    const totalRowTop = tableTop + headerHeight + rowHeight * visibleRows;
    drawTextLine(ctx, 'Cộng', tableLeft, totalRowTop + rowHeight / 2, columnXs[5] - tableLeft, 'center', `700 22px ${UI_FONT}`);
    drawTextLine(ctx, moneyText(model.totalAmount), columnXs[5] + 8, totalRowTop + rowHeight / 2, columnWidths[5] - 16, 'right', `700 24px ${NUMBER_FONT}`);

    let footerY = totalRowTop + rowHeight + 46;
    drawTextLine(ctx, `- Tổng số tiền bằng chữ: ${model.totalInWords}`, leftX, footerY, leftWidth, 'left', `400 20px ${UI_FONT}`);
    footerY += 34;
    drawTextLine(ctx, `- Ghi chú thanh toán: ${model.paymentNote || '..............................................................'}`, leftX, footerY, leftWidth, 'left', `400 20px ${UI_FONT}`);
    footerY += 34;
    drawTextLine(ctx, `+ Số tiền thanh toán chuyển khoản: ${model.bankAmount ? moneyText(model.bankAmount) : '........................................'}`, leftX, footerY, leftWidth, 'left', `400 20px ${UI_FONT}`);
    footerY += 34;
    drawTextLine(ctx, `+ Số tiền bù trừ khoản vàng mua lại: ${model.offsetAmount ? moneyText(model.offsetAmount) : '........................................'}`, leftX, footerY, leftWidth, 'left', `400 20px ${UI_FONT}`);

    const signatureTop = Math.max(footerY + 84, pageHeight - 250);
    drawTextLine(ctx, 'Người duyệt mua', leftX + 44, signatureTop, 260, 'center', `700 24px ${UI_FONT}`);
    drawTextLine(ctx, 'Người bán', leftX + leftWidth - 304, signatureTop, 260, 'center', `700 24px ${UI_FONT}`);
    drawTextLine(ctx, '(Ký tên, đóng dấu)', leftX + 44, signatureTop + 28, 260, 'center', `400 20px ${UI_FONT}`);
    drawTextLine(ctx, '(Ký, họ tên)', leftX + leftWidth - 304, signatureTop + 28, 260, 'center', `400 20px ${UI_FONT}`);
    drawTextLine(ctx, model.approverName, leftX + 44, signatureTop + 180, 260, 'center', `400 22px ${UI_FONT}`);
    drawTextLine(ctx, model.sellerName, leftX + leftWidth - 304, signatureTop + 180, 260, 'center', `400 22px ${UI_FONT}`);

    const rightTop = pagePaddingY + 26;
    const rightHeight = Math.floor((pageHeight - rightTop * 2 - 30) / 2);
    drawIdentityBox(ctx, assets.frontImage, rightX, rightTop, rightWidth, rightHeight, 'CCCD mặt trước');
    drawIdentityBox(ctx, assets.backImage, rightX, rightTop + rightHeight + 54, rightWidth, rightHeight, 'CCCD mặt sau');
};

const ensureFontsReady = async () => {
    if (typeof document === 'undefined' || !document.fonts?.ready) return;
    try {
        await document.fonts.ready;
    } catch {
        // ignore
    }
};

const createPaymentVoucherPreview = async ({ orderId, total, customerInfo, lines, rates, settlement, serialNoOverride, modeOverride }) => {
    if (typeof document === 'undefined') throw new Error('Chỉ hỗ trợ tạo preview trong trình duyệt.');
    await ensureFontsReady();
    const model = buildVoucherModel({ orderId, total, customerInfo, lines, rates, settlement, serialNoOverride, modeOverride });
    const canvas = document.createElement('canvas');
    canvas.width = model.page.width;
    canvas.height = model.page.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Không tạo được bill preview.');
    if (model.mode === 'buy') {
        const [frontImage, backImage] = await Promise.all([loadImage(model.frontImage), loadImage(model.backImage)]);
        drawBuyVoucher(ctx, model, { frontImage, backImage });
    } else {
        drawSaleVoucher(ctx, model);
    }
    return {
        model,
        imageUrl: canvas.toDataURL('image/png'),
    };
};

const printPaymentVoucherImage = (imageUrl, title = 'Phiếu kê mua hàng', page = SALE_PAGE) => {
    if (typeof window === 'undefined' || !imageUrl) return false;
    const printWindow = window.open('', '_blank', 'width=1400,height=1000');
    if (!printWindow) {
        window.alert('Trình duyệt đang chặn cửa sổ in.');
        return false;
    }
    const pageCssSize = page?.cssSize || SALE_PAGE.cssSize;
    const imageWidthMm = page?.imageWidthMm || SALE_PAGE.imageWidthMm;
    const imageMaxHeightMm = page?.imageMaxHeightMm || SALE_PAGE.imageMaxHeightMm;
    printWindow.document.open();
    printWindow.document.write(`<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>
    @page { size: ${pageCssSize}; margin: 6mm; }
    body { margin: 0; background: #fff; display: flex; justify-content: center; }
    img { width: ${imageWidthMm}; max-width: 100%; max-height: ${imageMaxHeightMm}; height: auto; display: block; }
  </style>
</head>
<body>
  <img src="${imageUrl}" alt="${title}" />
  <script>
    window.addEventListener('load', function () {
      window.focus();
      setTimeout(function () { window.print(); }, 120);
    });
    window.addEventListener('afterprint', function () { window.close(); });
  </script>
</body>
</html>`);
    printWindow.document.close();
    return true;
};

export {
    buildEasyInvoicePayload,
    createEasyInvoiceDraft,
    createPaymentVoucherPreview,
    getBuyVoucherRows,
    hasBuyVoucherRows,
    printPaymentVoucherImage,
    resolveBuyVoucherCustomerInfo,
};
