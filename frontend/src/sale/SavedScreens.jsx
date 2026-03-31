/* eslint-disable react-refresh/only-export-components */
import { useState } from 'react';
import { IoAddOutline, IoCheckmarkCircle, IoCheckmarkCircleOutline, IoRemoveOutline, IoTrashOutline } from 'react-icons/io5';
import { POS_RED, S, fmtVN } from './shared';

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
                        <div data-sale-title="true" style={S.title}>Today's orders</div>
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
                        <div data-sale-title="true" style={{ ...S.title, fontSize: 14 }}>Giao dịch lưu</div>
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
                        <div data-sale-title="true" style={{ fontSize: 14, fontWeight: 900, color: '#111827' }}>Danh sách sản phẩm cần nhập</div>
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

export { OrderListScreen, SavedTransactionsModal, renderChecklistDots, pickChecklistItemId, NhapVangChecklistModal };
