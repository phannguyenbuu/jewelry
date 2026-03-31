import { useRef, useState } from 'react';
import { API, btn } from './shared';

export default function InvoiceOcrBtn({ onExtracted }) {
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState('');
    const [preview, setPreview] = useState('');
    const fileRef = useRef();

    const runOcr = async (file) => {
        setLoading(true); setResult('');
        const reader = new FileReader();
        reader.onload = async (ev) => {
            const base64 = ev.target.result.split(',')[1];
            try {
                const res = await fetch(`${API}/api/ocr`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ image_base64: base64, mime_type: file.type || 'image/jpeg', file_name: file.name }),
                });
                const data = await res.json();
                setResult(data.text || data.error || 'Không đọc được');
            } catch (e) { setResult('Lỗi: ' + e.message); }
            setLoading(false);
        };
        reader.readAsDataURL(file);
    };

    const onFile = (e) => {
        const f = e.target.files[0]; if (!f) return;
        setPreview(URL.createObjectURL(f)); setOpen(true); setResult('');
        runOcr(f); e.target.value = '';
    };

    return (
        <>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 7, border: '1.5px solid #6366f1', background: '#f5f3ff', color: '#6366f1', cursor: 'pointer', fontSize: 12, fontWeight: 700, marginTop: 6 }}>
                📷 Upload hóa đơn / OCR
                <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onFile} />
            </label>
            {open && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(3px)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
                    <div style={{ background: 'white', borderRadius: 16, width: '100%', maxWidth: 780, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 60px rgba(0,0,0,.3)' }}>
                        <div style={{ padding: '13px 20px', background: '#1e293b', borderRadius: '16px 16px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ color: 'white', fontWeight: 800, fontSize: 14 }}>🔍 OCR Hóa đơn chuyển khoản</div>
                            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: 'white', fontSize: 22, cursor: 'pointer' }}>×</button>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', flex: 1, overflow: 'hidden', minHeight: 300 }}>
                            <div style={{ padding: 16, background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRight: '1px solid #e2e8f0', overflowY: 'auto' }}>
                                {preview && <img src={preview} style={{ maxWidth: '100%', borderRadius: 8 }} alt="" />}
                            </div>
                            <div style={{ padding: 16, overflowY: 'auto' }}>
                                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 8 }}>NỘI DUNG TRÍCH XUẤT</div>
                                {loading ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '30px 0', color: '#64748b' }}>
                                        <div style={{ width: 32, height: 32, border: '3px solid #e2e8f0', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                                        Đang nhận dạng AI...
                                    </div>
                                ) : (
                                    <div style={{ fontSize: 12, lineHeight: 1.7, whiteSpace: 'pre-wrap', background: '#f0f4f8', borderRadius: 8, padding: 12, fontFamily: 'monospace', userSelect: 'all', color: '#1e293b' }}>
                                        {result || '—'}
                                    </div>
                                )}
                                {result && (
                                    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                                        <button onClick={() => navigator.clipboard.writeText(result)} style={{ ...btn('#6366f1'), fontSize: 12, padding: '6px 14px' }}>📋 Copy</button>
                                        <button onClick={() => { onExtracted && onExtracted(result); setOpen(false); }} style={{ ...btn('#16a34a'), fontSize: 12, padding: '6px 14px' }}>✓ Dùng làm mô tả</button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
            <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
        </>
    );
}

// ─── TAB: THU CHI HÀNG NGÀY ──────────────────────────────────────────────────
