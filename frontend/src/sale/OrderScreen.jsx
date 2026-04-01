import { useEffect, useState } from 'react';
import { IoAddOutline, IoCameraOutline, IoChevronDownOutline, IoChevronForward, IoHeart, IoHeartOutline, IoPrintOutline, IoRefreshOutline, IoSaveOutline } from 'react-icons/io5';
import TxLine from './TxLine';
import { ConfirmDialog } from './Dialogs';
import CustomerCaptureModal from './CustomerCaptureModal';
import SaleReceiptPreviewModal from './SaleReceiptPreviewModal';
import { copySaleReceiptImageToClipboard, createSaleReceiptPreview, downloadSaleReceiptImage, printSaleReceiptImage } from './printSaleReceipt';
import { API, S, createDefaultLine, createEmptyCustomerInfo, extractCustomerInfoFromOcrText, extractCustomerInfoFromQrPayload, fmtCalc, getDayGreeting, getTxTheme, parseFmt, readImageAsBase64, readAndCropImageAsBase64, scanCodeFromFile, today } from './shared';

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
/** Tao thumbnail vuong, crop trung tam, 160x160 JPEG q=0.55 */
function generateThumbnail(base64, mimeType = 'image/jpeg') {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            try {
                const size = Math.min(img.width, img.height);   // crop vuong
                const sx = (img.width  - size) / 2;
                const sy = (img.height - size) / 2;
                const OUT = 160;                                  // 160x160 px
                const canvas = document.createElement('canvas');
                canvas.width = OUT; canvas.height = OUT;
                canvas.getContext('2d').drawImage(img, sx, sy, size, size, 0, 0, OUT, OUT);
                resolve(canvas.toDataURL('image/jpeg', 0.55));
            } catch {
                resolve(`data:${mimeType};base64,${base64}`);
            }
        };
        img.onerror = () => resolve(`data:${mimeType};base64,${base64}`);
        img.src = `data:${mimeType};base64,${base64}`;
    });
}
const RECEIPT_PRINT_TARGETS = {
    1: {
        machineName: 'LAPTOP_PHAT',
        hostName: 'LAPTOP_PHAT',
        deviceName: 'LAPTOP_PHAT',
        printerName: 'EPSON TM-T81III Receipt6',
        uncPath: '\\\\LAPTOP_PHAT\\EPSON TM-T81III Receipt6',
    },
    5: {
        machineName: 'MAY05',
        hostName: '192.168.1.110',
        deviceName: 'MAY05',
        printerName: 'EPSON TM-T(203dpi) Receipt6',
        uncPath: '\\\\MAY05\\EPSON TM-T(203dpi) Receipt6',
    },
};
const normalizeCustomerPhotoValue = (value) => {
    const raw = trimCustomerText(value);
    if (!raw) return '';
    return isDataImageUrl(raw) ? raw : resolveApiAssetUrl(raw);
};
const buildCustomerPhotoGallery = (customer = {}) => {
    const gallery = Array.isArray(customer?.photoGallery) ? customer.photoGallery : [];
    const candidates = [...gallery, customer?.frontImage, customer?.backImage];
    const seen = new Set();
    return candidates
        .map(normalizeCustomerPhotoValue)
        .filter((item) => {
            if (!item || seen.has(item)) return false;
            seen.add(item);
            return true;
        });
};
const DUPLICATE_FIELD_LABELS = {
    ten: 'tên khách hàng',
    cccd: 'CCCD',
    so_dien_thoai: 'số điện thoại',
};
function StarRating({ value, onChange, size = 20, readOnly = false }) {
    const [hover, setHover] = useState(0);
    return (
        <span style={{ display: 'inline-flex', gap: Math.max(2, Math.round(size * 0.12)), cursor: readOnly ? 'default' : 'pointer' }}>
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
    const [customerCaptureOpen, setCustomerCaptureOpen] = useState(false);
    const [customerCaptureTab, setCustomerCaptureTab] = useState('photo');
    const [captureTabsDone, setCaptureTabsDone] = useState({});
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
        setCustomerInfo(prev => ({
            ...prev,
            [field]: value,
            ...(field === 'address' ? { residence: value } : {}),
        }));
    };
    const openCustomerCapture = (tab = 'photo') => {
        setCustomerInfoOpen(true);
        setCustomerCaptureTab(tab);
        setCccdOcrMessage('');
        setCustomerCaptureOpen(true);
    };
    const attachCustomerIdentityImage = ({ imageBase64, mimeType = 'image/jpeg' }) => {
        if (!imageBase64) return;
        const dataUrl = `data:${mimeType};base64,${imageBase64}`;
        let nextMessage = 'Đã thêm ảnh vào bộ sưu tập khách hàng.';
        // Generate thumbnail async then update gallery thumbs
        generateThumbnail(imageBase64, mimeType).then(thumbUrl => {
            setCustomerInfo(prev => {
                const hasFrontImage = trimCustomerText(prev?.frontImage);
                const hasBackImage  = trimCustomerText(prev?.backImage);
                const nextGallery = buildCustomerPhotoGallery({
                    ...prev,
                    photoGallery: [...(Array.isArray(prev?.photoGallery) ? prev.photoGallery : []), dataUrl],
                });
                if (!hasFrontImage) {
                    nextMessage = 'Đã thêm ảnh và gán vào mặt trước.';
                    return { ...prev, frontImage: dataUrl, frontThumb: thumbUrl, photoGallery: nextGallery };
                }
                if (!hasBackImage) {
                    nextMessage = 'Đã thêm ảnh và gán vào mặt sau.';
                    return { ...prev, backImage: dataUrl, backThumb: thumbUrl, photoGallery: nextGallery };
                }
                return { ...prev, photoGallery: nextGallery };
            });
            setCustomerInfoOpen(true);
            setCccdOcrMessage(nextMessage);
        });
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
        const uploadCustomerImageValue = async ({ value, fileName, side }) => {
            const normalizedValue = normalizeCustomerPhotoValue(value);
            if (!normalizedValue) return '';
            if (isDataImageUrl(normalizedValue)) {
                const parsed = parseImageDataUrl(normalizedValue);
                if (parsed?.imageBase64) {
                    return uploadCustomerIdentityImage({
                        imageBase64: parsed.imageBase64,
                        mimeType: parsed.mimeType,
                        fileName,
                        side,
                    });
                }
            }
            return resolveApiAssetUrl(normalizedValue);
        };

        nextCustomerInfo.frontImage = await uploadCustomerImageValue({
            value: sourceCustomerInfo?.frontImage,
            fileName: 'cccd-front-upload.jpg',
            side: 'front',
        });

        nextCustomerInfo.backImage = await uploadCustomerImageValue({
            value: sourceCustomerInfo?.backImage,
            fileName: 'cccd-back-upload.jpg',
            side: 'back',
        });

        const uploadedGallery = [];
        for (const [index, imageValue] of buildCustomerPhotoGallery(sourceCustomerInfo).entries()) {
            const uploadedValue = await uploadCustomerImageValue({
                value: imageValue,
                fileName: `customer-gallery-${index + 1}.jpg`,
                side: 'gallery',
            });
            if (uploadedValue) uploadedGallery.push(uploadedValue);
        }
        nextCustomerInfo.photoGallery = buildCustomerPhotoGallery({
            photoGallery: uploadedGallery,
            frontImage: nextCustomerInfo.frontImage,
            backImage: nextCustomerInfo.backImage,
        });

        setCustomerInfo(prev => ({
            ...prev,
            frontImage: nextCustomerInfo.frontImage || '',
            backImage: nextCustomerInfo.backImage || '',
            photoGallery: nextCustomerInfo.photoGallery || [],
        }));
        return nextCustomerInfo;
    };
    const buildCustomerSavePayload = (sourceCustomerInfo = customerInfo) => {
        const resolvedName = trimCustomerText(sourceCustomerInfo?.name) || DEFAULT_RED_INVOICE_CUSTOMER_NAME;
        const resolvedAddress = trimCustomerText(sourceCustomerInfo?.address) || trimCustomerText(sourceCustomerInfo?.residence);
        return {
            id: sourceCustomerInfo?.id || '',
            ten: resolvedName,
            cccd: sourceCustomerInfo?.cccd || '',
            ngay_sinh: sourceCustomerInfo?.dob || '',
            gioi_tinh: sourceCustomerInfo?.gender || '',
            que_quan: sourceCustomerInfo?.origin || '',
            noi_thuong_tru: resolvedAddress,
            dia_chi: resolvedAddress,
            so_dien_thoai: sourceCustomerInfo?.phone || '',
            ngay_cap_cccd: sourceCustomerInfo?.issueDate || '',
            han_the: sourceCustomerInfo?.expiry || '',
            sao: Number(sourceCustomerInfo?.sao || 0),
            yeu_thich: Boolean(sourceCustomerInfo?.favorite),
            favorite: Boolean(sourceCustomerInfo?.favorite),
            ocr_mat_sau: sourceCustomerInfo?.backText || '',
            anh_mat_truoc: resolveApiAssetUrl(sourceCustomerInfo?.frontImage || ''),
            anh_mat_sau: resolveApiAssetUrl(sourceCustomerInfo?.backImage || ''),
            anh_bo_suu_tap: buildCustomerPhotoGallery(sourceCustomerInfo),
            photo_gallery: buildCustomerPhotoGallery(sourceCustomerInfo),
            photoGallery: buildCustomerPhotoGallery(sourceCustomerInfo),
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
        const savedRecord = result?.record || {};
        if (savedRecord?.id) {
            const resolvedAddress = savedRecord.dia_chi || savedRecord.noi_thuong_tru || '';
            setCustomerInfo(prev => ({
                ...prev,
                id: savedRecord.id,
                name: savedRecord.ten || prev.name,
                cccd: savedRecord.cccd || prev.cccd,
                dob: savedRecord.ngay_sinh || prev.dob,
                gender: savedRecord.gioi_tinh || prev.gender,
                origin: savedRecord.que_quan || prev.origin,
                residence: savedRecord.noi_thuong_tru || savedRecord.dia_chi || prev.residence,
                issueDate: savedRecord.ngay_cap_cccd || prev.issueDate,
                address: resolvedAddress || prev.address,
                phone: savedRecord.so_dien_thoai || prev.phone,
                sao: Number(savedRecord.sao || 0),
                favorite: Boolean(savedRecord.favorite ?? savedRecord.yeu_thich ?? prev.favorite),
                backText: savedRecord.ocr_mat_sau || prev.backText,
                frontImage: resolveApiAssetUrl(savedRecord.anh_mat_truoc || prev.frontImage || ''),
                backImage: resolveApiAssetUrl(savedRecord.anh_mat_sau || prev.backImage || ''),
                photoGallery: buildCustomerPhotoGallery({
                    photoGallery: savedRecord.photoGallery || savedRecord.photo_gallery || savedRecord.anh_bo_suu_tap || prev.photoGallery || [],
                    frontImage: savedRecord.anh_mat_truoc || prev.frontImage || '',
                    backImage: savedRecord.anh_mat_sau || prev.backImage || '',
                }),
            }));
        }
        const actionLabel = result.msg === 'Updated' ? 'cập nhật' : 'lưu mới';
        const customerLabel = trimCustomerText(payload?.ten) || trimCustomerText(payload?.so_dien_thoai) || trimCustomerText(payload?.cccd) || 'khách hàng';
        const successMessage = `Đã ${actionLabel} khách hàng thành công: ${customerLabel}.`;
        setCccdOcrMessage(successMessage);
        dispatchNotif('Lưu khách hàng thành công', successMessage);
    };
    const applyCustomerRecord = (record) => {
        if (!record) return;
        const resolvedAddress = record.dia_chi || record.noi_thuong_tru || '';
        setCustomerInfo({
            ...createEmptyCustomerInfo(),
            id: record.id || '',
            name: record.ten || '',
            cccd: record.cccd || '',
            oldId: record.cmnd_cu || '',
            dob: record.ngay_sinh || '',
            gender: record.gioi_tinh || '',
            nationality: record.quoc_tich || '',
            origin: record.que_quan || '',
            residence: record.noi_thuong_tru || record.dia_chi || '',
            expiry: record.han_the || '',
            issueDate: record.ngay_cap_cccd || '',
            address: resolvedAddress,
            phone: record.so_dien_thoai || '',
            sao: Number(record.sao || 0),
            favorite: Boolean(record.favorite ?? record.yeu_thich),
            backText: record.ocr_mat_sau || '',
            frontImage: resolveApiAssetUrl(record.anh_mat_truoc || ''),
            backImage: resolveApiAssetUrl(record.anh_mat_sau || ''),
            photoGallery: buildCustomerPhotoGallery({
                photoGallery: record.photoGallery || record.photo_gallery || record.anh_bo_suu_tap || [],
                frontImage: record.anh_mat_truoc || '',
                backImage: record.anh_mat_sau || '',
            }),
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
        // Generate thumbnail client-side truoc khi upload (hien thi nhanh, khong can doi server)
        const thumbKey = side === 'back' ? 'backThumb' : 'frontThumb';
        generateThumbnail(imageBase64, mimeType).then(thumbUrl => {
            setCustomerInfo(prev => ({ ...prev, [thumbKey]: thumbUrl }));
        });
        try {
            const storedImageUrl = await uploadCustomerIdentityImage({ imageBase64, mimeType, fileName, side });
            setCustomerInfo(prev => ({
                ...prev,
                [side === 'back' ? 'backImage' : 'frontImage']: storedImageUrl,
                photoGallery: buildCustomerPhotoGallery({
                    ...prev,
                    [side === 'back' ? 'backImage' : 'frontImage']: storedImageUrl,
                    photoGallery: [...(Array.isArray(prev?.photoGallery) ? prev.photoGallery : []), storedImageUrl],
                }),
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
            const ocrMsg = side === 'back'
                ? (rawText ? 'Đã điền ghi chú nhanh từ mặt sau.' : 'Đã OCR mặt sau, bạn kiểm tra lại ghi chú nhanh.')
                : parsed.appliedFields.length
                    ? `OCR CCCD xong: ${parsed.appliedFields.join(', ')}.`
                    : 'OCR xong, bạn kiểm tra lại thông tin nếu cần.';
            setCccdOcrMessage(ocrMsg);
            // Mark tab done + tu dong quay ve tab Chup hinh sau 2s
            setCaptureTabsDone(prev => ({ ...prev, [`ocr_${side}`]: true }));
            setTimeout(() => setCustomerCaptureTab('photo'), 2000);
        } catch (error) {
            setCccdOcrMessage(error.message || 'Không OCR được CCCD.');
        } finally {
            setCccdOcrLoading(false);
        }
    };
    const handleCccdOcrFile = async (file, side = 'front') => {
        if (!file) return;
        try {
            const imageBase64 = await readAndCropImageAsBase64(file, 16 / 9);
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
            setCccdOcrMessage(`QR CCCD xong: ${parsed.appliedFields.join(', ')}.`);
            // Hien thong bao 2s roi tu dong quay ve tab Chup hinh
            setTimeout(() => setCustomerCaptureTab('photo'), 2000);
        } catch (error) {
            setCccdOcrMessage(error.message || 'Không đọc được QR CCCD.');
        } finally {
            setCccdQrLoading(false);
        }
    };
    const handleCustomerPhotoCapture = async ({ imageBase64, mimeType = 'image/jpeg' }) => {
        attachCustomerIdentityImage({ imageBase64, mimeType });
    };
    const handleCustomerPhotoFiles = async (files) => {
        for (const file of Array.from(files || [])) {
            try {
                const imageBase64 = await readAndCropImageAsBase64(file, 4 / 3);
                attachCustomerIdentityImage({
                    imageBase64,
                    mimeType: file.type || 'image/jpeg',
                });
            } catch (error) {
                setCccdOcrMessage(error.message || 'Không đọc được ảnh CCCD.');
                break;
            }
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
    const _handlePosReceiptPrintLegacy = async (posNo) => {
        if (!receiptPreviewUrl) return;
        const currentPosNo = Number(posNo || 1);
        const target = RECEIPT_PRINT_TARGETS[currentPosNo];
        if (!target) {
            handlePrintReceipt(currentPosNo);
            return;
        }
        const printOptions = {
            paper_width_mm: 76,
            margin_mm: 0,
            fit_width: true,
            print_strategy: 'gdi_image',
        };
        const imageData = parseImageDataUrl(receiptPreviewUrl);
        if (!imageData?.imageBase64) {
            setReceiptActionMessage('KhÃ´ng Ä‘á»c Ä‘Æ°á»£c PNG Ä‘á»ƒ gá»­i mÃ¡y in.');
            setReceiptActionError(true);
            return;
        }
        const safeOrderId = String(orderId || 'phieu-giao-dich-pos').trim().replace(/[^a-zA-Z0-9_-]+/g, '-') || 'phieu-giao-dich-pos';
        setReceiptActionMessage(`Äang gá»­i PNG tá»›i ${target.machineName}...`);
        setReceiptActionError(false);
        try {
            const response = await fetch(`${API}/api/print/dispatch-image`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    image_base64: imageData.imageBase64,
                    content_type: imageData.mimeType || 'image/png',
                    document_name: `${orderId || 'Phiáº¿u giao dá»‹ch POS'} Â· POS ${currentPosNo}`,
                    file_name: `${safeOrderId}-pos-${currentPosNo}.png`,
                    requested_by: 'POS Mobile',
                    machine_name: target.machineName,
                    host_name: target.hostName,
                    device_name: target.deviceName,
                    printer_name: target.printerName,
                    unc_path: target.uncPath,
                    options: printOptions,
                }),
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
            const agentName = payload?.agent?.machine_name || payload?.agent?.device_name || payload?.agent?.agent_key || target.machineName;
            const printerName = payload?.printer?.printer_name || payload?.command?.printer_name || target.printerName;
            setReceiptActionMessage(printerName ? `ÄÃ£ gá»­i PNG tá»›i ${agentName} / ${printerName}.` : `ÄÃ£ gá»­i PNG tá»›i ${agentName}.`);
            setReceiptActionError(false);
        } catch (error) {
            setReceiptActionMessage(error.message || `KhÃ´ng gá»­i Ä‘Æ°á»£c PNG tá»›i ${target.machineName}.`);
            setReceiptActionError(true);
        }
    };
    const handlePosReceiptPrintSafe = async (posNo) => {
        if (!receiptPreviewUrl) return;
        const currentPosNo = Number(posNo || 1);
        const target = RECEIPT_PRINT_TARGETS[currentPosNo];
        if (!target) {
            handlePrintReceipt(currentPosNo);
            return;
        }
        const printOptions = {
            paper_width_mm: 76,
            margin_mm: 0,
            fit_width: true,
            print_strategy: 'gdi_image',
        };
        const imageData = parseImageDataUrl(receiptPreviewUrl);
        if (!imageData?.imageBase64) {
            setReceiptActionMessage('Khong doc duoc PNG de gui may in.');
            setReceiptActionError(true);
            return;
        }
        const safeOrderId = String(orderId || 'phieu-giao-dich-pos').trim().replace(/[^a-zA-Z0-9_-]+/g, '-') || 'phieu-giao-dich-pos';
        setReceiptActionMessage(`Dang gui PNG toi ${target.machineName}...`);
        setReceiptActionError(false);
        try {
            const response = await fetch(`${API}/api/print/dispatch-image`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    image_base64: imageData.imageBase64,
                    content_type: imageData.mimeType || 'image/png',
                    document_name: `${orderId || 'Phieu giao dich POS'} · POS ${currentPosNo}`,
                    file_name: `${safeOrderId}-pos-${currentPosNo}.png`,
                    requested_by: 'POS Mobile',
                    machine_name: target.machineName,
                    host_name: target.hostName,
                    device_name: target.deviceName,
                    printer_name: target.printerName,
                    unc_path: target.uncPath,
                    options: printOptions,
                }),
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
            const agentName = payload?.agent?.machine_name || payload?.agent?.device_name || payload?.agent?.agent_key || target.machineName;
            const printerName = payload?.printer?.printer_name || payload?.command?.printer_name || target.printerName;
            setReceiptActionMessage(printerName ? `Da gui PNG toi ${agentName} / ${printerName}.` : `Da gui PNG toi ${agentName}.`);
            setReceiptActionError(false);
        } catch (error) {
            setReceiptActionMessage(error.message || `Khong gui duoc PNG toi ${target.machineName}.`);
            setReceiptActionError(true);
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
                onPrint={handlePosReceiptPrintSafe}
                onCopy={handleCopyReceipt}
                onDownload={handleDownloadReceipt}
                actionMessage={receiptActionMessage}
                actionError={receiptActionError}
            />
            <CustomerCaptureModal
                key={customerCaptureOpen ? 'capture-open' : 'capture-closed'}
                open={customerCaptureOpen}
                activeTab={customerCaptureTab}
                initialPhotos={buildCustomerPhotoGallery(customerInfo)}
                onTabChange={setCustomerCaptureTab}
                message={cccdOcrMessage}
                qrLoading={cccdQrLoading}
                ocrLoading={cccdOcrLoading}
                tabsDone={captureTabsDone}
                onClose={() => setCustomerCaptureOpen(false)}
                onQrDetected={applyCustomerQrPayload}
                onQrPickFile={handleCustomerQrFile}
                onOcrCapture={runCustomerOcr}
                onOcrPickFile={handleCccdOcrFile}
                onPhotoCapture={handleCustomerPhotoCapture}
                onPhotoPickFiles={handleCustomerPhotoFiles}
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
                                alignItems: 'stretch',
                                gap: 10,
                            }}
                        >
                            <div style={{ flex: 1, minWidth: 0, display: 'grid', gap: 8 }}>
                                <input
                                    className="sale-pos-catalog-input"
                                    style={{ ...S.inp, textAlign: 'left', fontWeight: 400, height: 38, minHeight: 38 }}
                                    value={customerLookupQuery}
                                    onChange={e => setCustomerLookupQuery(e.target.value)}
                                    onFocus={() => setCustomerInfoOpen(true)}
                                    placeholder="Tìm kiếm nhanh bằng tên, số điện thoại, cccd"
                                    aria-label="Tìm kiếm nhanh bằng tên, số điện thoại, cccd"
                                />
                                <input
                                    className="sale-pos-catalog-input"
                                    style={{ ...S.inp, textAlign: 'left', fontWeight: 400, height: 38, minHeight: 38 }}
                                    value={customerInfo?.name || ''}
                                    onChange={e => updateCustomerInfo('name', e.target.value)}
                                    onFocus={() => setCustomerInfoOpen(true)}
                                    placeholder="Tên khách hàng"
                                />
                            </div>
                            <button
                                type="button"
                                onClick={() => openCustomerCapture('photo')}
                                disabled={cccdQrLoading || cccdOcrLoading}
                                style={{
                                    ...S.pillBtn('linear-gradient(135deg,#0f766e,#14b8a6)'),
                                    width: 68,
                                    height: 68,
                                    minHeight: 68,
                                    padding: 0,
                                    justifyContent: 'center',
                                    opacity: cccdQrLoading || cccdOcrLoading ? 0.7 : 1,
                                    boxShadow: '0 12px 24px rgba(15,23,42,.16)',
                                    flexShrink: 0,
                                    alignSelf: 'center',
                                }}
                                title="Mở camera QR / OCR / chụp hình"
                                aria-label="Mở camera QR / OCR / chụp hình"
                            >
                                <IoCameraOutline style={{ fontSize: 28 }} />
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
                                    alignSelf: 'center',
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
                                            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                                                <span style={{ fontSize: 11, fontWeight: 800, color: '#111827' }}>{record.ten || 'Khách hàng chưa đặt tên'}</span>
                                                {record.favorite || record.yeu_thich ? <IoHeart style={{ fontSize: 14, color: '#ef4444', flexShrink: 0 }} /> : null}
                                            </span>
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
                                    style={{ ...S.inp, textAlign: 'left', fontWeight: 400 }}
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
                                    placeholder="Nhập ngày sinh (không bắt buộc)"
                                />
                                <input
                                    className="sale-pos-catalog-input"
                                    style={{ ...S.inp, gridColumn: '1 / -1', textAlign: 'left', fontWeight: 400 }}
                                    value={customerInfo?.address || customerInfo?.residence || ''}
                                    onChange={e => updateCustomerInfo('address', e.target.value)}
                                    placeholder="Nhập địa chỉ"
                                />
                                <div style={{ gridColumn: '1 / -1' }}>
                                    <div style={{ position: 'relative', minWidth: 0 }}>
                                        <textarea
                                            className="sale-pos-catalog-input"
                                            style={{ ...S.inp, textAlign: 'left', fontWeight: 400, minHeight: 96, resize: 'vertical', paddingTop: 10, paddingBottom: 72, height: '100%' }}
                                            value={customerInfo?.backText || ''}
                                            onChange={e => updateCustomerInfo('backText', e.target.value)}
                                            placeholder="Ghi chú nhanh"
                                        />
                                        <div style={{ position: 'absolute', left: 10, right: 10, bottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                                                <StarRating value={Number(customerInfo?.sao || 0)} onChange={(value) => updateCustomerInfo('sao', value)} size={30} />
                                                <button
                                                    type="button"
                                                    onClick={() => updateCustomerInfo('favorite', !customerInfo?.favorite)}
                                                    style={{
                                                        width: 30,
                                                        height: 30,
                                                        borderRadius: '50%',
                                                        border: customerInfo?.favorite ? 'none' : '1px solid #dbe4ee',
                                                        background: customerInfo?.favorite ? 'linear-gradient(135deg,#ef4444,#f97316)' : 'rgba(255,255,255,.96)',
                                                        color: customerInfo?.favorite ? '#ffffff' : '#94a3b8',
                                                        boxShadow: customerInfo?.favorite ? '0 10px 20px rgba(239,68,68,.22)' : 'none',
                                                        cursor: 'pointer',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        flexShrink: 0,
                                                    }}
                                                    title="Favourite"
                                                    aria-label="Favourite"
                                                >
                                                    {customerInfo?.favorite ? <IoHeart style={{ fontSize: 15 }} /> : <IoHeartOutline style={{ fontSize: 15 }} />}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                {cccdOcrMessage && (
                                    <div style={{ gridColumn: '1 / -1', fontSize: 10, color: isCustomerInfoSuccessMessage ? '#0f766e' : '#dc2626', lineHeight: 1.45 }}>
                                        {cccdOcrMessage}
                                    </div>
                                )}
                                {/* CCCD image slots - luon hien thi, click slot trong de mo camera */}
                                <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, marginTop: 2 }}>
                                    {[
                                        { imgKey: 'frontImage', thumbKey: 'frontThumb', tabKey: 'ocr_front', label: 'CCCD mặt trước' },
                                        { imgKey: 'backImage',  thumbKey: 'backThumb',  tabKey: 'ocr_back',  label: 'CCCD mặt sau' },
                                    ].map(({ imgKey, thumbKey, tabKey, label }) => {
                                        const fullUrl  = customerInfo?.[imgKey];
                                        const thumbUrl = customerInfo?.[thumbKey];
                                        return (
                                            <div key={imgKey} style={{ flex: '0 0 auto', width: 80, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                <span style={{ fontSize: 8, color: '#94a3b8', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.04em', whiteSpace: 'nowrap' }}>{label}</span>
                                                {fullUrl ? (
                                                    <a href={fullUrl} target="_blank" rel="noreferrer"
                                                        title="Click để xem ảnh đầy đủ"
                                                        style={{ display: 'block', borderRadius: 12, overflow: 'hidden', border: '1px solid #dbe4ee', background: '#f1f5f9', aspectRatio: '1/1', boxShadow: '0 2px 8px rgba(15,23,42,.06)' }}>
                                                        <img src={thumbUrl || fullUrl} alt={label} loading="lazy"
                                                            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                                                    </a>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        onClick={() => openCustomerCapture(tabKey)}
                                                        style={{
                                                            width: '100%', aspectRatio: '16/9',
                                                            borderRadius: 12,
                                                            border: '1.5px dashed #cbd5e1',
                                                            background: 'rgba(248,250,252,.85)',
                                                            color: '#94a3b8', fontSize: 9,
                                                            cursor: 'pointer',
                                                            display: 'flex', flexDirection: 'column',
                                                            alignItems: 'center', justifyContent: 'center', gap: 5,
                                                            transition: 'border-color .15s, background .15s',
                                                        }}
                                                    >
                                                        <IoCameraOutline style={{ fontSize: 20, color: '#b0bec5' }} />
                                                        <span style={{ fontWeight: 600 }}>Chụp / Chọn ảnh</span>
                                                    </button>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                                {/* Extra gallery photos - scroll strip */}
                                {(() => {
                                    const front = customerInfo?.frontImage;
                                    const back  = customerInfo?.backImage;
                                    const extra = (Array.isArray(customerInfo?.photoGallery) ? customerInfo.photoGallery : [])
                                        .filter(u => u && u !== front && u !== back);
                                    if (!extra.length) return null;
                                    return (
                                        <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, WebkitOverflowScrolling: 'touch', scrollbarWidth: 'thin' }}>
                                            {extra.map((url, idx) => (
                                                <a key={idx} href={url} target="_blank" rel="noreferrer"
                                                    style={{ flex: '0 0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, textDecoration: 'none' }}>
                                                    <div style={{ width: 56, height: 56, borderRadius: 10, overflow: 'hidden', border: '1px solid #dbe4ee', background: '#f1f5f9' }}>
                                                        <img src={url} alt={`Ảnh ${idx + 1}`} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                                                    </div>
                                                    <span style={{ fontSize: 8, color: '#64748b', fontWeight: 600 }}>Ảnh {idx + 1}</span>
                                                </a>
                                            ))}
                                        </div>
                                    );
                                })()}
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
                        {false && <button
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
                        </button>}
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
