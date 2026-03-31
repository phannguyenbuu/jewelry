import { useState } from 'react';
import { DM_DEFAULT, btn, inp, saveDM } from './shared';

function DanhMucSection({ type, label, color, dm, addItem, removeItem, newVal, setNewVal }) {
    return (
        <div style={{ background: 'white', borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', background: color, color: 'white', fontWeight: 800, fontSize: 13 }}>{label}</div>
            <div style={{ padding: 16 }}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                    <input
                        style={{ ...inp, flex: 1 }}
                        placeholder="TÃªn danh má»¥c má»›i..."
                        value={newVal}
                        onChange={e => setNewVal(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addItem(type, newVal))}
                    />
                    <button onClick={() => addItem(type, newVal)} style={{ ...btn(color), padding: '8px 16px', whiteSpace: 'nowrap' }}>+ ThÃªm</button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {dm[type].map((name, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                            <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{name}</span>
                            <button onClick={() => removeItem(type, i)} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '2px 6px' }}>Ã—</button>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

export default function DanhMucTab({ dm, setDm }) {
    const [newThu, setNewThu] = useState('');
    const [newChi, setNewChi] = useState('');

    const addItem = (type, val) => {
        const v = val.trim();
        if (!v) return;
        const updated = { ...dm, [type]: [...dm[type], v] };
        setDm(updated);
        saveDM(updated);
        if (type === 'thu') setNewThu('');
        else setNewChi('');
    };

    const removeItem = (type, idx) => {
        const updated = { ...dm, [type]: dm[type].filter((_, i) => i !== idx) };
        setDm(updated);
        saveDM(updated);
    };

    const resetDefault = () => {
        setDm(DM_DEFAULT);
        saveDM(DM_DEFAULT);
    };

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>âš™ï¸ Cáº¥u hÃ¬nh danh má»¥c Thu/Chi</div>
                <button onClick={resetDefault} style={{ ...btn('#f1f5f9', '#475569'), fontSize: 12 }}>KhÃ´i phá»¥c máº·c Ä‘á»‹nh</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <DanhMucSection type="thu" label="ðŸŸ¢ Danh má»¥c Thu" color="#16a34a" dm={dm} addItem={addItem} removeItem={removeItem} newVal={newThu} setNewVal={setNewThu} />
                <DanhMucSection type="chi" label="ðŸ”´ Danh má»¥c Chi" color="#dc2626" dm={dm} addItem={addItem} removeItem={removeItem} newVal={newChi} setNewVal={setNewChi} />
            </div>
        </div>
    );
}
