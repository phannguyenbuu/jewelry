import { useEffect, useState } from 'react';
import LoanForm from './taiChinh/LoanForm';
import { API, EMPTY_FORM, InfoTip, KPI_TIPS, LOAI_LAI, Modal, PAY_STATUS, STATUS, buildSchedule, calcCovenant, fmt, fmtB, parseDate, today } from './taiChinh/shared';

export default function TaiChinhPage() {
    const [loans, setLoans] = useState([]);
    const [modal, setModal] = useState(null); // null | 'add' | loan
    const [scheduleModal, setScheduleModal] = useState(null); // loan object
    const [form, setForm] = useState(EMPTY_FORM);
    const [activeTab, setActiveTab] = useState('dashboard'); // dashboard | loans

    const load = async () => {
        const r = await fetch(`${API}/api/khoan_vay`);
        if (r.ok) setLoans(await r.json());
    };
    useEffect(() => {
        let cancelled = false;
        const fetchLoans = async () => {
            const r = await fetch(`${API}/api/khoan_vay`);
            if (!r.ok) return;
            const data = await r.json();
            if (!cancelled) setLoans(data);
        };
        fetchLoans().catch(() => { });
        return () => {
            cancelled = true;
        };
    }, []);

    const openAdd = () => { setForm({ ...EMPTY_FORM, ngay_bat_dau: today(), ngay_giai_ngan: today() }); setModal('add'); };
    const openEdit = l => { setForm({ ...EMPTY_FORM, ...l, so_tien_vay: String(l.so_tien_vay || ''), phi_ban_dau: String(l.phi_ban_dau || ''), ebitda_thang: String(l.ebitda_thang || ''), tong_tai_san: String(l.tong_tai_san || ''), von_chu_so_huu: String(l.von_chu_so_huu || ''), ky_han_thang: String(l.ky_han_thang || 12), dscr_min: String(l.dscr_min || 1.2), de_ratio_max: String(l.de_ratio_max || 3.0) }); setModal(l); };

    const save = async e => {
        e.preventDefault();
        const effRate = form.loai_lai === 'tha_noi'
            ? parseFloat(form.lai_co_so || 0) + parseFloat(form.bien_do || 0)
            : parseFloat(form.lai_suat_ht || 0);
        const payload = {
            ...form, lai_suat_ht: effRate,
            so_tien_vay: +form.so_tien_vay || 0, phi_ban_dau: +form.phi_ban_dau || 0,
            phi_tra_truoc: +form.phi_tra_truoc || 0, ky_han_thang: +form.ky_han_thang || 12,
            dscr_min: +form.dscr_min || 1.2, de_ratio_max: +form.de_ratio_max || 3.0,
            ebitda_thang: +form.ebitda_thang || 0, tong_tai_san: +form.tong_tai_san || 0,
            von_chu_so_huu: +form.von_chu_so_huu || 0,
        };
        const isEdit = modal !== 'add';
        await fetch(isEdit ? `${API}/api/khoan_vay/${modal.id}` : `${API}/api/khoan_vay`, {
            method: isEdit ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        setModal(null); load();
    };

    const del = async id => {
        if (!window.confirm('Xóa khoản vay này?')) return;
        await fetch(`${API}/api/khoan_vay/${id}`, { method: 'DELETE' });
        load();
    };

    const markPaid = async (loanId, rowId) => {
        await fetch(`${API}/api/khoan_vay/${loanId}/lich_tra/${rowId}/tra`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ngay_da_tra: today() }) });
        setScheduleModal(prev => prev ? ({ ...prev, lich_tra: prev.lich_tra.map(r => r.id === rowId ? { ...r, trang_thai: 'da_tra', ngay_da_tra: today() } : r) }) : prev);
    };

    // ── Tính tổng / WACC ─────────────────────────────────────────────
    const active = loans.filter(l => l.trang_thai === 'dang_vay');
    const tongDuNo = active.reduce((s, l) => s + (l.so_tien_vay || 0), 0);
    const wacc = tongDuNo > 0
        ? active.reduce((s, l) => s + (l.lai_suat_ht || 0) * (l.so_tien_vay || 0), 0) / tongDuNo
        : 0;

    // Lịch 12 tháng tới
    const now = new Date();
    const upcoming = [];
    active.forEach(loan => {
        (loan.lich_tra || []).forEach(row => {
            if (row.trang_thai !== 'da_tra') {
                try {
                    const d = parseDate(row.ngay_tra);
                    const diffM = (d.getFullYear() - now.getFullYear()) * 12 + (d.getMonth() - now.getMonth());
                    if (diffM >= 0 && diffM < 12) upcoming.push({ ...row, ngan_hang: loan.ngan_hang, ma_hd: loan.ma_hd, loan_id: loan.id });
                } catch {
                    return false;
                }
            }
        });
    });
    upcoming.sort((a, b) => parseDate(a.ngay_tra) - parseDate(b.ngay_tra));

    // Covenant alerts
    const allAlerts = [];
    active.forEach(loan => {
        const monthly = (loan.lich_tra || []).find(r => r.trang_thai !== 'da_tra');
        const { alerts } = calcCovenant({ ...loan, _monthly_payment: monthly?.tong_tra || 0 });
        alerts.forEach(a => allAlerts.push({ ...a, ngan_hang: loan.ngan_hang, ma_hd: loan.ma_hd }));
    });

    const TABS = [
        { key: 'dashboard', label: '📊 Dashboard' },
        { key: 'loans', label: '📋 Danh sách vay' },
    ];

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#f0f4f8' }}>
            {/* Sub-tabs */}
            <div style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '0 28px', display: 'flex', gap: 4 }}>
                {TABS.map(t => (
                    <button key={t.key} onClick={() => setActiveTab(t.key)} style={{ padding: '12px 18px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, background: 'none', color: activeTab === t.key ? '#1e293b' : '#94a3b8', borderBottom: activeTab === t.key ? '2.5px solid #f59e0b' : '2.5px solid transparent', transition: 'all .15s' }}>{t.label}</button>
                ))}
            </div>

            <div style={{ flex: 1, padding: '24px 28px', overflowY: 'auto' }}>

                {activeTab === 'dashboard' && (
                    <>
                        {/* KPI Cards */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 20 }}>
                            {[
                                { label: 'Tổng dư nợ', value: fmtB(tongDuNo) + ' ₫', sub: `${active.length} hợp đồng`, color: '#1d4ed8', bg: '#dbeafe' },
                                { label: 'WACC bình quân', value: wacc.toFixed(2) + '%', sub: 'Lãi suất gia quyền', color: '#7c3aed', bg: '#ede9fe' },
                                { label: 'Cảnh báo Covenant', value: allAlerts.length, sub: allAlerts.filter(a => a.level === 'danger').length + ' vi phạm', color: allAlerts.some(a => a.level === 'danger') ? '#dc2626' : '#d97706', bg: allAlerts.some(a => a.level === 'danger') ? '#fee2e2' : '#fef9c3' },
                                { label: 'Thanh toán 30 ngày', value: fmtB(upcoming.filter(r => { try { const d = parseDate(r.ngay_tra); return (d - now) / (1000 * 86400) <= 30; } catch { return false } }).reduce((s, r) => s + (r.tong_tra || 0), 0)) + ' ₫', sub: 'Cần chuẩn bị', color: '#15803d', bg: '#dcfce7' },
                            ].map(({ label, value, sub, color, bg }) => (
                                <div key={label} style={{ background: 'white', borderRadius: 14, padding: '18px 20px', boxShadow: '0 1px 6px rgba(0,0,0,.06)', border: '1px solid #e2e8f0' }}>
                                    <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 8, letterSpacing: .4, display: 'flex', alignItems: 'center' }}>
                                        {label}<InfoTip text={KPI_TIPS[label]} />
                                    </div>
                                    <div style={{ fontSize: 20, fontWeight: 900, color, marginBottom: 4 }}>{value}</div>
                                    <div style={{ display: 'inline-block', background: bg, color, borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 700 }}>{sub}</div>
                                </div>
                            ))}
                        </div>

                        {/* Alerts */}
                        {allAlerts.length > 0 && (
                            <div style={{ background: 'white', borderRadius: 14, padding: '16px 20px', marginBottom: 20, border: '1px solid #e2e8f0', boxShadow: '0 1px 6px rgba(0,0,0,.06)' }}>
                                <div style={{ fontSize: 12, fontWeight: 800, color: '#1e293b', marginBottom: 12 }}>⚠️ CẢNH BÁO COVENANT</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    {allAlerts.map((a, i) => (
                                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderRadius: 8, background: a.level === 'danger' ? '#fee2e2' : '#fef9c3', border: `1px solid ${a.level === 'danger' ? '#fca5a5' : '#fde68a'}` }}>
                                            <span style={{ fontSize: 16 }}>{a.level === 'danger' ? '🔴' : '🟡'}</span>
                                            <div>
                                                <div style={{ fontSize: 12, fontWeight: 700, color: a.level === 'danger' ? '#dc2626' : '#92400e' }}>{a.ma_hd} — {a.ngan_hang}</div>
                                                <div style={{ fontSize: 11, color: a.level === 'danger' ? '#b91c1c' : '#78350f' }}>{a.msg}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Dư nợ theo ngân hàng */}
                        {active.length > 0 && (
                            <div style={{ background: 'white', borderRadius: 14, padding: '16px 20px', marginBottom: 20, border: '1px solid #e2e8f0', boxShadow: '0 1px 6px rgba(0,0,0,.06)' }}>
                                <div style={{ fontSize: 12, fontWeight: 800, color: '#1e293b', marginBottom: 14 }}>🏦 DƯ NỢ THEO NGÂN HÀNG</div>
                                {active.map(l => {
                                    const pct = tongDuNo > 0 ? (l.so_tien_vay / tongDuNo * 100) : 0;
                                    return (
                                        <div key={l.id} style={{ marginBottom: 12 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                                                <span style={{ fontWeight: 700 }}>{l.ngan_hang} <span style={{ color: '#94a3b8', fontWeight: 400, fontSize: 11 }}>({l.ma_hd})</span></span>
                                                <span style={{ fontWeight: 800, color: '#1d4ed8' }}>{fmtB(l.so_tien_vay)} ₫ <span style={{ color: '#64748b', fontWeight: 400 }}>— {(l.lai_suat_ht || 0).toFixed(2)}%/năm</span></span>
                                            </div>
                                            <div style={{ height: 6, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
                                                <div style={{ height: '100%', background: '#3b82f6', width: `${pct}%`, borderRadius: 4, transition: 'width .3s' }} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* Lịch trả 12 tháng */}
                        <div style={{ background: 'white', borderRadius: 14, padding: '16px 20px', border: '1px solid #e2e8f0', boxShadow: '0 1px 6px rgba(0,0,0,.06)' }}>
                            <div style={{ fontSize: 12, fontWeight: 800, color: '#1e293b', marginBottom: 14 }}>📅 LỊCH TRẢ NỢ 12 THÁNG TỚI</div>
                            {upcoming.length === 0
                                ? <div style={{ textAlign: 'center', padding: 30, color: '#94a3b8' }}>Chưa có lịch trả nợ</div>
                                : <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                        <thead>
                                            <tr style={{ background: '#f8fafc' }}>
                                                {['Ngân hàng', 'HĐ', 'Kỳ', 'Ngày trả', 'Tiền gốc', 'Tiền lãi', 'Tổng trả', 'Trạng thái'].map(h => (
                                                    <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 700, color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {upcoming.slice(0, 20).map((r, i) => {
                                                const st = PAY_STATUS[r.trang_thai] || PAY_STATUS.cho_tra;
                                                return (
                                                    <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                        <td style={{ padding: '7px 10px', fontWeight: 600 }}>{r.ngan_hang}</td>
                                                        <td style={{ padding: '7px 10px', color: '#64748b' }}>{r.ma_hd}</td>
                                                        <td style={{ padding: '7px 10px', textAlign: 'center' }}>{r.ky_so}</td>
                                                        <td style={{ padding: '7px 10px', fontWeight: 600 }}>{r.ngay_tra}</td>
                                                        <td style={{ padding: '7px 10px', textAlign: 'right' }}>{fmt(r.tien_goc)}</td>
                                                        <td style={{ padding: '7px 10px', textAlign: 'right', color: '#dc2626' }}>{fmt(r.tien_lai)}</td>
                                                        <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 800, color: '#1d4ed8' }}>{fmt(r.tong_tra)}</td>
                                                        <td style={{ padding: '7px 10px' }}><span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700, background: st.bg, color: st.text }}>{st.label}</span></td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            }
                        </div>
                    </>
                )}

                {activeTab === 'loans' && (
                    <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                            <div style={{ fontSize: 13, color: '#64748b' }}>{loans.length} khoản vay</div>
                            <button onClick={openAdd} style={{ padding: '9px 20px', borderRadius: 8, border: 'none', background: '#1e293b', color: 'white', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>+ Thêm khoản vay</button>
                        </div>

                        {loans.length === 0
                            ? <div style={{ textAlign: 'center', padding: 80, background: 'white', borderRadius: 14, border: '1px solid #e2e8f0', color: '#94a3b8' }}>Chưa có khoản vay nào</div>
                            : loans.map(loan => {
                                const st = STATUS[loan.trang_thai] || STATUS.dang_vay;
                                const monthly = (loan.lich_tra || []).find(r => r.trang_thai !== 'da_tra');
                                const { dscr, de_ratio, alerts } = calcCovenant({ ...loan, _monthly_payment: monthly?.tong_tra || 0 });
                                const paidCount = (loan.lich_tra || []).filter(r => r.trang_thai === 'da_tra').length;
                                const totalKy = loan.lich_tra?.length || 0;
                                return (
                                    <div key={loan.id} style={{ background: 'white', borderRadius: 14, border: '1px solid #e2e8f0', marginBottom: 14, overflow: 'hidden', boxShadow: '0 1px 6px rgba(0,0,0,.05)' }}>
                                        {/* Header */}
                                        <div style={{ padding: '14px 20px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                                <div>
                                                    <div style={{ fontWeight: 800, fontSize: 14, color: '#1e293b' }}>{loan.ngan_hang}</div>
                                                    <div style={{ fontSize: 11, color: '#94a3b8' }}>{loan.ma_hd}</div>
                                                </div>
                                                <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: st.bg, color: st.text }}>{st.label}</span>
                                                {alerts.length > 0 && <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: alerts[0].level === 'danger' ? '#fee2e2' : '#fef9c3', color: alerts[0].level === 'danger' ? '#dc2626' : '#92400e' }}>⚠️ {alerts.length} cảnh báo</span>}
                                            </div>
                                            <div style={{ display: 'flex', gap: 8 }}>
                                                <button onClick={() => setScheduleModal(loan)} style={{ padding: '6px 14px', borderRadius: 7, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#1d4ed8' }}>📅 Lịch trả</button>
                                                <button onClick={() => openEdit(loan)} style={{ padding: '6px 14px', borderRadius: 7, border: '1px solid #cbd5e1', background: 'white', cursor: 'pointer', fontSize: 12 }}>✏️</button>
                                                <button onClick={() => del(loan.id)} style={{ padding: '6px 14px', borderRadius: 7, border: '1px solid #fca5a5', background: '#fff1f2', cursor: 'pointer', fontSize: 12, color: '#dc2626' }}>🗑</button>
                                            </div>
                                        </div>
                                        {/* Body */}
                                        <div style={{ padding: '14px 20px', display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 14 }}>
                                            {[
                                                { label: 'Dư nợ', value: fmtB(loan.so_tien_vay) + ' ₫', bold: true },
                                                { label: 'Lãi suất', value: `${(loan.lai_suat_ht || 0).toFixed(2)}% (${LOAI_LAI[loan.loai_lai]})` },
                                                { label: 'Kỳ hạn', value: `${paidCount}/${totalKy || loan.ky_han_thang} tháng` },
                                                { label: 'Trả kỳ tới', value: monthly ? fmt(monthly.tong_tra) + ' ₫' : '—' },
                                                { label: 'Tất toán', value: loan.ngay_tat_toan || '—' },
                                            ].map(({ label, value, bold }) => (
                                                <div key={label}>
                                                    <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, marginBottom: 2 }}>{label}</div>
                                                    <div style={{ fontSize: 13, fontWeight: bold ? 800 : 600, color: '#1e293b' }}>{value}</div>
                                                </div>
                                            ))}
                                        </div>
                                        {/* Covenant indicators */}
                                        {(dscr !== null || de_ratio !== null) && (
                                            <div style={{ padding: '0 20px 14px', display: 'flex', gap: 16 }}>
                                                {dscr !== null && <div style={{ fontSize: 11, color: dscr < (loan.dscr_min || 1.2) ? '#dc2626' : '#15803d', fontWeight: 700 }}>DSCR: {dscr.toFixed(2)} (min {loan.dscr_min})</div>}
                                                {de_ratio !== null && <div style={{ fontSize: 11, color: de_ratio > (loan.de_ratio_max || 3) ? '#dc2626' : '#15803d', fontWeight: 700 }}>D/E: {de_ratio.toFixed(2)} (max {loan.de_ratio_max})</div>}
                                                {loan.tai_san_dam_bao && <div style={{ fontSize: 11, color: '#64748b' }}>🏠 {loan.tai_san_dam_bao.slice(0, 60)}{loan.tai_san_dam_bao.length > 60 ? '...' : ''}</div>}
                                            </div>
                                        )}
                                    </div>
                                );
                            })
                        }
                    </>
                )}
            </div>

            {/* Modal thêm/sửa */}
            <Modal open={!!modal} onClose={() => setModal(null)} title={modal === 'add' ? '+ Thêm khoản vay mới' : '✏️ Chỉnh sửa khoản vay'} maxWidth={800}>
                <LoanForm form={form} setForm={setForm} onSubmit={save} onClose={() => setModal(null)} isEdit={modal !== 'add'} />
            </Modal>

            {/* Modal lịch trả nợ */}
            <Modal open={!!scheduleModal} onClose={() => setScheduleModal(null)}
                title={`📅 Lịch trả nợ — ${scheduleModal?.ngan_hang} (${scheduleModal?.ma_hd})`} maxWidth={860}>
                {scheduleModal && (() => {
                    const rows = scheduleModal.lich_tra || buildSchedule(scheduleModal);
                    const paid = rows.filter(r => r.trang_thai === 'da_tra').reduce((s, r) => s + (r.tong_tra || 0), 0);
                    const remain = rows.filter(r => r.trang_thai !== 'da_tra').reduce((s, r) => s + (r.tong_tra || 0), 0);
                    return (
                        <>
                            <div style={{ display: 'flex', gap: 20, marginBottom: 16 }}>
                                {[
                                    { label: 'Đã trả', value: fmt(paid) + ' ₫', color: '#15803d' },
                                    { label: 'Còn lại', value: fmt(remain) + ' ₫', color: '#dc2626' },
                                    { label: 'Tổng cộng', value: fmt(paid + remain) + ' ₫', color: '#1d4ed8' },
                                ].map(({ label, value, color }) => (
                                    <div key={label} style={{ background: '#f8fafc', borderRadius: 10, padding: '10px 16px', flex: 1, textAlign: 'center' }}>
                                        <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700 }}>{label}</div>
                                        <div style={{ fontSize: 16, fontWeight: 900, color, marginTop: 4 }}>{value}</div>
                                    </div>
                                ))}
                            </div>
                            <div style={{ overflowX: 'auto', maxHeight: 450 }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                    <thead style={{ position: 'sticky', top: 0, background: '#f8fafc' }}>
                                        <tr>
                                            {['Kỳ', 'Ngày trả', 'Số dư đầu', 'Tiền gốc', 'Tiền lãi', 'Tổng trả', 'Số dư cuối', 'TT', ''].map(h => (
                                                <th key={h} style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: '#64748b', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap', ':first-child': { textAlign: 'center' } }}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rows.map((r, i) => {
                                            const st = PAY_STATUS[r.trang_thai] || PAY_STATUS.cho_tra;
                                            return (
                                                <tr key={i} style={{ borderBottom: '1px solid #f1f5f9', background: r.trang_thai === 'da_tra' ? '#f0fdf4' : r.trang_thai === 'qua_han' ? '#fff1f2' : undefined }}>
                                                    <td style={{ padding: '7px 10px', textAlign: 'center', fontWeight: 700 }}>{r.ky_so}</td>
                                                    <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 600 }}>{r.ngay_tra}</td>
                                                    <td style={{ padding: '7px 10px', textAlign: 'right', color: '#64748b' }}>{fmt(r.so_du_dau)}</td>
                                                    <td style={{ padding: '7px 10px', textAlign: 'right' }}>{fmt(r.tien_goc)}</td>
                                                    <td style={{ padding: '7px 10px', textAlign: 'right', color: '#dc2626' }}>{fmt(r.tien_lai)}</td>
                                                    <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 800, color: '#1d4ed8' }}>{fmt(r.tong_tra)}</td>
                                                    <td style={{ padding: '7px 10px', textAlign: 'right', color: '#64748b' }}>{fmt(r.so_du_cuoi)}</td>
                                                    <td style={{ padding: '7px 10px' }}><span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700, background: st.bg, color: st.text, whiteSpace: 'nowrap' }}>{st.label}</span></td>
                                                    <td style={{ padding: '7px 10px' }}>
                                                        {r.trang_thai !== 'da_tra' && r.id && (
                                                            <button onClick={() => markPaid(scheduleModal.id, r.id)} style={{ padding: '3px 10px', borderRadius: 6, border: '1px solid #bbf7d0', background: '#f0fdf4', color: '#15803d', cursor: 'pointer', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>✓ Đã trả</button>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    );
                })()}
            </Modal>
        </div>
    );
}
