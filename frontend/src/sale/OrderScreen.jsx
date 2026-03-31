import { useEffect, useState } from 'react';
import { IoAddOutline, IoCardOutline, IoCheckmarkCircle, IoCheckmarkCircleOutline, IoChevronDownOutline, IoChevronForward, IoChevronUpOutline, IoCloseOutline, IoDocumentTextOutline, IoPrintOutline, IoQrCodeOutline, IoRefreshOutline, IoSaveOutline, IoTrashOutline } from 'react-icons/io5';
import TxLine from './TxLine';
import { ConfirmDialog, CustomerIdOcrModal, CustomerQrScanModal } from './Dialogs';
import SaleReceiptPreviewModal from './SaleReceiptPreviewModal';
import { copySaleReceiptImageToClipboard, createSaleReceiptPreview, downloadSaleReceiptImage, printSaleReceiptImage } from './printSaleReceipt';
import { API, S, createDefaultLine, createEmptyCustomerInfo, extractCustomerInfoFromOcrText, extractCustomerInfoFromQrPayload, fmtCalc, getDayGreeting, getTxTheme, parseFmt, readImageAsBase64, scanCodeFromFile, today } from './shared';

function dispatchNotif(title, body) {
    window.dispatchEvent(new CustomEvent('jewelry-notification', { detail: { title, body, date: new Date().toISOString() } }));
}

const DEFAULT_RED_INVOICE_CUSTOMER_NAME = 'PHAN NGUYEN BUU';
const trimCustomerText = (value) => String(value || '').trim();
const isDataImageUrl = (value) => /^data:image\//i.test(String(value || '').trim());
const resolveApiAssetUrl = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try {
        const base = API || (typeof window !== 'undefined' ? window.location.origin : '');
        return new URL(raw, base || 'http://localhost').toString();
    } catch {
        return raw;
    }
};
const parseImageDataUrl = (value) => {
    const matched = String(value || '').match(/^data:(.+?);base64,(.+)$/i);
    if (!matched) return null;
    return { mimeType: matched[1] || 'image/jpeg', imageBase64: matched[2] || '' };
};
const DUPLICATE_FIELD_LABELS = {
    ten: 'tên khách hàng',
    cccd: 'CCCD',
    so_dien_thoai: 'số điện thoại',
};
const CUSTOMER_STAR_LABELS = ['', 'Rất tệ', 'Tệ', 'Bình thường', 'Tốt', 'Xuất sắc'];

function StarRating({ value, onChange, size = 20, readOnly = false }) {
    const [hover, setHover] = useState(0);
    return (
        <span style={{ display: 'inline-flex', gap: 2, cursor: readOnly ? 'default' : 'pointer' }}>
            {[1, 2, 3, 4, 5].map((item) => (
                <span
                    key={item}
                    onMouseEnter={() => !readOnly && setHover(item)}
                    onMouseLeave={() => !readOnly && setHover(0)}
                    onClick={() => !readOnly && onChange && onChange(item)}
                    style={{ fontSize: size, color: item <= (hover || value) ? '#f59e0b' : '#e2e8f0', transition: 'color .12s ease', lineHeight: 1 }}
                >
                    ★
                </span>
            ))}
        </span>
    );
}

export default function OrderScreen({
    rates,
    inventoryItems,
    lines,
    setLines,
    total,
    onNext,
    onSaveDraft,
    onResetForm,
    orderId,
    draftMessage,
    customerInfo,
    setCustomerInfo,
    customerInfoOpen,
    setCustomerInfoOpen,
}) {
    const greeting = getDayGreeting();
    const totalPrefix = total > 0 ? '+' : total < 0 ? '-' : '';
    const totalLabel = total > 0 ? 'KHÁCH TRẢ' : total < 0 ? 'KHÁCH NHẬN' : 'TỔNG TẠM TÍNH';
    const [customerOcrOpen, setCustomerOcrOpen] = useState(false);
    const [customerQrOpen, setCustomerQrOpen] = useState(false);
    const [customerOcrSide, setCustomerOcrSide] = useState('front');
    const [cccdOcrLoading, setCccdOcrLoading] = useState(false);
    const [cccdQrLoading, setCccdQrLoading] = useState(false);
    const [customerSaveLoading, setCustomerSaveLoading] = useState(false);
    const [customerLookupQuery, setCustomerLookupQuery] = useState('');
    const [customerLookupResults, setCustomerLookupResults] = useState([]);
    const [customerLookupLoading, setCustomerLookupLoading] = useState(false);
    const [cccdOcrMessage, setCccdOcrMessage] = useState('');
    const [customerOverwritePrompt, setCustomerOverwritePrompt] = useState(null);
    const [receiptPreviewOpen, setReceiptPreviewOpen] = useState(false);
    const [receiptPreviewLoading, setReceiptPreviewLoading] = useState(false);
    const [receiptPreviewUrl, setReceiptPreviewUrl] = useState('');
    const [receiptPreviewError, setReceiptPreviewError] = useState('');
    const [receiptActionMessage, setReceiptActionMessage] = useState('');
    const [receiptActionError, setReceiptActionError] = useState(false);
    const hideBottomBar = lines.length === 1 && parseFmt(lines[0]?.qty || 0) === 0;
    const addLine = () => {
        setLines(ls => [...ls, createDefaultLine(rates)]);
    };

    const updateLine = (id, patch) => setLines(ls => ls.map(l => l.id === id ? { ...l, ...patch } : l));
    const removeLine = id => setLines(ls => ls.filter(l => l.id !== id));
    const updateCustomerInfo = (field, value) => {
        setCustomerInfo(prev => ({ ...prev, [field]: value }));
    };
    const uploadCustomerIdentityImage = async ({ imageBase64, mimeType = 'image/jpeg', fileName = 'cccd.jpg', side = 'front' }) => {
        if (!imageBase64) throw new Error('Chưa có ảnh CCCD để lưu lên server.');
        const imageResponse = await fetch(`data:${mimeType};base64,${imageBase64}`);
        const imageBlob = await imageResponse.blob();
        const normalizedName = String(fileName || `cccd-${side}.jpg`).trim() || `cccd-${side}.jpg`;
        const uploadForm = new FormData();
        uploadForm.append('file', imageBlob, normalizedName);
        uploadForm.append('category', 'customer-id');
        uploadForm.append('side', side);
        const response = await fetch(`${API}/api/upload`, {
            method: 'POST',
            body: uploadForm,
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(payload.error || `HTTP ${response.status}`);
        }
        const resolvedUrl = resolveApiAssetUrl(payload.url || payload.absolute_url || '');
        if (!resolvedUrl) {
            throw new Error('Server chưa trả URL ảnh CCCD.');
        }
        return resolvedUrl;
    };
    const ensureCustomerIdentityImagesUploaded = async (sourceCustomerInfo = customerInfo) => {
        const nextCustomerInfo = { ...sourceCustomerInfo };
        const frontImage = trimCustomerText(sourceCustomerInfo?.frontImage);
        const backImage = trimCustomerText(sourceCustomerInfo?.backImage);

        if (isDataImageUrl(frontImage)) {
            const parsed = parseImageDataUrl(frontImage);
            if (parsed?.imageBase64) {
                nextCustomerInfo.frontImage = await uploadCustomerIdentityImage({
                    imageBase64: parsed.imageBase64,
                    mimeType: parsed.mimeType,
                    fileName: 'cccd-front-upload.jpg',
                    side: 'front',
                });
            }
        } else {
            nextCustomerInfo.frontImage = resolveApiAssetUrl(frontImage);
        }

        if (isDataImageUrl(backImage)) {
            const parsed = parseImageDataUrl(backImage);
            if (parsed?.imageBase64) {
                nextCustomerInfo.backImage = await uploadCustomerIdentityImage({
                    imageBase64: parsed.imageBase64,
                    mimeType: parsed.mimeType,
                    fileName: 'cccd-back-upload.jpg',
                    side: 'back',
                });
            }
        } else {
            nextCustomerInfo.backImage = resolveApiAssetUrl(backImage);
        }

        setCustomerInfo(prev => ({
            ...prev,
            frontImage: nextCustomerInfo.frontImage || '',
            backImage: nextCustomerInfo.backImage || '',
        }));
        return nextCustomerInfo;
    };
    const buildCustomerSavePayload = (sourceCustomerInfo = customerInfo) => {
        const resolvedName = trimCustomerText(sourceCustomerInfo?.name) || DEFAULT_RED_INVOICE_CUSTOMER_NAME;
        return {
            ten: resolvedName,
            cccd: sourceCustomerInfo?.cccd || '',
            ngay_sinh: sourceCustomerInfo?.dob || '',
            gioi_tinh: sourceCustomerInfo?.gender || '',
            que_quan: sourceCustomerInfo?.origin || '',
            noi_thuong_tru: sourceCustomerInfo?.residence || '',
            dia_chi: sourceCustomerInfo?.address || '',
            so_dien_thoai: sourceCustomerInfo?.phone || '',
            ngay_cap_cccd: sourceCustomerInfo?.issueDate || '',
            han_the: sourceCustomerInfo?.expiry || '',
            sao: Number(sourceCustomerInfo?.sao || 0),
            ocr_mat_sau: sourceCustomerInfo?.backText || '',
            anh_mat_truoc: resolveApiAssetUrl(sourceCustomerInfo?.frontImage || ''),
            anh_mat_sau: resolveApiAssetUrl(sourceCustomerInfo?.backImage || ''),
            nguoi_tao: 'POS Mobile',
        };
    };
    const describeDuplicateCustomer = (result = {}) => {
        const primaryDuplicate = result?.primary_duplicate || result?.duplicates?.[0] || null;
        const matchedFields = (primaryDuplicate?.matched_fields || [])
            .map(field => DUPLICATE_FIELD_LABELS[field] || field)
            .filter(Boolean);
        const record = primaryDuplicate?.record || {};
        const recordLabel = [
            record.ten || 'Khách hàng chưa đặt tên',
            record.cccd ? `CCCD ${record.cccd}` : '',
            record.so_dien_thoai ? `SĐT ${record.so_dien_thoai}` : '',
        ].filter(Boolean).join(' · ');
        const duplicateCount = Number(result?.duplicate_count || result?.duplicates?.length || 0);
        const extraLabel = duplicateCount > 1 ? ` Có ${duplicateCount} hồ sơ trùng; hệ thống sẽ lưu đè hồ sơ khớp mới nhất.` : '';
        return `Đã có khách hàng trùng theo ${matchedFields.join(', ') || 'thông tin định danh'}: ${recordLabel || 'hồ sơ đã lưu'}.${extraLabel} Bạn có muốn lưu đè không?`;
    };
    const submitCustomerPayload = async (payload, overwrite = false) => {
        const response = await fetch(`${API}/api/khach_hang`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...payload, overwrite }),
        });
        const result = await response.json().catch(() => ({}));
        return { response, result };
    };
    const handleCustomerSaveSuccess = (result, payload) => {
        const actionLabel = result.msg === 'Updated' ? 'cập nhật' : 'lưu mới';
        const customerLabel = trimCustomerText(payload?.ten) || trimCustomerText(payload?.so_dien_thoai) || trimCustomerText(payload?.cccd) || 'khách hàng';
        const successMessage = `Đã ${actionLabel} khách hàng thành công: ${customerLabel}.`;
        setCccdOcrMessage(successMessage);
        dispatchNotif('Lưu khách hàng thành công', successMessage);
    };
    const applyCustomerRecord = (record) => {
        if (!record) return;
        setCustomerInfo({
            ...createEmptyCustomerInfo(),
            name: record.ten || '',
            cccd: record.cccd || '',
            oldId: record.cmnd_cu || '',
            dob: record.ngay_sinh || '',
            gender: record.gioi_tinh || '',
            nationality: record.quoc_tich || '',
            origin: record.que_quan || '',
            residence: record.noi_thuong_tru || '',
            expiry: record.han_the || '',
            issueDate: record.ngay_cap_cccd || '',
            address: record.dia_chi || '',
            phone: record.so_dien_thoai || '',
            sao: Number(record.sao || 0),
            backText: record.ocr_mat_sau || '',
            frontImage: resolveApiAssetUrl(record.anh_mat_truoc || ''),
            backImage: resolveApiAssetUrl(record.anh_mat_sau || ''),
        });
        setCustomerInfoOpen(true);
        setCustomerLookupQuery('');
        setCustomerLookupResults([]);
        setCccdOcrMessage('');
    };

    useEffect(() => {
        const query = String(customerLookupQuery || '').trim();
        if (!query) {
            setCustomerLookupResults([]);
            setCustomerLookupLoading(false);
            return undefined;
        }
        let cancelled = false;
        const timer = setTimeout(async () => {
            setCustomerLookupLoading(true);
            try {
                const response = await fetch(`${API}/api/khach_hang?q=${encodeURIComponent(query)}`);
                const payload = await response.json().catch(() => []);
                if (!cancelled) {
                    setCustomerLookupResults(Array.isArray(payload) ? payload.slice(0, 6) : []);
                }
            } catch {
                if (!cancelled) {
                    setCustomerLookupResults([]);
                }
            } finally {
                if (!cancelled) {
                    setCustomerLookupLoading(false);
                }
            }
        }, 180);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [customerLookupQuery]);

    const runCustomerOcr = async ({ imageBase64, mimeType = 'image/jpeg', fileName = 'cccd.jpg', side = 'front' }) => {
        if (!imageBase64) return;
        setCccdOcrLoading(true);
        setCccdOcrMessage('Đang lưu ảnh CCCD lên server...');
        try {
            const storedImageUrl = await uploadCustomerIdentityImage({ imageBase64, mimeType, fileName, side });
            setCustomerInfo(prev => ({
                ...prev,
                [side === 'back' ? 'backImage' : 'frontImage']: storedImageUrl,
            }));
            const response = await fetch(`${API}/api/ocr`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    image_base64: imageBase64,
                    mime_type: mimeType,
                    file_name: fileName,
                }),
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(payload.error || `HTTP ${response.status}`);
            }
            const rawText = String(payload.text || '').trim();
            const parsed = extractCustomerInfoFromOcrText(rawText);
            setCustomerInfo(prev => {
                if (side === 'back') {
                    return {
                        ...prev,
                        backText: rawText || prev.backText,
                    };
                }
                return {
                    ...prev,
                    name: parsed.name || prev.name,
                    cccd: parsed.cccd || prev.cccd,
                    dob: parsed.dob || prev.dob,
                    gender: parsed.gender || prev.gender,
                    nationality: parsed.nationality || prev.nationality,
                    origin: parsed.origin || prev.origin,
                    residence: parsed.residence || prev.residence,
                    expiry: parsed.expiry || prev.expiry,
                    address: parsed.address || prev.address,
                    phone: parsed.phone || prev.phone,
                };
            });
            setCustomerInfoOpen(true);
            setCustomerOcrOpen(false);
            setCccdOcrMessage(
                side === 'back'
                    ? (rawText ? 'Đã điền ghi chú nhanh từ mặt sau.' : 'Đã OCR mặt sau, bạn kiểm tra lại ghi chú nhanh.')
                    : parsed.appliedFields.length
                    ? `OCR CCCD xong: ${parsed.appliedFields.join(', ')}.`
                    : 'OCR xong, bạn kiểm tra lại thông tin để chỉnh tay nếu cần.'
            );
        } catch (error) {
            setCccdOcrMessage(error.message || 'Không OCR được CCCD.');
        } finally {
            setCccdOcrLoading(false);
        }
    };
    const handleCccdOcrFile = async (file, side = 'front') => {
        if (!file) return;
        try {
            const imageBase64 = await readImageAsBase64(file);
            await runCustomerOcr({
                imageBase64,
                mimeType: file.type || 'image/jpeg',
                fileName: file.name || 'cccd-upload.jpg',
                side,
            });
        } catch (error) {
            setCccdOcrMessage(error.message || 'Không đọc được ảnh CCCD.');
        }
    };
    const applyCustomerQrPayload = async (qrPayload) => {
        setCccdQrLoading(true);
        setCccdOcrMessage('');
        try {
            setCccdOcrMessage('Đang parse QR...');
            await new Promise(resolve => setTimeout(resolve, 180));
            const parsed = extractCustomerInfoFromQrPayload(qrPayload);
            if (!parsed.appliedFields.length) {
                throw new Error('QR CCCD không đúng định dạng dữ liệu mong đợi.');
            }
            setCustomerInfo(prev => ({
                ...prev,
                cccd: parsed.cccd || prev.cccd,
                oldId: parsed.oldId || prev.oldId,
                name: parsed.name || prev.name,
                dob: parsed.dob || prev.dob,
                gender: parsed.gender || prev.gender,
                residence: parsed.residence || prev.residence,
                address: parsed.address || prev.address,
                issueDate: parsed.issueDate || prev.issueDate,
            }));
            setCustomerInfoOpen(true);
            setCustomerQrOpen(false);
            setCccdOcrMessage(`QR CCCD xong: ${parsed.appliedFields.join(', ')}.`);
        } catch (error) {
            setCccdOcrMessage(error.message || 'Không đọc được QR CCCD.');
        } finally {
            setCccdQrLoading(false);
        }
    };
    const handleCustomerQrFile = async (file) => {
        if (!file) return;
        try {
            const qrPayload = await scanCodeFromFile(file);
            await applyCustomerQrPayload(qrPayload);
        } catch (error) {
            setCccdOcrMessage(error.message || 'Không đọc được QR CCCD.');
        }
    };
    const saveCustomerToBackend = async () => {
        setCustomerSaveLoading(true);
        setCccdOcrMessage('');
        setCustomerOverwritePrompt(null);
        try {
            const uploadedCustomerInfo = await ensureCustomerIdentityImagesUploaded(customerInfo);
            const payload = buildCustomerSavePayload(uploadedCustomerInfo);
            if (trimCustomerText(uploadedCustomerInfo?.name) !== payload.ten) {
                setCustomerInfo(prev => ({ ...prev, ...uploadedCustomerInfo, name: payload.ten }));
            }
            const { response, result } = await submitCustomerPayload(payload, false);
            if (response.status === 409) {
                setCustomerOverwritePrompt({
                    payload,
                    title: 'Đã có khách hàng',
                    message: describeDuplicateCustomer(result),
                });
                return;
            }
            if (!response.ok) {
                const failureMessage = result.error || result.msg || response.statusText || `HTTP ${response.status}`;
                throw new Error(`Lưu khách hàng thất bại (${response.status}): ${failureMessage}`);
            }
            handleCustomerSaveSuccess(result, payload);
        } catch (error) {
            const failureMessage = error.message || 'Không lưu được khách hàng vào backend.';
            setCccdOcrMessage(failureMessage);
            dispatchNotif('Lưu khách hàng thất bại', failureMessage);
        } finally {
            setCustomerSaveLoading(false);
        }
    };
    const confirmCustomerOverwrite = async () => {
        const payload = customerOverwritePrompt?.payload;
        if (!payload) return;
        setCustomerSaveLoading(true);
        setCccdOcrMessage('');
        try {
            const { response, result } = await submitCustomerPayload(payload, true);
            if (!response.ok) {
                const failureMessage = result.error || result.msg || response.statusText || `HTTP ${response.status}`;
                throw new Error(`Lưu khách hàng thất bại (${response.status}): ${failureMessage}`);
            }
            setCustomerOverwritePrompt(null);
            handleCustomerSaveSuccess(result, payload);
        } catch (error) {
            const failureMessage = error.message || 'Không lưu đè được khách hàng vào backend.';
            setCccdOcrMessage(failureMessage);
            dispatchNotif('Lưu khách hàng thất bại', failureMessage);
        } finally {
            setCustomerSaveLoading(false);
        }
    };
    const isCustomerInfoSuccessMessage = /^(OCR|QR CCCD xong|Đã )/.test(cccdOcrMessage || '');

    const handleOpenPrintPreview = async () => {
        setReceiptPreviewOpen(true);
        setReceiptPreviewLoading(true);
        setReceiptPreviewUrl('');
        setReceiptPreviewError('');
        setReceiptActionMessage('');
        setReceiptActionError(false);
        try {
            const { imageUrl } = await createSaleReceiptPreview({
                orderId,
                customerInfo,
                lines,
                rates,
                total,
            });
            setReceiptPreviewUrl(imageUrl);
        } catch (error) {
            setReceiptPreviewUrl('');
            setReceiptPreviewError(error.message || 'Không tạo được preview POS.');
        } finally {
            setReceiptPreviewLoading(false);
        }
    };
    const handlePrintReceipt = (posNo) => {
        if (!receiptPreviewUrl) return;
        const success = printSaleReceiptImage(receiptPreviewUrl, `${orderId || 'Phiếu giao dịch POS'} · POS ${posNo || 1}`);
        if (success) {
            setReceiptActionMessage(`Đã mở lệnh in cho POS ${posNo || 1}.`);
            setReceiptActionError(false);
        }
    };
    const handleDownloadReceipt = () => {
        if (!receiptPreviewUrl) return;
        downloadSaleReceiptImage(receiptPreviewUrl, `${orderId || 'phieu-giao-dich-pos'}.png`);
        setReceiptActionMessage('Đã tải PNG xuống máy.');
        setReceiptActionError(false);
    };
    const handleCopyReceipt = async () => {
        if (!receiptPreviewUrl) return;
        try {
            await copySaleReceiptImageToClipboard(receiptPreviewUrl);
            setReceiptActionMessage('Đã copy PNG vào clipboard.');
            setReceiptActionError(false);
        } catch (error) {
            setReceiptActionMessage(error.message || 'Không copy được PNG vào clipboard.');
            setReceiptActionError(true);
        }
    };
    const sellTheme = getTxTheme('sell');

    return (
        <div style={S.screen}>
            <SaleReceiptPreviewModal
                open={receiptPreviewOpen}
                loading={receiptPreviewLoading}
                imageUrl={receiptPreviewUrl}
                error={receiptPreviewError}
                orderId={orderId}
                onClose={() => {
                    setReceiptPreviewOpen(false);
                    setReceiptActionMessage('');
                    setReceiptActionError(false);
                }}
                onPrint={handlePrintReceipt}
                onCopy={handleCopyReceipt}
                onDownload={handleDownloadReceipt}
                actionMessage={receiptActionMessage}
                actionError={receiptActionError}
            />
            <CustomerQrScanModal
                open={customerQrOpen}
                loading={cccdQrLoading}
                message={cccdOcrMessage}
                onClose={() => setCustomerQrOpen(false)}
                onDetected={applyCustomerQrPayload}
                onPickFile={handleCustomerQrFile}
            />
            <CustomerIdOcrModal
                open={customerOcrOpen}
                loading={cccdOcrLoading}
                message={cccdOcrMessage}
                side={customerOcrSide}
                onSideChange={setCustomerOcrSide}
                onClose={() => setCustomerOcrOpen(false)}
                onCapture={runCustomerOcr}
                onPickFile={handleCccdOcrFile}
            />
            <div style={{ height: 8, flexShrink: 0 }} />

            <div style={{ ...S.scrollArea, paddingTop: 4 }}>
                <div style={{ ...S.heroCard, padding: '10px 14px 10px', borderRadius: 22 }}>
                    <div style={{ ...S.heroBg, borderRadius: 22 }} />
                    <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, minHeight: 92 }}>
                        <div style={{ ...S.heroTextWrap, maxWidth: 'none', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'stretch', justifyContent: 'flex-start', alignSelf: 'stretch', paddingTop: 0, textAlign: 'center', paddingInline: 12, minHeight: 72 }}>
                            <div data-sale-title="true" style={{ ...S.heroTitle, fontSize: 14, lineHeight: 1.08, textAlign: 'center', alignSelf: 'center', marginTop: 0 }}>{greeting}</div>
                            <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center', gap: 10, marginTop: 16, paddingLeft: 14 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', minWidth: 0, textAlign: 'left' }}>
                                    <span style={{ ...S.sub, marginTop: 0, whiteSpace: 'nowrap', fontWeight: 700 }}>{orderId}</span>
                                    <span style={{ ...S.sub, marginTop: 0 }}>· {today()}</span>
                                </div>
                                <button
                                    type="button"
                                    onClick={onResetForm}
                                    style={{
                                        ...S.iconBtn('linear-gradient(135deg,#111827,#334155)'),
                                        width: 38,
                                        height: 38,
                                        fontSize: 16,
                                        color: 'white',
                                        boxShadow: '0 8px 18px rgba(15,23,42,.10)',
                                        cursor: 'pointer',
                                        flexShrink: 0,
                                    }}
                                    title="Làm mới biểu mẫu"
                                    aria-label="Làm mới biểu mẫu"
                                >
                                    <IoRefreshOutline />
                                </button>
                            </div>
                        </div>
                        <div style={{ width: 82, height: 82, position: 'relative', flexShrink: 0 }}>
                            <div style={{ position: 'absolute', right: 4, top: 6, width: 62, height: 62, borderRadius: '50%', background: 'linear-gradient(135deg, rgba(255,183,77,.95), rgba(244,114,182,.65))', filter: 'blur(4px)' }} />
                            <div style={{ position: 'absolute', right: 14, top: 16, width: 42, height: 42, borderRadius: '50%', background: 'rgba(255,255,255,.68)', boxShadow: 'inset 0 0 0 6px rgba(255,255,255,.28)' }} />
                            <img src="/logo.png" alt="Vạn Kim Jewelry" style={{ ...S.heroLogo, width: 72, right: 0, bottom: 0 }} />
                        </div>
                    </div>
                </div>

                <div style={S.softPanel}>
                    <div style={{ marginBottom: 12 }}>
                        <div
                            style={{
                                width: '100%',
                                border: '1px solid #dbe4ee',
                                background: 'rgba(248,250,252,.96)',
                                borderRadius: 16,
                                padding: '10px 12px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 10,
                            }}
                        >
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <input
                                    className="sale-pos-catalog-input"
                                    style={{ ...S.inp, textAlign: 'left', fontWeight: 400, height: 38, minHeight: 38 }}
                                    value={customerLookupQuery}
                                    onChange={e => setCustomerLookupQuery(e.target.value)}
                                    onFocus={() => setCustomerInfoOpen(true)}
                                    placeholder="Tìm kiếm nhanh bằng tên, số điện thoại, cccd"
                                    aria-label="Tìm kiếm nhanh bằng tên, số điện thoại, cccd"
                                />
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    setCustomerInfoOpen(true);
                                    setCccdOcrMessage('');
                                    setCustomerQrOpen(true);
                                }}
                                disabled={cccdQrLoading}
                                style={{
                                    ...S.pillBtn('linear-gradient(135deg,#0f766e,#14b8a6)'),
                                    height: 34,
                                    minHeight: 34,
                                    padding: '0 12px',
                                    fontSize: 10,
                                    lineHeight: 1,
                                    justifyContent: 'center',
                                    whiteSpace: 'nowrap',
                                    opacity: cccdQrLoading ? 0.7 : 1,
                                    boxShadow: '0 8px 16px rgba(15,23,42,.12)',
                                    flexShrink: 0,
                                }}
                            >
                                <span>{cccdQrLoading ? 'QR...' : 'QR'}</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setCustomerInfoOpen(true);
                                    setCustomerOcrSide('front');
                                    setCccdOcrMessage('');
                                    setCustomerOcrOpen(true);
                                }}
                                disabled={cccdOcrLoading}
                                style={{
                                    ...S.pillBtn('linear-gradient(135deg,#111827,#334155)'),
                                    height: 34,
                                    minHeight: 34,
                                    padding: '0 12px',
                                    fontSize: 10,
                                    lineHeight: 1,
                                    justifyContent: 'center',
                                    whiteSpace: 'nowrap',
                                    opacity: cccdOcrLoading ? 0.7 : 1,
                                    boxShadow: '0 8px 16px rgba(15,23,42,.12)',
                                    flexShrink: 0,
                                }}
                            >
                                <span>{cccdOcrLoading ? 'OCR...' : 'OCR'}</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setCustomerInfoOpen(open => !open)}
                                style={{
                                    width: 24,
                                    height: 24,
                                    border: 'none',
                                    background: 'transparent',
                                    padding: 0,
                                    margin: 0,
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexShrink: 0,
                                }}
                                aria-label={customerInfoOpen ? 'Thu gọn thông tin khách hàng' : 'Mở rộng thông tin khách hàng'}
                            >
                                <IoChevronDownOutline
                                    style={{
                                        fontSize: 18,
                                        color: '#64748b',
                                        transform: customerInfoOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                                        transition: 'transform .18s ease',
                                    }}
                                />
                            </button>
                        </div>
                        {customerLookupQuery.trim() && (
                            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {customerLookupLoading ? (
                                    <div style={{ fontSize: 10, color: '#64748b', lineHeight: 1.45 }}>Đang tìm khách hàng...</div>
                                ) : customerLookupResults.length ? (
                                    customerLookupResults.map(record => (
                                        <button
                                            key={record.id}
                                            type="button"
                                            onClick={() => applyCustomerRecord(record)}
                                            style={{
                                                width: '100%',
                                                border: '1px solid rgba(148,163,184,.22)',
                                                background: '#ffffff',
                                                borderRadius: 14,
                                                padding: '10px 12px',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: 4,
                                                textAlign: 'left',
                                                cursor: 'pointer',
                                                boxShadow: '0 6px 16px rgba(15,23,42,.04)',
                                            }}
                                        >
                                            <span style={{ fontSize: 11, fontWeight: 800, color: '#111827' }}>{record.ten || 'Khách hàng chưa đặt tên'}</span>
                                            <span style={{ fontSize: 10, color: '#64748b' }}>
                                                {[record.so_dien_thoai, record.cccd].filter(Boolean).join(' · ') || 'Chưa có SĐT / CCCD'}
                                            </span>
                                        </button>
                                    ))
                                ) : (
                                    <div style={{ fontSize: 10, color: '#64748b', lineHeight: 1.45 }}>Không thấy khách hàng phù hợp.</div>
                                )}
                            </div>
                        )}
                        {customerInfoOpen && (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, marginTop: 10 }}>
                                <input
                                    className="sale-pos-catalog-input"
                                    style={{ ...S.inp, gridColumn: '1 / -1', textAlign: 'left', fontWeight: 400 }}
                                    value={customerInfo?.name || ''}
                                    onChange={e => updateCustomerInfo('name', e.target.value)}
                                    placeholder="Nhập tên khách hàng"
                                />
                                <input
                                    className="sale-pos-catalog-input"
                                    style={{ ...S.inp, gridColumn: '1 / -1', textAlign: 'left', fontWeight: 400 }}
                                    value={customerInfo?.phone || ''}
                                    onChange={e => updateCustomerInfo('phone', e.target.value)}
                                    placeholder="Nhập số điện thoại"
                                />
                                <input
                                    className="sale-pos-catalog-input"
                                    style={{ ...S.inp, textAlign: 'left', fontWeight: 400 }}
                                    value={customerInfo?.cccd || ''}
                                    onChange={e => updateCustomerInfo('cccd', e.target.value)}
                                    placeholder="Nhập CCCD"
                                />
                                <div
                                    role="radiogroup"
                                    aria-label="Giới tính"
                                    style={{
                                        ...S.inp,
                                        display: 'grid',
                                        gridTemplateColumns: '1fr 1fr',
                                        gap: 4,
                                        padding: 4,
                                        textAlign: 'left',
                                    }}
                                >
                                    {['Nam', 'Nữ'].map(option => {
                                        const active = (customerInfo?.gender || '') === option;
                                        return (
                                            <button
                                                key={option}
                                                type="button"
                                                role="radio"
                                                aria-checked={active}
                                                onClick={() => updateCustomerInfo('gender', option)}
                                                style={{
                                                    border: 'none',
                                                    borderRadius: 10,
                                                    minHeight: 32,
                                                    background: active ? 'linear-gradient(135deg,#0f766e,#14b8a6)' : 'transparent',
                                                    color: active ? 'white' : '#64748b',
                                                    fontWeight: active ? 800 : 600,
                                                    fontSize: 12,
                                                    cursor: 'pointer',
                                                    fontFamily: 'inherit',
                                                    transition: 'all .18s ease',
                                                    boxShadow: active ? '0 8px 18px rgba(20,184,166,.18)' : 'none',
                                                }}
                                            >
                                                {option}
                                            </button>
                                        );
                                    })}
                                </div>
                                <input
                                    className="sale-pos-catalog-input"
                                    style={{ ...S.inp, textAlign: 'left', fontWeight: 400 }}
                                    value={customerInfo?.dob || ''}
                                    onChange={e => updateCustomerInfo('dob', e.target.value)}
                                    placeholder="Nhập ngày sinh"
                                />
                                <input
                                    className="sale-pos-catalog-input"
                                    style={{ ...S.inp, textAlign: 'left', fontWeight: 400 }}
                                    value={customerInfo?.origin || ''}
                                    onChange={e => updateCustomerInfo('origin', e.target.value)}
                                    placeholder="Nhập quê quán"
                                />
                                <input
                                    className="sale-pos-catalog-input"
                                    style={{ ...S.inp, gridColumn: '1 / -1', textAlign: 'left', fontWeight: 400 }}
                                    value={customerInfo?.residence || ''}
                                    onChange={e => updateCustomerInfo('residence', e.target.value)}
                                    placeholder="Nhập nơi thường trú"
                                />
                                <input
                                    className="sale-pos-catalog-input"
                                    style={{ ...S.inp, gridColumn: '1 / -1', textAlign: 'left', fontWeight: 400 }}
                                    value={customerInfo?.address || ''}
                                    onChange={e => updateCustomerInfo('address', e.target.value)}
                                    placeholder="Nhập địa chỉ liên hệ / giao hàng"
                                />
                                <input
                                    className="sale-pos-catalog-input"
                                    style={{ ...S.inp, gridColumn: '1 / -1', textAlign: 'left', fontWeight: 400 }}
                                    value={customerInfo?.expiry || ''}
                                    onChange={e => updateCustomerInfo('expiry', e.target.value)}
                                    placeholder="Nhập ngày hết hạn"
                                />
                                <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: '1fr 92px', gap: 10, alignItems: 'stretch' }}>
                                    <div style={{ position: 'relative', minWidth: 0 }}>
                                        <textarea
                                            className="sale-pos-catalog-input"
                                            style={{ ...S.inp, textAlign: 'left', fontWeight: 400, minHeight: 84, resize: 'vertical', paddingTop: 10, paddingBottom: 54, height: '100%' }}
                                            value={customerInfo?.backText || ''}
                                            onChange={e => updateCustomerInfo('backText', e.target.value)}
                                            placeholder="Ghi chú nhanh"
                                        />
                                        <div style={{ position: 'absolute', left: 10, right: 10, bottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '6px 10px', borderRadius: 999, background: 'rgba(255,255,255,.95)', border: '1px solid rgba(226,232,240,.95)', boxShadow: '0 10px 24px rgba(15,23,42,.10)' }}>
                                                <span style={{ fontSize: 10, fontWeight: 800, color: '#64748b', whiteSpace: 'nowrap' }}>Đánh giá</span>
                                                <StarRating value={Number(customerInfo?.sao || 0)} onChange={(value) => updateCustomerInfo('sao', value)} size={20} />
                                                <span style={{ fontSize: 10, fontWeight: 700, color: '#475569', whiteSpace: 'nowrap' }}>{CUSTOMER_STAR_LABELS[Number(customerInfo?.sao || 0)] || 'Chưa đánh giá'}</span>
                                                {Number(customerInfo?.sao || 0) > 0 ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => updateCustomerInfo('sao', 0)}
                                                        style={{ border: 'none', background: 'transparent', color: '#94a3b8', fontSize: 10, fontWeight: 700, cursor: 'pointer', padding: 0 }}
                                                    >
                                                        Xóa
                                                    </button>
                                                ) : null}
                                            </div>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={saveCustomerToBackend}
                                        disabled={customerSaveLoading}
                                        style={{
                                            ...S.pillBtn('linear-gradient(135deg,#0f766e,#14b8a6)'),
                                            minHeight: 84,
                                            height: '100%',
                                            borderRadius: 22,
                                            padding: '10px 8px',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: 6,
                                            fontSize: 10,
                                            lineHeight: 1.15,
                                            boxShadow: '0 10px 22px rgba(20,184,166,.22)',
                                            opacity: customerSaveLoading ? 0.7 : 1,
                                        }}
                                        title="Lưu trực tiếp vào backend"
                                        aria-label="Lưu trực tiếp vào backend"
                                    >
                                        <IoSaveOutline style={{ fontSize: 18 }} />
                                        <span style={{ textAlign: 'center', fontWeight: 800 }}>{customerSaveLoading ? 'Đang lưu' : 'Lưu'}</span>
                                    </button>
                                </div>
                                {cccdOcrMessage && (
                                    <div style={{ gridColumn: '1 / -1', fontSize: 10, color: isCustomerInfoSuccessMessage ? '#0f766e' : '#dc2626', lineHeight: 1.45 }}>
                                        {cccdOcrMessage}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {lines.map((l) => (
                            <TxLine key={l.id} line={l} rates={rates} inventoryItems={inventoryItems}
                                onChange={patch => updateLine(l.id, patch)}
                                onRemove={() => removeLine(l.id)}
                                showRemove={lines.length > 1} />
                        ))}
                    </div>
                    <button
                        onClick={addLine}
                        style={{
                            ...S.pillBtn('linear-gradient(135deg,#111827,#334155)'),
                            justifyContent: 'center',
                            alignSelf: 'center',
                            padding: '9px 16px',
                            fontSize: 11,
                            marginTop: 10,
                            marginBottom: -20,
                            transform: 'translate(30px, -30px)',
                        }}
                    >
                        <IoAddOutline />
                        <span>Thêm Đơn Hàng</span>
                    </button>
                </div>
            </div>

            {!hideBottomBar ? (
                <div style={{ ...S.totalBar, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 9, color: '#64748b', fontWeight: 700, marginBottom: 4 }}>{totalLabel}</div>
                        <div data-sale-amount="true" style={S.totalAmt(total < 0)}>{totalPrefix}{fmtCalc(total)}</div>
                        {draftMessage && <div style={{ marginTop: 8, fontSize: 10, color: '#6b7280' }}>{draftMessage}</div>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                        <button
                            onClick={onSaveDraft}
                            title="Lưu giao dịch"
                            aria-label="Lưu giao dịch"
                            style={{
                                ...S.iconBtn('linear-gradient(135deg,#9ca3af,#6b7280)'),
                                width: 52,
                                height: 52,
                                color: 'white',
                                fontSize: 22,
                            }}
                        >
                            <IoSaveOutline />
                        </button>
                        <button
                            onClick={handleOpenPrintPreview}
                            title="In Pos"
                            aria-label="In Pos"
                            style={{
                                ...S.pillBtn('linear-gradient(135deg,#15803d,#22c55e)', '#ffffff'),
                                height: 52,
                                minHeight: 52,
                                padding: '0 16px',
                                fontSize: 11,
                                whiteSpace: 'nowrap',
                                justifyContent: 'center',
                            }}
                        >
                            <IoPrintOutline style={{ fontSize: 18 }} />
                            <span>In Pos</span>
                        </button>
                        <button
                            onClick={onNext}
                            title="Tính tiền"
                            aria-label="Tính tiền"
                            style={{
                                ...S.iconBtn(sellTheme.gradient),
                                width: 52,
                                height: 52,
                                color: 'white',
                                fontSize: 22,
                            }}
                        >
                            <IoChevronForward />
                        </button>
                    </div>
                </div>
            ) : null}
            <ConfirmDialog
                open={Boolean(customerOverwritePrompt)}
                title={customerOverwritePrompt?.title || 'Đã có khách hàng'}
                message={customerOverwritePrompt?.message || ''}
                confirmLabel="Lưu đè"
                cancelLabel="Hủy"
                loading={customerSaveLoading}
                onClose={() => !customerSaveLoading && setCustomerOverwritePrompt(null)}
                onConfirm={confirmCustomerOverwrite}
            />
        </div>
    );
}
