import pdfplumber, os, json

pdf_path = os.path.expanduser(r"~\Downloads\1.pdf")
with pdfplumber.open(pdf_path) as pdf:
    page = pdf.pages[0]
    tables = page.extract_tables()
    result = tables[0][:8] if tables else []
    with open("sample_rows.json", "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
print("Done")
