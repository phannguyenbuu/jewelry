import { IoRefreshOutline } from 'react-icons/io5';
import RepairLine from './RepairLine';
import { S, createRepairLine, formatWeight, parseWeight, today } from './shared';

export default function RepairJobScreen({
    inventoryItems,
    repairLines,
    setRepairLines,
    repairId,
    repairMode,
    setRepairMode,
    repairNote,
    setRepairNote,
    repairMessage,
    loading,
    onSubmit,
}) {
    const addLine = () => {
        setRepairLines(lines => [...lines, createRepairLine()]);
    };

    const updateLine = (id, patch) => setRepairLines(lines => lines.map(line => (line.id === id ? { ...line, ...patch } : line)));
    const removeLine = (id) => setRepairLines(lines => lines.filter(line => line.id !== id));
    const selectedLines = repairLines.filter(line => line.itemId);
    const totalAddedWeight = formatWeight(repairLines.reduce((sum, line) => sum + parseWeight(line.them_tl_vang), 0));
    const totalRemovedWeight = formatWeight(repairLines.reduce((sum, line) => sum + parseWeight(line.bot_tl_vang), 0));

    return (
        <div style={S.screen}>
            <div style={S.header}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                    <div>
                        <div style={S.sub}>MOBILE WORKFLOW</div>
                        <div data-sale-title="true" style={{ ...S.title, fontSize: 13 }}>Phiếu Sửa / Bỏ hàng</div>
                    </div>
                    <div style={{ ...S.iconBtn('#ffffff'), width: 44, height: 44, cursor: 'default' }}>
                        <IoRefreshOutline />
                    </div>
                </div>
            </div>

            <div style={S.scrollArea}>
                <div style={S.heroCard}>
                    <div style={S.heroBg} />
                    <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div>
                            <div data-sale-title="true" style={S.heroTitle}>Đưa hàng đi xử lý</div>
                            <div style={{ ...S.sub, fontSize: 10, marginTop: 8, color: '#475569', lineHeight: 1.5 }}>
                                Tạo phiếu cho thợ sửa hoặc bỏ hàng trực tiếp từ kho, không đi qua bước tính tiền.
                            </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span style={S.heroChip}>{repairId}</span>
                            <span style={{ ...S.sub, marginTop: 0, fontWeight: 700 }}>{today()}</span>
                        </div>
                    </div>
                </div>

                <div style={S.softPanel}>
                    <div style={{ fontSize: 11, fontWeight: 900, color: '#111827', marginBottom: 10 }}>Loại xử lý</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        {[
                            ['sua', 'Sửa'],
                            ['bo', 'Bỏ hàng luôn'],
                        ].map(([value, label]) => {
                            const active = repairMode === value;
                            return (
                                <label
                                    key={value}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 8,
                                        padding: '12px 14px',
                                        borderRadius: 16,
                                        border: active ? '1.5px solid #1d4ed8' : '1px solid #dbe4ee',
                                        background: active ? 'linear-gradient(135deg, #eff6ff, #dbeafe)' : 'rgba(255,255,255,.98)',
                                        color: active ? '#1d4ed8' : '#334155',
                                        fontSize: 11,
                                        fontWeight: 800,
                                        cursor: 'pointer',
                                    }}
                                >
                                    <input
                                        type="radio"
                                        name="repair-mode"
                                        value={value}
                                        checked={active}
                                        onChange={() => setRepairMode(value)}
                                        style={{ accentColor: '#1d4ed8' }}
                                    />
                                    <span>{label}</span>
                                </label>
                            );
                        })}
                    </div>
                    <div style={{ ...S.sub, marginTop: 8, lineHeight: 1.5 }}>
                        {repairMode === 'sua'
                            ? 'Phiếu sửa yêu cầu nhập thêm hoặc bớt trọng lượng vàng cho từng sản phẩm.'
                            : 'Phiếu bỏ hàng sẽ chuyển sản phẩm sang trạng thái đã bỏ và không yêu cầu chỉnh trọng lượng.'}
                    </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {repairLines.map(line => (
                        <RepairLine
                            key={line.id}
                            line={line}
                            inventoryItems={inventoryItems}
                            repairMode={repairMode}
                            onChange={patch => updateLine(line.id, patch)}
                            onRemove={() => removeLine(line.id)}
                            showRemove={repairLines.length > 1}
                        />
                    ))}
                </div>

                <button onClick={addLine} style={{ ...S.pillBtn('linear-gradient(135deg,#111827,#334155)'), justifyContent: 'center', width: '100%', padding: '11px 0', fontSize: 18 }}>
                    +
                </button>

                <div style={S.card}>
                    <span style={S.label}>Ghi chú phiếu</span>
                    <textarea
                        style={{ ...S.inp, minHeight: 88, resize: 'none', textAlign: 'left', padding: 10 }}
                        placeholder="Ghi chú chung cho phiếu sửa / bỏ hàng"
                        value={repairNote}
                        onChange={e => setRepairNote(e.target.value)}
                    />
                </div>
            </div>

            <div style={S.totalBar}>
                <div style={{ fontSize: 9, color: '#64748b', fontWeight: 700, marginBottom: 4 }}>TỔNG HỢP PHIẾU</div>
                <div data-sale-amount="true" style={{ fontSize: 20, fontWeight: 900, color: '#111827' }}>
                    {selectedLines.length} sản phẩm
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                    {repairMode === 'sua' ? (
                        <>
                            <div style={{ padding: '7px 10px', borderRadius: 999, background: '#dcfce7', color: '#166534', fontSize: 10, fontWeight: 800 }}>
                                Tổng thêm: {totalAddedWeight}
                            </div>
                            <div style={{ padding: '7px 10px', borderRadius: 999, background: '#fee2e2', color: '#b91c1c', fontSize: 10, fontWeight: 800 }}>
                                Tổng bớt: {totalRemovedWeight}
                            </div>
                        </>
                    ) : (
                        <div style={{ padding: '7px 10px', borderRadius: 999, background: '#fff7ed', color: '#9a3412', fontSize: 10, fontWeight: 800 }}>
                            Bỏ hàng không yêu cầu nhập trọng lượng
                        </div>
                    )}
                </div>
                <button
                    onClick={onSubmit}
                    disabled={loading}
                    style={{ ...S.pillBtn('linear-gradient(135deg,#111827,#0f172a)'), justifyContent: 'center', width: '100%', padding: '11px 0', fontSize: 11, marginTop: 10 }}
                >
                    {loading ? 'Đang gửi phiếu...' : repairMode === 'sua' ? 'Gửi phiếu sửa' : 'Gửi phiếu bỏ hàng'}
                </button>
                {repairMessage && <div style={{ marginTop: 8, fontSize: 10, color: '#6b7280' }}>{repairMessage}</div>}
            </div>
        </div>
    );
}

/* â”€â”€ Screen 2: PAYMENT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
