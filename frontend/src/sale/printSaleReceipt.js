import {
    BUY_GOLD_OTHER_OPTION,
    fmtCalc,
    formatWeight,
    INVENTORY_TXS,
    normalizeTradeRate,
    parseFmt,
    parseWeight,
} from './shared';

const RECEIPT_WIDTH = 620;
const RECEIPT_PADDING = 40;
const RECEIPT_MEASURE_SCALE = 1;
const RECEIPT_OUTPUT_SCALE = 4;
const RECEIPT_LAYOUT_SCALE = 0.9;
const RECEIPT_TABLE_FONT_SCALE = 0.64;
const MIN_RECEIPT_HEIGHT = 920;
const WORKING_RECEIPT_HEIGHT = 4200;
const RECEIPT_FONT = "'Tahoma', 'Arial', 'Segoe UI', sans-serif";
const RECEIPT_NUMBER_FONT = "'Arial Narrow', 'Roboto Condensed', 'Arial', sans-serif";
const RECEIPT_TEXT_COLOR = '#656d78';
const RECEIPT_BORDER_COLOR = '#a3aab3';
const RECEIPT_CODE_COLOR = '#4b5563';
const DEFAULT_MACHINE_NAME = 'POS Mobile';
const FOOTER_LINES = [
    'Xin quý khách kiểm tiền và vàng, trước khi',
    'rời khỏi quầy. Cảm ơn và hẹn gặp lại.',
];
const QR_ALPHANUMERIC = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
const QR_VERSION_1_SIZE = 21;
const QR_DATA_CODEWORDS = 19;
const QR_ECC_CODEWORDS = 7;
const QR_FORMAT_L_MASK_0 = '111011111000100';

const px = (value) => Math.round(value * RECEIPT_LAYOUT_SCALE);
const moneyText = (value) => fmtCalc(Math.round(Math.abs(Number(value || 0))));
const safeText = (value, fallback = '---') => {
    const text = String(value ?? '').trim();
    return text || fallback;
};

const readReceiptSetting = (storageKey, globalKey, fallback) => {
    if (typeof window === 'undefined') return fallback;
    const globalValue = safeText(window?.[globalKey], '');
    if (globalValue) return globalValue;
    try {
        return safeText(window.localStorage?.getItem(storageKey), fallback);
    } catch {
        return fallback;
    }
};

const resolveHostName = () => {
    if (typeof window === 'undefined') return '';
    const host = String(window.location?.hostname || window.location?.host || '').trim();
    if (host) return host;
    const platform = String(window.navigator?.platform || '').trim();
    return platform;
};

const txLabel = (tx) => {
    if (tx === 'trade') return 'Mua - Bán';
    if (tx === 'buy') return 'Mua';
    if (tx === 'sell') return 'Bán';
    return 'Mua - Bán';
};

const resolveTxDisplay = (txSet) => {
    const labels = Array.from(txSet);
    if (!labels.length) return 'Mua - Bán';
    if (labels.includes('Mua - Bán')) return 'Mua - Bán';
    if (labels.includes('Mua') && labels.includes('Bán')) return 'Mua - Bán';
    return labels.join(' - ');
};

const ellipsisText = (ctx, text, maxWidth) => {
    const source = safeText(text, '');
    if (!source) return '';
    if (ctx.measureText(source).width <= maxWidth) return source;
    let next = source;
    while (next.length > 1 && ctx.measureText(`${next}...`).width > maxWidth) {
        next = next.slice(0, -1);
    }
    return `${next}...`;
};

const scaleFontSpec = (font, scale = 1) => (
    String(font || '').replace(/(\d+(?:\.\d+)?)px/, (_, rawSize) => `${Math.max(1, Number(rawSize) * scale)}px`)
);

const fitFontToWidth = (ctx, text, width, font, minScale = 1) => {
    const source = safeText(text, '');
    if (!source || !width || width <= 0) return font;
    ctx.font = font;
    const measuredWidth = ctx.measureText(source).width;
    if (!measuredWidth || measuredWidth <= width) return font;

    const matched = String(font || '').match(/(\d+(?:\.\d+)?)px/);
    if (!matched) return font;

    const baseSize = Number(matched[1]);
    const nextSize = Math.max(baseSize * minScale, baseSize * (width / measuredWidth));
    if (!Number.isFinite(nextSize) || nextSize <= 0 || nextSize >= baseSize) return font;

    return String(font).replace(/(\d+(?:\.\d+)?)px/, `${nextSize}px`);
};

const splitLongToken = (ctx, token, maxWidth) => {
    if (!token) return [''];
    if (ctx.measureText(token).width <= maxWidth) return [token];
    const chunks = [];
    let current = '';
    for (const char of token) {
        const attempt = `${current}${char}`;
        if (current && ctx.measureText(attempt).width > maxWidth) {
            chunks.push(current);
            current = char;
            continue;
        }
        current = attempt;
    }
    if (current) chunks.push(current);
    return chunks;
};

const wrapText = (ctx, text, maxWidth, maxLines = 2) => {
    const source = safeText(text, '');
    if (!source) return [''];

    const tokens = source
        .split(/\s+/)
        .flatMap(token => splitLongToken(ctx, token, maxWidth));

    const lines = [];
    let current = '';
    let truncated = false;

    for (const token of tokens) {
        const attempt = current ? `${current} ${token}` : token;
        if (ctx.measureText(attempt).width <= maxWidth) {
            current = attempt;
            continue;
        }
        if (current) {
            lines.push(current);
            if (lines.length === maxLines) {
                truncated = true;
                break;
            }
        }
        current = token;
        if (ctx.measureText(current).width > maxWidth) {
            current = ellipsisText(ctx, current, maxWidth);
        }
    }

    if (!truncated && current) {
        lines.push(current);
    }

    if (lines.length > maxLines) {
        truncated = true;
        lines.length = maxLines;
    }

    if (truncated && lines.length) {
        lines[lines.length - 1] = ellipsisText(ctx, lines[lines.length - 1], maxWidth);
    }

    return lines.length ? lines : [''];
};

const QR_EXP = new Array(512).fill(0);
const QR_LOG = new Array(256).fill(0);
let qrFieldInitialized = false;

const ensureQrField = () => {
    if (qrFieldInitialized) return;
    let value = 1;
    for (let index = 0; index < 255; index += 1) {
        QR_EXP[index] = value;
        QR_LOG[value] = index;
        value <<= 1;
        if (value & 0x100) value ^= 0x11d;
    }
    for (let index = 255; index < 512; index += 1) {
        QR_EXP[index] = QR_EXP[index - 255];
    }
    qrFieldInitialized = true;
};

const qrMul = (left, right) => {
    if (!left || !right) return 0;
    ensureQrField();
    return QR_EXP[QR_LOG[left] + QR_LOG[right]];
};

const qrPolyMultiply = (left, right) => {
    const output = new Array(left.length + right.length - 1).fill(0);
    for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
        for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
            output[leftIndex + rightIndex] ^= qrMul(left[leftIndex], right[rightIndex]);
        }
    }
    return output;
};

const buildQrGenerator = (degree) => {
    ensureQrField();
    let poly = [1];
    for (let index = 0; index < degree; index += 1) {
        poly = qrPolyMultiply(poly, [1, QR_EXP[index]]);
    }
    return poly;
};

const QR_GENERATOR_POLY = buildQrGenerator(QR_ECC_CODEWORDS);

const toBits = (value, length) => {
    const bits = [];
    for (let index = length - 1; index >= 0; index -= 1) {
        bits.push((value >> index) & 1);
    }
    return bits;
};

const sanitizeQrText = (text) => {
    const source = String(text || 'POS-SALE').toUpperCase();
    const cleaned = source
        .split('')
        .map(char => (QR_ALPHANUMERIC.includes(char) ? char : '-'))
        .join('')
        .slice(0, 25);
    return cleaned || 'POS-SALE';
};

const encodeQrPayload = (text) => {
    const payload = sanitizeQrText(text);
    const bits = [];
    bits.push(...toBits(0b0010, 4));
    bits.push(...toBits(payload.length, 9));

    for (let index = 0; index < payload.length; index += 2) {
        if (index + 1 < payload.length) {
            const value = QR_ALPHANUMERIC.indexOf(payload[index]) * 45 + QR_ALPHANUMERIC.indexOf(payload[index + 1]);
            bits.push(...toBits(value, 11));
        } else {
            bits.push(...toBits(QR_ALPHANUMERIC.indexOf(payload[index]), 6));
        }
    }

    const capacityBits = QR_DATA_CODEWORDS * 8;
    const terminator = Math.min(4, capacityBits - bits.length);
    for (let index = 0; index < terminator; index += 1) bits.push(0);
    while (bits.length % 8 !== 0) bits.push(0);

    const data = [];
    for (let index = 0; index < bits.length; index += 8) {
        let value = 0;
        for (let offset = 0; offset < 8; offset += 1) {
            value = (value << 1) | bits[index + offset];
        }
        data.push(value);
    }

    const padBytes = [0xec, 0x11];
    let padIndex = 0;
    while (data.length < QR_DATA_CODEWORDS) {
        data.push(padBytes[padIndex % padBytes.length]);
        padIndex += 1;
    }

    const message = [...data, ...new Array(QR_ECC_CODEWORDS).fill(0)];
    for (let index = 0; index < data.length; index += 1) {
        const factor = message[index];
        if (!factor) continue;
        for (let polyIndex = 0; polyIndex < QR_GENERATOR_POLY.length; polyIndex += 1) {
            message[index + polyIndex] ^= qrMul(QR_GENERATOR_POLY[polyIndex], factor);
        }
    }

    const codewords = [...data, ...message.slice(message.length - QR_ECC_CODEWORDS)];
    const outputBits = [];
    codewords.forEach(codeword => {
        outputBits.push(...toBits(codeword, 8));
    });
    return outputBits;
};

const createQrMatrix = (text) => {
    const size = QR_VERSION_1_SIZE;
    const matrix = Array.from({ length: size }, () => Array(size).fill(false));
    const functionMask = Array.from({ length: size }, () => Array(size).fill(false));
    const setModule = (row, col, value, isFunction = true) => {
        if (row < 0 || col < 0 || row >= size || col >= size) return;
        matrix[row][col] = Boolean(value);
        if (isFunction) functionMask[row][col] = true;
    };

    const drawFinder = (top, left) => {
        for (let rowOffset = -1; rowOffset <= 7; rowOffset += 1) {
            for (let colOffset = -1; colOffset <= 7; colOffset += 1) {
                const row = top + rowOffset;
                const col = left + colOffset;
                const isSeparator = rowOffset === -1 || rowOffset === 7 || colOffset === -1 || colOffset === 7;
                const isBorder = rowOffset === 0 || rowOffset === 6 || colOffset === 0 || colOffset === 6;
                const isCenter = rowOffset >= 2 && rowOffset <= 4 && colOffset >= 2 && colOffset <= 4;
                setModule(row, col, !isSeparator && (isBorder || isCenter));
            }
        }
    };

    drawFinder(0, 0);
    drawFinder(0, size - 7);
    drawFinder(size - 7, 0);

    for (let index = 8; index < size - 8; index += 1) {
        setModule(6, index, index % 2 === 0);
        setModule(index, 6, index % 2 === 0);
    }

    setModule(size - 8, 8, true);

    const formatCoordsA = [
        [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8],
        [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8],
    ];
    const formatCoordsB = [
        [size - 1, 8], [size - 2, 8], [size - 3, 8], [size - 4, 8], [size - 5, 8], [size - 6, 8], [size - 7, 8],
        [8, size - 8], [8, size - 7], [8, size - 6], [8, size - 5], [8, size - 4], [8, size - 3], [8, size - 2], [8, size - 1],
    ];
    [...formatCoordsA, ...formatCoordsB].forEach(([row, col]) => {
        functionMask[row][col] = true;
    });

    const dataBits = encodeQrPayload(text);
    let bitIndex = 0;
    let upward = true;
    for (let col = size - 1; col > 0; col -= 2) {
        if (col === 6) col -= 1;
        for (let rowIndex = 0; rowIndex < size; rowIndex += 1) {
            const row = upward ? size - 1 - rowIndex : rowIndex;
            for (let colOffset = 0; colOffset < 2; colOffset += 1) {
                const currentCol = col - colOffset;
                if (functionMask[row][currentCol]) continue;
                let bit = dataBits[bitIndex] || 0;
                bitIndex += 1;
                if ((row + currentCol) % 2 === 0) bit ^= 1;
                setModule(row, currentCol, bit, false);
            }
        }
        upward = !upward;
    }

    QR_FORMAT_L_MASK_0.split('').forEach((bit, index) => {
        const value = bit === '1';
        const [rowA, colA] = formatCoordsA[index];
        const [rowB, colB] = formatCoordsB[index];
        matrix[rowA][colA] = value;
        matrix[rowB][colB] = value;
    });

    return matrix;
};

const drawQrCode = (ctx, text, x, y, size) => {
    const matrix = createQrMatrix(text);
    const quietZone = 4;
    const moduleCount = matrix.length + quietZone * 2;
    const moduleSize = Math.max(2, Math.floor(size / moduleCount));
    const renderSize = moduleSize * moduleCount;
    const offsetX = x + Math.floor((size - renderSize) / 2);
    const offsetY = y + Math.floor((size - renderSize) / 2);

    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x, y, size, size);
    ctx.fillStyle = RECEIPT_CODE_COLOR;
    matrix.forEach((row, rowIndex) => {
        row.forEach((value, colIndex) => {
            if (!value) return;
            const drawX = offsetX + (colIndex + quietZone) * moduleSize;
            const drawY = offsetY + (rowIndex + quietZone) * moduleSize;
            ctx.fillRect(drawX, drawY, moduleSize, moduleSize);
        });
    });
    ctx.restore();
};

const resolveLineCode = (value, fallbackValue, fallbackIndex) => {
    const directCode = safeText(value, '');
    if (directCode) return directCode;
    const fallbackCode = safeText(fallbackValue, '');
    if (fallbackCode) return fallbackCode;
    return `Mã ${fallbackIndex}`;
};

const getLineMetrics = (line, rates) => {
    const effectiveCat = line.tx === 'trade' ? 'gold' : line.cat;
    const rate = rates?.[effectiveCat]?.[line.product] || [0, 0];
    const sellRate = normalizeTradeRate(effectiveCat, line.customSell !== undefined ? line.customSell : rate[0]);
    const buyRate = normalizeTradeRate(effectiveCat, line.customBuy !== undefined ? line.customBuy : rate[1]);
    const tradeRate = normalizeTradeRate(effectiveCat, line.customTrade !== undefined ? line.customTrade : rate[0]);
    const hasCustomerCustomBuy = line.customerCustomBuy !== undefined && String(line.customerCustomBuy).trim() !== '';
    const customerRate = normalizeTradeRate(
        'gold',
        hasCustomerCustomBuy
            ? line.customerCustomBuy
            : (rates?.gold?.[line.customerProduct || '']?.[1] || 0)
    );
    const baseQty = parseFmt(line.qty);
    const customerQty = parseWeight(line.customerQty || 0);
    const sellLabor = Math.max(0, parseFmt(line.sellLabor || 0));
    const sellAddedGold = Math.max(0, parseWeight(line.sellAddedGold || 0));
    const sellCutGold = Math.max(0, parseWeight(line.sellCutGold || 0));
    const tradeComp = Math.max(0, parseFmt(line.tradeComp || 0));
    const itemGoldWeight = Math.max(0, parseWeight(line.itemGoldWeight || 0));
    const usesInventory = effectiveCat === 'gold' && INVENTORY_TXS.has(line.tx);
    const isInventoryProductLocked = usesInventory && Boolean(line.itemId);
    const baseGoldWeight = isInventoryProductLocked ? (itemGoldWeight || 1) : baseQty;
    const effectiveGoldQty = (line.tx === 'sell' || line.tx === 'trade') && effectiveCat === 'gold'
        ? Math.max(0, baseGoldWeight + sellAddedGold - sellCutGold)
        : baseQty;
    const goldRate = line.tx === 'trade' ? tradeRate : sellRate;
    const goldAmount = Math.round(effectiveGoldQty * Math.max(0, goldRate) + sellLabor);
    const buyAmount = Math.round(baseQty * Math.max(0, buyRate));
    const tradeCustomerAmount = Math.round(customerQty * Math.max(0, customerRate));

    return {
        effectiveGoldQty,
        goldAmount,
        buyAmount,
        tradeCustomerAmount,
        sellLabor,
        sellRate,
        buyRate,
        tradeRate,
        customerRate,
        baseQty,
        customerQty,
        sellAddedGold,
        sellCutGold,
        baseGoldWeight,
        tradeComp,
    };
};

const buildReceiptRows = (lines, rates) => {
    const rows = [];
    const oldRows = [];
    const newRows = [];
    const summary = {
        newGold: 0,
        oldGold: 0,
        totalWeight: 0,
        rowCount: 0,
    };
    const txSet = new Set();
    let hasTrade = false;

    const pushRow = ({ key, code, qtyValue, laborValue, priceValue, amountValue, tx, section }) => {
        const normalizedQty = Math.max(0, Number(qtyValue || 0));
        const row = {
            key,
            code: safeText(code),
            qtyValue: normalizedQty,
            qty: normalizedQty > 0 ? formatWeight(normalizedQty) : '',
            labor: laborValue > 0 ? moneyText(laborValue) : '',
            price: priceValue > 0 ? moneyText(priceValue) : '',
            amount: Math.round(amountValue || 0),
            tx,
            section,
        };
        rows.push(row);
        if (section === 'old') {
            oldRows.push(row);
        } else {
            newRows.push(row);
        }
        if (normalizedQty > 0) summary.totalWeight += normalizedQty;
        summary.rowCount += 1;
    };

    lines.forEach((line, index) => {
        const metrics = getLineMetrics(line, rates);
        txSet.add(txLabel(line.tx));
        const inventoryCode = safeText(line.productCode || '', '');
        const lineIndex = index + 1;

        if (line.tx === 'sell') {
            if (metrics.goldAmount <= 0) return;
            summary.newGold += metrics.goldAmount;
            pushRow({
                key: `sell-${line.id || lineIndex}`,
                code: resolveLineCode(inventoryCode, line.product, lineIndex),
                qtyValue: metrics.effectiveGoldQty,
                laborValue: metrics.sellLabor,
                priceValue: metrics.sellRate,
                amountValue: metrics.goldAmount,
                tx: 'sell',
                section: 'new',
            });
            return;
        }

        if (line.tx === 'buy') {
            if (metrics.buyAmount <= 0) return;
            summary.oldGold += metrics.buyAmount;
            pushRow({
                key: `buy-${line.id || lineIndex}`,
                code: resolveLineCode('', line.product || BUY_GOLD_OTHER_OPTION, lineIndex),
                qtyValue: metrics.baseQty,
                laborValue: 0,
                priceValue: metrics.buyRate,
                amountValue: -metrics.buyAmount,
                tx: 'buy',
                section: 'old',
            });
            return;
        }

        if (line.tx === 'trade') {
            hasTrade = true;
            if (metrics.goldAmount > 0) {
                summary.newGold += metrics.goldAmount;
                pushRow({
                    key: `trade-new-${line.id || lineIndex}`,
                    code: resolveLineCode(inventoryCode, line.product, lineIndex),
                    qtyValue: metrics.effectiveGoldQty,
                    laborValue: metrics.sellLabor,
                    priceValue: metrics.tradeRate,
                    amountValue: metrics.goldAmount,
                    tx: 'trade',
                    section: 'new',
                });
            }
            if (metrics.tradeCustomerAmount > 0) {
                summary.oldGold += metrics.tradeCustomerAmount;
                pushRow({
                    key: `trade-old-${line.id || lineIndex}`,
                    code: resolveLineCode('', line.customerProduct || BUY_GOLD_OTHER_OPTION, lineIndex),
                    qtyValue: metrics.customerQty,
                    laborValue: 0,
                    priceValue: metrics.customerRate,
                    amountValue: -metrics.tradeCustomerAmount,
                    tx: 'trade',
                    section: 'old',
                });
            }
        }
    });

    return {
        rows,
        sections: [
            { key: 'old', title: 'Dẻ', rows: oldRows },
            { key: 'new', title: 'Vàng mới', rows: newRows },
        ].filter((section) => section.rows.length > 0),
        summary,
        txDisplay: resolveTxDisplay(txSet),
        hasTrade,
    };
};

const buildReceiptFormulaLine = (summary, paymentAmount) => {
    const newGoldAmount = Math.max(0, Math.round(Number(summary?.newGold || 0)));
    const oldGoldAmount = Math.max(0, Math.round(Number(summary?.oldGold || 0)));
    const totalAmount = Math.max(0, Math.round(Number(paymentAmount || 0)));
    const majorAmount = Math.max(newGoldAmount, oldGoldAmount);
    const minorAmount = Math.min(newGoldAmount, oldGoldAmount);
    const baseAmount = Math.abs(newGoldAmount - oldGoldAmount);
    const adjustmentAmount = Math.abs(totalAmount - baseAmount);
    const parts = [];

    if (majorAmount > 0) parts.push(moneyText(majorAmount));
    if (minorAmount > 0) parts.push('-', moneyText(minorAmount));
    if (adjustmentAmount > 0) parts.push(totalAmount >= baseAmount ? '+' : '-', moneyText(adjustmentAmount));

    if (!parts.length) {
        if (totalAmount <= 0) return '';
        return `${moneyText(totalAmount)} = ${moneyText(totalAmount)}`;
    }

    return `${parts.join(' ')} = ${moneyText(totalAmount)}`;
};

const buildDetailedReceiptFormulaLines = (formulaText = '') => (
    String(formulaText || '')
        .split(/\r?\n/)
        .map(line => String(line || '').trim())
        .filter(line => line && !/^TOTAL\s*:/i.test(line))
);

const buildReceiptModel = ({ orderId, customerInfo, lines, rates, total, formula = '', printSourceLabel = '' }) => {
    const { rows, sections, summary, txDisplay, hasTrade } = buildReceiptRows(lines, rates);
    if (!rows.length) {
        throw new Error('Chưa có nội dung giao dịch để in.');
    }

    const orderCode = safeText(orderId, 'POS-SALE');
    const paymentAmount = Math.abs(Math.round(Number(total || 0)));
    const netGoldAmount = Math.abs(Math.round(summary.newGold - summary.oldGold));
    const adjustmentAmount = Math.abs(paymentAmount - netGoldAmount);
    const machineName = safeText(
        customerInfo?.machineName
            || readReceiptSetting('sale_pos_machine_name', '__VK_POS_MACHINE_NAME__', '')
            || resolveHostName(),
        DEFAULT_MACHINE_NAME
    );
    const headerLines = [
        'Nhân viên: ---',
        `Giao dịch: ${txDisplay}`,
    ];
    const normalizedPrintSourceLabel = safeText(printSourceLabel, '');
    const detailedFormulaLines = buildDetailedReceiptFormulaLines(formula);

    return {
        orderId: orderCode,
        headerLines,
        sections,
        summaryRows: [
            summary.oldGold > 0 ? { label: 'Dẻ:', value: summary.oldGold, bold: false } : null,
            { label: 'Vàng mới:', value: summary.newGold, bold: true },
            { label: hasTrade ? 'Tiền bù:' : 'Tiền bớt:', value: adjustmentAmount, bold: false },
            { label: 'Tổng cộng:', value: paymentAmount, bold: true },
        ].filter(Boolean),
        footerLines: FOOTER_LINES,
        formulaLines: detailedFormulaLines.length ? detailedFormulaLines : [buildReceiptFormulaLine(summary, paymentAmount)].filter(Boolean),
        machineLine: normalizedPrintSourceLabel || `In từ máy tính: ${machineName}`,
    };
};

const drawCellText = (
    ctx,
    text,
    x,
    y,
    width,
    align = 'left',
    font = `400 ${px(28)}px ${RECEIPT_FONT}`,
    color = RECEIPT_TEXT_COLOR,
    options = {}
) => {
    const {
        allowEllipsis = true,
        clip = false,
        fitMinScale = 1,
    } = options;
    const source = safeText(text, '');
    const clippedFont = fitMinScale < 1 ? fitFontToWidth(ctx, source, width, font, fitMinScale) : font;
    ctx.save();
    ctx.font = clippedFont;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    if (clip) {
        ctx.beginPath();
        ctx.rect(x, y - px(26), width, px(52));
        ctx.clip();
    }
    const drawX = align === 'right' ? x + width : align === 'center' ? x + width / 2 : x;
    ctx.fillText(allowEllipsis ? ellipsisText(ctx, source, width) : source, drawX, y);
    ctx.restore();
};

const drawReceiptRow = (ctx, row, tableLeft, tableWidth, colWidths, colXs, y, rowMinHeight) => {
    const goldAgeFont = scaleFontSpec(`700 ${px(56)}px ${RECEIPT_NUMBER_FONT}`, RECEIPT_TABLE_FONT_SCALE);
    ctx.font = goldAgeFont;
    const goldAgeLineHeight = px(34);
    const labelLines = wrapText(ctx, row.code, colWidths[0] - px(16), 2);
    const rowHeight = Math.max(rowMinHeight, px(24) + Math.max(labelLines.length, 1) * goldAgeLineHeight);

    ctx.strokeRect(tableLeft, y, tableWidth, rowHeight);
    for (let index = 1; index < colXs.length; index += 1) {
        ctx.beginPath();
        ctx.moveTo(colXs[index], y);
        ctx.lineTo(colXs[index], y + rowHeight);
        ctx.stroke();
    }

    ctx.save();
    ctx.font = goldAgeFont;
    ctx.fillStyle = RECEIPT_TEXT_COLOR;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const goldAgeCenterY = y + rowHeight / 2;
    const goldAgeOffsetY = ((labelLines.length - 1) * goldAgeLineHeight) / 2;
    labelLines.forEach((line, index) => {
        ctx.fillText(line, colXs[0] + colWidths[0] / 2, goldAgeCenterY - goldAgeOffsetY + index * goldAgeLineHeight);
    });
    ctx.restore();

    const cellTextOptions = { allowEllipsis: false, clip: true };
    drawCellText(ctx, row.qty, colXs[1], y + rowHeight / 2, colWidths[1], 'center', scaleFontSpec(`700 ${px(64)}px ${RECEIPT_NUMBER_FONT}`, RECEIPT_TABLE_FONT_SCALE), RECEIPT_TEXT_COLOR, cellTextOptions);
    drawCellText(ctx, row.price, colXs[2], y + rowHeight / 2, colWidths[2], 'center', scaleFontSpec(`600 ${px(32)}px ${RECEIPT_NUMBER_FONT}`, RECEIPT_TABLE_FONT_SCALE), RECEIPT_TEXT_COLOR, cellTextOptions);
    drawCellText(ctx, row.labor, colXs[3], y + rowHeight / 2, colWidths[3], 'center', scaleFontSpec(`600 ${px(32)}px ${RECEIPT_NUMBER_FONT}`, RECEIPT_TABLE_FONT_SCALE), RECEIPT_TEXT_COLOR, cellTextOptions);
    drawCellText(
        ctx,
        `${row.amount < 0 ? '-' : ''}${moneyText(row.amount)}`,
        colXs[4] + px(8),
        y + rowHeight / 2,
        colWidths[4] - px(16),
        'right',
        scaleFontSpec(`700 ${px(34)}px ${RECEIPT_NUMBER_FONT}`, RECEIPT_TABLE_FONT_SCALE),
        RECEIPT_TEXT_COLOR,
        cellTextOptions
    );

    return y + rowHeight;
};

const drawReceiptToCanvas = (ctx, model, renderScale = RECEIPT_OUTPUT_SCALE) => {
    const width = ctx.canvas.width / renderScale;
    const height = ctx.canvas.height / renderScale;
    const tableLeft = RECEIPT_PADDING;
    const tableWidth = width - RECEIPT_PADDING * 2;
    const colWidths = [
        Math.round(tableWidth * 0.22),
        Math.round(tableWidth * 0.17),
        Math.round(tableWidth * 0.18),
        Math.round(tableWidth * 0.09),
    ];
    colWidths.push(tableWidth - colWidths.reduce((sum, value) => sum + value, 0));
    const colXs = [
        tableLeft,
        tableLeft + colWidths[0],
        tableLeft + colWidths[0] + colWidths[1],
        tableLeft + colWidths[0] + colWidths[1] + colWidths[2],
        tableLeft + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3],
    ];
    const headerHeight = px(74);
    const rowMinHeight = px(92);
    const summaryRowHeight = px(66);
    const summaryLabelWidth = Math.round(tableWidth * 0.37);
    const sectionTitleHeight = px(52);

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    let y = px(56);

    const qrSize = px(252);
    const qrX = tableLeft;
    const qrY = y;
    drawQrCode(ctx, model.orderId, qrX, qrY, qrSize);

    const headerX = qrX + qrSize + px(18);
    const headerWidth = width - headerX - RECEIPT_PADDING;
    const receiptHeaderFontSize = px(30);
    const receiptHeaderLineGap = px(38);
    const headerBlockHeight = Math.max(0, (model.headerLines.length - 1) * receiptHeaderLineGap);
    let headerY = qrY + qrSize / 2 - headerBlockHeight / 2;
    model.headerLines.forEach((line, index) => {
        drawCellText(
            ctx,
            line,
            headerX,
            headerY,
            headerWidth,
            'left',
            `400 ${receiptHeaderFontSize}px ${RECEIPT_FONT}`
        );
        headerY += receiptHeaderLineGap;
    });

    y = Math.max(qrY + qrSize, headerY) + px(42);

    ctx.save();
    ctx.strokeStyle = RECEIPT_BORDER_COLOR;
    ctx.lineWidth = 1;

    const headers = ['Tuổi vàng', 'TL Vàng', 'Giá', 'Công', 'Thành tiền'];
    ctx.strokeRect(tableLeft, y, tableWidth, headerHeight);
    headers.forEach((header, index) => {
        if (index > 0) {
            ctx.beginPath();
            ctx.moveTo(colXs[index], y);
            ctx.lineTo(colXs[index], y + headerHeight);
            ctx.stroke();
        }
        drawCellText(
            ctx,
            header,
            colXs[index],
            y + headerHeight / 2,
            colWidths[index],
            'center',
            scaleFontSpec(`600 ${px(28)}px ${RECEIPT_FONT}`, RECEIPT_TABLE_FONT_SCALE),
            RECEIPT_TEXT_COLOR,
            { allowEllipsis: false, clip: true }
        );
    });
    y += headerHeight;

    model.sections.forEach((section) => {
        ctx.save();
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(tableLeft, y, tableWidth, sectionTitleHeight);
        ctx.restore();

        ctx.strokeRect(tableLeft, y, tableWidth, sectionTitleHeight);
        drawCellText(
            ctx,
            section.title,
            tableLeft + px(14),
            y + sectionTitleHeight / 2,
            tableWidth - px(28),
            'left',
            `700 ${px(30)}px ${RECEIPT_FONT}`,
            RECEIPT_CODE_COLOR
        );
        y += sectionTitleHeight;

        section.rows.forEach((row) => {
            y = drawReceiptRow(ctx, row, tableLeft, tableWidth, colWidths, colXs, y, rowMinHeight);
        });
    });

    y += px(20);

    model.summaryRows.forEach((row, index) => {
        const rowY = y + index * summaryRowHeight;
        ctx.strokeRect(tableLeft, rowY, tableWidth, summaryRowHeight);
        ctx.beginPath();
        ctx.moveTo(tableLeft + summaryLabelWidth, rowY);
        ctx.lineTo(tableLeft + summaryLabelWidth, rowY + summaryRowHeight);
        ctx.stroke();
        drawCellText(
            ctx,
            row.label,
            tableLeft + px(14),
            rowY + summaryRowHeight / 2,
            summaryLabelWidth - px(22),
            'left',
            `${row.bold ? 600 : 400} ${px(30)}px ${RECEIPT_FONT}`
        );
        drawCellText(
            ctx,
            moneyText(row.value),
            tableLeft + summaryLabelWidth + px(14),
            rowY + summaryRowHeight / 2,
            tableWidth - summaryLabelWidth - px(26),
            'right',
            `${row.bold ? 700 : 400} ${row.bold ? px(42) : px(32)}px ${RECEIPT_NUMBER_FONT}`
        );
    });
    y += model.summaryRows.length * summaryRowHeight + px(62);
    ctx.restore();

    ctx.beginPath();
    ctx.moveTo(tableLeft, y);
    ctx.lineTo(width - RECEIPT_PADDING, y);
    ctx.strokeStyle = RECEIPT_BORDER_COLOR;
    ctx.lineWidth = 1;
    ctx.stroke();
    y += px(52);

    ctx.save();
    ctx.fillStyle = RECEIPT_TEXT_COLOR;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `italic 400 ${px(26)}px ${RECEIPT_FONT}`;
    model.footerLines.forEach((line, index) => {
        ctx.fillText(line, width / 2, y + index * px(30));
    });
    y += model.footerLines.length * px(30) + px(52);
    ctx.font = `600 ${px(23)}px ${RECEIPT_FONT}`;
    const formulaLines = (Array.isArray(model.formulaLines) ? model.formulaLines : [])
        .flatMap(line => wrapText(ctx, line, width - RECEIPT_PADDING * 2, 4))
        .filter(Boolean)
        .slice(0, 10);
    formulaLines.forEach((line, index) => {
        ctx.fillText(line, width / 2, y + index * px(28));
    });
    y += formulaLines.length ? (formulaLines.length * px(28) + px(24)) : px(12);
    ctx.font = `italic 400 ${px(28)}px ${RECEIPT_FONT}`;
    ctx.fillText(model.machineLine, width / 2, y);
    ctx.restore();

    return y + px(58);
};

const ensureFontsReady = async () => {
    if (typeof document === 'undefined' || !document.fonts?.ready) return;
    try {
        await document.fonts.ready;
    } catch {
        // ignore font loading failures and render with fallback fonts
    }
};

const createSaleReceiptPreview = async ({ orderId, customerInfo, lines, rates, total, formula = '', printSourceLabel = '' }) => {
    if (typeof document === 'undefined') {
        throw new Error('Chỉ hỗ trợ preview receipt trong trình duyệt.');
    }
    const model = buildReceiptModel({ orderId, customerInfo, lines, rates, total, formula, printSourceLabel });
    await ensureFontsReady();

    const createCanvas = (logicalHeight, renderScale) => {
        const canvas = document.createElement('canvas');
        canvas.width = RECEIPT_WIDTH * renderScale;
        canvas.height = logicalHeight * renderScale;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            throw new Error('Không tạo được preview PNG.');
        }
        ctx.scale(renderScale, renderScale);
        return { canvas, ctx };
    };

    const working = createCanvas(WORKING_RECEIPT_HEIGHT, RECEIPT_MEASURE_SCALE);
    const usedHeight = Math.max(MIN_RECEIPT_HEIGHT, Math.ceil(drawReceiptToCanvas(working.ctx, model, RECEIPT_MEASURE_SCALE) + px(36)));
    let canvas = working.canvas;

    if (usedHeight !== WORKING_RECEIPT_HEIGHT || RECEIPT_MEASURE_SCALE !== RECEIPT_OUTPUT_SCALE) {
        const finalRender = createCanvas(usedHeight, RECEIPT_OUTPUT_SCALE);
        drawReceiptToCanvas(finalRender.ctx, model, RECEIPT_OUTPUT_SCALE);
        canvas = finalRender.canvas;
    }

    return {
        model,
        imageUrl: canvas.toDataURL('image/png'),
    };
};

const printSaleReceiptImage = (imageUrl, title = 'Phiếu giao dịch POS') => {
    if (typeof window === 'undefined' || !imageUrl) return false;
    const printWindow = window.open('', '_blank', 'width=520,height=860');
    if (!printWindow) {
        window.alert('Trình duyệt đang chặn cửa sổ in.');
        return false;
    }
    printWindow.document.open();
    printWindow.document.write(`<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>
    @page { size: 80mm auto; margin: 0; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      display: flex;
      justify-content: center;
    }
    img {
      width: 76mm;
      max-width: 100%;
      display: block;
    }
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

const downloadSaleReceiptImage = (imageUrl, filename) => {
    if (typeof document === 'undefined' || !imageUrl) return false;
    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = filename || 'phieu-giao-dich-pos.png';
    link.click();
    return true;
};

const dataUrlToBlob = async (imageUrl) => {
    const response = await fetch(imageUrl);
    if (!response.ok) {
        throw new Error('Không đọc được ảnh PNG để copy.');
    }
    return response.blob();
};

const legacyCopyImageToClipboard = async (imageUrl) => {
    if (typeof document === 'undefined' || typeof window === 'undefined') return false;
    const wrapper = document.createElement('div');
    wrapper.contentEditable = 'true';
    wrapper.style.position = 'fixed';
    wrapper.style.left = '-9999px';
    wrapper.style.top = '0';
    wrapper.style.opacity = '0';

    const img = document.createElement('img');
    img.src = imageUrl;
    img.alt = 'receipt';
    wrapper.appendChild(img);
    document.body.appendChild(wrapper);

    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNode(wrapper);
    selection?.removeAllRanges();
    selection?.addRange(range);

    let copied = false;
    try {
        copied = document.execCommand('copy');
    } finally {
        selection?.removeAllRanges();
        wrapper.remove();
    }
    return copied;
};

const copySaleReceiptImageToClipboard = async (imageUrl) => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined' || !imageUrl) {
        throw new Error('Không có ảnh PNG để copy.');
    }

    const blob = await dataUrlToBlob(imageUrl);
    const ClipboardItemCtor = window.ClipboardItem || globalThis.ClipboardItem;

    if (window.isSecureContext && navigator.clipboard?.write && ClipboardItemCtor) {
        await navigator.clipboard.write([
            new ClipboardItemCtor({
                [blob.type || 'image/png']: blob,
            }),
        ]);
        return true;
    }

    if (await legacyCopyImageToClipboard(imageUrl)) {
        return true;
    }

    if (window.isSecureContext && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(imageUrl);
        throw new Error('Thiết bị này chưa hỗ trợ copy ảnh PNG trực tiếp, chỉ copy được dữ liệu ảnh.');
    }

    throw new Error('Thiết bị này chưa hỗ trợ copy PNG vào clipboard.');
};

export {
    createSaleReceiptPreview,
    printSaleReceiptImage,
    downloadSaleReceiptImage,
    copySaleReceiptImageToClipboard,
};
