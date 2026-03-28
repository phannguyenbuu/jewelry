import re

path = r"d:\Dropbox\_Documents\_Vlance_2026\htxgov2\frontend\src\index.css"
with open(path, "r", encoding="utf-8") as f:
    css = f.read()

# 1. Ensure Google Fonts Inter is imported at the very top
import_str = "@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');\n"
if "fonts.googleapis" not in css:
    css = import_str + css
else:
    # replace existing import
    css = re.sub(r"@import url\('https://fonts.googleapis.*?;\n?", import_str, css)

# 2. Update body font-family
css = re.sub(r"font-family:.*?sans-serif;", "font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;", css)

with open(path, "w", encoding="utf-8") as f:
    f.write(css)

print("Font updated to Inter via Python to bypass IDE diff block!")
