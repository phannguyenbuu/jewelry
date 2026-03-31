import { API, FilterDateInput, FilterInput, FilterSelect, formatWeightDisplay, getNhomColor, getQuayDisplayParts } from './shared';

export default function InventoryWorkspace({
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
}) {
  return (
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
                              <FilterInput label="Công" value={fCongLe} onChange={e => { setFCongLe(e.target.value); setPage(1); }} placeholder="VD: 390" />
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
                              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 820 }}>
                                <thead>
                                  <tr style={{ background: '#1e293b', color: 'white' }}>
                                    {[
                                      { label: 'STT', align: 'left', sortKey: 'id' },
                                      { label: 'Mã hàng', align: 'left', sortKey: 'ma_hang' },
                                      { label: 'NCC (Nhóm hàng)', align: 'left', sortKey: 'ncc' },
                                      { label: 'Quầy nhỏ', align: 'left', sortKey: 'quay_nho' },
                                      { label: 'Tuổi vàng', align: 'left', sortKey: 'tuoi_vang' },
                                      { label: 'Công', align: 'right', sortKey: 'cong' },
                                      { label: 'Trọng lương (tổng = vàng + đá)', align: 'right', sortKey: 'tong_tl' },
                                      { label: '...', align: 'center', sortKey: null },
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
                                    const quayParts = getQuayDisplayParts(r.quay_nho);
                                    const quayColor = quayParts.prefix ? getNhomColor(`quay:${quayParts.prefix}`) : null;
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
                                        <td style={{ padding: '9px 12px', color: '#475569', fontSize: 12, whiteSpace: 'nowrap' }}>
                                          {quayParts.prefix && quayColor ? (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'nowrap', minWidth: 0 }}>
                                              <span style={{ padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: quayColor.bg, color: quayColor.text, whiteSpace: 'nowrap', flexShrink: 0 }}>
                                                {quayParts.prefix}
                                              </span>
                                              <span
                                                title={quayParts.raw}
                                                style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', flex: 1 }}
                                              >
                                                {quayParts.suffix}
                                              </span>
                                            </div>
                                          ) : (
                                            r.quay_nho || 'â€”'
                                          )}
                                        </td>

                                        {/* Tuổi vàng */}
                                        <td style={{ padding: '9px 12px', color: '#475569', fontSize: 12, whiteSpace: 'nowrap' }}>
                                          {r.tuoi_vang || '—'}
                                        </td>

                                        {/* Công */}
                                        <td style={{ padding: '9px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                          <span style={{ fontWeight: 700, color: '#0369a1' }}>{r.cong_le || '—'}</span>
                                        </td>

                                        {/* Trọng lượng: tổng = vàng + đá */}
                                        <td style={{ padding: '9px 12px', textAlign: 'right', whiteSpace: 'nowrap', fontSize: 12 }}>
                                          <span style={{ display: 'inline-block', padding: '1px 8px', borderRadius: 20, background: '#1e293b', color: 'white', fontWeight: 800, fontSize: 12 }}>{formatWeightDisplay(r.tong_tl)}</span>
                                          <span style={{ color: '#94a3b8', margin: '0 4px' }}>=</span>
                                          <span style={{ color: '#047857', fontWeight: 600 }}>{formatWeightDisplay(r.tl_vang)}</span>
                                          <span style={{ color: '#94a3b8', margin: '0 4px' }}>+</span>
                                          <span style={{ color: '#64748b' }}>{formatWeightDisplay(r.tl_da)}</span>
                                        </td>

                                        {/* Actions */}
                                        <td style={{ padding: '9px 12px', whiteSpace: 'nowrap', textAlign: 'center', position: 'relative' }}>
                                          <div data-item-actions-root="true" style={{ display: 'inline-flex', justifyContent: 'center', position: 'relative' }}>
                                            <button
                                              type="button"
                                              title="Mở menu hành động"
                                              aria-expanded={actionMenuId === r.id}
                                              onClick={(event) => {
                                                event.stopPropagation();
                                                setActionMenuId((current) => current === r.id ? null : r.id);
                                              }}
                                              style={{
                                                minWidth: 34,
                                                height: 34,
                                                padding: '0 10px',
                                                borderRadius: 10,
                                                border: '1px solid #cbd5e1',
                                                background: actionMenuId === r.id ? '#e2e8f0' : '#ffffff',
                                                color: '#334155',
                                                fontSize: 16,
                                                fontWeight: 800,
                                                letterSpacing: 1,
                                                cursor: 'pointer',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                              }}
                                            >
                                              ...
                                            </button>
                                            {actionMenuId === r.id && (
                                              <div
                                                style={{
                                                  position: 'absolute',
                                                  top: 'calc(100% + 8px)',
                                                  right: 0,
                                                  width: 196,
                                                  background: '#fff',
                                                  border: '1px solid #e2e8f0',
                                                  borderRadius: 14,
                                                  boxShadow: '0 14px 32px rgba(15, 23, 42, 0.18)',
                                                  padding: 8,
                                                  zIndex: 40,
                                                }}
                                              >
                                                {[
                                                  {
                                                    key: 'print',
                                                    label: 'In certification',
                                                    iconBg: '#dbeafe',
                                                    iconColor: '#1d4ed8',
                                                    onClick: () => handlePrintCertification(r),
                                                    icon: (
                                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9V2h12v7" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" rx="1" /><circle cx="18" cy="12" r="1" /></svg>
                                                    ),
                                                  },
                                                  {
                                                    key: 'info',
                                                    label: 'Xem ảnh',
                                                    iconBg: '#e2e8f0',
                                                    iconColor: '#475569',
                                                    onClick: () => setInfoModal(r),
                                                    icon: (
                                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
                                                    ),
                                                  },
                                                  {
                                                    key: 'edit',
                                                    label: 'Chỉnh sửa',
                                                    iconBg: '#dbeafe',
                                                    iconColor: '#2563eb',
                                                    onClick: () => openEdit(r),
                                                    icon: (
                                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                                                    ),
                                                  },
                                                  {
                                                    key: 'delete',
                                                    label: 'Xóa sản phẩm',
                                                    iconBg: '#fee2e2',
                                                    iconColor: '#dc2626',
                                                    onClick: () => confirmDelete(r.id),
                                                    icon: (
                                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>
                                                    ),
                                                  },
                                                ].map((action) => (
                                                  <button
                                                    key={action.key}
                                                    type="button"
                                                    onClick={() => {
                                                      setActionMenuId(null);
                                                      action.onClick();
                                                    }}
                                                    style={{
                                                      width: '100%',
                                                      display: 'flex',
                                                      alignItems: 'center',
                                                      gap: 10,
                                                      border: 'none',
                                                      background: 'transparent',
                                                      borderRadius: 10,
                                                      padding: '9px 10px',
                                                      cursor: 'pointer',
                                                      color: action.key === 'delete' ? '#b91c1c' : '#0f172a',
                                                      textAlign: 'left',
                                                    }}
                                                  >
                                                    <span
                                                      style={{
                                                        width: 28,
                                                        height: 28,
                                                        borderRadius: 9,
                                                        background: action.iconBg,
                                                        color: action.iconColor,
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        flexShrink: 0,
                                                      }}
                                                    >
                                                      {action.icon}
                                                    </span>
                                                    <span style={{ fontSize: 13, fontWeight: 700 }}>{action.label}</span>
                                                  </button>
                                                ))}
                                              </div>
                                            )}
                                          </div>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                  {displayed.length === 0 && (
                                    <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Không tìm thấy dữ liệu.</td></tr>
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
  );
}
