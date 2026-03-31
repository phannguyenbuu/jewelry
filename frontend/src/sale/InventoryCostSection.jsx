import { fmtVN } from './shared';

export default function InventoryCostSection({
    form,
    setField,
    fieldStyle,
    sectionStyle,
    sectionTitleStyle,
    formLabelStyle,
    giaVonTong,
}) {
    return (
        <div style={sectionStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
                <div style={sectionTitleStyle}>Giá mua (giá vốn)</div>
                {giaVonTong > 0 && (
                    <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 999, padding: '4px 10px', fontSize: 11, fontWeight: 800, color: '#15803d' }}>
                        {fmtVN(giaVonTong)} ₫
                    </div>
                )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
                <div>
                    <span style={formLabelStyle}>Giá vàng mua</span>
                    <input type="number" value={form.gia_vang_mua} onChange={e => setField('gia_vang_mua', e.target.value)} style={fieldStyle} placeholder="Giá vàng mua / chỉ" />
                </div>
                <div>
                    <span style={formLabelStyle}>Giá hạt</span>
                    <input type="number" value={form.gia_hat} onChange={e => setField('gia_hat', e.target.value)} style={fieldStyle} placeholder="Giá hạt / đá" />
                </div>
                <div>
                    <span style={formLabelStyle}>Giá nhân công</span>
                    <input type="number" value={form.gia_nhan_cong} onChange={e => setField('gia_nhan_cong', e.target.value)} style={fieldStyle} placeholder="Giá nhân công" />
                </div>
                <div>
                    <span style={formLabelStyle}>Điều chỉnh</span>
                    <input type="number" value={form.dieu_chinh} onChange={e => setField('dieu_chinh', e.target.value)} style={fieldStyle} placeholder="Điều chỉnh +/-" />
                </div>
            </div>
        </div>
    );
}
