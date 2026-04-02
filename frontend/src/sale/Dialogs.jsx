import { useEffect, useRef, useState } from 'react';
import { IoCameraOutline, IoCloseOutline, IoImagesOutline, IoQrCodeOutline } from 'react-icons/io5';
import { APP_GRADIENT_BRIGHT, S } from './shared';

function ConfirmDialog({ open, title, message, confirmLabel, cancelLabel = 'Hủy', loading = false, onClose, onConfirm }) {
    if (!open) return null;

    return (
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1600, background: 'rgba(15,23,42,.42)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18 }}>
            <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 420, borderRadius: 24, background: 'rgba(255,255,255,.98)', boxShadow: '0 24px 60px rgba(15,23,42,.24)', border: '1px solid rgba(15,23,42,.08)', padding: 18 }}>
                <div data-sale-title="true" style={{ fontSize: 15, fontWeight: 900, color: '#111827' }}>{title}</div>
                <div style={{ fontSize: 12, lineHeight: 1.55, color: '#475569', marginTop: 10 }}>{message}</div>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
                    <button type="button" onClick={onClose} disabled={loading} style={{ ...S.pillBtn('#ffffff', '#111827'), boxShadow: 'none', border: '1px solid #dbe4ee' }}>
                        {cancelLabel}
                    </button>
                    <button type="button" onClick={onConfirm} disabled={loading} style={S.pillBtn('linear-gradient(135deg,#dc2626,#f97316)', 'white')}>
                        {loading ? 'Đang cập nhật...' : confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}

function ImageViewerModal({ open, imageUrl, title = 'Xem ảnh', caption = '', onClose }) {
    if (!open || !imageUrl) return null;

    return (
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1680, background: 'rgba(2,6,23,.82)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18 }}>
            <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 920, maxHeight: '92vh', borderRadius: 28, background: '#0f172a', border: '1px solid rgba(255,255,255,.08)', boxShadow: '0 28px 60px rgba(15,23,42,.38)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderBottom: '1px solid rgba(255,255,255,.08)' }}>
                    <div style={{ minWidth: 0 }}>
                        <div data-sale-title="true" style={{ fontSize: 15, fontWeight: 900, color: '#f8fafc' }}>{title}</div>
                        {caption ? <div style={{ marginTop: 4, fontSize: 11, color: '#cbd5e1', lineHeight: 1.45 }}>{caption}</div> : null}
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        style={{ width: 36, height: 36, borderRadius: '50%', border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.06)', color: 'white', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                    >
                        <IoCloseOutline />
                    </button>
                </div>
                <div style={{ padding: 16, overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(180deg, rgba(15,23,42,.96), rgba(2,6,23,.98))' }}>
                    <img
                        src={imageUrl}
                        alt={title}
                        style={{ maxWidth: '100%', maxHeight: 'calc(92vh - 110px)', objectFit: 'contain', display: 'block', borderRadius: 18, background: '#020617', boxShadow: '0 18px 40px rgba(0,0,0,.28)' }}
                    />
                </div>
            </div>
        </div>
    );
}

function CustomerIdOcrModal({ open, loading, message, side, onSideChange, onClose, onCapture, onPickFile }) {
    const previewAspect = 16 / 9;
    const videoRef = useRef(null);
    const fileInputRef = useRef(null);
    const streamRef = useRef(null);
    const [cameraReady, setCameraReady] = useState(false);
    const [cameraError, setCameraError] = useState('');

    useEffect(() => {
        if (!open) return undefined;
        let cancelled = false;

        const stopStream = () => {
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
                streamRef.current = null;
            }
            if (videoRef.current) {
                videoRef.current.srcObject = null;
            }
        };

        const startCamera = async () => {
            setCameraReady(false);
            setCameraError('');
            try {
                if (!navigator.mediaDevices?.getUserMedia) {
                    throw new Error('Thiết bị này chưa hỗ trợ camera trực tiếp.');
                }
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        facingMode: { ideal: 'environment' },
                        width: { ideal: 1080 },
                        height: { ideal: 1920 },
                    },
                    audio: false,
                });
                if (cancelled) {
                    stream.getTracks().forEach(track => track.stop());
                    return;
                }
                streamRef.current = stream;
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    videoRef.current.onloadedmetadata = () => {
                        videoRef.current?.play?.().catch(() => { });
                        setCameraReady(true);
                    };
                }
            } catch (error) {
                if (!cancelled) {
                    setCameraError(error.message || 'Không mở được camera.');
                }
            }
        };

        startCamera().catch(() => { });
        return () => {
            cancelled = true;
            stopStream();
        };
    }, [open]);

    const handleCapture = async () => {
        const video = videoRef.current;
        if (!video?.videoWidth || !video?.videoHeight || loading) return;

        const sourceWidth = video.videoWidth;
        const sourceHeight = video.videoHeight;
        const sourceAspect = sourceWidth / sourceHeight;
        let cropWidth = sourceWidth;
        let cropHeight = sourceHeight;

        if (sourceAspect > previewAspect) {
            cropWidth = Math.round(sourceHeight * previewAspect);
            cropHeight = sourceHeight;
        } else {
            cropWidth = sourceWidth;
            cropHeight = Math.round(sourceWidth / previewAspect);
        }

        const cropX = Math.max(0, Math.round((sourceWidth - cropWidth) / 2));
        const cropY = Math.max(0, Math.round((sourceHeight - cropHeight) / 2));

        const canvas = document.createElement('canvas');
        canvas.width = cropWidth;
        canvas.height = cropHeight;
        const context = canvas.getContext('2d');
        if (!context) return;

        context.drawImage(video, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
        const imageBase64 = canvas.toDataURL('image/jpeg', 0.95).split(',')[1] || '';
        await onCapture({
            imageBase64,
            mimeType: 'image/jpeg',
            fileName: 'cccd-camera.jpg',
            side,
        });
    };

    if (!open) return null;

    const helperColor = message?.startsWith('OCR CCCD') ? '#0f766e' : '#dc2626';

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1700, background: 'rgba(15,23,42,.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18 }}>
            <div style={{ width: '100%', maxWidth: 420, borderRadius: 28, background: '#0f172a', color: 'white', boxShadow: '0 28px 60px rgba(15,23,42,.38)', overflow: 'hidden', border: '1px solid rgba(255,255,255,.08)' }}>
                <div style={{ padding: '16px 16px 10px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                    <div>
                        <div data-sale-title="true" style={{ fontSize: 15, fontWeight: 900 }}>OCR CCCD</div>
                        <div style={{ marginTop: 4, fontSize: 11, lineHeight: 1.5, color: '#cbd5e1' }}>
                            {side === 'front'
                                ? 'Dùng toàn bộ khung ngang để chụp và xoay CCCD dựng đứng lại trong khung. Khi bấm đọc, hệ thống sẽ lấy đúng vùng camera đang thấy và điền thông tin ngay khi OCR xong.'
                                : 'Dùng toàn bộ khung ngang để chụp và xoay mặt sau CCCD dựng đứng lại trong khung. Khi bấm đọc, hệ thống sẽ OCR toàn bộ nội dung đang thấy và lưu lại ngay.'}
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        style={{ width: 34, height: 34, borderRadius: '50%', border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.06)', color: 'white', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                    >
                        <IoCloseOutline />
                    </button>
                </div>

                <div style={{ padding: '0 16px 16px' }}>
                    <div style={{ display: 'inline-flex', borderRadius: 999, padding: 4, gap: 4, background: 'rgba(255,255,255,.08)', marginBottom: 12 }}>
                        {[
                            { key: 'front', label: 'Mặt trước' },
                            { key: 'back', label: 'Mặt sau' },
                        ].map(option => (
                            <button
                                key={option.key}
                                type="button"
                                onClick={() => onSideChange(option.key)}
                                style={{
                                    border: 'none',
                                    borderRadius: 999,
                                    padding: '8px 12px',
                                    background: side === option.key ? 'linear-gradient(135deg,#0f766e,#14b8a6)' : 'transparent',
                                    color: 'white',
                                    fontSize: 11,
                                    fontWeight: 800,
                                    cursor: 'pointer',
                                }}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>
                    <div style={{ position: 'relative', borderRadius: 24, overflow: 'hidden', background: '#020617', aspectRatio: '16 / 9' }}>
                        <video
                            ref={videoRef}
                            autoPlay
                            muted
                            playsInline
                            style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: cameraError ? 0.2 : 1 }}
                        />
                        <div style={{ position: 'absolute', left: 16, right: 16, bottom: 16, padding: '10px 12px', borderRadius: 16, background: 'rgba(15,23,42,.58)', color: '#f8fafc', fontSize: 11, lineHeight: 1.45, textAlign: 'center', backdropFilter: 'blur(10px)' }}>
                            {side === 'front'
                                ? 'Giữ CCCD dựng đứng, nằm trọn trong khung ngang và đủ sáng rồi bấm `Đọc ngay`.'
                                : 'Giữ mặt sau CCCD dựng đứng, nằm trọn trong khung ngang và đủ sáng rồi bấm `Đọc ngay`.'}
                        </div>
                        {loading && (
                            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15,23,42,.45)', color: 'white', fontSize: 13, fontWeight: 800 }}>
                                Đang đọc CCCD...
                            </div>
                        )}
                        {cameraError && (
                            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center', color: '#fde68a', fontSize: 12, lineHeight: 1.55 }}>
                                {cameraError}
                            </div>
                        )}
                    </div>

                    {message ? (
                        <div style={{ marginTop: 10, fontSize: 10, color: helperColor, lineHeight: 1.45 }}>
                            {message}
                        </div>
                    ) : null}

                    <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={loading}
                            style={{ ...S.pillBtn('rgba(255,255,255,.08)', '#f8fafc'), flex: 1, justifyContent: 'center', border: '1px solid rgba(255,255,255,.08)', boxShadow: 'none' }}
                        >
                            <IoImagesOutline />
                            <span>Chọn ảnh</span>
                        </button>
                        <button
                            type="button"
                            onClick={handleCapture}
                            disabled={loading || !cameraReady}
                            style={{ ...S.pillBtn('linear-gradient(135deg,#0f766e,#14b8a6)', 'white'), flex: 1, justifyContent: 'center', opacity: loading || !cameraReady ? 0.6 : 1 }}
                        >
                            <IoCameraOutline />
                            <span>{loading ? 'Đang đọc...' : 'Đọc ngay'}</span>
                        </button>
                    </div>

                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        style={{ display: 'none' }}
                        onChange={e => {
                            const file = e.target.files?.[0];
                            e.target.value = '';
                            if (file) onPickFile(file, side);
                        }}
                    />
                </div>
            </div>
        </div>
    );
}

function CustomerQrScanModal({ open, loading, message, onClose, onDetected, onPickFile }) {
    const videoRef = useRef(null);
    const fileInputRef = useRef(null);
    const streamRef = useRef(null);
    const scanIntervalRef = useRef(null);
    const scanningBusyRef = useRef(false);
    const detectorRef = useRef(null);
    const [cameraReady, setCameraReady] = useState(false);
    const [cameraError, setCameraError] = useState('');

    useEffect(() => {
        if (!open) return undefined;
        let cancelled = false;

        const stopStream = () => {
            if (scanIntervalRef.current) {
                clearInterval(scanIntervalRef.current);
                scanIntervalRef.current = null;
            }
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
                streamRef.current = null;
            }
            if (videoRef.current) {
                videoRef.current.srcObject = null;
            }
        };

        const beginScanning = () => {
            if (!detectorRef.current || scanIntervalRef.current) return;
            scanIntervalRef.current = setInterval(async () => {
                const video = videoRef.current;
                if (!video || scanningBusyRef.current || loading || video.readyState < 2) return;
                scanningBusyRef.current = true;
                try {
                    const results = await detectorRef.current.detect(video);
                    const match = results.find(item => item?.rawValue);
                    if (match?.rawValue) {
                        clearInterval(scanIntervalRef.current);
                        scanIntervalRef.current = null;
                        await onDetected(match.rawValue);
                    }
                } catch {
                    // ignore frame-level decode errors and continue scanning
                } finally {
                    scanningBusyRef.current = false;
                }
            }, 350);
        };

        const startCamera = async () => {
            setCameraReady(false);
            setCameraError('');
            if (typeof window === 'undefined' || !('BarcodeDetector' in window)) {
                throw new Error('Thiết bị này chưa hỗ trợ quét QR trực tiếp.');
            }
            detectorRef.current = new window.BarcodeDetector({ formats: ['qr_code'] });
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: { ideal: 'environment' },
                    width: { ideal: 1280 },
                    height: { ideal: 1280 },
                },
                audio: false,
            });
            if (cancelled) {
                stream.getTracks().forEach(track => track.stop());
                return;
            }
            streamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                videoRef.current.onloadedmetadata = () => {
                    videoRef.current?.play?.().catch(() => { });
                    setCameraReady(true);
                    beginScanning();
                };
            }
        };

        startCamera().catch(error => {
            if (!cancelled) {
                setCameraError(error.message || 'Không mở được camera quét QR.');
            }
        });

        return () => {
            cancelled = true;
            stopStream();
        };
    }, [open, loading, onDetected]);

    if (!open) return null;

    const helperMessage = loading
        ? 'Đang parse QR...'
        : message || (cameraReady ? 'Đưa mã QR vào chính giữa khung vuông để hệ thống tự nhận.' : '');
    const helperColor = loading
        ? '#f8fafc'
        : message?.startsWith('QR CCCD xong') ? '#0f766e' : message ? '#dc2626' : '#cbd5e1';

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1710, background: 'rgba(15,23,42,.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18 }}>
            <div style={{ width: '100%', maxWidth: 420, borderRadius: 28, background: '#0f172a', color: 'white', boxShadow: '0 28px 60px rgba(15,23,42,.38)', overflow: 'hidden', border: '1px solid rgba(255,255,255,.08)' }}>
                <div style={{ padding: '16px 16px 10px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                    <div>
                        <div data-sale-title="true" style={{ fontSize: 15, fontWeight: 900 }}>Quét QR CCCD</div>
                        <div style={{ marginTop: 4, fontSize: 11, lineHeight: 1.5, color: '#cbd5e1' }}>
                            Đưa ảnh QR vào khung vuông. Khi nhận được dữ liệu, hệ thống sẽ parse QR rồi tự điền vào các ô khách hàng.
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        style={{ width: 34, height: 34, borderRadius: '50%', border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.06)', color: 'white', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                    >
                        <IoCloseOutline />
                    </button>
                </div>

                <div style={{ padding: '0 16px 16px' }}>
                    <div style={{ position: 'relative', borderRadius: 24, overflow: 'hidden', background: '#020617', aspectRatio: '1 / 1' }}>
                        <video
                            ref={videoRef}
                            autoPlay
                            muted
                            playsInline
                            style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: cameraError ? 0.2 : 1 }}
                        />
                        <div
                            style={{
                                position: 'absolute',
                                left: '50%',
                                top: '50%',
                                width: '58%',
                                aspectRatio: '1 / 1',
                                transform: 'translate(-50%, -50%)',
                                borderRadius: 24,
                                border: '2px solid rgba(255,255,255,.96)',
                                boxShadow: '0 0 0 9999px rgba(2,6,23,.45)',
                                pointerEvents: 'none',
                            }}
                        />
                        {loading && (
                            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15,23,42,.4)', color: 'white', fontSize: 14, fontWeight: 900 }}>
                                Đang parse QR...
                            </div>
                        )}
                        {cameraError && (
                            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center', color: '#fde68a', fontSize: 12, lineHeight: 1.55 }}>
                                {cameraError}
                            </div>
                        )}
                    </div>

                    {helperMessage ? (
                        <div style={{ marginTop: 10, fontSize: 10, color: helperColor, lineHeight: 1.45 }}>
                            {helperMessage}
                        </div>
                    ) : null}

                    <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={loading}
                            style={{ ...S.pillBtn('rgba(255,255,255,.08)', '#f8fafc'), flex: 1, justifyContent: 'center', border: '1px solid rgba(255,255,255,.08)', boxShadow: 'none' }}
                        >
                            <IoImagesOutline />
                            <span>Chọn ảnh QR</span>
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            style={{ ...S.pillBtn('#ffffff', '#111827'), flex: 1, justifyContent: 'center', boxShadow: 'none' }}
                        >
                            <span>Đóng</span>
                        </button>
                    </div>

                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        style={{ display: 'none' }}
                        onChange={e => {
                            const file = e.target.files?.[0];
                            e.target.value = '';
                            if (file) onPickFile(file);
                        }}
                    />
                </div>
            </div>
        </div>
    );
}

/* â”€â”€ Screen 1: ORDER â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

export { ConfirmDialog, ImageViewerModal, CustomerIdOcrModal, CustomerQrScanModal };
