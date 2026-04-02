import FormattedNumberInput from './FormattedNumberInput';
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
                    <FormattedNumberInput
                        value={form.gia_vang_mua}
                        onValueChange={value => setField('gia_vang_mua', value)}
                        style={fieldStyle}
                        placeholder="Giá vàng mua / chỉ"
                    />
                </div>
                <div>
                    <span style={formLabelStyle}>Giá hạt</span>
                    <FormattedNumberInput
                        value={form.gia_hat}
                        onValueChange={value => setField('gia_hat', value)}
                        style={fieldStyle}
                        placeholder="Giá hạt / đá"
                    />
                </div>
                <div>
                    <span style={formLabelStyle}>Giá nhân công</span>
                    <FormattedNumberInput
                        value={form.gia_nhan_cong}
                        onValueChange={value => setField('gia_nhan_cong', value)}
                        style={fieldStyle}
                        placeholder="Giá nhân công"
                    />
                </div>
                <div>
                    <span style={formLabelStyle}>Điều chỉnh</span>
                    <FormattedNumberInput
                        value={form.dieu_chinh}
                        onValueChange={value => setField('dieu_chinh', value)}
                        allowNegative
                        style={fieldStyle}
                        placeholder="Điều chỉnh +/-"
                    />
                </div>
            </div>
        </div>
    );
}
