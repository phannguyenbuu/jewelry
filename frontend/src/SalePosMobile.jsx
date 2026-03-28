/**
 * SalePosMobile â€” Mobile POS for jewelry/gold shop
 * -------------------------------------------------
 * Ported from Django template (_fastbuy.html + order_list.html) to React.
 *
 * Screens:
 *   1. ORDER  â€” Add transaction lines (gold/currency, buy/sell, qty, rate â†’ live total)
 *   2. PAYMENT â€” Split cash / bank transfer, VietQR, send order
 *   3. LIST   â€” Today's order list, settle (chá»‘t sá»•)
 *
 * Data flow:
 *   â€¢ Rates fetched from /api/gold_loai (jewelry backend â€” gia_ban / gia_mua per loai)
 *   â€¢ Orders POST to /api/don_hang (same backend used by DonHangPage)
 *   â€¢ VietQR generated client-side via img.vietqr.io
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
    IoAddOutline,
    IoArrowForwardOutline,
    IoCameraOutline,
    IoCardOutline,
    IoChevronDownOutline,
    IoChevronUpOutline,
    IoCheckmarkCircle,
    IoCheckmarkCircleOutline,
    IoCloseOutline,
    IoDocumentTextOutline,
    IoImagesOutline,
    IoListOutline,
    IoMenuOutline,
    IoPrintOutline,
    IoQrCodeOutline,
    IoRemoveOutline,
    IoRefreshOutline,
    IoSaveOutline,
    IoTrashOutline,
} from 'react-icons/io5';
import { API_BASE } from './lib/api';
import { printItemCertification } from './lib/printItemCertification';

const API = API_BASE;

/* â”€â”€ helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const fmtVN = n => {
    const v = typeof n === 'string' ? parseFloat(n.replace(/,/g, '')) || 0 : (n || 0);
    return v.toLocaleString('vi-VN');
};
const parseFmt = s => parseFloat(String(s).replace(/[^0-9.\-]/g, '')) || 0;
const fmtCalc = n => {
    const v = typeof n === 'string' ? parseFmt(n) : Number(n || 0);
    return Math.abs(v || 0).toLocaleString('en-US');
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
    backText: '',
});
const hasCustomerInfo = (info) => Object.values(info || {}).some(value => String(value || '').trim());

/* â”€â”€ default rate data (fallback khi API chÆ°a cÃ³) â”€â”€ */
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

const firstProductForCategory = (rates, category) => Object.keys(rates?.[category] || {})[0] || '';

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

const APP_GRADIENT = 'linear-gradient(135deg, #0f172a 0%, #1e3a6e 58%, #1d4ed8 100%)';
const APP_GRADIENT_BRIGHT = 'linear-gradient(135deg, #1d4ed8 0%, #0ea5e9 100%)';
const POS_RED = '#dc2626';
const NEUTRAL_BORDER = '#ccc';
const TX_THEMES = {
    sell: {
        accent: '#1d4ed8',
        border: '#2563eb',
        gradient: 'linear-gradient(135deg,#1d4ed8,#0ea5e9)',
        softBorder: 'rgba(37,99,235,.26)',
        softBg: 'rgba(239,246,255,.95)',
    },
    trade: {
        accent: '#0f766e',
        border: '#14b8a6',
        gradient: 'linear-gradient(135deg,#0f766e,#14b8a6)',
        softBorder: 'rgba(20,184,166,.26)',
        softBg: 'rgba(240,253,250,.95)',
    },
    buy: {
        accent: '#dc2626',
        border: '#f87171',
        gradient: 'linear-gradient(135deg,#dc2626,#f87171)',
        softBorder: 'rgba(248,113,113,.28)',
        softBg: 'rgba(254,242,242,.95)',
    },
};
const getTxTheme = (tx) => TX_THEMES[tx] || TX_THEMES.sell;
const floatingMenuItemStyle = (active) => ({
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 12px',
    borderRadius: 16,
    border: 'none',
    background: active ? 'linear-gradient(135deg, rgba(15,23,42,.96), rgba(30,58,110,.94))' : 'rgba(248,250,252,.95)',
    color: active ? 'white' : '#0f172a',
    cursor: 'pointer',
    textAlign: 'left',
    boxShadow: active ? '0 10px 24px rgba(15,23,42,.16)' : 'inset 0 0 0 1px rgba(148,163,184,.18)',
});
const floatingMenuIconStyle = (active) => ({
    width: 30,
    height: 30,
    borderRadius: 999,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: active ? 'rgba(255,255,255,.18)' : 'rgba(29,78,216,.08)',
    color: active ? 'white' : '#1d4ed8',
    fontSize: 16,
    flexShrink: 0,
});

/* â”€â”€ styles â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const S = {
    screen: {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        background: 'linear-gradient(180deg, #f8fafc 0%, #f6faf7 42%, #edf4fb 100%)',
        overflow: 'hidden',
        fontFamily: "'Be Vietnam Pro', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        width: '100%',
        height: '100%',
        color: '#111827',
    },
    header: { padding: '16px 18px 8px', background: 'transparent', flexShrink: 0 },
    title: { color: '#111827', fontWeight: 900, fontSize: 15, letterSpacing: .1 },
    sub: { color: '#6b7280', fontSize: 9, marginTop: 2 },
    scrollArea: { flex: 1, overflowY: 'auto', padding: '10px 14px 12px', display: 'flex', flexDirection: 'column', gap: 12 },
    card: { background: 'rgba(255,255,255,.92)', borderRadius: 22, padding: 14, boxShadow: '0 14px 40px rgba(15,23,42,.08)', position: 'relative', border: '1px solid rgba(15,23,42,.06)' },
    totalBar: { padding: '12px 18px', background: 'rgba(255,255,255,.9)', flexShrink: 0, borderTop: '1px solid rgba(15,23,42,.08)', backdropFilter: 'blur(18px)' },
    totalAmt: () => ({
        fontSize: 28,
        fontWeight: 900,
        color: POS_RED,
        letterSpacing: .2,
        lineHeight: .96,
        fontFamily: "'Roboto Condensed', 'Arial Narrow', 'Be Vietnam Pro', sans-serif",
    }),
    pillBtn: (bg, c = 'white') => ({
        display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 20px',
        borderRadius: 999, border: 'none', background: bg, color: c,
        fontWeight: 800, fontSize: 11, cursor: 'pointer', transition: 'transform .15s, opacity .15s', boxShadow: '0 8px 18px rgba(15,23,42,.10)',
    }),
    iconBtn: (bg) => ({
        width: 40, height: 40, borderRadius: '50%', border: 'none', background: bg,
        color: '#111827', fontWeight: 900, fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 8px 18px rgba(15,23,42,.08)',
    }),
    inp: { width: '100%', padding: '8px 10px', borderRadius: 12, border: '1.5px solid #dbe4ee', fontSize: 12, boxSizing: 'border-box', textAlign: 'center', fontWeight: 700, outline: 'none', background: 'rgba(255,255,255,.96)', color: '#111827' },
    label: { fontSize: 8, color: '#6b7280', fontWeight: 700, marginBottom: 3, textTransform: 'uppercase', letterSpacing: .4, display: 'block' },
    toggleRow: { display: 'flex', borderRadius: 999, background: '#edf2f7', padding: 3, gap: 2, boxShadow: 'inset 0 1px 2px rgba(15,23,42,.05)' },
    toggleOpt: (active, col) => ({
        flex: 1, padding: '7px 0', borderRadius: 999, border: 'none', fontWeight: 800, fontSize: 10,
        cursor: 'pointer', transition: 'all .2s', textAlign: 'center',
        background: active ? col : 'transparent',
        color: active ? 'white' : '#64748b',
        boxShadow: active ? '0 10px 20px rgba(30,58,110,.18)' : 'none',
    }),
    heroCard: { borderRadius: 28, padding: '24px 16px 16px', background: 'linear-gradient(135deg, rgba(255,255,255,.88), rgba(248,250,252,.95))', border: '1px solid rgba(15,23,42,.05)', boxShadow: '0 16px 42px rgba(15,23,42,.08)', position: 'relative', overflow: 'visible' },
    heroBg: { position: 'absolute', inset: 0, borderRadius: 28, overflow: 'hidden', background: 'radial-gradient(circle at 15% 15%, rgba(255,255,255,.92), transparent 30%), radial-gradient(circle at 85% 0%, rgba(191,219,254,.6), transparent 22%), radial-gradient(circle at 80% 85%, rgba(251,191,36,.25), transparent 24%)' },
    heroTextWrap: { maxWidth: 220, paddingTop: 6, position: 'relative', zIndex: 1 },
    heroTitle: { fontSize: 21, lineHeight: 1.28, fontWeight: 900, color: '#111827', letterSpacing: -.15, display: 'block' },
    heroChip: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 11px', borderRadius: 999, background: 'rgba(17,24,39,.88)', color: 'white', fontSize: 10, fontWeight: 800, border: 'none', cursor: 'pointer' },
    sectionTitle: { fontSize: 11, fontWeight: 900, color: '#111827', marginBottom: 8 },
    softPanel: { background: 'rgba(255,255,255,.94)', borderRadius: 22, border: '1px solid rgba(15,23,42,.06)', boxShadow: '0 12px 34px rgba(15,23,42,.08)', padding: 14 },
    heroLogo: { position: 'absolute', right: 0, bottom: 0, width: 132, maxWidth: '100%', objectFit: 'contain', filter: 'drop-shadow(0 14px 24px rgba(15,23,42,.16))' },
};

const calcValueStyle = (color, size = 20, align = 'right') => ({
    ...S.totalAmt(),
    fontSize: size,
    color,
    textAlign: align,
    display: 'block',
});

/* â”€â”€ Transaction line card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function TxLine({ line, rates, inventoryItems, onChange, onRemove, showRemove }) {
    const cats = Object.keys(rates);
    const effectiveCat = line.tx === 'trade' ? 'gold' : line.cat;
    const products = Object.keys(rates[effectiveCat] || {});
    const fileInputRef = useRef(null);
    const [catalogQuery, setCatalogQuery] = useState(line.productCode || '');
    const [lookupMessage, setLookupMessage] = useState('');
    const [scanLoading, setScanLoading] = useState(false);

    const rate = rates[effectiveCat]?.[line.product] || [0, 0];
    const sellRate = normalizeTradeRate(effectiveCat, line.customSell !== undefined ? line.customSell : rate[0]);
    const buyRate = normalizeTradeRate(effectiveCat, line.customBuy !== undefined ? line.customBuy : rate[1]);
    const tradeRate = normalizeTradeRate(effectiveCat, line.customTrade !== undefined ? line.customTrade : rate[0]);
    const curRate = line.tx === 'buy' ? buyRate : line.tx === 'trade' ? tradeRate : sellRate;
    const inventoryValue = parseFmt(line.qty) * parseFmt(curRate);
    const tradeAmount = parseFmt(line.tradeLabor || 0) + parseFmt(line.tradeComp || 0);
    const value = line.tx === 'trade' ? tradeAmount : inventoryValue;
    const isGold = effectiveCat === 'gold';
    const usesInventory = isGold && INVENTORY_TXS.has(line.tx);
    const entryMode = usesInventory ? normalizeGoldEntryMode(line.entryMode) : '';
    const catalogMatches = usesInventory ? filterInventoryItems(inventoryItems, catalogQuery) : [];
    const txTheme = getTxTheme(line.tx);
    const lineAccent = txTheme.accent;
    const lineBorder = txTheme.border;
    const isTrade = line.tx === 'trade';
    const tradeCustomerProducts = Object.keys(rates.gold || {});
    const tradeMoneySuggestionId = `trade-money-suggestions-${line.id}`;
    const quantityStep = 1;
    const tradeComboWidth = 'calc((100% - 10px) / 2)';
    const txOptions = [
        { key: 'sell', label: 'BÁN', color: getTxTheme('sell').gradient },
        { key: 'trade', label: 'ĐỔI', color: getTxTheme('trade').gradient },
        { key: 'buy', label: 'MUA DẺ', color: getTxTheme('buy').gradient },
    ];

    const normalizeNonNegativeNumberInput = (raw) => {
        const cleaned = String(raw ?? '')
            .replace(/,/g, '.')
            .replace(/[^0-9.]/g, '')
            .replace(/(\..*)\./g, '$1');
        if (cleaned === '') return '';
        const nextValue = Number(cleaned);
        if (!Number.isFinite(nextValue) || nextValue < 0) return '0';
        return cleaned;
    };
    const formatSteppedValue = (num, step) => (
        step < 1
            ? num.toFixed(1).replace(/\.0$/, '')
            : String(Math.max(0, Math.round(num)))
    );
    const adjustQty = (delta) => {
        const nextValue = Math.max(0, parseFmt(line.qty || 0) + delta);
        set('qty', formatSteppedValue(nextValue, quantityStep));
    };

    // notify parent of computed value
    useEffect(() => {
        onChange({ value, tx: line.tx });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [line.qty, line.product, effectiveCat, line.tx, line.customSell, line.customBuy, line.customTrade, line.tradeLabor, line.tradeComp]);

    useEffect(() => {
        if (!isGold) return;
        if (line.product && products.includes(line.product)) return;
        const fallbackProduct = products[0] || '';
        if (fallbackProduct && fallbackProduct !== line.product) {
            onChange({ product: fallbackProduct });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isGold, products.join('|')]);

    useEffect(() => {
        if (!isTrade || line.cat === 'gold') return;
        onChange({ cat: 'gold' });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isTrade, line.cat]);

    useEffect(() => {
        if (!isTrade) return;
        if (!line.customerProduct && tradeCustomerProducts.length) {
            onChange({ customerProduct: tradeCustomerProducts[0] });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isTrade, tradeCustomerProducts.join('|')]);

    useEffect(() => {
        const normalizedLine = sanitizeLineInventoryState(line);
        const patch = {};
        if ((normalizedLine.entryMode || '') !== (line.entryMode || '')) patch.entryMode = normalizedLine.entryMode;
        if ((normalizedLine.productCode || '') !== (line.productCode || '')) patch.productCode = normalizedLine.productCode;
        if ((normalizedLine.itemName || '') !== (line.itemName || '')) patch.itemName = normalizedLine.itemName;
        if ((normalizedLine.itemId ?? null) !== (line.itemId ?? null)) patch.itemId = normalizedLine.itemId ?? null;
        if (Object.keys(patch).length) onChange(patch);
    }, [line, onChange]);

    useEffect(() => {
        setCatalogQuery(line.productCode || '');
    }, [line.productCode]);

    const set = (k, v) => onChange({ [k]: v });

    const applyInventoryItem = (item, source = entryMode) => {
        if (!item) {
            setLookupMessage('Không tìm thấy sản phẩm trong danh mục.');
            return;
        }
        if (isUnavailableInventoryItem(item)) {
            setLookupMessage(`Sản phẩm ${item.ma_hang || item.ncc || ''} đang ở trạng thái ${inventoryStatusLabel(item)}, không thể chọn.`);
            return;
        }
        const nextProduct = item.tuoi_vang && (rates.gold?.[item.tuoi_vang] || products.includes(item.tuoi_vang))
            ? item.tuoi_vang
            : (line.product || products[0] || '');
        onChange({
            entryMode: source,
            itemId: item.id,
            itemName: item.ncc || '',
            productCode: item.ma_hang || '',
            product: nextProduct,
            qty: line.qty || '0',
        });
        setCatalogQuery(item.ma_hang || item.ncc || '');
        setLookupMessage(`Đã chọn ${item.ma_hang || 'sản phẩm'}${item.ncc ? ` · ${item.ncc}` : ''}.`);
    };

    const handleScanFile = async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        setScanLoading(true);
        try {
            const scannedCode = await scanCodeFromFile(file);
            onChange({ productCode: scannedCode, entryMode: 'camera' });
            const matched = findInventoryByCode(inventoryItems, scannedCode);
            if (matched) {
                applyInventoryItem(matched, 'camera');
            } else {
                setLookupMessage(`Đã quét được mã ${scannedCode}, nhưng chưa thấy trong danh mục.`);
            }
        } catch (err) {
            setLookupMessage(err.message || 'Không quét được QR.');
        } finally {
            setScanLoading(false);
        }
    };

    return (
        <div style={{ ...S.card, border: `2px solid ${lineBorder}` }}>
            {showRemove && (
                <button
                    onClick={onRemove}
                    style={{
                        ...S.iconBtn(txTheme.gradient),
                        border: 'none',
                        width: 20,
                        height: 20,
                        fontSize: 13,
                        fontWeight: 400,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        position: 'absolute',
                        top: -4,
                        right: -4,
                        zIndex: 2,
                        color: '#ffffff',
                        padding: 0,
                    }}
                    aria-label="Xóa dòng hàng"
                    title="Xóa dòng hàng"
                >
                    <IoCloseOutline />
                </button>
            )}

            {/* Loáº¡i giao dá»‹ch */}
            <div style={S.toggleRow}>
                {txOptions.map(t => (
                    <button key={t.key} style={S.toggleOpt(line.tx === t.key, t.color)}
                        onClick={() => {
                            if (t.key === line.tx) return;
                            const nextCat = t.key === 'trade' ? 'gold' : line.cat;
                            const nextProduct = t.key === 'trade'
                                ? (rates.gold?.[line.product] ? line.product : firstProductForCategory(rates, 'gold'))
                                : line.product;
                            const nextLine = sanitizeLineInventoryState({ ...line, tx: t.key, cat: nextCat, product: nextProduct });
                            onChange({
                                tx: t.key,
                                cat: nextCat,
                                product: nextProduct,
                                entryMode: nextLine.entryMode,
                                itemId: nextLine.itemId,
                                itemName: nextLine.itemName,
                                productCode: nextLine.productCode,
                                customerProduct: t.key === 'trade' ? (line.customerProduct || nextProduct || '') : '',
                                customerQty: t.key === 'trade' ? (line.customerQty || '') : '',
                                tradeLabor: t.key === 'trade' ? (line.tradeLabor || '') : '',
                                tradeComp: t.key === 'trade' ? (line.tradeComp || '') : '',
                            });
                            if (!INVENTORY_TXS.has(t.key)) {
                                setLookupMessage('');
                                setCatalogQuery('');
                            }
                        }}>
                        {t.label}
                    </button>
                ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
                {/* Danh má»¥c */}
                {!isTrade ? (
                    <div>
                        <span style={S.label}>Phân loại</span>
                        <div style={S.toggleRow}>
                            {cats.map(c => (
                                <button key={c} style={S.toggleOpt(line.cat === c, txTheme.gradient)}
                                    onClick={() => {
                                        const nextProduct = firstProductForCategory(rates, c);
                                        const nextLine = sanitizeLineInventoryState({ ...line, cat: c, product: nextProduct });
                                        onChange({
                                            cat: c,
                                            product: nextProduct,
                                            itemId: nextLine.itemId,
                                            itemName: nextLine.itemName,
                                            productCode: nextLine.productCode,
                                            entryMode: nextLine.entryMode,
                                        });
                                        setLookupMessage('');
                                        setCatalogQuery('');
                                    }}>
                                    {c === 'gold' ? 'Vàng' : 'Ngoại tệ'}
                                </button>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div style={{ gridColumn: '1 / -1' }}>
                        <span style={S.label}>Sản phẩm khách</span>
                        <div style={{ display: 'grid', gridTemplateColumns: '84px 18px 1fr', gap: 8, alignItems: 'center' }}>
                            <input
                                style={S.inp}
                                type="number"
                                inputMode="decimal"
                                min="0"
                                step="0.1"
                                value={line.customerQty || ''}
                                onChange={e => set('customerQty', normalizeNonNegativeNumberInput(e.target.value))}
                                placeholder="SL"
                            />
                            <div style={{ textAlign: 'center', color: '#64748b', fontWeight: 700 }}>x</div>
                            <select
                                style={{
                                    ...S.inp,
                                    textAlign: 'center',
                                    textAlignLast: 'center',
                                    padding: '9px 36px 9px 12px',
                                    appearance: 'none',
                                    WebkitAppearance: 'none',
                                    MozAppearance: 'none',
                                    backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 20 20' fill='none'%3E%3Cpath d='M5 7.5L10 12.5L15 7.5' stroke='%23111827' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")",
                                    backgroundRepeat: 'no-repeat',
                                    backgroundPosition: 'calc(100% - 20px) center',
                                    backgroundSize: '14px 14px',
                                    cursor: 'pointer',
                                    width: tradeComboWidth,
                                    justifySelf: 'end',
                                }}
                                value={line.customerProduct || ''}
                                onChange={e => set('customerProduct', e.target.value)}
                            >
                                {tradeCustomerProducts.map(p => <option key={p}>{p}</option>)}
                            </select>
                        </div>
                    </div>
                )}

                {/* Sáº£n pháº©m */}
                {!isTrade ? (
                    <div>
                        <span style={S.label}>{isGold ? 'Tuổi vàng' : 'Loại ngoại tệ'}</span>
                        <select
                            style={{
                                ...S.inp,
                                textAlign: 'center',
                                textAlignLast: 'center',
                                padding: '9px 36px 9px 12px',
                                appearance: 'none',
                                WebkitAppearance: 'none',
                                MozAppearance: 'none',
                                backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 20 20' fill='none'%3E%3Cpath d='M5 7.5L10 12.5L15 7.5' stroke='%23111827' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")",
                                backgroundRepeat: 'no-repeat',
                                backgroundPosition: 'calc(100% - 20px) center',
                                backgroundSize: '14px 14px',
                                cursor: 'pointer',
                            }}
                            value={line.product} onChange={e => set('product', e.target.value)}>
                            {products.map(p => <option key={p}>{p}</option>)}
                        </select>
                    </div>
                ) : (
                    <div style={{ gridColumn: '1 / -1', marginTop: 2, paddingTop: 10, borderTop: `1px solid ${txTheme.softBorder}` }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: 8, alignItems: 'center' }}>
                            <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b' }}>Sản phẩm đổi</div>
                            <select
                                style={{
                                    ...S.inp,
                                    textAlign: 'center',
                                    textAlignLast: 'center',
                                    padding: '9px 36px 9px 12px',
                                    appearance: 'none',
                                    WebkitAppearance: 'none',
                                    MozAppearance: 'none',
                                    backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 20 20' fill='none'%3E%3Cpath d='M5 7.5L10 12.5L15 7.5' stroke='%23111827' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")",
                                    backgroundRepeat: 'no-repeat',
                                    backgroundPosition: 'calc(100% - 20px) center',
                                    backgroundSize: '14px 14px',
                                    cursor: 'pointer',
                                    width: tradeComboWidth,
                                    justifySelf: 'end',
                                }}
                                value={line.product}
                                onChange={e => set('product', e.target.value)}
                                aria-label="Tuổi vàng"
                                title="Tuổi vàng"
                            >
                                {products.map(p => <option key={p}>{p}</option>)}
                            </select>
                        </div>
                    </div>
                )}

                {usesInventory && (
                    <div style={{ gridColumn: '1 / -1' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <input
                                className="sale-pos-catalog-input"
                                style={{ ...S.inp, textAlign: 'left', flex: 1, borderRadius: 16 }}
                                value={catalogQuery}
                                onChange={e => {
                                    setCatalogQuery(e.target.value);
                                    setLookupMessage('');
                                    onChange({ entryMode: 'catalog' });
                                }}
                                placeholder="Nhập hoặc quét mã để tìm trong kho"
                            />
                            <button
                                type="button"
                                title={scanLoading ? 'Đang quét...' : 'Quét QR / mã vạch'}
                                aria-label="Quét QR / mã vạch"
                                onClick={() => fileInputRef.current?.click()}
                                style={{
                                    ...S.iconBtn(txTheme.gradient),
                                    width: 42,
                                    height: 42,
                                    flexShrink: 0,
                                    color: 'white',
                                    fontSize: 20,
                                }}
                            >
                                <IoQrCodeOutline />
                            </button>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                capture="environment"
                                style={{ display: 'none' }}
                                onChange={handleScanFile}
                            />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                            {catalogQuery ? (
                                catalogMatches.length > 0 ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                        {catalogMatches.map(item => {
                                            const unavailable = isUnavailableInventoryItem(item);
                                            return (
                                                <button
                                                    key={item.id}
                                                    type="button"
                                                    disabled={unavailable}
                                                    onClick={() => applyInventoryItem(item, entryMode === 'camera' ? 'camera' : 'catalog')}
                                                    style={{
                                                        borderRadius: 16,
                                                        border: unavailable ? '1px dashed #fca5a5' : `1px solid ${txTheme.softBorder}`,
                                                        background: unavailable ? 'white' : txTheme.softBg,
                                                        padding: '10px 12px',
                                                        textAlign: 'left',
                                                        cursor: unavailable ? 'not-allowed' : 'pointer',
                                                        opacity: unavailable ? 0.72 : 1,
                                                    }}
                                                >
                                                    <div style={{ fontSize: 11, fontWeight: 800, color: unavailable ? '#94a3b8' : '#111827', textDecoration: unavailable ? 'line-through' : 'none' }}>
                                                        {item.ma_hang || 'Không có mã'}
                                                    </div>
                                                    <div style={{ fontSize: 10, color: '#64748b', marginTop: 3, textDecoration: unavailable ? 'line-through' : 'none' }}>
                                                        {item.ncc || 'Không có tên'} · {item.tuoi_vang || 'Chưa có tuổi vàng'}{unavailable ? ` · ${inventoryStatusLabel(item)}` : ''}
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div style={{ fontSize: 10, color: '#64748b' }}>Không có kết quả phù hợp trong kho hàng.</div>
                                )
                            ) : null}
                        </div>

                        {(line.productCode || line.itemName) && (
                            <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 16, background: txTheme.softBg, border: `1px solid ${txTheme.softBorder}` }}>
                                <div style={{ fontSize: 10, fontWeight: 800, color: '#111827' }}>
                                    {line.productCode || 'Chưa có mã'}{line.itemName ? ` · ${line.itemName}` : ''}
                                </div>
                                <div style={{ fontSize: 10, color: '#64748b', marginTop: 3 }}>
                                    Tuổi vàng áp dụng: {line.product || '—'}
                                </div>
                            </div>
                        )}

                        {lookupMessage && (
                            <div style={{ marginTop: 8, fontSize: 10, color: lineAccent, lineHeight: 1.45 }}>{lookupMessage}</div>
                        )}
                    </div>
                )}

                {/* Sá»‘ lÆ°á»£ng */}
                <div>
                    <span style={S.label}>{isGold ? 'Số lượng' : 'Số tiền'}</span>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 32px', gap: 6 }}>
                        <input
                            style={S.inp}
                            type="number"
                            inputMode="decimal"
                            min="0"
                            step={quantityStep}
                            value={line.qty}
                            onChange={e => set('qty', normalizeNonNegativeNumberInput(e.target.value))}
                        />
                        <div style={{ display: 'grid', gridTemplateRows: '1fr 1fr', gap: 4 }}>
                            <button
                                type="button"
                                onClick={() => adjustQty(quantityStep)}
                                style={{
                                    borderRadius: 10,
                                    border: `1px solid ${txTheme.softBorder}`,
                                    background: txTheme.softBg,
                                    color: lineAccent,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                    padding: 0,
                                }}
                                aria-label="Tăng số lượng"
                                title="Tăng số lượng"
                            >
                                <IoChevronUpOutline />
                            </button>
                            <button
                                type="button"
                                onClick={() => adjustQty(-quantityStep)}
                                style={{
                                    borderRadius: 10,
                                    border: `1px solid ${txTheme.softBorder}`,
                                    background: txTheme.softBg,
                                    color: lineAccent,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                    padding: 0,
                                }}
                                aria-label="Giảm số lượng"
                                title="Giảm số lượng"
                            >
                                <IoChevronDownOutline />
                            </button>
                        </div>
                    </div>
                </div>

                {/* GiÃ¡ */}
                <div>
                    <span style={S.label}>
                        {effectiveCat === 'gold'
                            ? (line.tx === 'buy' ? 'Giá mua' : line.tx === 'trade' ? 'Giá đổi' : 'Giá bán')
                            : (line.tx === 'buy' ? 'Tỷ giá mua' : line.tx === 'trade' ? 'Tỷ giá đổi' : 'Tỷ giá bán')}
                    </span>
                    <input style={{ ...S.inp, color: lineAccent }}
                        type="text" inputMode="numeric"
                        value={fmtCalc(curRate)}
                        onChange={e => {
                            const v = normalizeTradeRate(line.cat, e.target.value);
                            if (line.tx === 'buy') onChange({ customBuy: v });
                            else if (line.tx === 'trade') onChange({ customTrade: v });
                            else onChange({ customSell: v });
                        }} />
                </div>

                {isTrade && (
                    <div style={{ gridColumn: '1 / -1' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                            <div>
                                <span style={S.label}>Công</span>
                                <input
                                    list={tradeMoneySuggestionId}
                                    style={{ ...S.inp, color: lineAccent }}
                                    type="text"
                                    inputMode="numeric"
                                    value={line.tradeLabor ? fmtCalc(line.tradeLabor) : ''}
                                    onChange={e => set('tradeLabor', normalizeTradeRate('money', e.target.value))}
                                    placeholder="Nhập tiền công"
                                />
                            </div>
                            <div>
                                <span style={S.label}>Bù</span>
                                <input
                                    list={tradeMoneySuggestionId}
                                    style={{ ...S.inp, color: lineAccent }}
                                    type="text"
                                    inputMode="numeric"
                                    value={line.tradeComp ? fmtCalc(line.tradeComp) : ''}
                                    onChange={e => set('tradeComp', normalizeTradeRate('money', e.target.value))}
                                    placeholder="Nhập tiền bù"
                                />
                            </div>
                        </div>
                        <datalist id={tradeMoneySuggestionId}>
                            {VN_MONEY_SUGGESTIONS.map(option => (
                                <option key={option} value={option} />
                            ))}
                        </datalist>
                    </div>
                )}
            </div>

            {/* Amount */}
            <div style={{ marginTop: 10 }}>
                <span style={calcValueStyle(lineAccent, 21)}>
                    {isPositiveTransaction(line.tx) ? '+' : '-'}{fmtCalc(value)}
                </span>
            </div>
        </div>
    );
}

function RepairLine({ line, inventoryItems, repairMode, onChange, onRemove, showRemove }) {
    const fileInputRef = useRef(null);
    const [catalogQuery, setCatalogQuery] = useState(line.productCode || '');
    const [lookupMessage, setLookupMessage] = useState('');
    const [scanLoading, setScanLoading] = useState(false);

    const entryMode = normalizeGoldEntryMode(line.entryMode);
    const catalogMatches = filterInventoryItems(inventoryItems, catalogQuery);
    const nextWeight = computeRepairNextWeight(line, repairMode);

    useEffect(() => {
        setCatalogQuery(line.productCode || '');
    }, [line.productCode]);

    const applyInventoryItem = (item, source = entryMode) => {
        if (!item) {
            setLookupMessage('Không tìm thấy sản phẩm trong kho.');
            return;
        }
        if (isUnavailableInventoryItem(item)) {
            setLookupMessage(`Sản phẩm ${item.ma_hang || item.ncc || ''} đang ở trạng thái ${inventoryStatusLabel(item)}, không thể chọn.`);
            return;
        }
        onChange({
            entryMode: source,
            itemId: item.id,
            productCode: item.ma_hang || '',
            itemName: item.ncc || '',
            nhom_hang: item.nhom_hang || '',
            quay_nho: item.quay_nho || '',
            tuoi_vang: item.tuoi_vang || '',
            status: item.status || '',
            tl_vang_hien_tai: item.tl_vang || '',
        });
        setCatalogQuery(item.ma_hang || item.ncc || '');
        setLookupMessage(`Đã chọn ${item.ma_hang || 'sản phẩm'}${item.ncc ? ` · ${item.ncc}` : ''}.`);
    };

    const handleScanFile = async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        setScanLoading(true);
        try {
            const scannedCode = await scanCodeFromFile(file);
            onChange({ productCode: scannedCode, entryMode: 'camera' });
            const matched = findInventoryByCode(inventoryItems, scannedCode);
            if (matched) {
                applyInventoryItem(matched, 'camera');
            } else {
                setLookupMessage(`Đã quét được mã ${scannedCode}, nhưng chưa thấy trong kho.`);
            }
        } catch (err) {
            setLookupMessage(err.message || 'Không quét được QR.');
        } finally {
            setScanLoading(false);
        }
    };

    return (
        <div style={{ ...S.card, border: '1.5px solid rgba(15,23,42,.08)' }}>
            {showRemove && (
                <button onClick={onRemove} style={{ ...S.iconBtn('#ef4444'), width: 28, height: 28, fontSize: 13, position: 'absolute', top: -8, right: -8, zIndex: 2 }}>×</button>
            )}

            <div>
                <span style={S.label}>Chọn hàng từ kho</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                    <input
                        className="sale-pos-catalog-input"
                        style={{ ...S.inp, textAlign: 'left', flex: 1, borderRadius: 16 }}
                        value={catalogQuery}
                        onChange={e => {
                            setCatalogQuery(e.target.value);
                            setLookupMessage('');
                            onChange({ entryMode: 'catalog' });
                        }}
                        placeholder="Nhập hoặc quét mã để tìm trong kho"
                    />
                    <button
                        type="button"
                        title={scanLoading ? 'Đang quét...' : 'Quét QR / mã vạch'}
                        aria-label="Quét QR / mã vạch"
                        onClick={() => fileInputRef.current?.click()}
                        style={{
                            ...S.iconBtn(APP_GRADIENT_BRIGHT),
                            width: 42,
                            height: 42,
                            flexShrink: 0,
                            color: 'white',
                            fontSize: 20,
                        }}
                    >
                        <IoQrCodeOutline />
                    </button>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        style={{ display: 'none' }}
                        onChange={handleScanFile}
                    />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                    {catalogQuery ? (
                        catalogMatches.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {catalogMatches.map(item => {
                                    const unavailable = isUnavailableInventoryItem(item);
                                    return (
                                        <button
                                            key={item.id}
                                            type="button"
                                            disabled={unavailable}
                                            onClick={() => applyInventoryItem(item, entryMode === 'camera' ? 'camera' : 'catalog')}
                                            style={{
                                                borderRadius: 16,
                                                border: unavailable ? '1px dashed #fca5a5' : '1px solid #dbe4ee',
                                                background: 'white',
                                                padding: '10px 12px',
                                                textAlign: 'left',
                                                cursor: unavailable ? 'not-allowed' : 'pointer',
                                                opacity: unavailable ? 0.72 : 1,
                                            }}
                                        >
                                            <div style={{ fontSize: 11, fontWeight: 800, color: unavailable ? '#94a3b8' : '#111827', textDecoration: unavailable ? 'line-through' : 'none' }}>
                                                {item.ma_hang || 'Không có mã'}
                                            </div>
                                            <div style={{ fontSize: 10, color: '#64748b', marginTop: 3, textDecoration: unavailable ? 'line-through' : 'none' }}>
                                                {item.ncc || 'Không có tên'} · {item.tuoi_vang || 'Chưa có tuổi vàng'} · {inventoryStatusLabel(item)}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        ) : (
                            <div style={{ fontSize: 10, color: '#64748b' }}>Không có kết quả phù hợp trong kho hàng.</div>
                        )
                    ) : null}
                </div>
            </div>

            {(line.productCode || line.itemName) && (
                <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 16, background: 'white', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: 11, fontWeight: 900, color: '#111827' }}>
                        {line.productCode || 'Chưa có mã'}{line.itemName ? ` · ${line.itemName}` : ''}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
                        <div>
                            <div style={{ fontSize: 8, color: '#6b7280', fontWeight: 700 }}>TUỔI VÀNG</div>
                            <div style={{ fontSize: 10, color: '#111827', fontWeight: 700 }}>{line.tuoi_vang || '—'}</div>
                        </div>
                        <div>
                            <div style={{ fontSize: 8, color: '#6b7280', fontWeight: 700 }}>QUẦY NHỎ</div>
                            <div style={{ fontSize: 10, color: '#111827', fontWeight: 700 }}>{line.quay_nho || '—'}</div>
                        </div>
                        <div>
                            <div style={{ fontSize: 8, color: '#6b7280', fontWeight: 700 }}>TL HIỆN TẠI</div>
                            <div style={{ fontSize: 10, color: '#111827', fontWeight: 700 }}>{line.tl_vang_hien_tai || '0'}</div>
                        </div>
                        <div>
                            <div style={{ fontSize: 8, color: '#6b7280', fontWeight: 700 }}>TRẠNG THÁI</div>
                            <div style={{ fontSize: 10, color: '#111827', fontWeight: 700 }}>{line.status || 'Tồn kho'}</div>
                        </div>
                    </div>
                </div>
            )}

            {repairMode === 'sua' ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
                    <div>
                        <span style={S.label}>Thêm TL vàng</span>
                        <input
                            style={{ ...S.inp, textAlign: 'left' }}
                            type="number"
                            inputMode="decimal"
                            min="0"
                            step="0.0001"
                            value={line.them_tl_vang || ''}
                            onChange={e => onChange({ them_tl_vang: e.target.value })}
                            placeholder="0.0000"
                        />
                    </div>
                    <div>
                        <span style={S.label}>Bớt TL vàng</span>
                        <input
                            style={{ ...S.inp, textAlign: 'left' }}
                            type="number"
                            inputMode="decimal"
                            min="0"
                            step="0.0001"
                            value={line.bot_tl_vang || ''}
                            onChange={e => onChange({ bot_tl_vang: e.target.value })}
                            placeholder="0.0000"
                        />
                    </div>
                    <div style={{ gridColumn: '1 / -1', padding: '9px 12px', borderRadius: 12, background: 'rgba(15,23,42,.04)', color: '#334155', fontSize: 10, fontWeight: 700 }}>
                        TL vàng dự kiến sau sửa: {nextWeight || '0'}
                    </div>
                </div>
            ) : (
                <div style={{ marginTop: 10, padding: '9px 12px', borderRadius: 12, background: '#fff7ed', color: '#9a3412', fontSize: 10, lineHeight: 1.5 }}>
                    Phiếu bỏ hàng sẽ chuyển sản phẩm sang trạng thái `Đã bỏ` và không yêu cầu nhập thêm hoặc bớt trọng lượng vàng.
                </div>
            )}

            <div style={{ marginTop: 10 }}>
                <span style={S.label}>Ghi chú dòng hàng</span>
                <textarea
                    style={{ ...S.inp, minHeight: 72, resize: 'none', textAlign: 'left', padding: 10 }}
                    value={line.ghi_chu || ''}
                    onChange={e => onChange({ ghi_chu: e.target.value })}
                    placeholder="Ghi chú cho sản phẩm này"
                />
            </div>

            {lookupMessage && (
                <div style={{ marginTop: 8, fontSize: 10, color: '#1d4ed8', lineHeight: 1.45 }}>{lookupMessage}</div>
            )}
        </div>
    );
}

function ConfirmDialog({ open, title, message, confirmLabel, cancelLabel = 'Hủy', loading = false, onClose, onConfirm }) {
    if (!open) return null;

    return (
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1600, background: 'rgba(15,23,42,.42)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18 }}>
            <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 420, borderRadius: 24, background: 'rgba(255,255,255,.98)', boxShadow: '0 24px 60px rgba(15,23,42,.24)', border: '1px solid rgba(15,23,42,.08)', padding: 18 }}>
                <div style={{ fontSize: 15, fontWeight: 900, color: '#111827' }}>{title}</div>
                <div style={{ fontSize: 12, lineHeight: 1.55, color: '#475569', marginTop: 10 }}>{message}</div>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
                    <button type="button" onClick={onClose} disabled={loading} style={{ ...S.pillBtn('#ffffff', '#111827'), boxShadow: 'none', border: '1px solid #dbe4ee' }}>
                        {cancelLabel}
                    </button>
                    <button type="button" onClick={onConfirm} disabled={loading} style={S.pillBtn('linear-gradient(135deg,#dc2626,#f97316)', 'white')}>
                        {loading ? 'Đang cập nhật...' : confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}

function CustomerIdOcrModal({ open, loading, message, side, onSideChange, onClose, onCapture, onPickFile }) {
    const previewAspect = 16 / 9;
    const videoRef = useRef(null);
    const fileInputRef = useRef(null);
    const streamRef = useRef(null);
    const [cameraReady, setCameraReady] = useState(false);
    const [cameraError, setCameraError] = useState('');

    useEffect(() => {
        if (!open) return undefined;
        let cancelled = false;

        const stopStream = () => {
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
                streamRef.current = null;
            }
            if (videoRef.current) {
                videoRef.current.srcObject = null;
            }
        };

        const startCamera = async () => {
            setCameraReady(false);
            setCameraError('');
            try {
                if (!navigator.mediaDevices?.getUserMedia) {
                    throw new Error('Thiết bị này chưa hỗ trợ camera trực tiếp.');
                }
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        facingMode: { ideal: 'environment' },
                        width: { ideal: 1080 },
                        height: { ideal: 1920 },
                    },
                    audio: false,
                });
                if (cancelled) {
                    stream.getTracks().forEach(track => track.stop());
                    return;
                }
                streamRef.current = stream;
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    videoRef.current.onloadedmetadata = () => {
                        videoRef.current?.play?.().catch(() => { });
                        setCameraReady(true);
                    };
                }
            } catch (error) {
                if (!cancelled) {
                    setCameraError(error.message || 'Không mở được camera.');
                }
            }
        };

        startCamera().catch(() => { });
        return () => {
            cancelled = true;
            stopStream();
        };
    }, [open]);

    const handleCapture = async () => {
        const video = videoRef.current;
        if (!video?.videoWidth || !video?.videoHeight || loading) return;

        const sourceWidth = video.videoWidth;
        const sourceHeight = video.videoHeight;
        const sourceAspect = sourceWidth / sourceHeight;
        let cropWidth = sourceWidth;
        let cropHeight = sourceHeight;

        if (sourceAspect > previewAspect) {
            cropWidth = Math.round(sourceHeight * previewAspect);
            cropHeight = sourceHeight;
        } else {
            cropWidth = sourceWidth;
            cropHeight = Math.round(sourceWidth / previewAspect);
        }

        const cropX = Math.max(0, Math.round((sourceWidth - cropWidth) / 2));
        const cropY = Math.max(0, Math.round((sourceHeight - cropHeight) / 2));

        const canvas = document.createElement('canvas');
        canvas.width = cropWidth;
        canvas.height = cropHeight;
        const context = canvas.getContext('2d');
        if (!context) return;

        context.drawImage(video, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
        const imageBase64 = canvas.toDataURL('image/jpeg', 0.95).split(',')[1] || '';
        await onCapture({
            imageBase64,
            mimeType: 'image/jpeg',
            fileName: 'cccd-camera.jpg',
            side,
        });
    };

    if (!open) return null;

    const helperColor = message?.startsWith('OCR CCCD') ? '#0f766e' : '#dc2626';

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1700, background: 'rgba(15,23,42,.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18 }}>
            <div style={{ width: '100%', maxWidth: 420, borderRadius: 28, background: '#0f172a', color: 'white', boxShadow: '0 28px 60px rgba(15,23,42,.38)', overflow: 'hidden', border: '1px solid rgba(255,255,255,.08)' }}>
                <div style={{ padding: '16px 16px 10px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                    <div>
                        <div style={{ fontSize: 15, fontWeight: 900 }}>OCR CCCD</div>
                        <div style={{ marginTop: 4, fontSize: 11, lineHeight: 1.5, color: '#cbd5e1' }}>
                            {side === 'front'
                                ? 'Dùng toàn bộ khung ngang để chụp và xoay CCCD dựng đứng lại trong khung. Khi bấm đọc, hệ thống sẽ lấy đúng vùng camera đang thấy và điền thông tin ngay khi OCR xong.'
                                : 'Dùng toàn bộ khung ngang để chụp và xoay mặt sau CCCD dựng đứng lại trong khung. Khi bấm đọc, hệ thống sẽ OCR toàn bộ nội dung đang thấy và lưu lại ngay.'}
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        style={{ width: 34, height: 34, borderRadius: '50%', border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.06)', color: 'white', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                    >
                        <IoCloseOutline />
                    </button>
                </div>

                <div style={{ padding: '0 16px 16px' }}>
                    <div style={{ display: 'inline-flex', borderRadius: 999, padding: 4, gap: 4, background: 'rgba(255,255,255,.08)', marginBottom: 12 }}>
                        {[
                            { key: 'front', label: 'Mặt trước' },
                            { key: 'back', label: 'Mặt sau' },
                        ].map(option => (
                            <button
                                key={option.key}
                                type="button"
                                onClick={() => onSideChange(option.key)}
                                style={{
                                    border: 'none',
                                    borderRadius: 999,
                                    padding: '8px 12px',
                                    background: side === option.key ? 'linear-gradient(135deg,#0f766e,#14b8a6)' : 'transparent',
                                    color: 'white',
                                    fontSize: 11,
                                    fontWeight: 800,
                                    cursor: 'pointer',
                                }}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>
                    <div style={{ position: 'relative', borderRadius: 24, overflow: 'hidden', background: '#020617', aspectRatio: '16 / 9' }}>
                        <video
                            ref={videoRef}
                            autoPlay
                            muted
                            playsInline
                            style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: cameraError ? 0.2 : 1 }}
                        />
                        <div style={{ position: 'absolute', left: 16, right: 16, bottom: 16, padding: '10px 12px', borderRadius: 16, background: 'rgba(15,23,42,.58)', color: '#f8fafc', fontSize: 11, lineHeight: 1.45, textAlign: 'center', backdropFilter: 'blur(10px)' }}>
                            {side === 'front'
                                ? 'Giữ CCCD dựng đứng, nằm trọn trong khung ngang và đủ sáng rồi bấm `Đọc ngay`.'
                                : 'Giữ mặt sau CCCD dựng đứng, nằm trọn trong khung ngang và đủ sáng rồi bấm `Đọc ngay`.'}
                        </div>
                        {loading && (
                            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15,23,42,.45)', color: 'white', fontSize: 13, fontWeight: 800 }}>
                                Đang đọc CCCD...
                            </div>
                        )}
                        {cameraError && (
                            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center', color: '#fde68a', fontSize: 12, lineHeight: 1.55 }}>
                                {cameraError}
                            </div>
                        )}
                    </div>

                    {message ? (
                        <div style={{ marginTop: 10, fontSize: 10, color: helperColor, lineHeight: 1.45 }}>
                            {message}
                        </div>
                    ) : null}

                    <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={loading}
                            style={{ ...S.pillBtn('rgba(255,255,255,.08)', '#f8fafc'), flex: 1, justifyContent: 'center', border: '1px solid rgba(255,255,255,.08)', boxShadow: 'none' }}
                        >
                            <IoImagesOutline />
                            <span>Chọn ảnh</span>
                        </button>
                        <button
                            type="button"
                            onClick={handleCapture}
                            disabled={loading || !cameraReady}
                            style={{ ...S.pillBtn('linear-gradient(135deg,#0f766e,#14b8a6)', 'white'), flex: 1, justifyContent: 'center', opacity: loading || !cameraReady ? 0.6 : 1 }}
                        >
                            <IoCameraOutline />
                            <span>{loading ? 'Đang đọc...' : 'Đọc ngay'}</span>
                        </button>
                    </div>

                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        style={{ display: 'none' }}
                        onChange={e => {
                            const file = e.target.files?.[0];
                            e.target.value = '';
                            if (file) onPickFile(file, side);
                        }}
                    />
                </div>
            </div>
        </div>
    );
}

function CustomerQrScanModal({ open, loading, message, onClose, onDetected, onPickFile }) {
    const videoRef = useRef(null);
    const fileInputRef = useRef(null);
    const streamRef = useRef(null);
    const scanIntervalRef = useRef(null);
    const scanningBusyRef = useRef(false);
    const detectorRef = useRef(null);
    const [cameraReady, setCameraReady] = useState(false);
    const [cameraError, setCameraError] = useState('');

    useEffect(() => {
        if (!open) return undefined;
        let cancelled = false;

        const stopStream = () => {
            if (scanIntervalRef.current) {
                clearInterval(scanIntervalRef.current);
                scanIntervalRef.current = null;
            }
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
                streamRef.current = null;
            }
            if (videoRef.current) {
                videoRef.current.srcObject = null;
            }
        };

        const beginScanning = () => {
            if (!detectorRef.current || scanIntervalRef.current) return;
            scanIntervalRef.current = setInterval(async () => {
                const video = videoRef.current;
                if (!video || scanningBusyRef.current || loading || video.readyState < 2) return;
                scanningBusyRef.current = true;
                try {
                    const results = await detectorRef.current.detect(video);
                    const match = results.find(item => item?.rawValue);
                    if (match?.rawValue) {
                        clearInterval(scanIntervalRef.current);
                        scanIntervalRef.current = null;
                        await onDetected(match.rawValue);
                    }
                } catch {
                    // ignore frame-level decode errors and continue scanning
                } finally {
                    scanningBusyRef.current = false;
                }
            }, 350);
        };

        const startCamera = async () => {
            setCameraReady(false);
            setCameraError('');
            if (typeof window === 'undefined' || !('BarcodeDetector' in window)) {
                throw new Error('Thiết bị này chưa hỗ trợ quét QR trực tiếp.');
            }
            detectorRef.current = new window.BarcodeDetector({ formats: ['qr_code'] });
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: { ideal: 'environment' },
                    width: { ideal: 1280 },
                    height: { ideal: 1280 },
                },
                audio: false,
            });
            if (cancelled) {
                stream.getTracks().forEach(track => track.stop());
                return;
            }
            streamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                videoRef.current.onloadedmetadata = () => {
                    videoRef.current?.play?.().catch(() => { });
                    setCameraReady(true);
                    beginScanning();
                };
            }
        };

        startCamera().catch(error => {
            if (!cancelled) {
                setCameraError(error.message || 'Không mở được camera quét QR.');
            }
        });

        return () => {
            cancelled = true;
            stopStream();
        };
    }, [open, loading]);

    if (!open) return null;

    const helperMessage = loading
        ? 'Đang parse QR...'
        : message || (cameraReady ? 'Đưa mã QR vào chính giữa khung vuông để hệ thống tự nhận.' : '');
    const helperColor = loading
        ? '#f8fafc'
        : message?.startsWith('QR CCCD xong') ? '#0f766e' : message ? '#dc2626' : '#cbd5e1';

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1710, background: 'rgba(15,23,42,.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18 }}>
            <div style={{ width: '100%', maxWidth: 420, borderRadius: 28, background: '#0f172a', color: 'white', boxShadow: '0 28px 60px rgba(15,23,42,.38)', overflow: 'hidden', border: '1px solid rgba(255,255,255,.08)' }}>
                <div style={{ padding: '16px 16px 10px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                    <div>
                        <div style={{ fontSize: 15, fontWeight: 900 }}>Quét QR CCCD</div>
                        <div style={{ marginTop: 4, fontSize: 11, lineHeight: 1.5, color: '#cbd5e1' }}>
                            Đưa ảnh QR vào khung vuông. Khi nhận được dữ liệu, hệ thống sẽ parse QR rồi tự điền vào các ô khách hàng.
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        style={{ width: 34, height: 34, borderRadius: '50%', border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.06)', color: 'white', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                    >
                        <IoCloseOutline />
                    </button>
                </div>

                <div style={{ padding: '0 16px 16px' }}>
                    <div style={{ position: 'relative', borderRadius: 24, overflow: 'hidden', background: '#020617', aspectRatio: '1 / 1' }}>
                        <video
                            ref={videoRef}
                            autoPlay
                            muted
                            playsInline
                            style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: cameraError ? 0.2 : 1 }}
                        />
                        <div
                            style={{
                                position: 'absolute',
                                left: '50%',
                                top: '50%',
                                width: '58%',
                                aspectRatio: '1 / 1',
                                transform: 'translate(-50%, -50%)',
                                borderRadius: 24,
                                border: '2px solid rgba(255,255,255,.96)',
                                boxShadow: '0 0 0 9999px rgba(2,6,23,.45)',
                                pointerEvents: 'none',
                            }}
                        />
                        {loading && (
                            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15,23,42,.4)', color: 'white', fontSize: 14, fontWeight: 900 }}>
                                Đang parse QR...
                            </div>
                        )}
                        {cameraError && (
                            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center', color: '#fde68a', fontSize: 12, lineHeight: 1.55 }}>
                                {cameraError}
                            </div>
                        )}
                    </div>

                    {helperMessage ? (
                        <div style={{ marginTop: 10, fontSize: 10, color: helperColor, lineHeight: 1.45 }}>
                            {helperMessage}
                        </div>
                    ) : null}

                    <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={loading}
                            style={{ ...S.pillBtn('rgba(255,255,255,.08)', '#f8fafc'), flex: 1, justifyContent: 'center', border: '1px solid rgba(255,255,255,.08)', boxShadow: 'none' }}
                        >
                            <IoImagesOutline />
                            <span>Chọn ảnh QR</span>
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            style={{ ...S.pillBtn('#ffffff', '#111827'), flex: 1, justifyContent: 'center', boxShadow: 'none' }}
                        >
                            <span>Đóng</span>
                        </button>
                    </div>

                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        style={{ display: 'none' }}
                        onChange={e => {
                            const file = e.target.files?.[0];
                            e.target.value = '';
                            if (file) onPickFile(file);
                        }}
                    />
                </div>
            </div>
        </div>
    );
}

/* â”€â”€ Screen 1: ORDER â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function OrderScreen({
    rates,
    inventoryItems,
    lines,
    setLines,
    total,
    onNext,
    onSaveDraft,
    onResetForm,
    orderId,
    draftMessage,
    customerInfo,
    setCustomerInfo,
    customerInfoOpen,
    setCustomerInfoOpen,
}) {
    const greeting = getDayGreeting();
    const totalLabel = total > 0 ? 'KHÁCH TRẢ' : total < 0 ? 'KHÁCH NHẬN' : 'TỔNG TẠM TÍNH';
    const [customerOcrOpen, setCustomerOcrOpen] = useState(false);
    const [customerQrOpen, setCustomerQrOpen] = useState(false);
    const [customerOcrSide, setCustomerOcrSide] = useState('front');
    const [cccdOcrLoading, setCccdOcrLoading] = useState(false);
    const [cccdQrLoading, setCccdQrLoading] = useState(false);
    const [cccdOcrMessage, setCccdOcrMessage] = useState('');
    const addLine = () => {
        setLines(ls => [...ls, createDefaultLine(rates)]);
    };

    const updateLine = (id, patch) => setLines(ls => ls.map(l => l.id === id ? { ...l, ...patch } : l));
    const removeLine = id => setLines(ls => ls.filter(l => l.id !== id));
    const updateCustomerInfo = (field, value) => {
        setCustomerInfo(prev => ({ ...prev, [field]: value }));
    };
    const customerSummary = [customerInfo?.name, customerInfo?.phone || customerInfo?.cccd].filter(Boolean).join(' · ');
    const runCustomerOcr = async ({ imageBase64, mimeType = 'image/jpeg', fileName = 'cccd.jpg', side = 'front' }) => {
        if (!imageBase64) return;
        setCccdOcrLoading(true);
        setCccdOcrMessage('');
        try {
            const response = await fetch(`${API}/api/ocr`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    image_base64: imageBase64,
                    mime_type: mimeType,
                    file_name: fileName,
                }),
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(payload.error || `HTTP ${response.status}`);
            }
            const rawText = String(payload.text || '').trim();
            const parsed = extractCustomerInfoFromOcrText(rawText);
            setCustomerInfo(prev => {
                if (side === 'back') {
                    return {
                        ...prev,
                        backText: rawText || prev.backText,
                    };
                }
                return {
                    ...prev,
                    name: parsed.name || prev.name,
                    cccd: parsed.cccd || prev.cccd,
                    dob: parsed.dob || prev.dob,
                    gender: parsed.gender || prev.gender,
                    nationality: parsed.nationality || prev.nationality,
                    origin: parsed.origin || prev.origin,
                    residence: parsed.residence || prev.residence,
                    expiry: parsed.expiry || prev.expiry,
                    address: parsed.address || prev.address,
                    phone: parsed.phone || prev.phone,
                };
            });
            setCustomerInfoOpen(true);
            setCustomerOcrOpen(false);
            setCccdOcrMessage(
                side === 'back'
                    ? (rawText ? 'OCR mặt sau xong.' : 'OCR mặt sau xong, bạn kiểm tra lại nội dung.')
                    : parsed.appliedFields.length
                    ? `OCR CCCD xong: ${parsed.appliedFields.join(', ')}.`
                    : 'OCR xong, bạn kiểm tra lại thông tin để chỉnh tay nếu cần.'
            );
        } catch (error) {
            setCccdOcrMessage(error.message || 'Không OCR được CCCD.');
        } finally {
            setCccdOcrLoading(false);
        }
    };
    const handleCccdOcrFile = async (file, side = 'front') => {
        if (!file) return;
        try {
            const imageBase64 = await readImageAsBase64(file);
            await runCustomerOcr({
                imageBase64,
                mimeType: file.type || 'image/jpeg',
                fileName: file.name || 'cccd-upload.jpg',
                side,
            });
        } catch (error) {
            setCccdOcrMessage(error.message || 'Không đọc được ảnh CCCD.');
        }
    };
    const applyCustomerQrPayload = async (qrPayload) => {
        setCccdQrLoading(true);
        setCccdOcrMessage('');
        try {
            setCccdOcrMessage('Đang parse QR...');
            await new Promise(resolve => setTimeout(resolve, 180));
            const parsed = extractCustomerInfoFromQrPayload(qrPayload);
            if (!parsed.appliedFields.length) {
                throw new Error('QR CCCD không đúng định dạng dữ liệu mong đợi.');
            }
            setCustomerInfo(prev => ({
                ...prev,
                cccd: parsed.cccd || prev.cccd,
                oldId: parsed.oldId || prev.oldId,
                name: parsed.name || prev.name,
                dob: parsed.dob || prev.dob,
                gender: parsed.gender || prev.gender,
                residence: parsed.residence || prev.residence,
                address: parsed.address || prev.address,
                issueDate: parsed.issueDate || prev.issueDate,
            }));
            setCustomerInfoOpen(true);
            setCustomerQrOpen(false);
            setCccdOcrMessage(`QR CCCD xong: ${parsed.appliedFields.join(', ')}.`);
        } catch (error) {
            setCccdOcrMessage(error.message || 'Không đọc được QR CCCD.');
        } finally {
            setCccdQrLoading(false);
        }
    };
    const handleCustomerQrFile = async (file) => {
        if (!file) return;
        try {
            const qrPayload = await scanCodeFromFile(file);
            await applyCustomerQrPayload(qrPayload);
        } catch (error) {
            setCccdOcrMessage(error.message || 'Không đọc được QR CCCD.');
        }
    };

    return (
        <div style={S.screen}>
            <CustomerQrScanModal
                open={customerQrOpen}
                loading={cccdQrLoading}
                message={cccdOcrMessage}
                onClose={() => setCustomerQrOpen(false)}
                onDetected={applyCustomerQrPayload}
                onPickFile={handleCustomerQrFile}
            />
            <CustomerIdOcrModal
                open={customerOcrOpen}
                loading={cccdOcrLoading}
                message={cccdOcrMessage}
                side={customerOcrSide}
                onSideChange={setCustomerOcrSide}
                onClose={() => setCustomerOcrOpen(false)}
                onCapture={runCustomerOcr}
                onPickFile={handleCccdOcrFile}
            />
            <div style={{ height: 8, flexShrink: 0 }} />

            <div style={{ ...S.scrollArea, paddingTop: 4 }}>
                <div style={{ ...S.heroCard, padding: '8px 14px 6px', borderRadius: 22 }}>
                    <div style={{ ...S.heroBg, borderRadius: 22 }} />
                    <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, minHeight: 68 }}>
                        <div style={{ ...S.heroTextWrap, maxWidth: 'none', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', alignSelf: 'center', paddingTop: 0, textAlign: 'center', paddingInline: 12, minHeight: 54 }}>
                            <div style={{ ...S.heroTitle, fontSize: 14, lineHeight: 1.08 }}>{greeting}</div>
                        </div>
                        <div style={{ width: 82, height: 82, position: 'relative', flexShrink: 0 }}>
                            <div style={{ position: 'absolute', right: 4, top: 6, width: 62, height: 62, borderRadius: '50%', background: 'linear-gradient(135deg, rgba(255,183,77,.95), rgba(244,114,182,.65))', filter: 'blur(4px)' }} />
                            <div style={{ position: 'absolute', right: 14, top: 16, width: 42, height: 42, borderRadius: '50%', background: 'rgba(255,255,255,.68)', boxShadow: 'inset 0 0 0 6px rgba(255,255,255,.28)' }} />
                            <img src="/logo.png" alt="Vạn Kim Jewelry" style={{ ...S.heroLogo, width: 72, right: 0, bottom: 0 }} />
                        </div>
                    </div>
                </div>

                <div style={S.softPanel}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', minWidth: 0 }}>
                            <span style={{ ...S.sub, marginTop: 0, whiteSpace: 'nowrap', fontWeight: 700 }}>{orderId}</span>
                            <span style={{ ...S.sub, marginTop: 0 }}>· {today()}</span>
                        </div>
                        <button
                            type="button"
                            onClick={onResetForm}
                            style={{
                                ...S.iconBtn('linear-gradient(135deg,#111827,#334155)'),
                                width: 38,
                                height: 38,
                                fontSize: 16,
                                color: 'white',
                                boxShadow: '0 8px 18px rgba(15,23,42,.10)',
                                cursor: 'pointer',
                            }}
                            title="Làm mới biểu mẫu"
                            aria-label="Làm mới biểu mẫu"
                        >
                            <IoRefreshOutline />
                        </button>
                    </div>
                    <div style={{ marginBottom: 12 }}>
                        <div
                            style={{
                                width: '100%',
                                border: '1px solid #dbe4ee',
                                background: 'rgba(248,250,252,.96)',
                                borderRadius: 16,
                                padding: '10px 12px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 10,
                            }}
                        >
                            <button
                                type="button"
                                onClick={() => setCustomerInfoOpen(open => !open)}
                                style={{
                                    flex: 1,
                                    minWidth: 0,
                                    border: 'none',
                                    background: 'transparent',
                                    padding: 0,
                                    margin: 0,
                                    textAlign: 'left',
                                    cursor: 'pointer',
                                }}
                                aria-expanded={customerInfoOpen}
                                aria-label="Thông tin khách hàng"
                            >
                                <div style={{ minWidth: 0 }}>
                                    <div style={{ fontSize: 11, fontWeight: 800, color: '#111827' }}>Thông tin khách hàng</div>
                                    {!customerInfoOpen && customerSummary ? (
                                        <div style={{ marginTop: 3, fontSize: 10, color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {customerSummary}
                                        </div>
                                    ) : null}
                                </div>
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setCustomerInfoOpen(true);
                                    setCccdOcrMessage('');
                                    setCustomerQrOpen(true);
                                }}
                                disabled={cccdQrLoading}
                                style={{
                                    ...S.pillBtn('linear-gradient(135deg,#0f766e,#14b8a6)'),
                                    height: 34,
                                    minHeight: 34,
                                    padding: '0 12px',
                                    fontSize: 10,
                                    lineHeight: 1,
                                    justifyContent: 'center',
                                    whiteSpace: 'nowrap',
                                    opacity: cccdQrLoading ? 0.7 : 1,
                                    boxShadow: '0 8px 16px rgba(15,23,42,.12)',
                                    flexShrink: 0,
                                }}
                            >
                                <span>{cccdQrLoading ? 'QR...' : 'QR'}</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setCustomerInfoOpen(true);
                                    setCustomerOcrSide('front');
                                    setCccdOcrMessage('');
                                    setCustomerOcrOpen(true);
                                }}
                                disabled={cccdOcrLoading}
                                style={{
                                    ...S.pillBtn('linear-gradient(135deg,#111827,#334155)'),
                                    height: 34,
                                    minHeight: 34,
                                    padding: '0 12px',
                                    fontSize: 10,
                                    lineHeight: 1,
                                    justifyContent: 'center',
                                    whiteSpace: 'nowrap',
                                    opacity: cccdOcrLoading ? 0.7 : 1,
                                    boxShadow: '0 8px 16px rgba(15,23,42,.12)',
                                    flexShrink: 0,
                                }}
                            >
                                <span>{cccdOcrLoading ? 'OCR...' : 'OCR'}</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setCustomerInfoOpen(open => !open)}
                                style={{
                                    width: 24,
                                    height: 24,
                                    border: 'none',
                                    background: 'transparent',
                                    padding: 0,
                                    margin: 0,
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexShrink: 0,
                                }}
                                aria-label={customerInfoOpen ? 'Thu gọn thông tin khách hàng' : 'Mở rộng thông tin khách hàng'}
                            >
                                <IoChevronDownOutline
                                    style={{
                                        fontSize: 18,
                                        color: '#64748b',
                                        transform: customerInfoOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                                        transition: 'transform .18s ease',
                                    }}
                                />
                            </button>
                        </div>
                        {customerInfoOpen && (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, marginTop: 10 }}>
                                <input
                                    className="sale-pos-catalog-input"
                                    style={{ ...S.inp, gridColumn: '1 / -1', textAlign: 'left', fontWeight: 400 }}
                                    value={customerInfo?.name || ''}
                                    onChange={e => updateCustomerInfo('name', e.target.value)}
                                    placeholder="Nhập tên khách hàng"
                                />
                                <input
                                    className="sale-pos-catalog-input"
                                    style={{ ...S.inp, textAlign: 'left', fontWeight: 400 }}
                                    value={customerInfo?.cccd || ''}
                                    onChange={e => updateCustomerInfo('cccd', e.target.value)}
                                    placeholder="Nhập CCCD"
                                />
                                <input
                                    className="sale-pos-catalog-input"
                                    style={{ ...S.inp, textAlign: 'left', fontWeight: 400 }}
                                    value={customerInfo?.oldId || ''}
                                    onChange={e => updateCustomerInfo('oldId', e.target.value)}
                                    placeholder="Nhập số CMND cũ"
                                />
                                <input
                                    className="sale-pos-catalog-input"
                                    style={{ ...S.inp, textAlign: 'left', fontWeight: 400 }}
                                    value={customerInfo?.dob || ''}
                                    onChange={e => updateCustomerInfo('dob', e.target.value)}
                                    placeholder="Nhập ngày sinh"
                                />
                                <select
                                    style={{ ...S.inp, textAlign: 'left', fontWeight: 400, appearance: 'none' }}
                                    value={customerInfo?.gender || ''}
                                    onChange={e => updateCustomerInfo('gender', e.target.value)}
                                >
                                    <option value="">Chọn giới tính</option>
                                    <option value="Nam">Nam</option>
                                    <option value="Nữ">Nữ</option>
                                </select>
                                <input
                                    className="sale-pos-catalog-input"
                                    style={{ ...S.inp, textAlign: 'left', fontWeight: 400 }}
                                    value={customerInfo?.nationality || ''}
                                    onChange={e => updateCustomerInfo('nationality', e.target.value)}
                                    placeholder="Nhập quốc tịch"
                                />
                                <input
                                    className="sale-pos-catalog-input"
                                    style={{ ...S.inp, textAlign: 'left', fontWeight: 400 }}
                                    value={customerInfo?.expiry || ''}
                                    onChange={e => updateCustomerInfo('expiry', e.target.value)}
                                    placeholder="Nhập hạn thẻ"
                                />
                                <input
                                    className="sale-pos-catalog-input"
                                    style={{ ...S.inp, textAlign: 'left', fontWeight: 400 }}
                                    value={customerInfo?.issueDate || ''}
                                    onChange={e => updateCustomerInfo('issueDate', e.target.value)}
                                    placeholder="Nhập ngày cấp CCCD"
                                />
                                <input
                                    className="sale-pos-catalog-input"
                                    style={{ ...S.inp, textAlign: 'left', fontWeight: 400 }}
                                    value={customerInfo?.phone || ''}
                                    onChange={e => updateCustomerInfo('phone', e.target.value)}
                                    placeholder="Nhập số điện thoại"
                                />
                                <input
                                    className="sale-pos-catalog-input"
                                    style={{ ...S.inp, textAlign: 'left', fontWeight: 400 }}
                                    value={customerInfo?.origin || ''}
                                    onChange={e => updateCustomerInfo('origin', e.target.value)}
                                    placeholder="Nhập quê quán"
                                />
                                <input
                                    className="sale-pos-catalog-input"
                                    style={{ ...S.inp, gridColumn: '1 / -1', textAlign: 'left', fontWeight: 400 }}
                                    value={customerInfo?.residence || ''}
                                    onChange={e => updateCustomerInfo('residence', e.target.value)}
                                    placeholder="Nhập nơi thường trú"
                                />
                                <input
                                    className="sale-pos-catalog-input"
                                    style={{ ...S.inp, gridColumn: '1 / -1', textAlign: 'left', fontWeight: 400 }}
                                    value={customerInfo?.address || ''}
                                    onChange={e => updateCustomerInfo('address', e.target.value)}
                                    placeholder="Nhập địa chỉ liên hệ / giao hàng"
                                />
                                <textarea
                                    className="sale-pos-catalog-input"
                                    style={{ ...S.inp, gridColumn: '1 / -1', textAlign: 'left', fontWeight: 400, minHeight: 84, resize: 'vertical', paddingTop: 10, paddingBottom: 10 }}
                                    value={customerInfo?.backText || ''}
                                    onChange={e => updateCustomerInfo('backText', e.target.value)}
                                    placeholder="OCR mặt sau sẽ hiện ở đây nếu đã quét"
                                />
                                {cccdOcrMessage && (
                                    <div style={{ gridColumn: '1 / -1', fontSize: 10, color: cccdOcrMessage.startsWith('OCR') ? '#0f766e' : '#dc2626', lineHeight: 1.45 }}>
                                        {cccdOcrMessage}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {lines.map((l) => (
                            <TxLine key={l.id} line={l} rates={rates} inventoryItems={inventoryItems}
                                onChange={patch => updateLine(l.id, patch)}
                                onRemove={() => removeLine(l.id)}
                                showRemove={lines.length > 1} />
                        ))}
                    </div>
                    <button
                        onClick={addLine}
                        style={{
                            ...S.pillBtn('linear-gradient(135deg,#111827,#334155)'),
                            justifyContent: 'center',
                            alignSelf: 'center',
                            padding: '9px 16px',
                            fontSize: 11,
                            marginTop: 10,
                            marginBottom: -20,
                            transform: 'translate(30px, -30px)',
                        }}
                    >
                        <IoAddOutline />
                        <span>Thêm Đơn Hàng</span>
                    </button>
                </div>
            </div>

            <div style={{ ...S.totalBar, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 9, color: '#64748b', fontWeight: 700, marginBottom: 4 }}>{totalLabel}</div>
                    <div style={S.totalAmt(total < 0)}>{fmtCalc(total)}</div>
                    {draftMessage && <div style={{ marginTop: 8, fontSize: 10, color: '#6b7280' }}>{draftMessage}</div>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                    <button
                        onClick={onSaveDraft}
                        title="Lưu giao dịch"
                        aria-label="Lưu giao dịch"
                        style={{
                            ...S.iconBtn('linear-gradient(135deg,#9ca3af,#6b7280)'),
                            width: 52,
                            height: 52,
                            color: 'white',
                            fontSize: 22,
                        }}
                    >
                        <IoSaveOutline />
                    </button>
                    <button
                        onClick={onNext}
                        title="Tính tiền"
                        aria-label="Tính tiền"
                        style={{
                            ...S.iconBtn('linear-gradient(135deg,#111827,#0f172a)'),
                            width: 52,
                            height: 52,
                            color: 'white',
                            fontSize: 22,
                        }}
                    >
                        <IoArrowForwardOutline />
                    </button>
                </div>
            </div>
        </div>
    );
}

function RepairJobScreen({
    inventoryItems,
    repairLines,
    setRepairLines,
    repairId,
    repairMode,
    setRepairMode,
    repairNote,
    setRepairNote,
    repairMessage,
    loading,
    onSubmit,
}) {
    const addLine = () => {
        setRepairLines(lines => [...lines, createRepairLine()]);
    };

    const updateLine = (id, patch) => setRepairLines(lines => lines.map(line => (line.id === id ? { ...line, ...patch } : line)));
    const removeLine = (id) => setRepairLines(lines => lines.filter(line => line.id !== id));
    const selectedLines = repairLines.filter(line => line.itemId);
    const totalAddedWeight = formatWeight(repairLines.reduce((sum, line) => sum + parseWeight(line.them_tl_vang), 0));
    const totalRemovedWeight = formatWeight(repairLines.reduce((sum, line) => sum + parseWeight(line.bot_tl_vang), 0));

    return (
        <div style={S.screen}>
            <div style={S.header}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                    <div>
                        <div style={S.sub}>MOBILE WORKFLOW</div>
                        <div style={{ ...S.title, fontSize: 13 }}>Phiếu Sửa / Bỏ hàng</div>
                    </div>
                    <div style={{ ...S.iconBtn('#ffffff'), width: 44, height: 44, cursor: 'default' }}>
                        <IoRefreshOutline />
                    </div>
                </div>
            </div>

            <div style={S.scrollArea}>
                <div style={S.heroCard}>
                    <div style={S.heroBg} />
                    <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div>
                            <div style={S.heroTitle}>Đưa hàng đi xử lý</div>
                            <div style={{ ...S.sub, fontSize: 10, marginTop: 8, color: '#475569', lineHeight: 1.5 }}>
                                Tạo phiếu cho thợ sửa hoặc bỏ hàng trực tiếp từ kho, không đi qua bước tính tiền.
                            </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span style={S.heroChip}>{repairId}</span>
                            <span style={{ ...S.sub, marginTop: 0, fontWeight: 700 }}>{today()}</span>
                        </div>
                    </div>
                </div>

                <div style={S.softPanel}>
                    <div style={{ fontSize: 11, fontWeight: 900, color: '#111827', marginBottom: 10 }}>Loại xử lý</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        {[
                            ['sua', 'Sửa'],
                            ['bo', 'Bỏ hàng luôn'],
                        ].map(([value, label]) => {
                            const active = repairMode === value;
                            return (
                                <label
                                    key={value}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 8,
                                        padding: '12px 14px',
                                        borderRadius: 16,
                                        border: active ? '1.5px solid #1d4ed8' : '1px solid #dbe4ee',
                                        background: active ? 'linear-gradient(135deg, #eff6ff, #dbeafe)' : 'rgba(255,255,255,.98)',
                                        color: active ? '#1d4ed8' : '#334155',
                                        fontSize: 11,
                                        fontWeight: 800,
                                        cursor: 'pointer',
                                    }}
                                >
                                    <input
                                        type="radio"
                                        name="repair-mode"
                                        value={value}
                                        checked={active}
                                        onChange={() => setRepairMode(value)}
                                        style={{ accentColor: '#1d4ed8' }}
                                    />
                                    <span>{label}</span>
                                </label>
                            );
                        })}
                    </div>
                    <div style={{ ...S.sub, marginTop: 8, lineHeight: 1.5 }}>
                        {repairMode === 'sua'
                            ? 'Phiếu sửa yêu cầu nhập thêm hoặc bớt trọng lượng vàng cho từng sản phẩm.'
                            : 'Phiếu bỏ hàng sẽ chuyển sản phẩm sang trạng thái đã bỏ và không yêu cầu chỉnh trọng lượng.'}
                    </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {repairLines.map(line => (
                        <RepairLine
                            key={line.id}
                            line={line}
                            inventoryItems={inventoryItems}
                            repairMode={repairMode}
                            onChange={patch => updateLine(line.id, patch)}
                            onRemove={() => removeLine(line.id)}
                            showRemove={repairLines.length > 1}
                        />
                    ))}
                </div>

                <button onClick={addLine} style={{ ...S.pillBtn('linear-gradient(135deg,#111827,#334155)'), justifyContent: 'center', width: '100%', padding: '11px 0', fontSize: 18 }}>
                    +
                </button>

                <div style={S.card}>
                    <span style={S.label}>Ghi chú phiếu</span>
                    <textarea
                        style={{ ...S.inp, minHeight: 88, resize: 'none', textAlign: 'left', padding: 10 }}
                        placeholder="Ghi chú chung cho phiếu sửa / bỏ hàng"
                        value={repairNote}
                        onChange={e => setRepairNote(e.target.value)}
                    />
                </div>
            </div>

            <div style={S.totalBar}>
                <div style={{ fontSize: 9, color: '#64748b', fontWeight: 700, marginBottom: 4 }}>TỔNG HỢP PHIẾU</div>
                <div style={{ fontSize: 20, fontWeight: 900, color: '#111827' }}>
                    {selectedLines.length} sản phẩm
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                    {repairMode === 'sua' ? (
                        <>
                            <div style={{ padding: '7px 10px', borderRadius: 999, background: '#dcfce7', color: '#166534', fontSize: 10, fontWeight: 800 }}>
                                Tổng thêm: {totalAddedWeight}
                            </div>
                            <div style={{ padding: '7px 10px', borderRadius: 999, background: '#fee2e2', color: '#b91c1c', fontSize: 10, fontWeight: 800 }}>
                                Tổng bớt: {totalRemovedWeight}
                            </div>
                        </>
                    ) : (
                        <div style={{ padding: '7px 10px', borderRadius: 999, background: '#fff7ed', color: '#9a3412', fontSize: 10, fontWeight: 800 }}>
                            Bỏ hàng không yêu cầu nhập trọng lượng
                        </div>
                    )}
                </div>
                <button
                    onClick={onSubmit}
                    disabled={loading}
                    style={{ ...S.pillBtn('linear-gradient(135deg,#111827,#0f172a)'), justifyContent: 'center', width: '100%', padding: '11px 0', fontSize: 11, marginTop: 10 }}
                >
                    {loading ? 'Đang gửi phiếu...' : repairMode === 'sua' ? 'Gửi phiếu sửa' : 'Gửi phiếu bỏ hàng'}
                </button>
                {repairMessage && <div style={{ marginTop: 8, fontSize: 10, color: '#6b7280' }}>{repairMessage}</div>}
            </div>
        </div>
    );
}

/* â”€â”€ Screen 2: PAYMENT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const BANKS = ['VIETCOMBANK', 'TECHCOMBANK', 'BIDV', 'MB', 'AGRIBANK', 'VIETINBANK', 'ACB', 'SACOMBANK', 'TPBANK', 'VPBANK'];

function PaymentScreen({ total, orderId, formula, onBack, onSend, loading }) {
    const isIn = total >= 0;
    const absTotal = Math.abs(total);

    const [cash, setCash] = useState(absTotal);
    const [bank, setBank] = useState(0);
    const [bankFrom, setBankFrom] = useState('');    // receiving account
    const [bankName, setBankName] = useState('VIETCOMBANK');  // payout bank
    const [bankNum, setBankNum] = useState('');
    const [note, setNote] = useState('');
    const [showQR, setShowQR] = useState(false);

    const qrUrl = bankNum && !isIn
        ? `https://img.vietqr.io/image/${bankName}-${bankNum}-compact.png?amount=${Math.abs(bank)}&addInfo=${encodeURIComponent(orderId)}`
        : '';

    const handleCashChange = v => {
        const n = Math.min(parseFmt(v), absTotal);
        setCash(n); setBank(absTotal - n); setShowQR(false);
    };
    const handleBankChange = v => {
        const n = Math.min(parseFmt(v), absTotal);
        setBank(n); setCash(absTotal - n); setShowQR(false);
    };

    const handleSend = () => {
        onSend({
            orderId, total: fmtVN(total), cash: fmtVN(isIn ? cash : -cash),
            bankcash: fmtVN(isIn ? bank : -bank),
            frombank: isIn ? bankFrom : `${bankName}-${bankNum}`,
            transactiontype: isIn ? 'THU' : 'CHI',
            note, formula, created_at: nowStr(),
        });
    };

    return (
        <div style={S.screen}>
            <div style={S.header}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <button onClick={onBack} style={S.iconBtn('#ffffff')}>←</button>
                    <div>
                        <div style={S.title}>{isIn ? 'Payment (Receive)' : 'Payment (Pay)'}</div>
                        <div style={S.sub}>{orderId}</div>
                    </div>
                </div>
            </div>

            <div style={S.scrollArea}>
                {/* Total */}
                <div style={{ ...S.card, textAlign: 'center', background: 'rgba(255,255,255,.98)', border: `2px solid ${isIn ? NEUTRAL_BORDER : '#f87171'}` }}>
                    <div style={{ fontSize: 9, color: '#6b7280', marginBottom: 4 }}>TOTAL</div>
                    <div style={{ fontSize: 24, fontWeight: 900, color: isIn ? POS_RED : '#dc2626' }}>{fmtVN(total)} VND</div>
                    {formula && <pre style={{ fontSize: 8.5, color: '#6b7280', marginTop: 8, textAlign: 'left', whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>{formula}</pre>}
                </div>

                {/* Cash / transfer */}
                <div style={S.card}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <div>
                            <span style={S.label}>Cash</span>
                            <input style={{ ...S.inp, color: POS_RED }} type="text" inputMode="numeric"
                                value={fmtVN(cash)}
                                onChange={e => handleCashChange(e.target.value)}
                                onFocus={e => e.target.select()} />
                        </div>
                        <div>
                            <span style={S.label}>Bank transfer</span>
                            <input style={{ ...S.inp, color: '#3b82f6' }} type="text" inputMode="numeric"
                                value={fmtVN(bank)}
                                onChange={e => handleBankChange(e.target.value)}
                                onFocus={e => e.target.select()} />
                        </div>
                    </div>
                </div>

                {/* Bank info */}
                <div style={S.card}>
                    {isIn ? (
                        <div>
                            <span style={S.label}>Receiving account</span>
                            <select style={{ ...S.inp, textAlign: 'left' }} value={bankFrom} onChange={e => setBankFrom(e.target.value)}>
                                <option value="">-- Select account --</option>
                                {BANKS.map(b => <option key={b} value={b}>{b}</option>)}
                            </select>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <div>
                                <span style={S.label}>Payout bank</span>
                                <select style={{ ...S.inp, textAlign: 'left' }} value={bankName} onChange={e => { setBankName(e.target.value); setShowQR(false); }}>
                                    {BANKS.map(b => <option key={b}>{b}</option>)}
                                </select>
                            </div>
                            <div>
                                <span style={S.label}>Account number</span>
                                <input style={S.inp} type="text" inputMode="numeric" placeholder="0123456789"
                                    value={bankNum} onChange={e => { setBankNum(e.target.value); setShowQR(false); }} />
                            </div>
                            {qrUrl && (
                                <button onClick={() => setShowQR(q => !q)} style={S.pillBtn('#6366f1')}>
                                    QR {showQR ? 'Hide' : 'Show'}
                                </button>
                            )}
                            {showQR && qrUrl && (
                                <div style={{ borderRadius: 12, overflow: 'hidden', border: '2px solid #6366f1' }}>
                                    <img src={qrUrl} alt="VietQR" style={{ width: '100%' }} />
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Notes */}
                <div style={S.card}>
                    <span style={S.label}>Notes</span>
                    <textarea style={{ ...S.inp, height: 80, resize: 'none', textAlign: 'left', padding: 10 }}
                        placeholder="Enter note..." value={note} onChange={e => setNote(e.target.value)} />
                </div>
            </div>

            {/* Bottom */}
            <div style={{ ...S.totalBar, display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                <button onClick={onBack} style={S.pillBtn('#ffffff', '#111827')}>Back</button>
                <button onClick={handleSend} disabled={loading} style={S.pillBtn('linear-gradient(135deg,#16a34a,#0ea5e9)', 'white')}>
                    {loading ? 'Sending...' : 'Send order'}
                </button>
            </div>
        </div>
    );
}

/* â”€â”€ Screen 3: ORDER LIST â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function OrderListScreen({ orders, onClose, onSettle, settleLoading }) {
    const todayOrders = orders.filter(o => {
        const d = new Date(o.ngay_dat);
        const t = new Date();
        return d.getDate() === t.getDate() && d.getMonth() === t.getMonth() && d.getFullYear() === t.getFullYear();
    });

    const total = todayOrders.reduce((s, o) => s + (o.tong_tien || 0), 0);
    const [confirmSettle, setConfirmSettle] = useState(false);

    return (
        <div style={S.screen}>
            <div style={S.header}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <div style={S.title}>Today's orders</div>
                        <div style={S.sub}>{todayOrders.length} orders · Total: {fmtVN(total)} VND</div>
                    </div>
                    <button onClick={onClose} style={S.iconBtn('#ffffff')}>×</button>
                </div>
            </div>

            <div style={S.scrollArea}>
                {todayOrders.length === 0 && (
                    <div style={{ textAlign: 'center', color: '#6b7280', padding: 36, fontSize: 11 }}>No orders today</div>
                )}
                {todayOrders.map(o => (
                    <div key={o.id} style={{ ...S.card, background: 'rgba(255,255,255,.98)', border: '1px solid rgba(15,23,42,.06)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                            <div style={{ color: '#111827', fontWeight: 800, fontSize: 12 }}>{o.ma_don}</div>
                            <div style={{ fontSize: 10, color: '#6b7280' }}>{o.ngay_dat}</div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                            {[
                                ['Customer', o.khach_hang || '-'],
                                ['Total', `${fmtVN(o.tong_tien)} VND`],
                                ['Deposit', `${fmtVN(o.dat_coc)} VND`],
                                ['Balance', `${fmtVN((o.tong_tien || 0) - (o.dat_coc || 0))} VND`],
                            ].map(([k, v]) => (
                                <div key={k}>
                                    <div style={{ fontSize: 8, color: '#6b7280', fontWeight: 700 }}>{k.toUpperCase()}</div>
                                    <div style={{ fontSize: 11, fontWeight: 700, color: '#111827' }}>{v}</div>
                                </div>
                            ))}
                        </div>
                        {o.ghi_chu && <div style={{ marginTop: 8, fontSize: 10, color: '#6b7280' }}>Note: {o.ghi_chu}</div>}
                    </div>
                ))}
            </div>

            <div style={{ ...S.totalBar, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                {confirmSettle ? (
                    <>
                        <span style={{ color: '#dc2626', fontSize: 10, alignSelf: 'center' }}>Confirm closing?</span>
                    <button onClick={() => setConfirmSettle(false)} style={S.pillBtn('#ffffff', '#111827')}>Cancel</button>
                        <button onClick={onSettle} disabled={settleLoading} style={S.pillBtn('#dc2626')}>
                            {settleLoading ? '...' : 'Close'}
                        </button>
                    </>
                ) : (
                    <button onClick={() => setConfirmSettle(true)} style={S.pillBtn('#d97706', 'white')}>Close day</button>
                )}
            </div>
        </div>
    );
}

function SavedTransactionsModal({ open, drafts, onClose, onLoad, onDeleteDraft, onDeleteAll }) {
    if (!open) return null;

    return (
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 900, background: 'rgba(15,23,42,.36)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: 14 }}>
            <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 560, maxHeight: '78vh', display: 'flex', flexDirection: 'column', background: 'rgba(255,255,255,.98)', borderRadius: 24, boxShadow: '0 24px 60px rgba(15,23,42,.24)', overflow: 'hidden' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 16px 10px', borderBottom: '1px solid rgba(15,23,42,.08)' }}>
                    <div>
                        <div style={{ ...S.title, fontSize: 14 }}>Giao dịch lưu</div>
                        <div style={S.sub}>{drafts.length} giao dịch tạm</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {drafts.length > 0 && (
                            <button type="button" onClick={onDeleteAll} style={{ ...S.pillBtn('#fee2e2', '#dc2626'), padding: '8px 12px', fontSize: 10, boxShadow: 'none' }}>
                                <IoTrashOutline />
                                <span>Xóa tất cả</span>
                            </button>
                        )}
                        <button onClick={onClose} style={S.iconBtn('#f8fafc')}>×</button>
                    </div>
                </div>
                <div style={{ padding: 14, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {drafts.length === 0 && (
                        <div style={{ ...S.card, textAlign: 'center', color: '#6b7280', fontSize: 11 }}>
                            Chưa có giao dịch nào được lưu tạm.
                        </div>
                    )}
                    {drafts.map((draft) => (
                        <div key={draft.id || draft.orderId} role="button" tabIndex={0} onClick={() => onLoad(draft)} onKeyDown={e => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                onLoad(draft);
                            }
                        }} style={{ ...S.card, border: '1px solid rgba(15,23,42,.08)', textAlign: 'left', cursor: 'pointer' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                                <div>
                                    <div style={{ fontSize: 12, fontWeight: 900, color: '#111827' }}>{draft.orderId || 'Draft'}</div>
                                    <div style={{ fontSize: 10, color: '#6b7280', marginTop: 4 }}>{draft.savedAt ? new Date(draft.savedAt).toLocaleString('vi-VN') : '-'}</div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <div style={{ fontSize: 12, fontWeight: 900, color: POS_RED }}>{draft.total >= 0 ? '+' : ''}{fmtVN(draft.total || 0)} VND</div>
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onDeleteDraft(draft.id || draft.orderId);
                                        }}
                                        style={{ ...S.iconBtn('#fff1f2'), width: 32, height: 32, fontSize: 14, color: '#dc2626', boxShadow: 'none' }}
                                        title="Xóa giao dịch lưu"
                                    >
                                        <IoTrashOutline />
                                    </button>
                                </div>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 10, fontSize: 10, color: '#64748b' }}>
                                <span>{draft.lines?.length || 0} dòng giao dịch</span>
                                <span>Chạm để nạp lại</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

function renderChecklistDots(requiredQty, importedQty) {
    const total = Math.max(0, Number(requiredQty || 0));
    const done = Math.max(0, Math.min(Number(importedQty || 0), total));
    if (total === 0) return null;
    const visibleCount = Math.min(total, 10);
    return (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {Array.from({ length: visibleCount }).map((_, index) => (
                <span key={index} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: index < done ? '#16a34a' : '#cbd5e1', fontSize: 16, lineHeight: 1 }}>
                    {index < done ? <IoCheckmarkCircle /> : <IoCheckmarkCircleOutline />}
                </span>
            ))}
            {total > visibleCount && (
                <span style={{ fontSize: 11, color: '#64748b', fontWeight: 700, alignSelf: 'center' }}>+{total - visibleCount}</span>
            )}
        </div>
    );
}

function pickChecklistItemId(plan, preferredItemId = null) {
    if (!plan?.items?.length) return null;
    if (preferredItemId && plan.items.some(item => item.id === preferredItemId)) {
        return preferredItemId;
    }
    return plan.items.find(item => !item.hoan_thanh)?.id || plan.items[0]?.id || null;
}

function NhapVangChecklistModal({
    open,
    loading,
    plans,
    selectedPlanId,
    selectedItemId,
    onClose,
    onSelectPlan,
    onSelectItem,
    onUpdateProgress,
}) {
    if (!open) return null;
    const selectedPlan = plans.find(plan => plan.id === selectedPlanId) || plans[0] || null;

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', zIndex: 1800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 14 }} onClick={onClose}>
            <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 640, maxHeight: '84vh', display: 'flex', flexDirection: 'column', background: 'rgba(255,255,255,.98)', borderRadius: 24, boxShadow: '0 24px 60px rgba(15,23,42,.24)', overflow: 'hidden' }}>
                <div style={{ padding: '16px 18px', borderBottom: '1px solid rgba(15,23,42,.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <div style={{ fontSize: 14, fontWeight: 900, color: '#111827' }}>Danh sách sản phẩm cần nhập</div>
                        <div style={{ fontSize: 10, color: '#64748b', marginTop: 3 }}>Admin tạo danh sách này để mobile theo checklist khi nhập kho.</div>
                    </div>
                    <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 24, cursor: 'pointer' }}>×</button>
                </div>

                <div style={{ padding: 14, display: 'flex', gap: 8, overflowX: 'auto', borderBottom: '1px solid rgba(15,23,42,.06)' }}>
                    {loading && <div style={{ fontSize: 11, color: '#94a3b8' }}>Đang tải danh sách từ admin...</div>}
                    {!loading && plans.length === 0 && <div style={{ fontSize: 11, color: '#94a3b8' }}>Chưa có danh sách nào từ admin.</div>}
                    {plans.map(plan => (
                        <button
                            key={plan.id}
                            type="button"
                            onClick={() => onSelectPlan(plan.id)}
                            style={{
                                padding: '9px 12px',
                                borderRadius: 14,
                                border: 'none',
                                background: selectedPlan?.id === plan.id ? 'linear-gradient(135deg,#111827,#1d4ed8)' : '#f1f5f9',
                                color: selectedPlan?.id === plan.id ? 'white' : '#334155',
                                minWidth: 180,
                                textAlign: 'left',
                                cursor: 'pointer',
                                flexShrink: 0,
                            }}
                        >
                            <div style={{ fontSize: 11, fontWeight: 800 }}>{plan.ten_danh_sach}</div>
                            <div style={{ fontSize: 10, marginTop: 4, opacity: 0.9 }}>{plan.da_nhap || 0}/{plan.tong_so_luong || 0} đã nhập</div>
                        </button>
                    ))}
                </div>

                <div style={{ padding: 14, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {!selectedPlan ? (
                        <div style={{ textAlign: 'center', padding: '22px 0', color: '#94a3b8', fontSize: 12 }}>Chưa có danh sách đang mở.</div>
                    ) : selectedPlan.items?.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '22px 0', color: '#94a3b8', fontSize: 12 }}>Danh sách này chưa có dòng sản phẩm nào.</div>
                    ) : (
                        selectedPlan.items.map(item => {
                            const active = item.id === selectedItemId;
                            return (
                                <div key={item.id} style={{ borderRadius: 16, border: active ? '1.5px solid #16a34a' : '1px solid #e2e8f0', background: active ? '#f0fdf4' : '#fff', padding: 14 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                                        <div>
                                            <div style={{ fontSize: 13, fontWeight: 900, color: '#111827' }}>{item.ten_hang}</div>
                                            <div style={{ fontSize: 10, color: '#64748b', marginTop: 4 }}>
                                                {item.nhom_hang || '—'} · {item.tuoi_vang || '—'} · {item.trong_luong || '—'}
                                            </div>
                                        </div>
                                        <button type="button" onClick={() => onSelectItem(item)} style={{ ...S.pillBtn(active ? '#16a34a' : '#111827'), padding: '7px 12px', fontSize: 10 }}>
                                            {active ? 'Đang chọn' : 'Chọn nhập'}
                                        </button>
                                    </div>

                                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
                                        <div>
                                            {renderChecklistDots(item.so_luong_yeu_cau, item.so_luong_da_nhap)}
                                            <div style={{ fontSize: 10, color: '#64748b', marginTop: 4 }}>
                                                {item.so_luong_da_nhap}/{item.so_luong_yeu_cau} đã nhập · còn {item.so_luong_con_lai}
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: 8 }}>
                                            <button type="button" onClick={() => onUpdateProgress(item, -1)} style={{ ...S.pillBtn('#e2e8f0', '#334155'), padding: '7px 10px', fontSize: 10 }}>
                                                <IoRemoveOutline />
                                            </button>
                                            <button type="button" onClick={() => onUpdateProgress(item, 1)} style={{ ...S.pillBtn('#16a34a'), padding: '7px 10px', fontSize: 10 }}>
                                                <IoAddOutline />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
}

/* â”€â”€ Main export â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const emptyStockForm = () => ({
    ma_hang: '',
    ncc: '',
    nhom_hang: '',
    quay_nho: '',
    cong_le: '',
    cong_si: '',
    tong_tl: '',
    tl_da: '',
    tl_vang: '',
    loai_vang: '',
    tuoi_vang: '',
    status: 'Tồn kho',
    gia_vang_mua: '',
    gia_hat: '',
    gia_nhan_cong: '',
    dieu_chinh: '',
});

const STOCK_STATUS_OPTIONS = ['Tồn kho', 'Đã bán', 'Luân chuyển'];

function InventoryScreen({ nhomHangList, quayNhoList, tuoiVangList, onSaved }) {
    const fileRef = useRef(null);
    const ocrFileRef = useRef(null);
    const [form, setForm] = useState(emptyStockForm);
    const [files, setFiles] = useState([]);
    const [previews, setPreviews] = useState([]);
    const [ocrText, setOcrText] = useState('');
    const [ocrLoading, setOcrLoading] = useState(false);
    const [ocrPreview, setOcrPreview] = useState('');
    const [ocrFileName, setOcrFileName] = useState('');
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');
    const [nhapVangLists, setNhapVangLists] = useState([]);
    const [checklistOpen, setChecklistOpen] = useState(false);
    const [checklistLoading, setChecklistLoading] = useState(false);
    const [selectedNhapListId, setSelectedNhapListId] = useState(null);
    const [selectedNhapItemId, setSelectedNhapItemId] = useState(null);

    useEffect(() => () => previews.forEach(url => URL.revokeObjectURL(url)), [previews]);
    useEffect(() => () => {
        if (ocrPreview) {
            URL.revokeObjectURL(ocrPreview);
        }
    }, [ocrPreview]);

    const setField = (key, value) => setForm(f => ({ ...f, [key]: value }));
    const selectedNhapPlan = nhapVangLists.find(plan => plan.id === selectedNhapListId) || nhapVangLists[0] || null;
    const selectedNhapItem = selectedNhapPlan?.items?.find(item => item.id === selectedNhapItemId) || null;
    const nhomHangNames = nhomHangList
        .map(item => String(item?.ten_nhom || '').trim())
        .filter(Boolean);

    const resetAll = (clearMessage = true) => {
        setForm(emptyStockForm());
        setFiles([]);
        setPreviews([]);
        setOcrText('');
        setOcrPreview(prev => {
            if (prev) URL.revokeObjectURL(prev);
            return '';
        });
        setOcrFileName('');
        if (clearMessage) setMessage('');
        if (fileRef.current) fileRef.current.value = '';
        if (ocrFileRef.current) ocrFileRef.current.value = '';
    };

    const loadNhapVangLists = async (preferredPlanId = selectedNhapListId, preferredItemId = selectedNhapItemId) => {
        setChecklistLoading(true);
        try {
            const res = await fetch(`${API}/api/nhap_vang_lists?active_only=1`);
            if (!res.ok) throw new Error('Không tải được danh sách nhập vàng');
            const data = await res.json();
            const plans = Array.isArray(data) ? data : [];
            const nextPlanId = plans.some(plan => plan.id === preferredPlanId)
                ? preferredPlanId
                : (plans[0]?.id || null);
            const nextPlan = plans.find(plan => plan.id === nextPlanId) || plans[0] || null;
            const nextItemId = pickChecklistItemId(nextPlan, preferredItemId);

            setNhapVangLists(plans);
            setSelectedNhapListId(nextPlan?.id || null);
            setSelectedNhapItemId(nextItemId);
        } catch (err) {
            setNhapVangLists([]);
            setSelectedNhapListId(null);
            setSelectedNhapItemId(null);
            setMessage(err.message || 'Không tải được danh sách nhập vàng');
        } finally {
            setChecklistLoading(false);
        }
    };

    useEffect(() => {
        loadNhapVangLists().catch(() => { });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const runOcr = async (file) => {
        if (!file) return;
        setOcrLoading(true);
        setMessage('');
        const reader = new FileReader();
        reader.onload = async (ev) => {
            try {
                const base64 = ev.target.result.split(',')[1];
                const res = await fetch(`${API}/api/ocr`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        image_base64: base64,
                        mime_type: file.type || 'image/jpeg',
                        file_name: file.name,
                    }),
                });
                const data = await res.json();
                if (res.ok && data.text) {
                    setOcrText(data.text);
                    setMessage('OCR hoàn tất.');
                } else {
                    setMessage(data.error || 'Không đọc được nhãn.');
                }
            } catch (err) {
                setMessage('Lỗi kết nối OCR: ' + err.message);
            } finally {
                setOcrLoading(false);
            }
        };
        reader.readAsDataURL(file);
    };

    const onPickFiles = (e) => {
        const picked = Array.from(e.target.files || []).filter(f => f.type.startsWith('image/'));
        if (!picked.length) return;
        const urls = picked.map(f => URL.createObjectURL(f));
        setFiles(picked);
        setPreviews(urls);
        setMessage('');
        e.target.value = '';
    };

    const onPickOcrFile = (e) => {
        const picked = Array.from(e.target.files || []).filter(f => f.type.startsWith('image/'));
        const file = picked[0];
        e.target.value = '';
        if (!file) return;
        setOcrPreview(prev => {
            if (prev) URL.revokeObjectURL(prev);
            return URL.createObjectURL(file);
        });
        setOcrFileName(file.name || 'tem-ocr');
        setMessage('');
        runOcr(file);
    };

    const uploadImages = async () => {
        const uploaded = [];
        for (const file of files) {
            const fd = new FormData();
            fd.append('file', file);
            const res = await fetch(`${API}/api/upload`, { method: 'POST', body: fd });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || `Tải ảnh thất bại: ${file.name}`);
            uploaded.push({ url: data.url, name: data.name });
        }
        return uploaded;
    };

    const selectChecklistPlan = (planId) => {
        const plan = nhapVangLists.find(entry => entry.id === planId) || null;
        setSelectedNhapListId(planId);
        setSelectedNhapItemId(pickChecklistItemId(plan));
    };

    const selectChecklistItem = (item) => {
        if (!item) return;
        setSelectedNhapListId(item.list_id || selectedNhapPlan?.id || null);
        setSelectedNhapItemId(item.id);
        setForm(prev => ({
            ...prev,
            ncc: item.ten_hang || prev.ncc,
            nhom_hang: nhomHangNames.includes(item.nhom_hang || '') ? (item.nhom_hang || '') : prev.nhom_hang,
            tuoi_vang: item.tuoi_vang || prev.tuoi_vang,
            tong_tl: item.trong_luong || prev.tong_tl,
        }));
        setChecklistOpen(false);
        setMessage(`Đã chọn mục cần nhập: ${item.ten_hang}.`);
    };

    useEffect(() => {
        if (!form.nhom_hang) return;
        if (nhomHangNames.includes(form.nhom_hang)) return;
        setForm(prev => prev.nhom_hang ? { ...prev, nhom_hang: '' } : prev);
    }, [form.nhom_hang, nhomHangNames.join('|')]);

    const updateChecklistProgress = async (item, delta) => {
        if (!item || !delta) return null;
        const currentQty = Number(item.so_luong_da_nhap || 0);
        const requiredQty = Number(item.so_luong_yeu_cau || 0);
        const nextQty = Math.max(0, Math.min(requiredQty, currentQty + delta));
        if (nextQty === currentQty) return item;

        const res = await fetch(`${API}/api/nhap_vang_items/${item.id}/progress`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ so_luong_da_nhap: nextQty }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Không cập nhật được checklist nhập vàng');

        await loadNhapVangLists(item.list_id, data.hoan_thanh ? null : data.id);
        return data;
    };

    const saveItem = async () => {
        setSaving(true);
        setMessage('');
        try {
            const images = files.length ? await uploadImages() : [];
            const payload = { ...form, images, certificates: [], ocr_text: ocrText };
            const res = await fetch(`${API}/api/items`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Không thể lưu sản phẩm');
            resetAll(false);
            let nextMessage = `Đã lưu sản phẩm #${data.id}.`;
            if (selectedNhapItem) {
                const progress = await updateChecklistProgress(selectedNhapItem, 1);
                if (progress?.ten_hang) {
                    nextMessage = `Đã lưu sản phẩm #${data.id}. Checklist ${progress.ten_hang}: ${progress.so_luong_da_nhap}/${progress.so_luong_yeu_cau}.`;
                }
            }
            setMessage(nextMessage);
            onSaved && onSaved(data);
        } catch (err) {
            setMessage(err.message || 'Lưu sản phẩm thất bại');
        } finally {
            setSaving(false);
        }
    };

    const handlePrintTem = () => {
        const printableItem = {
            ma_hang: form.ma_hang,
            ncc: form.ncc || selectedNhapItem?.ten_hang || '',
            nhom_hang: form.nhom_hang || selectedNhapItem?.nhom_hang || '',
            quay_nho: form.quay_nho,
            tuoi_vang: form.tuoi_vang || selectedNhapItem?.tuoi_vang || '',
            cong_le: form.cong_le,
            cong_si: form.cong_si,
            tl_da: form.tl_da,
            tl_vang: form.tl_vang,
            tong_tl: form.tong_tl || selectedNhapItem?.trong_luong || '',
            gia_hien_tai: null,
            ocr_text: ocrText,
        };
        const hasContent = [printableItem.ma_hang, printableItem.ncc, printableItem.tuoi_vang, printableItem.tong_tl, printableItem.ocr_text]
            .some(value => String(value || '').trim());
        if (!hasContent) {
            window.alert('Chưa có dữ liệu để in tem.');
            return;
        }
        printItemCertification(printableItem, { title: 'Tem sản phẩm' });
    };

    const fieldStyle = { ...S.inp, textAlign: 'left', padding: '9px 10px' };
    const sectionStyle = { ...S.card, background: 'rgba(255,255,255,.97)', border: '1px solid rgba(15,23,42,.06)', color: '#111827' };
    const subSectionStyle = { border: '1px solid rgba(15,23,42,.06)', borderRadius: 18, padding: 14, background: 'rgba(255,255,255,.98)' };
    const sectionTitleStyle = { fontSize: 11, fontWeight: 900, color: '#0f172a', marginBottom: 10, letterSpacing: 0.2 };
    const formLabelStyle = { ...S.label, marginBottom: 6 };
    const actionBtn = (bg, color = '#111827') => ({
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        minWidth: 116,
        padding: '11px 16px',
        borderRadius: 999,
        border: 'none',
        background: bg,
        color,
        fontWeight: 800,
        fontSize: 11,
        cursor: 'pointer',
        boxShadow: '0 10px 24px rgba(15,23,42,.10)',
    });
    const squareChoiceBtn = (active) => ({
        minWidth: 86,
        padding: '12px 14px',
        borderRadius: 16,
        border: active ? '1.5px solid #1d4ed8' : '1px solid #dbe4ee',
        background: active ? 'linear-gradient(135deg, #eff6ff, #dbeafe)' : 'rgba(255,255,255,.98)',
        color: active ? '#1d4ed8' : '#334155',
        fontWeight: 800,
        fontSize: 11,
        textAlign: 'center',
        cursor: 'pointer',
        boxShadow: active ? '0 10px 22px rgba(29,78,216,.14)' : '0 4px 10px rgba(15,23,42,.04)',
        whiteSpace: 'nowrap',
        flexShrink: 0,
    });
    const giaVonTong = Math.round(
        (parseInt(form.gia_vang_mua || 0, 10) || 0) * (parseFloat(form.tl_vang || 0) || 0) +
        (parseInt(form.gia_hat || 0, 10) || 0) +
        (parseInt(form.gia_nhan_cong || 0, 10) || 0) +
        (parseInt(form.dieu_chinh || 0, 10) || 0)
    );
    const renderLegacyOption = (value, exists, suffix = ' (cũ)') => {
        if (!value || exists) return null;
        return <option value={value}>{value}{suffix}</option>;
    };

    return (
        <div style={S.screen}>
            <div style={S.header}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                    <button
                        type="button"
                        onClick={() => setChecklistOpen(true)}
                        style={S.iconBtn('#ffffff')}
                        title="Danh sách sản phẩm cần nhập"
                    >
                        <IoListOutline />
                    </button>
                    <div style={{ flex: 1 }}>
                        <div style={S.title}>Nhập kho bằng camera</div>
                        <div style={S.sub}>Chụp ảnh sản phẩm, đọc nhãn và lưu vào backend quản trị.</div>
                    </div>
                </div>
            </div>

            <div style={S.scrollArea}>
                {selectedNhapItem && (
                    <div
                        style={{
                            ...sectionStyle,
                            background: 'linear-gradient(180deg, rgba(240,253,244,.96), rgba(255,255,255,.98))',
                            border: '1px solid #bbf7d0',
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                            <div>
                                <div style={{ fontSize: 13, fontWeight: 900, color: '#111827' }}>{selectedNhapItem.ten_hang}</div>
                                <div style={{ fontSize: 10, color: '#64748b', marginTop: 4 }}>
                                    {selectedNhapPlan?.ten_danh_sach || 'Danh sách admin'} · {selectedNhapItem.trong_luong || 'Chưa có TL'} · SL {selectedNhapItem.so_luong_da_nhap}/{selectedNhapItem.so_luong_yeu_cau}
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setChecklistOpen(true)}
                                style={{ ...S.pillBtn('#16a34a'), padding: '8px 12px', fontSize: 10, flexShrink: 0 }}
                            >
                                <IoListOutline />
                                <span>Đổi mục</span>
                            </button>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
                            <div>
                                {renderChecklistDots(selectedNhapItem.so_luong_yeu_cau, selectedNhapItem.so_luong_da_nhap)}
                                <div style={{ fontSize: 10, color: '#64748b', marginTop: 5 }}>
                                    Còn lại {selectedNhapItem.so_luong_con_lai} sản phẩm cần nhập.
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button
                                    type="button"
                                    onClick={() => updateChecklistProgress(selectedNhapItem, -1).catch(err => setMessage(err.message || 'Không cập nhật được checklist'))}
                                    style={{ ...S.pillBtn('#e2e8f0', '#334155'), padding: '7px 10px', fontSize: 10 }}
                                >
                                    <IoRemoveOutline />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => updateChecklistProgress(selectedNhapItem, 1).catch(err => setMessage(err.message || 'Không cập nhật được checklist'))}
                                    style={{ ...S.pillBtn('#16a34a'), padding: '7px 10px', fontSize: 10 }}
                                >
                                    <IoAddOutline />
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                <div style={sectionStyle}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <div>
                            <div style={sectionTitleStyle}>Ảnh sản phẩm</div>
                            <div onClick={() => fileRef.current?.click()} style={{ minHeight: 170, borderRadius: 18, border: '2px dashed #cbd5e1', background: 'linear-gradient(180deg, #f8fbff, #eef6ff)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', cursor: 'pointer' }}>
                                {previews.length === 0 ? (
                                    <div style={{ textAlign: 'center', color: '#64748b', padding: 20 }}>
                                        <div style={{ fontSize: 22, marginBottom: 8, display: 'flex', justifyContent: 'center' }}><IoImagesOutline /></div>
                                        <div style={{ fontSize: 10, fontWeight: 700 }}>Chạm để chụp hoặc chọn ảnh</div>
                                        <div style={{ fontSize: 9, marginTop: 6 }}>Ảnh sẽ được tải lên cùng dữ liệu sản phẩm</div>
                                    </div>
                                ) : (
                                    <div style={{ display: 'grid', gridTemplateColumns: previews.length > 1 ? '1fr 1fr' : '1fr', gap: 8, width: '100%', padding: 8 }}>
                                        {previews.slice(0, 4).map((url, idx) => (
                                            <img key={url} src={url} alt={`preview-${idx}`} style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 10 }} />
                                        ))}
                                    </div>
                                )}
                            </div>
                            <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple style={{ display: 'none' }} onChange={onPickFiles} />
                            <div style={{ fontSize: 10, color: '#64748b', marginTop: 8 }}>
                                {files.length ? `Đã chọn ${files.length} ảnh` : 'Chưa chọn ảnh nào'}
                            </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <div style={{ ...subSectionStyle, borderRadius: 0 }}>
                                <div style={{ ...sectionTitleStyle, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                                    <IoDocumentTextOutline />
                                    <span>OCR nhãn</span>
                                </div>
                                <div
                                    onClick={() => ocrFileRef.current?.click()}
                                    style={{
                                        minHeight: 170,
                                        borderRadius: 0,
                                        border: '2px dashed #cbd5e1',
                                        background: 'linear-gradient(180deg, #f8fbff, #eef6ff)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        overflow: 'hidden',
                                        cursor: 'pointer',
                                    }}
                                >
                                    {ocrPreview ? (
                                        <img src={ocrPreview} alt="ocr-preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    ) : (
                                        <div style={{ textAlign: 'center', color: '#64748b', padding: 20 }}>
                                            <div style={{ fontSize: 22, marginBottom: 8, display: 'flex', justifyContent: 'center' }}><IoDocumentTextOutline /></div>
                                            <div style={{ fontSize: 10, fontWeight: 700 }}>Chạm để chụp hoặc chọn tem</div>
                                            <div style={{ fontSize: 9, marginTop: 6 }}>Tem sẽ được OCR tự động sau khi chọn ảnh</div>
                                        </div>
                                    )}
                                </div>
                                <input
                                    ref={ocrFileRef}
                                    type="file"
                                    accept="image/*"
                                    capture="environment"
                                    style={{ display: 'none' }}
                                    onChange={onPickOcrFile}
                                />
                            </div>
                            {message && <div style={{ padding: '10px 12px', borderRadius: 12, background: 'rgba(255,255,255,.98)', border: '1px solid rgba(15,23,42,.06)', color: '#111827', fontSize: 10 }}>{message}</div>}
                        </div>
                    </div>
                </div>

                <div style={sectionStyle}>
                    <div style={sectionTitleStyle}>Thông tin sản phẩm</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
                        <div>
                            <span style={formLabelStyle}>Mã hàng</span>
                            <input value={form.ma_hang} onChange={e => setField('ma_hang', e.target.value)} style={fieldStyle} placeholder="Nhập mã hàng" />
                        </div>
                        <div>
                            <span style={formLabelStyle}>NCC (Tên hàng)</span>
                            <input value={form.ncc} onChange={e => setField('ncc', e.target.value)} style={fieldStyle} placeholder="Nhập NCC hoặc tên hàng" />
                        </div>
                        <div style={{ gridColumn: '1 / -1' }}>
                            <span style={formLabelStyle}>Nhóm hàng</span>
                            {nhomHangNames.length > 0 ? (
                                <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 }}>
                                    {nhomHangNames.map(name => (
                                        <button
                                            key={name}
                                            type="button"
                                            onClick={() => setField('nhom_hang', name)}
                                            style={squareChoiceBtn(form.nhom_hang === name)}
                                        >
                                            {name}
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <div style={{ ...fieldStyle, color: '#94a3b8' }}>Chưa có nhóm hàng trong Cài đặt</div>
                            )}
                        </div>
                        <div>
                            <span style={formLabelStyle}>Quầy nhỏ</span>
                            <select value={form.quay_nho} onChange={e => setField('quay_nho', e.target.value)} style={fieldStyle}>
                                <option value="">-- Chọn quầy --</option>
                                {quayNhoList.map(q => <option key={q.id} value={q.ten_quay}>{q.ten_quay}</option>)}
                                {renderLegacyOption(form.quay_nho, quayNhoList.some(q => q.ten_quay === form.quay_nho))}
                            </select>
                        </div>
                        <div>
                            <span style={formLabelStyle}>Tuổi vàng</span>
                            <select value={form.tuoi_vang} onChange={e => setField('tuoi_vang', e.target.value)} style={fieldStyle}>
                                <option value="">-- Chọn tuổi vàng --</option>
                                {tuoiVangList.map(t => <option key={t.id} value={t.ten_tuoi}>{t.ten_tuoi}</option>)}
                                {renderLegacyOption(form.tuoi_vang, tuoiVangList.some(t => t.ten_tuoi === form.tuoi_vang))}
                            </select>
                        </div>
                        <div>
                            <span style={formLabelStyle}>Trạng thái</span>
                            <select value={form.status} onChange={e => setField('status', e.target.value)} style={fieldStyle}>
                                {STOCK_STATUS_OPTIONS.map(status => <option key={status} value={status}>{status}</option>)}
                            </select>
                        </div>
                    </div>
                </div>

                <div style={sectionStyle}>
                    <div style={sectionTitleStyle}>Trọng lượng và công</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
                        <div>
                            <span style={formLabelStyle}>Tổng TL</span>
                            <input value={form.tong_tl} onChange={e => setField('tong_tl', e.target.value)} style={fieldStyle} placeholder="Tổng trọng lượng" />
                        </div>
                        <div>
                            <span style={formLabelStyle}>TL đá</span>
                            <input value={form.tl_da} onChange={e => setField('tl_da', e.target.value)} style={fieldStyle} placeholder="Trọng lượng đá" />
                        </div>
                        <div>
                            <span style={formLabelStyle}>TL vàng</span>
                            <input value={form.tl_vang} onChange={e => setField('tl_vang', e.target.value)} style={fieldStyle} placeholder="Trọng lượng vàng" />
                        </div>
                        <div>
                            <span style={formLabelStyle}>Công lẻ</span>
                            <input value={form.cong_le} onChange={e => setField('cong_le', e.target.value)} style={fieldStyle} placeholder="Công lẻ" />
                        </div>
                    </div>
                </div>

                <div style={sectionStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
                        <div style={sectionTitleStyle}>Giá mua (giá vốn)</div>
                        {giaVonTong > 0 && (
                            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 999, padding: '4px 10px', fontSize: 11, fontWeight: 800, color: '#15803d' }}>
                                {fmtVN(giaVonTong)} ₫
                            </div>
                        )}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
                        <div>
                            <span style={formLabelStyle}>Giá vàng mua</span>
                            <input type="number" value={form.gia_vang_mua} onChange={e => setField('gia_vang_mua', e.target.value)} style={fieldStyle} placeholder="Giá vàng mua / chỉ" />
                        </div>
                        <div>
                            <span style={formLabelStyle}>Giá hạt</span>
                            <input type="number" value={form.gia_hat} onChange={e => setField('gia_hat', e.target.value)} style={fieldStyle} placeholder="Giá hạt / đá" />
                        </div>
                        <div>
                            <span style={formLabelStyle}>Giá nhân công</span>
                            <input type="number" value={form.gia_nhan_cong} onChange={e => setField('gia_nhan_cong', e.target.value)} style={fieldStyle} placeholder="Giá nhân công" />
                        </div>
                        <div>
                            <span style={formLabelStyle}>Điều chỉnh</span>
                            <input type="number" value={form.dieu_chinh} onChange={e => setField('dieu_chinh', e.target.value)} style={fieldStyle} placeholder="Điều chỉnh +/-" />
                        </div>
                    </div>
                </div>
            </div>

            <div style={{ ...S.totalBar, display: 'flex', gap: 10, justifyContent: 'flex-end', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: 10, width: '100%' }}>
                    <button onClick={handlePrintTem} title="In tem" style={{ ...actionBtn('linear-gradient(135deg,#111827,#334155)', '#ffffff'), flex: 1, minWidth: 0, padding: '11px 14px' }}>
                        <IoPrintOutline />
                        <span>In tem</span>
                    </button>
                    <button onClick={() => resetAll()} title="Đặt lại form" style={{ ...actionBtn('#ffffff', '#111827'), flex: 1, minWidth: 0, padding: '11px 14px' }}>
                        <IoRefreshOutline />
                        <span>Đặt lại</span>
                    </button>
                    <button onClick={saveItem} disabled={saving} title="Lưu sản phẩm" style={{ ...actionBtn('linear-gradient(135deg,#16a34a,#0ea5e9)', '#ffffff'), flex: 1, minWidth: 0, padding: '11px 14px' }}>
                        <IoSaveOutline />
                        <span>{saving ? 'Đang lưu...' : 'Lưu hàng'}</span>
                    </button>
                </div>
            </div>

            <NhapVangChecklistModal
                open={checklistOpen}
                loading={checklistLoading}
                plans={nhapVangLists}
                selectedPlanId={selectedNhapPlan?.id || null}
                selectedItemId={selectedNhapItem?.id || null}
                onClose={() => setChecklistOpen(false)}
                onSelectPlan={selectChecklistPlan}
                onSelectItem={selectChecklistItem}
                onUpdateProgress={(item, delta) => updateChecklistProgress(item, delta).catch(err => setMessage(err.message || 'Không cập nhật được checklist'))}
            />
        </div>
    );
}

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
        const v = isPositiveTransaction(l.tx) ? Math.abs(l.value || 0) : -Math.abs(l.value || 0);
        return s + v;
    }, 0);

    const formula = lines.map(l => {
        const effectiveCat = l.tx === 'trade' ? 'gold' : l.cat;
        const r = rates[effectiveCat]?.[l.product] || [0, 0];
        const rate = normalizeTradeRate(
            effectiveCat,
            l.tx === 'buy' ? (l.customBuy ?? r[1]) : l.tx === 'trade' ? (l.customTrade ?? r[0]) : (l.customSell ?? r[0])
        );
        const sign = isPositiveTransaction(l.tx) ? '+' : '-';
        const itemRef = l.productCode ? ` [${l.productCode}]` : '';
        if (l.tx === 'trade') {
            const customerRef = [l.customerQty, l.customerProduct].filter(Boolean).join(' x ') || 'chưa nhập';
            return `${sign}${l.product}${itemRef} ${fmtCalc(rate)} x ${l.qty} | Khách: ${customerRef} | Công: ${fmtCalc(l.tradeLabor || 0)} | Bù: ${fmtCalc(l.tradeComp || 0)}`;
        }
        return `${sign}${l.product}${itemRef} ${fmtVN(rate)} x ${l.qty} = ${fmtVN(l.value || 0)}`;
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
                // ignore
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
        setLines(prev => {
            if (!prev.length) return [createDefaultLine(rates)];
            return prev.map(line => {
                const availableProducts = Object.keys(rates[line.cat] || {});
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
        } catch { }
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

    /* send order */
    const handleSend = async (payload) => {
        setLoading(true);
        try {
            const nextCustomerInfo = { ...createEmptyCustomerInfo(), ...customerInfo };
            const customerName = nextCustomerInfo.name.trim() || payload.frombank || 'POS Customer';
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
                nextCustomerInfo.backText.trim() ? `OCR mặt sau:\n${nextCustomerInfo.backText.trim()}` : '',
            ].filter(Boolean);
            const response = await fetch(`${API}/api/don_hang`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    khach_hang: customerName,
                    so_dien_thoai: nextCustomerInfo.phone.trim(),
                    dia_chi: nextCustomerInfo.address.trim() || nextCustomerInfo.residence.trim(),
                    ngay_dat: new Date().toISOString().slice(0, 10),
                    tong_tien: Math.abs(parseFmt(payload.total)),
                    dat_coc: Math.abs(parseFmt(payload.bankcash || '0')),
                    trang_thai: 'New',
                    ghi_chu: [...customerNote, payload.formula, payload.note].filter(Boolean).join('\n').trim(),
                    nguoi_tao: 'POS Mobile',
                }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(data.error || `HTTP ${response.status}`);
            }
            const soldUpdate = await markSoldInventoryItems(lines);
            await loadOrders();
            persistSavedDrafts(savedDrafts.filter(item => item.id !== orderId));
            setOrderId(genOrderId());
            setLines([createDefaultLine(rates)]);
            setCustomerInfo(createEmptyCustomerInfo());
            setCustomerInfoOpen(false);
            setScreen('list');
            if (soldUpdate.failedCount > 0) {
                alert(`Đơn đã tạo xong nhưng còn ${soldUpdate.failedCount} sản phẩm chưa đổi sang trạng thái đã bán.`);
            }
        } catch (e) { alert('Error: ' + e.message); }
        setLoading(false);
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

    const showFloatingMenu = screen === 'order' || screen === 'repair' || screen === 'inventory';
    const menuItems = [
        { key: 'order', label: 'Bán hàng', icon: <IoCardOutline /> },
        { key: 'repair', label: 'Sửa / Bỏ', icon: <IoRefreshOutline /> },
        { key: 'inventory', label: 'Nhập kho', icon: <IoCameraOutline /> },
        { key: 'list', label: 'Đơn hôm nay', icon: <IoListOutline /> },
    ];

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', flexDirection: 'column', background: 'linear-gradient(180deg, #f8fcff 0%, #f1fbf3 42%, #dff1ff 100%)' }}>
            <style>{`
                .sale-pos-catalog-input::placeholder {
                    color: #cbd5e1;
                    font-weight: 300;
                    font-size: 75%;
                }
            `}</style>
            {showFloatingMenu && navMenuOpen && (
                <button
                    type="button"
                    aria-label="Đóng menu"
                    onClick={() => setNavMenuOpen(false)}
                    style={{ position: 'absolute', inset: 0, zIndex: 18, border: 'none', background: 'rgba(15,23,42,.08)', cursor: 'default' }}
                />
            )}
            {showFloatingMenu && (
                <div style={{ position: 'absolute', top: 24, left: 24, zIndex: 19, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                        <button
                            type="button"
                            onClick={() => setNavMenuOpen(open => !open)}
                            title="Menu"
                            aria-label="Menu"
                            style={{ ...S.iconBtn('#ffffff'), width: 42, height: 42, fontSize: 18, border: '1px solid rgba(15,23,42,.08)' }}
                        >
                            <IoMenuOutline />
                        </button>
                    </div>

                    {navMenuOpen && (
                        <div style={{ width: 176, padding: 8, borderRadius: 22, background: 'rgba(255,255,255,.96)', border: '1px solid rgba(15,23,42,.08)', boxShadow: '0 18px 40px rgba(15,23,42,.14)', backdropFilter: 'blur(18px)' }}>
                            <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: .6, color: '#64748b', padding: '2px 4px 8px' }}>ĐIỀU HƯỚNG</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {menuItems.map(item => {
                                    const active = screen === item.key;
                                    return (
                                        <button
                                            key={item.key}
                                            type="button"
                                            onClick={() => {
                                                openNavScreen(item.key);
                                                setNavMenuOpen(false);
                                            }}
                                            style={floatingMenuItemStyle(active)}
                                        >
                                            <span style={floatingMenuIconStyle(active)}>{item.icon}</span>
                                            <span style={{ fontSize: 11, fontWeight: 800 }}>{item.label}</span>
                                        </button>
                                    );
                                })}
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSavedModalOpen(true);
                                        setNavMenuOpen(false);
                                    }}
                                    style={floatingMenuItemStyle(false)}
                                >
                                    <span style={floatingMenuIconStyle(false)}><IoSaveOutline /></span>
                                    <span style={{ fontSize: 11, fontWeight: 800, flex: 1 }}>Giao dịch lưu</span>
                                    {savedDrafts.length > 0 && (
                                        <span style={{ minWidth: 22, height: 22, padding: '0 6px', borderRadius: 999, background: '#dc2626', color: 'white', fontSize: 10, fontWeight: 900, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                                            {savedDrafts.length > 99 ? '99+' : savedDrafts.length}
                                        </span>
                                    )}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', position: 'relative' }}>
                {screen === 'order' && (
                    <OrderScreen rates={rates} inventoryItems={inventoryItems} lines={lines} setLines={setLines}
                        total={total} orderId={orderId}
                        onNext={() => setScreen('payment')}
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
                        loading={loading}
                        onBack={() => setScreen('order')}
                        onSend={handleSend} />
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
                        onSaved={() => { loadInventoryItems(); loadOrders(); setScreen('list'); }}
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
