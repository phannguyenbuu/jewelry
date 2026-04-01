import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ThuNganCard from './thuNgan/ThuNganCard';
import KhoTongCard from './thuNgan/KhoTongCard';
import ThuNganHistory from './thuNgan/ThuNganHistory';
import ThuNganManager from './thuNgan/ThuNganManager';
import {
  API,
  buildFormMap,
  buildPayload,
  emptyDetailRow,
  fmt,
  formatMoneyInput,
  inputBase,
  metricCardStyle,
  panelStyle,
  sameMoney,
  serverEchoesDetailRows,
  statusMeta,
  toNumber,
  today,
  totalsFromForm,
} from './thuNgan/utils';

export default function ThuNganPage() {
  const [ngay, setNgay] = useState(today());
  const [data, setData] = useState({ ngay: today(), rows: [], history: [] });
  const [formMap, setFormMap] = useState({});
  const [tuoiVangOptions, setTuoiVangOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [savingMap, setSavingMap] = useState({});
  const [draftStatusMap, setDraftStatusMap] = useState({});
  const [historyDeletingKey, setHistoryDeletingKey] = useState('');
  const [notice, setNotice] = useState('');
  const ngayRef = useRef(ngay);
  const pendingFormsRef = useRef({});
  const statusTimersRef = useRef({});
  const queuedDraftsRef = useRef({});
  const savePromisesRef = useRef({});

  const clearAllTimers = useCallback(() => {
    Object.values(statusTimersRef.current).forEach(clearTimeout);
    statusTimersRef.current = {};
    queuedDraftsRef.current = {};
    savePromisesRef.current = {};
  }, []);

  useEffect(() => {
    ngayRef.current = ngay;
  }, [ngay]);

  const applyPayload = useCallback((payload, fallbackNgay) => {
    let rawRows = Array.isArray(payload.rows) ? payload.rows : [];
    if (!rawRows.some(r => r.thu_ngan_id === 'kho_tong')) {
      rawRows = [{
          thu_ngan_id: 'kho_tong',
          ten_thu_ngan: 'Kho Tổng',
          nguoi_quan_ly: 'Quản trị viên',
          ten_kho: 'Tổ hợp',
          quays: [],
      }, ...rawRows];
    } else {
      // Ensure Kho Tong is always at the top
      const kt = rawRows.find(r => r.thu_ngan_id === 'kho_tong');
      rawRows = [kt, ...rawRows.filter(r => r.thu_ngan_id !== 'kho_tong')];
    }

    const nextData = {
      ngay: payload.ngay || fallbackNgay,
      rows: rawRows,
      history: Array.isArray(payload.history) ? payload.history : [],
    };
    setData(nextData);
    setFormMap({
      ...buildFormMap(nextData.rows),
      ...pendingFormsRef.current,
    });
  }, []);

  const load = useCallback(async (targetNgay) => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/thu_ngan_so_quy?ngay=${encodeURIComponent(targetNgay)}`);
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || `HTTP ${res.status}`);
      applyPayload(payload, targetNgay);
      setNotice('');
    } catch (err) {
      setNotice(`Không tải được bảng thu ngân: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [applyPayload]);

  useEffect(() => {
    clearAllTimers();
    pendingFormsRef.current = {};
    setDraftStatusMap({});
    load(ngay);
  }, [clearAllTimers, load, ngay]);

  useEffect(() => {
    fetch(`${API}/api/tuoi_vang`)
      .then((r) => r.json())
      .then((rows) => setTuoiVangOptions(Array.isArray(rows) ? rows : []))
      .catch(() => setTuoiVangOptions([]));
  }, []);

  useEffect(() => () => clearAllTimers(), [clearAllTimers]);

  const reloadCashLedger = useCallback(async () => {
    await load(ngayRef.current);
  }, [load]);

  const flushDraftSave = useCallback((thuNganId) => {
    if (savePromisesRef.current[thuNganId]) return savePromisesRef.current[thuNganId];

    const task = (async () => {
      while (queuedDraftsRef.current[thuNganId]) {
        const requestNgay = ngayRef.current;
        const formToSave = queuedDraftsRef.current[thuNganId];
        delete queuedDraftsRef.current[thuNganId];
        clearTimeout(statusTimersRef.current[thuNganId]);
        setDraftStatusMap((prev) => ({ ...prev, [thuNganId]: 'saving' }));
        try {
          const res = await fetch(`${API}/api/thu_ngan_so_quy`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(buildPayload(thuNganId, requestNgay, formToSave)),
          });
          const payload = await res.json();
          if (!res.ok) throw new Error(payload.error || `HTTP ${res.status}`);
          if (ngayRef.current !== requestNgay) continue;

          const hasQueuedUpdate = Boolean(queuedDraftsRef.current[thuNganId]);
          const hasDetailEcho = serverEchoesDetailRows(payload, thuNganId, formToSave);
          if (!hasQueuedUpdate && hasDetailEcho) {
            delete pendingFormsRef.current[thuNganId];
          } else if (hasQueuedUpdate) {
            pendingFormsRef.current[thuNganId] = queuedDraftsRef.current[thuNganId];
          } else {
            pendingFormsRef.current[thuNganId] = formToSave;
          }
          applyPayload(payload, requestNgay);

          if (hasQueuedUpdate) {
            setDraftStatusMap((prev) => ({ ...prev, [thuNganId]: 'pending' }));
            continue;
          }
          if (hasDetailEcho) {
            setDraftStatusMap((prev) => ({ ...prev, [thuNganId]: 'saved' }));
            statusTimersRef.current[thuNganId] = setTimeout(() => {
              setDraftStatusMap((prev) => ({ ...prev, [thuNganId]: 'idle' }));
            }, 1600);
          } else {
            setDraftStatusMap((prev) => ({ ...prev, [thuNganId]: 'error' }));
            setNotice('Backend đang phản hồi bản cũ cho Thu Ngân: dòng chi tiết chưa được lưu. Hãy restart backend để nạp API mới.');
          }
        } catch (err) {
          if (ngayRef.current !== requestNgay) continue;
          pendingFormsRef.current[thuNganId] = queuedDraftsRef.current[thuNganId] || formToSave;
          setDraftStatusMap((prev) => ({ ...prev, [thuNganId]: 'error' }));
          setNotice(`Không lưu được nháp của thu ngân #${thuNganId}: ${err.message}`);
          break;
        }
      }
    })().finally(() => {
      if (savePromisesRef.current[thuNganId] === task) {
        delete savePromisesRef.current[thuNganId];
      }
      if (queuedDraftsRef.current[thuNganId]) {
        flushDraftSave(thuNganId);
      }
    });

    savePromisesRef.current[thuNganId] = task;
    return task;
  }, [applyPayload]);

  const scheduleDraftSave = useCallback((thuNganId, nextForm) => {
    clearTimeout(statusTimersRef.current[thuNganId]);
    queuedDraftsRef.current[thuNganId] = nextForm;
    setDraftStatusMap((prev) => ({ ...prev, [thuNganId]: savePromisesRef.current[thuNganId] ? 'pending' : 'saving' }));
    flushDraftSave(thuNganId);
  }, [flushDraftSave]);

  const updateCashierForm = useCallback((thuNganId, updater) => {
    setFormMap((prev) => {
      const current = prev[thuNganId] || { ghi_chu: '', chi_tiet: [] };
      const nextForm = typeof updater === 'function' ? updater(current) : updater;
      pendingFormsRef.current[thuNganId] = nextForm;
      scheduleDraftSave(thuNganId, nextForm);
      return { ...prev, [thuNganId]: nextForm };
    });
  }, [scheduleDraftSave]);

  const handleAddDetailRow = useCallback((thuNganId) => {
    updateCashierForm(thuNganId, (current) => ({
      ...current,
      chi_tiet: [...(current.chi_tiet || []), emptyDetailRow()],
    }));
  }, [updateCashierForm]);

  const handleRemoveDetailRow = useCallback((thuNganId, rowId) => {
    updateCashierForm(thuNganId, (current) => ({
      ...current,
      chi_tiet: (current.chi_tiet || []).filter((row) => row.row_id !== rowId),
    }));
  }, [updateCashierForm]);

  const handleDetailFieldChange = useCallback((thuNganId, rowId, key, value) => {
    updateCashierForm(thuNganId, (current) => ({
      ...current,
      chi_tiet: (current.chi_tiet || []).map((row) => {
        if (row.row_id !== rowId) return row;
        const nextRow = { ...row, [key]: value };
        if (key === 'ton_dau_ky' || key === 'so_du_hien_tai') {
          const prevAutoDiff = toNumber(row.so_du_hien_tai) - toNumber(row.ton_dau_ky);
          const nextDauKy = key === 'ton_dau_ky' ? value : row.ton_dau_ky;
          const nextHienTai = key === 'so_du_hien_tai' ? value : row.so_du_hien_tai;
          if (row.gia_tri_lech === '' || sameMoney(row.gia_tri_lech, prevAutoDiff)) {
            nextRow.gia_tri_lech = formatMoneyInput(toNumber(nextHienTai) - toNumber(nextDauKy));
          }
        }
        return nextRow;
      }),
    }));
  }, [updateCashierForm]);

  const handleUpsertCategoryField = useCallback((thuNganId, category, key, value) => {
    updateCashierForm(thuNganId, (current) => {
        let exists = false;
        let nextChiTiet = (current.chi_tiet || []).map((row) => {
            if (row.tuoi_vang !== category) return row;
            exists = true;
            const nextRow = { ...row, [key]: value };
            if (key === 'ton_dau_ky' || key === 'so_du_hien_tai') {
                const prevAutoDiff = toNumber(row.so_du_hien_tai) - toNumber(row.ton_dau_ky);
                const nextDauKy = key === 'ton_dau_ky' ? value : row.ton_dau_ky;
                const nextHienTai = key === 'so_du_hien_tai' ? value : row.so_du_hien_tai;
                if (row.gia_tri_lech === '' || sameMoney(row.gia_tri_lech, prevAutoDiff)) {
                    nextRow.gia_tri_lech = formatMoneyInput(toNumber(nextHienTai) - toNumber(nextDauKy));
                }
            }
            return nextRow;
        });
        if (!exists) {
            const newRow = emptyDetailRow();
            newRow.tuoi_vang = category;
            newRow[key] = value;
            if (key === 'ton_dau_ky' || key === 'so_du_hien_tai') {
                newRow.gia_tri_lech = formatMoneyInput(toNumber(newRow.so_du_hien_tai) - toNumber(newRow.ton_dau_ky));
            }
            nextChiTiet.push(newRow);
        }
        return { ...current, chi_tiet: nextChiTiet };
    });
  }, [updateCashierForm]);

  const handleResetKhoTong = useCallback((thuNganId) => {
    updateCashierForm(thuNganId, (current) => {
      const cats = [TIEN_MAT_TUOI, 'Tài Khoản Ngân Hàng', ...(tuoiVangOptions || []).map(o => o.ten_tuoi)];
      const nextChiTiet = cats.map(cat => ({
        row_id: `reset_${Date.now()}_${cat}`,
        tuoi_vang: cat,
        ton_dau_ky: 0,
        so_du_hien_tai: 0,
        gia_tri_lech: 0
      }));
      return {
        ...current,
        chi_tiet: nextChiTiet
      };
    });
  }, [updateCashierForm, tuoiVangOptions]);

  const handleNoteChange = useCallback((thuNganId, value) => {
    updateCashierForm(thuNganId, (current) => ({ ...current, ghi_chu: value }));
  }, [updateCashierForm]);

  const handleChot = async (row) => {
    const thuNganId = row.thu_ngan_id;
    clearTimeout(statusTimersRef.current[thuNganId]);
    if (savePromisesRef.current[thuNganId]) {
      await savePromisesRef.current[thuNganId].catch(() => null);
    }
    const form = pendingFormsRef.current[thuNganId]
      || formMap[thuNganId]
      || buildFormMap([row])[thuNganId]
      || { ghi_chu: row.ghi_chu || '', chi_tiet: [] };
    setSavingMap((prev) => ({ ...prev, [thuNganId]: true }));
    try {
      const res = await fetch(`${API}/api/thu_ngan_so_quy/chot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload(thuNganId, ngay, form)),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || `HTTP ${res.status}`);
      const hasDetailEcho = serverEchoesDetailRows(payload, thuNganId, form);
      if (hasDetailEcho) {
        delete pendingFormsRef.current[thuNganId];
      } else {
        pendingFormsRef.current[thuNganId] = form;
      }
      applyPayload(payload, ngay);
      if (hasDetailEcho) {
        setDraftStatusMap((prev) => ({ ...prev, [thuNganId]: 'saved' }));
        setNotice(`Đã chốt số tiền cho ${row.ten_thu_ngan}.`);
      } else {
        setDraftStatusMap((prev) => ({ ...prev, [thuNganId]: 'error' }));
        setNotice(`Backend đang chạy bản cũ nên chưa nhận chi tiết của ${row.ten_thu_ngan}. Hãy restart backend rồi chốt lại.`);
      }
    } catch (err) {
      setDraftStatusMap((prev) => ({ ...prev, [thuNganId]: 'error' }));
      setNotice(`Không chốt được ${row.ten_thu_ngan}: ${err.message}`);
    } finally {
      setSavingMap((prev) => ({ ...prev, [thuNganId]: false }));
    }
  };

  const handleDeleteHistory = async (item) => {
    const key = item.entry_id || `${item.thu_ngan_id}-${item.thoi_gian}-${item.so_tien}`;
    if (!window.confirm(`Xóa lịch sử chốt lúc ${item.thoi_gian} của ${item.ten_thu_ngan}?`)) return;
    setHistoryDeletingKey(key);
    try {
      const res = await fetch(`${API}/api/thu_ngan_so_quy/history/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ngay,
          thu_ngan_id: item.thu_ngan_id,
          entry_id: item.entry_id || '',
          thoi_gian: item.thoi_gian,
          so_tien_dau_ngay: item.so_tien_dau_ngay,
          so_tien: item.so_tien,
          ghi_chu: item.ghi_chu || '',
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || `HTTP ${res.status}`);
      delete pendingFormsRef.current[item.thu_ngan_id];
      applyPayload(payload, ngay);
      setNotice(`Đã xóa lịch sử chốt của ${item.ten_thu_ngan}.`);
    } catch (err) {
      setNotice(`Không xóa được lịch sử: ${err.message}`);
    } finally {
      setHistoryDeletingKey('');
    }
  };

  const summary = useMemo(() => (
    (data.rows || []).reduce((acc, row) => {
      const form = formMap[row.thu_ngan_id] || buildFormMap([row])[row.thu_ngan_id] || { ghi_chu: '', chi_tiet: [] };
      const totals = totalsFromForm(form, row);
      acc.soThuNgan += 1;
      acc.soDong += form.chi_tiet.length;
      acc.dauKy += totals.dauKy;
      acc.hienTai += totals.hienTai;
      acc.chenhLech += totals.chenhLech;
      return acc;
    }, { soThuNgan: 0, soDong: 0, dauKy: 0, hienTai: 0, chenhLech: 0 })
  ), [data.rows, formMap]);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <div style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '0 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button type="button" style={{ padding: '12px 18px', border: 'none', cursor: 'default', fontSize: 13, fontWeight: 700, background: 'none', color: '#1e293b', borderBottom: '2.5px solid #f59e0b' }}>
          💵 Thu ngân
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontSize: 13, fontWeight: 700, color: '#475569' }}>Ngày làm việc</label>
          <input type="date" value={ngay} onChange={(e) => setNgay(e.target.value)} style={{ ...inputBase, minWidth: 140 }} />
        </div>
      </div>

      <div style={{ flex: 1, padding: '24px 28px', overflowY: 'auto', background: '#f8fafc' }}>
        <ThuNganManager onCashiersChanged={reloadCashLedger} />

        {notice && (
          <div style={{ marginBottom: 16, padding: '11px 14px', borderRadius: 12, border: '1px solid #dbeafe', background: '#eff6ff', color: '#1d4ed8', fontSize: 12, lineHeight: 1.6 }}>
            {notice}
          </div>
        )}



        {loading ? (
          <div style={{ ...panelStyle, padding: 32, textAlign: 'center', color: '#94a3b8' }}>Đang tải dữ liệu thu ngân...</div>
        ) : data.rows.length === 0 ? (
          <div style={{ ...panelStyle, padding: 40, textAlign: 'center', color: '#94a3b8' }}>Chưa có thu ngân nào. Hãy tạo thu ngân ngay ở phần quản lý phía trên.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 18 }}>
            {data.rows.map((row) => {
              const fallbackForm = buildFormMap([row])[row.thu_ngan_id] || { ghi_chu: row.ghi_chu || '', chi_tiet: [] };
              const form = formMap[row.thu_ngan_id] || fallbackForm;
              const totals = totalsFromForm(form, row);

              if (row.thu_ngan_id === 'kho_tong') {
                  return (
                      <KhoTongCard
                          key="kho_tong"
                          draftState={statusMeta[draftStatusMap[row.thu_ngan_id] || 'idle']}
                          form={form}
                          isSaving={!!savingMap[row.thu_ngan_id]}
                          onChot={handleChot}
                          onReset={handleResetKhoTong}
                          onUpsertCategoryField={handleUpsertCategoryField}
                          onNoteChange={handleNoteChange}
                          row={row}
                          totals={totals}
                          tuoiVangOptions={tuoiVangOptions}
                      />
                  );
              }

              return (
                <ThuNganCard
                  key={row.thu_ngan_id}
                  draftState={statusMeta[draftStatusMap[row.thu_ngan_id] || 'idle']}
                  form={form}
                  isSaving={!!savingMap[row.thu_ngan_id]}
                  onAddDetailRow={handleAddDetailRow}
                  onChot={handleChot}
                  onDetailFieldChange={handleDetailFieldChange}
                  onNoteChange={handleNoteChange}
                  onRemoveDetailRow={handleRemoveDetailRow}
                  row={row}
                  totals={totals}
                  tuoiVangOptions={tuoiVangOptions}
                />
              );
            })}
          </div>
        )}

        <ThuNganHistory history={data.history} historyDeletingKey={historyDeletingKey} loading={loading} ngay={ngay} onDeleteHistory={handleDeleteHistory} />
      </div>
    </div>
  );
}
