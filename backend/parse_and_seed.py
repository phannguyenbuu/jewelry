"""
Re-import ALL items from ~/Downloads/1.pdf into the database.
Clears old data first, then inserts fresh parsed records.
"""
import os, re, sys
import pdfplumber

# Add backend dir to path so we can import app
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from app_jewelry import app, db, Item

def clean(s):
    if s is None: return ''
    return str(s).strip()

def parse_price(s):
    """Extract numeric price embedded in messy strings like 'ng trắ3n9g0' => '390'"""
    if s is None: return ''
    # Remove all non-digit, non-dot, non-comma characters
    digits = re.sub(r'[^\d,\.]', '', str(s))
    digits = digits.replace(',', '')
    return digits if digits else ''

def parse_tl(s):
    """Extract decimal weight value like '0.727'"""
    if s is None: return ''
    m = re.search(r'\d+\.\d+', str(s))
    return m.group(0) if m else clean(s)

def extract_ncc(col2, col3):
    """
    pdfplumber splits NCC across col2 and col3 for some rows.
    e.g. col2='Mặt kiể', col3='uM kếặtt tấm' => combine and clean
    We combine both then strip internal glitches.
    """
    combined = clean(col2) + clean(col3)
    # Remove duplicate character artifacts (common in merged PDF cells)
    return combined

def extract_quay_cong_le(col4, col5):
    """
    col4='M3 - Khay Mặt và', col5='ng trắ3n9g0'
    Quầy nhỏ is the prefix, Công lẻ is the embedded number.
    """
    quay = clean(col4) + clean(col5)
    # Extract price (last digits before end)
    price_match = re.search(r'(\d{3,5})\s*$', quay.replace(',', '').replace('.', ''))
    cong_le = price_match.group(1) if price_match else ''
    # Quây nhỏ = everything before the embedded price
    if cong_le:
        quay_clean = quay[:quay.rfind(cong_le)].rstrip()
    else:
        quay_clean = quay
    return quay_clean, cong_le

pdf_path = os.path.expanduser(r"~\Downloads\1.pdf")

all_rows = []
current_loai_vang = ''

with pdfplumber.open(pdf_path) as pdf:
    for page in pdf.pages:
        for table in page.extract_tables():
            for row in table:
                if not row or len(row) < 10:
                    continue
                col0 = clean(row[0])
                # Detect section header like "Loại vàng:416"
                if col0.startswith('Lo') and row[1] is None:
                    m = re.search(r'(\d+)', col0)
                    if m: current_loai_vang = m.group(1)
                    continue
                # Skip header row
                if col0.strip().upper() in ('STT', '') or 'mã' in col0.lower():
                    continue
                # Skip if STT is not a number
                if not re.match(r'^\d+$', col0.strip()):
                    continue

                ma_hang   = clean(row[1])
                if not ma_hang: continue

                # NCC: col2 + col3 merged
                ncc_raw   = clean(row[2]) + clean(row[3])
                # Clean NCC: remove duplicate chars / garbled
                # Better: use the text-extracted pdf_data.txt approach in a lookup, but here we best-effort
                ncc = ncc_raw

                # Quầy nhỏ and Công lẻ are merged between col4 and col5
                quay_nho, cong_le = extract_quay_cong_le(row[4], row[5])

                cong_si   = parse_tl(row[6])
                tong_tl   = parse_tl(row[7])
                tl_da     = parse_tl(row[8])
                tl_vang   = parse_tl(row[9])

                all_rows.append({
                    'ma_hang':   ma_hang,
                    'ncc':       ncc,
                    'nhom_hang': '',  # not reliably extractable from merged PDF
                    'quay_nho':  quay_nho,
                    'cong_le':   cong_le,
                    'cong_si':   cong_si,
                    'tong_tl':   tong_tl,
                    'tl_da':     tl_da,
                    'tl_vang':   tl_vang,
                    'loai_vang': current_loai_vang,
                    'status':    'Tồn kho',
                })

import sys
sys.stdout.reconfigure(encoding='utf-8')
print(f"Parsed {len(all_rows)} rows from PDF.")
if all_rows:
    print("Sample:", all_rows[0])

# Now cross-reference with the plain-text extracted data to get clean NCC/Nhom
# We already have pdf_data.txt with clean text - parse it to build a ma_hang -> name map
txt_path = os.path.join(os.path.dirname(__file__), 'pdf_data.txt')
name_map = {}
nhom_map = {}

if os.path.exists(txt_path):
    with open(txt_path, encoding='utf-8') as f:
        lines = [l.strip() for l in f.readlines()]

    i = 0
    while i < len(lines):
        line = lines[i]
        # Pattern: a line starting with a code like 1M700014 followed by name
        m = re.match(r'^(\d[A-Z0-9]+)\s+(.+)', line)
        if m:
            code = m.group(1)
            rest = m.group(2).strip()
            # Next non-empty line is often Nhóm hàng
            j = i + 1
            while j < len(lines) and lines[j] == '': j += 1
            nhom = lines[j] if j < len(lines) and lines[j] not in ('M3 - Khay Mặt vàng trắng',) else ''
            name_map[code] = rest
            nhom_map[code] = nhom if nhom and len(nhom) < 60 else ''
        i += 1

print(f"Name map has {len(name_map)} entries.")

# Enrich rows with clean NCC/nhom from text
for row in all_rows:
    code = row['ma_hang']
    if code in name_map:
        row['ncc'] = name_map[code]
    if code in nhom_map and nhom_map[code]:
        row['nhom_hang'] = nhom_map[code]

with app.app_context():
    # Clear all existing items
    Item.query.delete()
    db.session.commit()

    for row in all_rows:
        it = Item(
            ma_hang   = row['ma_hang'],
            ncc       = row['ncc'],
            nhom_hang = row['nhom_hang'],
            quay_nho  = row['quay_nho'],
            cong_le   = row['cong_le'],
            cong_si   = row['cong_si'],
            tong_tl   = row['tong_tl'],
            tl_da     = row['tl_da'],
            tl_vang   = row['tl_vang'],
            loai_vang = row['loai_vang'],
            status    = row['status'],
        )
        db.session.add(it)
    db.session.commit()
    print(f"Successfully inserted {len(all_rows)} items into DB.")
