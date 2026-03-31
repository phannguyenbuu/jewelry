import { DocUploadSection, Field, LOAI_LAI, LOAI_TRA, STATUS, buildSchedule, fmt, fmtB, inp } from './shared';

export default function LoanForm({ form, setForm, onSubmit, onClose, isEdit }) {
    const effRate = form.loai_lai === 'tha_noi'
        ? (parseFloat(form.lai_co_so || 0) + parseFloat(form.bien_do || 0)).toFixed(2)
        : form.lai_suat_ht;

    const schedule = buildSchedule({
        so_tien_vay: +form.so_tien_vay || 0,
        lai_suat_ht: +effRate || 0,
        ky_han_thang: +form.ky_han_thang || 0,
        loai_tra_no: form.loai_tra_no,
        ngay_bat_dau: form.ngay_bat_dau,
    });
    const firstRow = schedule[0];

    return (
        <form onSubmit={onSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
                <Field label="Mã hợp đồng *">
                    <input required style={inp} value={form.ma_hd} onChange={e => setForm({ ...form, ma_hd: e.target.value })} placeholder="VD: VCB-2026-001" />
                </Field>
                <Field label="Ngân hàng *">
                    <input required style={inp} value={form.ngan_hang} onChange={e => setForm({ ...form, ngan_hang: e.target.value })} placeholder="VD: Vietcombank" />
                </Field>
                <Field label="Số tiền vay (₫) *">
                    <input required type="number" style={inp} value={form.so_tien_vay} onChange={e => setForm({ ...form, so_tien_vay: e.target.value })} placeholder="VD: 5000000000" />
                    {form.so_tien_vay > 0 && <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>= {fmtB(+form.so_tien_vay)}</div>}
                </Field>
                <Field label="Phí ban đầu (₫)">
                    <input type="number" style={inp} value={form.phi_ban_dau} onChange={e => setForm({ ...form, phi_ban_dau: e.target.value })} placeholder="0" />
                </Field>
                <Field label="Loại lãi suất">
                    <select style={inp} value={form.loai_lai} onChange={e => setForm({ ...form, loai_lai: e.target.value })}>
                        <option value="co_dinh">Cố định</option>
                        <option value="tha_noi">Thả nổi (Base + Margin)</option>
                    </select>
                </Field>
                {form.loai_lai === 'tha_noi' ? (<>
                    <Field label="Lãi cơ sở %/năm">
                        <input type="number" step="0.01" style={inp} value={form.lai_co_so} onChange={e => setForm({ ...form, lai_co_so: e.target.value, lai_suat_ht: (parseFloat(e.target.value || 0) + parseFloat(form.bien_do || 0)).toFixed(2) })} />
                    </Field>
                    <Field label="Biên độ (Margin) %/năm">
                        <input type="number" step="0.01" style={inp} value={form.bien_do} onChange={e => setForm({ ...form, bien_do: e.target.value, lai_suat_ht: (parseFloat(form.lai_co_so || 0) + parseFloat(e.target.value || 0)).toFixed(2) })} />
                    </Field>
                    <Field label="Lãi suất hiệu lực (tự tính)">
                        <div style={{ ...inp, background: '#f0fdf4', color: '#15803d', fontWeight: 700, display: 'flex', alignItems: 'center' }}>{effRate}%/năm</div>
                    </Field>
                </>) : (
                    <Field label="Lãi suất %/năm *">
                        <input required type="number" step="0.01" style={inp} value={form.lai_suat_ht} onChange={e => setForm({ ...form, lai_suat_ht: e.target.value })} placeholder="VD: 9.5" />
                    </Field>
                )}
                <Field label="Kỳ hạn (tháng)">
                    <input type="number" style={inp} value={form.ky_han_thang} onChange={e => setForm({ ...form, ky_han_thang: e.target.value })} />
                </Field>
                <Field label="Hình thức trả nợ">
                    <select style={inp} value={form.loai_tra_no} onChange={e => setForm({ ...form, loai_tra_no: e.target.value })}>
                        {Object.entries(LOAI_TRA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                </Field>
                <Field label="Ngày giải ngân (dd/mm/yyyy)">
                    <input style={inp} value={form.ngay_giai_ngan} onChange={e => setForm({ ...form, ngay_giai_ngan: e.target.value })} placeholder="20/03/2026" />
                </Field>
                <Field label="Ngày bắt đầu tính lãi">
                    <input style={inp} value={form.ngay_bat_dau} onChange={e => setForm({ ...form, ngay_bat_dau: e.target.value })} placeholder="20/03/2026" />
                </Field>
                <Field label="Ngày tất toán dự kiến">
                    <input style={inp} value={form.ngay_tat_toan} onChange={e => setForm({ ...form, ngay_tat_toan: e.target.value })} placeholder="20/03/2028" />
                </Field>
                <Field label="Phạt trả trước (%)">
                    <input type="number" step="0.1" style={inp} value={form.phi_tra_truoc} onChange={e => setForm({ ...form, phi_tra_truoc: e.target.value })} placeholder="0" />
                </Field>
                <Field label="Trạng thái">
                    <select style={inp} value={form.trang_thai} onChange={e => setForm({ ...form, trang_thai: e.target.value })}>
                        {Object.entries(STATUS).map(([k, { label }]) => <option key={k} value={k}>{label}</option>)}
                    </select>
                </Field>
            </div>

            {/* Tài sản đảm bảo */}
            <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 16, marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 10, letterSpacing: .4 }}>🏠 TÀI SẢN ĐẢM BẢO & MỤC ĐÍCH</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    <Field label="Tài sản đảm bảo">
                        <textarea style={{ ...inp, height: 70, resize: 'vertical' }} value={form.tai_san_dam_bao} onChange={e => setForm({ ...form, tai_san_dam_bao: e.target.value })} placeholder="VD: QSDĐ 500m² tại số 11 Lê Thị Pha..." />
                    </Field>
                    <Field label="Mục đích vay">
                        <textarea style={{ ...inp, height: 70, resize: 'vertical' }} value={form.muc_dich} onChange={e => setForm({ ...form, muc_dich: e.target.value })} placeholder="VD: Bổ sung vốn lưu động..." />
                    </Field>
                </div>
            </div>

            {/* Covenant */}
            <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 16, marginBottom: 16 }}>
                <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: .4 }}>📊 CAM KẾT TÀI CHÍNH (COVENANT)</div>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>Các ngưỡng tài chính ngân hàng yêu cầu duy trì — vi phạm có thể bị thu hồi nợ trước hạn</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
                    <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 3, textTransform: 'uppercase', letterSpacing: .5 }}>DSCR tối thiểu</div>
                        <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 6 }}>Khả năng trả nợ từ lợi nhuận · phải ≥ ngưỡng</div>
                        <input type="number" step="0.1" style={inp} value={form.dscr_min} onChange={e => setForm({ ...form, dscr_min: e.target.value })} />
                    </div>
                    <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 3, textTransform: 'uppercase', letterSpacing: .5 }}>D/E tối đa</div>
                        <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 6 }}>Đòn bẩy tài chính (Nợ / Vốn CSH) · phải ≤ ngưỡng</div>
                        <input type="number" step="0.1" style={inp} value={form.de_ratio_max} onChange={e => setForm({ ...form, de_ratio_max: e.target.value })} />
                    </div>
                    <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 3, textTransform: 'uppercase', letterSpacing: .5 }}>EBITDA / tháng (₫)</div>
                        <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 6 }}>Lợi nhuận trước thuế + khấu hao · dùng tính DSCR</div>
                        <input type="number" style={inp} value={form.ebitda_thang} onChange={e => setForm({ ...form, ebitda_thang: e.target.value })} placeholder="0" />
                    </div>
                    <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 3, textTransform: 'uppercase', letterSpacing: .5 }}>Vốn chủ sở hữu (₫)</div>
                        <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 6 }}>Tổng vốn CSH hiện tại · dùng tính tỷ lệ D/E</div>
                        <input type="number" style={inp} value={form.von_chu_so_huu} onChange={e => setForm({ ...form, von_chu_so_huu: e.target.value })} placeholder="0" />
                    </div>
                </div>
            </div>

            {/* Preview lịch trả kỳ 1 */}
            {firstRow && (
                <div style={{ background: '#f0fdf4', borderRadius: 10, padding: '12px 16px', marginBottom: 16, border: '1px solid #bbf7d0' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#15803d', marginBottom: 6 }}>📅 DỰ KIẾN KỲ 1 ({firstRow.ngay_tra})</div>
                    <div style={{ display: 'flex', gap: 24, fontSize: 13 }}>
                        <span>Gốc: <strong>{fmt(firstRow.tien_goc)} ₫</strong></span>
                        <span>Lãi: <strong style={{ color: '#dc2626' }}>{fmt(firstRow.tien_lai)} ₫</strong></span>
                        <span>Tổng: <strong style={{ color: '#1d4ed8' }}>{fmt(firstRow.tong_tra)} ₫</strong></span>
                    </div>
                </div>
            )}

            <Field label="Ghi chú">
                <textarea style={{ ...inp, height: 60, resize: 'vertical' }} value={form.ghi_chu} onChange={e => setForm({ ...form, ghi_chu: e.target.value })} />
            </Field>

            {/* ── CHỨNG TỪ ĐÍNH KÈM ── */}
            <DocUploadSection docs={form.chung_tu || []} onChange={docs => setForm({ ...form, chung_tu: docs })} />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
                <button type="button" onClick={onClose} style={{ padding: '9px 22px', borderRadius: 8, border: '1.5px solid #e2e8f0', background: 'white', cursor: 'pointer', fontSize: 13 }}>Hủy</button>
                <button type="submit" style={{ padding: '9px 22px', borderRadius: 8, border: 'none', background: '#1e293b', color: 'white', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                    {isEdit ? 'Lưu thay đổi' : 'Tạo khoản vay'}
                </button>
            </div>
        </form>
    );
}

// ═══════════════════════════════════════════════════════════════════════
