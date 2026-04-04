import { useEffect, useRef, useState } from 'react';
import { IoCloseOutline, IoImagesOutline } from 'react-icons/io5';

import { createLiveBarcodeConstraints, detectLiveBarcode, LIVE_BARCODE_SCAN_INTERVAL_MS, tuneLiveBarcodeStream } from './liveBarcodeScan';
import { S } from './shared';

const INVENTORY_SCAN_FORMATS = ['qr_code', 'code_128', 'code_39', 'ean_13', 'ean_8'];

export default function InventoryCodeScanModal({
    open,
    loading,
    message,
    onClose,
    onDetected,
    onPickFile,
}) {
    const videoRef = useRef(null);
    const fileInputRef = useRef(null);
    const streamRef = useRef(null);
    const scanIntervalRef = useRef(null);
    const scanningBusyRef = useRef(false);
    const detectorRef = useRef(null);
    const scanCanvasRef = useRef(null);
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
            scanningBusyRef.current = false;
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
            scanIntervalRef.current = window.setInterval(async () => {
                const video = videoRef.current;
                if (!video || scanningBusyRef.current || loading || video.readyState < 2) return;
                scanningBusyRef.current = true;
                try {
                    const match = await detectLiveBarcode(detectorRef.current, video, scanCanvasRef, { preferFullFrame: true });
                    if (match?.rawValue) {
                        clearInterval(scanIntervalRef.current);
                        scanIntervalRef.current = null;
                        const shouldClose = await onDetected(match.rawValue);
                        if (shouldClose !== false) {
                            onClose();
                        } else {
                            beginScanning();
                        }
                    }
                } catch {
                    // Ignore frame-level decode errors and keep scanning.
                } finally {
                    scanningBusyRef.current = false;
                }
            }, LIVE_BARCODE_SCAN_INTERVAL_MS);
        };

        const startCamera = async () => {
            setCameraReady(false);
            setCameraError('');

            if (typeof window === 'undefined' || !('BarcodeDetector' in window)) {
                throw new Error('Thiết bị này chưa hỗ trợ quét mã trực tiếp.');
            }

            detectorRef.current = new window.BarcodeDetector({ formats: INVENTORY_SCAN_FORMATS });
            const stream = await navigator.mediaDevices.getUserMedia({
                video: createLiveBarcodeConstraints({ square: false }),
                audio: false,
            });

            if (cancelled) {
                stream.getTracks().forEach(track => track.stop());
                return;
            }

            await tuneLiveBarcodeStream(stream, { preferZoom: false });
            streamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                videoRef.current.onloadedmetadata = () => {
                    videoRef.current?.play?.().catch(() => {});
                    setCameraReady(true);
                    beginScanning();
                };
            }
        };

        startCamera().catch(error => {
            if (!cancelled) {
                setCameraError(error.message || 'Không mở được camera quét mã.');
            }
        });

        return () => {
            cancelled = true;
            stopStream();
        };
    }, [loading, onClose, onDetected, open]);

    if (!open) return null;

    const helperMessage = loading
        ? 'Đang đọc mã...'
        : message || (cameraReady ? 'Đưa QR hoặc mã vạch ra trước camera, hệ thống sẽ tự tìm và nhận mã.' : '');
    const helperColor = loading
        ? '#f8fafc'
        : /^(Đã|Tìm thấy)/.test(message || '') ? '#0f766e' : message ? '#dc2626' : '#cbd5e1';

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1710, background: 'rgba(15,23,42,.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18 }}>
            <div style={{ width: '100%', maxWidth: 420, borderRadius: 28, background: '#0f172a', color: 'white', boxShadow: '0 28px 60px rgba(15,23,42,.38)', overflow: 'hidden', border: '1px solid rgba(255,255,255,.08)' }}>
                <div style={{ padding: '16px 16px 10px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                    <div>
                        <div data-sale-title="true" style={{ fontSize: 15, fontWeight: 900 }}>Quét mã kho</div>
                        <div style={{ marginTop: 4, fontSize: 11, lineHeight: 1.5, color: '#cbd5e1' }}>
                            Đưa mã sản phẩm ra trước camera. Khi nhận được dữ liệu, hệ thống sẽ tự điền mã vào ô tìm kho của dòng hiện tại.
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
                    <div style={{ position: 'relative', borderRadius: 24, overflow: 'hidden', background: '#020617', aspectRatio: '3 / 4' }}>
                        <video
                            ref={videoRef}
                            autoPlay
                            muted
                            playsInline
                            style={{ width: '100%', height: '100%', objectFit: 'contain', opacity: cameraError ? 0.2 : 1 }}
                        />
                        {loading && (
                            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15,23,42,.4)', color: 'white', fontSize: 14, fontWeight: 900 }}>
                                Đang đọc mã...
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
                            <span>Chọn ảnh mã</span>
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
                        onChange={async e => {
                            const file = e.target.files?.[0];
                            e.target.value = '';
                            if (!file) return;
                            const shouldClose = await onPickFile(file);
                            if (shouldClose !== false) onClose();
                        }}
                    />
                </div>
            </div>
        </div>
    );
}
