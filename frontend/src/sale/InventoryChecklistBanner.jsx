import { IoAddOutline, IoListOutline, IoRemoveOutline } from 'react-icons/io5';

import { S } from './shared';
import { renderChecklistDots } from './SavedScreens';

export default function InventoryChecklistBanner({
    selectedNhapItem,
    selectedNhapPlan,
    sectionStyle,
    setChecklistOpen,
    updateChecklistProgress,
    setMessage,
}) {
    if (!selectedNhapItem) return null;

    return (
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
    );
}
