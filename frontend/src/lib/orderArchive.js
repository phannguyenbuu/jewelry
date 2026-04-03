const ORDER_LONG_TERM_ARCHIVE_KEY = 'jewelry.order_long_term_archive.v1';

export const getOrderArchiveKey = (order) => String(order?.ma_don || '').trim() || `id:${order?.id || ''}`;

export const readArchivedOrderKeys = () => {
  if (typeof window === 'undefined' || !window.localStorage) return new Set();
  try {
    const raw = JSON.parse(window.localStorage.getItem(ORDER_LONG_TERM_ARCHIVE_KEY) || '[]');
    return new Set(Array.isArray(raw) ? raw.map((item) => String(item || '').trim()).filter(Boolean) : []);
  } catch {
    return new Set();
  }
};

export const writeArchivedOrderKeys = (keys) => {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const normalized = Array.from(new Set((keys || []).map((item) => String(item || '').trim()).filter(Boolean)));
    window.localStorage.setItem(ORDER_LONG_TERM_ARCHIVE_KEY, JSON.stringify(normalized));
  } catch {
    // ignore storage errors
  }
};

export const archiveOrder = (order) => {
  const key = getOrderArchiveKey(order);
  if (!key) return;
  const next = readArchivedOrderKeys();
  next.add(key);
  writeArchivedOrderKeys(Array.from(next));
};

export const unarchiveOrder = (order) => {
  const key = getOrderArchiveKey(order);
  if (!key) return;
  const next = readArchivedOrderKeys();
  next.delete(key);
  writeArchivedOrderKeys(Array.from(next));
};

export const pruneArchivedOrderKeys = (orders) => {
  const existingKeys = new Set((orders || []).map(getOrderArchiveKey).filter(Boolean));
  const current = readArchivedOrderKeys();
  const next = new Set(Array.from(current).filter((key) => existingKeys.has(key)));
  if (next.size !== current.size) {
    writeArchivedOrderKeys(Array.from(next));
  }
  return next;
};
