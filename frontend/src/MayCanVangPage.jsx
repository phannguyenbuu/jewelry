import React, { useEffect, useState } from 'react';
import { API_BASE } from './lib/api';

const API = API_BASE;
const API_ROOT = API || (typeof window !== 'undefined' ? window.location.origin : '');

const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 10,
  border: '1.5px solid #dbe3ef',
  fontSize: 13,
  boxSizing: 'border-box',
  background: 'white',
};

const labelStyle = {
  fontSize: 11,
  fontWeight: 700,
  color: '#64748b',
  display: 'block',
  marginBottom: 6,
  textTransform: 'uppercase',
  letterSpacing: 0.4,
};

const cardStyle = {
  background: 'white',
  borderRadius: 18,
  border: '1px solid #e2e8f0',
  boxShadow: '0 10px 30px rgba(15,23,42,.05)',
};

const buttonStyle = (bg, color = 'white') => ({
  padding: '9px 16px',
  borderRadius: 10,
  border: 'none',
  background: bg,
  color,
  fontWeight: 700,
  cursor: 'pointer',
  fontSize: 13,
});

const defaultForm = () => ({
  id: null,
  device_name: 'Máy cân vàng',
  model: 'AND GP-20K',
  location: '',
  serial_port: 'COM3',
  baudrate: '2400',
  bytesize: '7',
  parity: 'E',
  stopbits: '1',
  timeout_seconds: '2.5',
  command: 'Q',
  line_ending: '\\r\\n',
  data_format: 'A&D',
});

const formatDate = (value) => value ? value : '—';
const formatWeight = (agent) => {
  if (!agent?.last_weight_text) return '—';
  return `${agent.last_weight_text}${agent.last_unit ? ` ${agent.last_unit}` : ''}`;
};

function AgentModal({ open, onClose, form, setForm, onSubmit, saving }) {
  if (!open) return null;

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.48)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={{ ...cardStyle, width: '100%', maxWidth: 860, maxHeight: '92vh', overflow: 'auto' }}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid #eef2f7', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 18, color: '#0f172a' }}>{form.id ? 'Cập nhật agent cân' : 'Tạo agent cân mới'}</div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>Thiết lập thông số server phát lệnh và cấu hình RS-232C mặc định cho GP-20K.</div>
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

export default function MayCanVangPage() {
  const [agents, setAgents] = useState([]);
  const [selectedAgentId, setSelectedAgentId] = useState(null);
  const [readings, setReadings] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(defaultForm());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyAction, setBusyAction] = useState('');
  const [notice, setNotice] = useState('');
  const [agentScript, setAgentScript] = useState('');
  const [scriptLoading, setScriptLoading] = useState(false);

  const selectedAgent = agents.find((agent) => agent.id === selectedAgentId) || agents[0] || null;

  const loadAgents = async () => {
    const response = await fetch(`${API}/api/scale/agents`);
    const data = await response.json();
    const list = Array.isArray(data) ? data : [];
    setAgents(list);
    setSelectedAgentId((prev) => {
      if (prev && list.some((agent) => agent.id === prev)) return prev;
      return list[0]?.id || null;
    });
  };

  const loadReadings = async (agentId) => {
    if (!agentId) {
      setReadings([]);
      return;
    }
    const response = await fetch(`${API}/api/scale/readings?agent_id=${agentId}&limit=25`);
    const data = await response.json();
    setReadings(Array.isArray(data) ? data : []);
  };

  useEffect(() => {
    let stopped = false;

    const run = async () => {
      try {
        setLoading(true);
        await loadAgents();
      } catch (error) {
        console.error(error);
      } finally {
        if (!stopped) setLoading(false);
      }
    };

    run();
    return () => { stopped = true; };
  }, []);

  useEffect(() => {
    let stopped = false;

    const run = async () => {
      try {
        setScriptLoading(true);
        const response = await fetch(`${API}/api/scale/agent/script`);
        if (!response.ok) throw new Error('Khong tai duoc script agent.');
        const text = await response.text();
        if (!stopped) setAgentScript(text);
      } catch (error) {
        console.error(error);
        if (!stopped) setAgentScript('# Khong tai duoc script agent Python.');
      } finally {
        if (!stopped) setScriptLoading(false);
      }
    };

    run();
    return () => { stopped = true; };
  }, []);

  useEffect(() => {
    loadReadings(selectedAgent?.id).catch(console.error);
  }, [selectedAgent?.id]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      loadAgents().catch(console.error);
      if (selectedAgent?.id) loadReadings(selectedAgent.id).catch(console.error);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [selectedAgent?.id]);

  const openCreate = () => {
    setForm(defaultForm());
    setModalOpen(true);
  };

  const openEdit = (agent) => {
    const settings = agent?.desired_settings || {};
    setForm({
      id: agent.id,
      device_name: agent.device_name || '',
      model: agent.model || 'AND GP-20K',
      location: agent.location || '',
      serial_port: agent.serial_port || 'COM3',
      baudrate: String(settings.baudrate ?? 2400),
      bytesize: String(settings.bytesize ?? 7),
      parity: settings.parity || 'E',
      stopbits: String(settings.stopbits ?? 1),
      timeout_seconds: String(settings.timeout_seconds ?? 2.5),
      command: settings.command || 'Q',
      line_ending: settings.line_ending || '\\r\\n',
      data_format: settings.data_format || 'A&D',
    });
    setModalOpen(true);
  };

  const saveAgent = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        device_name: form.device_name,
        model: form.model,
        location: form.location,
        serial_port: form.serial_port,
        desired_settings: {
          baudrate: Number(form.baudrate || 2400),
          bytesize: Number(form.bytesize || 7),
          parity: form.parity || 'E',
          stopbits: Number(form.stopbits || 1),
          timeout_seconds: Number(form.timeout_seconds || 2.5),
          command: form.command || 'Q',
          line_ending: form.line_ending || '\r\n',
          data_format: form.data_format || 'A&D',
        },
      };

      const url = form.id ? `${API}/api/scale/agents/${form.id}` : `${API}/api/scale/agents`;
      const method = form.id ? 'PUT' : 'POST';
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Không lưu được agent.');

      setModalOpen(false);
      setNotice(form.id ? 'Đã cập nhật agent cân.' : 'Đã tạo agent cân mới.');
      await loadAgents();
      setSelectedAgentId(data.id || data.agent?.id || data?.command?.agent_id || data?.id || selectedAgentId);
    } catch (error) {
      console.error(error);
      window.alert(error.message || 'Không lưu được agent.');
    } finally {
      setSaving(false);
    }
  };

  const requestRead = async (agentId, mode) => {
    setBusyAction(`${agentId}:${mode}`);
    try {
      const response = await fetch(`${API}/api/scale/agents/${agentId}/read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
      const data = await response.json();
      if (!response.ok && response.status !== 202) throw new Error(data.error || 'Không gửi được lệnh đọc cân.');
      setNotice(response.status === 202 ? 'Agent đang bận với lệnh trước đó.' : 'Đã phát lệnh đọc cân xuống agent.');
      await loadAgents();
    } catch (error) {
      console.error(error);
      window.alert(error.message || 'Không gửi được lệnh đọc cân.');
    } finally {
      setBusyAction('');
    }
  };

  const deleteAgent = async (agent) => {
    if (!window.confirm(`Xóa agent "${agent.device_name}"?`)) return;
    try {
      const response = await fetch(`${API}/api/scale/agents/${agent.id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Không xóa được agent.');
      setNotice('Đã xóa agent cân.');
      await loadAgents();
    } catch (error) {
      console.error(error);
      window.alert(error.message || 'Không xóa được agent.');
    }
  };

  const copyConfig = async () => {
    if (!selectedAgent) return;
    const payload = {
      server_url: API_ROOT,
      agent_key: selectedAgent.agent_key,
      device_name: selectedAgent.device_name,
      location: selectedAgent.location || '',
      poll_interval_seconds: 3,
      heartbeat_interval_seconds: 15,
      serial: {
        port: selectedAgent.serial_port || 'COM3',
        ...(selectedAgent.desired_settings || {}),
      },
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      setNotice('Đã copy cấu hình agent vào clipboard.');
    } catch (error) {
      console.error(error);
      window.alert('Không copy được cấu hình.');
    }
  };

  const downloadScript = () => {
    const link = document.createElement('a');
    link.href = `${API}/api/scale/agent/script?download=1`;
    link.download = 'scale_agent_gp20k.py';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const agentConfigText = selectedAgent ? JSON.stringify({
    server_url: API_ROOT,
    agent_key: selectedAgent.agent_key,
    device_name: selectedAgent.device_name,
    location: selectedAgent.location || '',
    poll_interval_seconds: 3,
    heartbeat_interval_seconds: 15,
    serial: {
      port: selectedAgent.serial_port || 'COM3',
      ...(selectedAgent.desired_settings || {}),
    },
  }, null, 2) : '';

  const onlineCount = agents.filter((agent) => agent.status === 'online').length;
  const pendingCount = agents.reduce((sum, agent) => sum + (agent.pending_commands || 0), 0);
  const inflightCount = agents.reduce((sum, agent) => sum + (agent.inflight_commands || 0), 0);

  return (
    <div style={{ padding: '20px 28px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 18 }}>
        {[
          { label: 'Tổng agent', value: agents.length, color: '#1d4ed8' },
          { label: 'Đang online', value: onlineCount, color: '#0f766e' },
          { label: 'Lệnh chờ', value: pendingCount, color: '#b45309' },
          { label: 'Đang xử lý', value: inflightCount, color: '#7c3aed' },
        ].map((item) => (
          <div key={item.label} style={{ ...cardStyle, padding: '16px 18px' }}>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>{item.label}</div>
            <div style={{ fontSize: 28, fontWeight: 900, color: item.color }}>{item.value}</div>
          </div>
        ))}
      </div>

      <div style={{ ...cardStyle, padding: '16px 18px', marginBottom: 18, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>Máy cân vàng</div>
          <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
            Agent Python sẽ chạy tại máy cắm cân, nhận lệnh từ server và trả dữ liệu cân về web admin.
          </div>
        </div>
        {notice && <div style={{ fontSize: 12, color: '#0f766e', fontWeight: 700 }}>{notice}</div>}
        <button onClick={() => { setNotice(''); loadAgents().catch(console.error); if (selectedAgent?.id) loadReadings(selectedAgent.id).catch(console.error); }} style={buttonStyle('#e2e8f0', '#334155')}>Làm mới</button>
        <button onClick={openCreate} style={buttonStyle('#0f766e')}>+ Tạo agent</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(340px, 1.1fr) minmax(320px, .9fr)', gap: 18, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ ...cardStyle, padding: 16 }}>
            <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: 14 }}>Danh sách agent</div>
            {loading && agents.length === 0 ? (
              <div style={{ padding: 30, textAlign: 'center', color: '#94a3b8' }}>Đang tải dữ liệu...</div>
            ) : agents.length === 0 ? (
              <div style={{ padding: 30, textAlign: 'center', color: '#94a3b8' }}>Chưa có agent nào. Tạo agent trước rồi cài script Python lên máy cân.</div>
            ) : (
              <div style={{ display: 'grid', gap: 12 }}>
                {agents.map((agent) => {
                  const active = selectedAgent?.id === agent.id;
                  const statusColor = agent.status === 'online' ? { bg: '#dcfce7', text: '#166534' } : { bg: '#fee2e2', text: '#991b1b' };
                  return (
                    <div
                      key={agent.id}
                      onClick={() => setSelectedAgentId(agent.id)}
                      style={{
                        borderRadius: 16,
                        border: active ? '1.5px solid #0f766e' : '1px solid #e2e8f0',
                        background: active ? '#f0fdfa' : '#fff',
                        padding: 16,
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ display: 'flex', gap: 12, justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ fontWeight: 800, color: '#0f172a', fontSize: 15 }}>{agent.device_name}</div>
                          <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>{agent.model} · {agent.location || 'Chưa gán vị trí'}</div>
                        </div>
                        <span style={{ background: statusColor.bg, color: statusColor.text, borderRadius: 999, padding: '4px 10px', fontSize: 11, fontWeight: 700 }}>
                          {agent.status === 'online' ? 'Online' : 'Offline'}
                        </span>
                      </div>

                      <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, fontSize: 12, color: '#475569' }}>
                        <div><strong>Agent key:</strong> {agent.agent_key}</div>
                        <div><strong>COM:</strong> {agent.serial_port || '—'}</div>
                        <div><strong>Máy:</strong> {agent.machine_name || '—'}</div>
                        <div><strong>Lần đọc cuối:</strong> {formatDate(agent.last_read_at)}</div>
                        <div><strong>Giá trị cuối:</strong> {formatWeight(agent)}</div>
                        <div><strong>Last seen:</strong> {formatDate(agent.last_seen)}</div>
                      </div>

                      {agent.last_error && (
                        <div style={{ marginTop: 10, padding: '9px 10px', borderRadius: 10, background: '#fff7ed', color: '#9a3412', fontSize: 12 }}>
                          Lỗi gần nhất: {agent.last_error}
                        </div>
                      )}

                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); requestRead(agent.id, 'immediate'); }}
                          disabled={busyAction === `${agent.id}:immediate`}
                          style={buttonStyle('#1d4ed8')}
                        >
                          {busyAction === `${agent.id}:immediate` ? 'Đang gửi...' : 'Đọc ngay'}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); requestRead(agent.id, 'stable'); }}
                          disabled={busyAction === `${agent.id}:stable`}
                          style={buttonStyle('#7c3aed')}
                        >
                          {busyAction === `${agent.id}:stable` ? 'Đang gửi...' : 'Đọc ổn định'}
                        </button>
                        <button type="button" onClick={(e) => { e.stopPropagation(); openEdit(agent); }} style={buttonStyle('#e2e8f0', '#334155')}>Cấu hình</button>
                        <button type="button" onClick={(e) => { e.stopPropagation(); deleteAgent(agent); }} style={buttonStyle('#fee2e2', '#b91c1c')}>Xóa</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div style={{ ...cardStyle, padding: 16 }}>
            <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: 12 }}>Log dữ liệu cân{selectedAgent ? ` · ${selectedAgent.device_name}` : ''}</div>
            {selectedAgent ? (
              readings.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>Chưa có lần đọc nào từ agent này.</div>
              ) : (
                <div style={{ display: 'grid', gap: 10 }}>
                  {readings.map((reading) => {
                    const stableColor = reading.stable ? { bg: '#dcfce7', text: '#166534' } : { bg: '#fef3c7', text: '#92400e' };
                    return (
                      <div key={reading.id} style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: '12px 14px', background: '#fbfdff' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                          <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>
                            {reading.weight_text || '—'} {reading.unit || ''}
                          </div>
                          <span style={{ background: stableColor.bg, color: stableColor.text, borderRadius: 999, padding: '4px 10px', fontSize: 11, fontWeight: 700 }}>
                            {reading.stable ? 'Ổn định' : 'Chưa ổn định'}
                          </span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, marginTop: 10, fontSize: 12, color: '#475569' }}>
                          <div><strong>Header:</strong> {reading.header || '—'}</div>
                          <div><strong>Value:</strong> {reading.weight_value ?? '—'}</div>
                          <div><strong>Raw:</strong> {reading.raw_line || '—'}</div>
                          <div><strong>Thời gian:</strong> {reading.created_at}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            ) : (
              <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>Chọn agent để xem log.</div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ ...cardStyle, padding: 16 }}>
            <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: 10 }}>Cấu hình cài trên máy cân</div>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>
              Cài agent Python lên máy Windows đang nối RS-232C / USB-COM với GP-20K, sau đó dùng cấu hình bên dưới.
            </div>
            <textarea
              readOnly
              value={agentConfigText}
              style={{ ...inputStyle, minHeight: 300, fontFamily: "Consolas, 'Courier New', monospace", fontSize: 12, lineHeight: 1.6, resize: 'vertical' }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <button type="button" disabled={!selectedAgent} onClick={copyConfig} style={buttonStyle('#0f766e')}>Copy cấu hình</button>
              {selectedAgent && (
                <button type="button" onClick={() => requestRead(selectedAgent.id, 'immediate')} style={buttonStyle('#1d4ed8')}>Đọc agent đang chọn</button>
              )}
            </div>
          </div>

          <div style={{ ...cardStyle, padding: 16 }}>
            <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: 10 }}>Quy trình triển khai</div>
            <div style={{ display: 'grid', gap: 10, fontSize: 13, color: '#475569', lineHeight: 1.6 }}>
              <div>1. Tạo agent trong tab này để lấy `agent_key`.</div>
              <div>2. Cắm cân A&D GP-20K vào máy Windows qua RS-232C hoặc bộ chuyển USB-COM.</div>
              <div>3. Cài `pyserial` và `requests`, chạy script agent Python với file config vừa copy.</div>
              <div>4. Khi agent online, bấm `Đọc ngay` hoặc `Đọc ổn định` từ server để lấy dữ liệu.</div>
            </div>
          </div>
          <div style={{ ...cardStyle, padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontWeight: 800, color: '#0f172a' }}>Script agent Python</div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                  Xem nhanh nội dung script và tải file `.py` về máy đang kết nối máy cân.
                </div>
              </div>
              <button type="button" onClick={downloadScript} style={buttonStyle('#1d4ed8')}>
                Download script .py
              </button>
            </div>
            <div style={{ border: '1px solid #dbe3ef', borderRadius: 12, background: '#0f172a', color: '#e2e8f0', maxHeight: 420, overflowY: 'auto', overflowX: 'auto', padding: 14 }}>
              <pre style={{ margin: 0, fontFamily: "Consolas, 'Courier New', monospace", fontSize: 12, lineHeight: 1.55, whiteSpace: 'pre' }}>
                {scriptLoading ? '# Dang tai script...' : agentScript}
              </pre>
            </div>
          </div>
        </div>
      </div>

      <AgentModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        form={form}
        setForm={setForm}
        onSubmit={saveAgent}
        saving={saving}
      />
    </div>
  );
}
