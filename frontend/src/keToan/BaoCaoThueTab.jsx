import { useEffect, useState } from 'react';
import { API, fmt, inp } from './shared';

export default function BaoCaoThueTab() {
    const [chungTu, setChungTu] = useState([]);
    const [year, setYear] = useState(new Date().getFullYear());
    const [quarter, setQuarter] = useState('');

    useEffect(() => { fetch(`${API}/api/chung_tu`).then(r => r.json()).then(setChungTu); }, []);

    const filtered = chungTu.filter(c => {
        if (c.trang_thai === 'Hủy') return false;
        const y = c.ngay_lap?.slice(0, 4);
        if (String(y) !== String(year)) return false;
        if (quarter) { const m = parseInt(c.ngay_lap?.slice(5, 7) || '0'); if (Math.ceil(m / 3) !== parseInt(quarter)) return false; }
        return true;
    });

    const doanhThu = filtered.filter(c => c.loai_ct?.includes('bán') || c.loai_ct === 'Phiếu thu').reduce((s, c) => s + (c.so_tien || 0), 0);
    const chiPhi = filtered.filter(c => c.loai_ct?.includes('mua') || c.loai_ct === 'Phiếu chi').reduce((s, c) => s + (c.so_tien || 0), 0);
    const thueVAT = filtered.reduce((s, c) => s + Math.round((c.so_tien || 0) * (c.thue_suat || 0) / 100), 0);
    const loiNhuan = doanhThu - chiPhi;
    const QMAP = { '': 'Cả năm', '1': 'Quý I', '2': 'Quý II', '3': 'Quý III', '4': 'Quý IV' };
    const byMonth = Array.from({ length: 12 }, (_, i) => {
        const m = String(i + 1).padStart(2, '0');
        const rows = filtered.filter(c => c.ngay_lap?.slice(5, 7) === m);
        return { thang: `T${i + 1}`, thu: rows.filter(c => c.loai_ct?.includes('bán') || c.loai_ct === 'Phiếu thu').reduce((s, c) => s + (c.so_tien || 0), 0), chi: rows.filter(c => c.loai_ct?.includes('mua') || c.loai_ct === 'Phiếu chi').reduce((s, c) => s + (c.so_tien || 0), 0), thue: rows.reduce((s, c) => s + Math.round((c.so_tien || 0) * (c.thue_suat || 0) / 100), 0) };
    }).filter(m => m.thu || m.chi || m.thue);

    return (
        <div>
            <div style={{ display: 'flex', gap: 10, marginBottom: 20, alignItems: 'center' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>📊 Báo cáo thuế — {QMAP[quarter]} {year}</div>
                <select value={year} onChange={e => setYear(Number(e.target.value))} style={{ ...inp, width: 100 }}>
                    {[2023, 2024, 2025, 2026, 2027].map(y => <option key={y}>{y}</option>)}
                </select>
                <select value={quarter} onChange={e => setQuarter(e.target.value)} style={{ ...inp, width: 120 }}>
                    {Object.entries(QMAP).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 12, marginBottom: 24 }}>
                {[
                    { label: 'Doanh thu', value: fmt(doanhThu) + ' ₫', color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
                    { label: 'Chi phí', value: fmt(chiPhi) + ' ₫', color: '#dc2626', bg: '#fff1f2', border: '#fecdd3' },
                    { label: 'Lợi nhuận', value: fmt(loiNhuan) + ' ₫', color: loiNhuan >= 0 ? '#1d4ed8' : '#dc2626', bg: '#eff6ff', border: '#bfdbfe' },
                    { label: 'Thuế VAT', value: fmt(thueVAT) + ' ₫', color: '#f59e0b', bg: '#fffbeb', border: '#fde68a' },
                    { label: 'Số chứng từ', value: filtered.length + ' CT', color: '#6366f1', bg: '#f5f3ff', border: '#ddd6fe' },
                ].map(s => (
                    <div key={s.label} style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: 12, padding: '14px 16px' }}>
                        <div style={{ fontSize: 11, color: s.color, fontWeight: 700, marginBottom: 4 }}>{s.label.toUpperCase()}</div>
                        <div style={{ fontSize: 18, fontWeight: 900, color: s.color }}>{s.value}</div>
                    </div>
                ))}
            </div>
            {byMonth.length > 0 ? (
                <div style={{ background: 'white', borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                    <div style={{ padding: '12px 16px', background: '#1e293b', color: 'white', fontWeight: 800, fontSize: 13 }}>📅 Phân tích theo tháng</div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                            <tr style={{ background: '#f8fafc' }}>
                                {['Tháng', 'Doanh thu', 'Chi phí', 'Lợi nhuận', 'Thuế VAT'].map(h => (
                                    <th key={h} style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, fontSize: 11, color: '#64748b', borderBottom: '1.5px solid #e2e8f0' }}>{h === 'Tháng' ? <span style={{ textAlign: 'left', display: 'block' }}>{h}</span> : h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {byMonth.map((m, i) => (
                                <tr key={m.thang} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? 'white' : '#fafafa' }}>
                                    <td style={{ padding: '9px 14px', fontWeight: 700 }}>{m.thang}</td>
                                    <td style={{ padding: '9px 14px', textAlign: 'right', color: '#16a34a', fontWeight: 600 }}>{fmt(m.thu)} ₫</td>
                                    <td style={{ padding: '9px 14px', textAlign: 'right', color: '#dc2626', fontWeight: 600 }}>{fmt(m.chi)} ₫</td>
                                    <td style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 700, color: m.thu - m.chi >= 0 ? '#1d4ed8' : '#dc2626' }}>{fmt(m.thu - m.chi)} ₫</td>
                                    <td style={{ padding: '9px 14px', textAlign: 'right', color: '#f59e0b', fontWeight: 600 }}>{fmt(m.thue)} ₫</td>
                                </tr>
                            ))}
                            <tr style={{ background: '#1e293b' }}>
                                <td style={{ padding: '10px 14px', color: 'white', fontWeight: 800 }}>TỔNG</td>
                                <td style={{ padding: '10px 14px', textAlign: 'right', color: '#86efac', fontWeight: 800 }}>{fmt(doanhThu)} ₫</td>
                                <td style={{ padding: '10px 14px', textAlign: 'right', color: '#fca5a5', fontWeight: 800 }}>{fmt(chiPhi)} ₫</td>
                                <td style={{ padding: '10px 14px', textAlign: 'right', color: loiNhuan >= 0 ? '#93c5fd' : '#fca5a5', fontWeight: 800 }}>{fmt(loiNhuan)} ₫</td>
                                <td style={{ padding: '10px 14px', textAlign: 'right', color: '#fde68a', fontWeight: 800 }}>{fmt(thueVAT)} ₫</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            ) : (
                <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8', background: 'white', borderRadius: 14, border: '1px solid #e2e8f0' }}>
                    Chưa có dữ liệu chứng từ cho kỳ này
                </div>
            )}
        </div>
    );
}

// ─── TAB: CẤU HÌNH DANH MỤC ─────────────────────────────────────────────────
