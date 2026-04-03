const fmt = (n) => n ? Number(n).toLocaleString('vi-VN') : '0';
const pad2 = (value) => String(value).padStart(2, '0');
const parseOrderDateValue = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const normalized = raw.replace('T', ' ').replace(/\.\d+$/, '');
  const matched = normalized.match(/^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (matched) {
    const [, year, month, day, hour = '00', minute = '00', second = '00'] = matched;
    return new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
    );
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const splitOrderDateDisplay = (value) => {
  const date = parseOrderDateValue(value);
  if (!date || Number.isNaN(date.getTime())) {
    return {
      dateText: String(value || '').trim() || '-',
      timeText: '--:--:--',
    };
  }
  return {
    dateText: `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`,
    timeText: `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`,
  };
};

const STATUS_CFG = {
  'Mới': { bg: '#dbeafe', text: '#1d4ed8', dot: '#3b82f6' },
  'Xử lý': { bg: '#fef3c7', text: '#92400e', dot: '#f59e0b' },
  'Hoàn thành': { bg: '#dcfce7', text: '#166534', dot: '#16a34a' },
  'Hủy': { bg: '#fee2e2', text: '#991b1b', dot: '#dc2626' },
};

const LOAI_DON = [
  { key: 'Mua', icon: '🛒', color: '#6366f1', bg: '#eef2ff' },
  { key: 'Bán', icon: '💰', color: '#16a34a', bg: '#f0fdf4' },
  { key: 'Trao đổi', icon: '🔄', color: '#ea580c', bg: '#fff7ed' },
];

function StatusBadge({ s }) {
  const cfg = STATUS_CFG[s] || { bg: '#f1f5f9', text: '#64748b', dot: '#94a3b8' };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: cfg.bg, color: cfg.text, borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 700 }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.dot, display: 'inline-block' }} />
      {s}
    </span>
  );
}

function LoaiBadge({ l }) {
  const cfg = LOAI_DON.find((x) => x.key === l) || LOAI_DON[0];
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: cfg.bg, color: cfg.color, borderRadius: 20, padding: '3px 9px', fontSize: 11, fontWeight: 700 }}>{cfg.icon} {l}</span>;
}

export default function OrderListTable({
  orders = [],
  emptyText = 'Chưa có đơn hàng',
  onArchive,
  onDelete,
  onEdit,
  onRowClick,
}) {
  return (
    <div style={{ background: 'white', borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: '#f8fafc' }}>
            {['Mã đơn', 'Loại', 'Khách hàng', 'Ngày đặt', 'Tổng tiền', 'Tiền mặt', 'Trạng thái', ''].map((h) => (
              <th key={h} style={{ padding: '11px 14px', textAlign: 'left', fontWeight: 700, fontSize: 11, color: '#64748b', borderBottom: '1.5px solid #e2e8f0', whiteSpace: 'nowrap' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {orders.length === 0 && (
            <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>{emptyText}</td></tr>
          )}
          {orders.map((d, i) => (
            <tr
              key={d.id || d.ma_don}
              style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? 'white' : '#fafafa' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#f0f9ff'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = i % 2 === 0 ? 'white' : '#fafafa'; }}
            >
              <td
                style={{ padding: '10px 14px', fontWeight: 700, color: '#6366f1', cursor: onRowClick ? 'pointer' : 'default' }}
                onClick={() => onRowClick?.(d)}
              >
                {d.ma_don}
              </td>
              <td style={{ padding: '10px 14px' }}><LoaiBadge l={d.loai_don || 'Mua'} /></td>
              <td style={{ padding: '10px 14px' }}>
                <div style={{ fontWeight: 600 }}>{d.khach_hang}</div>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>{d.so_dien_thoai}{d.cccd && ` · CCCD: ${d.cccd}`}</div>
              </td>
              <td style={{ padding: '10px 14px', color: '#64748b' }}>
                <div>{splitOrderDateDisplay(d.ngay_dat).dateText}</div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{splitOrderDateDisplay(d.ngay_dat).timeText}</div>
              </td>
              <td style={{ padding: '10px 14px', fontWeight: 700, color: '#16a34a' }}>{fmt(d.tong_tien)} ₫</td>
              <td style={{ padding: '10px 14px', color: '#c2410c' }}>{fmt(d.dat_coc)} ₫</td>
              <td style={{ padding: '10px 14px' }}><StatusBadge s={d.trang_thai} /></td>
              <td style={{ padding: '10px 14px' }}>
                <div style={{ display: 'flex', gap: 6 }}>
                  {onArchive ? (
                    <button onClick={() => onArchive(d)} title="Đưa vào Hộp Lưu Trữ Lâu Dài" style={{ padding: '5px 10px', fontSize: 11, borderRadius: 8, border: 'none', background: '#fff7ed', color: '#c2410c', fontWeight: 700, cursor: 'pointer' }}>🗃</button>
                  ) : null}
                  {onEdit ? (
                    <button onClick={() => onEdit(d)} style={{ padding: '5px 10px', fontSize: 11, borderRadius: 8, border: 'none', background: '#f1f5f9', color: '#475569', fontWeight: 700, cursor: 'pointer' }}>✏️</button>
                  ) : null}
                  {onDelete ? (
                    <button onClick={() => onDelete(d)} style={{ padding: '5px 10px', fontSize: 11, borderRadius: 8, border: 'none', background: '#fee2e2', color: '#dc2626', fontWeight: 700, cursor: 'pointer' }}>🗑</button>
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
