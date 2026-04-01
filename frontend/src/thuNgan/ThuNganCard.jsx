import { useState, useRef } from 'react';
import {
    actionBtn,
    cashierAmountStyle,
    detailGridStyle,
    fmt,
    formatMoneyInput,
    inputBase,
    panelStyle,
    textareaStyle,
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
            onChange={e => {
                if (readOnly) return;
                const stripped = e.target.value.replace(/,/g, '').replace(/[^0-9.-]/g, '');
                setDraftVal(stripped);
            }}
            onKeyDown={e => {
                if (e.key === 'Enter') e.target.blur();
            }}
            onFocus={() => { 
                if (!readOnly) {
                    setDraftVal(raw);
                    setFocused(true);
                }
            }}
            onBlur={async (e) => {
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

const quayTagStyle = (isEmpty = false) => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '4px 9px',
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 700,
    background: isEmpty ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.18)',
    color: 'white',
    border: `1px solid ${isEmpty ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.24)'}`,
});


export default function ThuNganCard({
    draftState,
    form,
    isSaving,
    onAddDetailRow,
    onChot,
    onDetailFieldChange,
    onNoteChange,
    onRemoveDetailRow,
    row,
    totals,
    tuoiVangOptions,
}) {
    const [confirmDialog, setConfirmDialog] = useState(null);
    const [collapsed, setCollapsed] = useState(false);
    const isConfirmingRef = useRef(false);
    const assignedQuays = Array.isArray(row?.quays) ? row.quays.filter(Boolean) : [];

    const requestConfirm = (rowId, newVal) => {
        return new Promise((resolve) => {
            if (isConfirmingRef.current) {
                resolve(false);
                return;
            }
            isConfirmingRef.current = true;
            setConfirmDialog({
                message: 'Bạn muốn chốt tồn đầu kỳ? Hệ thống sẽ cập nhật số dư hiện tại bằng với tồn đầu kỳ.',
                onOk: () => {
                    onDetailFieldChange(row.thu_ngan_id, rowId, 'ton_dau_ky', newVal);
                    setTimeout(() => {
                        onDetailFieldChange(row.thu_ngan_id, rowId, 'so_du_hien_tai', newVal);
                    }, 0);
                    isConfirmingRef.current = false;
                    setConfirmDialog(null);
                    resolve(true);
                },
                onCancel: () => {
                    isConfirmingRef.current = false;
                    setConfirmDialog(null);
                    resolve(false);
                }
            });
        });
    };

    return (
        <div style={{ ...panelStyle, overflow: 'hidden' }}>
            <div
                onClick={() => setCollapsed(!collapsed)}
                style={{ background: 'linear-gradient(135deg,#0f766e,#0f172a)', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, cursor: 'pointer', userSelect: 'none' }}
                title={collapsed ? "Mở rộng" : "Thu gọn"}
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
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                            {assignedQuays.length > 0 ? assignedQuays.map((quay) => (
                                <span key={quay.id || quay.ten_quay} style={quayTagStyle(false)}>
                                    🗂 {quay.ten_quay}
                                </span>
                            )) : (
                                <span style={quayTagStyle(true)}>
                                    Chưa gán quầy
                                </span>
                            )}
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
                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onChot(row); }}
                        disabled={isSaving}
                        style={{ background: 'white', color: '#0f172a', border: 'none', borderRadius: 8, padding: '8px 14px', fontWeight: 800, fontSize: 12, cursor: isSaving ? 'wait' : 'pointer', opacity: isSaving ? 0.8 : 1 }}
                    >
                        {isSaving ? 'Đang chốt...' : 'Chốt Thu Ngân'}
                    </button>
                </div>
            </div>

            <div style={{ padding: '12px 16px', display: collapsed ? 'none' : 'block' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    </div>
                    {draftState && (
                        <span style={{ fontSize: 10, fontWeight: 800, color: draftState.color, background: draftState.bg, borderRadius: 999, padding: '4px 8px' }}>
                            {draftState.label}
                        </span>
                    )}
                </div>


                <div style={{ marginBottom: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
                        <button
                            type="button"
                            onClick={() => onAddDetailRow(row.thu_ngan_id)}
                            style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid #bfdbfe', background: '#eff6ff', color: '#1d4ed8', fontWeight: 900, fontSize: 18, cursor: 'pointer', lineHeight: 1 }}
                            aria-label="Thêm dòng"
                            title="Thêm dòng"
                        >
                            +
                        </button>
                    </div>

                    <div style={{ overflowX: 'auto' }}>
                        {/* Header labels */}
                        <div style={{ ...detailGridStyle, marginBottom: 8, color: '#64748b', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.3 }}>
                            <div>Loại</div>
                            <div>Tồn đầu kỳ</div>
                            <div>Số dư hiện tại</div>
                            <div>Giá trị lệch</div>
                            <div />
                        </div>

                    {/* Fixed row: Tiền mặt — luôn hiển thị, không có select, không có nút xóa */}
                    {(() => {
                        const tienMatRow = form.chi_tiet.find((r) => r.tuoi_vang === TIEN_MAT_TUOI);
                        if (!tienMatRow) return null;
                        return (
                            <div style={{ ...detailGridStyle, marginBottom: 10, padding: '8px 10px', borderRadius: 10, background: '#fefce8', border: '1.5px solid #fde68a' }}>
                                <div style={{ fontSize: 12, fontWeight: 800, color: '#92400e', display: 'flex', alignItems: 'center', gap: 5 }}>
                                    💵 Tiền mặt
                                </div>
                                <MoneyInput
                                    value={tienMatRow.ton_dau_ky}
                                    onCommit={newVal => requestConfirm(tienMatRow.row_id, newVal)}
                                    style={{ ...inputBase, background: '#fffbeb' }}
                                    placeholder="0"
                                />
                                <MoneyInput
                                    value={tienMatRow.so_du_hien_tai}
                                    onChange={v => onDetailFieldChange(row.thu_ngan_id, tienMatRow.row_id, 'so_du_hien_tai', v)}
                                    style={{ ...inputBase, background: '#fffbeb' }}
                                    placeholder="0"
                                    readOnly={true}
                                />
                                <MoneyInput
                                    value={tienMatRow.gia_tri_lech}
                                    onChange={v => onDetailFieldChange(row.thu_ngan_id, tienMatRow.row_id, 'gia_tri_lech', v)}
                                    style={{ ...inputBase, background: '#fffbeb' }}
                                    placeholder={formatMoneyInput(toNumber(tienMatRow.so_du_hien_tai) - toNumber(tienMatRow.ton_dau_ky))}
                                    readOnly={true}
                                />
                                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                                    <button
                                        type="button"
                                        onClick={() => requestConfirm(tienMatRow.row_id, tienMatRow.ton_dau_ky)}
                                        style={{ width: 34, height: 34, borderRadius: 10, border: '1px solid #bbf7d0', background: '#f0fdf4', color: '#16a34a', fontSize: 14, fontWeight: 900, cursor: 'pointer' }}
                                        aria-label="Chốt" title="Chốt tồn đầu kỳ"
                                    >
                                        ✔
                                    </button>
                                </div>
                            </div>
                        );
                    })()}

                    {form.chi_tiet.filter((r) => r.tuoi_vang !== TIEN_MAT_TUOI).length === 0 ? (
                        <div style={{ padding: 12, textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>
                            Chưa có dòng tuổi vàng nào. Bấm <b>+</b> để thêm.
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {form.chi_tiet.filter((r) => r.tuoi_vang !== TIEN_MAT_TUOI).map(detail => (
                                <div key={detail.row_id} style={detailGridStyle}>
                                    <select
                                        value={detail.tuoi_vang}
                                        onChange={e => onDetailFieldChange(row.thu_ngan_id, detail.row_id, 'tuoi_vang', e.target.value)}
                                        style={{ ...inputBase, cursor: 'pointer' }}
                                    >
                                        <option value="">-- Chọn tuổi vàng --</option>
                                        {tuoiVangOptions.map(option => (
                                            <option key={option.id || option.ten_tuoi} value={option.ten_tuoi}>
                                                {option.ten_tuoi}
                                            </option>
                                        ))}
                                    </select>
                                    <MoneyInput
                                        value={detail.ton_dau_ky}
                                        onCommit={newVal => requestConfirm(detail.row_id, newVal)}
                                        style={inputBase}
                                        placeholder="0"
                                    />
                                    <MoneyInput
                                        value={detail.so_du_hien_tai}
                                        onChange={v => onDetailFieldChange(row.thu_ngan_id, detail.row_id, 'so_du_hien_tai', v)}
                                        style={inputBase}
                                        placeholder="0"
                                        readOnly={true}
                                    />
                                    <MoneyInput
                                        value={detail.gia_tri_lech}
                                        onChange={v => onDetailFieldChange(row.thu_ngan_id, detail.row_id, 'gia_tri_lech', v)}
                                        style={inputBase}
                                        placeholder={formatMoneyInput(toNumber(detail.so_du_hien_tai) - toNumber(detail.ton_dau_ky))}
                                        readOnly={true}
                                    />
                                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                                        <button
                                            type="button"
                                            onClick={() => requestConfirm(detail.row_id, detail.ton_dau_ky)}
                                            style={{ width: 34, height: 34, borderRadius: 10, border: '1px solid #bbf7d0', background: '#f0fdf4', color: '#16a34a', fontSize: 14, fontWeight: 900, cursor: 'pointer' }}
                                            aria-label="Chốt" title="Chốt tồn đầu kỳ"
                                        >
                                            ✔
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => onRemoveDetailRow(row.thu_ngan_id, detail.row_id)}
                                            style={{ width: 34, height: 34, borderRadius: 10, border: '1px solid #fecdd3', background: '#fff1f2', color: '#dc2626', fontSize: 13, fontWeight: 900, cursor: 'pointer' }}
                                            aria-label="Xóa dòng" title="Xóa dòng"
                                        >
                                            ✖
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                    </div>{/* end overflowX:auto */}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                </div>
            </div>

            {confirmDialog && (
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
            )}
        </div>
    );
}
