import { useState } from 'react';
import { buildCompanyBankCategorySpecs } from '../lib/companyBankAccounts';
import {
    formatMoneyInput,
    inputBase,
    panelStyle,
    TIEN_MAT_TUOI,
    toNumber,
} from './utils';

function MoneyInput({ value, onChange, onCommit, style, placeholder, readOnly }) {
    const [focused, setFocused] = useState(false);
    const [draftVal, setDraftVal] = useState('');
    const raw = String(value ?? '');
    const num = toNumber(raw);
    const displayVal = focused && !readOnly
        ? draftVal
        : (raw === '' ? '' : num === 0 ? '0' : num.toLocaleString('en-US'));

    return (
        <input
            type="text"
            inputMode="numeric"
            value={displayVal}
            onChange={(e) => {
                if (readOnly) return;
                const stripped = e.target.value.replace(/,/g, '').replace(/[^0-9.-]/g, '');
                setDraftVal(stripped);
            }}
            onKeyDown={(e) => {
                if (e.key === 'Enter') e.target.blur();
            }}
            onFocus={() => {
                if (!readOnly) {
                    setDraftVal(raw);
                    setFocused(true);
                }
            }}
            onBlur={async () => {
                if (readOnly) return;
                const normalized = formatMoneyInput(toNumber(draftVal));
                if (normalized !== raw) {
                    if (onCommit) {
                        const success = await onCommit(normalized, raw);
                        if (!success) {
                            setFocused(false);
                            return;
                        }
                    } else if (onChange) {
                        onChange(normalized);
                    }
                }
                setFocused(false);
            }}
            style={{ ...style, ...(readOnly ? { background: '#f8fafc', color: '#64748b', cursor: 'not-allowed' } : {}) }}
            placeholder={placeholder}
            readOnly={readOnly}
        />
    );
}

export default function KhoTongCard({
    draftState,
    form,
    onReset,
    onUpsertCategoryField,
    row,
    companyBankAccounts,
    tuoiVangOptions,
}) {
    const [confirmDialog, setConfirmDialog] = useState(null);
    const [collapsed, setCollapsed] = useState(false);

    const handleResetAll = () => {
        setConfirmDialog({
            message: 'Bạn muốn đưa toàn bộ Tồn đầu kỳ và Số dư hiện tại của Kho Tổng về 0?',
            onOk: () => {
                onReset(row.thu_ngan_id);
                setConfirmDialog(null);
            },
            onCancel: () => {
                setConfirmDialog(null);
            },
        });
    };

    const companyBankCategories = buildCompanyBankCategorySpecs(companyBankAccounts, form.chi_tiet);
    const categories = [
        { key: TIEN_MAT_TUOI, label: TIEN_MAT_TUOI, icon: '💵', isSpecial: true },
        ...companyBankCategories.map((item) => ({
            key: item.key,
            label: item.label,
            icon: '🏦',
            isSpecial: true,
        })),
        ...(tuoiVangOptions || []).map((option) => ({
            key: option.ten_tuoi,
            label: option.ten_tuoi,
            icon: '💎',
            isSpecial: false,
        })),
    ];

    return (
        <div style={{ ...panelStyle, overflow: 'hidden' }}>
            <div
                onClick={() => setCollapsed(!collapsed)}
                style={{ background: 'linear-gradient(135deg,#0f766e,#0f172a)', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, cursor: 'pointer', userSelect: 'none' }}
                title={collapsed ? 'Mở rộng' : 'Thu gọn'}
            >
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <div style={{ color: 'white', opacity: 0.7, fontSize: 14, marginTop: 3 }}>
                        {collapsed ? '▶' : '▼'}
                    </div>
                    <div>
                        <div style={{ color: 'white', fontWeight: 900, fontSize: 18 }}>{row.ten_thu_ngan}</div>
                        <div style={{ color: 'rgba(255,255,255,.85)', fontSize: 11, marginTop: 2 }}>
                            {row.nguoi_quan_ly || 'Chưa gán nhân sự'}
                        </div>
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,.72)', marginBottom: 4 }}>Cập nhật</div>
                        <div style={{ fontSize: 11, color: 'white', fontWeight: 700 }}>
                            {row.cap_nhat_luc || 'Chưa chốt'}
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleResetAll(); }}
                            style={{ background: 'rgba(255,255,255,0.1)', color: 'white', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 8, padding: '8px 14px', fontWeight: 800, fontSize: 12, cursor: 'pointer' }}
                        >
                            Reset 0
                        </button>
                    </div>
                </div>
            </div>

            <div style={{ padding: '12px 16px', display: collapsed ? 'none' : 'block' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
                    <div />
                    {draftState ? (
                        <span style={{ fontSize: 10, fontWeight: 800, color: draftState.color, background: draftState.bg, borderRadius: 999, padding: '4px 8px' }}>
                            {draftState.label}
                        </span>
                    ) : null}
                </div>

                <div style={{ marginBottom: 14 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 16 }}>
                        {categories.map((category) => {
                            const detail = form.chi_tiet.find((item) => item.tuoi_vang === category.key) || {
                                tuoi_vang: category.key,
                                ton_dau_ky: '',
                                so_du_hien_tai: '',
                                gia_tri_lech: '',
                            };

                            return (
                                <div key={category.key} style={{ background: category.isSpecial ? '#fefce8' : 'white', border: `1.5px solid ${category.isSpecial ? '#fde68a' : '#e2e8f0'}`, borderRadius: 10, padding: '10px 12px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                                        <div style={{ fontSize: 13, fontWeight: 800, color: category.isSpecial ? '#92400e' : '#475569', display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                                            <span>{category.icon}</span>
                                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{category.label}</span>
                                        </div>
                                        <MoneyInput
                                            value={detail.so_du_hien_tai}
                                            onChange={(value) => onUpsertCategoryField(row.thu_ngan_id, category.key, 'so_du_hien_tai', value)}
                                            style={{ ...inputBase, padding: '8px 10px', fontSize: 13, fontWeight: 700, background: category.isSpecial ? '#fffbeb' : 'white', width: 140, textAlign: 'right', border: '1px solid #cbd5e1' }}
                                            placeholder="0"
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {confirmDialog ? (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15,23,42,0.6)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    <div style={{ background: 'white', padding: 24, borderRadius: 16, width: 320, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
                        <div style={{ fontSize: 16, fontWeight: 800, color: '#1e293b', marginBottom: 12 }}>Xác nhận chốt</div>
                        <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.5, marginBottom: 20 }}>
                            {confirmDialog.message}
                        </div>
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                            <button
                                type="button"
                                onClick={confirmDialog.onCancel}
                                style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #cbd5e1', background: 'white', color: '#475569', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
                            >
                                Bỏ qua
                            </button>
                            <button
                                type="button"
                                onClick={confirmDialog.onOk}
                                style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#0f766e', color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
                            >
                                OK
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
