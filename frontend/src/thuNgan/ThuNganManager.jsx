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

export default function ThuNganManager({ onCashiersChanged }) {
  const [khos, setKhos] = useState([]);
  const [thuNgans, setThuNgans] = useState([]);
  const [quays, setQuays] = useState([]);
  const [nhanViens, setNhanViens] = useState([]);
  const [cashierModal, setCashierModal] = useState(null);
  const [cashierConfirm, setCashierConfirm] = useState(null);
  const [cashierForm, setCashierForm] = useState({});
  const [cashierApiReady, setCashierApiReady] = useState(true);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [khoRes, thuNganRes, quayRes, nhanVienRes] = await Promise.all([
        fetch(`${API}/api/kho`),
        fetch(`${API}/api/thu_ngan`),
        fetch(`${API}/api/quay_nho`),
        fetch(`${API}/api/nhan_vien`),
      ]);
      const [khoData, thuNganData, quayData, nhanVienData] = await Promise.all([
        readJsonSafe(khoRes, []),
        readJsonSafe(thuNganRes, []),
        readJsonSafe(quayRes, []),
        readJsonSafe(nhanVienRes, []),
      ]);
      setCashierApiReady(thuNganRes.ok);
      setKhos(Array.isArray(khoData) ? khoData : []);
      setThuNgans(Array.isArray(thuNganData) ? thuNganData : []);
      setQuays(Array.isArray(quayData) ? quayData : []);
      setNhanViens(Array.isArray(nhanVienData) ? nhanVienData : []);
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

  const openAddCashier = useCallback((kho) => {
    setCashierForm({
      ten_thu_ngan: '',
      kho_id: kho.id,
      kho_ten: kho.ten_kho,
      nhan_vien_id: '',
      ghi_chu: '',
      quay_ids: [],
    });
    setCashierModal('add');
  }, []);

  const openEditCashier = useCallback((cashier) => {
    setCashierForm({
      ...cashier,
      kho_ten: cashier.ten_kho,
      nhan_vien_id: cashier.nhan_vien_id || '',
      quay_ids: cashier.quay_ids || cashier.quays?.map((q) => q.id) || [],
    });
    setCashierModal(cashier);
  }, []);

  const saveCashier = async (e) => {
    e.preventDefault();
    try {
      const isEdit = cashierModal !== 'add';
      const payload = {
        ten_thu_ngan: cashierForm.ten_thu_ngan || '',
        kho_id: cashierForm.kho_id,
        nhan_vien_id: cashierForm.nhan_vien_id || null,
        ghi_chu: cashierForm.ghi_chu || '',
        quay_ids: cashierForm.quay_ids || [],
      };
      await readResponse(await fetch(
        isEdit ? `${API}/api/thu_ngan/${cashierModal.id}` : `${API}/api/thu_ngan`,
        { method: isEdit ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) },
      ));
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

              return (
                <div key={kho.id} style={{ borderRadius: 12, border: '1px solid #e2e8f0', background: '#f8fafc', padding: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 14, color: '#0f172a' }}>🏪 {kho.ten_kho}</div>
                      {kho.dia_chi && <div style={{ fontSize: 12, color: '#64748b', marginTop: 3 }}>📍 {kho.dia_chi}</div>}
                      {kho.nguoi_phu_trach && <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>👤 {kho.nguoi_phu_trach}</div>}
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                        <span style={badge('#dbeafe', '#1d4ed8')}>{khoThuNgans.length} thu ngân</span>
                        <span style={badge('#ccfbf1', '#0f766e')}>{khoQuays.length} quầy nhỏ</span>
                      </div>
                    </div>
                    <button type="button" onClick={() => openAddCashier(kho)} style={{ ...saveBtn, padding: '7px 14px', fontSize: 12, whiteSpace: 'nowrap' }}>
                      + Thêm thu ngân
                    </button>
                  </div>

                  {khoThuNgans.length === 0 ? (
                    <div style={{ padding: '10px 12px', borderRadius: 10, background: 'white', border: '1px solid #e2e8f0', color: '#94a3b8', fontSize: 12, fontStyle: 'italic' }}>
                      Chưa có thu ngân nào trong kho này.
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
                      {khoThuNgans.map((cashier) => {
                        const assignedQuays = (cashier.quays || [])
                          .map((item) => quaysById[item.id] || item)
                          .sort(byName('ten_quay'));
                        return (
                          <div key={cashier.id} style={{ background: 'white', borderRadius: 10, border: '1px solid #e2e8f0', padding: 12 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                              <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                  <span style={{ fontWeight: 800, fontSize: 13, color: '#1e293b' }}>👤 {cashier.ten_thu_ngan}</span>
                                  {cashier.nguoi_quan_ly && <span style={badge('#eef2ff', '#4338ca')}>Nhân sự: {cashier.nguoi_quan_ly}</span>}
                                  <span style={badge('#ccfbf1', '#0f766e')}>{assignedQuays.length} quầy nhỏ</span>
                                </div>
                                {cashier.ngay_tao && <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 5 }}>🕐 {cashier.ngay_tao}</div>}
                                {cashier.ghi_chu && <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>💬 {cashier.ghi_chu}</div>}
                              </div>
                              <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                                <button type="button" onClick={() => openEditCashier(cashier)} style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #cbd5e1', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb' }}>
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                                </button>
                                <button type="button" onClick={() => setCashierConfirm(cashier.id)} style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #fca5a5', background: '#fff1f2', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#dc2626' }}>
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>
                                </button>
                              </div>
                            </div>

                            <div style={{ marginTop: 10 }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 6 }}>Quầy nhỏ phụ trách</div>
                              {assignedQuays.length === 0 ? (
                                <div style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic' }}>Chưa được gán quầy nhỏ.</div>
                              ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                  {assignedQuays.map((quay) => (
                                    <div key={quay.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                                      <div>
                                        <div style={{ fontSize: 12, fontWeight: 700, color: '#1e293b' }}>🗂 {quay.ten_quay}</div>
                                        {quay.ghi_chu && <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>{quay.ghi_chu}</div>}
                                      </div>
                                      {quay.nguoi_phu_trach && <div style={{ fontSize: 10, color: '#64748b', whiteSpace: 'nowrap' }}>👤 {quay.nguoi_phu_trach}</div>}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
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
              );
            })}
          </div>
        )}
      </div>

      <Modal open={!!cashierModal} onClose={() => setCashierModal(null)} title={cashierModal === 'add' ? '+ Thêm thu ngân' : 'Sửa thu ngân'} maxWidth={640}>
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
          <Field label="Nhân sự phụ trách">
            <select style={inp} value={cashierForm.nhan_vien_id || ''} onChange={handleCashierStaffChange}>
              <option value="">-- Chọn nhân sự --</option>
              {sortedNhanViens.map((nv) => <option key={nv.id} value={nv.id}>{nv.ho_ten}{nv.chuc_vu ? ` - ${nv.chuc_vu}` : ''}</option>)}
            </select>
          </Field>
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
                  {modalQuays.map((quay) => {
                    const checked = (cashierForm.quay_ids || []).includes(quay.id);
                    const lockedByOther = !!quay.thu_ngan_id && quay.thu_ngan_id !== currentCashierId;
                    return (
                      <label key={quay.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 12px', borderRadius: 9, border: `1px solid ${lockedByOther ? '#fecaca' : checked ? '#bfdbfe' : '#e2e8f0'}`, background: lockedByOther ? '#fff1f2' : checked ? '#eff6ff' : 'white', cursor: lockedByOther ? 'not-allowed' : 'pointer', opacity: lockedByOther ? 0.75 : 1 }}>
                        <input type="checkbox" checked={checked} disabled={lockedByOther} onChange={() => toggleQuay(quay.id)} style={{ marginTop: 2 }} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: '#1e293b' }}>🗂 {quay.ten_quay}</div>
                          <div style={{ fontSize: 10, color: lockedByOther ? '#dc2626' : '#64748b', marginTop: 3 }}>
                            {lockedByOther ? `Đang thuộc ${quay.ten_thu_ngan}` : checked ? 'Đang gán cho thu ngân này' : 'Chưa gán thu ngân'}
                          </div>
                          {quay.nguoi_phu_trach && <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>Nhân sự quầy: {quay.nguoi_phu_trach}</div>}
                        </div>
                      </label>
                    );
                  })}
                </div>
              )
            ) : (
              <div style={{ padding: '10px 12px', borderRadius: 8, background: '#f8fafc', border: '1px solid #e2e8f0', color: '#94a3b8', fontSize: 12 }}>
                Chọn kho trước để gán quầy nhỏ cho thu ngân.
              </div>
            )}
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
