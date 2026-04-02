"""Probe EasyInvoice API with different auth strategies."""
import sys, base64, hashlib, secrets, time
import urllib.request, urllib.error, json
sys.path.insert(0, '/var/www/jewelry/backend')

API_URL = 'https://api.easyinvoice.vn'
USERNAME = '5800884170'
PASSWORD = 'dTFVLQq8nzBF'
TAX_CODE = '5800884170'
PATTERN = '2C26MYY'

def build_auth(method):
    ts = str(int(time.time()))
    nonce = secrets.token_hex(16)
    sig_src = f'{method.upper()}{ts}{nonce}'
    sig = base64.b64encode(hashlib.md5(sig_src.encode()).digest()).decode()
    return f'{sig}:{nonce}:{ts}:{USERNAME}:{PASSWORD}:{TAX_CODE}'

def try_post(endpoint, payload, auth_header_name='Authentication'):
    url = f'{API_URL}/{endpoint.lstrip("/")}'
    auth_val = build_auth('POST')
    data = json.dumps(payload, ensure_ascii=False).encode('utf-8')
    req = urllib.request.Request(url, data=data, headers={
        'Content-Type': 'application/json; charset=utf-8',
        'Accept': 'application/json',
        auth_header_name: auth_val,
    }, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            txt = r.read().decode('utf-8', errors='replace')
            return json.loads(txt) if txt else {}
    except urllib.error.HTTPError as e:
        txt = e.read().decode('utf-8', errors='replace')
        return {'_http_err': e.code, '_body': txt[:300]}
    except Exception as e:
        return {'_err': str(e)}

PAYLOAD = {'Pattern': PATTERN, 'FromDate': '01/01/2026', 'ToDate': '02/04/2026', 'PageIndex': 1, 'PageSize': 10}

# Try different header names and endpoints
tests = [
    ('api/Invoice/Search', PAYLOAD, 'Authentication'),
    ('api/Invoice/Search', PAYLOAD, 'Authorization'),
    ('api/invoice/search', PAYLOAD, 'Authentication'),
    ('api/Invoice/GetList', PAYLOAD, 'Authentication'),
    ('api/Invoice/Search', {'Pattern': PATTERN, 'From': '2026-01-01', 'To': '2026-04-02'}, 'Authentication'),
]

for ep, pl, hdr in tests:
    r = try_post(ep, pl, hdr)
    print(f'{hdr} {ep}: {str(r)[:250]}')
