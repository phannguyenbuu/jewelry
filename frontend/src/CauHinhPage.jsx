import { useState } from 'react';
import GiaVangTab from './cauhinh/GiaVangTab';
import KhoTab from './cauhinh/KhoTab';
import NhomHangTab from './cauhinh/NhomHangTab';
import QuayTab from './cauhinh/QuayTab';
import TaiKhoanNganHangTab from './cauhinh/TaiKhoanNganHangTab';
import TuoiVangTab from './cauhinh/TuoiVangTab';

const SUB_TABS = [
    { key: 'gia_vang', label: 'Giá vàng', Component: GiaVangTab },
    { key: 'tuoi_vang', label: 'Tuổi vàng', Component: TuoiVangTab },
    { key: 'nhom_hang', label: 'Nhóm hàng', Component: NhomHangTab },
    { key: 'kho', label: 'Kho', Component: KhoTab },
    { key: 'quay_nho', label: 'Quầy nhỏ', Component: QuayTab },
    { key: 'tai_khoan_ngan_hang', label: 'Tài khoản NH', Component: TaiKhoanNganHangTab },
];

export default function CauHinhPage() {
    const [tab, setTab] = useState('tuoi_vang');
    const orderedTabs = ['tuoi_vang', 'nhom_hang', 'kho', 'quay_nho', 'tai_khoan_ngan_hang', 'gia_vang']
        .map(key => SUB_TABS.find((item) => item.key === key))
        .filter(Boolean);
    const activeTab = orderedTabs.find((item) => item.key === tab) || null;
    const ActiveComponent = activeTab?.Component || null;

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '0 28px', display: 'flex', gap: 4 }}>
                {orderedTabs.map((item) => (
                    <button
                        key={item.key}
                        onClick={() => setTab(item.key)}
                        style={{
                            padding: '12px 18px',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: 13,
                            fontWeight: 700,
                            background: 'none',
                            color: tab === item.key ? '#1e293b' : '#94a3b8',
                            borderBottom: tab === item.key ? '2.5px solid #f59e0b' : '2.5px solid transparent',
                            transition: 'all .15s',
                        }}
                    >
                        {item.label}
                    </button>
                ))}
            </div>
            <div style={{ flex: 1, padding: '24px 28px', overflowY: 'auto', background: '#f8fafc' }}>
                {ActiveComponent ? <ActiveComponent /> : null}
            </div>
        </div>
    );
}
