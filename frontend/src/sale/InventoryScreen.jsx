import { useEffect, useMemo, useRef, useState } from 'react';
import { IoCameraOutline, IoDocumentTextOutline, IoImagesOutline, IoListOutline } from 'react-icons/io5';
import { pickChecklistItemId } from './SavedScreens';
import { API, S, printItemCertification } from './shared';
import InventoryChecklistBanner from './InventoryChecklistBanner';
import InventoryFooter from './InventoryFooter';
import InventoryCostSection from './InventoryCostSection';
import InventoryWeightSection from './InventoryWeightSection';
import { STOCK_STATUS_OPTIONS, emptyStockForm } from './InventoryShared';

export default function InventoryScreen({ nhomHangList, quayNhoList, tuoiVangList, onSaved }) {
    const fileRef = useRef(null);
    const ocrFileRef = useRef(null);
    const [form, setForm] = useState(emptyStockForm);
    const [files, setFiles] = useState([]);
    const [previews, setPreviews] = useState([]);
    const [ocrText, setOcrText] = useState('');
    const [, setOcrLoading] = useState(false);
    const [ocrPreview, setOcrPreview] = useState('');
    const [, setOcrFileName] = useState('');
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');
    const [nhapVangLists, setNhapVangLists] = useState([]);
    const [checklistOpen, setChecklistOpen] = useState(false);
    const [checklistLoading, setChecklistLoading] = useState(false);
    const [selectedNhapListId, setSelectedNhapListId] = useState(null);
    const [selectedNhapItemId, setSelectedNhapItemId] = useState(null);

    useEffect(() => () => previews.forEach(url => URL.revokeObjectURL(url)), [previews]);
    useEffect(() => () => {
        if (ocrPreview) {
            URL.revokeObjectURL(ocrPreview);
        }
    }, [ocrPreview]);

    const setField = (key, value) => setForm(f => ({ ...f, [key]: value }));
    const selectedNhapPlan = nhapVangLists.find(plan => plan.id === selectedNhapListId) || nhapVangLists[0] || null;
    const selectedNhapItem = selectedNhapPlan?.items?.find(item => item.id === selectedNhapItemId) || null;
    const nhomHangNames = useMemo(() => (
        nhomHangList
            .map(item => String(item?.ten_nhom || '').trim())
            .filter(Boolean)
    ), [nhomHangList]);
    const nhomHangNamesKey = nhomHangNames.join('|');

    const resetAll = (clearMessage = true) => {
        setForm(emptyStockForm());
        setFiles([]);
        setPreviews([]);
        setOcrText('');
        setOcrPreview(prev => {
            if (prev) URL.revokeObjectURL(prev);
            return '';
        });
        setOcrFileName('');
        if (clearMessage) setMessage('');
        if (fileRef.current) fileRef.current.value = '';
        if (ocrFileRef.current) ocrFileRef.current.value = '';
    };

    const loadNhapVangLists = async (preferredPlanId = selectedNhapListId, preferredItemId = selectedNhapItemId) => {
        setChecklistLoading(true);
        try {
            const res = await fetch(`${API}/api/nhap_vang_lists?active_only=1`);
            if (!res.ok) throw new Error('Không tải được danh sách nhập vàng');
            const data = await res.json();
            const plans = Array.isArray(data) ? data : [];
            const nextPlanId = plans.some(plan => plan.id === preferredPlanId)
                ? preferredPlanId
                : (plans[0]?.id || null);
            const nextPlan = plans.find(plan => plan.id === nextPlanId) || plans[0] || null;
            const nextItemId = pickChecklistItemId(nextPlan, preferredItemId);

            setNhapVangLists(plans);
            setSelectedNhapListId(nextPlan?.id || null);
            setSelectedNhapItemId(nextItemId);
        } catch (err) {
            setNhapVangLists([]);
            setSelectedNhapListId(null);
            setSelectedNhapItemId(null);
            setMessage(err.message || 'Không tải được danh sách nhập vàng');
        } finally {
            setChecklistLoading(false);
        }
    };

    useEffect(() => {
        loadNhapVangLists().catch(() => { });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const runOcr = async (file) => {
        if (!file) return;
        setOcrLoading(true);
        setMessage('');
        const reader = new FileReader();
        reader.onload = async (ev) => {
            try {
                const base64 = ev.target.result.split(',')[1];
                const res = await fetch(`${API}/api/ocr`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        image_base64: base64,
                        mime_type: file.type || 'image/jpeg',
                        file_name: file.name,
                    }),
                });
                const data = await res.json();
                if (res.ok && data.text) {
                    setOcrText(data.text);
                    setMessage('OCR hoàn tất.');
                } else {
                    setMessage(data.error || 'Không đọc được nhãn.');
                }
            } catch (err) {
                setMessage('Lỗi kết nối OCR: ' + err.message);
            } finally {
                setOcrLoading(false);
            }
        };
        reader.readAsDataURL(file);
    };

    const onPickFiles = (e) => {
        const picked = Array.from(e.target.files || []).filter(f => f.type.startsWith('image/'));
        if (!picked.length) return;
        const urls = picked.map(f => URL.createObjectURL(f));
        setFiles(picked);
        setPreviews(urls);
        setMessage('');
        e.target.value = '';
    };

    const onPickOcrFile = (e) => {
        const picked = Array.from(e.target.files || []).filter(f => f.type.startsWith('image/'));
        const file = picked[0];
        e.target.value = '';
        if (!file) return;
        setOcrPreview(prev => {
            if (prev) URL.revokeObjectURL(prev);
            return URL.createObjectURL(file);
        });
        setOcrFileName(file.name || 'tem-ocr');
        setMessage('');
        runOcr(file);
    };

    const uploadImages = async () => {
        const uploaded = [];
        for (const file of files) {
            const fd = new FormData();
            fd.append('file', file);
            const res = await fetch(`${API}/api/upload`, { method: 'POST', body: fd });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || `Tải ảnh thất bại: ${file.name}`);
            uploaded.push({ url: data.url, name: data.name });
        }
        return uploaded;
    };

    const selectChecklistPlan = (planId) => {
        const plan = nhapVangLists.find(entry => entry.id === planId) || null;
        setSelectedNhapListId(planId);
        setSelectedNhapItemId(pickChecklistItemId(plan));
    };

    const selectChecklistItem = (item) => {
        if (!item) return;
        setSelectedNhapListId(item.list_id || selectedNhapPlan?.id || null);
        setSelectedNhapItemId(item.id);
        setForm(prev => ({
            ...prev,
            ncc: item.ten_hang || prev.ncc,
            nhom_hang: nhomHangNames.includes(item.nhom_hang || '') ? (item.nhom_hang || '') : prev.nhom_hang,
            tuoi_vang: item.tuoi_vang || prev.tuoi_vang,
            tong_tl: item.trong_luong || prev.tong_tl,
        }));
        setChecklistOpen(false);
        setMessage(`Đã chọn mục cần nhập: ${item.ten_hang}.`);
    };

    useEffect(() => {
        if (!form.nhom_hang) return;
        if (nhomHangNames.includes(form.nhom_hang)) return;
        setForm(prev => prev.nhom_hang ? { ...prev, nhom_hang: '' } : prev);
    }, [form.nhom_hang, nhomHangNames, nhomHangNamesKey]);

    const updateChecklistProgress = async (item, delta) => {
        if (!item || !delta) return null;
        const currentQty = Number(item.so_luong_da_nhap || 0);
        const requiredQty = Number(item.so_luong_yeu_cau || 0);
        const nextQty = Math.max(0, Math.min(requiredQty, currentQty + delta));
        if (nextQty === currentQty) return item;

        const res = await fetch(`${API}/api/nhap_vang_items/${item.id}/progress`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ so_luong_da_nhap: nextQty }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Không cập nhật được checklist nhập vàng');

        await loadNhapVangLists(item.list_id, data.hoan_thanh ? null : data.id);
        return data;
    };

    const saveItem = async () => {
        setSaving(true);
        setMessage('');
        try {
            const images = files.length ? await uploadImages() : [];
            const payload = { ...form, images, certificates: [], ocr_text: ocrText };
            const res = await fetch(`${API}/api/items`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Không thể lưu sản phẩm');
            resetAll(false);
            let nextMessage = `Đã lưu sản phẩm #${data.id}.`;
            if (selectedNhapItem) {
                const progress = await updateChecklistProgress(selectedNhapItem, 1);
                if (progress?.ten_hang) {
                    nextMessage = `Đã lưu sản phẩm #${data.id}. Checklist ${progress.ten_hang}: ${progress.so_luong_da_nhap}/${progress.so_luong_yeu_cau}.`;
                }
            }
            setMessage(nextMessage);
            onSaved && onSaved(data);
        } catch (err) {
            setMessage(err.message || 'Lưu sản phẩm thất bại');
        } finally {
            setSaving(false);
        }
    };

    const handlePrintTem = () => {
        const printableItem = {
            ma_hang: form.ma_hang,
            ncc: form.ncc || selectedNhapItem?.ten_hang || '',
            nhom_hang: form.nhom_hang || selectedNhapItem?.nhom_hang || '',
            quay_nho: form.quay_nho,
            tuoi_vang: form.tuoi_vang || selectedNhapItem?.tuoi_vang || '',
            cong_le: form.cong_le,
            cong_si: form.cong_si,
            tl_da: form.tl_da,
            tl_vang: form.tl_vang,
            tong_tl: form.tong_tl || selectedNhapItem?.trong_luong || '',
            gia_hien_tai: null,
            ocr_text: ocrText,
        };
        const hasContent = [printableItem.ma_hang, printableItem.ncc, printableItem.tuoi_vang, printableItem.tong_tl, printableItem.ocr_text]
            .some(value => String(value || '').trim());
        if (!hasContent) {
            window.alert('Chưa có dữ liệu để in tem.');
            return;
        }
        printItemCertification(printableItem, { title: 'Tem sản phẩm' });
    };

    const fieldStyle = { ...S.inp, textAlign: 'left', padding: '9px 10px' };
    const sectionStyle = { ...S.card, background: 'rgba(255,255,255,.97)', border: '1px solid rgba(15,23,42,.06)', color: '#111827' };
    const subSectionStyle = { border: '1px solid rgba(15,23,42,.06)', borderRadius: 18, padding: 14, background: 'rgba(255,255,255,.98)' };
    const sectionTitleStyle = { fontSize: 11, fontWeight: 900, color: '#0f172a', marginBottom: 10, letterSpacing: 0.2 };
    const formLabelStyle = { ...S.label, marginBottom: 6 };
    const actionBtn = (bg, color = '#111827') => ({
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        minWidth: 116,
        padding: '11px 16px',
        borderRadius: 999,
        border: 'none',
        background: bg,
        color,
        fontWeight: 800,
        fontSize: 11,
        cursor: 'pointer',
        boxShadow: '0 10px 24px rgba(15,23,42,.10)',
    });
    const squareChoiceBtn = (active) => ({
        minWidth: 86,
        padding: '12px 14px',
        borderRadius: 16,
        border: active ? '1.5px solid #1d4ed8' : '1px solid #dbe4ee',
        background: active ? 'linear-gradient(135deg, #eff6ff, #dbeafe)' : 'rgba(255,255,255,.98)',
        color: active ? '#1d4ed8' : '#334155',
        fontWeight: 800,
        fontSize: 11,
        textAlign: 'center',
        cursor: 'pointer',
        boxShadow: active ? '0 10px 22px rgba(29,78,216,.14)' : '0 4px 10px rgba(15,23,42,.04)',
        whiteSpace: 'nowrap',
        flexShrink: 0,
    });
    const giaVonTong = Math.round(
        (parseInt(form.gia_vang_mua || 0, 10) || 0) * (parseFloat(form.tl_vang || 0) || 0) +
        (parseInt(form.gia_hat || 0, 10) || 0) +
        (parseInt(form.gia_nhan_cong || 0, 10) || 0) +
        (parseInt(form.dieu_chinh || 0, 10) || 0)
    );
    const renderLegacyOption = (value, exists, suffix = ' (cũ)') => {
        if (!value || exists) return null;
        return <option value={value}>{value}{suffix}</option>;
    };

    return (
        <div style={S.screen}>
            <div style={S.header}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                    <button
                        type="button"
                        onClick={() => setChecklistOpen(true)}
                        style={S.iconBtn('#ffffff')}
                        title="Danh sách sản phẩm cần nhập"
                    >
                        <IoListOutline />
                    </button>
                    <div style={{ flex: 1 }}>
                        <div data-sale-title="true" style={S.title}>Nhập kho bằng camera</div>
                        <div style={S.sub}>Chụp ảnh sản phẩm, đọc nhãn và lưu vào backend quản trị.</div>
                    </div>
                </div>
            </div>

            <div style={S.scrollArea}>
                <InventoryChecklistBanner
                    selectedNhapItem={selectedNhapItem}
                    selectedNhapPlan={selectedNhapPlan}
                    sectionStyle={sectionStyle}
                    setChecklistOpen={setChecklistOpen}
                    updateChecklistProgress={updateChecklistProgress}
                    setMessage={setMessage}
                />

                <div style={sectionStyle}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <div>
                            <div style={sectionTitleStyle}>Ảnh sản phẩm</div>
                            <div onClick={() => fileRef.current?.click()} style={{ minHeight: 170, borderRadius: 18, border: '2px dashed #cbd5e1', background: 'linear-gradient(180deg, #f8fbff, #eef6ff)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', cursor: 'pointer' }}>
                                {previews.length === 0 ? (
                                    <div style={{ textAlign: 'center', color: '#64748b', padding: 20 }}>
                                        <div style={{ fontSize: 22, marginBottom: 8, display: 'flex', justifyContent: 'center' }}><IoImagesOutline /></div>
                                        <div style={{ fontSize: 10, fontWeight: 700 }}>Chạm để chụp hoặc chọn ảnh</div>
                                        <div style={{ fontSize: 9, marginTop: 6 }}>Ảnh sẽ được tải lên cùng dữ liệu sản phẩm</div>
                                    </div>
                                ) : (
                                    <div style={{ display: 'grid', gridTemplateColumns: previews.length > 1 ? '1fr 1fr' : '1fr', gap: 8, width: '100%', padding: 8 }}>
                                        {previews.slice(0, 4).map((url, idx) => (
                                            <img key={url} src={url} alt={`preview-${idx}`} style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 10 }} />
                                        ))}
                                    </div>
                                )}
                            </div>
                            <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple style={{ display: 'none' }} onChange={onPickFiles} />
                            <div style={{ fontSize: 10, color: '#64748b', marginTop: 8 }}>
                                {files.length ? `Đã chọn ${files.length} ảnh` : 'Chưa chọn ảnh nào'}
                            </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <div style={{ ...subSectionStyle, borderRadius: 0 }}>
                                <div style={{ ...sectionTitleStyle, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                                    <IoDocumentTextOutline />
                                    <span>OCR nhãn</span>
                                </div>
                                <div
                                    onClick={() => ocrFileRef.current?.click()}
                                    style={{
                                        minHeight: 170,
                                        borderRadius: 0,
                                        border: '2px dashed #cbd5e1',
                                        background: 'linear-gradient(180deg, #f8fbff, #eef6ff)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        overflow: 'hidden',
                                        cursor: 'pointer',
                                    }}
                                >
                                    {ocrPreview ? (
                                        <img src={ocrPreview} alt="ocr-preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    ) : (
                                        <div style={{ textAlign: 'center', color: '#64748b', padding: 20 }}>
                                            <div style={{ fontSize: 22, marginBottom: 8, display: 'flex', justifyContent: 'center' }}><IoDocumentTextOutline /></div>
                                            <div style={{ fontSize: 10, fontWeight: 700 }}>Chạm để chụp hoặc chọn tem</div>
                                            <div style={{ fontSize: 9, marginTop: 6 }}>Tem sẽ được OCR tự động sau khi chọn ảnh</div>
                                        </div>
                                    )}
                                </div>
                                <input
                                    ref={ocrFileRef}
                                    type="file"
                                    accept="image/*"
                                    capture="environment"
                                    style={{ display: 'none' }}
                                    onChange={onPickOcrFile}
                                />
                            </div>
                            {message && <div style={{ padding: '10px 12px', borderRadius: 12, background: 'rgba(255,255,255,.98)', border: '1px solid rgba(15,23,42,.06)', color: '#111827', fontSize: 10 }}>{message}</div>}
                        </div>
                    </div>
                </div>

                <div style={sectionStyle}>
                    <div style={sectionTitleStyle}>Thông tin sản phẩm</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
                        <div>
                            <span style={formLabelStyle}>Mã hàng</span>
                            <input value={form.ma_hang} onChange={e => setField('ma_hang', e.target.value)} style={fieldStyle} placeholder="Nhập mã hàng" />
                        </div>
                        <div>
                            <span style={formLabelStyle}>NCC (Tên hàng)</span>
                            <input value={form.ncc} onChange={e => setField('ncc', e.target.value)} style={fieldStyle} placeholder="Nhập NCC hoặc tên hàng" />
                        </div>
                        <div style={{ gridColumn: '1 / -1' }}>
                            <span style={formLabelStyle}>Nhóm hàng</span>
                            {nhomHangNames.length > 0 ? (
                                <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 }}>
                                    {nhomHangNames.map(name => (
                                        <button
                                            key={name}
                                            type="button"
                                            onClick={() => setField('nhom_hang', name)}
                                            style={squareChoiceBtn(form.nhom_hang === name)}
                                        >
                                            {name}
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <div style={{ ...fieldStyle, color: '#94a3b8' }}>Chưa có nhóm hàng trong Cài đặt</div>
                            )}
                        </div>
                        <div>
                            <span style={formLabelStyle}>Quầy nhỏ</span>
                            <select value={form.quay_nho} onChange={e => setField('quay_nho', e.target.value)} style={fieldStyle}>
                                <option value="">-- Chọn quầy --</option>
                                {quayNhoList.map(q => <option key={q.id} value={q.ten_quay}>{q.ten_quay}</option>)}
                                {renderLegacyOption(form.quay_nho, quayNhoList.some(q => q.ten_quay === form.quay_nho))}
                            </select>
                        </div>
                        <div>
                            <span style={formLabelStyle}>Tuổi vàng</span>
                            <select value={form.tuoi_vang} onChange={e => setField('tuoi_vang', e.target.value)} style={fieldStyle}>
                                <option value="">-- Chọn tuổi vàng --</option>
                                {tuoiVangList.map(t => <option key={t.id} value={t.ten_tuoi}>{t.ten_tuoi}</option>)}
                                {renderLegacyOption(form.tuoi_vang, tuoiVangList.some(t => t.ten_tuoi === form.tuoi_vang))}
                            </select>
                        </div>
                        <div>
                            <span style={formLabelStyle}>Trạng thái</span>
                            <select value={form.status} onChange={e => setField('status', e.target.value)} style={fieldStyle}>
                                {STOCK_STATUS_OPTIONS.map(status => <option key={status} value={status}>{status}</option>)}
                            </select>
                        </div>
                    </div>
                </div>

                <InventoryWeightSection
                    form={form}
                    setField={setField}
                    fieldStyle={fieldStyle}
                    sectionStyle={sectionStyle}
                    sectionTitleStyle={sectionTitleStyle}
                    formLabelStyle={formLabelStyle}
                />
                <InventoryCostSection
                    form={form}
                    setField={setField}
                    fieldStyle={fieldStyle}
                    sectionStyle={sectionStyle}
                    sectionTitleStyle={sectionTitleStyle}
                    formLabelStyle={formLabelStyle}
                    giaVonTong={giaVonTong}
                />
            </div>

            <InventoryFooter
                actionBtn={actionBtn}
                handlePrintTem={handlePrintTem}
                resetAll={resetAll}
                saveItem={saveItem}
                saving={saving}
                checklistOpen={checklistOpen}
                checklistLoading={checklistLoading}
                nhapVangLists={nhapVangLists}
                selectedNhapPlan={selectedNhapPlan}
                selectedNhapItem={selectedNhapItem}
                setChecklistOpen={setChecklistOpen}
                selectChecklistPlan={selectChecklistPlan}
                selectChecklistItem={selectChecklistItem}
                updateChecklistProgress={updateChecklistProgress}
                setMessage={setMessage}
            />
        </div>
    );
}
