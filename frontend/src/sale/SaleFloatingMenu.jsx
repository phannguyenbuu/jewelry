import { IoCameraOutline, IoCardOutline, IoListOutline, IoMenuOutline, IoRefreshOutline, IoSaveOutline } from 'react-icons/io5';

import { S, floatingMenuIconStyle, floatingMenuItemStyle } from './shared';

const MENU_ITEMS = [
    { key: 'order', label: 'Bán hàng', icon: <IoCardOutline /> },
    { key: 'repair', label: 'Chuyển hàng', icon: <IoRefreshOutline /> },
    { key: 'inventory', label: 'Nhập hàng', icon: <IoCameraOutline /> },
    { key: 'list', label: 'Đơn hôm nay', icon: <IoListOutline /> },
];

export default function SaleFloatingMenu({
    show,
    navMenuOpen,
    setNavMenuOpen,
    screen,
    openNavScreen,
    setSavedModalOpen,
    savedDrafts,
}) {
    if (!show) return null;

    return (
        <>
            {navMenuOpen && (
                <button
                    type="button"
                    aria-label="Đóng menu"
                    onClick={() => setNavMenuOpen(false)}
                    style={{ position: 'absolute', inset: 0, zIndex: 18, border: 'none', background: 'rgba(15,23,42,.08)', cursor: 'default' }}
                />
            )}
            <div style={{ position: 'absolute', top: 4, left: 4, zIndex: 19, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                    <button
                        type="button"
                        onClick={() => setNavMenuOpen(open => !open)}
                        title="Menu"
                        aria-label="Menu"
                        style={{ ...S.iconBtn('#ffffff'), width: 42, height: 42, fontSize: 18, border: '1px solid rgba(15,23,42,.08)' }}
                    >
                        <IoMenuOutline />
                    </button>
                </div>

                {navMenuOpen && (
                    <div style={{ width: 188, padding: 8, borderRadius: 22, background: 'rgba(255,255,255,.96)', border: '1px solid rgba(15,23,42,.08)', boxShadow: '0 18px 40px rgba(15,23,42,.14)', backdropFilter: 'blur(18px)' }}>
                        <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: 0.6, color: '#64748b', padding: '2px 4px 8px', whiteSpace: 'nowrap' }}>ĐIỀU HƯỚNG</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {MENU_ITEMS.map(item => {
                                const active = screen === item.key;
                                return (
                                    <button
                                        key={item.key}
                                        type="button"
                                        onClick={() => {
                                            openNavScreen(item.key);
                                            setNavMenuOpen(false);
                                        }}
                                        style={floatingMenuItemStyle(active)}
                                    >
                                        <span style={floatingMenuIconStyle(active)}>{item.icon}</span>
                                        <span style={{ fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap' }}>{item.label}</span>
                                    </button>
                                );
                            })}
                            <button
                                type="button"
                                onClick={() => {
                                    setSavedModalOpen(true);
                                    setNavMenuOpen(false);
                                }}
                                style={floatingMenuItemStyle(false)}
                            >
                                <span style={floatingMenuIconStyle(false)}><IoSaveOutline /></span>
                                <span style={{ fontSize: 11, fontWeight: 800, flex: 1, whiteSpace: 'nowrap' }}>Giao dịch lưu</span>
                                {savedDrafts.length > 0 && (
                                    <span style={{ minWidth: 22, height: 22, padding: '0 6px', borderRadius: 999, background: '#dc2626', color: 'white', fontSize: 10, fontWeight: 900, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                                        {savedDrafts.length > 99 ? '99+' : savedDrafts.length}
                                    </span>
                                )}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </>
    );
}
