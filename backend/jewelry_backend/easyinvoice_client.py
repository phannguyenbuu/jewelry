import base64
import datetime
import hashlib
import json
import math
import secrets
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed


OK_CODE_TEXTS = {'0', '00', '2', '200', 'success', 'ok'}
EASYINVOICE_LIST_RESOURCE = 'api/business/getInvoiceByArisingDateRange'
EASYINVOICE_LIST_USERNAME = 'API'
EASYINVOICE_LIST_MAX_PAGE_SIZE = 100


class EasyInvoiceApiError(Exception):
    def __init__(self, message, payload=None, status_code=502):
        super().__init__(message)
        self.message = message
        self.payload = payload or {}
        self.status_code = status_code


def clean_text(value):
    return str(value or '').strip()


def clean_int(value, default=0):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def build_authentication_header(http_method, username, password, tax_code):
    timestamp = str(int(time.time()))
    nonce = secrets.token_hex(16)
    signature_src = f'{http_method.upper()}{timestamp}{nonce}'
    signature = base64.b64encode(hashlib.md5(signature_src.encode('utf-8')).digest()).decode('utf-8')
    return f'{signature}:{nonce}:{timestamp}:{username}:{password}:{tax_code}'


def build_url(base_url, resource):
    return f'{str(base_url or "").rstrip("/")}/{str(resource or "").lstrip("/")}'


def _easyinvoice_api_username(config):
    if not isinstance(config, dict):
        return EASYINVOICE_LIST_USERNAME
    return (
        clean_text(config.get('api_username'))
        or clean_text(config.get('list_username'))
        or clean_text(config.get('username'))
        or EASYINVOICE_LIST_USERNAME
    )


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
        _easyinvoice_api_username(config),
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
        _easyinvoice_api_username(config),
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
        _easyinvoice_api_username(config),
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
        _easyinvoice_api_username(config),
        config.get('password', ''),
        config.get('tax_code', ''),
        timeout=timeout,
    )
    return ensure_success_response(response)


def first_invoice_from_lookup(payload):
    invoices = ((payload or {}).get('Data') or {}).get('Invoices') or []
    return invoices[0] if invoices else {}


def get_json(base_url, resource, params, username, password, tax_code, timeout=60):
    """GET request with EasyInvoice authentication header."""
    import urllib.parse
    endpoint = build_url(base_url, resource)
    if params:
        endpoint = f"{endpoint}?{urllib.parse.urlencode(params)}"
    auth_header = build_authentication_header('GET', username, password, tax_code)
    request_obj = urllib.request.Request(
        endpoint,
        headers={
            'Accept': 'application/json',
            'Authentication': auth_header,
        },
        method='GET',
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


def _easyinvoice_list_username(config):
    return _easyinvoice_api_username(config)


def _easyinvoice_filter_invoices(invoices, keyword='', invoice_type=-1, status=-1):
    filtered = list(invoices or [])

    keyword_text = clean_text(keyword).casefold()
    if keyword_text:
        filtered = [
            invoice for invoice in filtered
            if keyword_text in json.dumps(invoice, ensure_ascii=False).casefold()
        ]

    if clean_int(invoice_type, -1) >= 0:
        expected_type = clean_int(invoice_type, -1)
        filtered = [
            invoice for invoice in filtered
            if clean_int(invoice.get('Type', invoice.get('InvoiceType')), default=-1) == expected_type
        ]

    if clean_int(status, -1) >= 0:
        expected_status = clean_int(status, -1)
        filtered = [
            invoice for invoice in filtered
            if clean_int(invoice.get('InvoiceStatus', invoice.get('Status')), default=-1) == expected_status
        ]

    return filtered


def _easyinvoice_list_payload(from_date, to_date, page, page_size, pattern=''):
    payload = {
        'FromDate': from_date,
        'ToDate': to_date,
        'Page': page,
        'PageSize': page_size,
        'Option': 1,
    }
    effective_pattern = clean_text(pattern)
    if effective_pattern:
        payload['Pattern'] = effective_pattern
    return payload


def _easyinvoice_fetch_list_page(config, from_date, to_date, page, page_size, pattern='', timeout=60):
    response = post_json(
        config.get('api_url', ''),
        EASYINVOICE_LIST_RESOURCE,
        _easyinvoice_list_payload(from_date, to_date, page, page_size, pattern=pattern),
        _easyinvoice_list_username(config),
        config.get('password', ''),
        config.get('tax_code', ''),
        timeout=timeout,
    )
    ensure_success_response(response)
    data = (response or {}).get('Data') or {}
    invoices = data.get('Invoices') or []
    return response, invoices if isinstance(invoices, list) else []


def search_invoices(config, from_date='', to_date='', pattern='', keyword='',
                    invoice_type=-1, status=-1, start=0, length=500, timeout=60):
    """
    List invoices via EasyInvoice business API.
    from_date / to_date: dd/MM/yyyy format.
    Returns a response shaped like {'Status': 2, 'Data': {'Invoices': [...]}}.
    """
    requested_length = max(clean_int(length, 500), 0)
    page_size = (
        EASYINVOICE_LIST_MAX_PAGE_SIZE
        if requested_length == 0
        else min(max(requested_length, 1), EASYINVOICE_LIST_MAX_PAGE_SIZE)
    )
    invoices = []
    last_response = {}
    effective_pattern = clean_text(pattern or config.get('pattern'))

    first_response, first_page_invoices = _easyinvoice_fetch_list_page(
        config,
        from_date,
        to_date,
        1,
        page_size,
        pattern=effective_pattern,
        timeout=timeout,
    )
    last_response = first_response
    invoices.extend(first_page_invoices)

    first_data = (first_response or {}).get('Data') or {}
    total_pages = max(clean_int(first_data.get('TotalPages'), 1), 1)
    if total_pages > 1:
        remaining_pages = list(range(2, total_pages + 1))
        max_workers = min(8, len(remaining_pages))
        page_results = {}
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            future_map = {
                executor.submit(
                    _easyinvoice_fetch_list_page,
                    config,
                    from_date,
                    to_date,
                    page,
                    page_size,
                    effective_pattern,
                    timeout,
                ): page
                for page in remaining_pages
            }
            for future in as_completed(future_map):
                page = future_map[future]
                response, page_invoices = future.result()
                page_results[page] = page_invoices
                last_response = response

        for page in remaining_pages:
            invoices.extend(page_results.get(page, []))

    filtered_invoices = _easyinvoice_filter_invoices(
        invoices,
        keyword=keyword,
        invoice_type=invoice_type,
        status=status,
    )
    start_index = max(clean_int(start, 0), 0)
    end_index = None if requested_length == 0 else start_index + requested_length
    visible_invoices = filtered_invoices[start_index:end_index]

    filtered_total = len(filtered_invoices)
    visible_count = len(visible_invoices)
    returned_page_size = visible_count or page_size

    result = dict(last_response or {})
    result['Status'] = clean_int(result.get('Status'), 2) or 2
    result['Data'] = {
        **(((last_response or {}).get('Data') or {}) if isinstance((last_response or {}).get('Data'), dict) else {}),
        'Invoices': visible_invoices,
        'FromDate': from_date,
        'ToDate': to_date,
        'Page': 1,
        'PageSize': returned_page_size,
        'TotalPages': max(math.ceil(filtered_total / max(returned_page_size, 1)), 1) if filtered_total else 1,
        'TotalRecords': filtered_total,
        'FetchedRecords': len(invoices),
        'Start': start_index,
        'Length': requested_length,
    }
    result['Rows'] = visible_invoices
    result['data'] = visible_invoices
    return result
