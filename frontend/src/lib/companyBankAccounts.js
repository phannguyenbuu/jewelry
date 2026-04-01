import { API_BASE } from './api';

export const COMPANY_BANK_LEDGER_PREFIX = 'bank_account:';
const COMPANY_BANK_API_PATH = '/api/cau_hinh/tai_khoan_ngan_hang';
const DEV_LOCAL_COMPANY_BANK_API_BASE = 'http://127.0.0.1:5001';
const COMPANY_BANK_LOCAL_CACHE_KEY = 'jewelry.company_bank_accounts.local';
export const LEGACY_BANK_LEDGER_NAME = 'Tài Khoản Ngân Hàng';

export const LEGACY_FIXED_COMPANY_BANK_ACCOUNT = Object.freeze({
    id: 'legacy-fixed-company-bank-account',
    bank_code: 'BIDV',
    bank_name: 'BIDV',
    account_no: 'MBFDN2473E9644CABID',
    account_name: '',
    display_name: 'Tài khoản mặc định',
    label: 'BIDV · MBFDN2473E9644CABID',
    max_incoming_amount: 0,
    ledger_key: LEGACY_BANK_LEDGER_NAME,
    note: 'Tài khoản mặc định cũ của POS.',
    is_fallback: true,
});

const pickText = (value, fallback = '') => String(value ?? '').trim() || fallback;
const trimTrailingSlash = (value = '') => String(value ?? '').trim().replace(/\/+$/, '');
const asCompanyBankAccountObject = (value) => (value && typeof value === 'object' ? value : {});

const parseMoney = (value) => {
    const normalized = String(value ?? '').replace(/,/g, '').replace(/[^0-9-]/g, '').trim();
    const parsed = Number(normalized || 0);
    return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
};

export const shouldTryLocalCompanyBankBackend = () => {
    if (typeof window === 'undefined') return false;
    const hostname = pickText(window.location?.hostname).toLowerCase();
    return hostname === 'localhost' || hostname === '127.0.0.1';
};

const buildCompanyBankApiUrl = (pathSuffix = '', base = API_BASE) => {
    const normalizedBase = trimTrailingSlash(base);
    const suffix = pickText(pathSuffix).replace(/^\/+/, '');
    return `${normalizedBase}${COMPANY_BANK_API_PATH}${suffix ? `/${encodeURIComponent(suffix)}` : ''}`;
};

export const isCompanyBankLedgerKey = (value) => pickText(value).startsWith(COMPANY_BANK_LEDGER_PREFIX);

export const buildCompanyBankLabel = (account = {}) => {
    const safeAccount = asCompanyBankAccountObject(account);
    return (
        pickText(safeAccount.label)
        || pickText(safeAccount.display_name || safeAccount.displayName)
        || [
            pickText(safeAccount.bank_name || safeAccount.bankName || safeAccount.bank_code || safeAccount.bankCode),
            pickText(safeAccount.account_no || safeAccount.accountNo),
        ].filter(Boolean).join(' · ')
        || 'Tài khoản ngân hàng'
    );
};

export const normalizeCompanyBankAccount = (account = {}) => {
    const safeAccount = asCompanyBankAccountObject(account);
    const id = pickText(safeAccount.id);
    const bankCode = pickText(safeAccount.bank_code || safeAccount.bankCode).toUpperCase();
    const bankName = pickText(safeAccount.bank_name || safeAccount.bankName);
    const accountNo = pickText(safeAccount.account_no || safeAccount.accountNo);
    const accountName = pickText(safeAccount.account_name || safeAccount.accountName);
    const displayName = pickText(safeAccount.display_name || safeAccount.displayName);
    const ledgerKey = pickText(safeAccount.ledger_key || safeAccount.ledgerKey, id ? `${COMPANY_BANK_LEDGER_PREFIX}${id}` : '');
    return {
        ...safeAccount,
        id,
        bank_code: bankCode,
        bank_name: bankName,
        account_no: accountNo,
        account_name: accountName,
        display_name: displayName,
        label: buildCompanyBankLabel({
            ...safeAccount,
            bank_code: bankCode,
            bank_name: bankName,
            account_no: accountNo,
            display_name: displayName,
        }),
        max_incoming_amount: parseMoney(safeAccount.max_incoming_amount ?? safeAccount.maxIncomingAmount ?? 0),
        ledger_key: ledgerKey,
        note: pickText(safeAccount.note),
        is_fallback: Boolean(safeAccount.is_fallback),
    };
};

export const readCachedCompanyBankAccounts = () => {
    if (typeof window === 'undefined' || !window.localStorage) return [];
    try {
        const raw = JSON.parse(window.localStorage.getItem(COMPANY_BANK_LOCAL_CACHE_KEY) || '[]');
        return Array.isArray(raw)
            ? raw.map(normalizeCompanyBankAccount).filter((item) => Boolean(item.id))
            : [];
    } catch {
        return [];
    }
};

export const writeCachedCompanyBankAccounts = (accounts) => {
    const normalized = Array.isArray(accounts)
        ? accounts.map(normalizeCompanyBankAccount).filter((item) => Boolean(item.id))
        : [];
    if (typeof window !== 'undefined' && window.localStorage) {
        try {
            window.localStorage.setItem(COMPANY_BANK_LOCAL_CACHE_KEY, JSON.stringify(normalized));
        } catch {
            // Best effort only; cache write failures should not block POS usage.
        }
    }
    return normalized;
};

export async function requestCompanyBankAccounts(pathSuffix = '', options = {}) {
    const normalizedPrimaryBase = trimTrailingSlash(API_BASE);
    const canTryLocalFallback = shouldTryLocalCompanyBankBackend()
        && normalizedPrimaryBase !== DEV_LOCAL_COMPANY_BANK_API_BASE;
    const fetchOptions = {
        ...options,
        headers: options?.headers ? { ...options.headers } : undefined,
    };

    let primaryResponse = null;
    let primaryError = null;
    try {
        primaryResponse = await fetch(buildCompanyBankApiUrl(pathSuffix, API_BASE), fetchOptions);
        if (primaryResponse.ok) return primaryResponse;
        if (!canTryLocalFallback || (primaryResponse.status !== 404 && primaryResponse.status < 500)) {
            return primaryResponse;
        }
    } catch (error) {
        primaryError = error;
        if (!canTryLocalFallback) throw error;
    }

    try {
        return await fetch(buildCompanyBankApiUrl(pathSuffix, DEV_LOCAL_COMPANY_BANK_API_BASE), fetchOptions);
    } catch (fallbackError) {
        if (primaryResponse) return primaryResponse;
        throw primaryError || fallbackError;
    }
}

export async function fetchCompanyBankAccounts() {
    let response = null;
    try {
        response = await requestCompanyBankAccounts();
    } catch (error) {
        if (shouldTryLocalCompanyBankBackend()) {
            return readCachedCompanyBankAccounts();
        }
        throw error;
    }

    let payload = {};
    try {
        payload = await response.json();
    } catch {
        payload = {};
    }

    if (!response.ok) {
        if (shouldTryLocalCompanyBankBackend()) {
            const cached = readCachedCompanyBankAccounts();
            if (cached.length || response.status === 404 || response.status >= 500) {
                return cached;
            }
        }
        throw new Error(payload.error || `HTTP ${response.status}`);
    }

    const items = Array.isArray(payload?.items)
        ? payload.items.map(normalizeCompanyBankAccount)
        : [];
    return writeCachedCompanyBankAccounts(items);
}

export const withFallbackCompanyBankAccounts = (accounts, includeFallbackIfEmpty = true) => {
    const normalized = Array.isArray(accounts)
        ? accounts.map(normalizeCompanyBankAccount).filter((item) => Boolean(item.id))
        : [];
    if (normalized.length || !includeFallbackIfEmpty) return normalized;
    return [normalizeCompanyBankAccount(LEGACY_FIXED_COMPANY_BANK_ACCOUNT)];
};

export const buildCompanyBankCategorySpecs = (accounts, detailRows = []) => {
    const specs = [];
    const seen = new Set();

    for (const account of withFallbackCompanyBankAccounts(accounts, false)) {
        const normalized = normalizeCompanyBankAccount(account);
        const key = normalized.ledger_key;
        if (!key || seen.has(key)) continue;
        seen.add(key);
        specs.push({
            key,
            label: normalized.label,
            account: normalized,
            isBankAccount: true,
            isLegacy: key === LEGACY_BANK_LEDGER_NAME,
        });
    }

    for (const row of detailRows || []) {
        const key = pickText(row?.tuoi_vang);
        if (!key || seen.has(key)) continue;
        if (key === LEGACY_BANK_LEDGER_NAME || isCompanyBankLedgerKey(key)) {
            seen.add(key);
            specs.push({
                key,
                label: key === LEGACY_BANK_LEDGER_NAME ? LEGACY_BANK_LEDGER_NAME : `Tài khoản cũ (${key.slice(COMPANY_BANK_LEDGER_PREFIX.length)})`,
                account: null,
                isBankAccount: true,
                isLegacy: key === LEGACY_BANK_LEDGER_NAME,
            });
        }
    }

    return specs;
};
