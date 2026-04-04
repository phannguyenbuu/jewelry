import { useEffect, useRef, useState } from 'react';
import { IoCameraOutline, IoCheckmarkCircle, IoCloseOutline, IoDocumentTextOutline, IoImagesOutline, IoQrCodeOutline, IoTrashOutline } from 'react-icons/io5';
import { createLiveBarcodeConstraints, detectLiveBarcode, LIVE_BARCODE_SCAN_INTERVAL_MS, tuneLiveBarcodeStream } from './liveBarcodeScan';
import { S } from './shared';
import { ConfirmDialog } from './Dialogs';

const PHOTO_TAB = 'photo';
const QR_TAB = 'qr';
const OCR_FRONT_TAB = 'ocr_front';
const OCR_BACK_TAB = 'ocr_back';

const TAB_OPTIONS = [
    { key: OCR_FRONT_TAB, label: 'CCCD mặt trước',   icon: IoDocumentTextOutline },
    { key: OCR_BACK_TAB,  label: 'CCCD mặt sau',     icon: IoDocumentTextOutline },
    { key: QR_TAB,        label: 'QR',               icon: IoQrCodeOutline },
    { key: PHOTO_TAB,     label: 'Chụp hình',       icon: IoCameraOutline },
];

const PHOTO_HELPER_TEXT    = 'Chụp nhiều ảnh nếu cần. Tất cả ảnh sẽ được giữ lại trong hồ sơ khách hàng.';
const QR_HELPER_TEXT       = 'Đưa mã QR ra trước camera, hệ thống sẽ tự tìm và nhận dữ liệu liên tục.';
const OCR_FRONT_HELPER_TEXT = 'Chụp mặt trước CCCD trong khung — OCR sẽ tự điền tên, ngày sinh, địa chỉ.';
const OCR_BACK_HELPER_TEXT  = 'Chụp mặt sau CCCD trong khung — OCR sẽ bổ sung thông tin nơi thường trú.';

function captureVideoFrame(video, { aspectRatio = null } = {}) {
    if (!video?.videoWidth || !video?.videoHeight) return null;

    const sourceWidth = video.videoWidth;
    const sourceHeight = video.videoHeight;
    let cropWidth = sourceWidth;
    let cropHeight = sourceHeight;

    if (aspectRatio) {
        const sourceAspect = sourceWidth / sourceHeight;
        if (sourceAspect > aspectRatio) {
            cropWidth = Math.round(sourceHeight * aspectRatio);
            cropHeight = sourceHeight;
        } else {
            cropWidth = sourceWidth;
            cropHeight = Math.round(sourceWidth / aspectRatio);
        }
    }

    const cropX = Math.max(0, Math.round((sourceWidth - cropWidth) / 2));
    const cropY = Math.max(0, Math.round((sourceHeight - cropHeight) / 2));

    const canvas = document.createElement('canvas');
    canvas.width = cropWidth;
    canvas.height = cropHeight;
    const context = canvas.getContext('2d');
    if (!context) return null;

    context.drawImage(video, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.95);

    return {
        dataUrl,
        imageBase64: dataUrl.split(',')[1] || '',
        mimeType: 'image/jpeg',
    };
}

function buildPhotoPreviewItems(files) {
    return Array.from(files || []).map((file, index) => {
        const objectUrl = URL.createObjectURL(file);
        return {
            id: `picked-${Date.now()}-${index}`,
            url: objectUrl,
            label: file.name || `Ảnh ${index + 1}`,
            revoke: objectUrl,
        };
    });
}

function buildSavedPhotoItems(items) {
    return Array.from(items || [])
        .filter(Boolean)
        .map((item, index) => {
            if (item && typeof item === 'object') {
                const fullUrl = item.url || item.fullUrl || item.imageUrl || '';
                const thumbUrl = item.thumbUrl || item.thumb_url || item.thumbnailUrl || item.thumbnail_url || fullUrl;
                return {
                    id: `saved-${index}-${fullUrl || thumbUrl}`,
                    url: thumbUrl || fullUrl,
                    fullUrl: fullUrl || thumbUrl,
                    label: item.label || `Ảnh ${index + 1}`,
                };
            }
            return {
                id: `saved-${index}-${item}`,
                url: item,
                fullUrl: item,
                label: `Ảnh ${index + 1}`,
            };
        });
}

function resolveHelperColor(message, loading) {
    if (loading) return '#f8fafc';
    if (!message) return '#cbd5e1';
    if (/^(QR CCCD xong|OCR CCCD xong|Đã )/i.test(message)) return '#14b8a6';
    return '#fde68a';
}

export default function CustomerCaptureModal({
    open,
    activeTab = PHOTO_TAB,
    initialPhotos = [],
    onTabChange,
    message,
    qrLoading,
    ocrLoading,
    onClose,
    onQrDetected,
    onQrPickFile,
    onOcrCapture,
    onOcrPickFile,
    onPhotoCapture,
    onPhotoPickFiles,
    onPhotoDelete,
    onClearTab,
    tabsDone = {},
}) {
    const videoRef = useRef(null);
    const qrFileInputRef = useRef(null);
    const ocrFileInputRef = useRef(null);
    const photoFileInputRef = useRef(null);
    const streamRef = useRef(null);
    const scanIntervalRef = useRef(null);
    const detectorRef = useRef(null);
    const qrScanCanvasRef = useRef(null);
    const qrScanningBusyRef = useRef(false);
    const qrDetectedRef = useRef(onQrDetected);
    const objectUrlsRef = useRef([]);
    const [cameraReady, setCameraReady] = useState(false);
    const [cameraError, setCameraError] = useState('');
    const [photoShots, setPhotoShots] = useState(() => buildSavedPhotoItems(initialPhotos));
    const [deleteConfirm, setDeleteConfirm] = useState(null); // { label, onConfirm }

    useEffect(() => {
        qrDetectedRef.current = onQrDetected;
    }, [onQrDetected]);

    useEffect(() => () => {
        objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
        objectUrlsRef.current = [];
    }, []);

    useEffect(() => {
        if (!open) {
            objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
            objectUrlsRef.current = [];
            return undefined;
        }

        let cancelled = false;

        const stopStream = () => {
            if (scanIntervalRef.current) {
                clearInterval(scanIntervalRef.current);
                scanIntervalRef.current = null;
            }
            qrScanningBusyRef.current = false;
            if (streamRef.current) {
                streamRef.current.getTracks().forEach((track) => track.stop());
                streamRef.current = null;
            }
            if (videoRef.current) {
                videoRef.current.srcObject = null;
            }
        };

        const beginQrScanning = () => {
            if (!detectorRef.current || scanIntervalRef.current) return;
            scanIntervalRef.current = window.setInterval(async () => {
                const video = videoRef.current;
                if (!video || qrScanningBusyRef.current || video.readyState < 2 || qrLoading) return;
                qrScanningBusyRef.current = true;
                try {
                    const match = await detectLiveBarcode(detectorRef.current, video, qrScanCanvasRef, { preferFullFrame: true });
                    if (match?.rawValue) {
                        clearInterval(scanIntervalRef.current);
                        scanIntervalRef.current = null;
                        await qrDetectedRef.current?.(match.rawValue);
                    }
                } catch {
                    // Keep scanning until a valid QR frame is detected.
                } finally {
                    qrScanningBusyRef.current = false;
                }
            }, LIVE_BARCODE_SCAN_INTERVAL_MS);
        };

        const startCamera = async () => {
            setCameraReady(false);
            setCameraError('');

            if (!navigator.mediaDevices?.getUserMedia) {
                throw new Error('Thiết bị này chưa hỗ trợ camera trực tiếp.');
            }

            if (activeTab === QR_TAB) {
                if (typeof window === 'undefined' || !('BarcodeDetector' in window)) {
                    throw new Error('Thiết bị này chưa hỗ trợ quét QR trực tiếp.');
                }
                detectorRef.current = new window.BarcodeDetector({ formats: ['qr_code'] });
            } else {
                detectorRef.current = null;
            }

            const wantsLiveBarcodeScan = activeTab === QR_TAB;
            const stream = await navigator.mediaDevices.getUserMedia({
                video: wantsLiveBarcodeScan
                    ? createLiveBarcodeConstraints({ square: false })
                    : {
                        facingMode: { ideal: 'environment' },
                        width: { ideal: 1080 },
                        height: { ideal: 1920 },
                    },
                audio: false,
            });

            if (cancelled) {
                stream.getTracks().forEach((track) => track.stop());
                return;
            }

            streamRef.current = stream;
            if (wantsLiveBarcodeScan) {
                await tuneLiveBarcodeStream(stream, { preferZoom: false });
            }
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                videoRef.current.onloadedmetadata = () => {
                    videoRef.current?.play?.().catch(() => {});
                    setCameraReady(true);
                    if (activeTab === QR_TAB) beginQrScanning();
                };
            }
        };

        startCamera().catch((error) => {
            if (!cancelled) {
                setCameraError(error.message || 'Không mở được camera.');
            }
        });

        return () => {
            cancelled = true;
            stopStream();
        };
    }, [open, activeTab, qrLoading]);

    if (!open) return null;

    const askDelete = (label, onConfirm) => setDeleteConfirm({ label, onConfirm });

    const currentTab = TAB_OPTIONS.some((option) => option.key === activeTab) ? activeTab : PHOTO_TAB;
    const isOcrTab = currentTab === OCR_FRONT_TAB || currentTab === OCR_BACK_TAB;
    const derivedSide = currentTab === OCR_FRONT_TAB ? 'front' : 'back';
    const previewAspect = currentTab === QR_TAB ? '3 / 4' : isOcrTab ? '16 / 9' : '4 / 3';
    const loading = currentTab === QR_TAB ? qrLoading : isOcrTab ? ocrLoading : false;
    const helperMessage = loading
        ? currentTab === QR_TAB ? 'Đang parse QR...' : 'Đang đọc CCCD...'
        : message || (currentTab === PHOTO_TAB
            ? PHOTO_HELPER_TEXT
            : currentTab === QR_TAB
                ? QR_HELPER_TEXT
                : currentTab === OCR_FRONT_TAB
                    ? OCR_FRONT_HELPER_TEXT
                    : OCR_BACK_HELPER_TEXT);
    const helperColor = resolveHelperColor(message, loading);

    const handlePhotoCapture = async () => {
        const payload = captureVideoFrame(videoRef.current, { aspectRatio: 4 / 3 });
        if (!payload?.imageBase64) return;
        setPhotoShots((prev) => [
            { id: `capture-${Date.now()}`, url: payload.dataUrl, label: `Ảnh ${prev.length + 1}` },
            ...prev,
        ].slice(0, 8));
        await onPhotoCapture?.({
            imageBase64: payload.imageBase64,
            mimeType: payload.mimeType,
            fileName: `customer-photo-${Date.now()}.jpg`,
        });
    };

    const handlePhotoFilesSelected = async (files) => {
        const nextFiles = Array.from(files || []);
        if (!nextFiles.length) return;
        const previewItems = buildPhotoPreviewItems(nextFiles);
        previewItems.forEach((item) => {
            if (item.revoke) objectUrlsRef.current.push(item.revoke);
        });
        setPhotoShots((prev) => [...previewItems.reverse(), ...prev].slice(0, 8));
        await onPhotoPickFiles?.(nextFiles);
    };

    const handleOcrCapture = async () => {
        const payload = captureVideoFrame(videoRef.current, { aspectRatio: 16 / 9 });
        if (!payload?.imageBase64) return;
        await onOcrCapture?.({
            imageBase64: payload.imageBase64,
            mimeType: payload.mimeType,
            fileName: 'cccd-camera.jpg',
            side: derivedSide,
        });
    };

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1710, background: 'rgba(15,23,42,.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18 }}>
            <div style={{ width: '100%', maxWidth: 440, borderRadius: 28, background: '#0f172a', color: 'white', boxShadow: '0 28px 60px rgba(15,23,42,.38)', overflow: 'hidden', border: '1px solid rgba(255,255,255,.08)' }}>
                <div style={{ padding: '16px 16px 10px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                    <div>
                        <div data-sale-title="true" style={{ fontSize: 15, fontWeight: 900 }}>Camera khách hàng</div>
                        <div style={{ marginTop: 4, fontSize: 11, lineHeight: 1.5, color: '#cbd5e1' }}>
                            Chọn đúng tab để chụp ảnh, quét QR hoặc OCR CCCD ngay trên cùng một camera.
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
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 12 }}>
                        {TAB_OPTIONS.map((option) => {
                            const Icon = option.icon;
                            const active = option.key === currentTab;
                            const done = Boolean(tabsDone[option.key]);
                            return (
                                <button
                                    key={option.key}
                                    type="button"
                                    onClick={() => !done && onTabChange?.(option.key)}
                                    style={{
                                        border: done
                                            ? '1.5px solid rgba(34,197,94,.45)'
                                            : 'none',
                                        borderRadius: 16,
                                        minHeight: 52,
                                        background: done
                                            ? 'rgba(34,197,94,.15)'
                                            : active
                                                ? 'linear-gradient(135deg,#0f766e,#14b8a6)'
                                                : 'rgba(255,255,255,.08)',
                                        color: done ? '#4ade80' : 'white',
                                        fontSize: 11,
                                        fontWeight: 500,
                                        whiteSpace: 'nowrap',
                                        cursor: done ? 'not-allowed' : 'pointer',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: 3,
                                        padding: '8px 4px',
                                        boxShadow: done
                                            ? '0 0 0 0'
                                            : active
                                                ? '0 10px 22px rgba(20,184,166,.20)'
                                                : 'none',
                                        opacity: done ? 0.9 : 1,
                                        position: 'relative',
                                        transition: 'all .18s ease',
                                    }}
                                >
                                    {done ? (
                                        <>
                                            <IoCheckmarkCircle style={{ fontSize: 22, color: '#4ade80', flexShrink: 0 }} />
                                            <span style={{ lineHeight: 1.3, textAlign: 'center', fontSize: 9, color: '#86efac' }}>Xong</span>
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    askDelete('Xóa dữ liệu CCCD này?', () => onClearTab?.(option.key));
                                                }}
                                                style={{
                                                    position: 'absolute',
                                                    top: -6, right: -6,
                                                    width: 22, height: 22,
                                                    borderRadius: '50%', background: '#ef4444', color: 'white', border: 'none',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                                                    boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
                                                    zIndex: 2
                                                }}
                                                title="Xóa và chụp lại"
                                            >
                                                <IoCloseOutline style={{ fontSize: 16 }} />
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <Icon style={{ fontSize: 18, flexShrink: 0 }} />
                                            <span style={{ lineHeight: 1.3, textAlign: 'center' }}>{option.label}</span>
                                        </>
                                    )}
                                </button>
                            );
                        })}
                    </div>

                    <div style={{ position: 'relative', borderRadius: 24, overflow: 'hidden', background: '#020617', aspectRatio: previewAspect }}>
                        <video
                            ref={videoRef}
                            autoPlay
                            muted
                            playsInline
                            style={{ width: '100%', height: '100%', objectFit: currentTab === QR_TAB ? 'contain' : 'cover', opacity: cameraError ? 0.18 : 1 }}
                        />

                        {currentTab === QR_TAB ? null : (
                            <div style={{ position: 'absolute', left: 16, right: 16, bottom: 16, padding: '10px 12px', borderRadius: 16, background: 'rgba(15,23,42,.58)', color: '#f8fafc', fontSize: 11, lineHeight: 1.45, textAlign: 'center', backdropFilter: 'blur(10px)' }}>
                                {currentTab === PHOTO_TAB
                                    ? 'Chụp nhiều ảnh liên tiếp nếu cần. Mọi ảnh chụp sẽ được giữ lại trong hồ sơ khách.'
                                    : currentTab === OCR_BACK_TAB
                                        ? 'Giữ mặt sau CCCD thẳng khung rồi bấm “Đọc ngay” để OCR nội dung.'
                                        : 'Giữ mặt trước CCCD thẳng khung rồi bấm “Đọc ngay” để OCR và điền thông tin.'}
                            </div>
                        )}

                        {loading ? (
                            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15,23,42,.45)', color: 'white', fontSize: 13, fontWeight: 800 }}>
                                {currentTab === QR_TAB ? 'Đang parse QR...' : 'Đang đọc CCCD...'}
                            </div>
                        ) : null}

                        {cameraError ? (
                            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center', color: '#fde68a', fontSize: 12, lineHeight: 1.55 }}>
                                {cameraError}
                            </div>
                        ) : null}
                    </div>

                    {helperMessage ? (
                        <div style={{ marginTop: 10, fontSize: 10, color: helperColor, lineHeight: 1.45 }}>
                            {helperMessage}
                        </div>
                    ) : null}

                    {currentTab === PHOTO_TAB && photoShots.length ? (
                        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingTop: 12 }}>
                            {photoShots.map((shot) => (
                                <div key={shot.id} style={{ flex: '0 0 auto', width: 72, position: 'relative' }}>
                                    <div style={{ width: 72, height: 72, borderRadius: 14, overflow: 'hidden', border: '1px solid rgba(255,255,255,.08)', background: 'rgba(255,255,255,.06)' }}>
                                                <img src={shot.url} alt={shot.label} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            askDelete('Xóa ảnh này?', () => {
                                                setPhotoShots(prev => prev.filter(s => s.id !== shot.id));
                                                onPhotoDelete?.(shot.fullUrl || shot.url);
                                            });
                                        }}
                                        style={{
                                            position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: '50%',
                                            background: '#ef4444', color: 'white', border: 'none',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                                            boxShadow: '0 2px 6px rgba(0,0,0,0.3)', zIndex: 2
                                        }}
                                        title="Xóa ảnh"
                                    >
                                        <IoCloseOutline style={{ fontSize: 16 }} />
                                    </button>
                                    <div style={{ marginTop: 6, fontSize: 9, color: '#cbd5e1', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{shot.label}</div>
                                </div>
                            ))}
                        </div>
                    ) : null}

                    <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                        {currentTab === PHOTO_TAB ? (
                            <>
                                <button
                                    type="button"
                                    onClick={() => photoFileInputRef.current?.click()}
                                    style={{ ...S.pillBtn('rgba(255,255,255,.08)', '#f8fafc'), flex: 1, justifyContent: 'center', border: '1px solid rgba(255,255,255,.08)', boxShadow: 'none' }}
                                >
                                    <IoImagesOutline />
                                    <span>Chọn nhiều ảnh</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={handlePhotoCapture}
                                    disabled={!cameraReady}
                                    style={{ ...S.pillBtn('linear-gradient(135deg,#0f766e,#14b8a6)', 'white'), flex: 1, justifyContent: 'center', opacity: cameraReady ? 1 : 0.6 }}
                                >
                                    <IoCameraOutline />
                                    <span>Chụp thêm</span>
                                </button>
                            </>
                        ) : currentTab === QR_TAB ? (
                            <>
                                <button
                                    type="button"
                                    onClick={() => qrFileInputRef.current?.click()}
                                    disabled={qrLoading}
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
                            </>
                        ) : (
                            <>
                                <button
                                    type="button"
                                    onClick={() => ocrFileInputRef.current?.click()}
                                    disabled={ocrLoading}
                                    style={{ ...S.pillBtn('rgba(255,255,255,.08)', '#f8fafc'), flex: 1, justifyContent: 'center', border: '1px solid rgba(255,255,255,.08)', boxShadow: 'none' }}
                                >
                                    <IoImagesOutline />
                                    <span>Chọn ảnh</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={handleOcrCapture}
                                    disabled={ocrLoading || !cameraReady}
                                    style={{ ...S.pillBtn('linear-gradient(135deg,#0f766e,#14b8a6)', 'white'), flex: 1, justifyContent: 'center', opacity: ocrLoading || !cameraReady ? 0.6 : 1 }}
                                >
                                    <IoCameraOutline />
                                    <span>{ocrLoading ? 'Đang đọc...' : 'Đọc ngay'}</span>
                                </button>
                            </>
                        )}
                    </div>

                    <input
                        ref={photoFileInputRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        multiple
                        style={{ display: 'none' }}
                        onChange={(event) => {
                            const nextFiles = event.target.files;
                            event.target.value = '';
                            if (nextFiles?.length) handlePhotoFilesSelected(nextFiles);
                        }}
                    />

                    <input
                        ref={qrFileInputRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        style={{ display: 'none' }}
                        onChange={(event) => {
                            const file = event.target.files?.[0];
                            event.target.value = '';
                            if (file) onQrPickFile?.(file);
                        }}
                    />

                    <input
                        ref={ocrFileInputRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        style={{ display: 'none' }}
                        onChange={(event) => {
                            const file = event.target.files?.[0];
                            event.target.value = '';
                            if (file) onOcrPickFile?.(file, derivedSide);
                        }}
                    />
                </div>
            </div>
            <ConfirmDialog
                open={Boolean(deleteConfirm)}
                title="Xác nhận xóa"
                message={deleteConfirm?.label || 'Bạn có chắc muốn xóa không?'}
                confirmLabel="Xóa"
                cancelLabel="Hủy"
                onClose={() => setDeleteConfirm(null)}
                onConfirm={() => {
                    deleteConfirm?.onConfirm?.();
                    setDeleteConfirm(null);
                }}
            />
        </div>
    );
}
