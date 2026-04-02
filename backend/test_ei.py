import sys
import os
import json
import urllib.parse
from flask import Flask
from jewelry_backend.state import app, db
from jewelry_backend.setup_base import MIGRATED_DB_URL
from jewelry_backend.orders_routes import _easyinvoice_config
from jewelry_backend.easyinvoice_web_routes import _easyinvoice_web_try_auto_login, _easyinvoice_web_perform_remote_request

app.config['SQLALCHEMY_DATABASE_URI'] = MIGRATED_DB_URL
db.init_app(app)

with app.app_context():
    config = _easyinvoice_config()
    pattern = config.get("pattern")
    print(f"Pattern: {pattern}")
    
    # login
    login_result = _easyinvoice_web_try_auto_login(pattern)
    auth = login_result.get("auth")
    if not auth:
        print("Login failed:", login_result)
        sys.exit(1)
        
    print("Login OK!")
    
    # check if /EInvoice/SearchData works
    form_data = urllib.parse.urlencode({
        "FromDate": "01/01/2026",
        "ToDate": "31/12/2026",
        "Keyword": "",
        "InvoiceType": "1"
    }).encode("utf-8")
    
    headers = {
        "Content-Type": "application/x-www-form-urlencoded"
    }
    html_status, req_headers, body, url = _easyinvoice_web_perform_remote_request(
        auth, "https://5800884170.easyinvoice.com.vn/EInvoice/SearchData", 
        method="POST", headers=headers, data=form_data
    )
    
    with open("ei_search_result.html", "wb") as f:
        f.write(body)
        
    print(f"Status: {html_status}, wrote ei_search_result.html")
    
    # Try fetching the first page html
    html_status2, req_headers2, body2, url2 = _easyinvoice_web_perform_remote_request(
        auth, "https://5800884170.easyinvoice.com.vn/EInvoice", method="GET"
    )
    with open("ei_index.html", "wb") as f:
        f.write(body2)
    print("wrote ei_index.html")
