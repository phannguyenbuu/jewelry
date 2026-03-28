import os

path = r"d:\Dropbox\_Documents\_Vlance_2026\htxgov2\frontend\src\index.css"
with open(path, "a", encoding="utf-8") as f:
    f.write("\n\n/* Global Form Elements Inherit Font */\nbutton, input, textarea, select { font-family: inherit; }\n")

print("Appended button font-family inherit to index.css")
