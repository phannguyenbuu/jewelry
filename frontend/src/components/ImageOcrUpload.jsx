/**
 * ImageOcrUpload — Reusable image upload + OCR component
 * -------------------------------------------------------
 * Uses the /api/ocr endpoint (Gemini Vision) to extract text from an uploaded image.
 *
 * Props:
 *   onExtracted(text)   — called when user clicks "Dùng làm mô tả" with the extracted text
 *   apiUrl              — base URL of the backend (default: '' = same origin)
 *   label               — button label  (default: "📎 Đính kèm / OCR")
 *   accept              — file accept string (default: "image/*")
 *   accentColor         — hex color for the button border & icon (default: "#6366f1")
 *   ocrEndpoint         — path of the OCR endpoint (default: "/api/ocr")
 *
 * Usage:
 *   import ImageOcrUpload from './components/ImageOcrUpload';
 *   <ImageOcrUpload onExtracted={text => setForm(f => ({ ...f, mo_ta: text }))} />
 *
 * Backend contract (POST ocrEndpoint):
 *   Request:  { image_base64: string, mime_type: string, file_name: string }
 *   Response: { text: string } | { error: string }
 */

import { useState, useRef } from 'react';

const DEFAULT_ACCENT = '#6366f1';

export default function ImageOcrUpload({
    onExtracted,
    apiUrl = '',
    label = '📎 Đính kèm / OCR',
    accept = 'image/*',
    accentColor = DEFAULT_ACCENT,
    ocrEndpoint = '/api/ocr',
}) {
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState('');
    const [preview, setPreview] = useState('');
    const [fileName, setFileName] = useState('');
    const [dragOver, setDragOver] = useState(false);
    const fileRef = useRef();

    /* ── OCR call ─────────────────────────────────────────────────── */
    const runOcr = (file) => {
        setLoading(true);
        setResult('');
        const reader = new FileReader();
        reader.onload = async (ev) => {
            const base64 = ev.target.result.split(',')[1];
            try {
                const res = await fetch(`${apiUrl}${ocrEndpoint}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        image_base64: base64,
                        mime_type: file.type || 'image/jpeg',
                        file_name: file.name,
                    }),
                });
                const data = await res.json();
                setResult(data.text || data.error || 'Không đọc được nội dung');
            } catch (e) {
                setResult('Lỗi kết nối: ' + e.message);
            }
            setLoading(false);
        };
        reader.readAsDataURL(file);
    };

    /* ── File handlers ────────────────────────────────────────────── */
    const handleFile = (file) => {
        if (!file) return;
        setFileName(file.name);
        setPreview(URL.createObjectURL(file));
        setOpen(true);
        setResult('');
        runOcr(file);
    };

    const onInputChange = (e) => {
        handleFile(e.target.files[0]);
        e.target.value = '';
    };

    const onDrop = (e) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) handleFile(file);
    };

    /* ── Styles ───────────────────────────────────────────────────── */
    const pill = {
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '7px 14px', borderRadius: 999,
        border: `1.5px solid ${accentColor}`,
        background: accentColor + '14',
        color: accentColor, cursor: 'pointer',
        fontSize: 12, fontWeight: 700,
        transition: 'all .15s', userSelect: 'none',
    };

    const overlay = {
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,.65)',
        backdropFilter: 'blur(4px)',
        zIndex: 3000, display: 'flex',
        alignItems: 'center', justifyContent: 'center', padding: 20,
    };

    const modalBox = {
        background: 'white', borderRadius: 18,
        width: '100%', maxWidth: 820, maxHeight: '92vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 32px 80px rgba(0,0,0,.35)',
        overflow: 'hidden',
    };

    const btnBase = (bg, c = 'white') => ({
        padding: '7px 16px', borderRadius: 8, border: 'none',
        background: bg, color: c, fontWeight: 700,
        cursor: 'pointer', fontSize: 12, display: 'inline-flex',
        alignItems: 'center', gap: 5, transition: 'opacity .15s',
    });

    return (
        <>
            {/* ── Trigger area (button + drag zone) ── */}
            <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                style={{
                    border: `2px dashed ${dragOver ? accentColor : '#e2e8f0'}`,
                    borderRadius: 10, padding: '10px 14px',
                    background: dragOver ? accentColor + '0d' : '#fafafa',
                    transition: 'all .2s', display: 'flex', alignItems: 'center', gap: 10,
                }}
            >
                <label style={pill}>
                    {label}
                    <input
                        ref={fileRef} type="file" accept={accept}
                        style={{ display: 'none' }} onChange={onInputChange}
                    />
                </label>
                <span style={{ fontSize: 11, color: '#94a3b8' }}>
                    {dragOver ? 'Thả ảnh vào đây...' : 'hoặc kéo thả ảnh vào đây'}
                </span>
            </div>

            {/* ── Modal: preview + OCR result ── */}
            {open && (
                <div style={overlay} onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
                    <div style={modalBox}>
                        {/* Header */}
                        <div style={{
                            padding: '14px 22px', background: '#1e293b',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0,
                        }}>
                            <div>
                                <div style={{ color: 'white', fontWeight: 800, fontSize: 14 }}>
                                    🔍 OCR — {fileName || 'Ảnh đính kèm'}
                                </div>
                                <div style={{ color: '#94a3b8', fontSize: 11, marginTop: 2 }}>
                                    Nhận dạng văn bản bằng Gemini AI · Chọn kết quả để điền vào form
                                </div>
                            </div>
                            <button onClick={() => setOpen(false)}
                                style={{ background: 'none', border: 'none', color: 'white', fontSize: 24, cursor: 'pointer', lineHeight: 1 }}>
                                ×
                            </button>
                        </div>

                        {/* Body — 2 column */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', flex: 1, overflow: 'hidden', minHeight: 320 }}>
                            {/* Left: image preview */}
                            <div style={{
                                padding: 16, background: '#f1f5f9',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                borderRight: '1px solid #e2e8f0', overflowY: 'auto',
                            }}>
                                {preview && (
                                    <img src={preview} alt="preview"
                                        style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 10, boxShadow: '0 4px 16px rgba(0,0,0,.15)' }} />
                                )}
                            </div>

                            {/* Right: OCR result */}
                            <div style={{ padding: 18, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
                                <div style={{ fontSize: 10, fontWeight: 800, color: '#64748b', letterSpacing: .8 }}>
                                    NỘI DUNG TRÍCH XUẤT
                                </div>

                                {loading ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '30px 0', color: '#94a3b8' }}>
                                        <div style={{
                                            width: 36, height: 36,
                                            border: `3px solid #e2e8f0`,
                                            borderTopColor: accentColor,
                                            borderRadius: '50%',
                                            animation: 'ocrSpin 1s linear infinite',
                                        }} />
                                        <span style={{ fontWeight: 600, fontSize: 13 }}>Đang nhận dạng AI...</span>
                                        <span style={{ fontSize: 11 }}>Gemini Vision đang phân tích ảnh</span>
                                    </div>
                                ) : (
                                    <div style={{
                                        fontSize: 12, lineHeight: 1.75, whiteSpace: 'pre-wrap',
                                        background: '#f8fafc', borderRadius: 10, padding: 14,
                                        fontFamily: 'monospace', userSelect: 'all',
                                        color: '#1e293b', flex: 1,
                                        border: '1px solid #e2e8f0',
                                        minHeight: 120,
                                    }}>
                                        {result || <span style={{ color: '#cbd5e1' }}>— Chưa có kết quả —</span>}
                                    </div>
                                )}

                                {result && !loading && (
                                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                        <button
                                            onClick={() => navigator.clipboard.writeText(result)}
                                            style={btnBase('#64748b')}
                                        >
                                            📋 Copy toàn bộ
                                        </button>
                                        <button
                                            onClick={() => { onExtracted && onExtracted(result); setOpen(false); }}
                                            style={btnBase(accentColor)}
                                        >
                                            ✓ Dùng làm mô tả
                                        </button>
                                        <button
                                            onClick={() => fileRef.current?.click()}
                                            style={btnBase('#f1f5f9', '#475569')}
                                        >
                                            🔄 Ảnh khác
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <style>{`@keyframes ocrSpin { 100% { transform: rotate(360deg); } }`}</style>
        </>
    );
}
