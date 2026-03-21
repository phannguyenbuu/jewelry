/**
 * SalePosMobile — Mobile POS for jewelry/gold shop
 * -------------------------------------------------
 * Ported from Django template (_fastbuy.html + order_list.html) to React.
 *
 * Screens:
 *   1. ORDER  — Add transaction lines (gold/currency, buy/sell, qty, rate → live total)
 *   2. PAYMENT — Split cash / bank transfer, VietQR, send order
 *   3. LIST   — Today's order list, settle (chốt sổ)
 *
 * Data flow:
 *   • Rates fetched from /api/gold_loai (jewelry backend — gia_ban / gia_mua per loai)
 *   • Orders POST to /api/don_hang (same backend used by DonHangPage)
 *   • VietQR generated client-side via img.vietqr.io
 */

import { useState, useEffect, useCallback } from 'react';

const API = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'https://jewelry.n-lux.com' : '';

/* ── helpers ──────────────────────────────────────────────────────────── */
const fmtVN = n => {
    const v = typeof n === 'string' ? parseFloat(n.replace(/,/g, '')) || 0 : (n || 0);
    return v.toLocaleString('vi-VN');
};
const parseFmt = s => parseFloat(String(s).replace(/[^0-9.\-]/g, '')) || 0;
const today = () => new Date().toLocaleDateString('vi-VN');
const nowStr = () => new Date().toLocaleString('vi-VN');
const genOrderId = () => {
    const d = new Date();
    return `DH${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
};

/* ── default rate data (fallback khi API chưa có) ── */
const DEFAULT_RATES = {
    gold: { 'SJC': [85500000, 83000000], '1c': [8550000, 8300000], '0.5c': [4275000, 4150000] },
    money: { 'USD': [25400, 25000], 'EUR': [27500, 27000] },
};

/* ── styles ───────────────────────────────────────────────────────────── */
const S = {
    screen: { position: 'fixed', inset: 0, zIndex: 500, display: 'flex', flexDirection: 'column', background: '#1e293b', overflow: 'hidden', fontFamily: 'Inter, sans-serif' },
    header: { padding: '16px 18px 10px', background: 'linear-gradient(135deg,#1e293b,#334155)', flexShrink: 0 },
    title: { color: 'white', fontWeight: 900, fontSize: 18, letterSpacing: .5 },
    sub: { color: '#94a3b8', fontSize: 11, marginTop: 2 },
    scrollArea: { flex: 1, overflowY: 'auto', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 10 },
    card: { background: 'white', borderRadius: 14, padding: 14, boxShadow: '0 4px 16px rgba(0,0,0,.2)', position: 'relative' },
    totalBar: { padding: '14px 18px', background: '#0f172a', flexShrink: 0, borderTop: '1px solid #334155' },
    totalAmt: (neg) => ({ fontSize: 26, fontWeight: 900, color: neg ? '#f87171' : '#4ade80', letterSpacing: 1 }),
    pillBtn: (bg, c = 'white') => ({
        display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 20px',
        borderRadius: 999, border: 'none', background: bg, color: c,
        fontWeight: 800, fontSize: 13, cursor: 'pointer', transition: 'opacity .15s',
    }),
    iconBtn: (bg) => ({
        width: 44, height: 44, borderRadius: '50%', border: 'none', background: bg,
        color: 'white', fontWeight: 900, fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
    }),
    inp: { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box', textAlign: 'center', fontWeight: 700, outline: 'none' },
    label: { fontSize: 10, color: '#94a3b8', fontWeight: 700, marginBottom: 3, textTransform: 'uppercase', letterSpacing: .5, display: 'block' },
    toggleRow: { display: 'flex', borderRadius: 999, background: '#334155', padding: 3, gap: 2 },
    toggleOpt: (active, col) => ({
        flex: 1, padding: '7px 0', borderRadius: 999, border: 'none', fontWeight: 800, fontSize: 12,
        cursor: 'pointer', transition: 'all .2s', textAlign: 'center',
        background: active ? col : 'transparent',
        color: active ? 'white' : '#94a3b8',
    }),
};

/* ── Transaction line card ────────────────────────────────────────────── */
function TxLine({ line, rates, onChange, onRemove, showRemove }) {
    const cats = Object.keys(rates);
    const products = Object.keys(rates[line.cat] || {});

    const rate = rates[line.cat]?.[line.product] || [0, 0];
    const sellRate = line.customSell !== undefined ? line.customSell : rate[0];
    const buyRate = line.customBuy !== undefined ? line.customBuy : rate[1];
    const curRate = line.tx === 'sell' ? sellRate : buyRate;
    const value = parseFmt(line.qty) * parseFmt(curRate);
    const isGold = line.cat === 'gold';

    // notify parent of computed value
    useEffect(() => {
        onChange({ value, tx: line.tx });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [line.qty, line.product, line.cat, line.tx, line.customSell, line.customBuy]);

    const set = (k, v) => onChange({ [k]: v });

    return (
        <div style={{ ...S.card, border: `2px solid ${line.tx === 'sell' ? '#4ade80' : '#f87171'}` }}>
            {showRemove && (
                <button onClick={onRemove} style={{ ...S.iconBtn('#ef4444'), width: 28, height: 28, fontSize: 13, position: 'absolute', top: -8, right: -8, zIndex: 2 }}>×</button>
            )}

            {/* Loại giao dịch */}
            <div style={S.toggleRow}>
                {['sell', 'buy'].map(t => (
                    <button key={t} style={S.toggleOpt(line.tx === t, t === 'sell' ? '#16a34a' : '#dc2626')}
                        onClick={() => set('tx', t)}>
                        {t === 'sell' ? '📤 BÁN RA' : '📥 MUA VÀO'}
                    </button>
                ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
                {/* Danh mục */}
                <div>
                    <span style={S.label}>Danh mục</span>
                    <div style={S.toggleRow}>
                        {cats.map(c => (
                            <button key={c} style={S.toggleOpt(line.cat === c, '#6366f1')}
                                onClick={() => { const prods = Object.keys(rates[c] || {}); onChange({ cat: c, product: prods[0] || '' }); }}>
                                {c === 'gold' ? '🥇 Vàng' : '💵 Ngoại tệ'}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Sản phẩm */}
                <div>
                    <span style={S.label}>{isGold ? 'Loại vàng' : 'Loại tiền'}</span>
                    <select style={{ ...S.inp, textAlign: 'left', padding: '9px 10px' }}
                        value={line.product} onChange={e => set('product', e.target.value)}>
                        {products.map(p => <option key={p}>{p}</option>)}
                    </select>
                </div>

                {/* Số lượng */}
                <div>
                    <span style={S.label}>{isGold ? 'Số chỉ' : 'Số tiền'}</span>
                    <input style={S.inp} type="number" inputMode="decimal" min="0" step={isGold ? '0.1' : '1000'}
                        value={line.qty} onChange={e => set('qty', e.target.value)} />
                </div>

                {/* Giá */}
                <div>
                    <span style={S.label}>{line.tx === 'sell' ? 'Giá bán' : 'Giá mua'}</span>
                    <input style={{ ...S.inp, color: line.tx === 'sell' ? '#16a34a' : '#dc2626' }}
                        type="text" inputMode="numeric"
                        value={line.tx === 'sell' ? fmtVN(sellRate) : fmtVN(buyRate)}
                        onChange={e => {
                            const v = parseFmt(e.target.value);
                            line.tx === 'sell' ? onChange({ customSell: v }) : onChange({ customBuy: v });
                        }} />
                </div>
            </div>

            {/* Thành tiền */}
            <div style={{ marginTop: 10, textAlign: 'right', fontSize: 13, fontWeight: 800, color: line.tx === 'sell' ? '#4ade80' : '#f87171' }}>
                {line.tx === 'sell' ? '+' : '-'}{fmtVN(value)} ₫
            </div>
        </div>
    );
}

/* ── Screen 1: ORDER ─────────────────────────────────────────────────── */
function OrderScreen({ rates, lines, setLines, total, onNext, onList, orderId }) {
    const addLine = () => {
        const firstCat = Object.keys(rates)[0] || 'gold';
        const firstProd = Object.keys(rates[firstCat] || {})[0] || '';
        setLines(ls => [...ls, { id: Date.now(), cat: firstCat, product: firstProd, tx: 'sell', qty: '1', value: 0 }]);
    };

    const updateLine = (id, patch) => setLines(ls => ls.map(l => l.id === id ? { ...l, ...patch } : l));
    const removeLine = id => setLines(ls => ls.filter(l => l.id !== id));

    return (
        <div style={S.screen}>
            {/* Header */}
            <div style={S.header}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                        <div style={S.title}>🛒 Tạo giao dịch</div>
                        <div style={S.sub}>📋 {orderId} · {today()}</div>
                    </div>
                    <button onClick={onList} style={{ ...S.iconBtn('#334155'), fontSize: 15 }}>📋</button>
                </div>
            </div>

            {/* Lines */}
            <div style={S.scrollArea}>
                {lines.map((l, i) => (
                    <TxLine key={l.id} line={l} rates={rates}
                        onChange={patch => updateLine(l.id, patch)}
                        onRemove={() => removeLine(l.id)}
                        showRemove={lines.length > 1} />
                ))}
                <button onClick={addLine} style={{ ...S.pillBtn('#334155'), justifyContent: 'center', width: '100%', padding: '12px 0', fontSize: 14 }}>
                    ➕ Thêm mặt hàng
                </button>
            </div>

            {/* Total bar */}
            <div style={S.totalBar}>
                <div style={{ fontSize: 10, color: '#64748b', fontWeight: 700, marginBottom: 4 }}>TỔNG TIỀN</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={S.totalAmt(total < 0)}>{total >= 0 ? '+' : ''}{fmtVN(total)} ₫</div>
                    <button onClick={onNext} style={S.pillBtn('linear-gradient(135deg,#f59e0b,#f97316)')}>
                        Thanh toán →
                    </button>
                </div>
            </div>
        </div>
    );
}

/* ── Screen 2: PAYMENT ────────────────────────────────────────────────── */
const BANKS = ['VIETCOMBANK', 'TECHCOMBANK', 'BIDV', 'MB', 'AGRIBANK', 'VIETINBANK', 'ACB', 'SACOMBANK', 'TPBANK', 'VPBANK'];

function PaymentScreen({ total, orderId, formula, onBack, onSend, loading }) {
    const isIn = total >= 0;
    const absTotal = Math.abs(total);

    const [cash, setCash] = useState(absTotal);
    const [bank, setBank] = useState(0);
    const [bankFrom, setBankFrom] = useState('');    // tài khoản thu (IN)
    const [bankName, setBankName] = useState('VIETCOMBANK');  // ngân hàng chi (OUT)
    const [bankNum, setBankNum] = useState('');
    const [note, setNote] = useState('');
    const [showQR, setShowQR] = useState(false);

    const qrUrl = bankNum && !isIn
        ? `https://img.vietqr.io/image/${bankName}-${bankNum}-compact.png?amount=${Math.abs(bank)}&addInfo=${encodeURIComponent(orderId)}`
        : '';

    const handleCashChange = v => {
        const n = Math.min(parseFmt(v), absTotal);
        setCash(n); setBank(absTotal - n); setShowQR(false);
    };
    const handleBankChange = v => {
        const n = Math.min(parseFmt(v), absTotal);
        setBank(n); setCash(absTotal - n); setShowQR(false);
    };

    const handleSend = () => {
        onSend({
            orderId, total: fmtVN(total), cash: fmtVN(isIn ? cash : -cash),
            bankcash: fmtVN(isIn ? bank : -bank),
            frombank: isIn ? bankFrom : `${bankName}-${bankNum}`,
            transactiontype: isIn ? 'THU' : 'CHI',
            note, formula, created_at: nowStr(),
        });
    };

    return (
        <div style={S.screen}>
            <div style={S.header}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <button onClick={onBack} style={S.iconBtn('#334155')}>←</button>
                    <div>
                        <div style={S.title}>{isIn ? '💰 Thanh toán (Thu)' : '💸 Chi tiền'}</div>
                        <div style={S.sub}>📋 {orderId}</div>
                    </div>
                </div>
            </div>

            <div style={S.scrollArea}>
                {/* Tổng */}
                <div style={{ ...S.card, textAlign: 'center', background: '#0f172a', border: `2px solid ${isIn ? '#4ade80' : '#f87171'}` }}>
                    <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>TỔNG TIỀN</div>
                    <div style={{ fontSize: 30, fontWeight: 900, color: isIn ? '#4ade80' : '#f87171' }}>{fmtVN(total)} ₫</div>
                    {formula && <pre style={{ fontSize: 10, color: '#64748b', marginTop: 8, textAlign: 'left', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{formula}</pre>}
                </div>

                {/* Tiền mặt / CK */}
                <div style={S.card}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <div>
                            <span style={S.label}>💵 Tiền mặt</span>
                            <input style={{ ...S.inp, color: '#16a34a' }} type="text" inputMode="numeric"
                                value={fmtVN(cash)}
                                onChange={e => handleCashChange(e.target.value)}
                                onFocus={e => e.target.select()} />
                        </div>
                        <div>
                            <span style={S.label}>🏦 Chuyển khoản</span>
                            <input style={{ ...S.inp, color: '#3b82f6' }} type="text" inputMode="numeric"
                                value={fmtVN(bank)}
                                onChange={e => handleBankChange(e.target.value)}
                                onFocus={e => e.target.select()} />
                        </div>
                    </div>
                </div>

                {/* Bank info */}
                <div style={S.card}>
                    {isIn ? (
                        <div>
                            <span style={S.label}>🏦 Tài khoản nhận</span>
                            <select style={{ ...S.inp, textAlign: 'left' }} value={bankFrom} onChange={e => setBankFrom(e.target.value)}>
                                <option value="">-- Chọn tài khoản --</option>
                                {BANKS.map(b => <option key={b} value={b}>{b}</option>)}
                            </select>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <div>
                                <span style={S.label}>🏦 Ngân hàng thụ hưởng</span>
                                <select style={{ ...S.inp, textAlign: 'left' }} value={bankName} onChange={e => { setBankName(e.target.value); setShowQR(false); }}>
                                    {BANKS.map(b => <option key={b}>{b}</option>)}
                                </select>
                            </div>
                            <div>
                                <span style={S.label}>💳 Số tài khoản</span>
                                <input style={S.inp} type="text" inputMode="numeric" placeholder="0123456789"
                                    value={bankNum} onChange={e => { setBankNum(e.target.value); setShowQR(false); }} />
                            </div>
                            {qrUrl && (
                                <button onClick={() => setShowQR(q => !q)} style={S.pillBtn('#6366f1')}>
                                    📷 {showQR ? 'Ẩn QR' : 'Xem QR chuyển khoản'}
                                </button>
                            )}
                            {showQR && qrUrl && (
                                <div style={{ borderRadius: 12, overflow: 'hidden', border: '2px solid #6366f1' }}>
                                    <img src={qrUrl} alt="VietQR" style={{ width: '100%' }} />
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Ghi chú */}
                <div style={S.card}>
                    <span style={S.label}>📝 Ghi chú</span>
                    <textarea style={{ ...S.inp, height: 80, resize: 'none', textAlign: 'left', padding: 10 }}
                        placeholder="Nhập ghi chú..." value={note} onChange={e => setNote(e.target.value)} />
                </div>
            </div>

            {/* Bottom */}
            <div style={{ ...S.totalBar, display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                <button onClick={onBack} style={S.pillBtn('#334155')}>← Quay lại</button>
                <button onClick={handleSend} disabled={loading} style={S.pillBtn('linear-gradient(135deg,#16a34a,#0ea5e9)', 'white')}>
                    {loading ? '⏳ Đang gửi...' : '✈️ Gửi đơn hàng'}
                </button>
            </div>
        </div>
    );
}

/* ── Screen 3: ORDER LIST ─────────────────────────────────────────────── */
function OrderListScreen({ orders, onClose, onSettle, settleLoading }) {
    const todayOrders = orders.filter(o => {
        const d = new Date(o.ngay_dat);
        const t = new Date();
        return d.getDate() === t.getDate() && d.getMonth() === t.getMonth() && d.getFullYear() === t.getFullYear();
    });

    const total = todayOrders.reduce((s, o) => s + (o.tong_tien || 0), 0);
    const [confirmSettle, setConfirmSettle] = useState(false);

    return (
        <div style={S.screen}>
            <div style={S.header}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <div style={S.title}>📋 Đơn hàng hôm nay</div>
                        <div style={S.sub}>{todayOrders.length} đơn · Tổng: {fmtVN(total)} ₫</div>
                    </div>
                    <button onClick={onClose} style={S.iconBtn('#334155')}>✕</button>
                </div>
            </div>

            <div style={S.scrollArea}>
                {todayOrders.length === 0 && (
                    <div style={{ textAlign: 'center', color: '#64748b', padding: 40 }}>Chưa có đơn hàng nào hôm nay</div>
                )}
                {todayOrders.map(o => (
                    <div key={o.id} style={{ ...S.card, background: '#0f172a', border: '1px solid #334155' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                            <div style={{ color: '#6366f1', fontWeight: 800, fontSize: 13 }}>{o.ma_don}</div>
                            <div style={{ fontSize: 11, color: '#64748b' }}>{o.ngay_dat}</div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                            {[
                                ['Khách', o.khach_hang || '—'],
                                ['Tổng tiền', `${fmtVN(o.tong_tien)} ₫`],
                                ['Đặt cọc', `${fmtVN(o.dat_coc)} ₫`],
                                ['Còn lại', `${fmtVN((o.tong_tien || 0) - (o.dat_coc || 0))} ₫`],
                            ].map(([k, v]) => (
                                <div key={k}>
                                    <div style={{ fontSize: 9, color: '#64748b', fontWeight: 700 }}>{k.toUpperCase()}</div>
                                    <div style={{ fontSize: 12, fontWeight: 700, color: 'white' }}>{v}</div>
                                </div>
                            ))}
                        </div>
                        {o.ghi_chu && <div style={{ marginTop: 8, fontSize: 11, color: '#94a3b8' }}>💬 {o.ghi_chu}</div>}
                    </div>
                ))}
            </div>

            <div style={{ ...S.totalBar, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                {confirmSettle ? (
                    <>
                        <span style={{ color: '#f87171', fontSize: 12, alignSelf: 'center' }}>Xác nhận chốt sổ?</span>
                        <button onClick={() => setConfirmSettle(false)} style={S.pillBtn('#334155')}>Huỷ</button>
                        <button onClick={onSettle} disabled={settleLoading} style={S.pillBtn('#dc2626')}>
                            {settleLoading ? '...' : '✔ Chốt sổ'}
                        </button>
                    </>
                ) : (
                    <button onClick={() => setConfirmSettle(true)} style={S.pillBtn('#f59e0b', '#0f172a')}>🧾 Chốt sổ</button>
                )}
            </div>
        </div>
    );
}

/* ── Main export ──────────────────────────────────────────────────────── */
export default function SalePosMobile({ onClose }) {
    const [screen, setScreen] = useState('order'); // 'order' | 'payment' | 'list'
    const [rates, setRates] = useState(DEFAULT_RATES);
    const [lines, setLines] = useState([]);
    const [loading, setLoading] = useState(false);
    const [orders, setOrders] = useState([]);
    const [orderId] = useState(genOrderId);
    const [settleLoading, setSettleLoading] = useState(false);

    /* compute total from lines */
    const total = lines.reduce((s, l) => {
        const v = l.tx === 'sell' ? Math.abs(l.value || 0) : -Math.abs(l.value || 0);
        return s + v;
    }, 0);

    const formula = lines.map(l => {
        const r = rates[l.cat]?.[l.product] || [0, 0];
        const rate = l.tx === 'sell' ? (l.customSell ?? r[0]) : (l.customBuy ?? r[1]);
        const sign = l.tx === 'sell' ? '+' : '-';
        return `${sign}${l.product} ${fmtVN(rate)} × ${l.qty} = ${fmtVN(l.value || 0)}`;
    }).join('\n') + `\n>>> TỔNG: ${fmtVN(total)} ₫`;

    /* load rates from backend */
    useEffect(() => {
        fetch(`${API}/api/gold_loai`)
            .then(r => r.json())
            .then(data => {
                if (!Array.isArray(data)) return;
                const gold = {};
                data.forEach(item => {
                    if (item.ma_loai && item.gia_ban != null)
                        gold[item.ma_loai] = [item.gia_ban, item.gia_mua ?? item.gia_ban];
                });
                if (Object.keys(gold).length > 0)
                    setRates(r => ({ ...r, gold }));
            })
            .catch(() => { });
    }, []);

    /* initial line */
    useEffect(() => {
        const firstCat = Object.keys(rates)[0] || 'gold';
        const firstProd = Object.keys(rates[firstCat] || {})[0] || '';
        setLines([{ id: Date.now(), cat: firstCat, product: firstProd, tx: 'sell', qty: '1', value: 0 }]);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    /* load orders */
    const loadOrders = useCallback(async () => {
        try { const r = await fetch(`${API}/api/don_hang`); setOrders(await r.json()); } catch { }
    }, []);
    useEffect(() => { loadOrders(); }, [loadOrders]);

    /* send order */
    const handleSend = async (payload) => {
        setLoading(true);
        try {
            await fetch(`${API}/api/don_hang`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    khach_hang: payload.frombank || 'Khách POS',
                    so_dien_thoai: '',
                    ngay_dat: new Date().toISOString().slice(0, 10),
                    tong_tien: Math.abs(parseFmt(payload.total)),
                    dat_coc: Math.abs(parseFmt(payload.bankcash || '0')),
                    trang_thai: 'Mới',
                    ghi_chu: `${payload.formula}\n${payload.note}`.trim(),
                    nguoi_tao: 'POS Mobile',
                }),
            });
            await loadOrders();
            setLines([{ id: Date.now(), cat: Object.keys(rates)[0] || 'gold', product: Object.keys(rates[Object.keys(rates)[0]] || {})[0] || '', tx: 'sell', qty: '1', value: 0 }]);
            setScreen('list');
        } catch (e) { alert('Lỗi: ' + e.message); }
        setLoading(false);
    };

    /* settle */
    const handleSettle = async () => {
        setSettleLoading(true);
        // Chốt sổ = chỉ xoá local state (server không có endpoint settle riêng)
        setTimeout(() => { setOrders([]); setSettleLoading(false); }, 800);
    };

    return (
        <>
            {screen === 'order' && (
                <OrderScreen rates={rates} lines={lines} setLines={setLines}
                    total={total} orderId={orderId}
                    onNext={() => setScreen('payment')}
                    onList={() => { loadOrders(); setScreen('list'); }} />
            )}
            {screen === 'payment' && (
                <PaymentScreen total={total} orderId={orderId} formula={formula}
                    loading={loading}
                    onBack={() => setScreen('order')}
                    onSend={handleSend} />
            )}
            {screen === 'list' && (
                <OrderListScreen orders={orders} settleLoading={settleLoading}
                    onClose={() => setScreen('order')}
                    onSettle={handleSettle} />
            )}

            {/* Close overlay trigger (if called from DonHangPage) */}
            {onClose && (
                <button onClick={onClose} style={{
                    position: 'fixed', top: 14, right: 14, zIndex: 9999,
                    background: 'rgba(255,255,255,.15)', border: 'none', borderRadius: '50%',
                    width: 36, height: 36, color: 'white', fontSize: 18, cursor: 'pointer',
                }}>✕</button>
            )}
        </>
    );
}
