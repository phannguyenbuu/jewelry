const REMOTE_API_BASE = 'https://jewelry.n-lux.com';

export function getApiBase() {
  const override = import.meta.env.VITE_API_BASE_URL;
  if (override && override.trim()) {
    return override.replace(/\/$/, '');
  }

  if (typeof window !== 'undefined') {
    const { hostname } = window.location;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return REMOTE_API_BASE;
    }
  }

  return '';
}

export const API_BASE = getApiBase();
