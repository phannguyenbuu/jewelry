import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import './index.css';
import CauHinhPage from './CauHinhPage';
import DonHangPage from './DonHangPage';
import NhanSuPage from './NhanSuPage';
import KeToanPage from './KeToanPage';
import TaiChinhPage from './TaiChinhPage';
import MayCanVangPage from './MayCanVangPage';
import KhachHangPage from './KhachHangPage';
import DoiTacPage from './DoiTacPage';
import SalePosMobile from './SalePosMobile';
import CameraOcrPage from './CameraOcrPage';
import { API_BASE } from './lib/api';

const API = API_BASE;

const STATUS_COLORS = {
  'Tồn kho': { bg: '#dcfce7', text: '#166534' },
  'Đã bán': { bg: '#fee2e2', text: '#991b1b' },
  'Luân chuyển': { bg: '#fef3c7', text: '#92400e' },
};

// Palette for Nhóm hàng badges
const NHOM_PALETTE = [
  { bg: '#dbeafe', text: '#1d4ed8' },
  { bg: '#fce7f3', text: '#9d174d' },
  { bg: '#d1fae5', text: '#065f46' },
  { bg: '#fef3c7', text: '#92400e' },
  { bg: '#ede9fe', text: '#5b21b6' },
  { bg: '#ffedd5', text: '#c2410c' },
  { bg: '#e0f2fe', text: '#0369a1' },
  { bg: '#f0fdf4', text: '#15803d' },
  { bg: '#fdf4ff', text: '#86198f' },
  { bg: '#fff7ed', text: '#c2410c' },
];

const nhomColorCache = {};
let nhomColorIdx = 0;

const getNhomColor = (nhom) => {
  if (!nhom) return null;
  if (!nhomColorCache[nhom]) {
    nhomColorCache[nhom] = NHOM_PALETTE[nhomColorIdx % NHOM_PALETTE.length];
    nhomColorIdx++;
  }
  return nhomColorCache[nhom];
};

const formatWeightDisplay = (value) => {
  if (value === null || value === undefined || value === '') return '—';
  const num = Number(value);
  if (!Number.isFinite(num)) return value;
  return num.toFixed(4).replace(/\.?0+$/, '');
};

const parseDateTimeValue = (value) => {
  if (!value) return null;
  const text = String(value).trim();
  const match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (match) {
    const [, day, month, year, hour = '00', minute = '00', second = '00'] = match;
    const dt = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
    return Number.isNaN(dt.getTime()) ? null : dt.getTime();
  }
  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? null : parsed;
};

const getItemCreatedAtMs = (item) => {
  let minTs = null;
  for (const entry of item?.history || []) {
    const ts = parseDateTimeValue(entry?.date);
    if (ts === null) continue;
    if (minTs === null || ts < minTs) minTs = ts;
  }
  return minTs;
};

const getDateStartMs = (value) => {
  if (!value) return null;
  const ts = Date.parse(`${value}T00:00:00`);
  return Number.isNaN(ts) ? null : ts;
};

const getDateEndMs = (value) => {
  if (!value) return null;
  const ts = Date.parse(`${value}T23:59:59.999`);
  return Number.isNaN(ts) ? null : ts;
};

const compareSortValues = (left, right) => {
  if (left == null && right == null) return 0;
  if (left == null) return -1;
  if (right == null) return 1;
  if (typeof left === 'number' && typeof right === 'number') return left - right;
  return String(left).localeCompare(String(right), 'vi', { numeric: true, sensitivity: 'base' });
};

const numericOrText = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : (value || '');
};

const NAV_ITEMS = [
  { key: 'hang_ton', label: 'Danh mục hàng', icon: '💎' },
  { key: 'don_hang', label: 'Đơn Hàng', icon: '📦' },
  { key: 'nhan_su', label: 'Nhân Sự', icon: '👥' },
  { key: 'khach_hang', label: 'Khách Hàng', icon: '🤝' },
  { key: 'doi_tac', label: 'Đối Tác', icon: '🏭' },
  { key: 'ke_toan', label: 'Kế Toán', icon: '📊' },
  { key: 'tai_chinh', label: 'Tài Chính', icon: '💰' },
  { key: 'may_can_vang', label: 'Máy cân vàng', icon: '⚖️' },
  { key: 'divider' },
  { key: 'cau_hinh', label: 'Cài Đặt', icon: '⚙️' },
];

const ComingSoon = ({ label }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', color: '#94a3b8' }}>
    <div style={{ fontSize: 52, marginBottom: 16 }}>🚧</div>
    <div style={{ fontSize: 22, fontWeight: 700, color: '#64748b' }}>{label}</div>
    <div style={{ fontSize: 14, marginTop: 8 }}>Chức năng đang được phát triển</div>
  </div>
);

// Compact filter input
const FilterInput = ({ label, value, onChange, placeholder }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
    <label style={{ fontSize: 10, fontWeight: 700, color: '#64748b', letterSpacing: .4 }}>{label}</label>
    <input value={value} onChange={onChange} placeholder={placeholder || `Tìm ${label}...`}
      style={{ padding: '7px 10px', borderRadius: 7, border: '1.5px solid #cbd5e1', outline: 'none', background: 'white', fontSize: 12, width: 140 }} />
  </div>
);

const FilterSelect = ({ label, value, onChange, options, allLabel }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
    <label style={{ fontSize: 10, fontWeight: 700, color: '#64748b', letterSpacing: .4 }}>{label}</label>
    <select value={value} onChange={onChange}
      style={{ padding: '7px 10px', borderRadius: 7, border: '1.5px solid #cbd5e1', outline: 'none', background: 'white', fontSize: 12, cursor: 'pointer' }}>
      <option value="">{allLabel || `Tất cả`}</option>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  </div>
);

const FilterDateInput = ({ label, value, onChange }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
    <label style={{ fontSize: 10, fontWeight: 700, color: '#64748b', letterSpacing: .4 }}>{label}</label>
    <input
      type="date"
      value={value}
      onChange={onChange}
      style={{ padding: '7px 10px', borderRadius: 7, border: '1.5px solid #cbd5e1', outline: 'none', background: 'white', fontSize: 12, width: 150 }}
    />
  </div>
);

export default function App() {
  // Path-based route for POS (/sale)
  const [pathname, setPathname] = useState(window.location.pathname);
  useEffect(() => {
    const onPop = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const [activeTab, setActiveTab] = useState('hang_ton');
  const [data, setData] = useState([]);

  // Filters - one per column
  const [fMaHang, setFMaHang] = useState('');
  const [fNcc, setFNcc] = useState('');
  const [fNhom, setFNhom] = useState('');
  const [fQuay, setFQuay] = useState('');
  const [fTuoi, setFTuoi] = useState('');
  const [fCongLe, setFCongLe] = useState('');
  const [fCongSi, setFCongSi] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [fCreatedFrom, setFCreatedFrom] = useState('');
  const [fCreatedTo, setFCreatedTo] = useState('');
  const [sortBy, setSortBy] = useState('id');
  const [sortDir, setSortDir] = useState('asc');

  const [editModal, setEditModal] = useState({ isOpen: false, item: null });
  const [form, setForm] = useState({});
  const [uploading, setUploading] = useState(false);
  const [importingXls, setImportingXls] = useState(false);
  const [infoModal, setInfoModal] = useState(null); // item or null
  const [lightbox, setLightbox] = useState(null); // img url or null
  const [notifications, setNotifications] = useState([]);
  const [showNotif, setShowNotif] = useState(false);
  const [pageSize, setPageSize] = useState(100);
  const [page, setPage] = useState(1);
  const [nhomHangList, setNhomHangList] = useState([]);
  const [loaiVangList, setLoaiVangList] = useState([]);
  const [tuoiVangList, setTuoiVangList] = useState([]);
  const [quayNhoList, setQuayNhoList] = useState([]);
  const importInputRef = useRef(null);

  const fetchData = async () => {
    try {
      const r = await fetch(`${API}/api/items`);
      const items = await r.json();
      setData(items);
      return items;
    } catch (e) { console.error(e); }
  };

  const loadLookupLists = async () => {
    await Promise.all([
      fetch(`${API}/api/nhom_hang`).then(r => r.json()).then(setNhomHangList).catch(() => { }),
      fetch(`${API}/api/loai_vang`).then(r => r.json()).then(setLoaiVangList).catch(() => { }),
      fetch(`${API}/api/tuoi_vang`).then(r => r.json()).then(setTuoiVangList).catch(() => { }),
      fetch(`${API}/api/quay_nho`).then(r => r.json()).then(setQuayNhoList).catch(() => { }),
    ]);
  };

  useEffect(() => {
    fetchData();
    loadLookupLists();
  }, []);

  // Listen for price-change notifications from CauHinhPage
  useEffect(() => {
    const handler = (e) => setNotifications(prev => [e.detail, ...prev].slice(0, 50));
    window.addEventListener('jewelry-notification', handler);
    return () => window.removeEventListener('jewelry-notification', handler);
  }, []);

  const openAdd = () => {
    setForm({ ma_hang: '', ncc: '', nhom_hang: '', quay_nho: '', cong_le: '', cong_si: '', tong_tl: '', tl_da: '', tl_vang: '', loai_vang: '416', tuoi_vang: '', status: 'Tồn kho', images: [], certificates: [] });
    setEditModal({ isOpen: true, item: null });
  };
  const openEdit = (item) => { setForm({ ...item, images: item.images || [], certificates: item.certificates || [] }); setEditModal({ isOpen: true, item }); };

  const uploadImages = async (files) => {
    setUploading(true);
    const uploaded = [];
    for (const file of files) {
      const fd = new FormData();
      fd.append('file', file);
      try {
        const r = await fetch(`${API}/api/upload`, { method: 'POST', body: fd });
        const j = await r.json();
        uploaded.push({ url: j.url, name: j.name });
      } catch (e) { console.error(e); }
    }
    setForm(f => ({ ...f, images: [...(f.images || []), ...uploaded] }));
    setUploading(false);
  };

  const removeImage = (idx) => setForm(f => ({ ...f, images: f.images.filter((_, i) => i !== idx) }));

  const handleImportXls = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setImportingXls(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await fetch(`${API}/api/items/import-xls`, { method: 'POST', body: fd });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `Import XLS that bai (HTTP ${r.status}).`);

      await Promise.all([fetchData(), loadLookupLists()]);
      window.alert(
        `Import XLS thanh cong\n` +
        `Tong dong: ${j.total_rows || 0}\n` +
        `Them moi: ${j.created || 0}\n` +
        `Bo qua trung DB: ${j.skipped_existing || 0}\n` +
        `Bo qua trung trong file: ${j.skipped_in_file || 0}\n` +
        `Them nhom hang: ${j.added_nhom_hang || 0}\n` +
        `Them quay nho: ${j.added_quay_nho || 0}\n` +
        `Them loai vang: ${j.added_loai_vang || 0}\n` +
        `Them tuoi vang: ${j.added_tuoi_vang || 0}\n` +
        `Cap nhat tuoi vang cho hang trung: ${j.updated_existing_tuoi_vang || 0}\n` +
        `Tuoi vang tu file: ${j.detected_tuoi_vang || ''}`
      );
    } catch (err) {
      console.error(err);
      window.alert(err.message || 'Import XLS that bai.');
    } finally {
      setImportingXls(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const url = editModal.item ? `${API}/api/items/${editModal.item.id}` : `${API}/api/items`;
    await fetch(url, { method: editModal.item ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    setEditModal({ isOpen: false, item: null });
    fetchData();
  };

  const confirmDelete = async (id) => {
    if (!window.confirm('Xác nhận xóa sản phẩm này?')) return;
    await fetch(`${API}/api/items/${id}`, { method: 'DELETE' });
    fetchData();
  };

  // Unique option lists
  const nhomList = [...new Set(data.map(d => d.nhom_hang).filter(Boolean))].sort();
  const quayList = [...new Set(data.map(d => d.quay_nho).filter(Boolean))].sort();
  const tuoiList = [...new Set(data.map(d => d.tuoi_vang).filter(Boolean))].sort();
  const statusList = [...new Set(data.map(d => d.status).filter(Boolean))].sort();
  const createdFromMs = getDateStartMs(fCreatedFrom);
  const createdToMs = getDateEndMs(fCreatedTo);

  const handleSort = (column) => {
    setPage(1);
    if (sortBy === column) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
      return;
    }
    setSortBy(column);
    setSortDir('asc');
  };

  const getSortIcon = (column) => {
    if (sortBy !== column) return '↕';
    return sortDir === 'asc' ? '↑' : '↓';
  };

  const getSortParts = (item, column) => {
    switch (column) {
      case 'id':
        return [item.id || 0];
      case 'ma_hang':
        return [item.ma_hang || ''];
      case 'ncc':
        return [item.ncc || '', item.nhom_hang || ''];
      case 'quay_nho':
        return [item.quay_nho || ''];
      case 'tuoi_vang':
        return [item.tuoi_vang || ''];
      case 'cong':
        return [numericOrText(item.cong_le), numericOrText(item.cong_si)];
      case 'tong_tl':
        return [numericOrText(item.tong_tl)];
      case 'status':
        return [item.status || ''];
      default:
        return [item.id || 0];
    }
  };

  let filtered = data;
  const fl = s => s.toLowerCase();
  if (fMaHang) filtered = filtered.filter(r => r.ma_hang?.toLowerCase().includes(fl(fMaHang)));
  if (fNcc) filtered = filtered.filter(r => r.ncc?.toLowerCase().includes(fl(fNcc)));
  if (fNhom) filtered = filtered.filter(r => r.nhom_hang === fNhom);
  if (fQuay) filtered = filtered.filter(r => r.quay_nho === fQuay);
  if (fTuoi) filtered = filtered.filter(r => r.tuoi_vang === fTuoi);
  if (fCongLe) filtered = filtered.filter(r => r.cong_le?.includes(fCongLe));
  if (fCongSi) filtered = filtered.filter(r => r.cong_si?.includes(fCongSi));
  if (fStatus) filtered = filtered.filter(r => r.status === fStatus);
  if (createdFromMs !== null || createdToMs !== null) {
    filtered = filtered.filter((item) => {
      const createdAtMs = getItemCreatedAtMs(item);
      if (createdAtMs === null) return false;
      if (createdFromMs !== null && createdAtMs < createdFromMs) return false;
      if (createdToMs !== null && createdAtMs > createdToMs) return false;
      return true;
    });
  }

  filtered = [...filtered].sort((left, right) => {
    const leftParts = getSortParts(left, sortBy);
    const rightParts = getSortParts(right, sortBy);
    const length = Math.max(leftParts.length, rightParts.length);
    for (let idx = 0; idx < length; idx++) {
      const compared = compareSortValues(leftParts[idx], rightParts[idx]);
      if (compared !== 0) return sortDir === 'asc' ? compared : -compared;
    }
    return compareSortValues(left.id, right.id);
  });

  const hasFilter = fMaHang || fNcc || fNhom || fQuay || fTuoi || fCongLe || fCongSi || fStatus || fCreatedFrom || fCreatedTo;
  const clearAll = () => {
    setFMaHang('');
    setFNcc('');
    setFNhom('');
    setFQuay('');
    setFTuoi('');
    setFCongLe('');
    setFCongSi('');
    setFStatus('');
    setFCreatedFrom('');
    setFCreatedTo('');
    setPage(1);
  };

  const totalPages = pageSize === 0 ? 1 : Math.ceil(filtered.length / pageSize);
  const displayed = pageSize === 0 ? filtered : filtered.slice((page - 1) * pageSize, page * pageSize);

  const statTotal = data.length;
  const statTonKho = data.filter(d => d.status === 'Tồn kho').length;
  const statDaBan = data.filter(d => d.status === 'Đã bán').length;
  const statLuan = data.filter(d => d.status === 'Luân chuyển').length;

  const SIDEBAR_W = 220;
  const [mobileOpen, setMobileOpen] = useState(false);
  // Detect mobile
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;
  const [_mq, setMq] = useState(isMobile);
  useEffect(() => {
    const mql = window.matchMedia('(max-width: 768px)');
    const handler = e => setMq(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);
  const onMobile = _mq;
  const isSaleRoute = pathname === '/sale';
  const isCameraRoute = pathname === '/camera';

  if (isSaleRoute) return <SalePosMobile onClose={() => {
    history.pushState({}, '', '/');
    setPathname('/');
  }} />;
  if (isCameraRoute) return <CameraOcrPage onClose={() => {
    window.history.pushState({}, '', '/');
    setPathname('/');
  }} />;

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: "'Be Vietnam Pro', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", background: '#f0f4f8' }}>

      {/* ─── GLOBAL MOBILE CSS ─── */}
      <style>{`
        /* ── Desktop: hide FAB ── */
        @media (min-width: 769px) {
          .jw-mob-only { display: none !important; }
        }
        /* ── Mobile: hide sidebar, shrink layout ── */
        @media (max-width: 768px) {
          .jw-sidebar  { display: none !important; }
          .jw-main     { margin-left: 0 !important; }
          .jw-topbar   { padding: 0 12px !important; height: 48px !important; }
          .jw-topbar h1 { font-size: 14px !important; }
          /* Page content */
          .jw-page     { padding: 12px !important; }
          /* Shrink tables */
          table        { font-size: 11px !important; }
          th, td       { padding: 6px 8px !important; }
          /* Stats grids */
          .jw-stats    { grid-template-columns: repeat(2,1fr) !important; gap: 8px !important; }
          /* Forms */
          .jw-form-grid { grid-template-columns: 1fr !important; }
          /* Generic cards */
          [class*="card"] { padding: 10px 12px !important; }
          /* Prevent horizontal scroll */
          body { overflow-x: hidden; }
          /* Bottom padding to avoid FAB overlap */
          .jw-main > *:last-child { padding-bottom: 90px; }
        }
        .jw-fab-item {
          transition: bottom 0.35s cubic-bezier(.34,1.56,.64,1),
                      opacity 0.25s ease,
                      transform 0.3s cubic-bezier(.34,1.56,.64,1);
        }
      `}</style>

      {/* ─── LEFT SIDEBAR (desktop only) ─── */}
      <aside className="jw-sidebar" style={{ width: SIDEBAR_W, minWidth: SIDEBAR_W, background: '#1e293b', display: 'flex', flexDirection: 'column', position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 200 }}>
        <div style={{ padding: '24px 20px 20px', borderBottom: '1px solid rgba(255,255,255,.08)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <img src="/logo.png" alt="Logo" style={{ width: 108, height: 108, borderRadius: 18, objectFit: 'contain' }} />
        </div>
        <nav style={{ flex: 1, padding: '12px 10px' }}>
          {NAV_ITEMS.map(({ key, label, icon }) => {
            if (key === 'divider') return <div key="divider" style={{ height: 1, background: 'rgba(255,255,255,.08)', margin: '8px 12px' }} />;
            const active = activeTab === key;
            return (
              <button key={key} onClick={() => setActiveTab(key)} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 12px', marginBottom: 4, borderRadius: 10, border: 'none', cursor: 'pointer', background: active ? 'rgba(255,255,255,.12)' : 'transparent', color: active ? 'white' : '#94a3b8', fontWeight: active ? 700 : 500, fontSize: 14, textAlign: 'left', borderLeft: active ? '3px solid #f59e0b' : '3px solid transparent' }}>
                <span style={{ fontSize: 16 }}>{icon}</span>{label}
              </button>
            );
          })}
        </nav>
        <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,.08)', color: '#475569', fontSize: 11 }}>
          {new Date().toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </div>
      </aside>

      {/* ─── MAIN ─── */}
      <div className="jw-main" style={{ marginLeft: onMobile ? 0 : SIDEBAR_W, flex: 1, display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>

        {/* Topbar */}
        <header className="jw-topbar" style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '0 28px', height: 56, display: 'flex', alignItems: 'center', gap: 12, position: 'sticky', top: 0, zIndex: 100, boxShadow: '0 1px 4px rgba(0,0,0,.06)' }}>
          <h1 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#1e293b' }}>
            {NAV_ITEMS.find(n => n.key === activeTab)?.icon} {NAV_ITEMS.find(n => n.key === activeTab)?.label}
          </h1>
          <div style={{ flex: 1 }} />
          {activeTab === 'hang_ton' && (
            <>
              <input
                ref={importInputRef}
                type="file"
                accept=".xls"
                style={{ display: 'none' }}
                onChange={handleImportXls}
              />
              <button
                onClick={() => importInputRef.current?.click()}
                disabled={importingXls}
                style={{ padding: '7px 18px', borderRadius: 8, background: importingXls ? '#94a3b8' : '#f59e0b', color: 'white', fontWeight: 700, border: 'none', cursor: importingXls ? 'wait' : 'pointer', fontSize: 13 }}
              >
                {importingXls ? 'Dang import...' : 'Import XLS'}
              </button>
              <button onClick={openAdd} style={{ padding: '7px 18px', borderRadius: 8, background: '#2563eb', color: 'white', fontWeight: 700, border: 'none', cursor: 'pointer', fontSize: 13 }}>
                + Thêm Hàng
              </button>
            </>
          )}
          <button onClick={() => { window.history.pushState({}, '', '/camera'); setPathname('/camera'); }} style={{ padding: '7px 18px', borderRadius: 8, background: '#10b981', color: 'white', fontWeight: 700, border: 'none', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>📸</span> OCR Tem
          </button>
          {/* ─── NOTIFICATION BELL ─── */}
          <div style={{ position: 'relative' }}>
            <button onClick={() => setShowNotif(s => !s)}
              style={{ position: 'relative', width: 38, height: 38, borderRadius: 10, border: '1.5px solid #e2e8f0', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: notifications.length ? '#f59e0b' : '#94a3b8' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
              {notifications.length > 0 && (
                <span style={{ position: 'absolute', top: -5, right: -5, minWidth: 17, height: 17, borderRadius: 9, background: '#dc2626', color: 'white', fontSize: 9, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px' }}>{notifications.length > 99 ? '99+' : notifications.length}</span>
              )}
            </button>
            {showNotif && (
              <div style={{ position: 'absolute', top: 44, right: 0, width: 340, background: 'white', borderRadius: 14, boxShadow: '0 8px 32px rgba(0,0,0,.15)', border: '1px solid #e2e8f0', zIndex: 500, overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', background: '#1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'white', fontWeight: 800, fontSize: 13 }}>🔔 Thông báo</span>
                  {notifications.length > 0 && <button onClick={() => setNotifications([])} style={{ background: 'rgba(255,255,255,.15)', border: 'none', color: 'white', fontSize: 11, borderRadius: 6, padding: '3px 8px', cursor: 'pointer' }}>Xoá tất cả</button>}
                </div>
                <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                  {notifications.length === 0
                    ? <div style={{ padding: '20px 16px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Không có thông báo nào</div>
                    : notifications.map((n, i) => (
                      <div key={i} style={{ padding: '10px 16px', borderBottom: '1px solid #f1f5f9' }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#1e293b', marginBottom: 3 }}>{n.title}</div>
                        <div style={{ fontSize: 11, color: '#64748b', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{n.body}</div>
                        <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>{new Date(n.date).toLocaleString('vi-VN')}</div>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        </header>

        {activeTab === 'cau_hinh' ? <CauHinhPage /> :
          activeTab === 'don_hang' ? <div style={{ padding: '20px 28px' }}><DonHangPage /></div> :
            activeTab === 'nhan_su' ? <div style={{ padding: '20px 28px' }}><NhanSuPage /></div> :
              activeTab === 'khach_hang' ? <div style={{ padding: '20px 28px' }}><KhachHangPage /></div> :
                activeTab === 'doi_tac' ? <div style={{ padding: '20px 28px' }}><DoiTacPage /></div> :
                  activeTab === 'ke_toan' ? <div style={{ padding: '20px 28px' }}><KeToanPage /></div> :
                    activeTab === 'tai_chinh' ? <TaiChinhPage /> :
                      activeTab === 'may_can_vang' ? <MayCanVangPage /> :
                      activeTab !== 'hang_ton' ? <ComingSoon label={NAV_ITEMS.find(n => n.key === activeTab)?.label} /> : (

                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>

                          {/* Stats */}
                          <div style={{ padding: '18px 28px 0', display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
                            {[
                              { label: 'TỔNG SẢN PHẨM', val: statTotal, color: '#2563eb' },
                              { label: 'TỒN KHO', val: statTonKho, color: '#16a34a' },
                              { label: 'ĐÃ BÁN', val: statDaBan, color: '#dc2626' },
                              { label: 'LUÂN CHUYỂN', val: statLuan, color: '#d97706' },
                            ].map(s => (
                              <div key={s.label} style={{ background: 'white', padding: '12px 18px', borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(0,0,0,.04)' }}>
                                <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', marginBottom: 4, letterSpacing: .5 }}>{s.label}</div>
                                <div style={{ fontSize: 26, fontWeight: 900, color: s.color }}>{s.val}</div>
                              </div>
                            ))}
                          </div>

                          {/* ─── STICKY FILTER BAR (full columns) ─── */}
                          <div style={{ position: 'sticky', top: 56, zIndex: 90, background: '#f0f4f8', padding: '12px 28px 10px', borderBottom: '1px solid #e2e8f0' }}>
                            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                              <FilterInput label="Mã hàng" value={fMaHang} onChange={e => { setFMaHang(e.target.value); setPage(1); }} />
                              <FilterInput label="NCC" value={fNcc} onChange={e => { setFNcc(e.target.value); setPage(1); }} />
                              <FilterSelect label="Nhóm hàng" value={fNhom} onChange={e => { setFNhom(e.target.value); setPage(1); }}
                                options={nhomList.map(n => ({ value: n, label: n }))} allLabel="Tất cả nhóm" />
                              <FilterSelect label="Quầy nhỏ" value={fQuay} onChange={e => { setFQuay(e.target.value); setPage(1); }}
                                options={quayList.map(q => ({ value: q, label: q }))} allLabel="Tất cả quầy" />
                              <FilterSelect label="Tuổi vàng" value={fTuoi} onChange={e => { setFTuoi(e.target.value); setPage(1); }}
                                options={tuoiList.map(t => ({ value: t, label: t }))} allLabel="Tất cả tuổi" />
                              <FilterInput label="Công lẻ" value={fCongLe} onChange={e => { setFCongLe(e.target.value); setPage(1); }} placeholder="VD: 390" />
                              <FilterInput label="Công sỉ" value={fCongSi} onChange={e => { setFCongSi(e.target.value); setPage(1); }} placeholder="VD: 0" />
                              <FilterSelect label="Trạng thái" value={fStatus} onChange={e => { setFStatus(e.target.value); setPage(1); }}
                                options={statusList.map(s => ({ value: s, label: s }))} allLabel="Tất cả" />
                              <FilterDateInput label="Tạo từ ngày" value={fCreatedFrom} onChange={e => { setFCreatedFrom(e.target.value); setPage(1); }} />
                              <FilterDateInput label="Tạo đến ngày" value={fCreatedTo} onChange={e => { setFCreatedTo(e.target.value); setPage(1); }} />
                              {hasFilter && (
                                <button onClick={clearAll} style={{ alignSelf: 'flex-end', padding: '7px 14px', borderRadius: 7, border: '1px solid #fca5a5', background: '#fff1f2', color: '#dc2626', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                                  ✕ Xoá lọc
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Table */}
                          <div style={{ flex: 1, padding: '14px 28px 0', overflow: 'auto' }}>
                            <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'auto', boxShadow: '0 1px 6px rgba(0,0,0,.04)' }}>
                              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 900 }}>
                                <thead>
                                  <tr style={{ background: '#1e293b', color: 'white' }}>
                                    {[
                                      { label: 'STT', align: 'left', sortKey: 'id' },
                                      { label: 'Mã hàng', align: 'left', sortKey: 'ma_hang' },
                                      { label: 'NCC (Nhóm hàng)', align: 'left', sortKey: 'ncc' },
                                      { label: 'Quầy nhỏ', align: 'left', sortKey: 'quay_nho' },
                                      { label: 'Tuổi vàng', align: 'left', sortKey: 'tuoi_vang' },
                                      { label: 'Công lẻ / sỉ', align: 'right', sortKey: 'cong' },
                                      { label: 'Trọng lượng (đá + vàng = tổng)', align: 'right', sortKey: 'tong_tl' },
                                      { label: 'Trạng thái', align: 'left', sortKey: 'status' },
                                      { label: '', align: 'center', sortKey: null },
                                    ].map(h => (
                                      <th key={`${h.label}-${h.align}`} style={{ padding: '10px 12px', fontWeight: 700, fontSize: 12, letterSpacing: .4, whiteSpace: 'nowrap', textAlign: h.align }}>
                                        {h.sortKey ? (
                                          <button
                                            type="button"
                                            onClick={() => handleSort(h.sortKey)}
                                            style={{
                                              display: 'inline-flex',
                                              alignItems: 'center',
                                              justifyContent: h.align === 'right' ? 'flex-end' : 'flex-start',
                                              gap: 6,
                                              width: '100%',
                                              border: 'none',
                                              background: 'transparent',
                                              color: 'inherit',
                                              font: 'inherit',
                                              fontWeight: 700,
                                              cursor: 'pointer',
                                              padding: 0,
                                            }}
                                          >
                                            <span>{h.label}</span>
                                            <span style={{ fontSize: 11, color: sortBy === h.sortKey ? '#fbbf24' : 'rgba(255,255,255,.7)' }}>
                                              {getSortIcon(h.sortKey)}
                                            </span>
                                          </button>
                                        ) : h.label}
                                      </th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {displayed.map((r, idx) => {
                                    const nhomColor = getNhomColor(r.nhom_hang);
                                    return (
                                      <tr key={r.id}
                                        style={{ borderBottom: '1px solid #f1f5f9', background: idx % 2 === 0 ? 'white' : '#f8fafc', transition: 'background .1s' }}
                                        onMouseEnter={e => e.currentTarget.style.background = '#eff6ff'}
                                        onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0 ? 'white' : '#f8fafc'}>

                                        {/* STT */}
                                        <td style={{ padding: '9px 12px', color: '#94a3b8', fontWeight: 600, width: 44 }}>
                                          {(pageSize === 0 ? 0 : (page - 1) * pageSize) + idx + 1}
                                        </td>

                                        {/* Mã hàng */}
                                        <td style={{ padding: '9px 12px', fontWeight: 800, color: '#1e293b', whiteSpace: 'nowrap' }}>{r.ma_hang}</td>

                                        {/* NCC + Nhóm hàng badge */}
                                        <td style={{ padding: '9px 12px', maxWidth: 260 }}>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'nowrap', minWidth: 0 }}>
                                            {r.nhom_hang && nhomColor && (
                                              <span style={{ padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: nhomColor.bg, color: nhomColor.text, whiteSpace: 'nowrap', flexShrink: 0 }}>
                                                {r.nhom_hang}
                                              </span>
                                            )}
                                            <span
                                              title={r.ncc || ''}
                                              style={{ color: '#334155', fontSize: 13, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', flex: 1 }}
                                            >
                                              {r.ncc}
                                            </span>
                                          </div>
                                        </td>

                                        {/* Quầy nhỏ */}
                                        <td style={{ padding: '9px 12px', color: '#475569', fontSize: 12, whiteSpace: 'nowrap' }}>{r.quay_nho}</td>

                                        {/* Tuổi vàng */}
                                        <td style={{ padding: '9px 12px', color: '#475569', fontSize: 12, whiteSpace: 'nowrap' }}>
                                          {r.tuoi_vang || '—'}
                                        </td>

                                        {/* Công lẻ / sỉ */}
                                        <td style={{ padding: '9px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                          <span style={{ fontWeight: 700, color: '#0369a1' }}>{r.cong_le || '—'}</span>
                                          <span style={{ color: '#94a3b8', margin: '0 3px' }}>/</span>
                                          <span style={{ color: '#64748b', fontWeight: 500 }}>{r.cong_si || '0'}</span>
                                        </td>

                                        {/* Trọng lượng: đá + vàng = tổng */}
                                        <td style={{ padding: '9px 12px', textAlign: 'right', whiteSpace: 'nowrap', fontSize: 12 }}>
                                          <span style={{ color: '#64748b' }}>{formatWeightDisplay(r.tl_da)}</span>
                                          <span style={{ color: '#94a3b8', margin: '0 4px' }}>+</span>
                                          <span style={{ color: '#047857', fontWeight: 600 }}>{formatWeightDisplay(r.tl_vang)}</span>
                                          <span style={{ color: '#94a3b8', margin: '0 4px' }}>=</span>
                                          <span style={{ display: 'inline-block', padding: '1px 8px', borderRadius: 20, background: '#1e293b', color: 'white', fontWeight: 800, fontSize: 12 }}>{formatWeightDisplay(r.tong_tl)}</span>
                                        </td>

                                        {/* Trạng thái */}
                                        <td style={{ padding: '9px 12px' }}>
                                          <span style={{ padding: '3px 9px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: STATUS_COLORS[r.status]?.bg || '#f1f5f9', color: STATUS_COLORS[r.status]?.text || '#334155' }}>
                                            {r.status}
                                          </span>
                                        </td>

                                        {/* Actions */}
                                        <td style={{ padding: '9px 12px', whiteSpace: 'nowrap', textAlign: 'center' }}>
                                          {/* Info button */}
                                          <button onClick={() => setInfoModal(r)} title="Xem ảnh" style={{ marginRight: 5, width: 30, height: 30, borderRadius: 6, border: '1px solid #e2e8f0', background: '#f8fafc', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', position: 'relative' }}>
                                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
                                            {(r.images?.length > 0) && <span style={{ position: 'absolute', top: -4, right: -4, width: 15, height: 15, borderRadius: '50%', background: '#dc2626', color: 'white', fontSize: 9, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{r.images.length}</span>}
                                          </button>
                                          <button onClick={() => openEdit(r)} title="Sửa" style={{ marginRight: 5, width: 30, height: 30, borderRadius: 6, border: '1px solid #cbd5e1', background: 'white', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb' }}>
                                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                                          </button>
                                          <button onClick={() => confirmDelete(r.id)} title="Xóa" style={{ width: 30, height: 30, borderRadius: 6, border: '1px solid #fca5a5', background: '#fff1f2', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#dc2626' }}>
                                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>
                                          </button>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                  {displayed.length === 0 && (
                                    <tr><td colSpan={9} style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Không tìm thấy dữ liệu.</td></tr>
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </div>

                          {/* ─── STICKY PAGINATION ─── */}
                          <div style={{ position: 'sticky', bottom: 0, zIndex: 90, background: '#f0f4f8', padding: '10px 28px 14px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: 13, color: '#64748b' }}>Hiển thị <b>{displayed.length}</b>/{filtered.length} sản phẩm</span>
                            <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                              <span style={{ fontSize: 13, color: '#64748b', marginRight: 6 }}>Hiển thị</span>
                              <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
                                style={{ padding: '5px 10px', borderRadius: 8, border: '1.5px solid #cbd5e1', outline: 'none', background: 'white', fontSize: 13, cursor: 'pointer', marginRight: 8 }}>
                                <option value={0}>Tất cả</option>
                                <option value={50}>50 / trang</option>
                                <option value={100}>100 / trang</option>
                                <option value={200}>200 / trang</option>
                              </select>
                              {pageSize > 0 && (() => {
                                const sq = (key, label, onClick, active, disabled) => (
                                  <button key={key} onClick={onClick} disabled={disabled} style={{
                                    width: 32, height: 32, borderRadius: 6,
                                    border: active ? 'none' : '1.5px solid #cbd5e1',
                                    background: active ? '#1e293b' : disabled ? '#f8fafc' : 'white',
                                    color: active ? 'white' : disabled ? '#cbd5e1' : '#334155',
                                    fontWeight: active ? 800 : 600, fontSize: 13,
                                    cursor: disabled ? 'default' : 'pointer',
                                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                  }}>{label}</button>
                                );
                                const ellipsis = (k) => (
                                  <span key={k} style={{ width: 32, textAlign: 'center', color: '#94a3b8', fontWeight: 700, fontSize: 14, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>…</span>
                                );
                                const builtPages = [];
                                builtPages.push(sq('prev', '←', () => setPage(p => Math.max(1, p - 1)), false, page === 1));
                                if (totalPages <= 7) {
                                  for (let i = 1; i <= totalPages; i++) builtPages.push(sq(i, i, () => setPage(i), i === page, false));
                                } else {
                                  builtPages.push(sq(1, 1, () => setPage(1), page === 1, false));
                                  if (page > 3) builtPages.push(ellipsis('e1'));
                                  const lo = Math.max(2, page - 1), hi = Math.min(totalPages - 1, page + 1);
                                  for (let i = lo; i <= hi; i++) { const pi = i; builtPages.push(sq(i, i, () => setPage(pi), i === page, false)); }
                                  if (page < totalPages - 2) builtPages.push(ellipsis('e2'));
                                  builtPages.push(sq(totalPages, totalPages, () => setPage(totalPages), page === totalPages, false));
                                }
                                builtPages.push(sq('next', '→', () => setPage(p => Math.min(totalPages, p + 1)), false, page >= totalPages));
                                return builtPages;
                              })()}
                            </div>
                          </div>

                        </div>
                      )}
      </div>

      {/* ─── MODAL ─── */}
      {editModal.isOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div style={{ background: 'white', borderRadius: 16, width: '100%', maxWidth: 740, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 24px 60px rgba(0,0,0,.2)' }}>
            <div style={{ padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#1e293b', borderRadius: '16px 16px 0 0' }}>
              <h2 style={{ color: 'white', margin: 0, fontSize: 15, fontWeight: 800 }}>{editModal.item ? '✏️ Chỉnh sửa sản phẩm' : '+ Thêm sản phẩm mới'}</h2>
              <button onClick={() => setEditModal({ isOpen: false, item: null })} style={{ background: 'transparent', border: 'none', color: 'white', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>&times;</button>
            </div>
            <form onSubmit={handleSave} style={{ padding: 24 }}>

              {/* Fields grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
                {[
                  { key: 'ma_hang', label: 'Mã hàng', required: true },
                  { key: 'ncc', label: 'NCC (Tên hàng)' },
                  { key: 'cong_le', label: 'Công lẻ' },
                  { key: 'cong_si', label: 'Công sỉ' },
                  { key: 'tong_tl', label: 'Tổng TL' },
                  { key: 'tl_da', label: 'TL đá' },
                  { key: 'tl_vang', label: 'TL vàng' },
                ].map(({ key, label, required }) => (
                  <div key={key}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4 }}>{label}</label>
                    <input required={!!required} value={form[key] || ''} onChange={e => setForm({ ...form, [key]: e.target.value })}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', outline: 'none', fontSize: 13, boxSizing: 'border-box' }} />
                  </div>
                ))}

                {/* Nhóm hàng — dropdown từ Cài Đặt */}
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4 }}>Nhóm hàng</label>
                  <select value={form.nhom_hang || ''} onChange={e => setForm({ ...form, nhom_hang: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', outline: 'none', fontSize: 13, background: 'white' }}>
                    <option value=''>-- Chọn nhóm --</option>
                    {nhomHangList.map(n => (
                      <option key={n.id} value={n.ten_nhom}>{n.ten_nhom}</option>
                    ))}
                    {/* Giữ giá trị cũ nếu không có trong list */}
                    {form.nhom_hang && !nhomHangList.find(n => n.ten_nhom === form.nhom_hang) && (
                      <option value={form.nhom_hang}>{form.nhom_hang} (cũ)</option>
                    )}
                  </select>
                </div>

                {/* Quầy nhỏ */}
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4 }}>Quầy nhỏ</label>
                  <select value={form.quay_nho || ''} onChange={e => setForm({ ...form, quay_nho: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', outline: 'none', fontSize: 13, background: 'white', boxSizing: 'border-box' }}>
                    <option value=''>-- Chọn quầy --</option>
                    {quayNhoList.map(q => (
                      <option key={q.id} value={q.ten_quay}>{q.ten_quay}</option>
                    ))}
                    {/* Giữ giá trị cũ nếu không có trong list */}
                    {form.quay_nho && !quayNhoList.find(q => q.ten_quay === form.quay_nho) && (
                      <option value={form.quay_nho}>{form.quay_nho} (cũ)</option>
                    )}
                  </select>
                </div>

                {/* Loại vàng — dropdown từ Cài Đặt > Giá vàng */}
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4 }}>Loại vàng</label>
                  <select value={form.loai_vang || ''} onChange={e => setForm({ ...form, loai_vang: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', outline: 'none', fontSize: 13, background: 'white' }}>
                    <option value=''>-- Chọn loại --</option>
                    {loaiVangList.map(v => (
                      <option key={v.id} value={v.ma_loai}>{v.ma_loai} — {v.ten_loai}</option>
                    ))}
                    {/* Giữ giá trị cũ nếu không có trong list */}
                    {form.loai_vang && !loaiVangList.find(v => v.ma_loai === form.loai_vang) && (
                      <option value={form.loai_vang}>{form.loai_vang} (cũ)</option>
                    )}
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4 }}>Tuổi vàng</label>
                  <select value={form.tuoi_vang || ''} onChange={e => setForm({ ...form, tuoi_vang: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', outline: 'none', fontSize: 13, background: 'white' }}>
                    <option value=''>-- Chọn tuổi vàng --</option>
                    {tuoiVangList.map(t => (
                      <option key={t.id} value={t.ten_tuoi}>{t.ten_tuoi}</option>
                    ))}
                    {form.tuoi_vang && !tuoiVangList.find(t => t.ten_tuoi === form.tuoi_vang) && (
                      <option value={form.tuoi_vang}>{form.tuoi_vang} (cũ)</option>
                    )}
                  </select>
                </div>

                {/* Trạng thái */}
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4 }}>Trạng thái</label>
                  <select value={form.status || 'Tồn kho'} onChange={e => setForm({ ...form, status: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', outline: 'none', fontSize: 13 }}>
                    <option>Tồn kho</option>
                    <option>Đã bán</option>
                    <option>Luân chuyển</option>
                  </select>
                </div>
              </div>

              {/* ─── GIÁ MUA (GIÁ VỐN) ─── */}
              {(() => {
                const tl = parseFloat(form.tl_vang) || 0;
                const gv = parseInt(form.gia_vang_mua) || 0;
                const gh = parseInt(form.gia_hat) || 0;
                const gnc = parseInt(form.gia_nhan_cong) || 0;
                const dc = parseInt(form.dieu_chinh) || 0;
                const total = Math.round(gv * tl + gh + gnc + dc);
                const fmtN = n => n ? Number(n).toLocaleString('vi-VN') : '0';
                const inpS = { width: '100%', padding: '8px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', outline: 'none', fontSize: 13, boxSizing: 'border-box' };
                return (
                  <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 16, marginBottom: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                      <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: .4 }}>💰 GIÁ MUA (GIÁ VỐN)</label>
                      {total > 0 && (
                        <span style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 20, padding: '3px 12px', fontSize: 12, fontWeight: 800, color: '#15803d' }}>
                          = {fmtN(total)} ₫
                        </span>
                      )}
                    </div>
                    <div style={{ background: '#f8fafc', borderRadius: 10, padding: '14px 16px', border: '1px solid #e2e8f0' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 10 }}>
                        <div>
                          <label style={{ fontSize: 10, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4 }}>GIÁ VÀNG ĐƠN VỊ (₫/chỉ)</label>
                          <input type="number" style={inpS} value={form.gia_vang_mua || ''} placeholder="VD: 17000000"
                            onChange={e => setForm({ ...form, gia_vang_mua: e.target.value })} />
                          {form.loai_vang && loaiVangList.length > 0 && (() => {
                            const lv = loaiVangList.find(v => v.ma_loai === form.loai_vang);
                            return lv ? (
                              <button type="button" onClick={() => setForm({ ...form, gia_vang_mua: String(lv.gia_mua) })}
                                style={{ marginTop: 4, fontSize: 11, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 600 }}>
                                ↖ Lấy giá mua SJC hiện tại ({fmtN(lv.gia_mua)} ₫)
                              </button>
                            ) : null;
                          })()}
                        </div>
                        <div>
                          <label style={{ fontSize: 10, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4 }}>GIÁ HẠT / ĐÁ (₫)</label>
                          <input type="number" style={inpS} value={form.gia_hat || ''} placeholder="0"
                            onChange={e => setForm({ ...form, gia_hat: e.target.value })} />
                        </div>
                        <div>
                          <label style={{ fontSize: 10, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4 }}>GIÁ NHÂN CÔNG (₫)</label>
                          <input type="number" style={inpS} value={form.gia_nhan_cong || ''} placeholder="0"
                            onChange={e => setForm({ ...form, gia_nhan_cong: e.target.value })} />
                        </div>
                        <div>
                          <label style={{ fontSize: 10, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4 }}>ĐIỀU CHỈNH +/- (₫)</label>
                          <input type="number" style={inpS} value={form.dieu_chinh || ''} placeholder="0"
                            onChange={e => setForm({ ...form, dieu_chinh: e.target.value })} />
                        </div>
                      </div>
                      {/* Công thức hiển thị */}
                      {(gv > 0 || gh > 0 || gnc > 0 || dc !== 0) && (
                        <div style={{ fontSize: 11, color: '#94a3b8', borderTop: '1px dashed #e2e8f0', paddingTop: 8, fontFamily: 'monospace' }}>
                          {fmtN(gv)} × {tl || 0} chỉ + {fmtN(gh)} + {fmtN(gnc)} {dc >= 0 ? '+' : ''}{fmtN(dc)}
                          {' = '}
                          <strong style={{ color: '#15803d', fontSize: 12 }}>{fmtN(total)} ₫</strong>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Image upload */}
              <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 18 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 10, letterSpacing: .4 }}>HÌNH ẢNH SẢN PHẨM</label>

                {/* Thumbnails */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                  {(form.images || []).map((img, i) => (
                    <div key={i} style={{ position: 'relative', width: 80, height: 80, borderRadius: 10, overflow: 'hidden', border: '1.5px solid #e2e8f0', flexShrink: 0 }}>
                      <img src={`${API}${img.url}`} alt={img.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      <button type="button" onClick={() => removeImage(i)}
                        style={{ position: 'absolute', top: 3, right: 3, width: 20, height: 20, borderRadius: '50%', background: 'rgba(220,38,38,.85)', border: 'none', color: 'white', fontWeight: 900, fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>
                        ×
                      </button>
                    </div>
                  ))}

                  {/* Drop zone */}
                  <label style={{ width: 80, height: 80, borderRadius: 10, border: '2px dashed #cbd5e1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: uploading ? 'wait' : 'pointer', background: uploading ? '#f8fafc' : 'white', flexShrink: 0, transition: 'background .15s' }}
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => { e.preventDefault(); uploadImages([...e.dataTransfer.files]); }}>
                    <input type="file" multiple accept="image/*" style={{ display: 'none' }}
                      onChange={e => uploadImages([...e.target.files])} />
                    {uploading
                      ? <div style={{ fontSize: 20 }}>⏳</div>
                      : <>
                        <div style={{ fontSize: 22, color: '#94a3b8' }}>+</div>
                        <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>Tải ảnh</div>
                      </>}
                  </label>
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>Kéo thả hoặc click vào ô + để chọn nhiều ảnh. Hỗ trợ JPG, PNG, WEBP.</div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
                <button type="button" onClick={() => setEditModal({ isOpen: false, item: null })}
                  style={{ padding: '9px 20px', borderRadius: 8, border: '1.5px solid #cbd5e1', background: 'white', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>Hủy</button>
                <button type="submit" disabled={uploading}
                  style={{ padding: '9px 22px', borderRadius: 8, border: 'none', background: uploading ? '#94a3b8' : '#2563eb', color: 'white', fontWeight: 800, cursor: uploading ? 'wait' : 'pointer', fontSize: 13 }}>
                  {editModal.item ? 'Lưu thay đổi' : 'Tạo mới'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── INFO / IMAGE GALLERY MODAL ─── */}
      {infoModal && (() => {
        const imgs = infoModal.images || [];
        const curIdx = lightbox !== null ? lightbox : 0;
        return (
          <>
            {/* Gallery modal */}
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1500, padding: 20 }}>
              <div style={{ background: 'white', borderRadius: 16, width: '100%', maxWidth: 620, maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 24px 60px rgba(0,0,0,.25)' }}>
                {/* Header */}
                <div style={{ background: '#1e293b', borderRadius: '16px 16px 0 0', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ color: 'white', fontWeight: 800, fontSize: 14 }}>🖼 {infoModal.ma_hang}</div>
                    <div style={{ color: '#94a3b8', fontSize: 11, marginTop: 2 }}>{infoModal.ncc} · {imgs.length} ảnh</div>
                  </div>
                  <button onClick={() => { setInfoModal(null); setLightbox(null); }} style={{ background: 'none', border: 'none', color: 'white', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>&times;</button>
                </div>

                {/* Gallery grid */}
                <div style={{ padding: 20 }}>
                  {imgs.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8' }}>
                      <div style={{ fontSize: 40, marginBottom: 10 }}>📷</div>
                      <div style={{ fontSize: 13 }}>Chưa có ảnh nào được upload cho sản phẩm này.</div>
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10 }}>
                      {imgs.map((img, i) => (
                        <div key={i} onClick={() => setLightbox(i)} style={{ borderRadius: 10, overflow: 'hidden', aspectRatio: '1', cursor: 'zoom-in', border: '1.5px solid #e2e8f0', position: 'relative' }}>
                          <img src={`${API}${img.url}`} alt={img.name || `Ảnh ${i + 1}`}
                            style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform .2s' }}
                            onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.05)'}
                            onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                          />
                          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(transparent, rgba(0,0,0,.6))', padding: '14px 6px 5px', fontSize: 10, color: 'white', textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{img.name || `Ảnh ${i + 1}`}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Lightbox */}
            {lightbox !== null && (
              <div onClick={() => setLightbox(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, cursor: 'zoom-out' }}>
                <img src={`${API}${imgs[curIdx].url}`} alt="" onClick={e => e.stopPropagation()}
                  style={{ maxWidth: '90vw', maxHeight: '88vh', borderRadius: 10, objectFit: 'contain', boxShadow: '0 8px 40px rgba(0,0,0,.5)', cursor: 'default' }} />
                {/* Counter */}
                <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,.6)', color: 'white', borderRadius: 20, padding: '4px 14px', fontSize: 13, fontWeight: 700 }}>{curIdx + 1} / {imgs.length}</div>
                {/* Prev */}
                {curIdx > 0 && (
                  <button onClick={e => { e.stopPropagation(); setLightbox(curIdx - 1); }}
                    style={{ position: 'fixed', left: 20, top: '50%', transform: 'translateY(-50%)', width: 44, height: 44, borderRadius: '50%', background: 'rgba(255,255,255,.15)', border: 'none', color: 'white', fontSize: 22, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>‹</button>
                )}
                {/* Close */}
                <button onClick={() => setLightbox(null)}
                  style={{ position: 'fixed', top: 18, right: 22, background: 'rgba(255,255,255,.15)', border: 'none', color: 'white', fontSize: 24, cursor: 'pointer', width: 38, height: 38, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>&times;</button>
              </div>
            )}
          </>
        );
      })()}

      {/* ─── MOBILE HAMBURGER NAV (Portal → document.body) ─── */}
      {createPortal(
        <>
          <style>{`
            /* Desktop: hide mobile nav entirely */
            @media (min-width: 769px) {
              .jw-mob-only { display: none !important; }
            }
            /* Mobile: sidebar off, content full width */
            @media (max-width: 768px) {
              .jw-sidebar { display: none !important; }
              .jw-main    { margin-left: 0 !important; }
              .jw-topbar  { padding: 0 12px !important; }
              body        { overflow-x: hidden; }
            }
            /* Hamburger 3 bars */
            .jw-ham-bar {
              height: 4px; width: 100%;
              background: #fff; border-radius: 2px;
              transition: transform .25s, opacity .2s;
            }
            .jw-ham-toggle.active .jw-ham-bar:nth-child(1) {
              transform: rotate(45deg) translateY(11px);
            }
            .jw-ham-toggle.active .jw-ham-bar:nth-child(2) { opacity: 0; }
            .jw-ham-toggle.active .jw-ham-bar:nth-child(3) {
              transform: rotate(-45deg) translateY(-11px);
            }
            /* Menu grid */
            .jw-mob-menu {
              position: fixed; inset: 0; z-index: 1000;
              background: #747474;
              display: none;
              grid-template-columns: repeat(3, 1fr);
              align-items: center; justify-items: center;
              gap: 10px; padding: 100px 16px 40px;
            }
            .jw-mob-menu.open { display: grid; }
            .jw-mob-menu-item {
              width: 100%; min-height: 90px;
              border: 1px solid #cbebff; border-radius: 8px;
              display: flex; flex-direction: column;
              align-items: center; justify-content: center;
              gap: 6px; padding: 14px 8px;
              background: rgba(255,255,255,.06);
              cursor: pointer; transition: background .15s;
            }
            .jw-mob-menu-item:active { background: rgba(255,255,255,.18); }
            .jw-mob-menu-item.active-tab {
              background: rgba(245,158,11,.25);
              border-color: #f59e0b;
            }
            .jw-mob-menu-item span.icon { font-size: 28px; }
            .jw-mob-menu-item span.lbl {
              color: #cbebff; font-size: 10px;
              text-transform: uppercase; font-weight: 700;
              text-align: center; letter-spacing: .5px;
              line-height: 1.2;
            }
            .jw-mob-menu-item.active-tab span.lbl { color: #f59e0b; }
          `}</style>

          {/* 3-bar toggle — top-left */}
          <div
            className={`jw-mob-only jw-ham-toggle${mobileOpen ? ' active' : ''}`}
            onClick={() => setMobileOpen(o => !o)}
            style={{
              position: 'fixed', left: 12, top: 12, zIndex: 1001,
              width: 30, height: 25,
              display: 'flex', flexDirection: 'column',
              justifyContent: 'space-between', cursor: 'pointer',
            }}
          >
            <div className="jw-ham-bar" />
            <div className="jw-ham-bar" />
            <div className="jw-ham-bar" />
          </div>

          {/* Full-screen grid menu */}
          <div className={`jw-mob-only jw-mob-menu${mobileOpen ? ' open' : ''}`}>
            {NAV_ITEMS.filter(n => n.key !== 'divider').map(item => (
              <div
                key={item.key}
                className={`jw-mob-menu-item${activeTab === item.key ? ' active-tab' : ''}`}
                onClick={() => { setActiveTab(item.key); setMobileOpen(false); }}
              >
                <span className="icon">{item.icon}</span>
                <span className="lbl">{item.label}</span>
              </div>
            ))}
          </div>
        </>,
        document.body
      )}

    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   DonHangCaiDatModal — Bảng tỷ lệ trao đổi giữa các loại vàng
   ─ Hàng: loại vàng gốc (mang đến)
   ─ Cột: loại vàng đổi sang
   ─ Ô: số chỉ vàng [cột] đổi được 1 chỉ [hàng]
   Lưu vào localStorage dưới key 'don_hang_exchange_matrix'
═════════════════════════════════════════════════════════════ */
function DonHangCaiDatModal({ loaiVangList, onClose }) {
  const STORAGE_KEY = 'don_hang_exchange_matrix';

  // khoi tao matrix tu localStorage hoac {}
  const initMatrix = () => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
    catch { return {}; }
  };
  const [matrix, setMatrix] = React.useState(initMatrix);
  const [saved, setSaved] = React.useState(false);

  const getCellKey = (rowId, colId) => `${rowId}_${colId}`;

  const handleChange = (rowId, colId, value) => {
    const key = getCellKey(rowId, colId);
    setMatrix(m => ({ ...m, [key]: value }));
    setSaved(false);
  };

  const handleSave = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(matrix));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => {
    if (!window.confirm('Reset toàn bộ bảng tỷ lệ?')) return;
    setMatrix({});
    localStorage.removeItem(STORAGE_KEY);
  };

  const list = loaiVangList;
  const cellW = 90;
  const headerW = 120;

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)',
      backdropFilter: 'blur(4px)', zIndex: 2000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: 'white', borderRadius: 18, width: '100%',
        maxWidth: Math.min(160 + list.length * cellW + 32, window.innerWidth - 40),
        maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 28px 70px rgba(0,0,0,.3)',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 22px', background: '#1e293b',
          borderRadius: '18px 18px 0 0',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <div style={{ color: 'white', fontWeight: 800, fontSize: 15 }}>⚙️ Cài đặt Đơn hàng</div>
            <div style={{ color: '#94a3b8', fontSize: 11, marginTop: 3 }}>
              Bảng tỷ lệ trao đổi — hàng = loại mang đến, cột = loại đổi sang
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        {/* Body — scrollable grid */}
        <div style={{ flex: 1, overflow: 'auto', padding: '20px 22px' }}>
          {list.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8' }}>
              Chưa có loại vàng nào. Hãy thêm loại vàng trong <strong>Cài Đặt → Giá vàng</strong>.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: headerW + list.length * cellW }}>
                <thead>
                  <tr>
                    {/* Góc trái trên */}
                    <th style={{
                      width: headerW, background: '#f8fafc',
                      border: '1.5px solid #e2e8f0', padding: '10px 12px',
                      fontSize: 10, color: '#94a3b8', fontWeight: 700,
                      textAlign: 'center', position: 'sticky', left: 0, zIndex: 2,
                    }}>
                      <div>Mang đến ↓</div>
                      <div style={{ borderTop: '1px solid #e2e8f0', marginTop: 4, paddingTop: 4 }}>Đổi sang →</div>
                    </th>
                    {/* Cột headers = loại vàng */}
                    {list.map(col => (
                      <th key={col.id} style={{
                        width: cellW, background: '#1e293b',
                        color: 'white', fontSize: 11, fontWeight: 700,
                        padding: '10px 8px', textAlign: 'center',
                        border: '1px solid #334155', whiteSpace: 'nowrap',
                      }}>
                        {col.ten_loai || col.ma_loai}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {list.map((row, ri) => (
                    <tr key={row.id}>
                      {/* Hàng header = loại vàng */}
                      <td style={{
                        background: '#1e293b', color: 'white',
                        padding: '8px 14px', fontWeight: 700, fontSize: 12,
                        border: '1px solid #334155', whiteSpace: 'nowrap',
                        position: 'sticky', left: 0, zIndex: 1,
                      }}>
                        {row.ten_loai || row.ma_loai}
                        <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 400, marginTop: 2 }}>
                          Bán: {row.gia_ban ? Number(row.gia_ban).toLocaleString('vi-VN') : '—'}
                        </div>
                      </td>
                      {/* Các ô trong grid */}
                      {list.map((col, ci) => {
                        const isDiag = row.id === col.id;
                        const key = getCellKey(row.id, col.id);
                        return (
                          <td key={col.id} style={{
                            padding: 4, textAlign: 'center',
                            background: isDiag ? '#f1f5f9' : (ri % 2 === 0 ? 'white' : '#fafafa'),
                            border: '1px solid #e2e8f0',
                          }}>
                            {isDiag ? (
                              <div style={{
                                width: '100%', height: 34,
                                background: '#e2e8f0', borderRadius: 6,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 16, color: '#94a3b8',
                              }}>—</div>
                            ) : (
                              <input
                                type="number" min="0" step="0.01"
                                value={matrix[key] ?? ''}
                                onChange={e => handleChange(row.id, col.id, e.target.value)}
                                placeholder="1.0"
                                style={{
                                  width: '100%', height: 34,
                                  textAlign: 'center', fontSize: 12,
                                  border: matrix[key] ? '1.5px solid #6366f1' : '1.5px solid #e2e8f0',
                                  borderRadius: 6, outline: 'none',
                                  background: matrix[key] ? '#eef2ff' : 'white',
                                  boxSizing: 'border-box', padding: '0 4px',
                                }}
                              />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Legend */}
              <div style={{ marginTop: 16, fontSize: 11, color: '#64748b', background: '#f8fafc', borderRadius: 8, padding: '10px 14px' }}>
                💡 <strong>Cách dùng:</strong> Mỗi ô là <em>số chỉ [cột]</em> đổi được 1 chỉ [hàng].
                Ví dụ: hàng 18K, cột 24K = 0.75 → 1 chỉ 18K đổi được 0.75 chỉ 24K.
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 22px', borderTop: '1px solid #f1f5f9',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: '#fafafa', borderRadius: '0 0 18px 18px',
        }}>
          <button onClick={handleReset}
            style={{ padding: '7px 16px', borderRadius: 8, border: '1.5px solid #fca5a5', background: '#fff1f2', color: '#dc2626', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
            🗑 Reset bảng
          </button>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {saved && <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 700 }}>✅ Đã lưu!</span>}
            <button onClick={onClose}
              style={{ padding: '7px 16px', borderRadius: 8, border: '1.5px solid #e2e8f0', background: 'white', color: '#64748b', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
              Đóng
            </button>
            <button onClick={handleSave}
              style={{ padding: '7px 20px', borderRadius: 8, border: 'none', background: '#6366f1', color: 'white', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
              💾 Lưu
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
