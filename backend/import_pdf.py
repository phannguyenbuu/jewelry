import os
from pdfminer.high_level import extract_text

pdf_path = os.path.expanduser(r"~\Downloads\1.pdf")
text = extract_text(pdf_path)

with open('pdf_data.txt', 'w', encoding='utf-8') as f:
    f.write(text)
print("Extracted text successfully.")
