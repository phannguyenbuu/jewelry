/* eslint-disable react-refresh/only-export-components */
import { API_BASE } from '../lib/api';

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
  device_name: 'Agent',
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

export { API, API_ROOT, inputStyle, labelStyle, cardStyle, buttonStyle, defaultForm, formatDate, formatWeight };
