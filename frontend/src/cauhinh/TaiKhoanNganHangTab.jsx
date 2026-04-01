import { useEffect, useMemo, useState } from 'react';
import { IoAddOutline, IoCreateOutline, IoTrashOutline } from 'react-icons/io5';
import { BtnRow, ConfirmModal, Field, Modal, inp, readJsonSafe, readResponse, saveBtn } from './shared';
import {
    buildCompanyBankLabel,
    normalizeCompanyBankAccount,
    readCachedCompanyBankAccounts,
    requestCompanyBankAccounts,
    shouldTryLocalCompanyBankBackend,
    writeCachedCompanyBankAccounts,
} from '../lib/companyBankAccounts';
import { VIET_QR_BANKS, findVietQrBank, formatVietQrBankLabel, getVietQrBankLogoUrl } from '../sale/vietQrBanks';

const emptyForm = () => ({
    bank_code: '',
    bank_name: '',
    account_no: '',
    account_name: '',
    display_name: '',
    max_incoming_amount: '0',
    note: '',
});

const parseMoney = (value) => {
    const normalized = String(value || '').replace(/,/g, '').replace(/[^0-9-]/g, '').trim();
    const parsed = Number(normalized || 0);
    return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
};

const formatMoneyInput = (value) => {
    const amount = parseMoney(value);
    return amount ? amount.toLocaleString('en-US') : '0';
};

const normalizeForm = (form) => ({
    bank_code: String(form?.bank_code || '').trim().toUpperCase(),
    bank_name: String(form?.bank_name || '').trim(),
    account_no: String(form?.account_no || '').trim(),
    account_name: String(form?.account_name || '').trim(),
    display_name: String(form?.display_name || '').trim(),
    max_incoming_amount: String(parseMoney(form?.max_incoming_amount || 0)),
    note: String(form?.note || '').trim(),
});

const accountLabel = (item) => (
    buildCompanyBankLabel(item)
    || [item?.bank_name, item?.account_no].filter(Boolean).join(' - ')
    || 'Tài khoản ngân hàng'
);

const buildLocalCompanyBankId = () => (
    globalThis.crypto?.randomUUID?.()
    || `local-company-bank-${Date.now()}-${Math.round(Math.random() * 100000)}`
);

const shouldFallbackToLocalCrud = (response) => (
    shouldTryLocalCompanyBankBackend()
    && (!response || response.status === 404 || response.status >= 500)
);

export default function TaiKhoanNganHangTab() {
    const [list, setList] = useState([]);
    const [modal, setModal] = useState(null);
    const [confirm, setConfirm] = useState(null);
    const [form, setForm] = useState(emptyForm());
    const [submitting, setSubmitting] = useState(false);
    const [, setNotice] = useState('');

    const load = async () => {
        try {
            const response = await requestCompanyBankAccounts();
            const data = await readJsonSafe(response, { items: [] });
            if (response.ok) {
                const items = writeCachedCompanyBankAccounts(Array.isArray(data?.items) ? data.items : []);
                setList(items);
                setNotice('');
                return;
            }
            if (shouldFallbackToLocalCrud(response)) {
                const cached = readCachedCompanyBankAccounts();
                setList(cached);
                setNotice(cached.length
                    ? 'Dang dung danh sach tai khoan cong ty luu cuc bo tren may nay.'
                    : 'Backend chua co API tai khoan cong ty, ban co the tao danh sach cuc bo tren may nay.');
                return;
            }
            throw new Error(`HTTP ${response.status}`);
        } catch (error) {
            if (shouldTryLocalCompanyBankBackend()) {
                const cached = readCachedCompanyBankAccounts();
                setList(cached);
                setNotice(cached.length
                    ? 'Dang dung danh sach tai khoan cong ty luu cuc bo tren may nay.'
                    : 'Khong tai duoc danh sach tai khoan cong ty tu server.');
                return;
            }
            throw error;
        }
    };

    useEffect(() => {
        load().catch(() => {
            setNotice('Khong tai duoc danh sach tai khoan ngan hang.');
        });
    }, []);

    const sortedList = useMemo(() => (
        [...list].sort((left, right) => accountLabel(left).localeCompare(accountLabel(right), 'vi'))
    ), [list]);

    const openCreate = () => {
        setForm(emptyForm());
        setModal('add');
    };

    const openEdit = (item) => {
        setForm({
            bank_code: item.bank_code || '',
            bank_name: item.bank_name || '',
            account_no: item.account_no || '',
            account_name: item.account_name || '',
            display_name: item.display_name || '',
            max_incoming_amount: formatMoneyInput(item.max_incoming_amount || 0),
            note: item.note || '',
        });
        setModal(item);
    };

    const handleBankChange = (bankCode) => {
        const bank = findVietQrBank(bankCode);
        setForm((prev) => ({
            ...prev,
            bank_code: bank?.code || String(bankCode || '').trim().toUpperCase(),
            bank_name: bank?.shortName || bank?.name || prev.bank_name || '',
        }));
    };

    const saveLocalItem = (payload, isEdit) => {
        const existingItem = modal && modal !== 'add' ? modal : {};
        const nextItem = normalizeCompanyBankAccount({
            ...existingItem,
            ...payload,
            id: isEdit ? existingItem.id : buildLocalCompanyBankId(),
            created_at: existingItem.created_at || '',
        });
        const nextList = isEdit
            ? list.map((item) => (item.id === existingItem.id ? nextItem : item))
            : [...list, nextItem];
                const normalizedList = writeCachedCompanyBankAccounts(nextList);
                setList(normalizedList);
                setModal(null);
                setNotice(isEdit
            ? 'Đã cập nhật tài khoản ngân hàng trong cấu hình cục bộ.'
            : 'Đã thêm tài khoản ngân hàng vào cấu hình cục bộ.');
    };

    const save = async (event) => {
        event.preventDefault();
        setSubmitting(true);
        try {
            const payload = normalizeForm(form);
            const isEdit = modal && modal !== 'add';
            let response = null;
            try {
                response = await requestCompanyBankAccounts(
                    isEdit ? modal.id : '',
                    {
                        method: isEdit ? 'PUT' : 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload),
                    },
                );
            } catch (error) {
                if (!shouldTryLocalCompanyBankBackend()) throw error;
            }

            if (response?.ok) {
                const result = await readResponse(response);
                const items = writeCachedCompanyBankAccounts(Array.isArray(result?.items) ? result.items : []);
                setList(items);
                setModal(null);
                setNotice(isEdit ? 'Đã cập nhật tài khoản ngân hàng.' : 'Đã thêm tài khoản ngân hàng.');
                return;
            }

            if (shouldFallbackToLocalCrud(response)) {
                saveLocalItem(payload, isEdit);
                return;
            }

            if (response) {
                await readResponse(response);
            }
        } catch (error) {
            window.alert(error.message);
        } finally {
            setSubmitting(false);
        }
    };

    const confirmDelete = async () => {
        if (!confirm) return;
        try {
            let response = null;
            try {
                response = await requestCompanyBankAccounts(confirm.id, { method: 'DELETE' });
            } catch (error) {
                if (!shouldTryLocalCompanyBankBackend()) throw error;
            }

            if (response?.ok) {
                const result = await readResponse(response);
                const items = writeCachedCompanyBankAccounts(Array.isArray(result?.items) ? result.items : []);
                setList(items);
                setNotice(`Đã xóa ${accountLabel(confirm)}.`);
                setConfirm(null);
                return;
            }

            if (shouldFallbackToLocalCrud(response)) {
                const nextList = list.filter((item) => item.id !== confirm.id);
                const normalizedList = writeCachedCompanyBankAccounts(nextList);
                setList(normalizedList);
                setNotice(`Đã xóa ${accountLabel(confirm)} khỏi cấu hình cục bộ.`);
                setConfirm(null);
                return;
            }

            if (response) {
                await readResponse(response);
            }
        } catch (error) {
            window.alert(error.message);
        }
    };

    return (
        <>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
                <button onClick={openCreate} style={{ ...saveBtn, padding: '8px 18px', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <IoAddOutline />
                    <span>Thêm tài khoản</span>
                </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 14 }}>
                {sortedList.length === 0 ? (
                    <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e2e8f0', padding: 24, color: '#94a3b8', textAlign: 'center' }}>
                        Chưa có tài khoản ngân hàng nào.
                    </div>
                ) : sortedList.map((item) => {
                    const bank = findVietQrBank(item.bank_code || item.bank_name);
                    const bankLabel = bank ? formatVietQrBankLabel(bank) : (item.bank_code || item.bank_name || 'Ngân hàng');
                    const maxIncomingText = Number(item.max_incoming_amount || 0) > 0
                        ? Number(item.max_incoming_amount || 0).toLocaleString('vi-VN')
                        : 'Không giới hạn';
                    return (
                        <div key={item.id || item.ledger_key || item.account_no} style={{ background: 'white', borderRadius: 12, border: '1px solid #e2e8f0', padding: 18, boxShadow: '0 1px 4px rgba(0,0,0,.04)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
                                <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', minWidth: 0 }}>
                                    <div style={{ width: 54, height: 54, borderRadius: 14, border: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                        {bank ? (
                                            <img src={getVietQrBankLogoUrl(bank)} alt={bank.shortName} style={{ width: 34, height: 34, objectFit: 'contain' }} />
                                        ) : (
                                            <span style={{ fontSize: 18, fontWeight: 800, color: '#334155' }}>NH</span>
                                        )}
                                    </div>
                                    <div style={{ minWidth: 0 }}>
                                        <div style={{ fontWeight: 800, fontSize: 15, color: '#1e293b' }}>{accountLabel(item)}</div>
                                        <div style={{ fontSize: 12, color: '#64748b', marginTop: 3 }}>{bankLabel}</div>
                                        <div style={{ fontSize: 12, color: '#334155', marginTop: 6 }}>Số tài khoản: <b>{item.account_no}</b></div>
                                        {item.account_name ? <div style={{ fontSize: 12, color: '#334155', marginTop: 2 }}>Chủ tài khoản: {item.account_name}</div> : null}
                                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                                            <span style={{ fontSize: 11, color: '#2563eb', background: '#dbeafe', borderRadius: 999, padding: '4px 9px', fontWeight: 700 }}>
                                                Nhận tối đa: {maxIncomingText}
                                            </span>
                                            <span style={{ fontSize: 11, color: '#0f766e', background: '#ccfbf1', borderRadius: 999, padding: '4px 9px', fontWeight: 700 }}>
                                                Ledger: {item.ledger_key}
                                            </span>
                                        </div>
                                        {item.note ? <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 8 }}>Ghi chú: {item.note}</div> : null}
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                                    <button
                                        type="button"
                                        onClick={() => openEdit(item)}
                                        title="Sửa"
                                        aria-label="Sửa"
                                        style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid #cbd5e1', background: 'white', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb' }}
                                    >
                                        <IoCreateOutline />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setConfirm(item)}
                                        title="Xóa"
                                        aria-label="Xóa"
                                        style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid #fca5a5', background: '#fff1f2', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#dc2626' }}
                                    >
                                        <IoTrashOutline />
                                    </button>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            <Modal open={!!modal} onClose={() => setModal(null)} title={modal === 'add' ? 'Thêm tài khoản ngân hàng' : 'Sửa tài khoản ngân hàng'} maxWidth={620}>
                <form onSubmit={save}>
                    <Field label="Ngân hàng *">
                        <select
                            required
                            style={inp}
                            value={form.bank_code || ''}
                            onChange={(event) => handleBankChange(event.target.value)}
                        >
                            <option value="">-- Chọn ngân hàng --</option>
                            {VIET_QR_BANKS.map((bank) => (
                                <option key={bank.code} value={bank.code}>
                                    {formatVietQrBankLabel(bank)}
                                </option>
                            ))}
                        </select>
                    </Field>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
                        <Field label="Tên ngân hàng">
                            <input
                                style={inp}
                                value={form.bank_name || ''}
                                onChange={(event) => setForm((prev) => ({ ...prev, bank_name: event.target.value }))}
                                placeholder="VD: BIDV"
                            />
                        </Field>
                        <Field label="Số tài khoản *">
                            <input
                                required
                                style={inp}
                                value={form.account_no || ''}
                                onChange={(event) => setForm((prev) => ({ ...prev, account_no: event.target.value.replace(/\s+/g, '') }))}
                                placeholder="Nhập số tài khoản"
                            />
                        </Field>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
                        <Field label="Chủ tài khoản">
                            <input
                                style={inp}
                                value={form.account_name || ''}
                                onChange={(event) => setForm((prev) => ({ ...prev, account_name: event.target.value }))}
                                placeholder="VD: CÔNG TY VẠN KIM"
                            />
                        </Field>
                        <Field label="Tên hiển thị">
                            <input
                                style={inp}
                                value={form.display_name || ''}
                                onChange={(event) => setForm((prev) => ({ ...prev, display_name: event.target.value }))}
                                placeholder="VD: BIDV cty Vạn Kim"
                            />
                        </Field>
                    </div>

                    <Field label="Số tiền nhận 1 lần tối đa">
                        <input
                            style={inp}
                            inputMode="numeric"
                            value={form.max_incoming_amount || '0'}
                            onChange={(event) => setForm((prev) => ({
                                ...prev,
                                max_incoming_amount: event.target.value.replace(/,/g, '').replace(/[^0-9]/g, ''),
                            }))}
                            onBlur={() => setForm((prev) => ({
                                ...prev,
                                max_incoming_amount: formatMoneyInput(prev.max_incoming_amount || 0),
                            }))}
                            placeholder="0 = không giới hạn"
                        />
                    </Field>

                    <Field label="Ghi chú">
                        <textarea
                            style={{ ...inp, minHeight: 82, resize: 'vertical' }}
                            value={form.note || ''}
                            onChange={(event) => setForm((prev) => ({ ...prev, note: event.target.value }))}
                            placeholder="Thông tin thêm về tài khoản"
                        />
                    </Field>

                    <BtnRow onClose={() => setModal(null)} label={submitting ? 'Đang lưu...' : (modal === 'add' ? 'Tạo mới' : 'Lưu thay đổi')} />
                </form>
            </Modal>

            <ConfirmModal
                open={!!confirm}
                onClose={() => setConfirm(null)}
                onConfirm={confirmDelete}
                message={`Xác nhận xóa ${accountLabel(confirm)}?`}
            />
        </>
    );
}
