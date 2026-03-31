import { useEffect, useMemo, useState } from 'react';
import { API, BtnRow, ConfirmModal, Field, Modal, byName, inp, readJsonSafe, readResponse, saveBtn } from './shared';

export default function KhoTab() {
  const [list, setList] = useState([]);
  const [quays, setQuays] = useState([]);
  const [modal, setModal] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [form, setForm] = useState({});

  const load = async () => {
    const [khoRes, quayRes] = await Promise.all([
      fetch(`${API}/api/kho`),
      fetch(`${API}/api/quay_nho`),
    ]);
    const [khoData, quayData] = await Promise.all([
      readJsonSafe(khoRes, []),
      readJsonSafe(quayRes, []),
    ]);
    setList(Array.isArray(khoData) ? khoData : []);
    setQuays(Array.isArray(quayData) ? quayData : []);
  };

  useEffect(() => {
    let cancelled = false;
    const fetchAll = async () => {
      const [khoRes, quayRes] = await Promise.all([
        fetch(`${API}/api/kho`),
        fetch(`${API}/api/quay_nho`),
      ]);
      const [khoData, quayData] = await Promise.all([
        readJsonSafe(khoRes, []),
        readJsonSafe(quayRes, []),
      ]);
      if (cancelled) return;
      setList(Array.isArray(khoData) ? khoData : []);
      setQuays(Array.isArray(quayData) ? quayData : []);
    };
    fetchAll().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const sortedKhos = useMemo(() => [...list].sort(byName('ten_kho')), [list]);

  const save = async (e) => {
    e.preventDefault();
    try {
      const isEdit = modal !== 'add';
      await readResponse(await fetch(
        isEdit ? `${API}/api/kho/${modal.id}` : `${API}/api/kho`,
        { method: isEdit ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) },
      ));
      setModal(null);
      await load();
    } catch (err) {
      window.alert(err.message);
    }
  };

  return (
    <>
      <div style={{ marginBottom: 14, padding: '12px 14px', borderRadius: 12, border: '1px solid #dbeafe', background: '#eff6ff', color: '#1d4ed8', fontSize: 12, lineHeight: 1.6 }}>
        Phần <b>quản lý thu ngân</b> đã được chuyển sang tab <b>Thu Ngân</b>. Tab này chỉ còn quản lý thông tin kho và danh sách quầy nhỏ thuộc từng kho.
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
        <button
          onClick={() => {
            setForm({ ten_kho: '', dia_chi: '', ghi_chu: '', nguoi_phu_trach: '' });
            setModal('add');
          }}
          style={{ ...saveBtn, padding: '8px 18px', whiteSpace: 'nowrap' }}
        >
          + Thêm kho
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 14 }}>
        {sortedKhos.map((kho) => {
          const khoQuays = [...quays].filter((q) => q.kho_id === kho.id).sort(byName('ten_quay'));
          return (
            <div key={kho.id} style={{ background: 'white', borderRadius: 12, border: '1px solid #e2e8f0', padding: 18, boxShadow: '0 1px 4px rgba(0,0,0,.04)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 15, color: '#1e293b' }}>🏪 {kho.ten_kho}</div>
                  {kho.dia_chi && <div style={{ fontSize: 12, color: '#64748b', marginTop: 3 }}>📍 {kho.dia_chi}</div>}
                  {kho.nguoi_phu_trach && <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>👤 {kho.nguoi_phu_trach}</div>}
                  {kho.ngay_tao && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>🕐 {kho.ngay_tao}</div>}
                  {kho.ghi_chu && <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>💬 {kho.ghi_chu}</div>}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
                    <span style={{ fontSize: 11, color: '#0f766e', background: '#ccfbf1', borderRadius: 999, padding: '3px 9px', fontWeight: 700 }}>
                      {khoQuays.length} quầy nhỏ
                    </span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button onClick={() => { setForm({ ...kho }); setModal(kho); }} style={{ width: 30, height: 30, borderRadius: 7, border: '1px solid #cbd5e1', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb' }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                  </button>
                  <button onClick={() => setConfirm(kho.id)} style={{ width: 30, height: 30, borderRadius: 7, border: '1px solid #fca5a5', background: '#fff1f2', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#dc2626' }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>
                  </button>
                </div>
              </div>

              <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px dashed #e2e8f0' }}>
                <div style={{ fontWeight: 800, fontSize: 13, color: '#334155', marginBottom: 8 }}>Quầy nhỏ thuộc kho này</div>
                {khoQuays.length === 0 ? (
                  <div style={{ padding: '10px 12px', borderRadius: 10, background: '#f8fafc', border: '1px solid #e2e8f0', color: '#94a3b8', fontSize: 12, fontStyle: 'italic' }}>
                    Chưa có quầy nhỏ nào trong kho này.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {khoQuays.map((quay) => (
                      <span key={quay.id} style={{ fontSize: 11, color: '#0f766e', background: '#ecfeff', borderRadius: 999, padding: '4px 9px', fontWeight: 700 }}>
                        {quay.ten_quay}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal === 'add' ? '+ Thêm kho' : '✏️ Sửa kho'}>
        <form onSubmit={save}>
          <Field label="Tên kho *"><input required style={inp} value={form.ten_kho || ''} onChange={(e) => setForm({ ...form, ten_kho: e.target.value })} /></Field>
          <Field label="Địa chỉ"><input style={inp} value={form.dia_chi || ''} onChange={(e) => setForm({ ...form, dia_chi: e.target.value })} /></Field>
          <Field label="Người phụ trách"><input style={inp} placeholder="VD: Nguyễn Văn A" value={form.nguoi_phu_trach || ''} onChange={(e) => setForm({ ...form, nguoi_phu_trach: e.target.value })} /></Field>
          <Field label="Ghi chú"><textarea style={{ ...inp, height: 72, resize: 'vertical' }} value={form.ghi_chu || ''} onChange={(e) => setForm({ ...form, ghi_chu: e.target.value })} /></Field>
          <BtnRow onClose={() => setModal(null)} label={modal === 'add' ? 'Tạo mới' : 'Lưu thay đổi'} />
        </form>
      </Modal>

      <ConfirmModal
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        onConfirm={async () => {
          await fetch(`${API}/api/kho/${confirm}`, { method: 'DELETE' });
          await load();
        }}
        message="Xác nhận xóa kho này?"
      />
    </>
  );
}
