import base64
import datetime
import hashlib
import json
import secrets
import time
import urllib.error
import urllib.request


OK_CODE_TEXTS = {'0', '00', '2', '200', 'success', 'ok'}


class EasyInvoiceApiError(Exception):
    def __init__(self, message, payload=None, status_code=502):
        super().__init__(message)
        self.message = message
        self.payload = payload or {}
        self.status_code = status_code


def clean_text(value):
    return str(value or '').strip()


def build_authentication_header(http_method, username, password, tax_code):
    timestamp = str(int(time.time()))
    nonce = secrets.token_hex(16)
    signature_src = f'{http_method.upper()}{timestamp}{nonce}'
    signature = base64.b64encode(hashlib.md5(signature_src.encode('utf-8')).digest()).decode('utf-8')
    return f'{signature}:{nonce}:{timestamp}:{username}:{password}:{tax_code}'


def build_url(base_url, resource):
    return f'{str(base_url or "").rstrip("/")}/{str(resource or "").lstrip("/")}'


def post_json(base_url, resource, payload, username, password, tax_code, timeout=60):
    endpoint = build_url(base_url, resource)
    auth_header = build_authentication_header('POST', username, password, tax_code)
    request_obj = urllib.request.Request(
        endpoint,
        data=json.dumps(payload, ensure_ascii=False).encode('utf-8'),
        headers={
            'Content-Type': 'application/json; charset=utf-8',
            'Accept': 'application/json',
            'Authentication': auth_header,
        },
        method='POST',
    )
    try:
        with urllib.request.urlopen(request_obj, timeout=timeout) as response:
            raw_text = response.read().decode('utf-8', errors='replace')
            return json.loads(raw_text) if raw_text else {}
    except urllib.error.HTTPError as exc:
        raw_text = exc.read().decode('utf-8', errors='replace')
        try:
            error_payload = json.loads(raw_text) if raw_text else {}
        except Exception:
            error_payload = {'raw': raw_text}
        raise EasyInvoiceApiError(
            error_message(error_payload) or f'EasyInvoice HTTP {exc.code}',
            payload=error_payload,
            status_code=502,
        ) from exc
    except Exception as exc:
        raise EasyInvoiceApiError(f'Khong ket noi duoc EasyInvoice: {exc}', payload={}, status_code=502) from exc


def find_value(node, candidate_keys):
    if isinstance(node, dict):
        for key, value in node.items():
            if str(key).lower() in candidate_keys and value not in (None, '', [], {}):
                return value
        for value in node.values():
            found = find_value(value, candidate_keys)
            if found not in (None, '', [], {}):
                return found
    elif isinstance(node, list):
        for item in node:
            found = find_value(item, candidate_keys)
            if found not in (None, '', [], {}):
                return found
    return None


def error_message(payload):
    if not isinstance(payload, (dict, list)):
        return clean_text(payload)
    message = find_value(payload, {
        'error', 'errors', 'errormessage', 'message', 'msg', 'description',
        'detail', 'reason', 'devmessage',
    })
    if isinstance(message, list):
        return '; '.join(clean_text(item) for item in message if clean_text(item))
    return clean_text(message)


def extract_links(payload):
    return {
        'link_view': clean_text(find_value(payload, {
            'linkview', 'viewlink', 'invoiceviewurl', 'lookupurl', 'tracuulink',
            'invoiceurl', 'linktrauu', 'link_tra_cuu',
        })),
        'lookup_code': clean_text(find_value(payload, {
            'lookupcode', 'searchcode', 'sobaomat', 'securecode', 'codeverify',
        })),
        'invoice_no': clean_text(find_value(payload, {
            'invoiceno', 'invoicenumber', 'invoicecode', 'sohoadon', 'so_hd',
        })),
        'ikey': clean_text(find_value(payload, {
            'ikey', 'invoicekey', 'transactionkey',
        })),
    }


def ensure_success_response(payload):
    explicit_success = find_value(payload, {'success', 'issuccess'})
    explicit_code = find_value(payload, {'code', 'resultcode', 'statuscode', 'status'})
    explicit_success_text = clean_text(explicit_success).lower()
    explicit_code_text = clean_text(explicit_code).lower()
    links = extract_links(payload)
    if explicit_success is False or explicit_success_text in {'false', '0', 'fail', 'failed'}:
        raise EasyInvoiceApiError(error_message(payload) or 'EasyInvoice tra ve ket qua that bai.', payload=payload, status_code=502)
    if explicit_code_text and explicit_code_text not in OK_CODE_TEXTS and not links.get('invoice_no'):
        raise EasyInvoiceApiError(error_message(payload) or 'EasyInvoice tra ve ket qua that bai.', payload=payload, status_code=502)
    return payload


def issue_invoice(config, xml_data, timeout=60):
    payload = {
        'XmlData': xml_data,
        'Pattern': config.get('pattern', ''),
        'Serial': config.get('serial', ''),
    }
    if config.get('book_code'):
        payload['BookCode'] = config['book_code']
    response = post_json(
        config.get('api_url', ''),
        'api/publish/importAndIssueInvoice',
        payload,
        config.get('username', ''),
        config.get('password', ''),
        config.get('tax_code', ''),
        timeout=timeout,
    )
    return ensure_success_response(response)


def import_invoice(config, xml_data, timeout=60):
    payload = {
        'XmlData': xml_data,
        'Pattern': config.get('pattern', ''),
        'Serial': config.get('serial', ''),
    }
    if config.get('book_code'):
        payload['BookCode'] = config['book_code']
    response = post_json(
        config.get('api_url', ''),
        'api/publish/importInvoice',
        payload,
        config.get('username', ''),
        config.get('password', ''),
        config.get('tax_code', ''),
        timeout=timeout,
    )
    return ensure_success_response(response)


def get_invoices_by_ikeys(config, ikeys, timeout=60):
    response = post_json(
        config.get('api_url', ''),
        'api/publish/getInvoicesByIkeys',
        {'Ikeys': list(ikeys or [])},
        config.get('username', ''),
        config.get('password', ''),
        config.get('tax_code', ''),
        timeout=timeout,
    )
    return ensure_success_response(response)


def check_invoice_state(config, ikeys, timeout=60):
    response = post_json(
        config.get('api_url', ''),
        'api/publish/checkInvoiceState',
        {'Ikeys': list(ikeys or [])},
        config.get('username', ''),
        config.get('password', ''),
        config.get('tax_code', ''),
        timeout=timeout,
    )
    return ensure_success_response(response)


def first_invoice_from_lookup(payload):
    invoices = ((payload or {}).get('Data') or {}).get('Invoices') or []
    return invoices[0] if invoices else {}
