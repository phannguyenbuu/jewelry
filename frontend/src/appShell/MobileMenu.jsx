import { createPortal } from 'react-dom';
import { NAV_ITEMS, getNavLabel } from '../inventory/shared';

export default function MobileMenu({ activeTab, mobileOpen, setActiveTab, setMobileOpen }) {
  return createPortal(
    <>
      <style>{`
        @media (min-width: 769px) {
          .jw-mob-only { display: none !important; }
        }
        @media (max-width: 768px) {
          .jw-sidebar { display: none !important; }
          .jw-main { margin-left: 0 !important; }
          .jw-topbar { padding: 0 12px !important; }
          body { overflow-x: hidden; }
        }
        .jw-ham-bar {
          height: 4px; width: 100%;
          background: #fff; border-radius: 2px;
          transition: transform .25s, opacity .2s;
        }
        .jw-ham-toggle.active .jw-ham-bar:nth-child(1) {
          transform: rotate(45deg) translateY(11px);
        }
        .jw-ham-toggle.active .jw-ham-bar:nth-child(2) { opacity: 0; }
        .jw-ham-toggle.active .jw-ham-bar:nth-child(3) {
          transform: rotate(-45deg) translateY(-11px);
        }
        .jw-mob-menu {
          position: fixed; inset: 0; z-index: 1000;
          background: #747474;
          display: none;
          grid-template-columns: repeat(3, 1fr);
          align-items: center; justify-items: center;
          gap: 10px; padding: 100px 16px 40px;
        }
        .jw-mob-menu.open { display: grid; }
        .jw-mob-menu-item {
          width: 100%; min-height: 90px;
          border: 1px solid #cbebff; border-radius: 8px;
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          gap: 6px; padding: 14px 8px;
          background: rgba(255,255,255,.06);
          cursor: pointer; transition: background .15s;
        }
        .jw-mob-menu-item:active { background: rgba(255,255,255,.18); }
        .jw-mob-menu-item.active-tab {
          background: rgba(245,158,11,.25);
          border-color: #f59e0b;
        }
        .jw-mob-menu-item span.icon { font-size: 28px; }
        .jw-mob-menu-item span.lbl {
          color: #cbebff; font-size: 10px;
          text-transform: uppercase; font-weight: 700;
          text-align: center; letter-spacing: .5px;
          line-height: 1.2;
        }
        .jw-mob-menu-item.active-tab span.lbl { color: #f59e0b; }
      `}</style>

      <div
        className={`jw-mob-only jw-ham-toggle${mobileOpen ? ' active' : ''}`}
        onClick={() => setMobileOpen(o => !o)}
        style={{
          position: 'fixed',
          left: 12,
          top: 12,
          zIndex: 1001,
          width: 30,
          height: 25,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          cursor: 'pointer',
        }}
      >
        <div className="jw-ham-bar" />
        <div className="jw-ham-bar" />
        <div className="jw-ham-bar" />
      </div>

      <div className={`jw-mob-only jw-mob-menu${mobileOpen ? ' open' : ''}`}>
        {NAV_ITEMS.filter(item => !String(item.key).startsWith('divider')).map(item => (
          <div
            key={item.key}
            className={`jw-mob-menu-item${activeTab === item.key ? ' active-tab' : ''}`}
            onClick={() => {
              setActiveTab(item.key);
              setMobileOpen(false);
            }}
          >
            <span className="icon">{item.icon}</span>
            <span className="lbl">{getNavLabel(item)}</span>
          </div>
        ))}
      </div>
    </>,
    document.body
  );
}
