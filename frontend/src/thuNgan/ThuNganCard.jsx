import {
    actionBtn,
    cashierAmountStyle,
    detailGridStyle,
    fmt,
    formatMoneyInput,
    inputBase,
    panelStyle,
    textareaStyle,
    toNumber,
} from './utils';

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
    return (
        <div style={panelStyle}>
            <div style={{ background: 'linear-gradient(135deg,#0f766e,#0f172a)', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div>
                    <div style={{ color: 'white', fontWeight: 900, fontSize: 18 }}>{row.ten_thu_ngan}</div>
                    <div style={{ color: 'rgba(255,255,255,.85)', fontSize: 11, marginTop: 2 }}>
                        {row.nguoi_quan_ly || 'Chưa gán nhân sự'}
                    </div>
                    <div style={{ marginTop: 6, display: 'inline-block', background: 'rgba(255,255,255,.16)', borderRadius: 999, padding: '3px 8px', fontSize: 10, color: 'white' }}>
                        🏪 {row.ten_kho || 'Chưa gán kho'}
                    </div>
                </div>
                <div style={{ minWidth: 110, textAlign: 'right' }}>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,.72)', marginBottom: 4 }}>Cập nhật</div>
                    <div style={{ fontSize: 11, color: 'white', fontWeight: 700 }}>
                        {row.cap_nhat_luc || 'Chưa chốt'}
                    </div>
                </div>
            </div>

            <div style={{ padding: '12px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {(row.quays || []).length > 0 ? row.quays.map(quay => (
                            <span key={quay.id} style={{ fontSize: 10, color: '#0f766e', background: '#ccfbf1', borderRadius: 999, padding: '4px 8px', fontWeight: 700 }}>
                                {quay.ten_quay}
                            </span>
                        )) : <span style={{ fontSize: 10, color: '#94a3b8' }}>Chưa có quầy nhỏ</span>}
                    </div>
                    {draftState && (
                        <span style={{ fontSize: 10, fontWeight: 800, color: draftState.color, background: draftState.bg, borderRadius: 999, padding: '4px 8px' }}>
                            {draftState.label}
                        </span>
                    )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, marginBottom: 12 }}>
                    <div style={{ background: '#f0fdf4', borderRadius: 10, padding: '10px 12px', border: '1px solid #bbf7d0' }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#16a34a', marginBottom: 4 }}>TỒN ĐẦU KỲ</div>
                        <div style={cashierAmountStyle('#15803d')}>{fmt(totals.dauKy)} ₫</div>
                    </div>
                    <div style={{ background: '#eff6ff', borderRadius: 10, padding: '10px 12px', border: '1px solid #bfdbfe' }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#1d4ed8', marginBottom: 4 }}>SỐ DƯ HIỆN TẠI</div>
                        <div style={cashierAmountStyle('#1d4ed8')}>{fmt(totals.hienTai)} ₫</div>
                    </div>
                    <div style={{ background: totals.chenhLech >= 0 ? '#f0fdf4' : '#fff1f2', borderRadius: 10, padding: '10px 12px', border: `1px solid ${totals.chenhLech >= 0 ? '#bbf7d0' : '#fecdd3'}` }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', marginBottom: 4 }}>GIÁ TRỊ LỆCH</div>
                        <div style={cashierAmountStyle(totals.chenhLech >= 0 ? '#16a34a' : '#dc2626')}>
                            {totals.chenhLech >= 0 ? '+' : ''}{fmt(totals.chenhLech)} ₫
                        </div>
                    </div>
                </div>

                <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden', marginBottom: 14 }}>
                    <div style={{ padding: '10px 12px', borderBottom: '1px solid #eef2f7', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                        <div>
                            <div style={{ fontSize: 12, fontWeight: 800, color: '#1e293b' }}>Chi tiết theo tuổi vàng</div>
                            <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>Thêm dòng bằng nút +, sửa trực tiếp và xóa ở cuối dòng</div>
                        </div>
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

                    {form.chi_tiet.length === 0 ? (
                        <div style={{ padding: 18, textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>
                            Chưa có dòng nào. Bấm <b>+</b> để thêm dòng cho thu ngân này.
                        </div>
                    ) : (
                        <div style={{ overflowX: 'auto', padding: 12 }}>
                            <div style={{ ...detailGridStyle, marginBottom: 8, color: '#64748b', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.3 }}>
                                <div>Tuổi vàng</div>
                                <div>Tồn đầu kỳ</div>
                                <div>Số dư hiện tại</div>
                                <div>Giá trị lệch</div>
                                <div />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {form.chi_tiet.map(detail => (
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
                                        <input
                                            type="number"
                                            step="1"
                                            value={detail.ton_dau_ky}
                                            onChange={e => onDetailFieldChange(row.thu_ngan_id, detail.row_id, 'ton_dau_ky', e.target.value)}
                                            style={inputBase}
                                            placeholder="0"
                                        />
                                        <input
                                            type="number"
                                            step="1"
                                            value={detail.so_du_hien_tai}
                                            onChange={e => onDetailFieldChange(row.thu_ngan_id, detail.row_id, 'so_du_hien_tai', e.target.value)}
                                            style={inputBase}
                                            placeholder="0"
                                        />
                                        <input
                                            type="number"
                                            step="1"
                                            value={detail.gia_tri_lech}
                                            onChange={e => onDetailFieldChange(row.thu_ngan_id, detail.row_id, 'gia_tri_lech', e.target.value)}
                                            style={inputBase}
                                            placeholder={formatMoneyInput(toNumber(detail.so_du_hien_tai) - toNumber(detail.ton_dau_ky))}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => onRemoveDetailRow(row.thu_ngan_id, detail.row_id)}
                                            style={{ width: 34, height: 34, borderRadius: 10, border: '1px solid #fecdd3', background: '#fff1f2', color: '#dc2626', fontSize: 15, fontWeight: 900, cursor: 'pointer' }}
                                            aria-label="Xóa dòng"
                                            title="Xóa dòng"
                                        >
                                            ×
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div style={{ marginBottom: 12 }}>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 5 }}>Ghi chú lần chốt</label>
                    <textarea
                        value={form.ghi_chu}
                        onChange={e => onNoteChange(row.thu_ngan_id, e.target.value)}
                        style={textareaStyle}
                        placeholder="Ghi chú chốt ca..."
                    />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>{form.chi_tiet.length} dòng chi tiết</div>
                    <button
                        type="button"
                        onClick={() => onChot(row)}
                        disabled={isSaving}
                        style={{ ...actionBtn('#0f172a'), minWidth: 124, opacity: isSaving ? 0.7 : 1 }}
                    >
                        {isSaving ? 'Đang chốt...' : 'Chốt số tiền'}
                    </button>
                </div>
            </div>
        </div>
    );
}
