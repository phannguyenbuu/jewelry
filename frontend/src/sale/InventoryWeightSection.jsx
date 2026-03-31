export default function InventoryWeightSection({ form, setField, fieldStyle, sectionStyle, sectionTitleStyle, formLabelStyle }) {
    return (
        <div style={sectionStyle}>
            <div style={sectionTitleStyle}>Trọng lượng và công</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
                <div>
                    <span style={formLabelStyle}>Tổng TL</span>
                    <input value={form.tong_tl} onChange={e => setField('tong_tl', e.target.value)} style={fieldStyle} placeholder="Tổng trọng lượng" />
                </div>
                <div>
                    <span style={formLabelStyle}>TL đá</span>
                    <input value={form.tl_da} onChange={e => setField('tl_da', e.target.value)} style={fieldStyle} placeholder="Trọng lượng đá" />
                </div>
                <div>
                    <span style={formLabelStyle}>TL vàng</span>
                    <input value={form.tl_vang} onChange={e => setField('tl_vang', e.target.value)} style={fieldStyle} placeholder="Trọng lượng vàng" />
                </div>
                <div>
                    <span style={formLabelStyle}>Công lẻ</span>
                    <input value={form.cong_le} onChange={e => setField('cong_le', e.target.value)} style={fieldStyle} placeholder="Công lẻ" />
                </div>
            </div>
        </div>
    );
}
