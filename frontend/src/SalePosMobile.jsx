/**
 * SalePosMobile â€” Mobile POS for jewelry/gold shop
 * -------------------------------------------------
 * Ported from Django template (_fastbuy.html + order_list.html) to React.
 *
 * Screens:
 *   1. ORDER  â€” Add transaction lines (gold/currency, buy/sell, qty, rate â†’ live total)
 *   2. PAYMENT â€” Split cash / bank transfer, VietQR, send order
 *   3. LIST   â€” Today's order list, settle (chá»‘t sá»•)
 *
 * Data flow:
 *   â€¢ Rates fetched from /api/gold_loai (jewelry backend â€” gia_ban / gia_mua per loai)
 *   â€¢ Orders POST to /api/don_hang (same backend used by DonHangPage)
 *   â€¢ VietQR generated client-side via img.vietqr.io
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { API_BASE } from './lib/api';

const API = API_BASE;

/* â”€â”€ helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
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
const SAVED_SALE_KEY = 'sale_pos_saved_transactions_v1';

/* â”€â”€ default rate data (fallback khi API chÆ°a cÃ³) â”€â”€ */
const DEFAULT_RATES = {
    gold: { 'SJC': [85500000, 83000000], '1c': [8550000, 8300000], '0.5c': [4275000, 4150000] },
    money: { 'USD': [25400, 25000], 'EUR': [27500, 27000] },
};

const createDefaultLine = (rates) => {
    const firstCat = Object.keys(rates)[0] || 'gold';
    const firstProd = Object.keys(rates[firstCat] || {})[0] || '';
    return { id: Date.now(), cat: firstCat, product: firstProd, tx: 'sell', qty: '1', value: 0 };
};

const readSavedSales = () => {
    if (typeof window === 'undefined') return [];
    try {
        const raw = window.localStorage.getItem(SAVED_SALE_KEY);
        const parsed = JSON.parse(raw || '[]');
        return Array.isArray(parsed)
            ? parsed.filter(item => item && Array.isArray(item.lines) && item.lines.length > 0)
            : [];
    } catch {
        return [];
    }
};

const APP_GRADIENT = 'linear-gradient(135deg, #0f172a 0%, #1e3a6e 58%, #1d4ed8 100%)';
const APP_GRADIENT_BRIGHT = 'linear-gradient(135deg, #1d4ed8 0%, #0ea5e9 100%)';
const POS_RED = '#dc2626';
const NEUTRAL_BORDER = '#ccc';

/* â”€â”€ styles â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const S = {
    screen: {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        background: 'linear-gradient(180deg, #f8fafc 0%, #f6faf7 42%, #edf4fb 100%)',
        overflow: 'hidden',
        fontFamily: "'Be Vietnam Pro', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        width: '100%',
        height: '100%',
        color: '#111827',
    },
    header: { padding: '16px 18px 8px', background: 'transparent', flexShrink: 0 },
    title: { color: '#111827', fontWeight: 900, fontSize: 15, letterSpacing: .1 },
    sub: { color: '#6b7280', fontSize: 9, marginTop: 2 },
    scrollArea: { flex: 1, overflowY: 'auto', padding: '10px 14px 12px', display: 'flex', flexDirection: 'column', gap: 12 },
    card: { background: 'rgba(255,255,255,.92)', borderRadius: 22, padding: 14, boxShadow: '0 14px 40px rgba(15,23,42,.08)', position: 'relative', border: '1px solid rgba(15,23,42,.06)' },
    totalBar: { padding: '12px 18px', background: 'rgba(255,255,255,.9)', flexShrink: 0, borderTop: '1px solid rgba(15,23,42,.08)', backdropFilter: 'blur(18px)' },
    totalAmt: () => ({ fontSize: 22, fontWeight: 900, color: POS_RED, letterSpacing: .1 }),
    pillBtn: (bg, c = 'white') => ({
        display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 20px',
        borderRadius: 999, border: 'none', background: bg, color: c,
        fontWeight: 800, fontSize: 11, cursor: 'pointer', transition: 'transform .15s, opacity .15s', boxShadow: '0 8px 18px rgba(15,23,42,.10)',
    }),
    iconBtn: (bg) => ({
        width: 40, height: 40, borderRadius: '50%', border: 'none', background: bg,
        color: '#111827', fontWeight: 900, fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 8px 18px rgba(15,23,42,.08)',
    }),
    inp: { width: '100%', padding: '8px 10px', borderRadius: 12, border: '1.5px solid #dbe4ee', fontSize: 12, boxSizing: 'border-box', textAlign: 'center', fontWeight: 700, outline: 'none', background: 'rgba(255,255,255,.96)', color: '#111827' },
    label: { fontSize: 8, color: '#6b7280', fontWeight: 700, marginBottom: 3, textTransform: 'uppercase', letterSpacing: .4, display: 'block' },
    toggleRow: { display: 'flex', borderRadius: 999, background: '#edf2f7', padding: 3, gap: 2, boxShadow: 'inset 0 1px 2px rgba(15,23,42,.05)' },
    toggleOpt: (active, col) => ({
        flex: 1, padding: '7px 0', borderRadius: 999, border: 'none', fontWeight: 800, fontSize: 10,
        cursor: 'pointer', transition: 'all .2s', textAlign: 'center',
        background: active ? col : 'transparent',
        color: active ? 'white' : '#64748b',
        boxShadow: active ? '0 10px 20px rgba(30,58,110,.18)' : 'none',
    }),
    heroCard: { borderRadius: 28, padding: 16, background: 'linear-gradient(135deg, rgba(255,255,255,.88), rgba(248,250,252,.95))', border: '1px solid rgba(15,23,42,.05)', boxShadow: '0 16px 42px rgba(15,23,42,.08)', position: 'relative', overflow: 'hidden' },
    heroTitle: { fontSize: 21, lineHeight: 1.05, fontWeight: 900, color: '#111827', letterSpacing: -.3 },
    heroSub: { fontSize: 10, color: '#6b7280', marginTop: 8, lineHeight: 1.45 },
    heroChip: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 11px', borderRadius: 999, background: 'rgba(17,24,39,.88)', color: 'white', fontSize: 10, fontWeight: 800, border: 'none', cursor: 'pointer' },
    quickGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 },
    quickCard: { background: 'rgba(255,255,255,.96)', borderRadius: 18, minHeight: 78, border: '1px solid rgba(15,23,42,.05)', boxShadow: '0 8px 22px rgba(15,23,42,.06)', padding: 10, cursor: 'pointer', textAlign: 'center' },
    quickIcon: { display: 'block', margin: '0 auto 7px', fontSize: 18, lineHeight: 1, color: '#111827' },
    sectionTitle: { fontSize: 11, fontWeight: 900, color: '#111827', marginBottom: 8 },
    softPanel: { background: 'rgba(255,255,255,.94)', borderRadius: 22, border: '1px solid rgba(15,23,42,.06)', boxShadow: '0 12px 34px rgba(15,23,42,.08)', padding: 14 },
    heroLogo: { position: 'absolute', right: 0, bottom: 0, width: 132, maxWidth: '100%', objectFit: 'contain', filter: 'drop-shadow(0 14px 24px rgba(15,23,42,.16))' },
};

function ActionMark({ children }) {
    return <div style={S.quickIcon}>{children}</div>;
}

/* â”€â”€ Transaction line card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
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
        <div style={{ ...S.card, border: `2px solid ${line.tx === 'sell' ? NEUTRAL_BORDER : '#f87171'}` }}>
            {showRemove && (
                <button onClick={onRemove} style={{ ...S.iconBtn('#ef4444'), width: 28, height: 28, fontSize: 13, position: 'absolute', top: -8, right: -8, zIndex: 2 }}>×</button>
            )}

            {/* Loáº¡i giao dá»‹ch */}
            <div style={S.toggleRow}>
                {['sell', 'buy'].map(t => (
                    <button key={t} style={S.toggleOpt(line.tx === t, t === 'sell' ? APP_GRADIENT : APP_GRADIENT_BRIGHT)}
                        onClick={() => set('tx', t)}>
                        {t === 'sell' ? 'SELL' : 'BUY'}
                    </button>
                ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
                {/* Danh má»¥c */}
                <div>
                    <span style={S.label}>Category</span>
                    <div style={S.toggleRow}>
                        {cats.map(c => (
                            <button key={c} style={S.toggleOpt(line.cat === c, APP_GRADIENT_BRIGHT)}
                                onClick={() => { const prods = Object.keys(rates[c] || {}); onChange({ cat: c, product: prods[0] || '' }); }}>
                                {c === 'gold' ? 'Gold' : 'FX'}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Sáº£n pháº©m */}
                <div>
                    <span style={S.label}>{isGold ? 'Gold type' : 'Currency type'}</span>
                    <select style={{ ...S.inp, textAlign: 'left', padding: '9px 10px' }}
                        value={line.product} onChange={e => set('product', e.target.value)}>
                        {products.map(p => <option key={p}>{p}</option>)}
                    </select>
                </div>

                {/* Sá»‘ lÆ°á»£ng */}
                <div>
                    <span style={S.label}>{isGold ? 'Quantity' : 'Amount'}</span>
                    <input style={S.inp} type="number" inputMode="decimal" min="0" step={isGold ? '0.1' : '1000'}
                        value={line.qty} onChange={e => set('qty', e.target.value)} />
                </div>

                {/* GiÃ¡ */}
                <div>
                    <span style={S.label}>{line.tx === 'sell' ? 'Sell price' : 'Buy price'}</span>
                    <input style={{ ...S.inp, color: line.tx === 'sell' ? POS_RED : '#dc2626' }}
                        type="text" inputMode="numeric"
                        value={line.tx === 'sell' ? fmtVN(sellRate) : fmtVN(buyRate)}
                        onChange={e => {
                            const v = parseFmt(e.target.value);
                            line.tx === 'sell' ? onChange({ customSell: v }) : onChange({ customBuy: v });
                        }} />
                </div>
            </div>

            {/* Amount */}
            <div style={{ marginTop: 10, textAlign: 'right', fontSize: 12, fontWeight: 800, color: line.tx === 'sell' ? POS_RED : '#f87171' }}>
                {line.tx === 'sell' ? '+' : '-'}{fmtVN(value)} VND
            </div>
        </div>
    );
}

/* â”€â”€ Screen 1: ORDER â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function OrderScreen({ rates, lines, setLines, total, onNext, onList, onInventory, onOpenSaved, onSaveDraft, orderId, draftMessage, savedCount }) {
    const addLine = () => {
        setLines(ls => [...ls, createDefaultLine(rates)]);
    };

    const updateLine = (id, patch) => setLines(ls => ls.map(l => l.id === id ? { ...l, ...patch } : l));
    const removeLine = id => setLines(ls => ls.filter(l => l.id !== id));

    return (
        <div style={S.screen}>
            <div style={S.header}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                    <button onClick={onList} style={S.iconBtn('#ffffff')}>≡</button>
                    <div style={{ textAlign: 'right' }}>
                        <div style={S.sub}>MOBILE SALE</div>
                        <div style={{ ...S.title, fontSize: 13 }}>Vạn Kim Jewelry</div>
                    </div>
                </div>
            </div>

            <div style={S.scrollArea}>
                <div style={S.heroCard}>
                    <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 15% 15%, rgba(255,255,255,.92), transparent 30%), radial-gradient(circle at 85% 0%, rgba(191,219,254,.6), transparent 22%), radial-gradient(circle at 80% 85%, rgba(251,191,36,.25), transparent 24%)' }} />
                    <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 }}>
                        <div style={{ maxWidth: 220 }}>
                            <div style={S.heroTitle}>Chào buổi sáng,</div>
                            <div style={{ ...S.heroTitle, fontSize: 19 }}>VẠN KIM POS</div>
                            <div style={S.heroSub}>Bán hàng nhanh, nhập kho bằng camera, xem đơn trong ngày và chốt sổ bằng một chạm.</div>
                            <button type="button" onClick={onOpenSaved} style={{ ...S.heroChip, marginTop: 14 }}>
                                <span>Giao dịch lưu</span>
                                <span style={{ padding: '2px 6px', borderRadius: 999, background: 'rgba(255,255,255,.16)', fontSize: 9, lineHeight: 1.1 }}>
                                    {savedCount} mục
                                </span>
                            </button>
                        </div>
                        <div style={{ flex: 1, minHeight: 140, position: 'relative' }}>
                            <div style={{ position: 'absolute', right: 8, top: 8, width: 120, height: 120, borderRadius: '50%', background: 'linear-gradient(135deg, rgba(255,183,77,.95), rgba(244,114,182,.65))', filter: 'blur(4px)' }} />
                            <div style={{ position: 'absolute', right: 26, top: 30, width: 84, height: 84, borderRadius: '50%', background: 'rgba(255,255,255,.68)', boxShadow: 'inset 0 0 0 10px rgba(255,255,255,.28)' }} />
                            <img src="/logo.png" alt="Vạn Kim Jewelry" style={S.heroLogo} />
                        </div>
                    </div>
                </div>

                <div style={S.quickGrid}>
                    <button type="button" onClick={() => setLines(ls => ls.length ? ls : [createDefaultLine(rates)])} style={S.quickCard}>
                        <ActionMark>💳</ActionMark>
                        <div style={{ fontSize: 10, fontWeight: 800, color: '#111827' }}>Bán hàng</div>
                    </button>
                    <button type="button" onClick={onInventory} style={S.quickCard}>
                        <ActionMark>📷</ActionMark>
                        <div style={{ fontSize: 10, fontWeight: 800, color: '#111827' }}>Nhập kho</div>
                    </button>
                </div>

                <div style={S.softPanel}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                        <div>
                            <div style={S.sectionTitle}>Đơn đang tạo</div>
                            <div style={S.sub}>{orderId} · {today()}</div>
                        </div>
                        <div style={{ ...S.totalAmt(total < 0), fontSize: 16 }}>{total >= 0 ? '+' : ''}{fmtVN(total)} VND</div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {lines.map((l) => (
                            <TxLine key={l.id} line={l} rates={rates}
                                onChange={patch => updateLine(l.id, patch)}
                                onRemove={() => removeLine(l.id)}
                                showRemove={lines.length > 1} />
                        ))}
                    </div>
                    <button onClick={addLine} style={{ ...S.pillBtn('linear-gradient(135deg,#111827,#334155)'), justifyContent: 'center', width: '100%', padding: '11px 0', fontSize: 18, marginTop: 10 }}>
                        +
                    </button>
                </div>
            </div>

            <div style={S.totalBar}>
                <div style={{ fontSize: 9, color: '#64748b', fontWeight: 700, marginBottom: 4 }}>TỔNG TẠM TÍNH</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                    <div style={S.totalAmt(total < 0)}>{total >= 0 ? '+' : ''}{fmtVN(total)} VND</div>
                    <button onClick={onNext} style={S.pillBtn('linear-gradient(135deg,#111827,#0f172a)')}>
                        Tính tiền
                    </button>
                </div>
                <button onClick={onSaveDraft} style={{ ...S.pillBtn('linear-gradient(135deg,#9ca3af,#6b7280)'), justifyContent: 'center', width: '100%', padding: '11px 0', fontSize: 12, marginTop: 10 }}>
                    Lưu giao dịch
                </button>
                {draftMessage && <div style={{ marginTop: 8, fontSize: 10, color: '#6b7280' }}>{draftMessage}</div>}
            </div>
        </div>
    );
}

/* â”€â”€ Screen 2: PAYMENT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const BANKS = ['VIETCOMBANK', 'TECHCOMBANK', 'BIDV', 'MB', 'AGRIBANK', 'VIETINBANK', 'ACB', 'SACOMBANK', 'TPBANK', 'VPBANK'];

function PaymentScreen({ total, orderId, formula, onBack, onSend, loading }) {
    const isIn = total >= 0;
    const absTotal = Math.abs(total);

    const [cash, setCash] = useState(absTotal);
    const [bank, setBank] = useState(0);
    const [bankFrom, setBankFrom] = useState('');    // receiving account
    const [bankName, setBankName] = useState('VIETCOMBANK');  // payout bank
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
                    <button onClick={onBack} style={S.iconBtn('#ffffff')}>←</button>
                    <div>
                        <div style={S.title}>{isIn ? 'Payment (Receive)' : 'Payment (Pay)'}</div>
                        <div style={S.sub}>{orderId}</div>
                    </div>
                </div>
            </div>

            <div style={S.scrollArea}>
                {/* Total */}
                <div style={{ ...S.card, textAlign: 'center', background: 'rgba(255,255,255,.98)', border: `2px solid ${isIn ? NEUTRAL_BORDER : '#f87171'}` }}>
                    <div style={{ fontSize: 9, color: '#6b7280', marginBottom: 4 }}>TOTAL</div>
                    <div style={{ fontSize: 24, fontWeight: 900, color: isIn ? POS_RED : '#dc2626' }}>{fmtVN(total)} VND</div>
                    {formula && <pre style={{ fontSize: 8.5, color: '#6b7280', marginTop: 8, textAlign: 'left', whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>{formula}</pre>}
                </div>

                {/* Cash / transfer */}
                <div style={S.card}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <div>
                            <span style={S.label}>Cash</span>
                            <input style={{ ...S.inp, color: POS_RED }} type="text" inputMode="numeric"
                                value={fmtVN(cash)}
                                onChange={e => handleCashChange(e.target.value)}
                                onFocus={e => e.target.select()} />
                        </div>
                        <div>
                            <span style={S.label}>Bank transfer</span>
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
                            <span style={S.label}>Receiving account</span>
                            <select style={{ ...S.inp, textAlign: 'left' }} value={bankFrom} onChange={e => setBankFrom(e.target.value)}>
                                <option value="">-- Select account --</option>
                                {BANKS.map(b => <option key={b} value={b}>{b}</option>)}
                            </select>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <div>
                                <span style={S.label}>Payout bank</span>
                                <select style={{ ...S.inp, textAlign: 'left' }} value={bankName} onChange={e => { setBankName(e.target.value); setShowQR(false); }}>
                                    {BANKS.map(b => <option key={b}>{b}</option>)}
                                </select>
                            </div>
                            <div>
                                <span style={S.label}>Account number</span>
                                <input style={S.inp} type="text" inputMode="numeric" placeholder="0123456789"
                                    value={bankNum} onChange={e => { setBankNum(e.target.value); setShowQR(false); }} />
                            </div>
                            {qrUrl && (
                                <button onClick={() => setShowQR(q => !q)} style={S.pillBtn('#6366f1')}>
                                    QR {showQR ? 'Hide' : 'Show'}
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

                {/* Notes */}
                <div style={S.card}>
                    <span style={S.label}>Notes</span>
                    <textarea style={{ ...S.inp, height: 80, resize: 'none', textAlign: 'left', padding: 10 }}
                        placeholder="Enter note..." value={note} onChange={e => setNote(e.target.value)} />
                </div>
            </div>

            {/* Bottom */}
            <div style={{ ...S.totalBar, display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                <button onClick={onBack} style={S.pillBtn('#ffffff', '#111827')}>Back</button>
                <button onClick={handleSend} disabled={loading} style={S.pillBtn('linear-gradient(135deg,#16a34a,#0ea5e9)', 'white')}>
                    {loading ? 'Sending...' : 'Send order'}
                </button>
            </div>
        </div>
    );
}

/* â”€â”€ Screen 3: ORDER LIST â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
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
                        <div style={S.title}>Today's orders</div>
                        <div style={S.sub}>{todayOrders.length} orders · Total: {fmtVN(total)} VND</div>
                    </div>
                    <button onClick={onClose} style={S.iconBtn('#ffffff')}>×</button>
                </div>
            </div>

            <div style={S.scrollArea}>
                {todayOrders.length === 0 && (
                    <div style={{ textAlign: 'center', color: '#6b7280', padding: 36, fontSize: 11 }}>No orders today</div>
                )}
                {todayOrders.map(o => (
                    <div key={o.id} style={{ ...S.card, background: 'rgba(255,255,255,.98)', border: '1px solid rgba(15,23,42,.06)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                            <div style={{ color: '#111827', fontWeight: 800, fontSize: 12 }}>{o.ma_don}</div>
                            <div style={{ fontSize: 10, color: '#6b7280' }}>{o.ngay_dat}</div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                            {[
                                ['Customer', o.khach_hang || '-'],
                                ['Total', `${fmtVN(o.tong_tien)} VND`],
                                ['Deposit', `${fmtVN(o.dat_coc)} VND`],
                                ['Balance', `${fmtVN((o.tong_tien || 0) - (o.dat_coc || 0))} VND`],
                            ].map(([k, v]) => (
                                <div key={k}>
                                    <div style={{ fontSize: 8, color: '#6b7280', fontWeight: 700 }}>{k.toUpperCase()}</div>
                                    <div style={{ fontSize: 11, fontWeight: 700, color: '#111827' }}>{v}</div>
                                </div>
                            ))}
                        </div>
                        {o.ghi_chu && <div style={{ marginTop: 8, fontSize: 10, color: '#6b7280' }}>Note: {o.ghi_chu}</div>}
                    </div>
                ))}
            </div>

            <div style={{ ...S.totalBar, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                {confirmSettle ? (
                    <>
                        <span style={{ color: '#dc2626', fontSize: 10, alignSelf: 'center' }}>Confirm closing?</span>
                    <button onClick={() => setConfirmSettle(false)} style={S.pillBtn('#ffffff', '#111827')}>Cancel</button>
                        <button onClick={onSettle} disabled={settleLoading} style={S.pillBtn('#dc2626')}>
                            {settleLoading ? '...' : 'Close'}
                        </button>
                    </>
                ) : (
                    <button onClick={() => setConfirmSettle(true)} style={S.pillBtn('#d97706', 'white')}>Close day</button>
                )}
            </div>
        </div>
    );
}

function SavedTransactionsModal({ open, drafts, onClose, onLoad }) {
    if (!open) return null;

    return (
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 900, background: 'rgba(15,23,42,.36)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: 14 }}>
            <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 560, maxHeight: '78vh', display: 'flex', flexDirection: 'column', background: 'rgba(255,255,255,.98)', borderRadius: 24, boxShadow: '0 24px 60px rgba(15,23,42,.24)', overflow: 'hidden' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 16px 10px', borderBottom: '1px solid rgba(15,23,42,.08)' }}>
                    <div>
                        <div style={{ ...S.title, fontSize: 14 }}>Giao dịch lưu</div>
                        <div style={S.sub}>{drafts.length} giao dịch tạm</div>
                    </div>
                    <button onClick={onClose} style={S.iconBtn('#f8fafc')}>×</button>
                </div>
                <div style={{ padding: 14, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {drafts.length === 0 && (
                        <div style={{ ...S.card, textAlign: 'center', color: '#6b7280', fontSize: 11 }}>
                            Chưa có giao dịch nào được lưu tạm.
                        </div>
                    )}
                    {drafts.map((draft) => (
                        <button key={draft.id || draft.orderId} type="button" onClick={() => onLoad(draft)} style={{ ...S.card, border: '1px solid rgba(15,23,42,.08)', textAlign: 'left', cursor: 'pointer' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                                <div>
                                    <div style={{ fontSize: 12, fontWeight: 900, color: '#111827' }}>{draft.orderId || 'Draft'}</div>
                                    <div style={{ fontSize: 10, color: '#6b7280', marginTop: 4 }}>{draft.savedAt ? new Date(draft.savedAt).toLocaleString('vi-VN') : '-'}</div>
                                </div>
                                <div style={{ fontSize: 12, fontWeight: 900, color: POS_RED }}>{draft.total >= 0 ? '+' : ''}{fmtVN(draft.total || 0)} VND</div>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 10, fontSize: 10, color: '#64748b' }}>
                                <span>{draft.lines?.length || 0} dòng giao dịch</span>
                                <span>Chạm để nạp lại</span>
                            </div>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}

/* â”€â”€ Main export â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const emptyStockForm = () => ({
    ma_hang: '',
    ncc: '',
    nhom_hang: '',
    quay_nho: '',
    cong_le: '',
    cong_si: '',
    tong_tl: '',
    tl_da: '',
    tl_vang: '',
    loai_vang: '',
    status: 'In stock',
    gia_vang_mua: '',
    gia_hat: '',
    gia_nhan_cong: '',
    dieu_chinh: '',
});

function InventoryScreen({ loaiVangList, nhomHangList, quayNhoList, onSaved }) {
    const fileRef = useRef(null);
    const [form, setForm] = useState(emptyStockForm);
    const [files, setFiles] = useState([]);
    const [previews, setPreviews] = useState([]);
    const [ocrText, setOcrText] = useState('');
    const [ocrLoading, setOcrLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');

    useEffect(() => {
        if (!form.loai_vang && loaiVangList.length) {
            setForm(f => ({ ...f, loai_vang: loaiVangList[0].ma_loai || loaiVangList[0].ten_loai || '' }));
        }
    }, [loaiVangList, form.loai_vang]);

    useEffect(() => () => previews.forEach(url => URL.revokeObjectURL(url)), [previews]);

    const resetAll = () => {
        setForm(emptyStockForm());
        setFiles([]);
        setPreviews([]);
        setOcrText('');
        setMessage('');
        if (fileRef.current) fileRef.current.value = '';
    };

    const runOcr = async (file) => {
        if (!file) return;
        setOcrLoading(true);
        setMessage('');
        const reader = new FileReader();
        reader.onload = async (ev) => {
            try {
                const base64 = ev.target.result.split(',')[1];
                const res = await fetch(`${API}/api/ocr`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        image_base64: base64,
                        mime_type: file.type || 'image/jpeg',
                        file_name: file.name,
                    }),
                });
                const data = await res.json();
                if (res.ok && data.text) {
                    setOcrText(data.text);
                    setMessage('OCR complete.');
                } else {
                    setMessage(data.error || 'Could not read label.');
                }
            } catch (err) {
                setMessage('OCR connection error: ' + err.message);
            } finally {
                setOcrLoading(false);
            }
        };
        reader.readAsDataURL(file);
    };

    const onPickFiles = (e) => {
        const picked = Array.from(e.target.files || []).filter(f => f.type.startsWith('image/'));
        if (!picked.length) return;
        const urls = picked.map(f => URL.createObjectURL(f));
        setFiles(picked);
        setPreviews(urls);
        setMessage('');
        e.target.value = '';
        runOcr(picked[0]);
    };

    const uploadImages = async () => {
        const uploaded = [];
        for (const file of files) {
            const fd = new FormData();
            fd.append('file', file);
            const res = await fetch(`${API}/api/upload`, { method: 'POST', body: fd });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || `Upload failed for ${file.name}`);
            uploaded.push({ url: data.url, name: data.name });
        }
        return uploaded;
    };

    const saveItem = async () => {
        setSaving(true);
        setMessage('');
        try {
            const images = files.length ? await uploadImages() : [];
            const payload = { ...form, images, certificates: [], ocr_text: ocrText };
            const res = await fetch(`${API}/api/items`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Could not save item');
            setMessage(`Saved stock item #${data.id}.`);
            onSaved && onSaved(data);
            resetAll();
        } catch (err) {
            setMessage(err.message || 'Save failed');
        } finally {
            setSaving(false);
        }
    };

    const fieldStyle = { ...S.inp, textAlign: 'left', padding: '9px 10px' };

    return (
        <div style={S.screen}>
            <div style={S.header}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                    <div>
                        <div style={S.title}>Camera stock intake</div>
                        <div style={S.sub}>Capture product photos, read labels, and save to backend</div>
                    </div>
                    <button onClick={() => fileRef.current?.click()} style={S.iconBtn('#ffffff')}>📷</button>
                </div>
            </div>

            <div style={S.scrollArea}>
                <div style={{ ...S.card, background: 'rgba(255,255,255,.96)', border: '1px solid rgba(15,23,42,.06)', color: '#111827' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <div>
                            <div style={S.label}>Product photos</div>
                            <div onClick={() => fileRef.current?.click()} style={{ minHeight: 170, borderRadius: 18, border: '2px dashed #cbd5e1', background: 'linear-gradient(180deg, #f8fbff, #eef6ff)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', cursor: 'pointer' }}>
                                {previews.length === 0 ? (
                                    <div style={{ textAlign: 'center', color: '#64748b', padding: 20 }}>
                                        <div style={{ fontSize: 20, marginBottom: 8 }}>📷</div>
                                        <div style={{ fontSize: 10, fontWeight: 700 }}>Capture or choose images</div>
                                        <div style={{ fontSize: 9, marginTop: 6 }}>Images will be uploaded to backend</div>
                                    </div>
                                ) : (
                                    <div style={{ display: 'grid', gridTemplateColumns: previews.length > 1 ? '1fr 1fr' : '1fr', gap: 8, width: '100%', padding: 8 }}>
                                        {previews.slice(0, 4).map((url, idx) => (
                                            <img key={url} src={url} alt={`preview-${idx}`} style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 10 }} />
                                        ))}
                                    </div>
                                )}
                            </div>
                            <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple style={{ display: 'none' }} onChange={onPickFiles} />
                            <div style={{ fontSize: 10, color: '#64748b', marginTop: 8 }}>{files.length ? `${files.length} image(s) selected` : 'No image selected'}</div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <div style={{ background: 'rgba(255,255,255,.98)', border: '1px solid rgba(15,23,42,.06)', borderRadius: 18, padding: 12 }}>
                                <div style={{ fontSize: 9, fontWeight: 800, color: '#6b7280', marginBottom: 6 }}>Label OCR</div>
                                <div style={{ fontSize: 10, lineHeight: 1.45, color: '#111827', minHeight: 110, whiteSpace: 'pre-wrap' }}>
                                    {ocrLoading ? 'Analyzing image...' : (ocrText || 'No OCR yet')}
                                </div>
                                <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                                    <button type="button" onClick={() => files[0] && runOcr(files[0])} disabled={!files.length || ocrLoading} style={S.pillBtn('#64748b')}>
                                        {ocrLoading ? 'Scanning...' : 'Run OCR'}
                                    </button>
                                    <button type="button" onClick={() => setOcrText('')} style={S.pillBtn('#ffffff', '#111827')}>Clear OCR</button>
                                </div>
                            </div>
                            {message && <div style={{ padding: '10px 12px', borderRadius: 12, background: 'rgba(255,255,255,.98)', border: '1px solid rgba(15,23,42,.06)', color: '#111827', fontSize: 10 }}>{message}</div>}
                        </div>
                    </div>
                </div>

                <div style={S.card}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
                        {[
                            ['ma_hang', 'Item code'],
                            ['ncc', 'Supplier'],
                            ['nhom_hang', 'Group'],
                            ['quay_nho', 'Display / counter'],
                            ['loai_vang', 'Gold type'],
                            ['status', 'Status'],
                            ['tong_tl', 'Total weight'],
                            ['tl_da', 'Stone weight'],
                            ['tl_vang', 'Gold weight'],
                            ['cong_le', 'Labor retail'],
                            ['cong_si', 'Labor wholesale'],
                            ['gia_vang_mua', 'Buy gold price'],
                            ['gia_hat', 'Stone price'],
                            ['gia_nhan_cong', 'Labor price'],
                            ['dieu_chinh', 'Adjustment'],
                        ].map(([key, label]) => (
                            <div key={key}>
                                <span style={S.label}>{label}</span>
                                {['nhom_hang', 'quay_nho', 'loai_vang', 'status'].includes(key) ? (
                                    <select value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} style={fieldStyle}>
                                        <option value="">-- Select --</option>
                                        {key === 'nhom_hang' && nhomHangList.map(n => <option key={n.id} value={n.ten_nhom}>{n.ten_nhom}</option>)}
                                        {key === 'quay_nho' && quayNhoList.map(q => <option key={q.id} value={q.ten_quay}>{q.ten_quay}</option>)}
                                        {key === 'loai_vang' && loaiVangList.map(v => <option key={v.id} value={v.ma_loai || v.ten_loai}>{v.ten_loai || v.ma_loai}</option>)}
                                        {key === 'status' && ['In stock', 'Sold', 'Transferred'].map(v => <option key={v}>{v}</option>)}
                                    </select>
                                ) : (
                                    <input type={key.startsWith('gia_') ? 'number' : 'text'} value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} style={fieldStyle} />
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div style={{ ...S.totalBar, display: 'flex', gap: 10, justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ color: '#6b7280', fontSize: 10 }}>Images and metadata are pushed to backend</div>
                <div style={{ display: 'flex', gap: 10 }}>
                    <button onClick={resetAll} style={S.pillBtn('#ffffff', '#111827')}>Reset</button>
                    <button onClick={saveItem} disabled={saving} style={S.pillBtn('linear-gradient(135deg,#16a34a,#0ea5e9)')}>
                        {saving ? 'Saving...' : 'Save stock item'}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function SalePosMobile() {
    const [screen, setScreen] = useState('order'); // 'order' | 'payment' | 'inventory' | 'list'
    const [rates, setRates] = useState(DEFAULT_RATES);
    const [lines, setLines] = useState([]);
    const [loading, setLoading] = useState(false);
    const [orders, setOrders] = useState([]);
    const [orderId, setOrderId] = useState(genOrderId);
    const [settleLoading, setSettleLoading] = useState(false);
    const [loaiVangList, setLoaiVangList] = useState([]);
    const [nhomHangList, setNhomHangList] = useState([]);
    const [quayNhoList, setQuayNhoList] = useState([]);
    const [savedDrafts, setSavedDrafts] = useState([]);
    const [savedModalOpen, setSavedModalOpen] = useState(false);
    const [draftMessage, setDraftMessage] = useState('');

    /* compute total from lines */
    const total = lines.reduce((s, l) => {
        const v = l.tx === 'sell' ? Math.abs(l.value || 0) : -Math.abs(l.value || 0);
        return s + v;
    }, 0);

    const formula = lines.map(l => {
        const r = rates[l.cat]?.[l.product] || [0, 0];
        const rate = l.tx === 'sell' ? (l.customSell ?? r[0]) : (l.customBuy ?? r[1]);
        const sign = l.tx === 'sell' ? '+' : '-';
        return `${sign}${l.product} ${fmtVN(rate)} x ${l.qty} = ${fmtVN(l.value || 0)}`;
    }).join('\n') + `\nTOTAL: ${fmtVN(total)} VND`;

    /* load rates from backend */
    useEffect(() => {
        const load = async () => {
            try {
                const r = await fetch(`${API}/api/loai_vang`);
                if (!r.ok) return;                          // no endpoint â†’ use DEFAULT_RATES
                const data = await r.json();
                if (!Array.isArray(data) || !data.length) return;
                const gold = {};
                data.forEach(item => {
                    // backend fields: ma_loai, gia_ban, gia_mua
                    const key = item.ma_loai || item.ten_loai || item.name;
                    if (key && item.gia_ban != null)
                        gold[key] = [Number(item.gia_ban), Number(item.gia_mua ?? item.gia_ban)];
                });
                if (Object.keys(gold).length > 0)
                    setRates(r => ({ ...r, gold }));
            } catch { /* silent fail â€” use DEFAULT_RATES */ }
        };
        load();
    }, []);

    useEffect(() => {
        const loadRefs = async () => {
            try {
                const [nhomRes, quayRes] = await Promise.all([
                    fetch(`${API}/api/nhom_hang`),
                    fetch(`${API}/api/quay_nho`),
                ]);
                if (nhomRes.ok) setNhomHangList(await nhomRes.json());
                if (quayRes.ok) setQuayNhoList(await quayRes.json());
            } catch {
                // ignore
            }
        };
        loadRefs();
    }, []);

    /* initial line */
    useEffect(() => {
        setLines([createDefaultLine(rates)]);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        setSavedDrafts(readSavedSales());
    }, []);

    useEffect(() => {
        if (!draftMessage) return undefined;
        const timer = setTimeout(() => setDraftMessage(''), 2200);
        return () => clearTimeout(timer);
    }, [draftMessage]);

    /* load orders */
    const loadOrders = useCallback(async () => {
        try {
            const r = await fetch(`${API}/api/don_hang?today=1`);
            if (r.ok) setOrders(await r.json());
        } catch { }
    }, []);
    useEffect(() => { loadOrders(); }, [loadOrders]);

    const persistSavedDrafts = (drafts) => {
        if (typeof window !== 'undefined') {
            try {
                window.localStorage.setItem(SAVED_SALE_KEY, JSON.stringify(drafts));
            } catch {
                // ignore storage quota errors
            }
        }
        setSavedDrafts(drafts);
    };

    const saveDraft = () => {
        const draft = {
            id: orderId,
            orderId,
            savedAt: new Date().toISOString(),
            total,
            formula,
            lines: lines.map(line => ({ ...line })),
        };
        const nextDrafts = [draft, ...savedDrafts.filter(item => item.id !== draft.id)].slice(0, 30);
        persistSavedDrafts(nextDrafts);
        setDraftMessage('Đã lưu giao dịch tạm');
    };

    const loadSavedDraft = (draft) => {
        if (!draft || !Array.isArray(draft.lines) || !draft.lines.length) return;
        setLines(draft.lines.map((line, index) => ({
            ...line,
            id: line.id || Date.now() + index,
        })));
        setOrderId(draft.orderId || genOrderId());
        setSavedModalOpen(false);
        setScreen('order');
        setDraftMessage(`Đã nạp ${draft.orderId || 'giao dịch lưu'}`);
    };

    /* send order */
    const handleSend = async (payload) => {
        setLoading(true);
        try {
            await fetch(`${API}/api/don_hang`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    khach_hang: payload.frombank || 'POS Customer',
                    so_dien_thoai: '',
                    ngay_dat: new Date().toISOString().slice(0, 10),
                    tong_tien: Math.abs(parseFmt(payload.total)),
                    dat_coc: Math.abs(parseFmt(payload.bankcash || '0')),
                    trang_thai: 'New',
                    ghi_chu: `${payload.formula}\n${payload.note}`.trim(),
                    nguoi_tao: 'POS Mobile',
                }),
            });
            await loadOrders();
            persistSavedDrafts(savedDrafts.filter(item => item.id !== orderId));
            setOrderId(genOrderId());
            setLines([createDefaultLine(rates)]);
            setScreen('list');
        } catch (e) { alert('Error: ' + e.message); }
        setLoading(false);
    };

    /* settle */
    const handleSettle = async () => {
        setSettleLoading(true);
        // Closing day = local reset only (no dedicated backend endpoint yet)
        setTimeout(() => { setOrders([]); setSettleLoading(false); }, 800);
    };

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', flexDirection: 'column', background: 'linear-gradient(180deg, #f8fcff 0%, #f1fbf3 42%, #dff1ff 100%)' }}>
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', position: 'relative' }}>
                {screen === 'order' && (
                    <OrderScreen rates={rates} lines={lines} setLines={setLines}
                        total={total} orderId={orderId}
                        onNext={() => setScreen('payment')}
                        onList={() => { loadOrders(); setScreen('list'); }}
                        onInventory={() => setScreen('inventory')}
                        onOpenSaved={() => setSavedModalOpen(true)}
                        onSaveDraft={saveDraft}
                        draftMessage={draftMessage}
                        savedCount={savedDrafts.length} />
                )}
                {screen === 'payment' && (
                    <PaymentScreen total={total} orderId={orderId} formula={formula}
                        loading={loading}
                        onBack={() => setScreen('order')}
                        onSend={handleSend} />
                )}
                {screen === 'inventory' && (
                    <InventoryScreen loaiVangList={loaiVangList} nhomHangList={nhomHangList} quayNhoList={quayNhoList} onSaved={() => { loadOrders(); setScreen('list'); }} />
                )}
                {screen === 'list' && (
                    <OrderListScreen orders={orders} settleLoading={settleLoading}
                        onClose={() => setScreen('order')}
                        onSettle={handleSettle} />
                )}
            </div>

            {/* Bottom Nav */}
            {(screen === 'order' || screen === 'inventory' || screen === 'payment') && (
                <div style={{ display: 'flex', background: 'rgba(255,255,255,.92)', borderTop: '1px solid rgba(15,23,42,.08)', paddingBottom: 'env(safe-area-inset-bottom, 12px)', flexShrink: 0, backdropFilter: 'blur(18px)' }}>
                    <button onClick={() => setScreen('order')} style={{ flex: 1, padding: '10px 0', border: 'none', background: 'transparent', color: screen === 'order' ? '#111827' : '#9ca3af', fontWeight: 700, fontSize: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, cursor: 'pointer', transition: 'color 0.2s' }}>
                        <span style={{ fontSize: 18 }}>■</span> Sales
                    </button>
                    <button onClick={() => setScreen('inventory')} style={{ flex: 1, padding: '10px 0', border: 'none', background: 'transparent', color: screen === 'inventory' ? '#111827' : '#9ca3af', fontWeight: 700, fontSize: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, cursor: 'pointer', transition: 'color 0.2s' }}>
                        <span style={{ fontSize: 18 }}>■</span> Stock
                    </button>
                </div>
            )}

            <SavedTransactionsModal
                open={savedModalOpen}
                drafts={savedDrafts}
                onClose={() => setSavedModalOpen(false)}
                onLoad={loadSavedDraft}
            />
        </div>
    );
}
