import { IoPrintOutline, IoRefreshOutline, IoSaveOutline } from 'react-icons/io5';

import { S } from './shared';
import { NhapVangChecklistModal } from './SavedScreens';

export default function InventoryFooter({
    actionBtn,
    handlePrintTem,
    resetAll,
    saveItem,
    saving,
    checklistOpen,
    checklistLoading,
    nhapVangLists,
    selectedNhapPlan,
    selectedNhapItem,
    setChecklistOpen,
    selectChecklistPlan,
    selectChecklistItem,
    updateChecklistProgress,
    setMessage,
}) {
    return (
        <>
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
        </>
    );
}
