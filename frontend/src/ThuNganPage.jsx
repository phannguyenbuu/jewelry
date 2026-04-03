import { useCallback, useEffect, useRef, useState } from 'react';
import ThuNganCard from './thuNgan/ThuNganCard';
import KhoTongCard from './thuNgan/KhoTongCard';
import ThuNganHistory from './thuNgan/ThuNganHistory';
import ThuNganManager from './thuNgan/ThuNganManager';
import OrderListTable from './components/orders/OrderListTable';
import { fetchCompanyBankAccounts, withFallbackCompanyBankAccounts } from './lib/companyBankAccounts';
import { archiveOrder, getOrderArchiveKey, readArchivedOrderKeys } from './lib/orderArchive';
import {
  API,
  TIEN_MAT_TUOI,
  buildFormMap,
  buildPayload,
  emptyDetailRow,
  ensureTienMatRow,
  fmt,
  inputBase,
  panelStyle,
  sameMoney,
  statusMeta,
  toNumber,
  today,
} from './thuNgan/utils';

const FALLBACK_BANK_LEDGER_NAME = 'Tài Khoản Ngân Hàng';

const cloneFormMap = (map = {}) => Object.fromEntries(
  Object.entries(map).map(([thuNganId, form]) => [
    thuNganId,
    {
      ...form,
      chi_tiet: ensureTienMatRow((form?.chi_tiet || []).map((row) => ({ ...row }))),
    },
  ]),
);

const cloneCashierForm = (form = {}) => ({
  ghi_chu: form?.ghi_chu || '',
  chi_tiet: ensureTienMatRow((form?.chi_tiet || []).map((row) => ({ ...row }))),
});

const buildZeroedCashierForm = (form = {}) => ({
  ghi_chu: form?.ghi_chu || '',
  chi_tiet: ensureTienMatRow((form?.chi_tiet || []).map((row) => ({
    ...row,
    ton_dau_ky: '0',
    so_du_hien_tai: '0',
    gia_tri_lech: '0',
  }))),
});

const getOrderPaymentSign = (order) => {
  const orderType = String(order?.loai_don || '').trim().toLowerCase();
  if (orderType === 'mua' || orderType === 'buy') return -1;
  if (orderType === 'bán' || orderType === 'ban' || orderType === 'sell' || orderType === 'pos') return 1;
  return 0;
};

const resolveOrderLivePayments = (order, companyBankAccounts) => {
  const tongTien = toNumber(order?.tong_tien);
  if (tongTien <= 0) return null;

  const sign = getOrderPaymentSign(order);
  if (!sign) return null;

  const settlement = order?.hoa_don_tai_chinh?.settlement && typeof order.hoa_don_tai_chinh.settlement === 'object'
    ? order.hoa_don_tai_chinh.settlement
    : {};

  const explicitCash = settlement.cashRaw ?? settlement.cash ?? '';
  const explicitBank = settlement.bankcashRaw ?? settlement.bankcash ?? settlement.bank ?? '';

  let cashPayment = 0;
  let bankPayment = 0;
  if (explicitCash !== '' || explicitBank !== '') {
    cashPayment = toNumber(explicitCash);
    bankPayment = toNumber(explicitBank);
  } else {
    const cashAbs = Math.max(0, Math.min(toNumber(order?.dat_coc), tongTien));
    const bankAbs = Math.max(0, tongTien - cashAbs);
    cashPayment = cashAbs * sign;
    bankPayment = bankAbs * sign;
  }

  if (!cashPayment && !bankPayment) return null;

  const fallbackBankAccount = withFallbackCompanyBankAccounts(companyBankAccounts, true)[0];
  return {
    cashPayment,
    bankPayment,
    bankCategory: settlement.companyBankLedgerKey
      || fallbackBankAccount?.ledger_key
      || FALLBACK_BANK_LEDGER_NAME,
  };
};

const upsertLiveAmount = (formMap, thuNganId, category, amount) => {
  if (!thuNganId || !amount || !formMap[thuNganId]) return;

  const targetForm = formMap[thuNganId];
  const nextDetails = [...(targetForm.chi_tiet || [])];
  let targetIndex = nextDetails.findIndex((row) => row.tuoi_vang === category);
  if (targetIndex < 0) {
    nextDetails.push({
      row_id: `live_${thuNganId}_${category}`,
      tuoi_vang: category,
      ton_dau_ky: '0',
      so_du_hien_tai: '0',
      gia_tri_lech: '0',
    });
    targetIndex = nextDetails.length - 1;
  }

  const targetRow = { ...nextDetails[targetIndex] };
  const nextCurrent = toNumber(targetRow.so_du_hien_tai) + amount;
  const opening = toNumber(targetRow.ton_dau_ky);
  targetRow.so_du_hien_tai = String(Math.round(nextCurrent));
  targetRow.gia_tri_lech = String(Math.round(nextCurrent - opening));
  nextDetails[targetIndex] = targetRow;
  targetForm.chi_tiet = ensureTienMatRow(nextDetails);
};

const applyHistoryTransfersToKhoTong = (formMap, history = []) => {
  for (const entry of history || []) {
    for (const detail of entry?.chi_tiet || []) {
      const category = String(detail?.tuoi_vang || '').trim();
      if (!category) continue;
      const amount = toNumber(detail?.so_du_hien_tai);
      if (!amount) continue;
      upsertLiveAmount(formMap, 'kho_tong', category, amount);
    }
  }
};

const buildPreviewFormMap = (rows, history, pendingOrders, companyBankAccounts) => {
  const baseFormMap = cloneFormMap(buildFormMap(rows));
  const seenOrderKeys = new Set();
  const orderKeys = [];

  const tn1Row = (rows || []).find((row) => row.thu_ngan_id !== 'kho_tong' && String(row?.ten_thu_ngan || '').toLowerCase().includes('tn1'))
    || (rows || []).find((row) => row.thu_ngan_id !== 'kho_tong');

  let totalAmount = 0;
  let cashTotal = 0;
  let bankTotal = 0;

  applyHistoryTransfersToKhoTong(baseFormMap, history);

  for (const order of pendingOrders || []) {
    const orderKey = getOrderArchiveKey(order);
    if (!orderKey || seenOrderKeys.has(orderKey)) continue;
    seenOrderKeys.add(orderKey);

    const payment = resolveOrderLivePayments(order, companyBankAccounts);
    if (!payment) continue;

    orderKeys.push(orderKey);
    totalAmount += toNumber(order?.tong_tien);
    cashTotal += payment.cashPayment;
    bankTotal += payment.bankPayment;
    if (tn1Row?.thu_ngan_id && payment.cashPayment) {
      upsertLiveAmount(baseFormMap, tn1Row.thu_ngan_id, TIEN_MAT_TUOI, payment.cashPayment);
    }
    if (payment.bankPayment) {
      upsertLiveAmount(baseFormMap, 'kho_tong', payment.bankCategory, payment.bankPayment);
    }
  }

  return {
    formMap: baseFormMap,
    meta: {
      orderKeys,
      count: orderKeys.length,
      totalAmount,
      cashTotal,
      bankTotal,
    },
  };
};

export default function ThuNganPage() {
  const [ngay, setNgay] = useState(today());
  const [data, setData] = useState({ ngay: today(), rows: [], history: [] });
  const [formMap, setFormMap] = useState({});
  const [pendingOrders, setPendingOrders] = useState([]);
  const [livePreviewMeta, setLivePreviewMeta] = useState({ orderKeys: [], count: 0, totalAmount: 0, cashTotal: 0, bankTotal: 0 });
  const [tuoiVangOptions, setTuoiVangOptions] = useState([]);
  const [companyBankAccounts, setCompanyBankAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [savingMap, setSavingMap] = useState({});
  const [draftStatusMap, setDraftStatusMap] = useState({});
  const [historyDeletingKey, setHistoryDeletingKey] = useState('');
  const [settlementModal, setSettlementModal] = useState({ open: false, cashierName: '' });
  const [notice, setNotice] = useState('');
  const ngayRef = useRef(ngay);
  const pendingFormsRef = useRef({});

  useEffect(() => {
    ngayRef.current = ngay;
  }, [ngay]);

  const applyPayload = useCallback((payload, fallbackNgay) => {
    let rawRows = Array.isArray(payload.rows) ? payload.rows : [];
    if (!rawRows.some((row) => row.thu_ngan_id === 'kho_tong')) {
      rawRows = [{
        thu_ngan_id: 'kho_tong',
        ten_thu_ngan: 'Kho Tổng',
        nguoi_quan_ly: 'Quản trị viên',
        ten_kho: 'Tổ hợp',
        quays: [],
      }, ...rawRows];
    } else {
      const khoTong = rawRows.find((row) => row.thu_ngan_id === 'kho_tong');
      rawRows = [khoTong, ...rawRows.filter((row) => row.thu_ngan_id !== 'kho_tong')];
    }

    setData({
      ngay: payload.ngay || fallbackNgay,
      rows: rawRows,
      history: Array.isArray(payload.history) ? payload.history : [],
    });
  }, []);

  const loadOrders = useCallback(async () => {
    const archivedOrderKeys = readArchivedOrderKeys();
    const res = await fetch(`${API}/api/don_hang`);
    const payload = await res.json();
    if (!res.ok) throw new Error(payload.error || `HTTP ${res.status}`);
    const rows = Array.isArray(payload) ? payload : [];
    return rows.filter((order) => !archivedOrderKeys.has(getOrderArchiveKey(order)));
  }, []);

  const load = useCallback(async (targetNgay) => {
    setLoading(true);
    try {
      const [cashierRes, orders] = await Promise.all([
        fetch(`${API}/api/thu_ngan_so_quy?ngay=${encodeURIComponent(targetNgay)}`),
        loadOrders(),
      ]);
      const payload = await cashierRes.json();
      if (!cashierRes.ok) throw new Error(payload.error || `HTTP ${cashierRes.status}`);
      applyPayload(payload, targetNgay);
      setPendingOrders(orders);
      setDraftStatusMap({});
      setNotice('');
    } catch (err) {
      setNotice(`Không tải được bảng thu ngân: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [applyPayload, loadOrders]);

  useEffect(() => {
    pendingFormsRef.current = {};
    load(ngay);
  }, [load, ngay]);

  useEffect(() => {
    fetch(`${API}/api/tuoi_vang`)
      .then((r) => r.json())
      .then((rows) => setTuoiVangOptions(Array.isArray(rows) ? rows : []))
      .catch(() => setTuoiVangOptions([]));
  }, []);

  useEffect(() => {
    fetchCompanyBankAccounts()
      .then((items) => setCompanyBankAccounts(Array.isArray(items) ? items : []))
      .catch(() => setCompanyBankAccounts([]));
  }, []);

  useEffect(() => {
    if (!data.rows.length) {
      setFormMap({});
      setLivePreviewMeta({ orderKeys: [], count: 0, totalAmount: 0, cashTotal: 0, bankTotal: 0 });
      return;
    }
    const { formMap: nextFormMap, meta } = buildPreviewFormMap(data.rows, data.history, pendingOrders, companyBankAccounts);
    setFormMap(nextFormMap);
    pendingFormsRef.current = nextFormMap;
    setLivePreviewMeta(meta);
  }, [companyBankAccounts, data.history, data.rows, pendingOrders]);

  const reloadCashLedger = useCallback(async () => {
    await load(ngayRef.current);
  }, [load]);

  const updateCashierForm = useCallback((thuNganId, updater) => {
    setFormMap((prev) => {
      const current = prev[thuNganId] || { ghi_chu: '', chi_tiet: [] };
      const nextForm = typeof updater === 'function' ? updater(current) : updater;
      pendingFormsRef.current = { ...pendingFormsRef.current, [thuNganId]: nextForm };
      setDraftStatusMap((draftPrev) => ({ ...draftPrev, [thuNganId]: 'pending' }));
      return { ...prev, [thuNganId]: nextForm };
    });
  }, []);

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
            nextRow.gia_tri_lech = String(Math.round(toNumber(nextHienTai) - toNumber(nextDauKy)));
          }
        }
        return nextRow;
      }),
    }));
  }, [updateCashierForm]);

  const handleUpsertCategoryField = useCallback((thuNganId, category, key, value) => {
    updateCashierForm(thuNganId, (current) => {
      let exists = false;
      const nextChiTiet = (current.chi_tiet || []).map((row) => {
        if (row.tuoi_vang !== category) return row;
        exists = true;
        const nextRow = { ...row, [key]: value };
        if (key === 'ton_dau_ky' || key === 'so_du_hien_tai') {
          const prevAutoDiff = toNumber(row.so_du_hien_tai) - toNumber(row.ton_dau_ky);
          const nextDauKy = key === 'ton_dau_ky' ? value : row.ton_dau_ky;
          const nextHienTai = key === 'so_du_hien_tai' ? value : row.so_du_hien_tai;
          if (row.gia_tri_lech === '' || sameMoney(row.gia_tri_lech, prevAutoDiff)) {
            nextRow.gia_tri_lech = String(Math.round(toNumber(nextHienTai) - toNumber(nextDauKy)));
          }
        }
        return nextRow;
      });

      if (!exists) {
        const newRow = emptyDetailRow();
        newRow.tuoi_vang = category;
        newRow[key] = value;
        if (key === 'ton_dau_ky' || key === 'so_du_hien_tai') {
          newRow.gia_tri_lech = String(Math.round(toNumber(newRow.so_du_hien_tai) - toNumber(newRow.ton_dau_ky)));
        }
        nextChiTiet.push(newRow);
      }

      return { ...current, chi_tiet: nextChiTiet };
    });
  }, [updateCashierForm]);

  const handleResetKhoTong = useCallback((thuNganId) => {
    updateCashierForm(thuNganId, (current) => {
      const bankLedgerKeys = withFallbackCompanyBankAccounts(companyBankAccounts, true)
        .map((account) => account.ledger_key)
        .filter(Boolean);
      const categories = [TIEN_MAT_TUOI, ...bankLedgerKeys, ...(tuoiVangOptions || []).map((option) => option.ten_tuoi)];
      return {
        ...current,
        chi_tiet: categories.map((category) => ({
          row_id: `reset_${Date.now()}_${category}`,
          tuoi_vang: category,
          ton_dau_ky: '0',
          so_du_hien_tai: '0',
          gia_tri_lech: '0',
        })),
      };
    });
  }, [companyBankAccounts, tuoiVangOptions, updateCashierForm]);

  const handleNoteChange = useCallback((thuNganId, value) => {
    updateCashierForm(thuNganId, (current) => ({ ...current, ghi_chu: value }));
  }, [updateCashierForm]);

  const handleArchivePendingOrder = useCallback((order) => {
    archiveOrder(order);
    const orderKey = getOrderArchiveKey(order);
    setPendingOrders((prev) => prev.filter((item) => getOrderArchiveKey(item) !== orderKey));
    setNotice(`Đã đưa ${order.ma_don} vào Hộp Lưu Trữ Lâu Dài.`);
  }, []);

  const handleDeletePendingOrder = useCallback(async (order) => {
    if (!window.confirm(`Xóa đơn ${order.ma_don}? Hành động này không thể hoàn tác.`)) return;
    try {
      const res = await fetch(`${API}/api/don_hang/${order.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.error || `HTTP ${res.status}`);
      }
      setPendingOrders((prev) => prev.filter((item) => item.id !== order.id));
      setNotice(`Đã xóa đơn ${order.ma_don}.`);
    } catch (err) {
      setNotice(`Không xóa được ${order.ma_don}: ${err.message}`);
    }
  }, []);

  /*
  const handleChot = async (row) => {
    const thuNganId = row.thu_ngan_id;
    const currentForm = pendingFormsRef.current[thuNganId]
      || formMap[thuNganId]
      || buildFormMap([row])[thuNganId]
      || { ghi_chu: row.ghi_chu || '', chi_tiet: [] };
    const form = cloneCashierForm(currentForm);
    const zeroedForm = buildZeroedCashierForm(form);

    setSavingMap((prev) => ({ ...prev, [thuNganId]: true }));
    try {
      const chotRes = await fetch(`${API}/api/thu_ngan_so_quy/chot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload(thuNganId, ngay, form)),
      });
      const chotPayload = await chotRes.json();
      if (!chotRes.ok) throw new Error(chotPayload.error || `HTTP ${chotRes.status}`);

      const resetRes = await fetch(`${API}/api/thu_ngan_so_quy`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload(thuNganId, ngay, zeroedForm)),
      });
      const resetPayload = await resetRes.json();
      if (!resetRes.ok) throw new Error(resetPayload.error || `HTTP ${resetRes.status}`);

      delete pendingFormsRef.current[thuNganId];
      setFormMap((prev) => ({ ...prev, [thuNganId]: zeroedForm }));
      applyPayload(resetPayload, ngay);
      setDraftStatusMap((prev) => ({ ...prev, [thuNganId]: 'saved' }));
        setDraftStatusMap((prev) => ({ ...prev, [thuNganId]: 'saved' }));
        setNotice(`Đã chốt số tiền cho ${row.ten_thu_ngan}.`);
      setSettlementModal({ open: true, cashierName: row.ten_thu_ngan || '' });
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
  */

  const handleChot = async (row) => handleCashierSettlement(row);

  const handleCashierSettlement = async (row) => {
    const thuNganId = row.thu_ngan_id;
    const currentForm = pendingFormsRef.current[thuNganId]
      || formMap[thuNganId]
      || buildFormMap([row])[thuNganId]
      || { ghi_chu: row.ghi_chu || '', chi_tiet: [] };
    const form = cloneCashierForm(currentForm);
    const zeroedForm = buildZeroedCashierForm(form);

    setSavingMap((prev) => ({ ...prev, [thuNganId]: true }));
    try {
      const chotRes = await fetch(`${API}/api/thu_ngan_so_quy/chot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload(thuNganId, ngay, form)),
      });
      const chotPayload = await chotRes.json();
      if (!chotRes.ok) throw new Error(chotPayload.error || `HTTP ${chotRes.status}`);

      const resetRes = await fetch(`${API}/api/thu_ngan_so_quy`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload(thuNganId, ngay, zeroedForm)),
      });
      const resetPayload = await resetRes.json();
      if (!resetRes.ok) throw new Error(resetPayload.error || `HTTP ${resetRes.status}`);

      delete pendingFormsRef.current[thuNganId];
      setFormMap((prev) => ({ ...prev, [thuNganId]: zeroedForm }));
      applyPayload(resetPayload, ngay);
      setDraftStatusMap((prev) => ({ ...prev, [thuNganId]: 'saved' }));
      setNotice(`Đã chốt thu ngân ${row.ten_thu_ngan}, chuyển số dư về Kho Tổng và đưa thu ngân về 0.`);
      setSettlementModal({ open: true, cashierName: row.ten_thu_ngan || '' });
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

  const settlementSummary = pendingOrders.reduce((acc, order) => {
    const payment = resolveOrderLivePayments(order, companyBankAccounts);
    acc.count += 1;
    acc.totalAmount += toNumber(order?.tong_tien);
    if (!payment) return acc;
    acc.cashTotal += payment.cashPayment;
    acc.bankTotal += payment.bankPayment;
    return acc;
  }, { count: 0, totalAmount: 0, cashTotal: 0, bankTotal: 0 });

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

        {livePreviewMeta.count > 0 && (
          <div style={{ marginBottom: 16, padding: '11px 14px', borderRadius: 12, border: '1px solid #fde68a', background: '#fffbeb', color: '#92400e', fontSize: 12, lineHeight: 1.6 }}>
            Đang tạm cộng frontend từ <b>{livePreviewMeta.count}</b> đơn chưa chốt
            {' · '}Tổng tiền <b>{fmt(livePreviewMeta.totalAmount)} ₫</b>
            {' · '}Tiền mặt <b>{fmt(livePreviewMeta.cashTotal)} ₫</b>
            {' · '}Ngân hàng <b>{fmt(livePreviewMeta.bankTotal)} ₫</b>
            {' · '}Chỉ lưu backend khi bấm <b>Chốt Thu Ngân</b>.
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

              if (row.thu_ngan_id === 'kho_tong') {
                return (
                  <KhoTongCard
                    key="kho_tong"
                    draftState={statusMeta[draftStatusMap[row.thu_ngan_id] || 'idle']}
                    form={form}
                    onReset={handleResetKhoTong}
                    onUpsertCategoryField={handleUpsertCategoryField}
                    row={row}
                    companyBankAccounts={withFallbackCompanyBankAccounts(companyBankAccounts, true)}
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
                  onChot={handleCashierSettlement}
                  onDetailFieldChange={handleDetailFieldChange}
                  onNoteChange={handleNoteChange}
                  onRemoveDetailRow={handleRemoveDetailRow}
                  row={row}
                  tuoiVangOptions={tuoiVangOptions}
                />
              );
            })}
          </div>
        )}

        <ThuNganHistory history={data.history} historyDeletingKey={historyDeletingKey} loading={loading} ngay={ngay} onDeleteHistory={handleDeleteHistory} />
      </div>

      {settlementModal.open && (
        <div
          onClick={() => setSettlementModal({ open: false, cashierName: '' })}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.45)',
            zIndex: 1200,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              width: 'min(1180px, 100%)',
              maxHeight: '88vh',
              overflow: 'auto',
              background: 'white',
              borderRadius: 18,
              boxShadow: '0 30px 80px rgba(15, 23, 42, 0.28)',
              border: '1px solid #e2e8f0',
            }}
          >
            <div style={{ padding: '18px 22px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>Đơn hàng cần chốt</div>
                <div style={{ marginTop: 4, fontSize: 12, color: '#64748b' }}>
                  Thu ngân <b style={{ color: '#0f766e' }}>{settlementModal.cashierName || 'TN1'}</b> đã chốt xong. Bạn có thể archive hoặc xóa các đơn còn đang nằm ngoài Hộp Lưu Trữ Lâu Dài ngay tại đây.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSettlementModal({ open: false, cashierName: '' })}
                style={{ border: 'none', background: 'transparent', color: '#94a3b8', fontSize: 28, lineHeight: 1, cursor: 'pointer' }}
              >
                ×
              </button>
            </div>

            <div style={{ padding: 22 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 18 }}>
                <div style={{ ...panelStyle, padding: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>Số đơn cần chốt</div>
                  <div style={{ marginTop: 8, fontSize: 28, fontWeight: 800, color: '#1d4ed8' }}>{settlementSummary.count}</div>
                </div>
                <div style={{ ...panelStyle, padding: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>Tổng tiền</div>
                  <div style={{ marginTop: 8, fontSize: 24, fontWeight: 800, color: '#16a34a' }}>{fmt(settlementSummary.totalAmount)} ₫</div>
                </div>
                <div style={{ ...panelStyle, padding: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>Tiền mặt</div>
                  <div style={{ marginTop: 8, fontSize: 24, fontWeight: 800, color: '#c2410c' }}>{fmt(settlementSummary.cashTotal)} ₫</div>
                </div>
                <div style={{ ...panelStyle, padding: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>Chuyển khoản</div>
                  <div style={{ marginTop: 8, fontSize: 24, fontWeight: 800, color: '#0369a1' }}>{fmt(settlementSummary.bankTotal)} ₫</div>
                </div>
              </div>

              <OrderListTable
                orders={pendingOrders}
                emptyText="Không còn đơn hàng nào cần chốt."
                onArchive={handleArchivePendingOrder}
                onDelete={handleDeletePendingOrder}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
