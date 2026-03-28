import React, { useState, useRef } from 'react';
import { API_BASE } from './lib/api';

const API = API_BASE;

// Modern SVG Icons
const CameraIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
        <circle cx="12" cy="13" r="3" />
    </svg>
);

const RefreshIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
        <path d="M3 3v5h5" />
    </svg>
);

const SparklesIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
        <path d="M5 3v4M3 5h4M19 3v4M17 5h4" />
    </svg>
);

const LoadingIcon = () => (
    <svg className="spinner" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="2" x2="12" y2="6" /><line x1="12" y1="18" x2="12" y2="22" /><line x1="4.93" y1="4.93" x2="7.76" y2="7.76" /><line x1="16.24" y1="16.24" x2="19.07" y2="19.07" /><line x1="2" y1="12" x2="6" y2="12" /><line x1="18" y1="12" x2="22" y2="12" /><line x1="4.93" y1="19.07" x2="7.76" y2="16.24" /><line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
    </svg>
);

export default function CameraOcrPage({ onClose }) {
    const [imageSrc, setImageSrc] = useState(null);
    const [loading, setLoading] = useState(false);
    const [title, setTitle] = useState('');
    const [ocrContent, setOcrContent] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const fileInputRef = useRef(null);

    const handleCapture = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            setImageSrc(event.target.result);
            setErrorMsg('');
        };
        reader.readAsDataURL(file);
        // Reset file input so same file can be chosen again if needed
        e.target.value = null;
    };

    const submitOcr = async () => {
        if (!imageSrc) return;
        setLoading(true);
        setErrorMsg('');

        try {
            const [header, base64Data] = imageSrc.split(',');
            const mimeMatch = header.match(/:(.*?);/);
            const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';

            const res = await fetch(`${API}/api/ocr`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    image_base64: base64Data,
                    mime_type: mimeType
                })
            });

            const data = await res.json();
            if (res.ok && data.text) {
                setOcrContent(data.text);
            } else {
                setErrorMsg(data.error || 'Có lỗi xảy ra khi nhận dạng tem.');
            }
        } catch (err) {
            setErrorMsg('Không thể kết nối đến server.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'linear-gradient(135deg, #0f172a 0%, #1e3a6e 60%, #1d4ed8 100%)', fontFamily: "'Be Vietnam Pro', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", color: 'white' }}>

            {/* Header */}
            <header style={{ padding: '16px 20px', background: 'rgba(0,0,0,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                <h1 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <CameraIcon /> OCR Camera
                </h1>
                {onClose && (
                    <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: '#94a3b8', width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, cursor: 'pointer', transition: 'background 0.2s' }}>
                        &times;
                    </button>
                )}
            </header>

            <main style={{ flex: 1, padding: '24px 20px', display: 'flex', flexDirection: 'column', overflowY: 'auto', alignItems: 'center' }}>

                <div style={{ width: '100%', maxWidth: 400, display: 'flex', flexDirection: 'column', gap: 20 }}>

                    {/* Top section: Photo capture + OCR Action */}
                    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>

                        {/* Camera Zone (Reduced size) */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
                            <div
                                onClick={() => fileInputRef.current?.click()}
                                style={{
                                    width: 110, height: 110, background: 'rgba(255,255,255,0.1)', borderRadius: 16,
                                    border: imageSrc ? 'none' : '2px dashed rgba(255,255,255,0.3)',
                                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                    cursor: 'pointer', overflow: 'hidden', position: 'relative',
                                    boxShadow: '0 4px 12px rgba(0,0,0,0.2)', transition: 'transform 0.15s, border-color 0.15s',
                                }}
                                onMouseEnter={e => !imageSrc && (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.6)')}
                                onMouseLeave={e => !imageSrc && (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)')}
                                onMouseDown={e => e.currentTarget.style.transform = 'scale(0.97)'}
                                onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
                            >
                                {imageSrc ? (
                                    <img src={imageSrc} alt="Captured" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                ) : (
                                    <>
                                        <div style={{ color: '#64748b', marginBottom: 6 }}><CameraIcon /></div>
                                        <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8' }}>Chụp tem</div>
                                    </>
                                )}
                                <input
                                    type="file" accept="image/*" capture="environment" ref={fileInputRef}
                                    style={{ display: 'none' }} onChange={handleCapture}
                                />
                            </div>

                            {imageSrc && (
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, cursor: 'pointer', padding: '4px 0' }}
                                >
                                    <RefreshIcon /> Đổi ảnh
                                </button>
                            )}
                        </div>

                        {/* OCR Action and Instructions */}
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 4 }}>
                            <div style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.5 }}>
                                Chụp ảnh rõ nét tem sản phẩm, sau đó nhấn quét để AI tự động trích xuất thông tin.
                            </div>

                            <button
                                onClick={submitOcr}
                                disabled={!imageSrc || loading}
                                style={{
                                    padding: '12px 16px', borderRadius: 12, border: 'none',
                                    background: !imageSrc ? 'rgba(255,255,255,0.1)' : loading ? 'rgba(255,255,255,0.2)' : '#f59e0b',
                                    color: !imageSrc ? 'rgba(255,255,255,0.5)' : 'white',
                                    fontWeight: 600, fontSize: 14, cursor: (!imageSrc || loading) ? 'not-allowed' : 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                                    transition: 'background 0.2s, transform 0.1s', marginTop: 'auto',
                                    boxShadow: (imageSrc && !loading) ? '0 4px 12px rgba(245, 158, 11, 0.4)' : 'none'
                                }}
                                onMouseDown={e => (imageSrc && !loading) && (e.currentTarget.style.transform = 'scale(0.97)')}
                                onMouseUp={e => (imageSrc && !loading) && (e.currentTarget.style.transform = 'scale(1)')}
                            >
                                {loading ? <LoadingIcon /> : <SparklesIcon />}
                                {loading ? 'Đang phân tích...' : 'Quét OCR'}
                            </button>
                        </div>
                    </div>

                    {/* Error message */}
                    {errorMsg && (
                        <div style={{ padding: '12px 14px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: 10, color: '#fca5a5', fontSize: 12, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                            <span style={{ marginTop: 1 }}>⚠</span> <div>{errorMsg}</div>
                        </div>
                    )}

                    <hr style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.15)', margin: '4px 0' }} />

                    {/* Form Fields */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        {/* Title Input */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <label style={{ fontSize: 12, fontWeight: 600, color: '#cbd5e1', letterSpacing: 0.3 }}>Tiêu đề / Mã sản phẩm</label>
                            <input
                                type="text"
                                placeholder="Nhập tiêu đề hoặc mã..."
                                value={title}
                                onChange={e => setTitle(e.target.value)}
                                style={{
                                    width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.2)',
                                    background: 'rgba(0,0,0,0.15)', color: 'white', fontSize: 14, outline: 'none', boxSizing: 'border-box',
                                    transition: 'border-color 0.2s'
                                }}
                                onFocus={e => e.target.style.borderColor = '#f59e0b'}
                                onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.2)'}
                            />
                        </div>

                        {/* Content Textarea */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <label style={{ fontSize: 12, fontWeight: 600, color: '#cbd5e1', letterSpacing: 0.3 }}>Nội dung tem</label>
                                {ocrContent && (
                                    <button
                                        onClick={() => { navigator.clipboard.writeText(ocrContent); alert('Đã copy nội dung!'); }}
                                        style={{ background: 'none', border: 'none', color: '#38bdf8', fontSize: 11, fontWeight: 600, cursor: 'pointer', padding: 0 }}
                                    >
                                        Copy
                                    </button>
                                )}
                            </div>
                            <textarea
                                placeholder="Kết quả OCR sẽ hiển thị ở đây..."
                                value={ocrContent}
                                onChange={e => setOcrContent(e.target.value)}
                                style={{
                                    width: '100%', minHeight: 180, padding: '12px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.2)',
                                    background: 'rgba(0,0,0,0.15)', color: '#f8fafc', fontSize: 14, outline: 'none', resize: 'vertical',
                                    lineHeight: 1.5, boxSizing: 'border-box', transition: 'border-color 0.2s'
                                }}
                                onFocus={e => e.target.style.borderColor = '#f59e0b'}
                                onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.2)'}
                            />
                        </div>

                        {/* Footer action (optional) */}
                        <button
                            onClick={() => alert(`Lưu thành công:\nThành phẩm: ${title}`)}
                            style={{
                                padding: '14px', borderRadius: 12, border: 'none',
                                background: (title || ocrContent) ? '#10b981' : 'rgba(255,255,255,0.1)',
                                color: (title || ocrContent) ? 'white' : 'rgba(255,255,255,0.4)',
                                fontWeight: 700, fontSize: 14, cursor: (title || ocrContent) ? 'pointer' : 'not-allowed',
                                marginTop: 8, transition: 'background 0.2s',
                                boxShadow: (title || ocrContent) ? '0 4px 12px rgba(16, 185, 129, 0.4)' : 'none'
                            }}
                        >
                            Lưu vào hệ thống
                        </button>

                    </div>
                </div>
            </main>

            <style>{`
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #334155; border-radius: 4px; }
        .spinner { animation: spin 1s linear infinite; }
        @keyframes spin { 100% { transform: rotate(360deg); } }
      `}</style>
        </div>
    );
}
