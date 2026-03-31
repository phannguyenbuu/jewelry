import { fmt, panelStyle } from './utils';

export default function ThuNganHistory({ history, historyDeletingKey, loading, ngay, onDeleteHistory }) {
    return (
        <div style={panelStyle}>
            <div style={{ padding: '16px 18px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>Lịch sử chốt số tiền</div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 3 }}>Gộp toàn bộ các lần chốt của thu ngân trong ngày {ngay}</div>
                </div>
                <div style={{ fontSize: 12, color: '#64748b', fontWeight: 700 }}>{history.length} lần chốt</div>
            </div>

            {loading ? (
                <div style={{ padding: 30, textAlign: 'center', color: '#94a3b8' }}>Đang tải lịch sử...</div>
            ) : history.length === 0 ? (
                <div style={{ padding: 30, textAlign: 'center', color: '#94a3b8' }}>Chưa có lịch sử chốt số tiền.</div>
            ) : (
                <div style={{ padding: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
                    {history.map((item, index) => {
                        const deleteKey = item.entry_id || `${item.thu_ngan_id}-${item.thoi_gian}-${item.so_tien}`;
                        const isDeleting = historyDeletingKey === deleteKey;
                        return (
                            <div key={`${deleteKey}-${index}`} style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: '12px 14px', background: index % 2 === 0 ? 'white' : '#fafafa' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                                    <div>
                                        <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>{item.ten_thu_ngan}</div>
                                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>{item.ten_kho || '—'}</div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => onDeleteHistory(item)}
                                        disabled={isDeleting}
                                        title="Xóa lịch sử này"
                                        aria-label="Xóa lịch sử này"
                                        style={{ width: 34, height: 34, borderRadius: 10, border: '1px solid #fecdd3', background: '#fff1f2', color: '#b91c1c', fontSize: 15, fontWeight: 800, cursor: isDeleting ? 'default' : 'pointer', opacity: isDeleting ? 0.7 : 1 }}
                                    >
                                        {isDeleting ? '…' : '🗑'}
                                    </button>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
                                    <div style={{ background: '#f8fafc', borderRadius: 10, padding: '8px 10px' }}>
                                        <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', marginBottom: 3 }}>TỒN ĐẦU KỲ</div>
                                        <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>{fmt(item.so_tien_dau_ngay)} ₫</div>
                                    </div>
                                    <div style={{ background: '#eff6ff', borderRadius: 10, padding: '8px 10px' }}>
                                        <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', marginBottom: 3 }}>SỐ DƯ HIỆN TẠI</div>
                                        <div style={{ fontSize: 14, fontWeight: 800, color: '#1d4ed8' }}>{fmt(item.so_tien)} ₫</div>
                                    </div>
                                </div>
                                <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                    <div style={{ fontSize: 11, color: (item.so_tien_chenh_lech || 0) >= 0 ? '#16a34a' : '#dc2626', fontWeight: 800 }}>
                                        Lệch: {(item.so_tien_chenh_lech || 0) >= 0 ? '+' : ''}{fmt(item.so_tien_chenh_lech || 0)} ₫
                                    </div>
                                    <div style={{ fontSize: 10, color: '#94a3b8' }}>{item.so_dong_chi_tiet || 0} dòng</div>
                                </div>
                                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 10 }}>🕒 {item.thoi_gian}</div>
                                <div style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}>{item.ghi_chu || '—'}</div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
