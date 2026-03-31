import { useEffect, useRef, useState } from 'react';
import { API, readJsonSafe, readResponse } from './shared';


function normalizeAscii(text) {
    return String(text || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\u0111/g, 'd')
        .replace(/\u0110/g, 'D')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

function parseTuoiPermille(text) {
    const value = normalizeAscii(text);
    if (!value) return null;
    const fourDigit = value.match(/\b(\d{4})\b/);
    if (fourDigit) return Math.round(Number(fourDigit[1]) / 10);
    const threeDigit = value.match(/\b(\d{3})\b/);
    if (threeDigit) return Number(threeDigit[1]);
    const karat = value.match(/(\d+(?:[.,]\d+)?)\s*k\b/);
    if (karat) return Math.round((Number(karat[1].replace(',', '.')) / 24) * 1000);
    const pct = value.match(/(\d+(?:[.,]\d+)?)\s*%/);
    if (pct) return Math.round(Number(pct[1].replace(',', '.')) * 10);
    const small = value.match(/\b(\d+(?:[.,]\d+)?)\b/);
    if (!small) return null;
    const num = Number(small[1].replace(',', '.'));
    return num <= 100 ? Math.round(num * 10) : null;
}

const fmtDensity = n => Number(n || 0)
    ? Number(n).toLocaleString('vi-VN', { minimumFractionDigits: 0, maximumFractionDigits: 4 })
    : '—';

function normalizeExchangeCell(value) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        return {
            plus: value.plus ?? '',
            minus: value.minus ?? '',
        };
    }
    return { plus: '', minus: '' };
}

function normalizeExchangeMatrix(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.entries(value).reduce((acc, [key, cell]) => {
        const normalized = normalizeExchangeCell(cell);
        if (normalized.plus || normalized.minus) acc[key] = normalized;
        return acc;
    }, {});
}

function readLocalExchangeMatrix(storageKey) {
    try {
        return normalizeExchangeMatrix(JSON.parse(localStorage.getItem(storageKey) || '{}'));
    } catch {
        return {};
    }
}

export default function TraoDoiTabV2() {
    const STORAGE_KEY = 'don_hang_exchange_matrix_tuoi_vang_v2';
    const [list, setList] = useState([]);
    const [matrix, setMatrix] = useState({});
    const [, setLoading] = useState(true);
    const [bootstrapped, setBootstrapped] = useState(false);
    const [, setSyncStatus] = useState('loading');
    const [, setSyncError] = useState('');
    const lastSavedJsonRef = useRef('{}');

    useEffect(() => {
        let active = true;
        (async () => {
            const localMatrix = readLocalExchangeMatrix(STORAGE_KEY);
            try {
                const [rowsRes, configRes] = await Promise.all([
                    fetch(`${API}/api/tuoi_vang`),
                    fetch(`${API}/api/cau_hinh/trao_doi_tuoi_vang`),
                ]);
                const rows = await readJsonSafe(rowsRes, []);
                const config = await readResponse(configRes);
                if (!active) return;
                const sortedRows = rows.sort((a, b) => {
                    const av = parseTuoiPermille(a.ten_tuoi) ?? Number.MAX_SAFE_INTEGER;
                    const bv = parseTuoiPermille(b.ten_tuoi) ?? Number.MAX_SAFE_INTEGER;
                    return av - bv || String(a.ten_tuoi || '').localeCompare(String(b.ten_tuoi || ''), 'vi');
                });
                const serverMatrix = normalizeExchangeMatrix(config.matrix);
                const shouldMigrateLocal = Object.keys(serverMatrix).length === 0 && Object.keys(localMatrix).length > 0;
                const nextMatrix = shouldMigrateLocal ? localMatrix : serverMatrix;
                const nextJson = JSON.stringify(nextMatrix);
                setList(sortedRows);
                setMatrix(nextMatrix);
                localStorage.setItem(STORAGE_KEY, nextJson);
                lastSavedJsonRef.current = shouldMigrateLocal ? '{}' : nextJson;
                setSyncStatus(shouldMigrateLocal ? 'pending' : 'saved');
                setSyncError('');
            } catch (err) {
                if (!active) return;
                setMatrix(localMatrix);
                localStorage.setItem(STORAGE_KEY, JSON.stringify(localMatrix));
                lastSavedJsonRef.current = JSON.stringify(localMatrix);
                setSyncStatus('error');
                setSyncError(err.message || 'Khong the tai cau hinh trao doi tu database.');
                fetch(`${API}/api/tuoi_vang`)
                    .then(r => readJsonSafe(r, []))
                    .then(rows => {
                        if (!active) return;
                        setList(rows.sort((a, b) => {
                            const av = parseTuoiPermille(a.ten_tuoi) ?? Number.MAX_SAFE_INTEGER;
                            const bv = parseTuoiPermille(b.ten_tuoi) ?? Number.MAX_SAFE_INTEGER;
                            return av - bv || String(a.ten_tuoi || '').localeCompare(String(b.ten_tuoi || ''), 'vi');
                        }));
                    })
                    .catch(() => { });
            } finally {
                if (active) {
                    setLoading(false);
                    setBootstrapped(true);
                }
            }
        })();
        return () => { active = false; };
    }, []);

    useEffect(() => {
        if (!bootstrapped) return;
        const normalizedMatrix = normalizeExchangeMatrix(matrix);
        const nextJson = JSON.stringify(normalizedMatrix);
        localStorage.setItem(STORAGE_KEY, nextJson);
        if (nextJson === lastSavedJsonRef.current) return;
        setSyncStatus('saving');
        const timer = setTimeout(async () => {
            try {
                const res = await fetch(`${API}/api/cau_hinh/trao_doi_tuoi_vang`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ matrix: normalizedMatrix }),
                });
                const payload = await readResponse(res);
                const savedMatrix = normalizeExchangeMatrix(payload.matrix);
                const savedJson = JSON.stringify(savedMatrix);
                lastSavedJsonRef.current = savedJson;
                localStorage.setItem(STORAGE_KEY, savedJson);
                setMatrix(current => {
                    const currentJson = JSON.stringify(normalizeExchangeMatrix(current));
                    return currentJson === nextJson ? savedMatrix : current;
                });
                setSyncStatus('saved');
                setSyncError('');
            } catch (err) {
                setSyncStatus('error');
                setSyncError(err.message || 'Khong the luu cau hinh trao doi vao database.');
            }
        }, 350);
        return () => clearTimeout(timer);
    }, [bootstrapped, matrix]);

    const cellKey = (rId, cId) => `${rId}_${cId}`;

    const handleChange = (rId, cId, field, val) => {
        setMatrix(m => {
            const key = cellKey(rId, cId);
            const current = normalizeExchangeCell(m[key]);
            const nextCell = normalizeExchangeCell({
                ...current,
                [field]: val,
            });
            if (!nextCell.plus && !nextCell.minus) {
                const nextMatrix = { ...m };
                delete nextMatrix[key];
                return nextMatrix;
            }
            return {
                ...m,
                [key]: nextCell,
            };
        });
    };

    const handleReset = () => {
        if (!window.confirm('Reset toàn bộ bảng tỷ lệ?')) return;
        setMatrix({});
        localStorage.removeItem(STORAGE_KEY);
    };




    return (
        <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
                <div>
                    <div style={{ fontWeight: 800, fontSize: 16, color: '#1e293b' }}>🔄 Bảng trao đổi theo tuổi vàng</div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                        Hàng = tuổi vàng mang đến · Cột = tuổi vàng đổi sang · Mỗi ô gồm 2 giá trị: `+` màu đỏ và `-` màu xanh lá. Dữ liệu được lưu sống khi nhập.
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 700 }}>Tự lưu</span>
                    <button onClick={handleReset} style={{ padding: '7px 14px', borderRadius: 8, border: '1.5px solid #fca5a5', background: '#fff1f2', color: '#dc2626', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                        🗑 Reset
                    </button>
                </div>
            </div>

            {list.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 0', color: '#94a3b8', background: 'white', borderRadius: 14, border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: 36, marginBottom: 12 }}>🪙</div>
                    <div style={{ fontWeight: 700 }}>Chưa có tuổi vàng nào</div>
                    <div style={{ fontSize: 12, marginTop: 6 }}>Hãy thêm tuổi vàng trong tab <strong>Tuổi vàng</strong></div>
                </div>
            ) : (
                <div style={{ background: 'white', borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'auto', boxShadow: '0 1px 4px rgba(0,0,0,.04)' }}>
                    <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                        <thead>
                            <tr>
                                <th style={{
                                    background: '#f8fafc', border: '1.5px solid #e2e8f0',
                                    padding: '12px 16px', fontSize: 10, color: '#94a3b8',
                                    fontWeight: 700, textAlign: 'center', minWidth: 136,
                                    position: 'sticky', left: 0, zIndex: 2,
                                }}>
                                    <div style={{ color: '#64748b' }}>Mang đến ↓</div>
                                    <div style={{ borderTop: '1px dashed #e2e8f0', marginTop: 5, paddingTop: 5 }}>Đổi sang →</div>
                                </th>
                                {list.map(col => (
                                    <th key={col.id} style={{
                                        background: '#1e293b', color: 'white',
                                        padding: '10px 8px', fontWeight: 800, fontSize: 12,
                                        textAlign: 'center', border: '1px solid #334155',
                                        minWidth: 128, whiteSpace: 'nowrap',
                                    }}>
                                        <div>{col.ten_tuoi}</div>
                                        <div style={{ fontSize: 10, fontWeight: 400, color: '#94a3b8', marginTop: 2 }}>
                                            {fmtDensity(col.trong_luong_rieng)} g/cm³
                                        </div>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {list.map((row, ri) => (
                                <tr key={row.id}>
                                    <td style={{
                                        background: '#1e293b', color: 'white',
                                        padding: '10px 16px', fontWeight: 700, fontSize: 13,
                                        border: '1px solid #334155', whiteSpace: 'nowrap',
                                        position: 'sticky', left: 0, zIndex: 1,
                                    }}>
                                        <div>{row.ten_tuoi}</div>
                                        <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 400, marginTop: 2 }}>
                                            {fmtDensity(row.trong_luong_rieng)} g/cm³
                                        </div>
                                    </td>
                                    {list.map(col => {
                                        const isDiag = row.id === col.id;
                                        const cell = normalizeExchangeCell(matrix[cellKey(row.id, col.id)]);
                                        return (
                                            <td key={col.id} style={{
                                                padding: 4, textAlign: 'center',
                                                background: isDiag ? '#f1f5f9' : (ri % 2 === 0 ? 'white' : '#fafafa'),
                                                border: '1px solid #e2e8f0',
                                            }}>
                                                {isDiag ? (
                                                    <>
                                                        <div style={{ position: 'relative', minWidth: 0 }}>
                                                            <span style={{
                                                                position: 'absolute', left: 6, top: '50%', transform: 'translateY(-50%)',
                                                                fontSize: 12, fontWeight: 900, color: '#dc2626',
                                                            }}>+</span>
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                step="0.001"
                                                                value={cell.plus}
                                                                onChange={e => handleChange(row.id, col.id, 'plus', e.target.value)}
                                                                placeholder="0.000"
                                                                style={{
                                                                    width: '100%', height: 32, boxSizing: 'border-box',
                                                                    textAlign: 'center', fontSize: 11, fontWeight: 700,
                                                                    border: cell.plus ? '1.5px solid #fca5a5' : '1.5px solid #fecaca',
                                                                    borderRadius: 8, outline: 'none', padding: '0 6px 0 18px',
                                                                    background: cell.plus ? '#fff1f2' : '#fff5f5',
                                                                    color: '#dc2626',
                                                                }}
                                                            />
                                                        </div>
                                                        
                                                    </>
                                                ) : (
                                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                                                        <div style={{ position: 'relative', minWidth: 0 }}>
                                                            <span style={{
                                                                position: 'absolute', left: 6, top: '50%', transform: 'translateY(-50%)',
                                                                fontSize: 12, fontWeight: 900, color: '#dc2626',
                                                            }}>+</span>
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                step="0.001"
                                                                value={cell.plus}
                                                                onChange={e => handleChange(row.id, col.id, 'plus', e.target.value)}
                                                                placeholder="0.000"
                                                                style={{
                                                                    width: '100%', height: 32, boxSizing: 'border-box',
                                                                    textAlign: 'center', fontSize: 11, fontWeight: 700,
                                                                    border: cell.plus ? '1.5px solid #fca5a5' : '1.5px solid #fecaca',
                                                                    borderRadius: 8, outline: 'none', padding: '0 6px 0 18px',
                                                                    background: cell.plus ? '#fff1f2' : '#fff5f5',
                                                                    color: '#dc2626',
                                                                }}
                                                            />
                                                        </div>
                                                        <div style={{ position: 'relative', minWidth: 0 }}>
                                                            <span style={{
                                                                position: 'absolute', left: 6, top: '50%', transform: 'translateY(-50%)',
                                                                fontSize: 12, fontWeight: 900, color: '#16a34a',
                                                            }}>-</span>
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                step="0.001"
                                                                value={cell.minus}
                                                                onChange={e => handleChange(row.id, col.id, 'minus', e.target.value)}
                                                                placeholder="0.000"
                                                                style={{
                                                                    width: '100%', height: 32, boxSizing: 'border-box',
                                                                    textAlign: 'center', fontSize: 11, fontWeight: 700,
                                                                    border: cell.minus ? '1.5px solid #86efac' : '1.5px solid #bbf7d0',
                                                                    borderRadius: 8, outline: 'none', padding: '0 6px 0 18px',
                                                                    background: cell.minus ? '#f0fdf4' : '#f7fee7',
                                                                    color: '#16a34a',
                                                                }}
                                                            />
                                                        </div>
                                                    </div>
                                                )}
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <div style={{ padding: '12px 16px', background: '#fffbeb', borderTop: '1px solid #fde68a', fontSize: 12, color: '#92400e' }}>
                        💡 <strong>Ví dụ:</strong> Hàng <em>416</em>, Cột <em>585</em>. Dòng <span style={{ color: '#dc2626', fontWeight: 700 }}>+</span> là phần cộng thêm, dòng <span style={{ color: '#16a34a', fontWeight: 700 }}>-</span> là phần trừ bớt. Dữ liệu lưu trong trình duyệt.
                    </div>
                </div>
            )}
        </>
    );
}
