export const VIET_QR_BANKS = [
    { code: 'ABB', shortName: 'ABBANK', name: 'ABBANK', bin: '970425' },
    { code: 'ACB', shortName: 'ACB', name: 'ACB', bin: '970416' },
    { code: 'VBA', shortName: 'Agribank', name: 'Agribank', bin: '970405' },
    { code: 'BAB', shortName: 'BacABank', name: 'BacABank', bin: '970409' },
    { code: 'BVB', shortName: 'BaoVietBank', name: 'BaoVietBank', bin: '970438' },
    { code: 'BIDV', shortName: 'BIDV', name: 'BIDV', bin: '970418' },
    { code: 'CAKE', shortName: 'CAKE', name: 'CAKE', bin: '546034' },
    { code: 'CIMB', shortName: 'CIMB', name: 'CIMB', bin: '422589' },
    { code: 'COOPBANK', shortName: 'COOPBANK', name: 'COOPBANK', bin: '970446' },
    { code: 'EIB', shortName: 'Eximbank', name: 'Eximbank', bin: '970431' },
    { code: 'HDB', shortName: 'HDBank', name: 'HDBank', bin: '970437' },
    { code: 'KLB', shortName: 'KienLongBank', name: 'KienLongBank', bin: '970452' },
    { code: 'LPB', shortName: 'LPBank', name: 'LPBank', bin: '970449' },
    { code: 'MB', shortName: 'MBBank', name: 'MBBank', bin: '970422' },
    { code: 'MBV', shortName: 'MBV', name: 'MBV', bin: '970414' },
    { code: 'momo', shortName: 'MoMo', name: 'MoMo', bin: '971025' },
    { code: 'MSB', shortName: 'MSB', name: 'MSB', bin: '970426' },
    { code: 'NAB', shortName: 'NamABank', name: 'NamABank', bin: '970428' },
    { code: 'NCB', shortName: 'NCB', name: 'NCB', bin: '970419' },
    { code: 'OCB', shortName: 'OCB', name: 'OCB', bin: '970448' },
    { code: 'PGB', shortName: 'PGBank', name: 'PGBank', bin: '970430' },
    { code: 'PVCB', shortName: 'PVcomBank', name: 'PVcomBank', bin: '970412' },
    { code: 'PVDB', shortName: 'PVcomBank Pay', name: 'PVcomBank Pay', bin: '971133' },
    { code: 'STB', shortName: 'Sacombank', name: 'Sacombank', bin: '970403' },
    { code: 'SGICB', shortName: 'SaigonBank', name: 'SaigonBank', bin: '970400' },
    { code: 'SCB', shortName: 'SCB', name: 'SCB', bin: '970429' },
    { code: 'SEAB', shortName: 'SeABank', name: 'SeABank', bin: '970440' },
    { code: 'SHB', shortName: 'SHB', name: 'SHB', bin: '970443' },
    { code: 'SHBVN', shortName: 'ShinhanBank', name: 'ShinhanBank', bin: '970424' },
    { code: 'TCB', shortName: 'Techcombank', name: 'Techcombank', bin: '970407' },
    { code: 'TIMO', shortName: 'Timo', name: 'Timo', bin: '963388' },
    { code: 'TPB', shortName: 'TPBank', name: 'TPBank', bin: '970423' },
    { code: 'VIB', shortName: 'VIB', name: 'VIB', bin: '970441' },
    { code: 'VAB', shortName: 'VietABank', name: 'VietABank', bin: '970427' },
    { code: 'VIETBANK', shortName: 'VietBank', name: 'VietBank', bin: '970433' },
    { code: 'VCCB', shortName: 'VietCapitalBank', name: 'VietCapitalBank', bin: '970454' },
    { code: 'VCB', shortName: 'Vietcombank', name: 'Vietcombank', bin: '970436' },
    { code: 'ICB', shortName: 'VietinBank', name: 'VietinBank', bin: '970415' },
    { code: 'VPB', shortName: 'VPBank', name: 'VPBank', bin: '970432' },
];

const normalizeBankText = (value) => String(value || '').trim().toLowerCase();

export const getVietQrBankLogoUrl = (bank) => {
    const code = String(bank?.code || '').trim();
    return code ? `https://cdn.vietqr.io/img/${code}.png` : '';
};

export const formatVietQrBankLabel = (bank) => {
    const code = String(bank?.code || '').trim();
    const shortName = String(bank?.shortName || '').trim();
    if (!code) return shortName;
    if (!shortName) return code;
    return code.toLowerCase() === shortName.toLowerCase() ? code : `${code} · ${shortName}`;
};

export const findVietQrBank = (value) => {
    const normalized = normalizeBankText(value);
    if (!normalized) return null;
    return VIET_QR_BANKS.find((bank) => {
        const fields = [
            bank.code,
            bank.shortName,
            bank.name,
            formatVietQrBankLabel(bank),
        ].map(normalizeBankText);
        return fields.includes(normalized);
    }) || null;
};
