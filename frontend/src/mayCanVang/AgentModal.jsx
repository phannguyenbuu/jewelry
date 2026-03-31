import { buttonStyle, cardStyle, inputStyle, labelStyle } from './shared';

export default function AgentModal({ open, onClose, form, setForm, onSubmit, saving }) {
  if (!open) return null;

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.48)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={{ ...cardStyle, width: '100%', maxWidth: 860, maxHeight: '92vh', overflow: 'auto' }}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid #eef2f7', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 18, color: '#0f172a' }}>{form.id ? 'Cập nhật agent' : 'Tạo agent mới'}</div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>Agent này nhận lệnh in từ server, quét máy in LAN và lấy dữ liệu từ máy cân để gửi ngược về server.</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 24, cursor: 'pointer' }}>×</button>
        </div>

        <form onSubmit={onSubmit} style={{ padding: 22 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
            <div>
              <label style={labelStyle}>Tên thiết bị</label>
              <input style={inputStyle} value={form.device_name} onChange={(e) => setForm({ ...form, device_name: e.target.value })} required />
            </div>
            <div>
              <label style={labelStyle}>Model</label>
              <input style={inputStyle} value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} required />
            </div>
            <div>
              <label style={labelStyle}>Vị trí</label>
              <input style={inputStyle} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Quầy 1 / Phòng cân" />
            </div>
            <div>
              <label style={labelStyle}>Cổng COM mặc định</label>
              <input style={inputStyle} value={form.serial_port} onChange={(e) => setForm({ ...form, serial_port: e.target.value })} placeholder="COM3" />
            </div>
            <div>
              <label style={labelStyle}>Baudrate</label>
              <input style={inputStyle} type="number" value={form.baudrate} onChange={(e) => setForm({ ...form, baudrate: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>Data bits</label>
              <select style={inputStyle} value={form.bytesize} onChange={(e) => setForm({ ...form, bytesize: e.target.value })}>
                <option value="7">7</option>
                <option value="8">8</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Parity</label>
              <select style={inputStyle} value={form.parity} onChange={(e) => setForm({ ...form, parity: e.target.value })}>
                <option value="E">Even (E)</option>
                <option value="N">None (N)</option>
                <option value="O">Odd (O)</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Stop bits</label>
              <select style={inputStyle} value={form.stopbits} onChange={(e) => setForm({ ...form, stopbits: e.target.value })}>
                <option value="1">1</option>
                <option value="2">2</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Timeout đọc (giây)</label>
              <input style={inputStyle} type="number" step="0.1" value={form.timeout_seconds} onChange={(e) => setForm({ ...form, timeout_seconds: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>Lệnh serial mặc định</label>
              <select style={inputStyle} value={form.command} onChange={(e) => setForm({ ...form, command: e.target.value })}>
                <option value="Q">Q - Đọc ngay</option>
                <option value="S">S - Đợi ổn định</option>
                <option value="SI">SI - Đọc ngay (serial)</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Line ending</label>
              <input style={inputStyle} value={form.line_ending} onChange={(e) => setForm({ ...form, line_ending: e.target.value })} placeholder="\\r\\n" />
            </div>
            <div>
              <label style={labelStyle}>Data format</label>
              <input style={inputStyle} value={form.data_format} onChange={(e) => setForm({ ...form, data_format: e.target.value })} placeholder="A&D" />
            </div>
          </div>

          <div style={{ marginTop: 18, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: '12px 14px', fontSize: 12, color: '#475569', lineHeight: 1.6 }}>
            Mặc định theo manual A&D GP series: `2400 bps`, `7 bit`, `Even parity`, `CRLF`, `A&D standard format`.
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
            <button type="button" onClick={onClose} style={buttonStyle('#e2e8f0', '#334155')}>Hủy</button>
            <button type="submit" disabled={saving} style={buttonStyle('#0f766e')}>
              {saving ? 'Đang lưu...' : (form.id ? 'Lưu thay đổi' : 'Tạo agent')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
