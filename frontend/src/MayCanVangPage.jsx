import { useEffect, useState } from 'react';
import AgentModal from './mayCanVang/AgentModal';
import { API, buttonStyle, cardStyle, defaultForm, formatDate, formatWeight } from './mayCanVang/shared';

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
      setNotice(form.id ? 'Đã cập nhật agent.' : 'Đã tạo agent mới.');
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
      setNotice('Đã xóa agent.');
      await loadAgents();
    } catch (error) {
      console.error(error);
      window.alert(error.message || 'Không xóa được agent.');
    }
  };

  const downloadAgentPy = () => {
    const link = document.createElement('a');
    link.href = `${API}/api/device-agent/script?download=1`;
    link.download = 'device_agent.py';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

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
          <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>Agent</div>
          <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
            Agent quản lý máy in, nhận lệnh in từ server, lấy dữ liệu từ máy cân vàng và gửi về server.
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
              <div style={{ padding: 30, textAlign: 'center', color: '#94a3b8' }}>Chưa có agent nào. Tạo agent trước rồi tải file Python về máy đang quản lý máy in và máy cân.</div>
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
            <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: 12 }}>Log dữ liệu cân gửi về server{selectedAgent ? ` · ${selectedAgent.device_name}` : ''}</div>
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
            <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: 10 }}>Tải agent</div>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>
              Tải file `device_agent.py` về máy Windows chạy agent để quản lý máy in, nhận lệnh in từ server và gửi dữ liệu cân về server.
            </div>
            <button type="button" onClick={downloadAgentPy} style={buttonStyle('#1d4ed8')}>
              Download agent .py
            </button>
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
