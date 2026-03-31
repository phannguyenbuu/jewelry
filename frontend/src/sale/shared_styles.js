const APP_GRADIENT = 'linear-gradient(135deg, #0f172a 0%, #1e3a6e 58%, #1d4ed8 100%)';
const APP_GRADIENT_BRIGHT = 'linear-gradient(135deg, #1d4ed8 0%, #0ea5e9 100%)';
const POS_RED = '#dc2626';
const RECEIVE_GREEN = '#166534';
const NEUTRAL_BORDER = '#ccc';
const UI_FONT = "'Be Vietnam Pro', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
const NUMBER_FONT = "'Roboto Condensed', 'Be Vietnam Pro', sans-serif";
const TITLE_FONT = UI_FONT;
const TX_THEMES = {
    sell: {
        accent: '#1d4ed8',
        border: '#2563eb',
        gradient: 'linear-gradient(135deg,#1d4ed8,#0ea5e9)',
        softBorder: 'rgba(37,99,235,.26)',
        softBg: 'rgba(239,246,255,.95)',
    },
    trade: {
        accent: '#0f766e',
        border: '#14b8a6',
        gradient: 'linear-gradient(135deg,#0f766e,#14b8a6)',
        softBorder: 'rgba(20,184,166,.26)',
        softBg: 'rgba(240,253,250,.95)',
    },
    buy: {
        accent: '#dc2626',
        border: '#f87171',
        gradient: 'linear-gradient(135deg,#dc2626,#f87171)',
        softBorder: 'rgba(248,113,113,.28)',
        softBg: 'rgba(254,242,242,.95)',
    },
};
const getTxTheme = (tx) => TX_THEMES[tx] || TX_THEMES.sell;
const floatingMenuItemStyle = (active) => ({
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 12px',
    borderRadius: 16,
    border: 'none',
    background: active ? 'linear-gradient(135deg, rgba(15,23,42,.96), rgba(30,58,110,.94))' : 'rgba(248,250,252,.95)',
    color: active ? 'white' : '#0f172a',
    cursor: 'pointer',
    textAlign: 'left',
    boxShadow: active ? '0 10px 24px rgba(15,23,42,.16)' : 'inset 0 0 0 1px rgba(148,163,184,.18)',
});
const floatingMenuIconStyle = (active) => ({
    width: 30,
    height: 30,
    borderRadius: 999,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: active ? 'rgba(255,255,255,.18)' : 'rgba(29,78,216,.08)',
    color: active ? 'white' : '#1d4ed8',
    fontSize: 16,
    flexShrink: 0,
});

/* â”€â”€ styles â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const S = {
    screen: {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        background: 'linear-gradient(180deg, #f8fafc 0%, #f6faf7 42%, #edf4fb 100%)',
        overflow: 'hidden',
        fontFamily: UI_FONT,
        width: '100%',
        height: '100%',
        color: '#111827',
    },
    header: { padding: '16px 18px 8px', background: 'transparent', flexShrink: 0 },
    title: { color: '#111827', fontWeight: 900, fontSize: 15, letterSpacing: .1, fontFamily: UI_FONT },
    sub: { color: '#6b7280', fontSize: 9, marginTop: 2, fontFamily: UI_FONT },
    scrollArea: { flex: 1, overflowY: 'auto', padding: '10px 14px 12px', display: 'flex', flexDirection: 'column', gap: 12 },
    card: { background: 'rgba(255,255,255,.92)', borderRadius: 22, padding: 14, boxShadow: '0 14px 40px rgba(15,23,42,.08)', position: 'relative', border: '1px solid rgba(15,23,42,.06)' },
    totalBar: { padding: '12px 18px', background: 'rgba(255,255,255,.9)', flexShrink: 0, borderTop: '1px solid rgba(15,23,42,.08)', backdropFilter: 'blur(18px)' },
    totalAmt: (isReceive = false) => ({
        fontSize: 28,
        fontWeight: 900,
        color: isReceive ? POS_RED : RECEIVE_GREEN,
        letterSpacing: .2,
        lineHeight: .96,
        fontFamily: NUMBER_FONT,
    }),
    pillBtn: (bg, c = 'white') => ({
        display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 20px',
        borderRadius: 999, border: 'none', background: bg, color: c,
        fontWeight: 800, fontSize: 11, cursor: 'pointer', transition: 'transform .15s, opacity .15s', boxShadow: '0 8px 18px rgba(15,23,42,.10)', fontFamily: UI_FONT,
    }),
    iconBtn: (bg) => ({
        width: 40, height: 40, borderRadius: '50%', border: 'none', background: bg,
        color: '#111827', fontWeight: 900, fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: UI_FONT,
        boxShadow: '0 8px 18px rgba(15,23,42,.08)',
    }),
    inp: { width: '100%', padding: '8px 10px', borderRadius: 12, border: '1.5px solid #dbe4ee', fontSize: 12, boxSizing: 'border-box', textAlign: 'center', fontWeight: 700, outline: 'none', background: 'rgba(255,255,255,.96)', color: '#111827', fontFamily: UI_FONT },
    label: { fontSize: 8, color: '#6b7280', fontWeight: 700, marginBottom: 3, textTransform: 'uppercase', letterSpacing: .4, display: 'block', fontFamily: UI_FONT },
    toggleRow: { display: 'flex', borderRadius: 999, background: '#edf2f7', padding: 3, gap: 2, boxShadow: 'inset 0 1px 2px rgba(15,23,42,.05)' },
    toggleOpt: (active, col) => ({
        flex: 1, padding: '7px 0', borderRadius: 999, border: 'none', fontWeight: 800, fontSize: 10,
        cursor: 'pointer', transition: 'all .2s', textAlign: 'center',
        background: active ? col : 'transparent',
        color: active ? 'white' : '#64748b',
        boxShadow: active ? '0 10px 20px rgba(30,58,110,.18)' : 'none',
        fontFamily: UI_FONT,
    }),
    heroCard: { borderRadius: 28, padding: '24px 16px 16px', background: 'linear-gradient(135deg, rgba(255,255,255,.88), rgba(248,250,252,.95))', border: '1px solid rgba(15,23,42,.05)', boxShadow: '0 16px 42px rgba(15,23,42,.08)', position: 'relative', overflow: 'visible' },
    heroBg: { position: 'absolute', inset: 0, borderRadius: 28, overflow: 'hidden', background: 'radial-gradient(circle at 15% 15%, rgba(255,255,255,.92), transparent 30%), radial-gradient(circle at 85% 0%, rgba(191,219,254,.6), transparent 22%), radial-gradient(circle at 80% 85%, rgba(251,191,36,.25), transparent 24%)' },
    heroTextWrap: { maxWidth: 220, paddingTop: 6, position: 'relative', zIndex: 1 },
    heroTitle: { fontSize: 21, lineHeight: 1.28, fontWeight: 900, color: '#111827', letterSpacing: -.15, display: 'block', fontFamily: UI_FONT },
    heroChip: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 11px', borderRadius: 999, background: 'rgba(17,24,39,.88)', color: 'white', fontSize: 10, fontWeight: 800, border: 'none', cursor: 'pointer', fontFamily: UI_FONT },
    sectionTitle: { fontSize: 11, fontWeight: 900, color: '#111827', marginBottom: 8, fontFamily: UI_FONT },
    softPanel: { background: 'rgba(255,255,255,.94)', borderRadius: 22, border: '1px solid rgba(15,23,42,.06)', boxShadow: '0 12px 34px rgba(15,23,42,.08)', padding: 14 },
    heroLogo: { position: 'absolute', right: 0, bottom: 0, width: 132, maxWidth: '100%', objectFit: 'contain', filter: 'drop-shadow(0 14px 24px rgba(15,23,42,.16))' },
};

const calcValueStyle = (color, size = 20, align = 'right') => ({
    ...S.totalAmt(),
    fontSize: size,
    color,
    textAlign: align,
    display: 'block',
});

/* â”€â”€ Transaction line card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

export {
  APP_GRADIENT,
  APP_GRADIENT_BRIGHT,
  POS_RED,
  RECEIVE_GREEN,
  NEUTRAL_BORDER,
  UI_FONT,
  NUMBER_FONT,
  TITLE_FONT,
  TX_THEMES,
  getTxTheme,
  floatingMenuItemStyle,
  floatingMenuIconStyle,
  S,
  calcValueStyle,
};
