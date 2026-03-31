import { useState } from 'react';
import GiaVangTab from './cauhinh/GiaVangTab';
import KhoTab from './cauhinh/KhoTab';
import NhomHangTab from './cauhinh/NhomHangTab';
import QuayTab from './cauhinh/QuayTab';
import TraoDoiTabV2 from './cauhinh/TraoDoiTabV2';
import TuoiVangTab from './cauhinh/TuoiVangTab';

const SUB_TABS = [
    { key: 'gia_vang', label: 'Giá vàng', Component: GiaVangTab },
    { key: 'tuoi_vang', label: 'Tuổi vàng', Component: TuoiVangTab },
    { key: 'nhom_hang', label: 'Nhóm hàng', Component: NhomHangTab },
    { key: 'kho', label: 'Kho', Component: KhoTab },
    { key: 'quay_nho', label: 'Quầy nhỏ', Component: QuayTab },
    { key: 'trao_doi', label: 'Trao đổi', Component: TraoDoiTabV2 },
];

export default function CauHinhPage() {
    const [tab, setTab] = useState('tuoi_vang');
    const orderedTabs = ['tuoi_vang', 'nhom_hang', 'kho', 'quay_nho', 'trao_doi', 'gia_vang']
        .map(key => SUB_TABS.find(t => t.key === key))
        .filter(Boolean);
    const activeTab = orderedTabs.find(t => t.key === tab) || null;
    const ActiveComponent = activeTab?.Component || null;

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '0 28px', display: 'flex', gap: 4 }}>
                {orderedTabs.map(t => (
                    <button key={t.key} onClick={() => setTab(t.key)} style={{
                        padding: '12px 18px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700,
                        background: 'none', color: tab === t.key ? '#1e293b' : '#94a3b8',
                        borderBottom: tab === t.key ? '2.5px solid #f59e0b' : '2.5px solid transparent',
                        transition: 'all .15s',
                    }}>{t.label}</button>
                ))}
            </div>
            <div style={{ flex: 1, padding: '24px 28px', overflowY: 'auto', background: '#f8fafc' }}>
                {ActiveComponent ? <ActiveComponent /> : null}
            </div>
        </div>
    );
}
