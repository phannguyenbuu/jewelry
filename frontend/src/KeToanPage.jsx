import { useState } from 'react';
import BaoCaoThueTab from './keToan/BaoCaoThueTab';
import ChungTuTab from './keToan/ChungTuTab';
import DanhMucTab from './keToan/DanhMucTab';
import ThuChiTab from './keToan/ThuChiTab';
import { loadDM } from './keToan/shared';
import HoaDonTab from './keToan/HoaDonTab';

const TABS = [
    { key: 'hoa_don', label: 'Hóa Đơn Tài Chính' },
    { key: 'thu_chi', label: 'Thu Chi Hằng Ngày' },
    { key: 'chung_tu', label: 'Chứng Từ KT' },
    { key: 'bao_cao', label: 'Báo Cáo Thuế' },
    { key: 'danh_muc', label: 'Cấu Hình Danh Mục' },
];

export default function KeToanPage() {
    const [tab, setTab] = useState('hoa_don');
    const [dm, setDm] = useState(loadDM);
    return (
        <div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 20, background: 'white', borderRadius: 12, padding: 5, border: '1px solid #e2e8f0', width: 'fit-content', flexWrap: 'wrap' }}>
                {TABS.map(t => (
                    <button key={t.key} onClick={() => setTab(t.key)}
                        style={{ padding: '8px 18px', borderRadius: 9, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13, background: tab === t.key ? '#1e293b' : 'transparent', color: tab === t.key ? 'white' : '#64748b', transition: 'all .15s' }}>
                        {t.label}
                    </button>
                ))}
            </div>
            {tab === 'hoa_don' && <HoaDonTab />}
            {tab === 'thu_chi' && <ThuChiTab dm={dm} />}
            {tab === 'chung_tu' && <ChungTuTab />}
            {tab === 'bao_cao' && <BaoCaoThueTab />}
            {tab === 'danh_muc' && <DanhMucTab dm={dm} setDm={setDm} />}
        </div>
    );
}
