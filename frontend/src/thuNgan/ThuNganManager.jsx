import { useCallback, useEffect, useMemo, useState } from 'react';
import { BtnRow, ConfirmModal, Field, Modal, API, byName, inp, readJsonSafe, readResponse, saveBtn } from '../cauhinh/shared';
import { panelStyle } from './utils';

const badge = (bg, color) => ({
  fontSize: 11,
  color,
  background: bg,
  borderRadius: 999,
  padding: '3px 9px',
  fontWeight: 700,
});

// Lấy ngày hiện tại dạng YYYY-MM-DD
function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function parseMoney(val) {
  const n = parseFloat(String(val || '').replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
}

export default function ThuNganManager({ onCashiersChanged }) {
  const [khos, setKhos] = useState([]);
  const [thuNgans, setThuNgans] = useState([]);
  const [quays, setQuays] = useState([]);
  const [nhanViens, setNhanViens] = useState([]);
  const [tuoiVangs, setTuoiVangs] = useState([]);
  const [cashierModal, setCashierModal] = useState(null);
  const [cashierConfirm, setCashierConfirm] = useState(null);
  const [cashierForm, setCashierForm] = useState({});
  const [cashierApiReady, setCashierApiReady] = useState(true);
  const [loading, setLoading] = useState(false);
  const [expandedCashiers, setExpandedCashiers] = useState({});
  const [expandedKhos, setExpandedKhos] = useState({});

  const toggleCashierExpand = useCallback((cashierId) => {
    setExpandedCashiers((prev) => ({ ...prev, [cashierId]: !prev[cashierId] }));
  }, []);

  const toggleKhoExpand = useCallback((khoId) => {
    setExpandedKhos((prev) => ({ ...prev, [khoId]: !prev[khoId] }));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [khoRes, thuNganRes, quayRes, nhanVienRes, tuoiVangRes] = await Promise.all([
        fetch(`${API}/api/kho`),
        fetch(`${API}/api/thu_ngan`),
        fetch(`${API}/api/quay_nho`),
        fetch(`${API}/api/nhan_vien`),
        fetch(`${API}/api/tuoi_vang`),
      ]);
      const [khoData, thuNganData, quayData, nhanVienData, tuoiVangData] = await Promise.all([
        readJsonSafe(khoRes, []),
        readJsonSafe(thuNganRes, []),
        readJsonSafe(quayRes, []),
        readJsonSafe(nhanVienRes, []),
        readJsonSafe(tuoiVangRes, []),
      ]);
      setCashierApiReady(thuNganRes.ok);
      setKhos(Array.isArray(khoData) ? khoData : []);
      setThuNgans(Array.isArray(thuNganData) ? thuNganData : []);
      setQuays(Array.isArray(quayData) ? quayData : []);
      setNhanViens(Array.isArray(nhanVienData) ? nhanVienData : []);
      setTuoiVangs(Array.isArray(tuoiVangData) ? tuoiVangData : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  const notifyChanged = useCallback(async () => {
    await load();
    if (onCashiersChanged) {
      await onCashiersChanged();
    }
  }, [load, onCashiersChanged]);

  // Khi mở modal add/edit: load chi_tiet tồn đầu kỳ của thu ngân từ API (nếu edit)
  const openAddCashier = useCallback((kho) => {
    setCashierForm({
      ten_thu_ngan: '',
      kho_id: kho.id,
      kho_ten: kho.ten_kho,
      nhan_vien_id: '',
      password: '',
      confirm_password: '',
      ghi_chu: '',
      quay_ids: [],
      ton_dau_ky_tien_mat: '',
      ton_dau_ky_map: {},  // { ten_tuoi: value }
    });
    setCashierModal('add');
  }, []);

  const openEditCashier = useCallback(async (cashier) => {
    // Load tồn đầu kỳ hiện tại của ngày hôm nay cho thu ngân này
    let tonDauKyMap = {};
    let tonDauKyTienMat = '';
    try {
      const res = await fetch(`${API}/api/thu_ngan_so_quy?ngay=${todayIso()}`);
      if (res.ok) {
        const data = await res.json();
        const row = (data.rows || []).find((r) => r.thu_ngan_id === cashier.id);
        if (row) {
          tonDauKyTienMat = (row.so_tien_dau_ngay || 0).toString();
          // Parse chi_tiet -> map tuoi_vang => ton_dau_ky
          for (const item of row.chi_tiet || []) {
            if (item.tuoi_vang) {
              tonDauKyMap[item.tuoi_vang] = (item.ton_dau_ky || 0).toString();
            }
          }
        }
      }
    } catch (_) { /* bỏ qua lỗi mạng */ }

    setCashierForm({
      ...cashier,
      kho_ten: cashier.ten_kho,
      nhan_vien_id: cashier.nhan_vien_id || '',
      quay_ids: cashier.quay_ids || cashier.quays?.map((q) => q.id) || [],
      password: '',
      confirm_password: '',
      ton_dau_ky_tien_mat: tonDauKyTienMat,
      ton_dau_ky_map: tonDauKyMap,
    });
    setCashierModal(cashier);
  }, []);

  const saveCashier = async (e) => {
    e.preventDefault();
    try {
      const isEdit = cashierModal !== 'add';
      const password = String(cashierForm.password || '');
      const confirmPassword = String(cashierForm.confirm_password || '');
      if (password && password.length < 4) {
        throw new Error('Mật khẩu thu ngân phải có ít nhất 4 ký tự.');
      }
      if (password && password !== confirmPassword) {
        throw new Error('Mật khẩu nhập lại không khớp.');
      }
      const payload = {
        ten_thu_ngan: cashierForm.ten_thu_ngan || '',
        kho_id: cashierForm.kho_id,
        nhan_vien_id: cashierForm.nhan_vien_id || null,
        ghi_chu: cashierForm.ghi_chu || '',
        quay_ids: cashierForm.quay_ids || [],
      };
      if (password) {
        payload.password = password;
        payload.confirm_password = confirmPassword;
      }
      const savedRes = await readResponse(await fetch(
        isEdit ? `${API}/api/thu_ngan/${cashierModal.id}` : `${API}/api/thu_ngan`,
        { method: isEdit ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) },
      ));

      // Lưu tồn đầu kỳ vào sổ quỹ ngày hôm nay
      const thuNganId = isEdit ? cashierModal.id : (savedRes?.id);
      if (thuNganId) {
        const tonMap = cashierForm.ton_dau_ky_map || {};
        const chiTiet = tuoiVangs
          .filter((tv) => tonMap[tv.ten_tuoi] !== undefined && parseMoney(tonMap[tv.ten_tuoi]) !== 0)
          .map((tv) => ({
            tuoi_vang: tv.ten_tuoi,
            ton_dau_ky: parseMoney(tonMap[tv.ten_tuoi]),
            so_du_hien_tai: parseMoney(tonMap[tv.ten_tuoi]),
            gia_tri_lech: 0,
          }));
        // Nếu có tiền mặt, thêm vào
        const tienMat = parseMoney(cashierForm.ton_dau_ky_tien_mat);
        if (tienMat !== 0) {
          chiTiet.unshift({
            tuoi_vang: 'Tiền mặt',
            ton_dau_ky: tienMat,
            so_du_hien_tai: tienMat,
            gia_tri_lech: 0,
          });
        }
        if (chiTiet.length > 0) {
          try {
            await fetch(`${API}/api/thu_ngan_so_quy`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                ngay: todayIso(),
                thu_ngan_id: thuNganId,
                chi_tiet: chiTiet,
              }),
            });
          } catch (_) { /* bỏ qua lỗi sổ quỹ */ }
        }
      }

      setCashierModal(null);
      await notifyChanged();
    } catch (err) {
      window.alert(err.message);
    }
  };

  const toggleQuay = useCallback((quayId) => {
    setCashierForm((prev) => {
      const current = prev.quay_ids || [];
      return {
        ...prev,
        quay_ids: current.includes(quayId)
          ? current.filter((id) => id !== quayId)
          : [...current, quayId],
      };
    });
  }, []);

  const currentCashierId = cashierModal && cashierModal !== 'add' ? cashierModal.id : null;
  const quaysById = useMemo(() => Object.fromEntries(quays.map((q) => [q.id, q])), [quays]);
  const sortedNhanViens = useMemo(() => [...nhanViens].sort(byName('ho_ten')), [nhanViens]);
  const sortedKhos = useMemo(() => [...khos].sort(byName('ten_kho')), [khos]);
  const sortedTuoiVangs = useMemo(() => [...tuoiVangs].sort(byName('ten_tuoi')), [tuoiVangs]);
  const modalQuays = useMemo(() => (
    [...quays]
      .filter((q) => q.kho_id === cashierForm.kho_id)
      .sort(byName('ten_quay'))
  ), [cashierForm.kho_id, quays]);

  const handleCashierKhoChange = (e) => {
    const nextKhoId = e.target.value ? Number(e.target.value) : '';
    const nextKho = sortedKhos.find((kho) => kho.id === nextKhoId);
    setCashierForm((prev) => ({
      ...prev,
      kho_id: nextKhoId,
      kho_ten: nextKho?.ten_kho || '',
      quay_ids: (prev.quay_ids || []).filter((id) => quaysById[id]?.kho_id === nextKhoId),
    }));
  };

  const handleCashierStaffChange = (e) => {
    const nextStaffId = e.target.value ? Number(e.target.value) : '';
    const selectedStaff = sortedNhanViens.find((nv) => nv.id === nextStaffId);
    setCashierForm((prev) => ({
      ...prev,
      nhan_vien_id: nextStaffId,
      ten_thu_ngan: prev.ten_thu_ngan || selectedStaff?.ho_ten || '',
    }));
  };

  const setTonDauKy = (key, val) => {
    setCashierForm((prev) => ({
      ...prev,
      ton_dau_ky_map: { ...(prev.ton_dau_ky_map || {}), [key]: val },
    }));
  };

  const inpSmall = { ...inp, padding: '5px 8px', fontSize: 12 };

  return (
    <>
      {!cashierApiReady && (
        <div style={{ marginBottom: 14, padding: '12px 14px', borderRadius: 12, border: '1px solid #fed7aa', background: '#fff7ed', color: '#9a3412', fontSize: 12, lineHeight: 1.6 }}>
          API <b>Thu ngân</b> trên backend hiện tại chưa sẵn sàng. Danh sách <b>quầy nhỏ</b> vẫn được tải bình thường, nhưng để gán đúng thu ngân bạn cần chạy backend mới hoặc trỏ `VITE_API_BASE_URL` về server đã cập nhật.
        </div>
      )}

      <div style={{ ...panelStyle, padding: 18, marginBottom: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>Quản lý thu ngân theo kho</div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 4, lineHeight: 1.6 }}>
              Mỗi quầy nhỏ chỉ thuộc về 1 thu ngân, nhưng một thu ngân có thể phụ trách nhiều quầy nhỏ.
            </div>
          </div>
          <div style={{ fontSize: 12, color: '#64748b' }}>{thuNgans.length} thu ngân · {quays.length} quầy nhỏ</div>
        </div>

        {loading ? (
          <div style={{ padding: '12px 0', color: '#94a3b8', fontSize: 12 }}>Đang tải danh sách thu ngân...</div>
        ) : sortedKhos.length === 0 ? (
          <div style={{ padding: '12px 0', color: '#94a3b8', fontSize: 12 }}>Chưa có kho nào. Hãy tạo kho trong tab Cài Đặt trước.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 14 }}>
            {sortedKhos.map((kho) => {
              const khoThuNgans = [...thuNgans].filter((item) => item.kho_id === kho.id).sort(byName('ten_thu_ngan'));
              const khoQuays = [...quays].filter((item) => item.kho_id === kho.id).sort(byName('ten_quay'));
              const unassignedQuays = khoQuays.filter((item) => !item.thu_ngan_id);

              const isKhoExpanded = !!expandedKhos[kho.id];

              return (
                <div key={kho.id} style={{ borderRadius: 12, border: '1px solid #e2e8f0', background: '#f8fafc', overflow: 'hidden' }}>
                  {/* Kho header — click để toggle */}
                  <div
                    onClick={() => toggleKhoExpand(kho.id)}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: 16, cursor: 'pointer', userSelect: 'none' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', minWidth: 0 }}>
                      <svg
                        width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94a3b8"
                        strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                        style={{ flexShrink: 0, transition: 'transform 0.2s', transform: isKhoExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: 14, color: '#0f172a' }}>🏪 {kho.ten_kho}</div>
                        {kho.dia_chi && <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>📍 {kho.dia_chi}</div>}
                        {kho.nguoi_phu_trach && <div style={{ fontSize: 12, color: '#64748b', marginTop: 1 }}>👤 {kho.nguoi_phu_trach}</div>}
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <span style={badge('#dbeafe', '#1d4ed8')}>{khoThuNgans.length} thu ngân</span>
                        <span style={badge('#ccfbf1', '#0f766e')}>{khoQuays.length} quầy nhỏ</span>
                        {unassignedQuays.length > 0 && (
                          <span style={badge('#ffedd5', '#9a3412')}>{unassignedQuays.length} chưa gán</span>
                        )}
                      </div>
                    </div>
                    <div onClick={(e) => e.stopPropagation()}>
                      <button type="button" onClick={() => openAddCashier(kho)} style={{ ...saveBtn, padding: '7px 14px', fontSize: 12, whiteSpace: 'nowrap' }}>
                        + Thêm thu ngân
                      </button>
                    </div>
                  </div>

                  {/* Collapsible kho body */}
                  {isKhoExpanded && (
                    <div style={{ padding: '0 16px 16px', borderTop: '1px solid #e2e8f0' }}>
                  {khoThuNgans.length === 0 ? (
                    <div style={{ padding: '10px 12px', borderRadius: 10, background: 'white', border: '1px solid #e2e8f0', color: '#94a3b8', fontSize: 12, fontStyle: 'italic', marginTop: 12 }}>
                      Chưa có thu ngân nào trong kho này.
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
                      {khoThuNgans.map((cashier) => {
                        const assignedQuays = (cashier.quays || [])
                          .map((item) => quaysById[item.id] || item)
                          .sort(byName('ten_quay'));
                        const isExpanded = !!expandedCashiers[cashier.id];
                        return (
                          <div key={cashier.id} style={{ background: 'white', borderRadius: 10, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                            {/* Header — click để toggle */}
                            <div
                              onClick={() => toggleCashierExpand(cashier.id)}
                              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: 12, cursor: 'pointer', userSelect: 'none' }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minWidth: 0 }}>
                                {/* Chevron icon */}
                                <svg
                                  width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8"
                                  strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                                  style={{ flexShrink: 0, transition: 'transform 0.2s', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
                                >
                                  <polyline points="6 9 12 15 18 9" />
                                </svg>
                                <span style={{ fontWeight: 800, fontSize: 13, color: '#1e293b' }}>👤 {cashier.ten_thu_ngan}</span>
                                {cashier.nguoi_quan_ly && <span style={badge('#eef2ff', '#4338ca')}>Nhân sự: {cashier.nguoi_quan_ly}</span>}
                                <span style={badge('#ccfbf1', '#0f766e')}>{assignedQuays.length} quầy nhỏ</span>
                                {cashier.ngay_tao && <span style={{ fontSize: 10, color: '#94a3b8' }}>🕐 {cashier.ngay_tao}</span>}
                                <span style={badge(cashier.has_password ? '#dcfce7' : '#fef3c7', cashier.has_password ? '#166534' : '#92400e')}>
                                  {cashier.has_password ? 'Đã có mật khẩu' : 'Chưa có mật khẩu'}
                                </span>
                              </div>
                              <div
                                style={{ display: 'flex', gap: 5, flexShrink: 0 }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button type="button" onClick={() => openEditCashier(cashier)} style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #cbd5e1', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb' }}>
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                                </button>
                                <button type="button" onClick={() => setCashierConfirm(cashier.id)} style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #fca5a5', background: '#fff1f2', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#dc2626' }}>
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>
                                </button>
                              </div>
                            </div>

                            {/* Collapsible body */}
                            {isExpanded && (
                              <div style={{ padding: '0 12px 12px', borderTop: '1px solid #f1f5f9' }}>
                                {cashier.ghi_chu && <div style={{ fontSize: 11, color: '#64748b', margin: '8px 0 6px' }}>💬 {cashier.ghi_chu}</div>}
                                {/* Quầy nhỏ phụ trách — 3 cột */}
                                <div style={{ marginTop: 10 }}>
                                  <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 6 }}>Quầy nhỏ phụ trách</div>
                                  {assignedQuays.length === 0 ? (
                                    <div style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic' }}>Chưa được gán quầy nhỏ.</div>
                                  ) : (
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 5 }}>
                                      {assignedQuays.map((quay) => (
                                        <div key={quay.id} style={{ padding: '6px 8px', borderRadius: 7, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                                          <div style={{ fontSize: 11, fontWeight: 700, color: '#1e293b' }}>🗂 {quay.ten_quay}</div>
                                          {quay.ghi_chu && <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>{quay.ghi_chu}</div>}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                   )}

                  {unassignedQuays.length > 0 && (
                    <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 10, background: '#fff7ed', border: '1px solid #fed7aa' }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: '#9a3412', marginBottom: 6 }}>Quầy nhỏ chưa giao thu ngân</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {unassignedQuays.map((quay) => (
                          <span key={quay.id} style={{ fontSize: 11, color: '#9a3412', background: '#ffedd5', borderRadius: 999, padding: '4px 9px', fontWeight: 700 }}>
                            {quay.ten_quay}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Modal open={!!cashierModal} onClose={() => setCashierModal(null)} title={cashierModal === 'add' ? '+ Thêm thu ngân' : 'Sửa thu ngân'} maxWidth={680}>
        <form onSubmit={saveCashier}>
          <Field label="Tên thu ngân *">
            <input required style={inp} value={cashierForm.ten_thu_ngan || ''} onChange={(e) => setCashierForm({ ...cashierForm, ten_thu_ngan: e.target.value })} />
          </Field>
          <Field label="Thuộc kho *">
            <select required style={inp} value={cashierForm.kho_id || ''} onChange={handleCashierKhoChange}>
              <option value="">-- Chọn kho --</option>
              {sortedKhos.map((kho) => <option key={kho.id} value={kho.id}>{kho.ten_kho}</option>)}
            </select>
          </Field>
          <Field label="Mật khẩu đăng nhập">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input
                type="password"
                autoComplete="new-password"
                style={inp}
                placeholder={cashierModal === 'add' ? 'Nhập mật khẩu cho user thu ngân' : 'Để trống nếu không đổi mật khẩu'}
                value={cashierForm.password || ''}
                onChange={(e) => setCashierForm({ ...cashierForm, password: e.target.value })}
              />
              <input
                type="password"
                autoComplete="new-password"
                style={inp}
                placeholder="Nhập lại mật khẩu"
                value={cashierForm.confirm_password || ''}
                onChange={(e) => setCashierForm({ ...cashierForm, confirm_password: e.target.value })}
              />
              <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.5 }}>
                Tên thu ngân hiện được dùng như user đăng nhập. Mật khẩu tối thiểu 4 ký tự.
                {cashierModal !== 'add' ? ` ${cashierModal?.has_password ? 'Để trống nếu giữ nguyên mật khẩu hiện tại.' : 'Thu ngân này hiện chưa có mật khẩu.'}` : ''}
              </div>
            </div>
          </Field>
          <Field label="Nhân sự phụ trách">
            <select style={inp} value={cashierForm.nhan_vien_id || ''} onChange={handleCashierStaffChange}>
              <option value="">-- Chọn nhân sự --</option>
              {sortedNhanViens.map((nv) => <option key={nv.id} value={nv.id}>{nv.ho_ten}{nv.chuc_vu ? ` - ${nv.chuc_vu}` : ''}</option>)}
            </select>
          </Field>

          {/* Quầy nhỏ — 3 cột trong modal */}
          <Field label="Quầy nhỏ phụ trách">
            {cashierForm.kho_id ? (
              modalQuays.length === 0 ? (
                <div style={{ padding: '10px 12px', borderRadius: 8, background: '#f8fafc', border: '1px solid #e2e8f0', color: '#94a3b8', fontSize: 12 }}>
                  Kho này chưa có quầy nhỏ để phân công.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.5 }}>
                    Chọn được nhiều quầy nhỏ. Mỗi quầy nhỏ chỉ được gán cho đúng 1 thu ngân.
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 7 }}>
                    {modalQuays.map((quay) => {
                      const checked = (cashierForm.quay_ids || []).includes(quay.id);
                      const lockedByOther = !!quay.thu_ngan_id && quay.thu_ngan_id !== currentCashierId;
                      return (
                        <label key={quay.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '8px 10px', borderRadius: 8, border: `1px solid ${lockedByOther ? '#fecaca' : checked ? '#bfdbfe' : '#e2e8f0'}`, background: lockedByOther ? '#fff1f2' : checked ? '#eff6ff' : 'white', cursor: lockedByOther ? 'not-allowed' : 'pointer', opacity: lockedByOther ? 0.75 : 1 }}>
                          <input type="checkbox" checked={checked} disabled={lockedByOther} onChange={() => toggleQuay(quay.id)} style={{ marginTop: 2, flexShrink: 0 }} />
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#1e293b' }}>🗂 {quay.ten_quay}</div>
                            <div style={{ fontSize: 10, color: lockedByOther ? '#dc2626' : '#64748b', marginTop: 2 }}>
                              {lockedByOther ? `Thuộc ${quay.ten_thu_ngan}` : checked ? 'Đang gán' : 'Chưa gán'}
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )
            ) : (
              <div style={{ padding: '10px 12px', borderRadius: 8, background: '#f8fafc', border: '1px solid #e2e8f0', color: '#94a3b8', fontSize: 12 }}>
                Chọn kho trước để gán quầy nhỏ cho thu ngân.
              </div>
            )}
          </Field>

          {/* Tồn đầu kỳ */}
          <Field label="Tồn đầu kỳ hôm nay">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.5 }}>
                Nhập số dư đầu kỳ cho ngày hôm nay ({todayIso()}). Giá trị tính bằng <b>triệu đồng</b>.
              </div>
              {/* Tiền mặt */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 9, background: '#fefce8', border: '1px solid #fde68a' }}>
                <span style={{ fontSize: 16 }}>💵</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#92400e', marginBottom: 3 }}>Tiền mặt</div>
                  <input
                    type="number"
                    step="any"
                    placeholder="0"
                    style={{ ...inpSmall, width: '100%', boxSizing: 'border-box' }}
                    value={cashierForm.ton_dau_ky_tien_mat || ''}
                    onChange={(e) => setCashierForm((prev) => ({ ...prev, ton_dau_ky_tien_mat: e.target.value }))}
                  />
                </div>
              </div>
              {/* Theo tuổi vàng */}
              {sortedTuoiVangs.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 7 }}>
                  {sortedTuoiVangs.map((tv) => (
                    <div key={tv.id} style={{ padding: '8px 10px', borderRadius: 9, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>🥇 {tv.ten_tuoi}</div>
                      <input
                        type="number"
                        step="any"
                        placeholder="0"
                        style={{ ...inpSmall, width: '100%', boxSizing: 'border-box' }}
                        value={(cashierForm.ton_dau_ky_map || {})[tv.ten_tuoi] || ''}
                        onChange={(e) => setTonDauKy(tv.ten_tuoi, e.target.value)}
                      />
                    </div>
                  ))}
                </div>
              )}
              {sortedTuoiVangs.length === 0 && (
                <div style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic' }}>
                  Chưa có tuổi vàng nào. Hãy thêm trong tab Cài Đặt → Tuổi vàng.
                </div>
              )}
            </div>
          </Field>

          <Field label="Ghi chú">
            <textarea style={{ ...inp, height: 72, resize: 'vertical' }} value={cashierForm.ghi_chu || ''} onChange={(e) => setCashierForm({ ...cashierForm, ghi_chu: e.target.value })} />
          </Field>
          <BtnRow onClose={() => setCashierModal(null)} label={cashierModal === 'add' ? 'Tạo mới' : 'Lưu thay đổi'} />
        </form>
      </Modal>

      <ConfirmModal
        open={cashierConfirm !== null}
        onClose={() => setCashierConfirm(null)}
        onConfirm={async () => {
          await fetch(`${API}/api/thu_ngan/${cashierConfirm}`, { method: 'DELETE' });
          await notifyChanged();
        }}
        message="Xóa thu ngân này? Các quầy nhỏ đang gán sẽ được trả về trạng thái chưa phân công."
      />
    </>
  );
}
