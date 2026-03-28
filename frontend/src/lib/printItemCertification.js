const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const formatWeight = (value) => {
  if (value === null || value === undefined || value === '') return '—';
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value);
  return num.toFixed(4).replace(/\.?0+$/, '');
};

const formatMoney = (value) => {
  const num = Number(value || 0);
  if (!Number.isFinite(num) || num <= 0) return '—';
  return `${num.toLocaleString('vi-VN')} ₫`;
};

const buildRow = (label, value) => `
  <div class="row">
    <div class="label">${escapeHtml(label)}</div>
    <div class="value">${escapeHtml(value || '—')}</div>
  </div>
`;

const buildCertificationHtml = (item, options = {}) => {
  const title = options.title || 'Certification / Tem sản phẩm';
  const printedAt = new Date().toLocaleString('vi-VN');
  const rows = [
    ['Mã hàng', item?.ma_hang],
    ['Tên hàng', item?.ncc],
    ['Nhóm hàng', item?.nhom_hang],
    ['Quầy nhỏ', item?.quay_nho],
    ['Tuổi vàng', item?.tuoi_vang],
    ['Trọng lượng đá', formatWeight(item?.tl_da)],
    ['Trọng lượng vàng', formatWeight(item?.tl_vang)],
    ['Tổng trọng lượng', formatWeight(item?.tong_tl)],
    ['Công lẻ', item?.cong_le],
    ['Công sỉ', item?.cong_si],
    ['Giá hiện tại', formatMoney(item?.gia_hien_tai)],
  ];
  const ocrText = String(item?.ocr_text || '').trim();

  return `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page { size: A6 portrait; margin: 8mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Be Vietnam Pro", "Segoe UI", sans-serif;
      color: #0f172a;
      background: #ffffff;
    }
    .sheet {
      border: 1px solid #dbe4ee;
      border-radius: 18px;
      padding: 14px;
    }
    .head {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: flex-start;
      margin-bottom: 12px;
    }
    .title {
      font-size: 18px;
      font-weight: 900;
      line-height: 1.2;
      margin: 0 0 4px;
    }
    .sub {
      font-size: 11px;
      color: #64748b;
    }
    .code {
      padding: 6px 10px;
      border-radius: 999px;
      background: #eff6ff;
      color: #1d4ed8;
      font-size: 11px;
      font-weight: 800;
      white-space: nowrap;
    }
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }
    .row {
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 8px 10px;
      min-height: 58px;
    }
    .label {
      font-size: 10px;
      font-weight: 700;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: .04em;
      margin-bottom: 4px;
    }
    .value {
      font-size: 14px;
      font-weight: 800;
      line-height: 1.3;
      word-break: break-word;
    }
    .ocr {
      margin-top: 10px;
      border-radius: 12px;
      border: 1px dashed #cbd5e1;
      background: #f8fafc;
      padding: 10px;
    }
    .ocr .value {
      font-size: 11px;
      font-weight: 600;
      white-space: pre-wrap;
    }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="head">
      <div>
        <div class="title">${escapeHtml(title)}</div>
        <div class="sub">In lúc ${escapeHtml(printedAt)}</div>
      </div>
      <div class="code">${escapeHtml(item?.ma_hang || 'Chưa có mã')}</div>
    </div>
    <div class="grid">
      ${rows.map(([label, value]) => buildRow(label, value)).join('')}
    </div>
    ${ocrText ? `
      <div class="ocr">
        <div class="label">OCR tem</div>
        <div class="value">${escapeHtml(ocrText)}</div>
      </div>
    ` : ''}
  </div>
  <script>
    window.addEventListener('load', () => {
      window.focus();
      setTimeout(() => window.print(), 120);
    });
    window.addEventListener('afterprint', () => window.close());
  </script>
</body>
</html>`;
};

export const printItemCertification = (item, options = {}) => {
  if (typeof window === 'undefined') return false;
  const printWindow = window.open('', '_blank', 'width=900,height=700');
  if (!printWindow) {
    window.alert('Trình duyệt đang chặn cửa sổ in.');
    return false;
  }
  printWindow.document.open();
  printWindow.document.write(buildCertificationHtml(item, options));
  printWindow.document.close();
  return true;
};
