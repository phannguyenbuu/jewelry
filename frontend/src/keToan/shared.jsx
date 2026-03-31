/* eslint-disable react-refresh/only-export-components */
import { API_BASE } from '../lib/api';

const API = API_BASE;

const fmt = n => n ? Number(n).toLocaleString('vi-VN') : '0';
const today = () => new Date().toISOString().slice(0, 10);
const inp = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box' };
const btn = (bg, c = 'white') => ({ padding: '8px 18px', borderRadius: 8, border: 'none', background: bg, color: c, fontWeight: 700, cursor: 'pointer', fontSize: 13 });

// ─── DANH MỤC (dynamic, localStorage) ───────────────────────────────────────
const DM_KEY = 'jewelry_danhmuc';
const DM_DEFAULT = {
    thu: ['Doanh thu bán hàng', 'Thu từ đặt cọc', 'Hoàn tiền', 'Khác'],
    chi: ['Nhập hàng', 'Lương nhân viên', 'Thuê mặt bằng', 'Điện nước', 'Vận chuyển', 'Marketing', 'Khác'],
};
const CT_STATUS = {
    'Nháp': { bg: '#f1f5f9', text: '#64748b' },
    'Đã duyệt': { bg: '#dcfce7', text: '#166534' },
    'Hủy': { bg: '#fee2e2', text: '#991b1b' },
};
const LOAI_CT = ['Hóa đơn bán hàng', 'Hóa đơn mua hàng', 'Phiếu thu', 'Phiếu chi', 'Biên lai', 'Hóa đơn GTGT', 'Khác'];
function loadDM() { try { return JSON.parse(localStorage.getItem(DM_KEY)) || DM_DEFAULT; } catch { return DM_DEFAULT; } }
function saveDM(dm) { localStorage.setItem(DM_KEY, JSON.stringify(dm)); }

function Modal({ open, onClose, title, children, maxWidth = 600 }) {
    if (!open) return null;
    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
            onClick={e => e.target === e.currentTarget && onClose()}>
            <div style={{ background: 'white', borderRadius: 16, width: '100%', maxWidth, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,.3)' }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: 'white' }}>
                    <span style={{ fontWeight: 800, fontSize: 15 }}>{title}</span>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#94a3b8' }}>×</button>
                </div>
                <div style={{ padding: 20 }}>{children}</div>
            </div>
        </div>
    );
}

function Field({ label, children }) {
    return <div style={{ marginBottom: 14 }}><label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: .5 }}>{label}</label>{children}</div>;
}

// ─── OCR Upload cho Chuyển khoản ─────────────────────────────────────────────

export { API, CT_STATUS, DM_DEFAULT, Field, LOAI_CT, Modal, btn, fmt, inp, loadDM, saveDM, today };
