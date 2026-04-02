"""Update easyinvoice_settings with correct credentials."""
import sys, os, json
sys.path.insert(0, '/var/www/jewelry/backend')
os.chdir('/var/www/jewelry/backend')

import app_jewelry  # noqa
from jewelry_backend.state import app, db

EI_CONFIG = {
    "username": "5800884170",
    "password": "dTFVLQq8nzBF",
    "tax_code": "5800884170",
    "pattern":  "2C26MYY",
    "serial":   "",
    "book_code": "",
    "api_url":  "https://api.easyinvoice.vn",
}

with app.app_context():
    from jewelry_backend.models import HeThongCauHinh
    obj = HeThongCauHinh.query.filter_by(config_key='easyinvoice_settings').first()
    if obj:
        obj.data = EI_CONFIG
        print("Updated.")
    else:
        from jewelry_backend.utils import now_str
        now = now_str()
        obj = HeThongCauHinh(config_key='easyinvoice_settings', data=EI_CONFIG,
                             ghi_chu='EasyInvoice API credentials', ngay_tao=now, cap_nhat_luc=now)
        db.session.add(obj)
        print("Inserted.")
    db.session.commit()
    print("Config:", json.dumps(obj.data, ensure_ascii=False))
