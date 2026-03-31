/* eslint-disable react-refresh/only-export-components */
import { API_BASE } from '../lib/api';

export const API = API_BASE;

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

export const getNhomColor = (nhom) => {
  if (!nhom) return null;
  if (!nhomColorCache[nhom]) {
    nhomColorCache[nhom] = NHOM_PALETTE[nhomColorIdx % NHOM_PALETTE.length];
    nhomColorIdx++;
  }
  return nhomColorCache[nhom];
};

export const formatWeightDisplay = (value) => {
  if (value === null || value === undefined || value === '') return '—';
  const num = Number(value);
  if (!Number.isFinite(num)) return value;
  return num.toFixed(4).replace(/\.?0+$/, '');
};

export const getQuayDisplayParts = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return { raw: '', prefix: '', suffix: '' };
  const dashIndex = raw.indexOf('-');
  if (dashIndex <= 0) return { raw, prefix: '', suffix: '' };
  const prefix = raw.slice(0, dashIndex).trim();
  const suffix = raw.slice(dashIndex + 1).trim();
  if (!prefix || !suffix) return { raw, prefix: '', suffix: '' };
  return { raw, prefix, suffix };
};

export const getNavLabel = (item) => {
  if (!item) return '';
  return item.key === 'hang_ton' ? 'Sản phẩm' : item.label;
};

export const parseDateTimeValue = (value) => {
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

export const getItemCreatedAtMs = (item) => {
  let minTs = null;
  for (const entry of item?.history || []) {
    const ts = parseDateTimeValue(entry?.date);
    if (ts === null) continue;
    if (minTs === null || ts < minTs) minTs = ts;
  }
  return minTs;
};

export const getDateStartMs = (value) => {
  if (!value) return null;
  const ts = Date.parse(`${value}T00:00:00`);
  return Number.isNaN(ts) ? null : ts;
};

export const getDateEndMs = (value) => {
  if (!value) return null;
  const ts = Date.parse(`${value}T23:59:59.999`);
  return Number.isNaN(ts) ? null : ts;
};

export const compareSortValues = (left, right) => {
  if (left == null && right == null) return 0;
  if (left == null) return -1;
  if (right == null) return 1;
  if (typeof left === 'number' && typeof right === 'number') return left - right;
  return String(left).localeCompare(String(right), 'vi', { numeric: true, sensitivity: 'base' });
};

export const numericOrText = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : (value || '');
};

export const NAV_ITEMS = [
  { key: 'hang_ton', label: 'Danh mục hàng', icon: '💎' },
  { key: 'thu_ngan', label: 'Thu Ngân', icon: '💵' },
  { key: 'don_hang', label: 'Đơn Hàng', icon: '📦' },
  { key: 'divider_orders_people' },
  { key: 'nhan_su', label: 'Nhân Sự', icon: '👥' },
  { key: 'khach_hang', label: 'Khách Hàng', icon: '🤝' },
  { key: 'doi_tac', label: 'Đối Tác', icon: '🏭' },
  { key: 'ke_toan', label: 'Kế Toán', icon: '📊' },
  { key: 'tai_chinh', label: 'Tài Chính', icon: '💰' },
  { key: 'may_can_vang', label: 'Agent', icon: '⚖️' },
  { key: 'divider_settings' },
  { key: 'cau_hinh', label: 'Cài Đặt', icon: '⚙️' },
];

export const ComingSoon = ({ label }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', color: '#94a3b8' }}>
    <div style={{ fontSize: 52, marginBottom: 16 }}>🚧</div>
    <div style={{ fontSize: 22, fontWeight: 700, color: '#64748b' }}>{label}</div>
    <div style={{ fontSize: 14, marginTop: 8 }}>Chức năng đang được phát triển</div>
  </div>
);

export const FilterInput = ({ label, value, onChange, placeholder }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
    <label style={{ fontSize: 10, fontWeight: 700, color: '#64748b', letterSpacing: 0.4 }}>{label}</label>
    <input
      value={value}
      onChange={onChange}
      placeholder={placeholder || `Tìm ${label}...`}
      style={{ padding: '7px 10px', borderRadius: 7, border: '1.5px solid #cbd5e1', outline: 'none', background: 'white', fontSize: 12, width: 140 }}
    />
  </div>
);

export const FilterSelect = ({ label, value, onChange, options, allLabel }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
    <label style={{ fontSize: 10, fontWeight: 700, color: '#64748b', letterSpacing: 0.4 }}>{label}</label>
    <select
      value={value}
      onChange={onChange}
      style={{ padding: '7px 10px', borderRadius: 7, border: '1.5px solid #cbd5e1', outline: 'none', background: 'white', fontSize: 12, cursor: 'pointer' }}
    >
      <option value="">{allLabel || 'Tất cả'}</option>
      {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  </div>
);

export const FilterDateInput = ({ label, value, onChange }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
    <label style={{ fontSize: 10, fontWeight: 700, color: '#64748b', letterSpacing: 0.4 }}>{label}</label>
    <input
      type="date"
      value={value}
      onChange={onChange}
      style={{ padding: '7px 10px', borderRadius: 7, border: '1.5px solid #cbd5e1', outline: 'none', background: 'white', fontSize: 12, width: 150 }}
    />
  </div>
);
