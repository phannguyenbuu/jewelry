import { API } from './shared';

export default function InventoryModals({
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
}) {
  return (
    <>
      {/* ─── MODAL ─── */}
      {purgeModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1400, padding: 20 }}>
          <div style={{ background: 'white', borderRadius: 16, width: '100%', maxWidth: 420, boxShadow: '0 24px 60px rgba(0,0,0,.2)', overflow: 'hidden' }}>
            <div style={{ padding: '16px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#991b1b' }}>
              <h2 style={{ color: 'white', margin: 0, fontSize: 15, fontWeight: 800 }}>Xóa tất cả sản phẩm</h2>
              <button onClick={closePurgeModal} disabled={purgingAll} style={{ background: 'transparent', border: 'none', color: 'white', fontSize: 22, cursor: purgingAll ? 'default' : 'pointer', lineHeight: 1, opacity: purgingAll ? 0.6 : 1 }}>&times;</button>
            </div>
            <form onSubmit={handlePurgeAll} style={{ padding: 22 }}>
              <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.6, marginBottom: 14 }}>
                Nhập mật khẩu để xóa trống toàn bộ danh sách sản phẩm. Hành động này không hoàn tác.
              </div>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 6 }}>Mật khẩu xác nhận</label>
              <input
                type="password"
                value={purgePassword}
                onChange={(e) => { setPurgePassword(e.target.value); if (purgeError) setPurgeError(''); }}
                autoFocus
                autoComplete="current-password"
                placeholder="Nhập mật khẩu"
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: `1.5px solid ${purgeError ? '#fca5a5' : '#e2e8f0'}`, outline: 'none', fontSize: 13, boxSizing: 'border-box' }}
              />
              {purgeError && (
                <div style={{ marginTop: 8, fontSize: 12, color: '#dc2626', fontWeight: 600 }}>
                  {purgeError}
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
                <button type="button" onClick={closePurgeModal} disabled={purgingAll}
                  style={{ padding: '9px 20px', borderRadius: 8, border: '1.5px solid #cbd5e1', background: 'white', fontWeight: 700, cursor: purgingAll ? 'default' : 'pointer', fontSize: 13, opacity: purgingAll ? 0.7 : 1 }}>
                  Hủy
                </button>
                <button type="submit" disabled={purgingAll}
                  style={{ padding: '9px 22px', borderRadius: 8, border: 'none', background: purgingAll ? '#fca5a5' : '#dc2626', color: 'white', fontWeight: 800, cursor: purgingAll ? 'wait' : 'pointer', fontSize: 13 }}>
                  {purgingAll ? 'Đang xóa...' : 'Xác nhận xóa'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {editModal.isOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div style={{ background: 'white', borderRadius: 16, width: '100%', maxWidth: 740, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 24px 60px rgba(0,0,0,.2)' }}>
            <div style={{ padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#1e293b', borderRadius: '16px 16px 0 0' }}>
              <h2 style={{ color: 'white', margin: 0, fontSize: 15, fontWeight: 800 }}>{editModal.item ? '✏️ Chỉnh sửa sản phẩm' : '+ Thêm sản phẩm mới'}</h2>
              <button onClick={() => setEditModal({ isOpen: false, item: null })} style={{ background: 'transparent', border: 'none', color: 'white', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>&times;</button>
            </div>
            <form onSubmit={handleSave} style={{ padding: 24 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '3fr 3fr 1fr', gap: 18, alignItems: 'start' }}>
                <div style={{ gridColumn: '1 / span 2', minWidth: 0 }}>

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
                </div>

                <div style={{ borderLeft: '1px solid #f1f5f9', paddingLeft: 18, minWidth: 0 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 10, letterSpacing: .4 }}>HÌNH ẢNH SẢN PHẨM</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <label
                      style={{ width: '100%', minHeight: 96, borderRadius: 12, border: '2px dashed #cbd5e1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: uploading ? 'wait' : 'pointer', background: uploading ? '#f8fafc' : 'white', transition: 'background .15s', boxSizing: 'border-box', textAlign: 'center', padding: '12px 10px' }}
                      onDragOver={e => e.preventDefault()}
                      onDrop={e => { e.preventDefault(); uploadImages([...e.dataTransfer.files]); }}
                    >
                      <input type="file" multiple accept="image/*" style={{ display: 'none' }}
                        onChange={e => uploadImages([...e.target.files])} />
                      {uploading ? (
                        <div style={{ fontSize: 20 }}>⏳</div>
                      ) : (
                        <>
                          <div style={{ fontSize: 22, color: '#94a3b8' }}>+</div>
                          <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4, fontWeight: 700 }}>Tải ảnh</div>
                        </>
                      )}
                    </label>

                    {(form.images || []).length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {(form.images || []).map((img, i) => (
                          <div key={i} style={{ position: 'relative', width: '100%', aspectRatio: '1 / 1', borderRadius: 12, overflow: 'hidden', border: '1.5px solid #e2e8f0', background: '#f8fafc' }}>
                            <img src={`${API}${img.url}`} alt={img.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            <button type="button" onClick={() => removeImage(i)}
                              style={{ position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: '50%', background: 'rgba(220,38,38,.88)', border: 'none', color: 'white', fontWeight: 900, fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.6, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: '10px 12px' }}>
                        Chưa có ảnh sản phẩm nào.
                      </div>
                    )}
                    <div style={{ fontSize: 10, color: '#94a3b8', lineHeight: 1.6 }}>
                      Kéo thả hoặc click để chọn nhiều ảnh. Hỗ trợ JPG, PNG, WEBP.
                    </div>
                  </div>
                </div>
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
    </>
  );
}
