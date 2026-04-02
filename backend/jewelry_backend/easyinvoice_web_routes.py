# pyre-ignore-all-errors
import json
import os
import re
import secrets
import tempfile
import threading
import time
from dataclasses import dataclass, field
import datetime
from html.parser import HTMLParser
from http.cookiejar import Cookie, CookieJar
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode, urljoin, urlsplit, urlunsplit
from urllib.request import HTTPCookieProcessor, Request, build_opener

from flask import Response, jsonify, request, session

from .easyinvoice_cache import query_easyinvoice_cache_response
from . import easyinvoice_client
from .orders_routes import _easyinvoice_config
from .state import app

try:
    import ddddocr  # type: ignore
except Exception:  # pragma: no cover - optional dependency at runtime
    ddddocr = None

EASYINVOICE_WEB_BASE_URL = 'https://5800884170.easyinvoice.com.vn'
EASYINVOICE_WEB_PROXY_PREFIX = '/api/easyinvoice/web/proxy'
EASYINVOICE_FLOW_TTL_SECONDS = 15 * 60
EASYINVOICE_AUTH_TTL_SECONDS = 8 * 60 * 60
EASYINVOICE_REQUEST_TIMEOUT = 20.0
EASYINVOICE_AUTO_CAPTCHA_ATTEMPTS = 3
EASYINVOICE_WEB_STATE_DIR = os.path.join(tempfile.gettempdir(), 'jewelry_easyinvoice_web')
EASYINVOICE_WEB_FLOW_DIR = os.path.join(EASYINVOICE_WEB_STATE_DIR, 'flows')
EASYINVOICE_WEB_AUTH_DIR = os.path.join(EASYINVOICE_WEB_STATE_DIR, 'auths')
EASYINVOICE_USER_AGENT = (
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
    'AppleWebKit/537.36 (KHTML, like Gecko) '
    'Chrome/135.0.0.0 Safari/537.36'
)
EASYINVOICE_OCR_LOCK = threading.Lock()
EASYINVOICE_OCR_ENGINE = None
EASYINVOICE_OCR_READY = False


def _easyinvoice_web_clean_text(value):
    return str(value or '').strip()


def _easyinvoice_web_rounded_amount(value):
    try:
        return str(int(round(float(value or 0))))
    except (TypeError, ValueError):
        return ''


def _easyinvoice_web_target_pattern(raw_payload=None):
    payload = raw_payload if isinstance(raw_payload, dict) else {}
    config = _easyinvoice_config()
    return _easyinvoice_web_clean_text(payload.get('pattern') or config.get('pattern'))


def _easyinvoice_web_target_payload(raw_payload=None):
    payload = raw_payload if isinstance(raw_payload, dict) else {}
    return {
        'pattern': _easyinvoice_web_target_pattern(payload),
        'ikey': _easyinvoice_web_clean_text(payload.get('ikey')),
        'invoice_no': _easyinvoice_web_clean_text(payload.get('invoice_no') or payload.get('invoiceNo')),
        'lookup_code': _easyinvoice_web_clean_text(payload.get('lookup_code') or payload.get('lookupCode')),
        'buyer': _easyinvoice_web_clean_text(payload.get('buyer')),
        'amount': _easyinvoice_web_rounded_amount(payload.get('amount')),
    }


def _easyinvoice_web_viewer_url(raw_payload=None):
    payload = _easyinvoice_web_target_payload(raw_payload)
    query = {}
    for key in ('pattern', 'ikey', 'invoice_no', 'lookup_code', 'buyer', 'amount'):
        value = payload.get(key)
        if value:
            query[key] = value
    suffix = f"?{urlencode(query)}" if query else ''
    return f'/api/easyinvoice/web/viewer{suffix}'


@dataclass
class EasyInvoiceLoginForm:
    action: str = ''
    method: str = 'POST'
    inputs: dict[str, str] = field(default_factory=dict)
    captcha_src: str = '/Captcha/Show'


@dataclass
class EasyInvoiceLoginFlow:
    flow_id: str
    page_url: str
    form: EasyInvoiceLoginForm
    created_at: float
    cookies: list[dict[str, object]] = field(default_factory=list)


@dataclass
class EasyInvoiceWebAuth:
    auth_id: str
    final_url: str
    created_at: float
    cookies: list[dict[str, object]] = field(default_factory=list)


class EasyInvoiceLoginFormParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.in_target_form = False
        self.form = EasyInvoiceLoginForm()

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attr_map = {key: value or '' for key, value in attrs}
        lower_tag = tag.lower()

        if lower_tag == 'form':
            action = attr_map.get('action', '')
            method = attr_map.get('method', 'POST')
            if '/account/logon' in action.lower():
                self.in_target_form = True
                self.form.action = action
                self.form.method = method.upper()
            return

        if not self.in_target_form:
            return

        if lower_tag == 'input':
            name = attr_map.get('name', '')
            if name:
                self.form.inputs[name] = attr_map.get('value', '')
            return

        if lower_tag == 'img':
            src = attr_map.get('src', '')
            alt = attr_map.get('alt', '')
            class_name = attr_map.get('class', '')
            joined = ' '.join((src, alt, class_name)).lower()
            if 'captcha' in joined:
                self.form.captcha_src = src

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() == 'form' and self.in_target_form:
            self.in_target_form = False


EASYINVOICE_LOGIN_FLOWS: dict[str, EasyInvoiceLoginFlow] = {}
EASYINVOICE_WEB_AUTHS: dict[str, EasyInvoiceWebAuth] = {}
EASYINVOICE_WEB_LOCK = threading.Lock()


def _easyinvoice_web_ensure_state_dirs():
    os.makedirs(EASYINVOICE_WEB_FLOW_DIR, exist_ok=True)
    os.makedirs(EASYINVOICE_WEB_AUTH_DIR, exist_ok=True)


def _easyinvoice_web_state_path(kind: str, state_id: str):
    _easyinvoice_web_ensure_state_dirs()
    root_dir = EASYINVOICE_WEB_FLOW_DIR if kind == 'flow' else EASYINVOICE_WEB_AUTH_DIR
    return os.path.join(root_dir, f'{state_id}.json')


def _easyinvoice_web_write_state(kind: str, state_id: str, payload: dict):
    target_path = _easyinvoice_web_state_path(kind, state_id)
    temp_path = f'{target_path}.tmp'
    with open(temp_path, 'w', encoding='utf-8') as handle:
        json.dump(payload, handle, ensure_ascii=False)
    os.replace(temp_path, target_path)


def _easyinvoice_web_read_state(kind: str, state_id: str):
    target_path = _easyinvoice_web_state_path(kind, state_id)
    if not os.path.exists(target_path):
        return None
    try:
        with open(target_path, 'r', encoding='utf-8') as handle:
            return json.load(handle)
    except Exception:
        return None


def _easyinvoice_web_delete_state(kind: str, state_id: str):
    target_path = _easyinvoice_web_state_path(kind, state_id)
    try:
        os.remove(target_path)
    except FileNotFoundError:
        return


def _easyinvoice_web_cookie_state(cookie_jar: CookieJar):
    cookies = []
    for cookie in cookie_jar:
        cookies.append({
            'version': cookie.version,
            'name': cookie.name,
            'value': cookie.value,
            'port': cookie.port,
            'port_specified': cookie.port_specified,
            'domain': cookie.domain,
            'domain_specified': cookie.domain_specified,
            'domain_initial_dot': cookie.domain_initial_dot,
            'path': cookie.path,
            'path_specified': cookie.path_specified,
            'secure': cookie.secure,
            'expires': cookie.expires,
            'discard': cookie.discard,
            'comment': cookie.comment,
            'comment_url': cookie.comment_url,
            'rest': dict(cookie._rest or {}),
            'rfc2109': cookie.rfc2109,
        })
    return cookies


def _easyinvoice_web_cookie_jar(cookies):
    cookie_jar = CookieJar()
    for raw_cookie in cookies or []:
        try:
            cookie_jar.set_cookie(Cookie(
                version=int(raw_cookie.get('version') or 0),
                name=str(raw_cookie.get('name') or ''),
                value=str(raw_cookie.get('value') or ''),
                port=raw_cookie.get('port'),
                port_specified=bool(raw_cookie.get('port_specified')),
                domain=str(raw_cookie.get('domain') or ''),
                domain_specified=bool(raw_cookie.get('domain_specified')),
                domain_initial_dot=bool(raw_cookie.get('domain_initial_dot')),
                path=str(raw_cookie.get('path') or '/'),
                path_specified=bool(raw_cookie.get('path_specified')),
                secure=bool(raw_cookie.get('secure')),
                expires=raw_cookie.get('expires'),
                discard=bool(raw_cookie.get('discard')),
                comment=raw_cookie.get('comment'),
                comment_url=raw_cookie.get('comment_url'),
                rest=dict(raw_cookie.get('rest') or {}),
                rfc2109=bool(raw_cookie.get('rfc2109')),
            ))
        except Exception:
            continue
    return cookie_jar


def _easyinvoice_web_form_state(form: EasyInvoiceLoginForm):
    return {
        'action': form.action,
        'method': form.method,
        'inputs': dict(form.inputs),
        'captcha_src': form.captcha_src,
    }


def _easyinvoice_web_form_from_state(payload):
    payload = payload if isinstance(payload, dict) else {}
    return EasyInvoiceLoginForm(
        action=_easyinvoice_web_clean_text(payload.get('action')),
        method=_easyinvoice_web_clean_text(payload.get('method') or 'POST') or 'POST',
        inputs={str(key): _easyinvoice_web_clean_text(value) for key, value in dict(payload.get('inputs') or {}).items()},
        captcha_src=_easyinvoice_web_clean_text(payload.get('captcha_src') or '/Captcha/Show') or '/Captcha/Show',
    )


def _easyinvoice_web_save_flow(flow: EasyInvoiceLoginFlow):
    _easyinvoice_web_write_state('flow', flow.flow_id, {
        'flow_id': flow.flow_id,
        'cookies': flow.cookies,
        'page_url': flow.page_url,
        'form': _easyinvoice_web_form_state(flow.form),
        'created_at': flow.created_at,
    })


def _easyinvoice_web_load_flow(flow_id: str):
    payload = _easyinvoice_web_read_state('flow', flow_id)
    if not payload:
        return None
    flow = EasyInvoiceLoginFlow(
        flow_id=_easyinvoice_web_clean_text(payload.get('flow_id') or flow_id),
        cookies=list(payload.get('cookies') or []),
        page_url=_easyinvoice_web_clean_text(payload.get('page_url')),
        form=_easyinvoice_web_form_from_state(payload.get('form')),
        created_at=float(payload.get('created_at') or 0),
    )
    if not flow.flow_id or not flow.created_at or time.time() - flow.created_at > EASYINVOICE_FLOW_TTL_SECONDS:
        _easyinvoice_web_delete_state('flow', flow_id)
        return None
    return flow


def _easyinvoice_web_save_auth(auth: EasyInvoiceWebAuth):
    _easyinvoice_web_write_state('auth', auth.auth_id, {
        'auth_id': auth.auth_id,
        'cookies': auth.cookies,
        'final_url': auth.final_url,
        'created_at': auth.created_at,
    })


def _easyinvoice_web_load_auth(auth_id: str):
    payload = _easyinvoice_web_read_state('auth', auth_id)
    if not payload:
        return None
    auth = EasyInvoiceWebAuth(
        auth_id=_easyinvoice_web_clean_text(payload.get('auth_id') or auth_id),
        cookies=list(payload.get('cookies') or []),
        final_url=_easyinvoice_web_clean_text(payload.get('final_url')),
        created_at=float(payload.get('created_at') or 0),
    )
    if not auth.auth_id or not auth.created_at or time.time() - auth.created_at > EASYINVOICE_AUTH_TTL_SECONDS:
        _easyinvoice_web_delete_state('auth', auth_id)
        return None
    return auth


def _easyinvoice_web_get_ocr_engine():
    global EASYINVOICE_OCR_ENGINE, EASYINVOICE_OCR_READY
    if EASYINVOICE_OCR_READY:
        return EASYINVOICE_OCR_ENGINE
    with EASYINVOICE_OCR_LOCK:
        if EASYINVOICE_OCR_READY:
            return EASYINVOICE_OCR_ENGINE
        if ddddocr is None:
            EASYINVOICE_OCR_ENGINE = None
            EASYINVOICE_OCR_READY = True
            return None
        try:
            EASYINVOICE_OCR_ENGINE = ddddocr.DdddOcr(show_ad=False)
        except Exception:
            EASYINVOICE_OCR_ENGINE = None
        EASYINVOICE_OCR_READY = True
        return EASYINVOICE_OCR_ENGINE


def _easyinvoice_web_guess_captcha(image_bytes: bytes):
    engine = _easyinvoice_web_get_ocr_engine()
    if engine is None or not image_bytes:
        return ''
    try:
        guess = engine.classification(image_bytes)
    except Exception:
        return ''
    return re.sub(r'[^0-9A-Za-z]', '', _easyinvoice_web_clean_text(guess))[:8]


def _easyinvoice_web_purge_expired_state():
    now_value = time.time()
    expired_flow_ids = []
    expired_auth_ids = []

    with EASYINVOICE_WEB_LOCK:
        for flow_id, flow in EASYINVOICE_LOGIN_FLOWS.items():
            if now_value - flow.created_at > EASYINVOICE_FLOW_TTL_SECONDS:
                expired_flow_ids.append(flow_id)

        for auth_id, auth in EASYINVOICE_WEB_AUTHS.items():
            if now_value - auth.created_at > EASYINVOICE_AUTH_TTL_SECONDS:
                expired_auth_ids.append(auth_id)

        for flow_id in expired_flow_ids:
            EASYINVOICE_LOGIN_FLOWS.pop(flow_id, None)

        for auth_id in expired_auth_ids:
            EASYINVOICE_WEB_AUTHS.pop(auth_id, None)

    for flow_id in expired_flow_ids:
        _easyinvoice_web_delete_state('flow', flow_id)

    for auth_id in expired_auth_ids:
        _easyinvoice_web_delete_state('auth', auth_id)

    for kind, root_dir, ttl_seconds in (
        ('flow', EASYINVOICE_WEB_FLOW_DIR, EASYINVOICE_FLOW_TTL_SECONDS),
        ('auth', EASYINVOICE_WEB_AUTH_DIR, EASYINVOICE_AUTH_TTL_SECONDS),
    ):
        if not os.path.isdir(root_dir):
            continue
        for entry in os.listdir(root_dir):
            if not entry.endswith('.json'):
                continue
            state_id = entry[:-5]
            payload = _easyinvoice_web_read_state(kind, state_id)
            created_at = 0.0
            if isinstance(payload, dict):
                try:
                    created_at = float(payload.get('created_at') or 0)
                except (TypeError, ValueError):
                    created_at = 0.0
            if not created_at or now_value - created_at > ttl_seconds:
                _easyinvoice_web_delete_state(kind, state_id)


def _easyinvoice_web_build_session(cookies=None):
    cookie_jar = _easyinvoice_web_cookie_jar(cookies)
    opener = build_opener(HTTPCookieProcessor(cookie_jar))
    opener.addheaders = [
        ('User-Agent', EASYINVOICE_USER_AGENT),
        ('Accept-Language', 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7'),
    ]
    return opener, cookie_jar


def _easyinvoice_web_store_flow_cookies(flow: EasyInvoiceLoginFlow, cookie_jar: CookieJar):
    flow.cookies = _easyinvoice_web_cookie_state(cookie_jar)
    with EASYINVOICE_WEB_LOCK:
        EASYINVOICE_LOGIN_FLOWS[flow.flow_id] = flow
    _easyinvoice_web_save_flow(flow)


def _easyinvoice_web_store_auth_cookies(auth: EasyInvoiceWebAuth, cookie_jar: CookieJar):
    auth.cookies = _easyinvoice_web_cookie_state(cookie_jar)
    with EASYINVOICE_WEB_LOCK:
        EASYINVOICE_WEB_AUTHS[auth.auth_id] = auth
    _easyinvoice_web_save_auth(auth)


def _easyinvoice_web_read_text_response(response) -> str:
    payload = response.read()
    charset = response.headers.get_content_charset() or 'utf-8'
    return payload.decode(charset, errors='replace')


def _easyinvoice_web_build_login_url(pattern: str):
    return_url = f'/EInvoice?Pattern={pattern}'
    return f'{EASYINVOICE_WEB_BASE_URL}/Account/LogOn?ReturnUrl={quote(return_url, safe="")}'


def _easyinvoice_web_fetch_login_page(opener, pattern: str):
    request_obj = Request(_easyinvoice_web_build_login_url(pattern))
    with opener.open(request_obj, timeout=EASYINVOICE_REQUEST_TIMEOUT) as response:
        return _easyinvoice_web_read_text_response(response), response.geturl()


def _easyinvoice_web_extract_login_form(html: str):
    parser = EasyInvoiceLoginFormParser()
    parser.feed(html)
    required_fields = {'username', 'password', 'captch'}
    if not parser.form.action or not required_fields.issubset(parser.form.inputs):
        raise RuntimeError('Khong doc duoc form dang nhap EasyInvoice.')
    return parser.form


def _easyinvoice_web_fetch_captcha_data(opener, page_url: str, form: EasyInvoiceLoginForm):
    captcha_url = urljoin(page_url, form.captcha_src or '/Captcha/Show')
    request_obj = Request(captcha_url, headers={'Referer': page_url})
    with opener.open(request_obj, timeout=EASYINVOICE_REQUEST_TIMEOUT) as response:
        content_type = response.headers.get('Content-Type', 'image/png')
        return response.read(), content_type


def _easyinvoice_web_build_payload(form: EasyInvoiceLoginForm, tax_code: str, username: str, password: str, captcha: str):
    payload = dict(form.inputs)
    if 'taxCode' in payload:
        payload['taxCode'] = tax_code or ''
    payload.update({
        'username': username,
        'password': password,
        'captch': captcha,
    })
    return payload


def _easyinvoice_web_submit_login(opener, page_url: str, form: EasyInvoiceLoginForm, payload: dict[str, str]):
    body = urlencode(payload).encode('utf-8')
    target_url = urljoin(page_url, form.action)
    origin = page_url.split('/Account/LogOn', 1)[0]
    request_obj = Request(
        target_url,
        data=body,
        headers={
            'Content-Type': 'application/x-www-form-urlencoded',
            'Origin': origin,
            'Referer': page_url,
        },
        method=form.method or 'POST',
    )
    with opener.open(request_obj, timeout=EASYINVOICE_REQUEST_TIMEOUT) as response:
        return _easyinvoice_web_read_text_response(response), response.geturl()


def _easyinvoice_web_looks_like_login_page(final_url: str, html: str):
    lowered_html = html.lower()
    return (
        '/account/logon' in final_url.lower()
        or ('name="password"' in lowered_html and 'name="captch"' in lowered_html)
    )


def _easyinvoice_web_extract_server_message(html: str):
    patterns = [
        r'<span[^>]+id="errorText"[^>]*>(.*?)</span>',
        r'<div[^>]+validation-summary-errors[^>]*>(.*?)</div>',
        r'<li>(.*?)</li>',
    ]
    for pattern in patterns:
        match = re.search(pattern, html, flags=re.IGNORECASE | re.DOTALL)
        if not match:
            continue
        text = re.sub(r'<[^>]+>', ' ', match.group(1))
        text = ' '.join(text.split())
        if text.lower() == 'nhap mat khau':
            continue
        if text:
            return text
    return ''


def _easyinvoice_web_attempt_login(opener, page_url: str, form: EasyInvoiceLoginForm, tax_code: str, username: str, password: str, captcha: str):
    payload = _easyinvoice_web_build_payload(form, tax_code, username, password, captcha)
    response_html, final_url = _easyinvoice_web_submit_login(opener, page_url, form, payload)
    if _easyinvoice_web_looks_like_login_page(final_url, response_html):
        return {
            'success': False,
            'final_url': final_url,
            'html': response_html,
            'message': _easyinvoice_web_extract_server_message(response_html) or 'Dang nhap EasyInvoice that bai.',
        }
    return {
        'success': True,
        'final_url': final_url,
        'html': response_html,
        'message': '',
    }


def _easyinvoice_web_create_flow(pattern: str):
    _easyinvoice_web_purge_expired_state()
    opener, cookie_jar = _easyinvoice_web_build_session()
    login_html, page_url = _easyinvoice_web_fetch_login_page(opener, pattern)
    form = _easyinvoice_web_extract_login_form(login_html)
    flow = EasyInvoiceLoginFlow(
        flow_id=secrets.token_urlsafe(16),
        cookies=_easyinvoice_web_cookie_state(cookie_jar),
        page_url=page_url,
        form=form,
        created_at=time.time(),
    )
    with EASYINVOICE_WEB_LOCK:
        EASYINVOICE_LOGIN_FLOWS[flow.flow_id] = flow
    _easyinvoice_web_save_flow(flow)
    return flow


def _easyinvoice_web_get_flow(flow_id: str):
    _easyinvoice_web_purge_expired_state()
    if not flow_id:
        return None
    with EASYINVOICE_WEB_LOCK:
        cached_flow = EASYINVOICE_LOGIN_FLOWS.get(flow_id)
    if cached_flow:
        return cached_flow
    flow = _easyinvoice_web_load_flow(flow_id)
    if flow:
        with EASYINVOICE_WEB_LOCK:
            EASYINVOICE_LOGIN_FLOWS[flow.flow_id] = flow
    return flow


def _easyinvoice_web_replace_flow(old_flow_id: str, pattern: str):
    if old_flow_id:
        with EASYINVOICE_WEB_LOCK:
            EASYINVOICE_LOGIN_FLOWS.pop(old_flow_id, None)
        _easyinvoice_web_delete_state('flow', old_flow_id)
    return _easyinvoice_web_create_flow(pattern)


def _easyinvoice_web_discard_flow(flow):
    if not flow:
        return
    flow_id = flow.flow_id if hasattr(flow, 'flow_id') else _easyinvoice_web_clean_text(flow)
    if not flow_id:
        return
    with EASYINVOICE_WEB_LOCK:
        EASYINVOICE_LOGIN_FLOWS.pop(flow_id, None)
    _easyinvoice_web_delete_state('flow', flow_id)


def _easyinvoice_web_create_auth(flow: EasyInvoiceLoginFlow, final_url: str):
    auth = EasyInvoiceWebAuth(
        auth_id=secrets.token_urlsafe(16),
        cookies=list(flow.cookies or []),
        final_url=final_url,
        created_at=time.time(),
    )
    with EASYINVOICE_WEB_LOCK:
        EASYINVOICE_WEB_AUTHS[auth.auth_id] = auth
        EASYINVOICE_LOGIN_FLOWS.pop(flow.flow_id, None)
    _easyinvoice_web_delete_state('flow', flow.flow_id)
    _easyinvoice_web_save_auth(auth)
    return auth


def _easyinvoice_web_drop_auth_state():
    auth_id = session.pop('easyinvoice_auth_id', None)
    if not auth_id:
        return
    with EASYINVOICE_WEB_LOCK:
        EASYINVOICE_WEB_AUTHS.pop(auth_id, None)
    _easyinvoice_web_delete_state('auth', auth_id)


def _easyinvoice_web_get_auth_state():
    _easyinvoice_web_purge_expired_state()
    auth_id = session.get('easyinvoice_auth_id')
    if not auth_id:
        return None
    with EASYINVOICE_WEB_LOCK:
        cached_auth = EASYINVOICE_WEB_AUTHS.get(auth_id)
    if cached_auth:
        return cached_auth
    auth = _easyinvoice_web_load_auth(auth_id)
    if auth:
        with EASYINVOICE_WEB_LOCK:
            EASYINVOICE_WEB_AUTHS[auth.auth_id] = auth
    return auth


def _easyinvoice_web_fetch_remote_html(auth: EasyInvoiceWebAuth, target_path: str):
    target_url = urljoin(EASYINVOICE_WEB_BASE_URL, target_path)
    request_obj = Request(target_url, headers={'Referer': auth.final_url or EASYINVOICE_WEB_BASE_URL})
    opener, cookie_jar = _easyinvoice_web_build_session(auth.cookies)
    with opener.open(request_obj, timeout=EASYINVOICE_REQUEST_TIMEOUT) as response:
        html = _easyinvoice_web_read_text_response(response)
        auth.final_url = response.geturl()
    _easyinvoice_web_store_auth_cookies(auth, cookie_jar)
    return html, auth.final_url


def _easyinvoice_web_auth_is_valid(auth: EasyInvoiceWebAuth, pattern: str):
    try:
        html, final_url = _easyinvoice_web_fetch_remote_html(auth, f'/EInvoice?Pattern={quote(pattern)}')
    except (HTTPError, URLError):
        return False
    return not _easyinvoice_web_looks_like_login_page(final_url, html)


def _easyinvoice_web_get_valid_auth(pattern: str):
    auth = _easyinvoice_web_get_auth_state()
    if auth and _easyinvoice_web_auth_is_valid(auth, pattern):
        return auth
    if auth:
        _easyinvoice_web_drop_auth_state()
    return None


def _easyinvoice_web_try_auto_login(pattern: str):
    config = _easyinvoice_config()
    if _easyinvoice_web_get_ocr_engine() is None:
        return {
            'auth': None,
            'flow': _easyinvoice_web_create_flow(pattern),
            'attempts': 0,
            'notice': 'OCR captcha chưa sẵn sàng. Vui lòng nhập captcha để vào EasyInvoice.',
            'ocr_enabled': False,
        }

    last_message = ''
    for attempt in range(1, EASYINVOICE_AUTO_CAPTCHA_ATTEMPTS + 1):
        flow = _easyinvoice_web_create_flow(pattern)
        try:
            opener, cookie_jar = _easyinvoice_web_build_session(flow.cookies)
            captcha_payload, _ = _easyinvoice_web_fetch_captcha_data(opener, flow.page_url, flow.form)
            _easyinvoice_web_store_flow_cookies(flow, cookie_jar)
            captcha_guess = _easyinvoice_web_guess_captcha(captcha_payload)
            if len(captcha_guess) < 4:
                last_message = f'OCR captcha lần {attempt} không đọc được đủ ký tự.'
                _easyinvoice_web_discard_flow(flow)
                continue

            result = _easyinvoice_web_attempt_login(
                opener,
                flow.page_url,
                flow.form,
                _easyinvoice_web_clean_text(config.get('tax_code')),
                _easyinvoice_web_clean_text(config.get('username')),
                _easyinvoice_web_clean_text(config.get('password')),
                captcha_guess,
            )
            _easyinvoice_web_store_flow_cookies(flow, cookie_jar)
            if result.get('success'):
                auth = _easyinvoice_web_create_auth(flow, result.get('final_url') or EASYINVOICE_WEB_BASE_URL)
                session['easyinvoice_auth_id'] = auth.auth_id
                return {
                    'auth': auth,
                    'flow': None,
                    'attempts': attempt,
                    'notice': f'Đã tự vào EasyInvoice sau {attempt} lần OCR captcha.',
                    'ocr_enabled': True,
                }

            last_message = result.get('message') or f'OCR captcha lần {attempt} chưa đúng.'
        except (HTTPError, URLError) as exc:
            last_message = getattr(exc, 'reason', None) or str(exc)
        except Exception as exc:
            last_message = str(exc)
        finally:
            _easyinvoice_web_discard_flow(flow)

    manual_flow = _easyinvoice_web_create_flow(pattern)
    return {
        'auth': None,
        'flow': manual_flow,
        'attempts': EASYINVOICE_AUTO_CAPTCHA_ATTEMPTS,
        'notice': last_message or 'OCR captcha thất bại 3 lần. Vui lòng nhập captcha.',
        'ocr_enabled': True,
    }


def _easyinvoice_web_bootstrap_script():
    return f"""
<script>
(function() {{
  const remoteOrigin = {json.dumps(EASYINVOICE_WEB_BASE_URL)};
  const proxyPrefix = {json.dumps(EASYINVOICE_WEB_PROXY_PREFIX)};
  const hiddenTexts = ['menu gop', 'lien he ho tro', '(api)'];
  const hiddenSelectors = [
    '.menu-toggle',
    '.menu-support',
    'li.notify',
    '#notify-container',
    '#new-feature-popup',
    '.show-notify-feature',
    '#zalo-container',
    '.register-decl-btn',
    'a[href*="/Account/Changepassword"]',
    'a[href*="zalo.me"]',
    'img[src*="ZaloOA.png"]'
  ];

  function foldText(value) {{
    return String(value || '')
      .normalize('NFD')
      .replace(/[\\u0300-\\u036f]/g, '')
      .toLowerCase()
      .trim();
  }}

  function hideNode(node) {{
    if (!node || node.nodeType !== 1) return;
    const target = node.closest('li, .menu-toggle, .menu-support, .notify, .new-feature, .show-notify-feature, #zalo-container, .register-decl-btn') || node;
    target.style.setProperty('display', 'none', 'important');
    target.style.setProperty('visibility', 'hidden', 'important');
    target.setAttribute('data-jewelry-hidden', '1');
  }}

  function hideEasyInvoiceChrome() {{
    hiddenSelectors.forEach((selector) => {{
      document.querySelectorAll(selector).forEach(hideNode);
    }});

    document.querySelectorAll('a, li, span, div, button').forEach((node) => {{
      const text = foldText(node.textContent);
      if (!text) return;
      if (hiddenTexts.some((entry) => text.includes(entry))) {{
        hideNode(node);
      }}
    }});
  }}

  const injectedStyleId = 'jewelryEasyInvoiceHideChrome';
  function ensureInjectedStyle() {{
    if (document.getElementById(injectedStyleId)) return;
    const style = document.createElement('style');
    style.id = injectedStyleId;
    style.textContent = `
.menu-toggle,
.menu-support,
li.notify,
#notify-container,
#new-feature-popup,
.show-notify-feature,
#zalo-container,
.register-decl-btn,
a[href*="/Account/Changepassword"],
a[href*="zalo.me"],
img[src*="ZaloOA.png"] {{
  display: none !important;
  visibility: hidden !important;
}}
`;
    (document.head || document.documentElement).appendChild(style);
  }}

  function proxify(input) {{
    if (!input || typeof input !== 'string') return input;
    if (/^(javascript:|data:|mailto:|#)/i.test(input)) return input;
    let url;
    try {{
      url = new URL(input, window.location.href);
    }} catch (error) {{
      return input;
    }}
    if (url.origin !== window.location.origin && url.origin !== remoteOrigin) {{
      return input;
    }}
    if (url.pathname.startsWith(proxyPrefix + '/')) {{
      return url.pathname + url.search + url.hash;
    }}
    return proxyPrefix + url.pathname + url.search + url.hash;
  }}

  const originalFetch = window.fetch;
  if (originalFetch) {{
    window.fetch = function(input, init) {{
      if (typeof input === 'string') {{
        input = proxify(input);
      }} else if (input && input.url) {{
        input = new Request(proxify(input.url), input);
      }}
      return originalFetch.call(this, input, init);
    }};
  }}

  const originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url) {{
    arguments[1] = proxify(url);
    return originalOpen.apply(this, arguments);
  }};

  document.addEventListener('submit', function(event) {{
    const form = event.target;
    if (form && form.action) {{
      form.action = proxify(form.action);
    }}
  }}, true);

  ensureInjectedStyle();
  hideEasyInvoiceChrome();
  document.addEventListener('DOMContentLoaded', function() {{
    ensureInjectedStyle();
    hideEasyInvoiceChrome();
  }});
  window.addEventListener('load', hideEasyInvoiceChrome);
  window.setTimeout(hideEasyInvoiceChrome, 200);
  window.setTimeout(hideEasyInvoiceChrome, 1200);

  const observer = new MutationObserver(function() {{
    hideEasyInvoiceChrome();
  }});
  observer.observe(document.documentElement || document.body, {{ childList: true, subtree: true }});
}})();
</script>
"""


def _easyinvoice_web_build_proxy_url(remote_url: str, page_url: str = ''):
    if not remote_url:
        return remote_url
    if remote_url.startswith(('javascript:', 'data:', 'mailto:', '#')):
        return remote_url

    if not remote_url.startswith(('/', 'http://', 'https://')) and page_url:
        remote_url = urljoin(page_url, remote_url)

    parsed = urlsplit(remote_url)
    remote_origin = urlsplit(EASYINVOICE_WEB_BASE_URL)
    if parsed.scheme and parsed.netloc:
        if parsed.netloc != remote_origin.netloc:
            return remote_url
        path = parsed.path or '/'
        query = f'?{parsed.query}' if parsed.query else ''
        fragment = f'#{parsed.fragment}' if parsed.fragment else ''
        return f'{EASYINVOICE_WEB_PROXY_PREFIX}{path}{query}{fragment}'

    if remote_url.startswith('/'):
        return f'{EASYINVOICE_WEB_PROXY_PREFIX}{remote_url}'
    return remote_url


def _easyinvoice_web_rewrite_html(html: str, page_url: str):
    def replacer(match):
        attribute = match.group(1)
        quote_char = match.group(2)
        url = match.group(3)
        return f'{attribute}={quote_char}{_easyinvoice_web_build_proxy_url(url, page_url)}{quote_char}'

    rewritten = re.sub(
        r"""(href|src|action)=([\"'])([^\"']+)\2""",
        replacer,
        html,
        flags=re.IGNORECASE,
    )
    bootstrap = _easyinvoice_web_bootstrap_script()
    head_match = re.search(r'</head>', rewritten, flags=re.IGNORECASE)
    if head_match:
        return ''.join((
            rewritten[:head_match.start()],
            bootstrap,
            head_match.group(0),
            rewritten[head_match.end():],
        ))
    return bootstrap + rewritten


def _easyinvoice_web_perform_remote_request(auth: EasyInvoiceWebAuth, target_url: str):
    headers = {}
    for header_name in ('Content-Type', 'Accept', 'X-Requested-With'):
        if header_name in request.headers:
            headers[header_name] = request.headers[header_name]
    headers['Origin'] = EASYINVOICE_WEB_BASE_URL
    headers['Referer'] = auth.final_url or EASYINVOICE_WEB_BASE_URL

    body = None
    if request.method in {'POST', 'PUT', 'PATCH', 'DELETE'}:
        body = request.get_data()

    parsed = urlsplit(target_url)
    safe_target_url = urlunsplit((
        parsed.scheme,
        parsed.netloc,
        quote(parsed.path, safe='/%'),
        quote(parsed.query, safe='=&/%:+,.-_'),
        parsed.fragment,
    ))

    request_obj = Request(safe_target_url, headers=headers, data=body, method=request.method)
    opener, cookie_jar = _easyinvoice_web_build_session(auth.cookies)
    try:
        response = opener.open(request_obj, timeout=EASYINVOICE_REQUEST_TIMEOUT)
        status_code = response.getcode()
    except HTTPError as exc:
        response = exc
        status_code = exc.code

    auth.final_url = response.geturl()
    _easyinvoice_web_store_auth_cookies(auth, cookie_jar)
    return status_code, {key: value for key, value in response.headers.items()}, response.read(), auth.final_url


def _easyinvoice_web_json_response(payload, status_code=200):
    response = jsonify(payload)
    response.status_code = status_code
    return response


def _easyinvoice_web_build_bootstrap_payload(
    flow,
    authenticated: bool,
    viewer_url: str,
    pattern: str,
    error_text='',
    notice_text='',
    auto_attempts=0,
    ocr_enabled=False,
):
    config = _easyinvoice_config()
    payload = {
        'authenticated': authenticated,
        'viewer_url': viewer_url,
        'pattern': pattern,
        'username': _easyinvoice_web_clean_text(config.get('username')),
        'tax_code': _easyinvoice_web_clean_text(config.get('tax_code')),
        'tenant_url': f'{EASYINVOICE_WEB_BASE_URL}/EInvoice?Pattern={quote(pattern)}',
        'ocr_enabled': bool(ocr_enabled),
        'auto_attempts': int(auto_attempts or 0),
    }
    if error_text:
        payload['error'] = error_text
    if notice_text:
        payload['notice'] = notice_text
    if flow:
        payload.update({
            'flow_id': flow.flow_id,
            'captcha_url': f'/api/easyinvoice/web/captcha/{flow.flow_id}',
        })
    return payload


@app.route('/api/easyinvoice/web/bootstrap', methods=['POST'])
def easyinvoice_web_bootstrap():
    payload = request.json if isinstance(request.json, dict) else {}
    target_payload = _easyinvoice_web_target_payload(payload)
    pattern = target_payload.get('pattern')
    if not pattern:
        return _easyinvoice_web_json_response({'error': 'Thieu pattern EasyInvoice.'}, 400)

    viewer_url = _easyinvoice_web_viewer_url(target_payload)
    auth = _easyinvoice_web_get_valid_auth(pattern)
    if auth:
        return _easyinvoice_web_json_response(
            _easyinvoice_web_build_bootstrap_payload(
                None,
                True,
                viewer_url,
                pattern,
                notice_text='Phiên EasyInvoice web đang còn hiệu lực.',
            )
        )

    try:
        auto_login = _easyinvoice_web_try_auto_login(pattern)
    except (RuntimeError, HTTPError, URLError) as exc:
        message = getattr(exc, 'reason', None) or str(exc)
        return _easyinvoice_web_json_response({'error': f'Khong tao duoc captcha EasyInvoice: {message}'}, 502)

    if auto_login.get('auth'):
        return _easyinvoice_web_json_response(
            _easyinvoice_web_build_bootstrap_payload(
                None,
                True,
                viewer_url,
                pattern,
                notice_text=auto_login.get('notice') or '',
                auto_attempts=auto_login.get('attempts') or 0,
                ocr_enabled=auto_login.get('ocr_enabled'),
            )
        )

    flow = auto_login.get('flow')
    return _easyinvoice_web_json_response(
        _easyinvoice_web_build_bootstrap_payload(
            flow,
            False,
            viewer_url,
            pattern,
            notice_text=auto_login.get('notice') or '',
            auto_attempts=auto_login.get('attempts') or 0,
            ocr_enabled=auto_login.get('ocr_enabled'),
        )
    )


@app.route('/api/easyinvoice/web/captcha/<flow_id>', methods=['GET'])
def easyinvoice_web_captcha(flow_id: str):
    flow = _easyinvoice_web_get_flow(flow_id)
    if not flow:
        return Response('Captcha session expired. Reload and try again.', status=410, mimetype='text/plain')
    try:
        opener, cookie_jar = _easyinvoice_web_build_session(flow.cookies)
        payload, content_type = _easyinvoice_web_fetch_captcha_data(opener, flow.page_url, flow.form)
        _easyinvoice_web_store_flow_cookies(flow, cookie_jar)
    except (HTTPError, URLError) as exc:
        message = getattr(exc, 'reason', None) or str(exc)
        return Response(f'Could not load captcha: {message}', status=502, mimetype='text/plain')
    response = Response(payload, mimetype=content_type)
    response.headers['Cache-Control'] = 'no-store, max-age=0'
    response.headers['Pragma'] = 'no-cache'
    return response


@app.route('/api/easyinvoice/web/login', methods=['POST'])
def easyinvoice_web_login():
    payload = request.json if isinstance(request.json, dict) else {}
    target_payload = _easyinvoice_web_target_payload(payload)
    pattern = target_payload.get('pattern')
    if not pattern:
        return _easyinvoice_web_json_response({'error': 'Thieu pattern EasyInvoice.'}, 400)

    flow_id = _easyinvoice_web_clean_text(payload.get('flow_id'))
    captcha = _easyinvoice_web_clean_text(payload.get('captcha'))
    viewer_url = _easyinvoice_web_viewer_url(target_payload)
    config = _easyinvoice_config()

    if not captcha:
        flow = _easyinvoice_web_replace_flow(flow_id, pattern)
        return _easyinvoice_web_json_response(
            _easyinvoice_web_build_bootstrap_payload(flow, False, viewer_url, pattern, 'Vui long nhap captcha EasyInvoice.', notice_text='OCR captcha chưa vào được web, vui lòng nhập tay.'),
            400,
        )

    flow = _easyinvoice_web_get_flow(flow_id)
    if not flow:
        flow = _easyinvoice_web_create_flow(pattern)
        return _easyinvoice_web_json_response(
            _easyinvoice_web_build_bootstrap_payload(flow, False, viewer_url, pattern, 'Captcha EasyInvoice da het han.'),
            410,
        )

    try:
        opener, cookie_jar = _easyinvoice_web_build_session(flow.cookies)
        result = _easyinvoice_web_attempt_login(
            opener,
            flow.page_url,
            flow.form,
            _easyinvoice_web_clean_text(config.get('tax_code')),
            _easyinvoice_web_clean_text(config.get('username')),
            _easyinvoice_web_clean_text(config.get('password')),
            captcha,
        )
        _easyinvoice_web_store_flow_cookies(flow, cookie_jar)
    except HTTPError as exc:
        flow = _easyinvoice_web_replace_flow(flow.flow_id, pattern)
        return _easyinvoice_web_json_response(
            _easyinvoice_web_build_bootstrap_payload(flow, False, viewer_url, pattern, f'EasyInvoice HTTP {exc.code}: {exc.reason}'),
            502,
        )
    except URLError as exc:
        flow = _easyinvoice_web_replace_flow(flow.flow_id, pattern)
        return _easyinvoice_web_json_response(
            _easyinvoice_web_build_bootstrap_payload(flow, False, viewer_url, pattern, f'Khong ket noi duoc EasyInvoice: {exc.reason}'),
            502,
        )

    if not result.get('success'):
        flow = _easyinvoice_web_replace_flow(flow.flow_id, pattern)
        return _easyinvoice_web_json_response(
            _easyinvoice_web_build_bootstrap_payload(flow, False, viewer_url, pattern, result.get('message') or 'Dang nhap EasyInvoice that bai.'),
            401,
        )

    auth = _easyinvoice_web_create_auth(flow, result.get('final_url') or EASYINVOICE_WEB_BASE_URL)
    session['easyinvoice_auth_id'] = auth.auth_id
    return _easyinvoice_web_json_response(
        _easyinvoice_web_build_bootstrap_payload(None, True, viewer_url, pattern, notice_text='Dang nhap EasyInvoice thanh cong.')
    )


@app.route('/api/easyinvoice/web/logout', methods=['POST'])
def easyinvoice_web_logout():
    _easyinvoice_web_drop_auth_state()
    return _easyinvoice_web_json_response({'ok': True})


@app.route(f'{EASYINVOICE_WEB_PROXY_PREFIX}', defaults={'subpath': ''}, methods=['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])
@app.route(f'{EASYINVOICE_WEB_PROXY_PREFIX}/<path:subpath>', methods=['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])
def easyinvoice_web_proxy(subpath: str):
    pattern = _easyinvoice_web_target_pattern(request.args.to_dict(flat=True))
    auth = _easyinvoice_web_get_valid_auth(pattern)
    if not auth:
        return Response('EasyInvoice session expired.', status=401, mimetype='text/plain')

    target_path = '/' + str(subpath or '').lstrip('/')
    query = request.query_string.decode('utf-8')
    target_url = urljoin(EASYINVOICE_WEB_BASE_URL, target_path.lstrip('/'))
    if query:
        target_url = f'{target_url}?{query}'

    status_code, response_headers, body, final_url = _easyinvoice_web_perform_remote_request(auth, target_url)
    content_type = response_headers.get('Content-Type', 'application/octet-stream')

    if 'text/html' in content_type.lower():
        charset = 'utf-8'
        if 'charset=' in content_type.lower():
            charset = content_type.split('charset=', 1)[1].split(';', 1)[0].strip()
        html = body.decode(charset, errors='replace')
        rewritten = _easyinvoice_web_rewrite_html(html, final_url)
        response = Response(rewritten, status=status_code, mimetype='text/html')
        response.headers['Cache-Control'] = 'no-store, max-age=0'
        return response

    response = Response(body, status=status_code, mimetype=content_type.split(';', 1)[0])
    for header_name in ('Content-Disposition', 'Cache-Control', 'Content-Type'):
        if header_name in response_headers:
            response.headers[header_name] = response_headers[header_name]
    return response


@app.route('/api/easyinvoice/web/viewer', methods=['GET'])
def easyinvoice_web_viewer():
    target_payload = _easyinvoice_web_target_payload(request.args.to_dict(flat=True))
    pattern = target_payload.get('pattern')
    if not pattern:
        return Response('Missing EasyInvoice pattern.', status=400, mimetype='text/plain')

    auth = _easyinvoice_web_get_valid_auth(pattern)
    if not auth:
        return Response(
            '<!doctype html><html><body style="font-family:sans-serif;padding:16px;">Phiên EasyInvoice đã hết hạn. Đóng modal và nhập captcha lại.</body></html>',
            status=401,
            mimetype='text/html',
        )

    list_url = f'{EASYINVOICE_WEB_PROXY_PREFIX}/EInvoice?Pattern={quote(pattern)}'
    meta_json = json.dumps(target_payload, ensure_ascii=False)
    html = f"""<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>EasyInvoice Viewer</title>
  <style>
    html, body {{
      margin: 0;
      height: 100%;
      background: #eef3f9;
      color: #0f172a;
      font-family: Arial, sans-serif;
    }}
    body {{
      display: flex;
      flex-direction: column;
    }}
    .bar {{
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 10px 12px;
      border-bottom: 1px solid rgba(15, 23, 42, .08);
      background: rgba(255,255,255,.96);
      box-shadow: 0 10px 24px rgba(15, 23, 42, .08);
    }}
    .status {{
      min-width: 0;
      font-size: 12px;
      line-height: 1.5;
      color: #475569;
    }}
    .actions {{
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }}
    button {{
      border-radius: 999px;
      border: 1px solid #dbe4ee;
      background: #ffffff;
      color: #0f172a;
      padding: 8px 12px;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
    }}
    button.primary {{
      border-color: transparent;
      background: linear-gradient(135deg, #1d4ed8, #2563eb);
      color: #ffffff;
    }}
    iframe {{
      flex: 1;
      width: 100%;
      border: 0;
      background: #ffffff;
    }}
  </style>
</head>
<body>
  <div class="bar">
    <div id="status" class="status">Đang tìm hóa đơn vừa tạo trên EasyInvoice...</div>
    <div class="actions">
      <button id="btnReload" type="button">Tải lại</button>
      <button id="btnSign" type="button">Tới phần ký số</button>
      <button id="btnOpen" type="button" class="primary">Mở tab</button>
    </div>
  </div>
  <iframe id="easyinvoiceFrame" src="{list_url}" title="EasyInvoice"></iframe>
  <script>
    const meta = {meta_json};
    const frame = document.getElementById('easyinvoiceFrame');
    const statusEl = document.getElementById('status');
    let pollHandle = null;

    function setStatus(message) {{
      statusEl.textContent = message;
    }}

    function normalizeText(value) {{
      return String(value || '')
        .normalize('NFD')
        .replace(/[\\u0300-\\u036f]/g, '')
        .toLowerCase()
        .trim();
    }}

    function digitsOnly(value) {{
      return String(value || '').replace(/\\D/g, '');
    }}

    function toProxy(url) {{
      if (!url) return '';
      if (url.startsWith('{EASYINVOICE_WEB_PROXY_PREFIX}')) return url;
      const parsed = new URL(url, window.location.origin);
      if (parsed.origin === window.location.origin && parsed.pathname.startsWith('{EASYINVOICE_WEB_PROXY_PREFIX}/')) {{
        return parsed.pathname + parsed.search + parsed.hash;
      }}
      if (parsed.origin === {json.dumps(EASYINVOICE_WEB_BASE_URL)}) {{
        return '{EASYINVOICE_WEB_PROXY_PREFIX}' + parsed.pathname + parsed.search + parsed.hash;
      }}
      return url;
    }}

    function anchorContext(anchor) {{
      const row = anchor.closest('tr') || anchor.closest('li') || anchor.closest('div') || anchor.parentElement || anchor;
      return normalizeText(row.innerText || anchor.innerText || '');
    }}

    function scoreAnchor(anchor) {{
      const context = anchorContext(anchor);
      let score = 0;
      if (meta.ikey && context.includes(normalizeText(meta.ikey))) score += 12;
      if (meta.invoice_no && context.includes(normalizeText(meta.invoice_no))) score += 9;
      if (meta.lookup_code && context.includes(normalizeText(meta.lookup_code))) score += 7;
      if (meta.buyer && context.includes(normalizeText(meta.buyer))) score += 4;
      if (meta.amount) {{
        const amountDigits = digitsOnly(meta.amount);
        if (amountDigits && digitsOnly(context).includes(amountDigits)) score += 3;
      }}
      return score;
    }}

    function findBestEditLink(doc) {{
      const anchors = Array.from(doc.querySelectorAll('a[href*="/EInvoice/Edit/"]'));
      if (!anchors.length) return null;
      let best = anchors[0];
      let bestScore = scoreAnchor(best);
      for (const anchor of anchors.slice(1)) {{
        const score = scoreAnchor(anchor);
        if (score > bestScore) {{
          best = anchor;
          bestScore = score;
        }}
      }}
      return best;
    }}

    function stopPolling() {{
      if (pollHandle) {{
        clearInterval(pollHandle);
        pollHandle = null;
      }}
    }}

    function startPolling() {{
      stopPolling();
      let attempts = 0;
      pollHandle = window.setInterval(() => {{
        attempts += 1;
        try {{
          const innerWindow = frame.contentWindow;
          const innerDoc = innerWindow.document;
          const currentPath = String(innerWindow.location.pathname || '');
          if (/\\/account\\/logon/i.test(currentPath)) {{
            setStatus('Phiên EasyInvoice đã hết. Đóng modal và nhập captcha lại.');
            stopPolling();
            return;
          }}
          if (/\\/EInvoice\\/Edit\\//i.test(currentPath)) {{
            setStatus('Đã mở đúng trang chỉnh sửa EasyInvoice.');
            stopPolling();
            return;
          }}
          const nextLink = findBestEditLink(innerDoc);
          if (nextLink) {{
            setStatus('Đang mở trang chỉnh sửa của hóa đơn vừa tạo...');
            frame.src = toProxy(nextLink.href);
            stopPolling();
            return;
          }}
        }} catch (error) {{
        }}
        if (attempts >= 80) {{
          setStatus('Không tự định vị được hóa đơn. Bạn có thể chọn trực tiếp trong danh sách EasyInvoice.');
          stopPolling();
        }}
      }}, 500);
    }}

    function scrollToSignArea() {{
      try {{
        const innerWindow = frame.contentWindow;
        const innerDoc = innerWindow.document;
        const selectors = ['.bgimg', '#footer', '#dialogServer', '#dialogClient', '.label-sign', '.mccqt'];
        let target = selectors.map(selector => innerDoc.querySelector(selector)).find(Boolean);
        if (!target) {{
          target = Array.from(innerDoc.querySelectorAll('div, p, span, td, strong, b'))
            .find(node => /signature valid|ký bởi|ky boi|người bán hàng|nguoi ban hang/i.test(String(node.innerText || '')));
        }}
        if (target) {{
          target.scrollIntoView({{ behavior: 'smooth', block: 'center' }});
          setStatus('Đã kéo tới vùng ký số.');
          return;
        }}
        innerWindow.scrollTo({{ top: innerDoc.body.scrollHeight, behavior: 'smooth' }});
        setStatus('Đã kéo xuống cuối trang hóa đơn.');
      }} catch (error) {{
        setStatus('Không kéo được tới vùng ký số. Hãy cuộn trực tiếp trong iframe.');
      }}
    }}

    document.getElementById('btnReload').addEventListener('click', () => {{
      setStatus('Đang tải lại EasyInvoice...');
      frame.src = {json.dumps(list_url)};
      startPolling();
    }});

    document.getElementById('btnSign').addEventListener('click', scrollToSignArea);
    document.getElementById('btnOpen').addEventListener('click', () => {{
      const nextUrl = frame.getAttribute('src') || {json.dumps(list_url)};
      window.open(nextUrl, '_blank', 'noopener,noreferrer');
    }});

    frame.addEventListener('load', () => {{
      try {{
        const currentPath = String(frame.contentWindow.location.pathname || '');
        if (/\\/EInvoice\\/Edit\\//i.test(currentPath)) {{
          setStatus('Đã mở đúng trang chỉnh sửa EasyInvoice.');
          return;
        }}
      }} catch (error) {{
      }}
      setStatus('Đang tìm hóa đơn vừa tạo trên EasyInvoice...');
      startPolling();
    }});

    startPolling();
  </script>
</body>
</html>"""
    response = Response(html, mimetype='text/html')
    response.headers['Cache-Control'] = 'no-store, max-age=0'
    return response



@app.route('/api/easyinvoice/list', methods=['GET'])
def api_easyinvoice_list():
    return query_easyinvoice_cache_response(request.args)
