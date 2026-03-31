import React, { useEffect, useRef, useState } from 'react';
import './index.css';
import MobileMenu from './appShell/MobileMenu';
import CauHinhPage from './CauHinhPage';
import DonHangPage from './DonHangPage';
import NhanSuPage from './NhanSuPage';
import KeToanPage from './KeToanPage';
import TaiChinhPage from './TaiChinhPage';
import ThuNganPage from './ThuNganPage';
import MayCanVangPage from './MayCanVangPage';
import NhapVangPage from './NhapVangPage';
import KhachHangPage from './KhachHangPage';
import DoiTacPage from './DoiTacPage';
import SalePosMobile from './SalePosMobile';
import InventoryModals from './inventory/InventoryModals';
import InventoryWorkspace from './inventory/InventoryWorkspace';
import {
  API,
  ComingSoon,
  NAV_ITEMS,
  compareSortValues,
  getDateEndMs,
  getDateStartMs,
  getItemCreatedAtMs,
  getNavLabel,
  numericOrText,
} from './inventory/shared';
import { printItemCertification } from './lib/printItemCertification';

export default function App() {
  const [pathname, setPathname] = useState(window.location.pathname);
  useEffect(() => {
    const onPop = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    if (pathname !== '/camera') return;
    window.history.replaceState({}, '', '/');
    setPathname('/');
  }, [pathname]);

  const [activeTab, setActiveTab] = useState('hang_ton');
  const [data, setData] = useState([]);
  const [fMaHang, setFMaHang] = useState('');
  const [fNcc, setFNcc] = useState('');
  const [fNhom, setFNhom] = useState('');
  const [fQuay, setFQuay] = useState('');
  const [fTuoi, setFTuoi] = useState('');
  const [fCongLe, setFCongLe] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [fCreatedFrom, setFCreatedFrom] = useState('');
  const [fCreatedTo, setFCreatedTo] = useState('');
  const [sortBy, setSortBy] = useState('id');
  const [sortDir, setSortDir] = useState('asc');
  const [editModal, setEditModal] = useState({ isOpen: false, item: null });
  const [form, setForm] = useState({});
  const [uploading, setUploading] = useState(false);
  const [importingXls, setImportingXls] = useState(false);
  const [infoModal, setInfoModal] = useState(null);
  const [lightbox, setLightbox] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [showNotif, setShowNotif] = useState(false);
  const [pageSize, setPageSize] = useState(100);
  const [page, setPage] = useState(1);
  const [nhomHangList, setNhomHangList] = useState([]);
  const [loaiVangList, setLoaiVangList] = useState([]);
  const [tuoiVangList, setTuoiVangList] = useState([]);
  const [quayNhoList, setQuayNhoList] = useState([]);
  const [actionMenuId, setActionMenuId] = useState(null);
  const [purgeModalOpen, setPurgeModalOpen] = useState(false);
  const [purgePassword, setPurgePassword] = useState('');
  const [purgeError, setPurgeError] = useState('');
  const [purgingAll, setPurgingAll] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [nhapHangModalOpen, setNhapHangModalOpen] = useState(false);
  const importInputRef = useRef(null);
  const SIDEBAR_W = 220;

  const fetchData = async () => {
    try {
      const response = await fetch(`${API}/api/items`);
      const items = await response.json();
      setData(items);
      return items;
    } catch (error) {
      console.error(error);
      return [];
    }
  };

  const loadLookupLists = async () => {
    await Promise.all([
      fetch(`${API}/api/nhom_hang`).then((r) => r.json()).then(setNhomHangList).catch(() => {}),
      fetch(`${API}/api/loai_vang`).then((r) => r.json()).then(setLoaiVangList).catch(() => {}),
      fetch(`${API}/api/tuoi_vang`).then((r) => r.json()).then(setTuoiVangList).catch(() => {}),
      fetch(`${API}/api/quay_nho`).then((r) => r.json()).then(setQuayNhoList).catch(() => {}),
    ]);
  };

  useEffect(() => {
    fetchData();
    loadLookupLists();
  }, []);

  useEffect(() => {
    const handler = (event) => setNotifications((prev) => [event.detail, ...prev].slice(0, 50));
    window.addEventListener('jewelry-notification', handler);
    return () => window.removeEventListener('jewelry-notification', handler);
  }, []);

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (event.target.closest('[data-item-actions-root="true"]')) return;
      setActionMenuId(null);
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  useEffect(() => {
    if (activeTab === 'nhap_vang') {
      setActiveTab('hang_ton');
      setNhapHangModalOpen(true);
    }
  }, [activeTab]);

  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;
  const [_mq, setMq] = useState(isMobile);
  useEffect(() => {
    const mql = window.matchMedia('(max-width: 768px)');
    const handler = (event) => setMq(event.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);
  const onMobile = _mq;

  const openEdit = (item) => {
    setForm({ ...item, images: item.images || [], certificates: item.certificates || [] });
    setEditModal({ isOpen: true, item });
  };

  const uploadImages = async (files) => {
    setUploading(true);
    const uploaded = [];
    for (const file of files) {
      const fd = new FormData();
      fd.append('file', file);
      try {
        const response = await fetch(`${API}/api/upload`, { method: 'POST', body: fd });
        const payload = await response.json();
        uploaded.push({ url: payload.url, name: payload.name });
      } catch (error) {
        console.error(error);
      }
    }
    setForm((prev) => ({ ...prev, images: [...(prev.images || []), ...uploaded] }));
    setUploading(false);
  };

  const removeImage = (idx) => {
    setForm((prev) => ({ ...prev, images: prev.images.filter((_, index) => index !== idx) }));
  };

  const handleImportXls = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setImportingXls(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const response = await fetch(`${API}/api/items/import-xls`, { method: 'POST', body: fd });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || `Import XLS thất bại (HTTP ${response.status}).`);
      }

      await Promise.all([fetchData(), loadLookupLists()]);
      window.alert(
        `Import XLS thành công\n`
        + `Tổng dòng: ${payload.total_rows || 0}\n`
        + `Thêm mới: ${payload.created || 0}\n`
        + `Bỏ qua trùng DB: ${payload.skipped_existing || 0}\n`
        + `Bỏ qua trùng trong file: ${payload.skipped_in_file || 0}\n`
        + `Thêm nhóm hàng: ${payload.added_nhom_hang || 0}\n`
        + `Thêm quầy nhỏ: ${payload.added_quay_nho || 0}\n`
        + `Thêm loại vàng: ${payload.added_loai_vang || 0}\n`
        + `Thêm tuổi vàng: ${payload.added_tuoi_vang || 0}\n`
        + `Cập nhật tuổi vàng cho hàng trùng: ${payload.updated_existing_tuoi_vang || 0}\n`
        + `Tuổi vàng từ file: ${payload.detected_tuoi_vang || ''}`
      );
    } catch (error) {
      console.error(error);
      window.alert(error.message || 'Import XLS thất bại.');
    } finally {
      setImportingXls(false);
    }
  };

  const closePurgeModal = () => {
    if (purgingAll) return;
    setPurgeModalOpen(false);
    setPurgePassword('');
    setPurgeError('');
  };

  const openPurgeModal = () => {
    setActionMenuId(null);
    setPurgePassword('');
    setPurgeError('');
    setPurgeModalOpen(true);
  };

  const handlePurgeAll = async (event) => {
    event.preventDefault();
    if (purgingAll) return;
    setPurgingAll(true);
    setPurgeError('');
    try {
      const response = await fetch(`${API}/api/items/purge_all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: purgePassword }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setPurgeError(payload.error || `Xóa tất cả thất bại (HTTP ${response.status}).`);
        return;
      }
      setPurgeModalOpen(false);
      setPurgePassword('');
      setPurgeError('');
      setPage(1);
      await fetchData();
    } catch (error) {
      console.error(error);
      setPurgeError(error.message || 'Xóa tất cả thất bại.');
    } finally {
      setPurgingAll(false);
    }
  };

  const handleSave = async (event) => {
    event.preventDefault();
    const url = editModal.item ? `${API}/api/items/${editModal.item.id}` : `${API}/api/items`;
    await fetch(url, {
      method: editModal.item ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    setEditModal({ isOpen: false, item: null });
    fetchData();
  };

  const confirmDelete = async (id) => {
    if (!window.confirm('Xác nhận xóa sản phẩm này?')) return;
    await fetch(`${API}/api/items/${id}`, { method: 'DELETE' });
    fetchData();
  };

  const handlePrintCertification = (item) => {
    printItemCertification(item, { title: 'Certification sản phẩm' });
  };

  const nhomList = [...new Set(data.map((item) => item.nhom_hang).filter(Boolean))].sort();
  const quayList = [...new Set(data.map((item) => item.quay_nho).filter(Boolean))].sort();
  const tuoiList = [...new Set(data.map((item) => item.tuoi_vang).filter(Boolean))].sort();
  const statusList = [...new Set(data.map((item) => item.status).filter(Boolean))].sort();
  const createdFromMs = getDateStartMs(fCreatedFrom);
  const createdToMs = getDateEndMs(fCreatedTo);

  const handleSort = (column) => {
    setPage(1);
    if (sortBy === column) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
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
        return [numericOrText(item.cong_le)];
      case 'tong_tl':
        return [numericOrText(item.tong_tl)];
      case 'gia_hien_tai':
        return [Number(item.gia_hien_tai || 0)];
      default:
        return [item.id || 0];
    }
  };

  let filtered = data;
  const fl = (text) => text.toLowerCase();
  if (fMaHang) filtered = filtered.filter((item) => item.ma_hang?.toLowerCase().includes(fl(fMaHang)));
  if (fNcc) filtered = filtered.filter((item) => item.ncc?.toLowerCase().includes(fl(fNcc)));
  if (fNhom) filtered = filtered.filter((item) => item.nhom_hang === fNhom);
  if (fQuay) filtered = filtered.filter((item) => item.quay_nho === fQuay);
  if (fTuoi) filtered = filtered.filter((item) => item.tuoi_vang === fTuoi);
  if (fCongLe) filtered = filtered.filter((item) => item.cong_le?.includes(fCongLe));
  if (fStatus) filtered = filtered.filter((item) => item.status === fStatus);
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

  const hasFilter = fMaHang || fNcc || fNhom || fQuay || fTuoi || fCongLe || fStatus || fCreatedFrom || fCreatedTo;
  const clearAll = () => {
    setFMaHang('');
    setFNcc('');
    setFNhom('');
    setFQuay('');
    setFTuoi('');
    setFCongLe('');
    setFStatus('');
    setFCreatedFrom('');
    setFCreatedTo('');
    setPage(1);
  };

  const totalPages = pageSize === 0 ? 1 : Math.ceil(filtered.length / pageSize);
  const displayed = pageSize === 0 ? filtered : filtered.slice((page - 1) * pageSize, page * pageSize);
  const statTotal = data.length;
  const statTonKho = data.filter((item) => item.status === 'Tồn kho').length;
  const statDaBan = data.filter((item) => item.status === 'Đã bán').length;
  const statLuan = data.filter((item) => item.status === 'Luân chuyển').length;
  const isSaleRoute = pathname === '/sale';

  if (isSaleRoute) {
    return (
      <SalePosMobile
        onClose={() => {
          window.history.pushState({}, '', '/');
          setPathname('/');
        }}
      />
    );
  }

  const activeNavItem = NAV_ITEMS.find((item) => item.key === activeTab) || NAV_ITEMS.find((item) => item.key === 'hang_ton');
  const inventoryWorkspaceProps = {
    actionMenuId,
    clearAll,
    confirmDelete,
    displayed,
    fCongLe,
    fCreatedFrom,
    fCreatedTo,
    fMaHang,
    fNcc,
    fNhom,
    fQuay,
    fStatus,
    fTuoi,
    filtered,
    getSortIcon,
    handlePrintCertification,
    handleSort,
    hasFilter,
    nhomList,
    openEdit,
    page,
    pageSize,
    quayList,
    sortBy,
    setActionMenuId,
    setFCongLe,
    setFCreatedFrom,
    setFCreatedTo,
    setFMaHang,
    setFNcc,
    setFNhom,
    setFQuay,
    setFStatus,
    setFTuoi,
    setInfoModal,
    setPage,
    setPageSize,
    statDaBan,
    statLuan,
    statTonKho,
    statTotal,
    statusList,
    totalPages,
    tuoiList,
  };

  const inventoryModalProps = {
    closePurgeModal,
    editModal,
    form,
    handlePurgeAll,
    handleSave,
    infoModal,
    lightbox,
    loaiVangList,
    nhomHangList,
    purgeError,
    purgeModalOpen,
    purgePassword,
    purgingAll,
    quayNhoList,
    removeImage,
    setEditModal,
    setForm,
    setInfoModal,
    setLightbox,
    setPurgeError,
    setPurgePassword,
    tuoiVangList,
    uploadImages,
    uploading,
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: "'Be Vietnam Pro', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", background: '#f0f4f8' }}>
      <style>{`@media (min-width:769px){.jw-mob-only{display:none!important}}@media (max-width:768px){.jw-sidebar{display:none!important}.jw-main{margin-left:0!important}.jw-topbar{padding:0 12px!important;height:48px!important}.jw-topbar h1{font-size:14px!important}.jw-page{padding:12px!important}table{font-size:11px!important}th,td{padding:6px 8px!important}.jw-stats{grid-template-columns:repeat(2,1fr)!important;gap:8px!important}.jw-form-grid{grid-template-columns:1fr!important}[class*="card"]{padding:10px 12px!important}body{overflow-x:hidden}.jw-main>*:last-child{padding-bottom:90px}}.jw-fab-item{transition:bottom .35s cubic-bezier(.34,1.56,.64,1),opacity .25s ease,transform .3s cubic-bezier(.34,1.56,.64,1)}`}</style>
      <aside className="jw-sidebar" style={{ width: SIDEBAR_W, minWidth: SIDEBAR_W, background: '#1e293b', display: 'flex', flexDirection: 'column', position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 200 }}>
        <div style={{ padding: '24px 20px 20px', borderBottom: '1px solid rgba(255,255,255,.08)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <img src="/logo.png" alt="Logo" style={{ width: 108, height: 108, borderRadius: 18, objectFit: 'contain' }} />
        </div>
        <nav style={{ flex: 1, padding: '12px 10px' }}>
          {NAV_ITEMS.map(({ key, label, icon }) => (
            key.startsWith('divider')
              ? <div key={key} style={{ height: 1, background: 'rgba(255,255,255,.08)', margin: '8px 12px' }} />
              : (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    width: '100%',
                    padding: '10px 12px',
                    marginBottom: 4,
                    borderRadius: 10,
                    border: 'none',
                    cursor: 'pointer',
                    background: activeTab === key ? 'rgba(255,255,255,.12)' : 'transparent',
                    color: activeTab === key ? 'white' : '#94a3b8',
                    fontWeight: activeTab === key ? 700 : 500,
                    fontSize: 14,
                    textAlign: 'left',
                    borderLeft: activeTab === key ? '3px solid #f59e0b' : '3px solid transparent',
                  }}
                >
                  <span style={{ fontSize: 16 }}>{icon}</span>
                  {getNavLabel({ key, label, icon })}
                </button>
              )
          ))}
        </nav>
        <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,.08)', color: '#475569', fontSize: 11 }}>
          {new Date().toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </div>
      </aside>

      <div className="jw-main" style={{ marginLeft: onMobile ? 0 : SIDEBAR_W, flex: 1, display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <header className="jw-topbar" style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '0 28px', height: 56, display: 'flex', alignItems: 'center', gap: 12, position: 'sticky', top: 0, zIndex: 100, boxShadow: '0 1px 4px rgba(0,0,0,.06)' }}>
          <h1 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#1e293b' }}>
            {activeNavItem?.icon} {getNavLabel(activeNavItem)}
          </h1>
          <div style={{ flex: 1 }} />

          {activeTab === 'hang_ton' && (
            <>
              <input ref={importInputRef} type="file" accept=".xls" style={{ display: 'none' }} onChange={handleImportXls} />
              <button onClick={() => importInputRef.current?.click()} disabled={importingXls} style={{ padding: '7px 18px', borderRadius: 8, background: importingXls ? '#94a3b8' : '#f59e0b', color: 'white', fontWeight: 700, border: 'none', cursor: importingXls ? 'wait' : 'pointer', fontSize: 13 }}>
                {importingXls ? 'Đang import...' : 'Import XLS'}
              </button>
              <button onClick={openPurgeModal} style={{ padding: '7px 18px', borderRadius: 8, background: '#dc2626', color: 'white', fontWeight: 700, border: 'none', cursor: 'pointer', fontSize: 13 }}>
                Xóa tất cả
              </button>
              <button onClick={() => setNhapHangModalOpen(true)} style={{ padding: '7px 18px', borderRadius: 8, background: '#2563eb', color: 'white', fontWeight: 700, border: 'none', cursor: 'pointer', fontSize: 13 }}>
                Nhập hàng
              </button>
            </>
          )}

          <div style={{ position: 'relative' }}>
            <button onClick={() => setShowNotif((prev) => !prev)} style={{ position: 'relative', width: 38, height: 38, borderRadius: 10, border: '1.5px solid #e2e8f0', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: notifications.length ? '#f59e0b' : '#94a3b8' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              {notifications.length > 0 && (
                <span style={{ position: 'absolute', top: -5, right: -5, minWidth: 17, height: 17, borderRadius: 9, background: '#dc2626', color: 'white', fontSize: 9, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px' }}>
                  {notifications.length > 99 ? '99+' : notifications.length}
                </span>
              )}
            </button>

            {showNotif && (
              <div style={{ position: 'absolute', top: 44, right: 0, width: 340, background: 'white', borderRadius: 14, boxShadow: '0 8px 32px rgba(0,0,0,.15)', border: '1px solid #e2e8f0', zIndex: 500, overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', background: '#1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'white', fontWeight: 800, fontSize: 13 }}>Thông báo</span>
                  {notifications.length > 0 && (
                    <button onClick={() => setNotifications([])} style={{ background: 'rgba(255,255,255,.15)', border: 'none', color: 'white', fontSize: 11, borderRadius: 6, padding: '3px 8px', cursor: 'pointer' }}>
                      Xóa tất cả
                    </button>
                  )}
                </div>
                <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                  {notifications.length === 0 ? (
                    <div style={{ padding: '20px 16px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                      Không có thông báo nào
                    </div>
                  ) : notifications.map((notification, index) => (
                    <div key={index} style={{ padding: '10px 16px', borderBottom: '1px solid #f1f5f9' }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#1e293b', marginBottom: 3 }}>{notification.title}</div>
                      <div style={{ fontSize: 11, color: '#64748b', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{notification.body}</div>
                      <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>{new Date(notification.date).toLocaleString('vi-VN')}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </header>

        {activeTab === 'cau_hinh'
          ? <CauHinhPage />
          : activeTab === 'don_hang'
            ? <div style={{ padding: '20px 28px' }}><DonHangPage /></div>
            : activeTab === 'thu_ngan'
              ? <ThuNganPage />
              : activeTab === 'nhan_su'
                ? <div style={{ padding: '20px 28px' }}><NhanSuPage /></div>
                : activeTab === 'khach_hang'
                  ? <div style={{ padding: '20px 28px' }}><KhachHangPage /></div>
                  : activeTab === 'doi_tac'
                    ? <div style={{ padding: '20px 28px' }}><DoiTacPage /></div>
                    : activeTab === 'ke_toan'
                      ? <div style={{ padding: '20px 28px' }}><KeToanPage /></div>
                      : activeTab === 'tai_chinh'
                        ? <TaiChinhPage />
                        : activeTab === 'may_can_vang'
                            ? <MayCanVangPage />
                            : activeTab !== 'hang_ton'
                              ? <ComingSoon label={getNavLabel(activeNavItem)} />
                              : <InventoryWorkspace {...inventoryWorkspaceProps} />}

        <InventoryModals {...inventoryModalProps} />
        {nhapHangModalOpen && (
          <div
            onClick={(event) => {
              if (event.target === event.currentTarget) setNhapHangModalOpen(false);
            }}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(15,23,42,.5)',
              zIndex: 1400,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 20,
            }}
          >
            <div style={{ width: 'min(1240px, 100%)', maxHeight: '92vh', background: 'white', borderRadius: 20, boxShadow: '0 24px 64px rgba(15,23,42,.2)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '18px 22px', borderBottom: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: 20, fontWeight: 900, color: '#0f172a' }}>Nhập hàng</div>
                <button onClick={() => setNhapHangModalOpen(false)} style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid #dbe3ef', background: 'white', color: '#64748b', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>
                  ×
                </button>
              </div>
              <div style={{ padding: '20px 22px', overflowY: 'auto' }}>
                <NhapVangPage />
              </div>
            </div>
          </div>
        )}
        <MobileMenu activeTab={activeTab} mobileOpen={mobileOpen} setActiveTab={setActiveTab} setMobileOpen={setMobileOpen} />
      </div>
    </div>
  );
}
