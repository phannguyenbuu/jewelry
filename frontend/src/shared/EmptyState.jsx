import React from 'react';

export default function EmptyState({ icon, title, message, action }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 20px', textAlign: 'center' }}>
            {icon && <div style={{ fontSize: 48, color: '#94a3b8', marginBottom: 16 }}>{icon}</div>}
            {title && <h3 style={{ fontSize: 16, fontWeight: 700, color: '#334155', margin: '0 0 8px 0' }}>{title}</h3>}
            {message && <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 24px 0', maxWidth: 400 }}>{message}</p>}
            {action && <div>{action}</div>}
        </div>
    );
}
