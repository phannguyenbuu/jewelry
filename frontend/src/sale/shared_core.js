import { API_BASE } from '../lib/api';
import { printItemCertification } from '../lib/printItemCertification';

const API = API_BASE;

/* â”€â”€ helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const fmtVN = n => {
    const v = typeof n === 'string' ? parseFloat(n.replace(/,/g, '')) || 0 : (n || 0);
    return Math.round(v || 0).toLocaleString('vi-VN');
};
const parseFmt = s => parseFloat(String(s).replace(/[^0-9.-]/g, '')) || 0;
const fmtCalc = n => {
    const v = typeof n === 'string' ? parseFmt(n) : Number(n || 0);
    return Math.round(Math.abs(v || 0)).toLocaleString('en-US');
};
const VN_MONEY_SUGGESTIONS = ['000', '0,000', '00,000', '000,000'];
const getDayGreeting = (date = new Date()) => {
    const hour = date.getHours();
    if (hour >= 5 && hour < 12) return 'Chào buổi sáng.';
    if (hour >= 12 && hour < 18) return 'Chào buổi chiều.';
    return 'Chào buổi tối.';
};
const SOLD_STATUS = 'Đã bán';
const REPAIRING_STATUS = 'Đang sửa';
const DISCARDED_STATUS = 'Đã bỏ';
const normalizeGoldSalePrice = value => {
    const amount = typeof value === 'string' ? parseFmt(value) : Number(value || 0);
    if (!Number.isFinite(amount) || amount <= 0) return 0;
    return amount >= 100000000 ? Math.round(amount / 1000) : Math.round(amount);
};
const normalizeTradeRate = (category, value) => {
    const amount = typeof value === 'string' ? parseFmt(value) : Number(value || 0);
    if (!Number.isFinite(amount) || amount <= 0) return 0;
    return category === 'gold' ? normalizeGoldSalePrice(amount) : amount;
};
const today = () => new Date().toLocaleDateString('vi-VN');
const nowStr = () => new Date().toLocaleString('vi-VN');
const genOrderId = () => {
    const d = new Date();
    return `DH${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
};
const genRepairId = () => {
    const d = new Date();
    return `SB${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
};
const SAVED_SALE_KEY = 'sale_pos_saved_transactions_v1';
const createEmptyCustomerInfo = () => ({
    id: '',
    name: '',
    cccd: '',
    oldId: '',
    dob: '',
    gender: '',
    nationality: '',
    origin: '',
    residence: '',
    expiry: '',
    issueDate: '',
    address: '',
    phone: '',
    bankCode: '',
    bankName: '',
    bankNo: '',
    sao: 0,
    favorite: false,
    photoGallery: [],
    backText: '',
    frontImage: '',
    backImage: '',
});
const hasCustomerInfo = (info) => Object.entries(info || {}).some(([key, value]) => {
    if (key === 'sao') return Number(value || 0) > 0;
    if (key === 'favorite') return Boolean(value);
    if (key === 'photoGallery') return Array.isArray(value) && value.length > 0;
    return String(value || '').trim();
});

/* Default rate data (fallback khi API chưa có) */
const DEFAULT_RATES = {
    gold: { 'SJC': [85500000, 83000000], '1c': [8550000, 8300000], '0.5c': [4275000, 4150000] },
    money: { 'USD': [25400, 25000], 'EUR': [27500, 27000] },
};

const DEFAULT_GOLD_ENTRY_MODE = 'camera';
const POSITIVE_TXS = new Set(['sell', 'trade']);
const INVENTORY_TXS = new Set(['sell', 'trade']);
const normalizeGoldEntryMode = (entryMode) => entryMode === 'catalog' ? 'catalog' : DEFAULT_GOLD_ENTRY_MODE;
const isPositiveTransaction = (tx) => POSITIVE_TXS.has(tx);
const usesInventoryLookup = (line) => line?.cat === 'gold' && INVENTORY_TXS.has(line?.tx);
const sanitizeLineInventoryState = (line) => {
    if (usesInventoryLookup(line)) {
        return { ...line, entryMode: normalizeGoldEntryMode(line.entryMode) };
    }
    return {
        ...line,
        entryMode: '',
        itemId: null,
        itemName: '',
        itemGoldWeight: '',
        productCode: '',
    };
};

const createDefaultLine = (rates, overrides = {}) => {
    const firstCat = Object.keys(rates)[0] || 'gold';
    const firstProd = Object.keys(rates[firstCat] || {})[0] || '';
    return sanitizeLineInventoryState({
        id: Date.now(),
        cat: firstCat,
        product: firstProd,
        tx: 'sell',
        qty: '0',
        value: 0,
        customerQty: '',
        customerProduct: '',
        customerCustomBuy: '',
        sellLabor: '',
        sellAddedGold: '',
        sellCutGold: '',
        itemGoldWeight: '',
        tradeLabor: '',
        tradeComp: '',
        ...overrides,
    });
};

const createRepairLine = () => ({
    id: Date.now() + Math.random(),
    entryMode: DEFAULT_GOLD_ENTRY_MODE,
    itemId: null,
    productCode: '',
    itemName: '',
    nhom_hang: '',
    quay_nho: '',
    tuoi_vang: '',
    status: '',
    tl_vang_hien_tai: '',
    them_tl_vang: '',
    bot_tl_vang: '',
    ghi_chu: '',
});

const readSavedSales = () => {
    if (typeof window === 'undefined') return [];
    try {
        const raw = window.localStorage.getItem(SAVED_SALE_KEY);
        const parsed = JSON.parse(raw || '[]');
        return Array.isArray(parsed)
            ? parsed.filter(item => item && Array.isArray(item.lines) && item.lines.length > 0)
            : [];
    } catch {
        return [];
    }
};

const foldText = value => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
const readImageAsBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => resolve(String(ev?.target?.result || '').split(',')[1] || '');
    reader.onerror = () => reject(new Error('Không đọc được ảnh OCR.'));
    reader.readAsDataURL(file);
});
const readAndCropImageAsBase64 = (file, aspectRatio) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
        const img = new Image();
        img.onload = () => {
            if (!aspectRatio) {
                resolve(String(ev.target.result).split(',')[1] || '');
                return;
            }
            const sourceWidth = img.width;
            const sourceHeight = img.height;
            let cropWidth = sourceWidth;
            let cropHeight = sourceHeight;
            const sourceAspect = sourceWidth / sourceHeight;
            if (sourceAspect > aspectRatio) {
                cropWidth = Math.round(sourceHeight * aspectRatio);
                cropHeight = sourceHeight;
            } else {
                cropWidth = sourceWidth;
                cropHeight = Math.round(sourceWidth / aspectRatio);
            }
            const cropX = Math.max(0, Math.round((sourceWidth - cropWidth) / 2));
            const cropY = Math.max(0, Math.round((sourceHeight - cropHeight) / 2));
            const canvas = document.createElement('canvas');
            canvas.width = cropWidth;
            canvas.height = cropHeight;
            const context = canvas.getContext('2d');
            if (context) {
                context.drawImage(img, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
                resolve(canvas.toDataURL('image/jpeg', 0.95).split(',')[1] || '');
            } else {
                resolve(String(ev.target.result).split(',')[1] || '');
            }
        };
        img.onerror = () => reject(new Error('Không mở được ảnh.'));
        img.src = ev.target.result;
    };
    reader.onerror = () => reject(new Error('Không đọc được file.'));
    reader.readAsDataURL(file);
});
const nextMeaningfulLine = (lines, startIndex) => {
    for (let index = startIndex + 1; index < lines.length; index += 1) {
        const candidate = String(lines[index] || '').trim();
        if (candidate) return candidate;
    }
    return '';
};
const extractLabelValue = (lines, labels) => {
    const foldedLabels = labels.map(label => foldText(label));
    for (let index = 0; index < lines.length; index += 1) {
        const rawLine = String(lines[index] || '').trim();
        if (!rawLine) continue;
        const foldedLine = foldText(rawLine);
        const matchedLabel = foldedLabels.find(label => foldedLine.includes(label));
        if (!matchedLabel) continue;

        const colonValue = rawLine.split(/[:：]/).slice(1).join(':').trim();
        if (colonValue && foldText(colonValue) !== matchedLabel) return colonValue;

        const nextLine = nextMeaningfulLine(lines, index);
        if (nextLine && foldText(nextLine) !== matchedLabel) return nextLine;
    }
    return '';
};
const extractJsonishValue = (text, keys) => {
    for (const key of keys) {
        const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`["']?${escapedKey}["']?\\s*[:=]\\s*["']?([^"'\n,}]+)`, 'i');
        const match = String(text || '').match(regex);
        if (match?.[1]) return match[1].trim();
    }
    return '';
};
const normalizeGenderValue = (value) => {
    const folded = foldText(value);
    if (!folded) return '';
    if (['nam', 'male', 'm'].some(token => folded === token || folded.includes(token))) return 'Nam';
    if (['nu', 'nữ', 'female', 'f'].some(token => folded === token || folded.includes(token))) return 'Nữ';
    return '';
};
const formatSlashDate = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) return raw;
    const digits = raw.replace(/\D/g, '');
    if (digits.length === 8) {
        return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
    }
    return raw;
};
const extractCustomerInfoFromQrPayload = (payload) => {
    const raw = String(payload || '').trim();
    const parts = raw.split('|').map(part => part.trim()).filter(Boolean);
    if (parts.length < 5) {
        return { appliedFields: [], raw };
    }

    let cccd = '';
    let oldId = '';
    let name = '';
    let dob = '';
    let gender = '';
    let address = '';
    let issueDate = '';

    if (parts.length >= 7) {
        [cccd, oldId, name, dob, gender, address, issueDate] = parts;
    } else if (parts.length === 6) {
        [cccd, name, dob, gender, address, issueDate] = parts;
    } else {
        [cccd, name, dob, gender, address] = parts;
    }

    const normalized = {
        cccd: (cccd.match(/\d{12}/) || [cccd.replace(/\D/g, '')])[0] || '',
        oldId: oldId.replace(/\D/g, ''),
        name: name.trim(),
        dob: formatSlashDate(dob),
        gender: normalizeGenderValue(gender),
        address: address.trim(),
        residence: address.trim(),
        issueDate: formatSlashDate(issueDate),
        appliedFields: [
            cccd ? 'CCCD' : '',
            oldId ? 'CMND cũ' : '',
            name ? 'tên' : '',
            dob ? 'ngày sinh' : '',
            gender ? 'giới tính' : '',
            address ? 'thường trú' : '',
            issueDate ? 'ngày cấp' : '',
        ].filter(Boolean),
        raw,
    };

    return normalized;
};
const extractCustomerInfoFromOcrText = (text) => {
    const normalizedText = String(text || '').replace(/\r/g, '\n');
    const lines = normalizedText
        .split('\n')
        .map(line => line.replace(/\s+/g, ' ').trim());

    const rawName = extractJsonishValue(normalizedText, ['full_name', 'name'])
        || extractLabelValue(lines, ['Họ và tên', 'Họ tên', 'Ho va ten', 'Full name', 'Name']);
    const rawResidence = extractJsonishValue(normalizedText, ['place_of_residence', 'residence', 'address'])
        || extractLabelValue(lines, ['Nơi thường trú', 'Nơi cư trú', 'Địa chỉ', 'Noi thuong tru', 'Noi cu tru', 'Dia chi']);
    const rawOrigin = extractJsonishValue(normalizedText, ['place_of_origin', 'origin'])
        || extractLabelValue(lines, ['Quê quán', 'Nguyên quán', 'Que quan', 'Nguyen quan']);
    const rawCccdLine = extractJsonishValue(normalizedText, ['id', 'citizen_id', 'identity_number'])
        || extractLabelValue(lines, ['Căn cước', 'CCCD', 'CMND', 'Can cuoc', 'Identity']);
    const rawDob = extractJsonishValue(normalizedText, ['date_of_birth', 'birth_date', 'dob'])
        || extractLabelValue(lines, ['Ngày sinh', 'Ngày tháng năm sinh', 'Date of birth', 'Ngay sinh']);
    const rawGender = extractJsonishValue(normalizedText, ['sex', 'gender'])
        || extractLabelValue(lines, ['Giới tính', 'Gioi tinh', 'Sex', 'Gender']);
    const rawNationality = extractJsonishValue(normalizedText, ['nationality'])
        || extractLabelValue(lines, ['Quốc tịch', 'Quoc tich', 'Nationality']);
    const rawExpiry = extractJsonishValue(normalizedText, ['date_of_expiry', 'expiry', 'valid_until'])
        || extractLabelValue(lines, ['Có giá trị đến', 'Date of expiry', 'Valid until', 'Co gia tri den']);
    const fallbackName = lines.find(line => {
        const folded = foldText(line);
        if (!line || /\d/.test(line)) return false;
        if (line.split(/\s+/).length < 2) return false;
        if (!/[A-ZÀ-Ỹ]/.test(line)) return false;
        return !['can cuoc', 'cong hoa', 'co gia tri', 'ngay sinh', 'gioi tinh', 'quoc tich', 'noi thuong tru', 'noi cu tru', 'dia chi', 'que quan'].some(token => folded.includes(token));
    }) || '';

    const cccdMatches = [
        ...(String(rawCccdLine).match(/\d{9,12}/g) || []),
        ...(normalizedText.match(/\b\d{12}\b/g) || []),
        ...(normalizedText.match(/\b\d{9}\b/g) || []),
    ].sort((left, right) => right.length - left.length);
    const phoneMatch = normalizedText.match(/(^|[^\d])(0\d{9,10})(?!\d)/m);

    const result = {
        name: (rawName || fallbackName || '').replace(/^[:\-\s]+/, '').trim(),
        cccd: cccdMatches[0] || '',
        dob: (rawDob || '').replace(/^[:\-\s]+/, '').trim(),
        gender: normalizeGenderValue((rawGender || '').replace(/^[:\-\s]+/, '').trim()),
        nationality: (rawNationality || '').replace(/^[:\-\s]+/, '').trim(),
        origin: (rawOrigin || '').replace(/^[:\-\s]+/, '').trim(),
        residence: (rawResidence || '').replace(/^[:\-\s]+/, '').trim(),
        expiry: (rawExpiry || '').replace(/^[:\-\s]+/, '').trim(),
        address: (rawResidence || '').replace(/^[:\-\s]+/, '').trim(),
        phone: phoneMatch?.[2] || '',
    };
    const appliedFields = [
        result.name ? 'tên' : '',
        result.cccd ? 'CCCD' : '',
        result.dob ? 'ngày sinh' : '',
        result.gender ? 'giới tính' : '',
        result.nationality ? 'quốc tịch' : '',
        result.origin ? 'quê quán' : '',
        result.residence ? 'thường trú' : '',
        result.expiry ? 'hạn thẻ' : '',
        result.phone ? 'số điện thoại' : '',
    ].filter(Boolean);

    return { ...result, appliedFields };
};
const itemHasStatus = (item, status) => foldText(item?.status) === foldText(status);
const isSoldInventoryItem = item => foldText(item?.status) === foldText(SOLD_STATUS);
const isRepairingInventoryItem = item => itemHasStatus(item, REPAIRING_STATUS);
const isDiscardedInventoryItem = item => itemHasStatus(item, DISCARDED_STATUS);
const isUnavailableInventoryItem = item => isSoldInventoryItem(item) || isRepairingInventoryItem(item) || isDiscardedInventoryItem(item);
const inventoryStatusLabel = item => String(item?.status || '').trim() || 'Tồn kho';
const parseWeight = value => {
    const num = Number(String(value || '').replace(/,/g, '').trim());
    return Number.isFinite(num) ? num : 0;
};
const formatWeight = value => {
    if (!Number.isFinite(value)) return '';
    return value.toFixed(4).replace(/\.?0+$/, '') || '0';
};
const computeRepairNextWeight = (line, repairMode) => {
    const current = parseWeight(line?.tl_vang_hien_tai);
    if (repairMode !== 'sua') return line?.tl_vang_hien_tai || formatWeight(current);
    return formatWeight(current + parseWeight(line?.them_tl_vang) - parseWeight(line?.bot_tl_vang));
};

const BUY_GOLD_OTHER_OPTION = 'Dẻ khác';
const firstProductForCategory = (rates, category) => Object.keys(rates?.[category] || {})[0] || '';
const formatBuyGoldProductLabel = (product) => !product ? '' : product === BUY_GOLD_OTHER_OPTION ? BUY_GOLD_OTHER_OPTION : `Dẻ ${product}`;

const findInventoryByCode = (items, code) => {
    const needle = foldText(code);
    if (!needle) return null;
    return items.find(item => foldText(item.ma_hang) === needle) || null;
};

const filterInventoryItems = (items, query) => {
    const needle = foldText(query);
    if (!needle) return [];
    return items
        .filter(item => [item.ma_hang, item.ncc, item.nhom_hang, item.tuoi_vang].some(value => foldText(value).includes(needle)))
        .sort((a, b) => {
            const unavailableDiff = Number(isUnavailableInventoryItem(a)) - Number(isUnavailableInventoryItem(b));
            if (unavailableDiff !== 0) return unavailableDiff;
            const aCode = foldText(a.ma_hang);
            const bCode = foldText(b.ma_hang);
            const aExact = aCode === needle ? -2 : aCode.startsWith(needle) ? -1 : 0;
            const bExact = bCode === needle ? -2 : bCode.startsWith(needle) ? -1 : 0;
            if (aExact !== bExact) return aExact - bExact;
            return String(a.ma_hang || '').localeCompare(String(b.ma_hang || ''), 'vi');
        })
        .slice(0, 6);
};

async function scanCodeFromFile(file) {
    if (!file) throw new Error('Chưa có ảnh để quét.');
    if (typeof window === 'undefined' || !('BarcodeDetector' in window)) {
        throw new Error('Thiết bị này chưa hỗ trợ quét QR trực tiếp.');
    }
    const bitmap = await createImageBitmap(file);
    try {
        const detector = new window.BarcodeDetector({
            formats: ['qr_code', 'code_128', 'code_39', 'ean_13', 'ean_8'],
        });
        const results = await detector.detect(bitmap);
        if (!results.length || !results[0].rawValue) {
            throw new Error('Không đọc được QR hoặc mã vạch.');
        }
        return results[0].rawValue;
    } finally {
        bitmap.close?.();
    }
}

export {
  API,
  fmtVN,
  parseFmt,
  fmtCalc,
  VN_MONEY_SUGGESTIONS,
  getDayGreeting,
  SOLD_STATUS,
  REPAIRING_STATUS,
  DISCARDED_STATUS,
  normalizeGoldSalePrice,
  normalizeTradeRate,
  today,
  nowStr,
  genOrderId,
  genRepairId,
  SAVED_SALE_KEY,
  createEmptyCustomerInfo,
  hasCustomerInfo,
  DEFAULT_RATES,
  DEFAULT_GOLD_ENTRY_MODE,
  POSITIVE_TXS,
  INVENTORY_TXS,
  normalizeGoldEntryMode,
  isPositiveTransaction,
  usesInventoryLookup,
  sanitizeLineInventoryState,
  createDefaultLine,
  createRepairLine,
  readSavedSales,
  foldText,
  readImageAsBase64,
  readAndCropImageAsBase64,
  nextMeaningfulLine,
  extractLabelValue,
  extractJsonishValue,
  normalizeGenderValue,
  formatSlashDate,
  extractCustomerInfoFromQrPayload,
  extractCustomerInfoFromOcrText,
  itemHasStatus,
  isSoldInventoryItem,
  isRepairingInventoryItem,
  isDiscardedInventoryItem,
  isUnavailableInventoryItem,
  inventoryStatusLabel,
  parseWeight,
  formatWeight,
  computeRepairNextWeight,
  BUY_GOLD_OTHER_OPTION,
  firstProductForCategory,
  formatBuyGoldProductLabel,
  findInventoryByCode,
  filterInventoryItems,
  scanCodeFromFile,
  printItemCertification,
};
