/* eslint-disable react-refresh/only-export-components */
import { Fragment, useState } from 'react';
import { API_BASE } from '../lib/api';

const API = API_BASE;

const fmt = (n) => (n ? Number(n).toLocaleString('vi-VN') : '—');
const byName = (key) => (a, b) => (a?.[key] || '').localeCompare(b?.[key] || '', 'vi');

async function readJsonSafe(res, fallback = []) {
  try {
    const data = await res.json();
    return res.ok ? data : fallback;
  } catch {
    return fallback;
  }
}

async function readResponse(res) {
  let data = {};
  try {
    data = await res.json();
  } catch {
    data = {};
  }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function Modal({ open, onClose, title, children, maxWidth = 560 }) {
  if (!open) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: 16 }}>
      <div style={{ background: 'white', borderRadius: 16, width: '100%', maxWidth, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 60px rgba(0,0,0,.2)' }}>
        <div style={{ padding: '15px 22px', background: '#1e293b', borderRadius: '16px 16px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 1 }}>
          <span style={{ color: 'white', fontWeight: 800, fontSize: 15 }}>{title}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'white', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>&times;</button>
        </div>
        <div style={{ padding: 24 }}>{children}</div>
      </div>
    </div>
  );
}

function ConfirmModal({ open, onClose, onConfirm, message }) {
  if (!open) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2100, padding: 16 }}>
      <div style={{ background: 'white', borderRadius: 14, width: 380, boxShadow: '0 20px 50px rgba(0,0,0,.2)', padding: 28, textAlign: 'center' }}>
        <div style={{ fontSize: 38, marginBottom: 10 }}>⚠️</div>
        <p style={{ fontSize: 14, color: '#334155', margin: '0 0 22px', lineHeight: 1.6 }}>{message}</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button onClick={onClose} style={{ padding: '9px 22px', borderRadius: 8, border: '1.5px solid #cbd5e1', background: 'white', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>Huỷ</button>
          <button onClick={() => { onConfirm(); onClose(); }} style={{ padding: '9px 22px', borderRadius: 8, border: 'none', background: '#dc2626', color: 'white', fontWeight: 800, cursor: 'pointer', fontSize: 13 }}>Xác nhận xóa</button>
        </div>
      </div>
    </div>
  );
}

const Field = ({ label, children }) => (
  <div style={{ marginBottom: 14 }}>
    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 5, letterSpacing: 0.3 }}>{label}</label>
    {children}
  </div>
);

const inp = {
  padding: '8px 12px',
  borderRadius: 8,
  border: '1.5px solid #e2e8f0',
  outline: 'none',
  fontSize: 13,
  width: '100%',
  boxSizing: 'border-box',
};

const saveBtn = {
  padding: '9px 22px',
  borderRadius: 8,
  border: 'none',
  background: '#2563eb',
  color: 'white',
  fontWeight: 800,
  cursor: 'pointer',
  fontSize: 13,
};

const cancelBtn = {
  padding: '9px 20px',
  borderRadius: 8,
  border: '1.5px solid #cbd5e1',
  background: 'white',
  fontWeight: 700,
  cursor: 'pointer',
  fontSize: 13,
};

function BtnRow({ onClose, label = 'Lưu' }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
      <button type="button" onClick={onClose} style={cancelBtn}>Huỷ</button>
      <button type="submit" style={saveBtn}>{label}</button>
    </div>
  );
}

function HistPage({ manual, sjcHist, maxLen, totalPages, PAGE_SIZE, fmt: formatValue, delta }) {
  const [page, setPage] = useState(1);
  const start = (page - 1) * PAGE_SIZE;
  const pageRows = Array.from({ length: Math.min(PAGE_SIZE, maxLen - start) }, (_, i) => start + i);

  const HistRow = ({ h }) => (h ? (
    <div style={{ padding: '8px 10px', borderBottom: '1px solid #f1f5f9' }}>
      <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 3 }}>📅 {h.date}</div>
      <div style={{ fontSize: 12 }}>
        <span style={{ color: '#15803d', fontWeight: 700 }}>{formatValue(h.gia_ban)} ₫</span>
        <span style={{ color: '#94a3b8', margin: '0 4px' }}>/</span>
        <span style={{ color: '#c2410c', fontWeight: 700 }}>{formatValue(h.gia_mua)} ₫</span>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
        {h.delta_ban !== 0 && delta(h.delta_ban)}
        {h.delta_mua !== 0 && delta(h.delta_mua)}
      </div>
      {h.note && <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>💬 {h.note}</div>}
    </div>
  ) : <div style={{ padding: '8px 10px', color: '#e2e8f0', fontSize: 11, textAlign: 'center' }}>—</div>);

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ background: '#1e293b', color: 'white', padding: '9px 12px', fontWeight: 800, fontSize: 12, textAlign: 'center', borderRight: '1px solid rgba(255,255,255,.1)' }}>✏️ Giá tự chỉnh</div>
        <div style={{ background: '#0ea5e9', color: 'white', padding: '9px 12px', fontWeight: 800, fontSize: 12, textAlign: 'center' }}>📡 Giá theo SJC</div>
        {pageRows.map((i) => (
          <Fragment key={i}>
            <div style={{ borderRight: '1px solid #e2e8f0', background: i % 2 === 0 ? 'white' : '#f8fafc' }}><HistRow h={manual[i]} /></div>
            <div style={{ background: i % 2 === 0 ? '#f0f9ff' : '#e0f2fe' }}><HistRow h={sjcHist[i]} /></div>
          </Fragment>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
        <div style={{ fontSize: 11, color: '#94a3b8' }}>
          Tự chỉnh: {manual.length} lần · SJC sync: {sjcHist.length} lần
        </div>
        {totalPages > 1 && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              style={{ padding: '5px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', background: page === 1 ? '#f8fafc' : 'white', color: page === 1 ? '#cbd5e1' : '#1e293b', fontWeight: 700, cursor: page === 1 ? 'default' : 'pointer', fontSize: 12 }}
            >
              ‹ Trước
            </button>
            <span style={{ fontSize: 12, color: '#64748b', fontWeight: 700 }}>Trang {page} / {totalPages}</span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              style={{ padding: '5px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', background: page === totalPages ? '#f8fafc' : 'white', color: page === totalPages ? '#cbd5e1' : '#1e293b', fontWeight: 700, cursor: page === totalPages ? 'default' : 'pointer', fontSize: 12 }}
            >
              Sau ›
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export { API, fmt, byName, readJsonSafe, readResponse, Modal, ConfirmModal, Field, inp, saveBtn, cancelBtn, BtnRow, HistPage };
