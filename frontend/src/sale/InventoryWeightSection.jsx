import FormattedNumberInput from './FormattedNumberInput';

export default function InventoryWeightSection({ form, setField, fieldStyle, sectionStyle, sectionTitleStyle, formLabelStyle }) {
    return (
        <div style={sectionStyle}>
            <div style={sectionTitleStyle}>Trọng lượng và công</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
                <div>
                    <span style={formLabelStyle}>Tổng TL</span>
                    <FormattedNumberInput
                        value={form.tong_tl}
                        onValueChange={value => setField('tong_tl', value)}
                        style={fieldStyle}
                        inputMode="decimal"
                        allowDecimal
                        maxDecimals={4}
                        placeholder="Tổng trọng lượng"
                    />
                </div>
                <div>
                    <span style={formLabelStyle}>TL đá</span>
                    <FormattedNumberInput
                        value={form.tl_da}
                        onValueChange={value => setField('tl_da', value)}
                        style={fieldStyle}
                        inputMode="decimal"
                        allowDecimal
                        maxDecimals={4}
                        placeholder="Trọng lượng đá"
                    />
                </div>
                <div>
                    <span style={formLabelStyle}>TL vàng</span>
                    <FormattedNumberInput
                        value={form.tl_vang}
                        onValueChange={value => setField('tl_vang', value)}
                        style={fieldStyle}
                        inputMode="decimal"
                        allowDecimal
                        maxDecimals={4}
                        placeholder="Trọng lượng vàng"
                    />
                </div>
                <div>
                    <span style={formLabelStyle}>Công lẻ</span>
                    <FormattedNumberInput
                        value={form.cong_le}
                        onValueChange={value => setField('cong_le', value)}
                        style={fieldStyle}
                        placeholder="Công lẻ"
                    />
                </div>
            </div>
        </div>
    );
}
