#!/usr/bin/env python3
"""
Jewelry device agent

Install runtime deps on the agent machine:
  python -m pip install flask requests pyserial

Run:
  python device_agent.py
"""

import base64
import copy
import ctypes
import ipaddress
import json
import os
import platform
import re
import socket
import subprocess
import sys
import tempfile
import threading
import time
import traceback
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from collections import deque
from ctypes import wintypes
from dataclasses import asdict, dataclass
from pathlib import Path

MISSING_PACKAGES = []

try:
    import requests
except ImportError:  # pragma: no cover - runtime guard
    requests = None
    MISSING_PACKAGES.append('requests')

try:
    from flask import Flask, jsonify, render_template_string, request
except ImportError:  # pragma: no cover - runtime guard
    Flask = None
    jsonify = None
    render_template_string = None
    request = None
    MISSING_PACKAGES.append('flask')

try:
    import serial
    from serial.tools import list_ports
except ImportError:  # pragma: no cover - runtime guard
    serial = None
    list_ports = None
    MISSING_PACKAGES.append('pyserial')

try:  # Optional. Used for raw printing to installed Windows printers.
    import win32print  # type: ignore
except Exception:  # pragma: no cover - optional
    win32print = None


APP_TITLE = 'Jewelry Device Agent'
CONFIG_FILE = Path(__file__).with_name('device_agent_config.json')
DASHBOARD_HOST = '127.0.0.1'
DASHBOARD_PORT = 8765
STATE_LOCK = threading.RLock()
LOGS = deque(maxlen=250)
HOST_ALIAS_CACHE = {}

AND_SERIAL_DEFAULTS = {
    'port': 'COM3',
    'baudrate': 1200,
    'bytesize': 7,
    'parity': 'E',
    'stopbits': 1,
    'timeout_seconds': 2.5,
    'listen_seconds': 3.0,
    'encoding': 'ascii',
    'command': 'Q',
    'line_ending': '\\r',
    'data_format': 'A&D',
}

SARTORIUS_SERIAL_DEFAULTS = {
    'port': '',
    'auto_detect_port': True,
    'baudrate': 1200,
    'bytesize': 8,
    'parity': 'N',
    'stopbits': 1,
    'timeout_seconds': 1.0,
    'listen_seconds': 2.0,
    'encoding': 'utf-8',
    'command': '',
    'line_ending': '\\r\\n',
    'data_format': 'SARTORIUS',
}

DEFAULT_CONFIG = {
    'server_url': 'http://127.0.0.1:5001',
    'agent_key': '',
    'device_name': 'Device agent',
    'location': '',
    'scale': {
        'enabled': True,
        'poll_interval_seconds': 3,
        'heartbeat_interval_seconds': 15,
        'serial': AND_SERIAL_DEFAULTS,
    },
    'sartorius': {
        'enabled': True,
        'poll_interval_seconds': 3,
        'heartbeat_interval_seconds': 15,
        'serial': SARTORIUS_SERIAL_DEFAULTS,
    },
    'printer': {
        'enabled': True,
        'poll_interval_seconds': 1,
        'heartbeat_interval_seconds': 15,
        'scan_interval_seconds': 90,
        'scan_network_shares': True,
        'network_host_limit': 0,
    },
}


def now_str():
    return time.strftime('%d/%m/%Y %H:%M:%S')


def log(message, level='info'):
    entry = {
        'time': now_str(),
        'level': level,
        'message': str(message),
    }
    with STATE_LOCK:
        LOGS.appendleft(entry)
    print(f"[{entry['time']}] {entry['message']}", flush=True)


def deep_merge(base, override):
    result = copy.deepcopy(base)
    for key, value in (override or {}).items():
        if isinstance(value, dict) and isinstance(result.get(key), dict):
            result[key] = deep_merge(result[key], value)
        else:
            result[key] = copy.deepcopy(value)
    return result


def coerce_bool(value, default=False):
    if isinstance(value, bool):
        return value
    if value in (None, ''):
        return default
    return str(value).strip().lower() in {'1', 'true', 'yes', 'y', 'on'}


def coerce_int(value, default):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def coerce_float(value, default):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def clean_text(value):
    if value is None:
        return ''
    return re.sub(r'\s+', ' ', str(value)).strip()


def normalize_indicator_kind(value, default='and'):
    text = clean_text(value).lower()
    if text in {'sartorius', 'startorius', 'sarto'}:
        return 'sartorius'
    if text in {'a&d', 'and', 'a+d', 'ad', 'scale', 'weight indicator', 'weight_indicator'}:
        return 'and'
    return default


def detect_command_indicator_kind(command, payload=None, default='and'):
    payload = payload if isinstance(payload, dict) else {}
    for key in ('device_type', 'indicator_type', 'scale_type', 'device_kind', 'indicator', 'model'):
        value = payload.get(key)
        if value not in (None, ''):
            return normalize_indicator_kind(value, default=default)
        value = command.get(key) if isinstance(command, dict) else None
        if value not in (None, ''):
            return normalize_indicator_kind(value, default=default)
    return default


def simplify_print_error_message(error, printer_name=''):
    raw = clean_text(error)
    target = clean_text(printer_name)
    lowered = raw.lower()
    shared_printer_error = any(token in lowered for token in (
        '0x8007011b',
        '0x0000011b',
        'invalidprinterexception',
        'settings to access printer',
        'openprinter failed',
        'startdocprinter failed',
        'the printer name is invalid',
    ))
    if shared_printer_error:
        label = target or 'the selected printer'
        return (
            f"Windows on this PC cannot access shared printer '{label}'. "
            "This is usually a Windows Point-and-Print or shared-printer permission issue, not a dashboard bug. "
            "Install the printer locally on this PC or run the agent on the PC that shares the printer."
        )
    invalid_ip_unc = any(token in lowered for token in (
        '0x80070709',
        'the printer name is invalid',
    )) and bool(normalize_unc_path(target)) and is_ipv4_address(split_unc_path(target)[0])
    if invalid_ip_unc:
        host, share_name = split_unc_path(target)
        suggested_host = resolve_host_display_name(host)
        suggestion = f" Try the host name path '\\\\{suggested_host}\\{share_name}' instead of the IP path." if suggested_host and share_name else ''
        return (
            f"Windows on this PC rejected shared printer '{target}' because it is using an IP-based UNC path. "
            f"Some Windows printer APIs require the printer host name instead of the IP address.{suggestion}"
        )
    if 'access is denied' in lowered:
        label = target or 'the selected printer'
        return f"Access was denied while trying to print to '{label}'. Check printer-share permissions on the host PC."
    return raw or 'Print failed.'


def normalize_unc_path(value):
    raw = str(value or '').strip()
    if not raw:
        return ''
    raw = raw.replace('/', '\\')
    if raw.startswith('\\'):
        while raw.startswith('\\\\\\'):
            raw = raw[1:]
        parts = [part for part in raw.lstrip('\\').split('\\') if part]
        if len(parts) >= 2:
            return '\\\\' + parts[0] + '\\' + parts[1]
    return ''


def split_unc_path(value):
    unc_path = normalize_unc_path(value)
    if not unc_path:
        return '', ''
    parts = [part for part in unc_path.lstrip('\\').split('\\') if part]
    if len(parts) < 2:
        return '', ''
    return clean_text(parts[0]), clean_text(parts[1])


def build_unc_path(host, share_name):
    host = clean_text(host).strip('\\/')
    share_name = clean_text(share_name).strip('\\/')
    if not host or not share_name:
        return ''
    return f'\\\\{host}\\{share_name}'


def extract_unc_path(*values):
    for value in values:
        unc_path = normalize_unc_path(value)
        if unc_path:
            return unc_path
    return ''


def normalize_host_candidate(value):
    host = clean_text(value).strip('\\/')
    if not host:
        return ''
    return host


def is_ipv4_address(value):
    return bool(re.match(r'^\d{1,3}(?:\.\d{1,3}){3}$', clean_text(value)))


def compact_host_label(value):
    host = normalize_host_candidate(value)
    if not host:
        return ''
    if is_ipv4_address(host):
        return host
    return host.split('.', 1)[0]


def parse_printer_selector(value):
    selector = clean_text(value)
    if not selector:
        return '', ''
    unc_path = normalize_unc_path(selector)
    if unc_path:
        return split_unc_path(unc_path)

    compact = selector.replace('\\', '/')
    for separator in ('/', '|', ':', '@'):
        if separator in compact:
            host, share_name = compact.split(separator, 1)
            host = normalize_host_candidate(host)
            share_name = clean_text(share_name)
            if host and share_name:
                return host, share_name
    return '', ''


def format_win32_error(error_code):
    code = int(error_code or 0)
    if not code:
        return ''
    try:
        return ctypes.FormatError(code).strip()
    except Exception:
        return f'Win32 error {code}'


def resolve_host_aliases(host):
    target = normalize_host_candidate(host)
    if not target:
        return set()
    key = target.lower()
    cached = HOST_ALIAS_CACHE.get(key)
    if cached is not None:
        return set(cached)

    aliases = {key}
    try:
        canonical_name, alt_names, ip_addresses = socket.gethostbyname_ex(target)
        aliases.add(clean_text(canonical_name).lower())
        aliases.update(clean_text(name).lower() for name in alt_names if clean_text(name))
        aliases.update(clean_text(address).lower() for address in ip_addresses if clean_text(address))
    except OSError:
        pass

    HOST_ALIAS_CACHE[key] = sorted(alias for alias in aliases if alias)
    return set(HOST_ALIAS_CACHE[key])


def resolve_host_display_name(host):
    target = normalize_host_candidate(host)
    if not target:
        return ''

    candidates = []
    try:
        if is_ipv4_address(target):
            reverse_name, reverse_aliases, _ = socket.gethostbyaddr(target)
            candidates = [reverse_name, *reverse_aliases]
        else:
            canonical_name, alt_names, _ = socket.gethostbyname_ex(target)
            candidates = [canonical_name, *alt_names]
    except OSError:
        candidates = []

    for candidate in candidates:
        label = compact_host_label(candidate)
        if label and not is_ipv4_address(label):
            return label
    return compact_host_label(target)


def build_printer_aliases(device):
    aliases = set()
    printer_name = clean_text(device.get('printer_name'))
    share_name = clean_text(device.get('share_name'))
    unc_path = normalize_unc_path(device.get('unc_path'))
    system_name = normalize_host_candidate(device.get('system_name'))
    port_name = clean_text(device.get('port_name'))

    for value in (printer_name, share_name, unc_path, system_name, port_name):
        if value:
            aliases.add(value.lower())

    host, share = split_unc_path(unc_path)
    host = host or system_name
    share = share or share_name or printer_name
    host_aliases = resolve_host_aliases(host) or ({host.lower()} if host else set())
    if host_aliases and share:
        for alias in (
            share.lower(),
            printer_name.lower() if printer_name else '',
        ):
            if alias:
                aliases.add(alias)
        for host_alias in host_aliases:
            for alias in (
                build_unc_path(host_alias, share),
                f'{host_alias}/{share}',
                f'{host_alias}\\{share}',
                f'{host_alias}|{share}',
                f'{host_alias}:{share}',
                f'{host_alias}@{share}',
            ):
                aliases.add(alias.lower())

    return sorted(alias for alias in aliases if alias)


def with_printer_aliases(device):
    enriched = copy.deepcopy(device)
    enriched['unc_path'] = normalize_unc_path(enriched.get('unc_path'))
    if not clean_text(enriched.get('share_name')):
        _, share_name = split_unc_path(enriched.get('unc_path'))
        if share_name:
            enriched['share_name'] = share_name
    if not clean_text(enriched.get('system_name')):
        host, _ = split_unc_path(enriched.get('unc_path'))
        if host:
            enriched['system_name'] = host
    host_key = normalize_host_candidate(enriched.get('system_name'))
    if not host_key:
        host_key, _ = split_unc_path(enriched.get('unc_path'))
    enriched['host_pc'] = resolve_host_display_name(host_key)
    if is_ipv4_address(host_key):
        enriched['host_address'] = host_key
    else:
        host_aliases = resolve_host_aliases(host_key)
        enriched['host_address'] = next((alias for alias in host_aliases if is_ipv4_address(alias)), '')
    enriched['aliases'] = build_printer_aliases(enriched)
    return enriched


def build_printer_unc_candidates(device):
    enriched = with_printer_aliases(device or {})
    unc_path = normalize_unc_path(enriched.get('unc_path'))
    host_from_unc, share_from_unc = split_unc_path(unc_path)
    share_name = clean_text(share_from_unc or enriched.get('share_name') or enriched.get('printer_name'))
    if not share_name:
        return [unc_path] if unc_path else []

    candidates = []
    seen = set()

    def append_host(host):
        path = build_unc_path(host, share_name)
        if path and path.lower() not in seen:
            candidates.append(path)
            seen.add(path.lower())

    preferred_host = clean_text(enriched.get('host_pc'))
    system_name = normalize_host_candidate(enriched.get('system_name'))
    host_address = clean_text(enriched.get('host_address'))

    if host_from_unc and is_ipv4_address(host_from_unc) and preferred_host:
        append_host(preferred_host)
    append_host(host_from_unc)
    append_host(preferred_host)
    append_host(system_name)
    append_host(host_address)

    if unc_path and unc_path.lower() not in seen:
        candidates.append(unc_path)
    return candidates


def ensure_runtime_deps():
    if not MISSING_PACKAGES:
        return
    packages = ' '.join(sorted(set(MISSING_PACKAGES)))
    print(f'Missing packages: {packages}', file=sys.stderr)
    print(f'Install with: {sys.executable} -m pip install {packages}', file=sys.stderr)
    raise SystemExit(1)


def normalize_config(raw):
    config = deep_merge(DEFAULT_CONFIG, raw or {})
    config['server_url'] = clean_text(config.get('server_url') or DEFAULT_CONFIG['server_url']).rstrip('/')
    config['agent_key'] = clean_text(config.get('agent_key'))
    config['device_name'] = clean_text(config.get('device_name') or 'Device agent') or 'Device agent'
    config['location'] = clean_text(config.get('location'))
    config['scale']['enabled'] = coerce_bool(config['scale'].get('enabled'), True)
    config['scale']['poll_interval_seconds'] = coerce_float(config['scale'].get('poll_interval_seconds'), 3)
    config['scale']['heartbeat_interval_seconds'] = coerce_float(config['scale'].get('heartbeat_interval_seconds'), 15)
    config['sartorius']['enabled'] = coerce_bool(config['sartorius'].get('enabled'), True)
    config['sartorius']['poll_interval_seconds'] = coerce_float(config['sartorius'].get('poll_interval_seconds'), 3)
    config['sartorius']['heartbeat_interval_seconds'] = coerce_float(config['sartorius'].get('heartbeat_interval_seconds'), 15)
    config['printer']['enabled'] = coerce_bool(config['printer'].get('enabled'), True)
    config['printer']['poll_interval_seconds'] = coerce_float(config['printer'].get('poll_interval_seconds'), 1)
    config['printer']['heartbeat_interval_seconds'] = coerce_float(config['printer'].get('heartbeat_interval_seconds'), 15)
    config['printer']['scan_interval_seconds'] = coerce_float(config['printer'].get('scan_interval_seconds'), 90)
    config['printer']['scan_network_shares'] = coerce_bool(config['printer'].get('scan_network_shares'), True)
    config['printer']['network_host_limit'] = coerce_int(config['printer'].get('network_host_limit'), 0)
    config['scale']['serial'] = normalize_serial_settings(config['scale'].get('serial') or {}, defaults=AND_SERIAL_DEFAULTS)
    config['sartorius']['serial'] = normalize_sartorius_settings(config['sartorius'].get('serial') or {})
    return config


def load_config():
    if CONFIG_FILE.exists():
        try:
            raw = json.loads(CONFIG_FILE.read_text(encoding='utf-8'))
        except Exception as exc:
            log(f'Config parse failed, fallback to defaults: {exc}', level='error')
            raw = {}
    else:
        raw = {}
    return normalize_config(raw)


def save_config(config):
    CONFIG_FILE.write_text(json.dumps(normalize_config(config), indent=2, ensure_ascii=False), encoding='utf-8')


def parse_request_config(payload):
    payload = payload if isinstance(payload, dict) else {}
    current = load_config()
    next_config = deep_merge(current, {
        'server_url': payload.get('server_url'),
        'agent_key': payload.get('agent_key'),
        'device_name': payload.get('device_name'),
        'location': payload.get('location'),
        'scale': {
            'enabled': payload.get('scale_enabled'),
            'poll_interval_seconds': payload.get('scale_poll_interval_seconds'),
            'heartbeat_interval_seconds': payload.get('scale_heartbeat_interval_seconds'),
            'serial': {
                'port': payload.get('scale_port'),
                'baudrate': payload.get('scale_baudrate'),
                'bytesize': payload.get('scale_bytesize'),
                'parity': payload.get('scale_parity'),
                'stopbits': payload.get('scale_stopbits'),
                'timeout_seconds': payload.get('scale_timeout_seconds'),
                'listen_seconds': payload.get('scale_listen_seconds'),
                'encoding': payload.get('scale_encoding'),
                'command': payload.get('scale_command'),
                'line_ending': payload.get('scale_line_ending'),
                'data_format': payload.get('scale_data_format'),
            },
        },
        'sartorius': {
            'enabled': payload.get('sartorius_enabled'),
            'poll_interval_seconds': payload.get('sartorius_poll_interval_seconds'),
            'heartbeat_interval_seconds': payload.get('sartorius_heartbeat_interval_seconds'),
            'serial': {
                'auto_detect_port': payload.get('sartorius_auto_detect_port'),
                'port': payload.get('sartorius_port'),
                'baudrate': payload.get('sartorius_baudrate'),
                'bytesize': payload.get('sartorius_bytesize'),
                'parity': payload.get('sartorius_parity'),
                'stopbits': payload.get('sartorius_stopbits'),
                'timeout_seconds': payload.get('sartorius_timeout_seconds'),
                'listen_seconds': payload.get('sartorius_listen_seconds'),
                'encoding': payload.get('sartorius_encoding'),
                'command': payload.get('sartorius_command'),
                'line_ending': payload.get('sartorius_line_ending'),
                'data_format': payload.get('sartorius_data_format'),
            },
        },
        'printer': {
            'enabled': payload.get('printer_enabled'),
            'poll_interval_seconds': payload.get('printer_poll_interval_seconds'),
            'heartbeat_interval_seconds': payload.get('printer_heartbeat_interval_seconds'),
            'scan_interval_seconds': payload.get('printer_scan_interval_seconds'),
            'scan_network_shares': payload.get('printer_scan_network_shares'),
            'network_host_limit': payload.get('printer_network_host_limit'),
        },
    })
    return normalize_config(next_config)


PARITY_MAP = {
    'N': serial.PARITY_NONE if serial else None,
    'E': serial.PARITY_EVEN if serial else None,
    'O': serial.PARITY_ODD if serial else None,
    'M': serial.PARITY_MARK if serial else None,
    'S': serial.PARITY_SPACE if serial else None,
}

BYTESIZE_MAP = {
    5: serial.FIVEBITS if serial else None,
    6: serial.SIXBITS if serial else None,
    7: serial.SEVENBITS if serial else None,
    8: serial.EIGHTBITS if serial else None,
}

STOPBITS_MAP = {
    1.0: serial.STOPBITS_ONE if serial else None,
    1.5: serial.STOPBITS_ONE_POINT_FIVE if serial else None,
    2.0: serial.STOPBITS_TWO if serial else None,
}

NEWLINE_MAP = {
    'none': b'',
    'cr': b'\r',
    'lf': b'\n',
    'crlf': b'\r\n',
}

WEIGHT_RE = re.compile(r'([+-]?\d+(?:\.\d+)?)\s*([A-Za-z%]+)?')
PORT_LOCK = threading.Lock()


@dataclass
class ReadConfig:
    port: str = 'COM3'
    baudrate: int = 2400
    bytesize: int = 7
    parity: str = 'E'
    stopbits: float = 1.0
    timeout: float = 1.0
    listen_seconds: float = 3.0
    encoding: str = 'ascii'
    command: str = 'Q'
    newline: str = 'cr'
    data_format: str = 'AUTO'


def decode_line_ending(value):
    if not isinstance(value, str) or not value:
        return '\r'
    try:
        return bytes(value, 'utf-8').decode('unicode_escape')
    except UnicodeDecodeError:
        return value


def normalize_newline_key(value):
    normalized = decode_line_ending(value)
    for key, raw in NEWLINE_MAP.items():
        if raw == normalized.encode('utf-8'):
            return key
    if normalized == '\n':
        return 'lf'
    if normalized == '\r\n':
        return 'crlf'
    if normalized == '\r':
        return 'cr'
    return 'none'


def normalize_serial_settings(local_settings, desired_settings=None, command_payload=None, defaults=None):
    defaults = deep_merge({
        'port': 'COM3',
        'baudrate': 2400,
        'bytesize': 7,
        'parity': 'E',
        'stopbits': 1.0,
        'timeout_seconds': 2.5,
        'listen_seconds': 3.0,
        'encoding': 'ascii',
        'command': 'Q',
        'line_ending': '\\r',
        'data_format': 'AUTO',
    }, defaults or {})
    desired_settings = desired_settings or {}
    command_payload = command_payload or {}
    merged = deep_merge(defaults, deep_merge(local_settings or {}, desired_settings or {}))
    override_map = {
        'serial_port': 'port',
        'port': 'port',
        'baudrate': 'baudrate',
        'baud_rate': 'baudrate',
        'bytesize': 'bytesize',
        'data_bits': 'bytesize',
        'parity': 'parity',
        'stopbits': 'stopbits',
        'stop_bits': 'stopbits',
        'timeout_seconds': 'timeout_seconds',
        'timeout': 'timeout_seconds',
        'listen_seconds': 'listen_seconds',
        'encoding': 'encoding',
        'line_ending': 'line_ending',
        'data_format': 'data_format',
    }
    for source_key, target_key in override_map.items():
        if command_payload.get(source_key) not in (None, ''):
            merged[target_key] = command_payload[source_key]
    if command_payload.get('serial_command'):
        merged['command'] = command_payload['serial_command']
    if command_payload.get('command') not in (None, ''):
        merged['command'] = command_payload['command']
    if command_payload.get('timeout_seconds') not in (None, ''):
        merged['timeout_seconds'] = command_payload['timeout_seconds']
    if command_payload.get('listen_seconds') not in (None, ''):
        merged['listen_seconds'] = command_payload['listen_seconds']
    if command_payload.get('encoding'):
        merged['encoding'] = command_payload['encoding']
    if command_payload.get('line_ending'):
        merged['line_ending'] = command_payload['line_ending']

    default_port = clean_text(defaults.get('port'))
    default_timeout = coerce_float(defaults.get('timeout_seconds'), 2.5)
    default_listen = coerce_float(defaults.get('listen_seconds'), max(default_timeout, 3.0))

    port = clean_text(merged.get('port') or merged.get('serial_port') or default_port)
    baudrate = coerce_int(merged.get('baudrate') or merged.get('baud_rate'), coerce_int(defaults.get('baudrate'), 2400))
    bytesize = coerce_int(merged.get('bytesize') or merged.get('data_bits'), coerce_int(defaults.get('bytesize'), 7))
    parity = clean_text(merged.get('parity') or defaults.get('parity') or 'E').upper()[:1] or 'E'
    stopbits = coerce_float(merged.get('stopbits') or merged.get('stop_bits'), coerce_float(defaults.get('stopbits'), 1.0))
    timeout_seconds = coerce_float(merged.get('timeout_seconds') or merged.get('timeout'), default_timeout)
    listen_seconds = coerce_float(merged.get('listen_seconds'), max(timeout_seconds, default_listen))
    encoding = clean_text(merged.get('encoding') or defaults.get('encoding') or 'ascii') or 'ascii'
    command = str(merged.get('command') if merged.get('command') is not None else defaults.get('command') or '').strip()
    line_ending = decode_line_ending(merged.get('line_ending'))
    data_format = clean_text(merged.get('data_format') or defaults.get('data_format') or 'AUTO').upper() or 'AUTO'

    return {
        'port': port,
        'baudrate': baudrate,
        'bytesize': bytesize if bytesize in BYTESIZE_MAP else 7,
        'parity': parity if parity in PARITY_MAP else 'E',
        'stopbits': stopbits if stopbits in STOPBITS_MAP else 1.0,
        'timeout_seconds': timeout_seconds,
        'listen_seconds': listen_seconds,
        'encoding': encoding,
        'command': command,
        'line_ending': line_ending,
        'data_format': data_format,
    }


def find_sartorius_port():
    for port in list_serial_ports():
        text = ' '.join(
            clean_text(port.get(key))
            for key in ('device', 'description', 'manufacturer', 'product', 'serial_number')
            if clean_text(port.get(key))
        ).lower()
        if 'sartorius' in text:
            return port
    return None


def normalize_sartorius_settings(local_settings, desired_settings=None, command_payload=None):
    desired_settings = desired_settings or {}
    command_payload = command_payload or {}
    merged = deep_merge(local_settings or {}, desired_settings or {})
    auto_detect_port = coerce_bool(
        command_payload.get('auto_detect_port', merged.get('auto_detect_port')),
        coerce_bool(SARTORIUS_SERIAL_DEFAULTS.get('auto_detect_port'), True),
    )
    normalized = normalize_serial_settings(
        merged,
        command_payload=command_payload,
        defaults=SARTORIUS_SERIAL_DEFAULTS,
    )
    normalized['auto_detect_port'] = auto_detect_port
    return normalized


def list_serial_ports():
    if list_ports is None:
        return []
    ports = []
    for port in list_ports.comports():
        ports.append({
            'device': port.device,
            'description': port.description,
            'manufacturer': port.manufacturer,
            'product': port.product,
            'serial_number': port.serial_number,
            'location': port.location,
        })
    return ports


def get_port_metadata(port_name):
    target = clean_text(port_name).upper()
    for port in list_serial_ports():
        if clean_text(port.get('device')).upper() == target:
            return port
    return None


def split_messages(buffer):
    messages = []
    start = 0
    index = 0
    while index < len(buffer):
        current = buffer[index]
        if current == 13:
            end = index + 1
            if end < len(buffer) and buffer[end] == 10:
                end += 1
            messages.append(bytes(buffer[start:end]))
            start = end
            index = end
            continue
        if current == 10:
            end = index + 1
            messages.append(bytes(buffer[start:end]))
            start = end
        index += 1
    if start:
        del buffer[:start]
    return messages


def decode_payload(payload, encoding):
    return payload.decode(encoding, errors='replace').strip()


def parse_weight_line(raw_line, data_format='AUTO'):
    line = clean_text(raw_line)
    if not line:
        raise RuntimeError('Scale did not return any data.')

    if data_format in {'AUTO', 'A&D', 'AND'}:
        match = re.match(r'^(ST|US|OL),(.+)$', line)
        if match:
            header = match.group(1)
            body = match.group(2)
            if header == 'OL':
                return {
                    'stable': False,
                    'header': header,
                    'weight_text': '',
                    'weight_value': None,
                    'unit': '',
                    'raw_line': line,
                    'meta': {'status': 'overload'},
                }
            unit = body[-3:].strip() if len(body) >= 3 else ''
            weight_text = body[:-3].strip() if len(body) >= 3 else body.strip()
            try:
                weight_value = float(weight_text.replace(' ', ''))
            except ValueError:
                weight_value = None
            return {
                'stable': header == 'ST',
                'header': header,
                'weight_text': weight_text,
                'weight_value': weight_value,
                'unit': unit,
                'raw_line': line,
                'meta': {'status': 'stable' if header == 'ST' else 'unstable'},
            }

    generic = WEIGHT_RE.search(line)
    if generic:
        weight_text = generic.group(1)
        unit = generic.group(2) or ''
        return {
            'stable': False,
            'header': '',
            'weight_text': weight_text,
            'weight_value': float(weight_text),
            'unit': unit,
            'raw_line': line,
            'meta': {'status': 'generic'},
        }

    raise RuntimeError(f'Cannot parse scale line: {line}')


def parse_sartorius_weight_line(raw_line):
    line = clean_text(raw_line)
    if not line:
        raise RuntimeError('Sartorius did not return any data.')

    status_prefix = ''
    body = line
    match = re.match(r'^([A-Za-z]{1,2}(?:\s+[A-Za-z]{1,2}){0,2})\s+([+-]?\d.*)$', line)
    if match:
        status_prefix = clean_text(match.group(1))
        body = clean_text(match.group(2))

    generic = WEIGHT_RE.search(body)
    if not generic:
        generic = WEIGHT_RE.search(line)
    if not generic:
        raise RuntimeError(f'Cannot parse Sartorius line: {line}')

    weight_text = generic.group(1)
    unit = clean_text(generic.group(2))
    header = status_prefix
    status_tokens = {token.upper() for token in status_prefix.split() if token}
    stable = 'S' in status_tokens and not ({'D', 'U', 'N'} & status_tokens)

    return {
        'stable': stable,
        'header': header,
        'weight_text': weight_text,
        'weight_value': float(weight_text),
        'unit': unit,
        'raw_line': line,
        'meta': {
            'status': 'stable' if stable else 'reading',
            'protocol': 'sartorius',
        },
    }


def request_bytes(config):
    if clean_text(config.command) == '':
        return None
    if str(config.command or '').lower() == 'none':
        return None
    return str(config.command or '').encode(config.encoding) + NEWLINE_MAP[config.newline]


def open_port(config):
    if serial is None:
        raise RuntimeError('Missing pyserial. Install with: python -m pip install pyserial')
    conn = serial.Serial(
        port=config.port,
        baudrate=config.baudrate,
        bytesize=BYTESIZE_MAP[config.bytesize],
        parity=PARITY_MAP[config.parity],
        stopbits=STOPBITS_MAP[config.stopbits],
        timeout=config.timeout,
        write_timeout=max(config.timeout, 1.0),
        xonxoff=False,
        rtscts=False,
        dsrdtr=False,
    )
    if hasattr(conn, 'dtr'):
        conn.dtr = True
    if hasattr(conn, 'rts'):
        conn.rts = True
    return conn


def build_read_config(serial_settings):
    return ReadConfig(
        port=serial_settings['port'],
        baudrate=int(serial_settings['baudrate']),
        bytesize=int(serial_settings['bytesize']),
        parity=str(serial_settings['parity']).upper(),
        stopbits=float(serial_settings['stopbits']),
        timeout=float(serial_settings['timeout_seconds']),
        listen_seconds=float(serial_settings['listen_seconds']),
        encoding=str(serial_settings['encoding'] or 'ascii'),
        command=str(serial_settings['command'] or ''),
        newline=normalize_newline_key(serial_settings.get('line_ending')),
        data_format=str(serial_settings.get('data_format') or 'AUTO').upper(),
    )


def enrich_reading(reading, config, port_info):
    meta = reading.get('meta') if isinstance(reading.get('meta'), dict) else {}
    return {
        **reading,
        'meta': {
            **meta,
            'device': port_info or {},
            'settings': asdict(config),
        },
    }


def read_scale_once(serial_settings):
    normalized = normalize_serial_settings(serial_settings, defaults=AND_SERIAL_DEFAULTS)
    candidates = [normalized]
    if normalized.get('baudrate') != 1200:
        fallback = {**normalized, 'baudrate': 1200}
        candidates.append(fallback)

    errors = []
    for current in candidates:
        config = build_read_config(current)
        port_info = get_port_metadata(config.port)
        request_payload = request_bytes(config)
        try:
            with PORT_LOCK:
                with open_port(config) as port:
                    port.reset_input_buffer()
                    port.reset_output_buffer()
                    if request_payload is not None:
                        port.write(request_payload)
                        port.flush()

                    deadline = time.monotonic() + config.listen_seconds
                    pending = bytearray()
                    while time.monotonic() < deadline:
                        chunk = port.read(port.in_waiting or 1)
                        if not chunk:
                            continue
                        pending.extend(chunk)
                        messages = split_messages(pending)
                        for payload in messages:
                            text = decode_payload(payload, config.encoding)
                            if not text:
                                continue
                            return enrich_reading(parse_weight_line(text, config.data_format), config, port_info)

                    if pending:
                        text = decode_payload(bytes(pending), config.encoding)
                        if text:
                            return enrich_reading(parse_weight_line(text, config.data_format), config, port_info)
        except Exception as exc:
            errors.append(str(exc))
            continue
        errors.append(f"Scale did not return data on {config.port} at {config.baudrate} baud.")

    if errors:
        raise RuntimeError(errors[-1])
    raise RuntimeError('Scale did not return data. Check COM, baudrate, command, and output mode.')


def resolve_sartorius_port(serial_settings):
    configured_port = clean_text(serial_settings.get('port'))
    if configured_port:
        return configured_port, get_port_metadata(configured_port)
    if coerce_bool(serial_settings.get('auto_detect_port'), True):
        port_info = find_sartorius_port()
        if port_info:
            return clean_text(port_info.get('device')), port_info
    return '', None


def read_sartorius_once(serial_settings):
    settings = normalize_sartorius_settings(serial_settings)
    port_name, port_info = resolve_sartorius_port(settings)
    if not port_name:
        raise RuntimeError('Sartorius port not found. Set a COM port manually or enable auto-detect.')

    settings = {**settings, 'port': port_name}
    config = build_read_config(settings)
    request_payload = request_bytes(config)
    with PORT_LOCK:
        with open_port(config) as port:
            port.reset_input_buffer()
            port.reset_output_buffer()
            if request_payload is not None:
                port.write(request_payload)
                port.flush()

            deadline = time.monotonic() + config.listen_seconds
            pending = bytearray()
            while time.monotonic() < deadline:
                chunk = port.read(port.in_waiting or 1)
                if not chunk:
                    continue
                pending.extend(chunk)
                messages = split_messages(pending)
                for payload in messages:
                    text = decode_payload(payload, config.encoding)
                    if not text:
                        continue
                    return enrich_reading(parse_sartorius_weight_line(text), config, port_info)

            if pending:
                text = decode_payload(bytes(pending), config.encoding)
                if text:
                    return enrich_reading(parse_sartorius_weight_line(text), config, port_info)

    raise RuntimeError('Sartorius did not return data. Check COM, baudrate, poll command, and output mode.')


def run_command(args, timeout=30, env=None):
    merged_env = os.environ.copy()
    if env:
        merged_env.update(env)
    completed = subprocess.run(
        args,
        capture_output=True,
        text=True,
        encoding='utf-8',
        errors='replace',
        timeout=timeout,
        env=merged_env,
    )
    return completed


def run_powershell(script, timeout=40, env=None):
    return run_command(
        ['powershell', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script],
        timeout=timeout,
        env=env,
    )


def load_json_output(output):
    text = clean_text(output)
    if not text:
        return []
    data = json.loads(text)
    if isinstance(data, list):
        return data
    return [data]


def local_ipv4_networks():
    script = r"""
$ErrorActionPreference = 'Stop'
Get-NetIPConfiguration |
  Where-Object { $_.IPv4Address -and $_.NetAdapter.Status -eq 'Up' } |
  Select-Object @{Name='IPAddress';Expression={$_.IPv4Address.IPAddress}},
                @{Name='PrefixLength';Expression={$_.IPv4Address.PrefixLength}} |
  ConvertTo-Json -Depth 4
"""
    completed = run_powershell(script, timeout=30)
    if completed.returncode != 0:
        return []

    networks = []
    for row in load_json_output(completed.stdout):
        address = clean_text(row.get('IPAddress'))
        prefix_length = coerce_int(row.get('PrefixLength'), 0)
        if not address or prefix_length <= 0:
            continue
        try:
            network = ipaddress.ip_network(f'{address}/{prefix_length}', strict=False)
        except ValueError:
            continue
        networks.append({'ip': address, 'network': network})
    return networks


def scan_network_browser_hosts():
    completed = run_command(['cmd', '/c', 'net view'], timeout=40)
    if completed.returncode != 0:
        return []
    hosts = []
    seen = set()
    for line in completed.stdout.splitlines():
        line = line.strip()
        if not line.startswith('\\\\'):
            continue
        host = normalize_host_candidate(line.lstrip('\\').split()[0])
        if host and host.lower() not in seen:
            seen.add(host.lower())
            hosts.append(host)
    return hosts


def scan_arp_hosts():
    completed = run_command(['arp', '-a'], timeout=25)
    if completed.returncode != 0:
        return []
    hosts = []
    seen = set()
    for line in completed.stdout.splitlines():
        match = re.match(r'^\s*((?:\d{1,3}\.){3}\d{1,3})\s+', line)
        if not match:
            continue
        host = normalize_host_candidate(match.group(1))
        if host and host.lower() not in seen:
            seen.add(host.lower())
            hosts.append(host)
    return hosts


def host_has_smb(host, timeout=0.35):
    target = normalize_host_candidate(host)
    if not target:
        return False
    for port in (445, 139):
        try:
            with socket.create_connection((target, port), timeout=timeout):
                return True
        except OSError:
            continue
    return False


def scan_network_hosts(limit=0):
    known_hosts = []
    seen = set()

    def add_host(host):
        value = normalize_host_candidate(host)
        if not value:
            return
        key = value.lower()
        if key in seen:
            return
        seen.add(key)
        known_hosts.append(value)

    for host in scan_network_browser_hosts():
        add_host(host)
    for host in scan_arp_hosts():
        add_host(host)

    probe_budget = max(0, int(limit or 0))
    probe_candidates = []
    for item in local_ipv4_networks():
        own_ip = item['ip']
        for address in item['network'].hosts():
            host = str(address)
            if host == own_ip or host.lower() in seen:
                continue
            probe_candidates.append(host)

    if probe_budget:
        probe_candidates = probe_candidates[:probe_budget]
    else:
        probe_candidates = probe_candidates[:512]

    if probe_candidates:
        with ThreadPoolExecutor(max_workers=min(32, max(4, len(probe_candidates)))) as executor:
            futures = {executor.submit(host_has_smb, host): host for host in probe_candidates}
            for future in as_completed(futures):
                host = futures[future]
                try:
                    if future.result():
                        add_host(host)
                except Exception:
                    continue

    return known_hosts


def scan_local_printers():
    script = r"""
$ErrorActionPreference = 'Stop'
Get-CimInstance Win32_Printer |
  Select-Object Name, ShareName, SystemName, DriverName, PortName, Location, Comment,
                @{Name='IsDefault';Expression={$_.Default}},
                @{Name='IsNetwork';Expression={$_.Network}},
                @{Name='IsShared';Expression={$_.Shared}},
                @{Name='WorkOffline';Expression={$_.WorkOffline}},
                @{Name='PrinterStatus';Expression={$_.PrinterStatus}} |
  ConvertTo-Json -Depth 4
"""
    completed = run_powershell(script, timeout=45)
    if completed.returncode != 0:
        raise RuntimeError(clean_text(completed.stderr) or 'Unable to query printers with PowerShell.')
    printers = []
    for row in load_json_output(completed.stdout):
        unc_path = extract_unc_path(row.get('PortName'), row.get('Name'))
        network_host, share_name = split_unc_path(unc_path)
        printer = {
            'printer_name': clean_text(row.get('Name')),
            'share_name': clean_text(row.get('ShareName')) or share_name,
            'unc_path': unc_path,
            'system_name': network_host or clean_text(row.get('SystemName')),
            'driver_name': clean_text(row.get('DriverName')),
            'port_name': clean_text(row.get('PortName')),
            'location': clean_text(row.get('Location')),
            'comment': clean_text(row.get('Comment')),
            'source': 'local',
            'is_default': bool(row.get('IsDefault')),
            'is_network': bool(row.get('IsNetwork')) or bool(unc_path),
            'is_shared': bool(row.get('IsShared')),
            'work_offline': bool(row.get('WorkOffline')),
            'printer_status': clean_text(row.get('PrinterStatus')),
            'meta': {'provider': 'powershell'},
        }
        printers.append(with_printer_aliases(printer))
    return printers


def parse_net_view_shares(host, output):
    devices = []
    in_table = False
    for line in output.splitlines():
        stripped = line.rstrip()
        if not stripped:
            continue
        if stripped.startswith('---'):
            in_table = True
            continue
        if not in_table:
            continue
        if stripped.lower().startswith('the command completed'):
            break
        parts = re.split(r'\s{2,}', stripped.strip())
        if len(parts) < 2:
            continue
        share_name = clean_text(parts[0])
        kind = clean_text(parts[1]).lower()
        comment = clean_text(parts[2]) if len(parts) > 2 else ''
        if 'print' not in kind:
            continue
        device = {
            'printer_name': share_name,
            'share_name': share_name,
            'unc_path': f'\\\\{host}\\{share_name}',
            'system_name': host,
            'driver_name': '',
            'port_name': '',
            'location': '',
            'comment': comment,
            'source': 'net_view',
            'is_default': False,
            'is_network': True,
            'is_shared': True,
            'work_offline': False,
            'printer_status': '',
            'meta': {'provider': 'net view'},
        }
        devices.append(with_printer_aliases(device))
    return devices


def query_host_print_shares(host):
    target = normalize_host_candidate(host)
    if not target:
        return []
    completed = run_command(['cmd', '/c', f'net view \\\\{target}'], timeout=12)
    if completed.returncode != 0:
        return []
    return parse_net_view_shares(target, completed.stdout)


def scan_network_shared_printers(limit=0):
    devices = []
    hosts = scan_network_hosts(limit=limit)
    reachable_hosts = []
    if hosts:
        with ThreadPoolExecutor(max_workers=min(32, max(4, len(hosts)))) as executor:
            futures = {executor.submit(host_has_smb, host): host for host in hosts}
            for future in as_completed(futures):
                host = futures[future]
                try:
                    if future.result():
                        reachable_hosts.append(host)
                except Exception:
                    continue
    if reachable_hosts:
        with ThreadPoolExecutor(max_workers=min(12, max(4, len(reachable_hosts)))) as executor:
            futures = {executor.submit(query_host_print_shares, host): host for host in reachable_hosts}
            for future in as_completed(futures):
                try:
                    devices.extend(future.result())
                except Exception:
                    continue
    return devices


def printer_detail_score(item):
    score = 0
    if clean_text(item.get('unc_path')):
        score += 3
    if clean_text(item.get('driver_name')):
        score += 2
    if clean_text(item.get('port_name')):
        score += 2
    if clean_text(item.get('system_name')):
        score += 1
    if clean_text(item.get('share_name')):
        score += 1
    if clean_text(item.get('source')) == 'local':
        score += 3
    if item.get('is_default'):
        score += 1
    return score


def merge_printer_records(existing, current):
    preferred, secondary = (current, existing)
    if printer_detail_score(existing) > printer_detail_score(current):
        preferred, secondary = existing, current

    merged = copy.deepcopy(preferred)
    for key in (
        'printer_name', 'share_name', 'unc_path', 'system_name', 'driver_name',
        'port_name', 'location', 'comment', 'printer_status',
    ):
        if not clean_text(merged.get(key)):
            merged[key] = secondary.get(key, '')

    for key in ('is_default', 'is_network', 'is_shared', 'work_offline'):
        merged[key] = bool(merged.get(key) or secondary.get(key))

    left_meta = existing.get('meta') if isinstance(existing.get('meta'), dict) else {}
    right_meta = current.get('meta') if isinstance(current.get('meta'), dict) else {}
    merged['meta'] = {
        **left_meta,
        **right_meta,
        'sources': sorted({
            clean_text(existing.get('source')),
            clean_text(current.get('source')),
        } - {''}),
    }
    if not clean_text(merged.get('source')):
        merged['source'] = clean_text(secondary.get('source'))
    merged['aliases'] = sorted(set(existing.get('aliases') or []) | set(current.get('aliases') or []))
    return with_printer_aliases(merged)


def dedupe_printers(items):
    deduped = {}
    for item in items:
        current = with_printer_aliases(item)
        share_key = clean_text(current.get('share_name') or current.get('printer_name')).lower()
        host_keys = resolve_host_aliases(current.get('system_name'))
        if share_key and host_keys:
            key = sorted(host_keys)[0] + '|' + share_key
        else:
            key = clean_text(current.get('unc_path')).lower()
        if not key:
            key = '|'.join([
                clean_text(current.get('printer_name')).lower(),
                share_key,
                clean_text(current.get('system_name')).lower(),
            ])
        if not key:
            continue
        if key in deduped:
            deduped[key] = merge_printer_records(deduped[key], current)
        else:
            deduped[key] = current
    return sorted(deduped.values(), key=lambda row: (
        clean_text(row.get('system_name')).lower(),
        clean_text(row.get('printer_name')).lower(),
        clean_text(row.get('share_name')).lower(),
    ))


def scan_all_printers(scan_network_shares=True, limit=0):
    printers = []
    errors = []
    try:
        printers.extend(scan_local_printers())
    except Exception as exc:
        errors.append(f'local scan failed: {exc}')
    if scan_network_shares:
        try:
            printers.extend(scan_network_shared_printers(limit=limit))
        except Exception as exc:
            errors.append(f'network scan failed: {exc}')
    printers = dedupe_printers(printers)
    if errors and not printers:
        raise RuntimeError(' ; '.join(errors))
    if errors:
        log(' ; '.join(errors), level='error')
    return printers


def printer_match_value(device):
    aliases = set(alias for alias in (device.get('aliases') or []) if alias)
    aliases.update({
        clean_text(device.get('printer_name')).lower(),
        clean_text(device.get('share_name')).lower(),
        clean_text(device.get('unc_path')).lower(),
        clean_text(device.get('system_name')).lower(),
    })
    return {alias for alias in aliases if alias}


def resolve_printer_target(printers, target_name):
    needle = clean_text(target_name).lower()
    if not needle:
        return None
    for device in printers:
        if needle in printer_match_value(device):
            return device
    for device in printers:
        aliases = printer_match_value(device)
        if any(needle in alias for alias in aliases):
            return device
    host, share_name = parse_printer_selector(target_name)
    if host and share_name:
        return with_printer_aliases({
            'printer_name': share_name,
            'share_name': share_name,
            'unc_path': build_unc_path(host, share_name),
            'system_name': host,
            'driver_name': '',
            'port_name': '',
            'location': '',
            'comment': '',
            'source': 'selector',
            'is_default': False,
            'is_network': True,
            'is_shared': True,
            'work_offline': False,
            'printer_status': '',
            'meta': {'provider': 'selector'},
        })
    return None


def write_temp_bytes(data, suffix='.bin'):
    handle = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    try:
        handle.write(data)
        return handle.name
    finally:
        handle.close()


def download_file(url):
    with urllib.request.urlopen(url, timeout=30) as response:
        data = response.read()
        content_type = response.headers.get_content_type() if response.headers else ''
    return data, content_type


def print_raw_via_winspool(printer_name, data, document_name='Print job', data_type='RAW'):
    if not printer_name:
        raise RuntimeError('Printer name is required for raw printing.')
    if not isinstance(data, (bytes, bytearray)) or not data:
        raise RuntimeError('Raw print payload is empty.')
    spool_type = clean_text(data_type or 'RAW') or 'RAW'

    if win32print is not None:
        handle = win32print.OpenPrinter(printer_name)
        try:
            win32print.StartDocPrinter(handle, 1, (document_name, None, spool_type))
            try:
                win32print.StartPagePrinter(handle)
                win32print.WritePrinter(handle, bytes(data))
                win32print.EndPagePrinter(handle)
            finally:
                win32print.EndDocPrinter(handle)
        finally:
            win32print.ClosePrinter(handle)
        return

    if os.name != 'nt':
        raise RuntimeError('Raw Winspool printing is only supported on Windows.')

    winspool = ctypes.WinDLL('winspool.drv', use_last_error=True)

    class DOC_INFO_1(ctypes.Structure):
        _fields_ = [
            ('pDocName', wintypes.LPWSTR),
            ('pOutputFile', wintypes.LPWSTR),
            ('pDatatype', wintypes.LPWSTR),
        ]

    open_printer = winspool.OpenPrinterW
    open_printer.argtypes = [wintypes.LPWSTR, ctypes.POINTER(wintypes.HANDLE), wintypes.LPVOID]
    open_printer.restype = wintypes.BOOL

    start_doc_printer = winspool.StartDocPrinterW
    start_doc_printer.argtypes = [wintypes.HANDLE, wintypes.DWORD, ctypes.c_void_p]
    start_doc_printer.restype = wintypes.DWORD

    start_page_printer = winspool.StartPagePrinter
    start_page_printer.argtypes = [wintypes.HANDLE]
    start_page_printer.restype = wintypes.BOOL

    write_printer = winspool.WritePrinter
    write_printer.argtypes = [wintypes.HANDLE, wintypes.LPVOID, wintypes.DWORD, ctypes.POINTER(wintypes.DWORD)]
    write_printer.restype = wintypes.BOOL

    end_page_printer = winspool.EndPagePrinter
    end_page_printer.argtypes = [wintypes.HANDLE]
    end_page_printer.restype = wintypes.BOOL

    end_doc_printer = winspool.EndDocPrinter
    end_doc_printer.argtypes = [wintypes.HANDLE]
    end_doc_printer.restype = wintypes.BOOL

    close_printer = winspool.ClosePrinter
    close_printer.argtypes = [wintypes.HANDLE]
    close_printer.restype = wintypes.BOOL

    printer_handle = wintypes.HANDLE()
    if not open_printer(printer_name, ctypes.byref(printer_handle), None):
        error_code = ctypes.get_last_error()
        raise RuntimeError(f'OpenPrinter failed for {printer_name}: {format_win32_error(error_code)}')

    doc_started = False
    page_started = False
    try:
        doc_info = DOC_INFO_1(document_name, None, spool_type)
        job_id = start_doc_printer(printer_handle, 1, ctypes.byref(doc_info))
        if not job_id:
            error_code = ctypes.get_last_error()
            raise RuntimeError(f'StartDocPrinter failed for {printer_name}: {format_win32_error(error_code)}')
        doc_started = True

        if not start_page_printer(printer_handle):
            error_code = ctypes.get_last_error()
            raise RuntimeError(f'StartPagePrinter failed for {printer_name}: {format_win32_error(error_code)}')
        page_started = True

        buffer = ctypes.create_string_buffer(bytes(data))
        written = wintypes.DWORD(0)
        if not write_printer(printer_handle, buffer, len(data), ctypes.byref(written)):
            error_code = ctypes.get_last_error()
            raise RuntimeError(f'WritePrinter failed for {printer_name}: {format_win32_error(error_code)}')
        if written.value != len(data):
            raise RuntimeError(f'WritePrinter wrote {written.value}/{len(data)} bytes for {printer_name}.')
    finally:
        if page_started:
            end_page_printer(printer_handle)
        if doc_started:
            end_doc_printer(printer_handle)
        close_printer(printer_handle)


def print_raw_to_unc(unc_path, data, document_name='Print job'):
    target = normalize_unc_path(unc_path)
    if not target:
        raise RuntimeError('UNC printer path is required for network raw printing.')
    print_raw_via_winspool(target, data, document_name=document_name)
    return {
        'strategy': 'winspool_unc_raw',
        'target': target,
        'bytes': len(data),
        'document_name': document_name,
    }


def print_raw_to_local_printer(printer_name, data, document_name='Print job'):
    print_raw_via_winspool(printer_name, data, document_name=document_name)
    return {
        'strategy': 'winspool_raw',
        'target': printer_name,
        'bytes': len(data),
        'document_name': document_name,
    }


def print_text_to_unc(unc_path, text, document_name='Print job'):
    target = normalize_unc_path(unc_path)
    if not target:
        raise RuntimeError('UNC printer path is required for network text printing.')
    normalized = str(text or '').replace('\r\n', '\n').replace('\r', '\n').replace('\n', '\r\n')
    payload = (normalized + '\r\n').encode('mbcs' if os.name == 'nt' else 'utf-8', errors='replace')
    print_raw_via_winspool(target, payload, document_name=document_name, data_type='TEXT')
    return {
        'strategy': 'winspool_unc_text',
        'target': target,
        'chars': len(text or ''),
        'document_name': document_name,
        'data_type': 'TEXT',
    }


def print_text_to_local_printer(printer_name, text, document_name='Print job'):
    temp_path = write_temp_bytes(text.encode('utf-8'), suffix='.txt')
    errors = []
    try:
        scripts = [
            ('gdi_text', r"""
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$text = [System.IO.File]::ReadAllText($env:PRINT_FILE)
$doc = New-Object System.Drawing.Printing.PrintDocument
$doc.DocumentName = $env:PRINT_TITLE
$doc.PrinterSettings.PrinterName = $env:PRINT_TARGET
if (-not $doc.PrinterSettings.IsValid) {
  throw "Settings to access printer '$env:PRINT_TARGET' are not valid."
}
$doc.PrintController = New-Object System.Drawing.Printing.StandardPrintController
$doc.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(50, 50, 50, 50)
$font = New-Object System.Drawing.Font('Segoe UI', 11)
$brush = [System.Drawing.Brushes]::Black
$handler = [System.Drawing.Printing.PrintPageEventHandler]{
  param($sender, $e)
  $rect = New-Object System.Drawing.RectangleF([single]$e.MarginBounds.Left, [single]$e.MarginBounds.Top, [single]$e.MarginBounds.Width, [single]$e.MarginBounds.Height)
  $format = New-Object System.Drawing.StringFormat
  $format.Trimming = [System.Drawing.StringTrimming]::Word
  $e.Graphics.DrawString($text, $font, $brush, $rect, $format)
  $e.HasMorePages = $false
  $format.Dispose()
}
try {
  $doc.add_PrintPage($handler)
  $doc.Print()
} finally {
  $doc.remove_PrintPage($handler)
  $font.Dispose()
  $doc.Dispose()
}
"""),
            ('out_printer_text', r"""
$ErrorActionPreference = 'Stop'
Get-Content -LiteralPath $env:PRINT_FILE | Out-Printer -Name $env:PRINT_TARGET
"""),
        ]
        for strategy, script in scripts:
            completed = run_powershell(script, timeout=45, env={
                'PRINT_FILE': temp_path,
                'PRINT_TARGET': printer_name,
                'PRINT_TITLE': document_name,
            })
            if completed.returncode == 0:
                return {
                    'strategy': strategy,
                    'target': printer_name,
                    'chars': len(text),
                    'document_name': document_name,
                }
            error_text = clean_text(completed.stderr) or clean_text(completed.stdout) or f'{strategy} failed.'
            errors.append(f'{strategy}: {error_text}')
        raise RuntimeError(' ; '.join(errors) if errors else 'Text print failed.')
    finally:
        try:
            os.remove(temp_path)
        except OSError:
            pass


def print_image_to_local_printer(file_path, printer_name, document_name='Print job', options=None):
    options = options if isinstance(options, dict) else {}
    paper_width_mm = max(0.0, coerce_float(options.get('paper_width_mm'), 0.0))
    paper_height_mm = max(0.0, coerce_float(options.get('paper_height_mm'), 0.0))
    margin_mm = max(0.0, coerce_float(options.get('margin_mm'), 0.0))
    fit_width = coerce_bool(options.get('fit_width'), True)
    script = r"""
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$culture = [System.Globalization.CultureInfo]::InvariantCulture
$image = [System.Drawing.Image]::FromFile($env:PRINT_FILE)
$doc = New-Object System.Drawing.Printing.PrintDocument
$doc.DocumentName = $env:PRINT_TITLE
$doc.PrinterSettings.PrinterName = $env:PRINT_TARGET
if (-not $doc.PrinterSettings.IsValid) {
  throw "Settings to access printer '$env:PRINT_TARGET' are not valid."
}
$doc.PrintController = New-Object System.Drawing.Printing.StandardPrintController

function Parse-EnvDouble([string]$value) {
  if ([string]::IsNullOrWhiteSpace($value)) { return 0.0 }
  return [double]::Parse($value, $culture)
}

$paperWidthMm = Parse-EnvDouble $env:PRINT_PAPER_WIDTH_MM
$paperHeightMm = Parse-EnvDouble $env:PRINT_PAPER_HEIGHT_MM
$marginMm = Parse-EnvDouble $env:PRINT_MARGIN_MM
$fitWidth = [string]::Equals($env:PRINT_FIT_WIDTH, 'true', [System.StringComparison]::OrdinalIgnoreCase)

$marginUnits = [int][Math]::Round(($marginMm / 25.4) * 100.0)
$doc.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins($marginUnits, $marginUnits, $marginUnits, $marginUnits)
$doc.OriginAtMargins = $true

if ($paperWidthMm -gt 0) {
  $usableWidthMm = [Math]::Max(1.0, $paperWidthMm - ($marginMm * 2.0))
  if ($paperHeightMm -le 0) {
    $paperHeightMm = (($image.Height / [double]$image.Width) * $usableWidthMm) + ($marginMm * 2.0)
  }
  $paperWidthUnits = [int][Math]::Round(($paperWidthMm / 25.4) * 100.0)
  $paperHeightUnits = [int][Math]::Round(($paperHeightMm / 25.4) * 100.0)
  $paperWidthUnits = [Math]::Max(100, [Math]::Min(32000, $paperWidthUnits))
  $paperHeightUnits = [Math]::Max(100, [Math]::Min(32000, $paperHeightUnits))
  $paper = New-Object System.Drawing.Printing.PaperSize('CustomImage', $paperWidthUnits, $paperHeightUnits)
  $doc.DefaultPageSettings.PaperSize = $paper
}

$handler = [System.Drawing.Printing.PrintPageEventHandler]{
  param($sender, $e)
  $bounds = $e.MarginBounds
  if ($bounds.Width -le 0 -or $bounds.Height -le 0) {
    $bounds = $e.PageBounds
  }

  $imgW = [double]$image.Width
  $imgH = [double]$image.Height
  if ($imgW -le 0 -or $imgH -le 0) {
    throw 'Image has invalid dimensions.'
  }

  if ($fitWidth) {
    $drawWidth = [double]$bounds.Width
    $drawHeight = [Math]::Round($drawWidth * $imgH / $imgW)
  } else {
    $scale = [Math]::Min([double]$bounds.Width / $imgW, [double]$bounds.Height / $imgH)
    if ($scale -le 0) { $scale = 1.0 }
    $drawWidth = [Math]::Round($imgW * $scale)
    $drawHeight = [Math]::Round($imgH * $scale)
  }

  if ($drawHeight -gt $bounds.Height) {
    $scale = [double]$bounds.Height / [Math]::Max(1.0, [double]$drawHeight)
    $drawWidth = [Math]::Round($drawWidth * $scale)
    $drawHeight = [Math]::Round($drawHeight * $scale)
  }

  $x = $bounds.Left + [Math]::Max(0, [int][Math]::Round(($bounds.Width - $drawWidth) / 2.0))
  $y = $bounds.Top

  $e.Graphics.Clear([System.Drawing.Color]::White)
  $e.Graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $e.Graphics.DrawImage($image, $x, $y, [int]$drawWidth, [int]$drawHeight)
  $e.HasMorePages = $false
}

try {
  $doc.add_PrintPage($handler)
  $doc.Print()
} finally {
  $doc.remove_PrintPage($handler)
  $doc.Dispose()
  $image.Dispose()
}
"""
    completed = run_powershell(script, timeout=90, env={
        'PRINT_FILE': file_path,
        'PRINT_TARGET': printer_name,
        'PRINT_TITLE': document_name,
        'PRINT_PAPER_WIDTH_MM': f'{paper_width_mm:.3f}',
        'PRINT_PAPER_HEIGHT_MM': f'{paper_height_mm:.3f}',
        'PRINT_MARGIN_MM': f'{margin_mm:.3f}',
        'PRINT_FIT_WIDTH': 'true' if fit_width else 'false',
    })
    if completed.returncode != 0:
        raise RuntimeError(clean_text(completed.stderr) or clean_text(completed.stdout) or 'Image print failed.')
    return {
        'strategy': 'gdi_image',
        'target': printer_name,
        'file_path': file_path,
        'document_name': document_name,
        'paper_width_mm': paper_width_mm,
        'paper_height_mm': paper_height_mm,
        'margin_mm': margin_mm,
        'fit_width': fit_width,
    }


def print_file_to_printer(file_path, printer_name='', document_name='Print job'):
    script = r"""
$ErrorActionPreference = 'Stop'
$file = $env:PRINT_FILE
$printer = $env:PRINT_TARGET
if ($printer) {
  $proc = Start-Process -FilePath $file -Verb PrintTo -ArgumentList $printer -PassThru
} else {
  $proc = Start-Process -FilePath $file -Verb Print -PassThru
}
$proc.WaitForExit()
"""
    completed = run_powershell(script, timeout=70, env={
        'PRINT_FILE': file_path,
        'PRINT_TARGET': printer_name,
        'PRINT_TITLE': document_name,
    })
    if completed.returncode != 0:
        raise RuntimeError(clean_text(completed.stderr) or clean_text(completed.stdout) or 'Shell print failed.')
    return {
        'strategy': 'shell_print',
        'target': printer_name or 'default',
        'file_path': file_path,
        'document_name': document_name,
    }


def list_local_print_jobs(printer_name):
    target = clean_text(printer_name)
    if not target or normalize_unc_path(target):
        return []
    script = r"""
$ErrorActionPreference = 'Stop'
$printer = $env:PRINT_TARGET
$jobs = @(Get-PrintJob -PrinterName $printer -ErrorAction SilentlyContinue |
  Select-Object @{Name='id';Expression={$_.ID}},
                @{Name='document_name';Expression={$_.DocumentName}},
                @{Name='status';Expression={[string]$_.JobStatus}},
                @{Name='submitted_time';Expression={$_.SubmittedTime}},
                @{Name='size';Expression={$_.Size}})
if ($jobs.Count -eq 0) {
  '[]'
} else {
  $jobs | ConvertTo-Json -Depth 4
}
"""
    completed = run_powershell(script, timeout=20, env={'PRINT_TARGET': target})
    if completed.returncode != 0:
        return []
    try:
        return load_json_output(completed.stdout)
    except Exception:
        return []


def remove_local_print_job(printer_name, job_id):
    target = clean_text(printer_name)
    if not target or normalize_unc_path(target):
        return False
    script = r"""
$ErrorActionPreference = 'Stop'
Remove-PrintJob -PrinterName $env:PRINT_TARGET -ID ([int]$env:PRINT_JOB_ID)
"""
    completed = run_powershell(script, timeout=20, env={
        'PRINT_TARGET': target,
        'PRINT_JOB_ID': str(job_id),
    })
    return completed.returncode == 0


def monitor_print_queue(printer_name, document_name, timeout_seconds=6.0):
    target = clean_text(printer_name)
    title = clean_text(document_name)
    if not target or not title or normalize_unc_path(target):
        return {}

    deadline = time.time() + max(1.0, timeout_seconds)
    latest_job = None
    seen_match = False
    error_tokens = ('error', 'retained', 'deleted', 'blocked')

    while time.time() < deadline:
        matches = []
        for row in list_local_print_jobs(target):
            if clean_text(row.get('document_name')) == title:
                matches.append(row)
        if matches:
            latest_job = max(matches, key=lambda row: coerce_int(row.get('id'), 0))
            seen_match = True
            status = clean_text(latest_job.get('status'))
            lowered = status.lower()
            if any(token in lowered for token in error_tokens):
                job_id = coerce_int(latest_job.get('id'), 0)
                if job_id > 0:
                    remove_local_print_job(target, job_id)
                raise RuntimeError(
                    f"Windows printer queue for '{target}' reported '{status or 'unknown'}' for '{title}'. "
                    "The stuck job was removed from queue."
                )
            time.sleep(1.0)
            continue
        if seen_match:
            return {
                'printer_name': target,
                'document_name': title,
                'queue_status': 'cleared',
            }
        time.sleep(0.75)

    if latest_job:
        return {
            'printer_name': target,
            'document_name': title,
            'queue_status': clean_text(latest_job.get('status')) or 'queued',
            'queue_job_id': coerce_int(latest_job.get('id'), 0),
        }
    return {}


def verify_print_result(command, result):
    result = copy.deepcopy(result if isinstance(result, dict) else {})
    document_name = clean_text(result.get('document_name') or command.get('document_name'))
    queue_target = ''
    for step in result.get('steps') or []:
        queue_target = clean_text(step.get('target'))
        if queue_target and not normalize_unc_path(queue_target):
            break
    if not queue_target:
        target = result.get('target') if isinstance(result.get('target'), dict) else {}
        queue_target = clean_text(target.get('printer_name') or command.get('printer_name'))
    queue_state = monitor_print_queue(queue_target, document_name)
    if queue_state:
        result['queue'] = queue_state
    return result


def is_connection_style_printer(device):
    device = device if isinstance(device, dict) else {}
    printer_unc = normalize_unc_path(device.get('printer_name'))
    port_unc = normalize_unc_path(device.get('port_name'))
    if printer_unc:
        return True
    if bool(device.get('is_shared')) and not port_unc:
        return True
    return False


def local_printer_connection_score(device, target_unc=''):
    device = device if isinstance(device, dict) else {}
    normalized_target_unc = normalize_unc_path(target_unc)
    printer_name = clean_text(device.get('printer_name'))
    printer_unc = normalize_unc_path(printer_name)
    port_unc = normalize_unc_path(device.get('port_name'))
    score = 0
    if printer_unc:
        score += 12
        if normalized_target_unc and printer_unc.lower() == normalized_target_unc.lower():
            score += 12
    if printer_name.startswith('\\\\'):
        score += 4
    if bool(device.get('is_shared')):
        score += 4
    if clean_text(device.get('port_name')) and not port_unc:
        score += 1
    if port_unc and not printer_unc:
        score -= 10
    if bool(device.get('work_offline')):
        score -= 5
    return score


def find_local_printer_name(printer_name='', unc_path='', allow_legacy_unc_port=True):
    try:
        local_printers = scan_local_printers()
    except Exception:
        return ''
    selector = clean_text(unc_path or printer_name)
    needle = selector.lower()
    if not needle:
        return ''
    matches = []
    for device in local_printers:
        aliases = printer_match_value(device)
        if needle in aliases or any(needle in alias for alias in aliases):
            matches.append(device)
    if not matches:
        return ''

    if normalize_unc_path(unc_path):
        matches.sort(key=lambda row: local_printer_connection_score(row, unc_path), reverse=True)
        if not allow_legacy_unc_port:
            for device in matches:
                if is_connection_style_printer(device):
                    return clean_text(device.get('printer_name')) or clean_text(device.get('unc_path'))
            return ''

    best = matches[0]
    return clean_text(best.get('printer_name')) or clean_text(best.get('unc_path'))


def connect_windows_printer(target):
    candidates = build_printer_unc_candidates(target if isinstance(target, dict) else {'unc_path': target})
    if not candidates:
        raise RuntimeError('UNC printer path is required.')

    errors = []
    scripts = [
        ('add_printer', r"""
$ErrorActionPreference = 'Stop'
if (-not (Get-Command Add-Printer -ErrorAction SilentlyContinue)) {
  throw 'Add-Printer is not available on this machine.'
}
Add-Printer -ConnectionName $env:PRINT_TARGET | Out-Null
"""),
        ('wscript_network', r"""
$ErrorActionPreference = 'Stop'
$network = New-Object -ComObject WScript.Network
$network.AddWindowsPrinterConnection($env:PRINT_TARGET)
"""),
        ('printui', r"""
$ErrorActionPreference = 'Stop'
Start-Process -FilePath 'rundll32.exe' -ArgumentList @('printui.dll,PrintUIEntry', '/in', "/n$env:PRINT_TARGET") -Wait -NoNewWindow
"""),
    ]

    for candidate in candidates:
        existing = find_local_printer_name(unc_path=candidate, allow_legacy_unc_port=False)
        if existing:
            return {'printer_name': existing, 'strategy': 'existing_connection', 'target': candidate}
        for strategy, script in scripts:
            completed = run_powershell(script, timeout=45, env={'PRINT_TARGET': candidate})
            printer_name = find_local_printer_name(unc_path=candidate, allow_legacy_unc_port=False)
            if printer_name:
                return {'printer_name': printer_name, 'strategy': strategy, 'target': candidate}
            error_text = clean_text(completed.stderr) or clean_text(completed.stdout) or f'{strategy} failed.'
            errors.append(f'{candidate}: {strategy}: {error_text}')

        legacy = find_local_printer_name(unc_path=candidate, allow_legacy_unc_port=True)
        if legacy:
            errors.append(
                f"{candidate}: only legacy local printer mapping '{legacy}' is available on this PC. "
                "That mapping is blocked because jobs can get stuck in Spooling or Retained. "
                "Create a real Windows printer connection for this share, or repair the shared printer on the host PC."
            )
            continue

    raise RuntimeError(' ; '.join(errors) if errors else 'Unable to connect printer share.')


def resolve_printable_target(target):
    target = with_printer_aliases(target or {})
    unc_path = normalize_unc_path(target.get('unc_path'))
    printer_name = clean_text(target.get('printer_name'))
    if unc_path:
        return connect_windows_printer(target)
    if printer_name:
        return {'printer_name': printer_name, 'strategy': 'local_name', 'target': printer_name}
    raise RuntimeError('Printer target is empty.')


def build_print_payload(payload):
    payload = payload if isinstance(payload, dict) else {}
    mode = clean_text(payload.get('mode')).lower()
    content_text = str(payload.get('content_text') or '')
    content_base64 = str(payload.get('content_base64') or payload.get('raw_base64') or '')
    image_url = clean_text(payload.get('image_url'))
    file_url = clean_text(payload.get('file_url'))
    file_name = clean_text(payload.get('file_name') or payload.get('document_name') or 'print_job')
    content_type = clean_text(payload.get('content_type') or payload.get('mime_type'))
    encoding = clean_text(payload.get('content_encoding') or 'utf-8') or 'utf-8'

    if mode in {'image_base64', 'png_base64'}:
        mode = 'image_base64'
    elif mode == 'image_url':
        mode = 'image_url'
    elif mode not in {'text', 'raw', 'file_url', 'file_base64'}:
        if image_url:
            mode = 'image_url'
        elif file_url:
            mode = 'file_url'
        elif content_text:
            mode = 'text'
        else:
            mode = 'raw'

    if mode == 'text':
        data = content_text.encode(encoding, errors='replace')
        return {
            'mode': mode,
            'data': data,
            'text': content_text,
            'file_name': file_name,
            'content_type': content_type or 'text/plain',
        }

    if mode == 'raw':
        if not content_base64:
            raise RuntimeError('content_base64 is required for raw mode.')
        data = base64.b64decode(content_base64)
        return {
            'mode': mode,
            'data': data,
            'text': '',
            'file_name': file_name,
            'content_type': content_type or 'application/octet-stream',
        }

    if mode == 'file_base64':
        if not content_base64:
            raise RuntimeError('content_base64 is required for file_base64 mode.')
        data = base64.b64decode(content_base64)
        return {
            'mode': mode,
            'data': data,
            'text': '',
            'file_name': file_name,
            'content_type': content_type or 'application/octet-stream',
        }

    if mode == 'image_base64':
        if not content_base64:
            raise RuntimeError('content_base64 is required for image_base64 mode.')
        data = base64.b64decode(content_base64)
        return {
            'mode': mode,
            'data': data,
            'text': '',
            'file_name': file_name or 'document.png',
            'content_type': content_type or 'image/png',
        }

    if mode == 'image_url':
        if not image_url:
            raise RuntimeError('image_url is required for image_url mode.')
        data, remote_content_type = download_file(image_url)
        return {
            'mode': mode,
            'data': data,
            'text': '',
            'file_name': file_name or Path(image_url).name or 'document.png',
            'content_type': content_type or remote_content_type or 'image/png',
        }

    if mode == 'file_url':
        if not file_url:
            raise RuntimeError('file_url is required for file_url mode.')
        data, remote_content_type = download_file(file_url)
        return {
            'mode': mode,
            'data': data,
            'text': '',
            'file_name': file_name or Path(file_url).name or 'download.bin',
            'content_type': content_type or remote_content_type or 'application/octet-stream',
        }

    raise RuntimeError(f'Unsupported print mode: {mode}')


def file_suffix_from_name(name, content_type):
    suffix = Path(name or '').suffix
    if suffix:
        return suffix
    mapping = {
        'application/pdf': '.pdf',
        'image/png': '.png',
        'image/jpeg': '.jpg',
        'text/plain': '.txt',
        'application/octet-stream': '.bin',
    }
    return mapping.get((content_type or '').lower(), '.bin')


def resolve_print_command_target(command, printers):
    payload = command.get('payload') if isinstance(command.get('payload'), dict) else {}
    printer_name = clean_text(payload.get('printer_name') or command.get('printer_name'))
    unc_path = normalize_unc_path(payload.get('unc_path') or payload.get('target_unc_path'))
    selector = unc_path or printer_name
    if not selector:
        raise RuntimeError('printer_name is required.')

    target = resolve_printer_target(printers, selector)
    if target is None and printer_name and selector != printer_name:
        target = resolve_printer_target(printers, printer_name)

    if target is None:
        host, share_name = split_unc_path(unc_path)
        target = with_printer_aliases({
            'printer_name': printer_name or share_name,
            'share_name': share_name or printer_name,
            'unc_path': unc_path,
            'system_name': host,
            'driver_name': '',
            'port_name': '',
            'location': '',
            'comment': '',
            'source': 'selector',
            'is_default': False,
            'is_network': bool(unc_path),
            'is_shared': bool(unc_path),
            'work_offline': False,
            'printer_status': '',
            'meta': {'provider': 'selector'},
        })

    return payload, printer_name, target


def dispatch_print_job(command, printers):
    payload, printer_name, target = resolve_print_command_target(command, printers)
    document_name = clean_text(payload.get('document_name') or command.get('document_name') or f"Print job #{command.get('id')}")
    copies = max(1, coerce_int(payload.get('copies'), 1))
    prepared = build_print_payload(payload)
    options = payload.get('options') if isinstance(payload.get('options'), dict) else {}
    target = with_printer_aliases(target)
    target_name = clean_text(target.get('printer_name')) or printer_name
    unc_path = normalize_unc_path(target.get('unc_path'))
    unc_candidates = build_printer_unc_candidates(target) if unc_path else []

    results = []
    for index in range(copies):
        current_name = document_name if copies == 1 else f'{document_name} ({index + 1}/{copies})'

        if prepared['mode'] == 'text':
            step = None
            text_errors = []
            for unc_candidate in unc_candidates:
                try:
                    step = print_text_to_unc(unc_candidate, prepared['text'], current_name)
                    results.append(step)
                    break
                except Exception as exc:
                    text_errors.append(f'{unc_candidate}: {exc}')
            if step is not None:
                continue

            printable = resolve_printable_target(target) if unc_path else {'printer_name': target_name, 'strategy': 'local_name', 'target': target_name}
            attempts = []
            primary_target = clean_text(printable.get('printer_name')) or target_name
            if primary_target:
                attempts.append((primary_target, clean_text(printable.get('strategy')) or 'local_name'))
            for unc_candidate in unc_candidates:
                if unc_candidate.lower() != clean_text(primary_target).lower():
                    attempts.append((unc_candidate, 'direct_unc'))

            for candidate_target, candidate_strategy in attempts:
                try:
                    step = print_text_to_local_printer(candidate_target, prepared['text'], current_name)
                    if candidate_strategy:
                        step['connection_strategy'] = candidate_strategy
                    break
                except Exception as exc:
                    text_errors.append(f'{candidate_target}: {exc}')
            if step is None:
                raise RuntimeError(' ; '.join(text_errors) if text_errors else 'Text print failed.')
            results.append(step)
            continue

        if prepared['mode'] == 'raw':
            if unc_candidates:
                unc_errors = []
                step = None
                for unc_candidate in unc_candidates:
                    try:
                        step = print_raw_to_unc(unc_candidate, prepared['data'], current_name)
                        results.append(step)
                        break
                    except Exception as unc_exc:
                        unc_errors.append(f'{unc_candidate}: {unc_exc}')
                if step is None:
                    printable = resolve_printable_target(target)
                    step = print_raw_to_local_printer(clean_text(printable.get('printer_name')) or target_name, prepared['data'], current_name)
                    step['fallback_from_unc'] = ' ; '.join(unc_errors)
                    if printable.get('strategy'):
                        step['connection_strategy'] = printable['strategy']
                    results.append(step)
            else:
                results.append(print_raw_to_local_printer(target_name, prepared['data'], current_name))
            continue

        if prepared['mode'] in {'image_base64', 'image_url'}:
            printable = resolve_printable_target(target) if unc_path else {'printer_name': target_name, 'strategy': 'local_name', 'target': target_name}
            printable_target = clean_text(printable.get('printer_name')) or clean_text(printable.get('target')) or target_name or unc_path
            suffix = file_suffix_from_name(prepared['file_name'], prepared['content_type'])
            temp_path = write_temp_bytes(prepared['data'], suffix=suffix)
            image_errors = []
            try:
                attempts = []
                if printable_target:
                    attempts.append((printable_target, clean_text(printable.get('strategy')) or 'local_name'))
                for unc_candidate in unc_candidates:
                    if unc_candidate.lower() != clean_text(printable_target).lower():
                        attempts.append((unc_candidate, 'direct_unc'))

                step = None
                for candidate_target, candidate_strategy in attempts:
                    try:
                        step = print_image_to_local_printer(temp_path, candidate_target, current_name, options=options)
                        if candidate_strategy:
                            step['connection_strategy'] = candidate_strategy
                        break
                    except Exception as exc:
                        image_errors.append(f'{candidate_target}: {exc}')
                if step is None:
                    raise RuntimeError(' ; '.join(image_errors) if image_errors else 'Image print failed.')
                results.append(step)
            finally:
                try:
                    os.remove(temp_path)
                except OSError:
                    pass
            continue

        printable = resolve_printable_target(target) if unc_path else {'printer_name': target_name, 'strategy': 'local_name', 'target': target_name}
        printable_target = clean_text(printable.get('printer_name')) or clean_text(printable.get('target')) or target_name or unc_path
        suffix = file_suffix_from_name(prepared['file_name'], prepared['content_type'])
        temp_path = write_temp_bytes(prepared['data'], suffix=suffix)
        try:
            step = print_file_to_printer(temp_path, printable_target, current_name)
            if printable.get('strategy'):
                step['connection_strategy'] = printable['strategy']
            results.append(step)
        finally:
            try:
                os.remove(temp_path)
            except OSError:
                pass

    return {
        'target': target,
        'copies': copies,
        'steps': results,
        'content_type': prepared.get('content_type') or '',
        'mode': prepared.get('mode') or '',
    }


class DeviceAgentService:
    def __init__(self):
        self.session = requests.Session()
        self.stop_event = threading.Event()
        self.scan_event = threading.Event()
        self.scale_readings = deque(maxlen=25)
        self.sartorius_readings = deque(maxlen=25)
        self.print_jobs = deque(maxlen=25)
        self.scale_server_agent = {}
        self.print_server_agent = {}
        self.last_scale_error = ''
        self.last_sartorius_error = ''
        self.last_print_error = ''
        self.last_local_reading = {}
        self.last_sartorius_reading = {}
        self.last_printer_scan_at = ''
        self.printers = []
        self.serial_ports = list_serial_ports()
        self.desired_scale_settings = {}
        self.desired_sartorius_settings = {}
        self._thread = None
        self._config = load_config()
        self._state = {
            'started_at': now_str(),
            'machine_name': socket.gethostname() or platform.node(),
        }

    def start(self):
        if self._thread and self._thread.is_alive():
            return
        self._thread = threading.Thread(target=self.run_loop, name='device-agent-worker', daemon=True)
        self._thread.start()

    def get_config(self):
        with STATE_LOCK:
            return copy.deepcopy(self._config)

    def update_config(self, new_config):
        with STATE_LOCK:
            self._config = normalize_config(new_config)
            save_config(self._config)
        self.serial_ports = list_serial_ports()
        self.scan_event.set()
        log('Config updated.')
        return self.get_config()

    def snapshot(self):
        with STATE_LOCK:
            return {
                'app': {
                    'title': APP_TITLE,
                    'config_path': str(CONFIG_FILE),
                    'started_at': self._state['started_at'],
                    'machine_name': self._state['machine_name'],
                },
                'config': copy.deepcopy(self._config),
                'scale': {
                    'server_agent': copy.deepcopy(self.scale_server_agent),
                    'device_type': 'A&D',
                    'last_error': self.last_scale_error,
                    'last_local_reading': copy.deepcopy(self.last_local_reading),
                    'recent_readings': list(self.scale_readings),
                    'serial_ports': copy.deepcopy(self.serial_ports),
                },
                'sartorius': {
                    'device_type': 'Sartorius',
                    'last_error': self.last_sartorius_error,
                    'last_local_reading': copy.deepcopy(self.last_sartorius_reading),
                    'recent_readings': list(self.sartorius_readings),
                    'serial_ports': copy.deepcopy(self.serial_ports),
                },
                'printer': {
                    'server_agent': copy.deepcopy(self.print_server_agent),
                    'last_error': self.last_print_error,
                    'last_scan_at': self.last_printer_scan_at,
                    'printers': copy.deepcopy(self.printers),
                    'recent_jobs': list(self.print_jobs),
                },
                'logs': list(LOGS),
            }

    def append_scale_reading(self, reading, source='local'):
        item = copy.deepcopy(reading)
        item['source'] = source
        item['captured_at'] = now_str()
        with STATE_LOCK:
            self.last_local_reading = item
            self.scale_readings.appendleft(item)

    def append_sartorius_reading(self, reading, source='local'):
        item = copy.deepcopy(reading)
        item['source'] = source
        item['captured_at'] = now_str()
        with STATE_LOCK:
            self.last_sartorius_reading = item
            self.sartorius_readings.appendleft(item)

    def append_print_job(self, job_id, status, printer_name, detail):
        item = {
            'id': job_id,
            'status': status,
            'printer_name': clean_text(printer_name),
            'detail': detail if isinstance(detail, dict) else {'message': clean_text(detail)},
            'finished_at': now_str(),
        }
        with STATE_LOCK:
            self.print_jobs.appendleft(item)

    def manual_scale_read(self):
        config = self.get_config()
        serial_settings = normalize_serial_settings(
            config['scale']['serial'],
            self.desired_scale_settings,
            defaults=AND_SERIAL_DEFAULTS,
        )
        reading = read_scale_once(serial_settings)
        self.append_scale_reading(reading, source='manual')
        self.last_scale_error = ''
        log(f"Local A&D read OK: {reading.get('weight_text', '')} {reading.get('unit', '')}".strip())
        return reading

    def manual_sartorius_read(self):
        config = self.get_config()
        serial_settings = normalize_sartorius_settings(config['sartorius']['serial'], self.desired_sartorius_settings)
        reading = read_sartorius_once(serial_settings)
        self.append_sartorius_reading(reading, source='manual')
        self.last_sartorius_error = ''
        log(f"Local Sartorius read OK: {reading.get('weight_text', '')} {reading.get('unit', '')}".strip())
        return reading

    def refresh_printers(self, force=False):
        config = self.get_config()
        printer_config = config['printer']
        try:
            printers = scan_all_printers(
                scan_network_shares=printer_config.get('scan_network_shares', True),
                limit=printer_config.get('network_host_limit', 0),
            )
            with STATE_LOCK:
                self.printers = printers
                self.last_printer_scan_at = now_str()
                self.last_print_error = ''
            log(f'Scanned printers: {len(printers)} device(s).')
            return printers
        except Exception as exc:
            self.last_print_error = str(exc)
            if force or not self.printers:
                log(f'Printer scan failed: {exc}', level='error')
                raise
            log(f'Printer scan warning: {exc}', level='error')
            return copy.deepcopy(self.printers)

    def scale_heartbeat_payload(self):
        config = self.get_config()
        serial_settings = normalize_serial_settings(
            config['scale']['serial'],
            self.desired_scale_settings,
            defaults=AND_SERIAL_DEFAULTS,
        )
        sartorius_settings = normalize_sartorius_settings(config['sartorius']['serial'], self.desired_sartorius_settings)
        sartorius_port, _ = resolve_sartorius_port(sartorius_settings)
        return {
            'agent_key': config['agent_key'],
            'device_name': config['device_name'] or 'May can hang',
            'model': 'Unified device agent (A&D + Sartorius + LAN printer)',
            'location': config['location'],
            'machine_name': self._state['machine_name'],
            'serial_port': serial_settings['port'],
            'serial_settings': {
                'baudrate': serial_settings['baudrate'],
                'bytesize': serial_settings['bytesize'],
                'parity': serial_settings['parity'],
                'stopbits': serial_settings['stopbits'],
                'timeout_seconds': serial_settings['timeout_seconds'],
                'listen_seconds': serial_settings['listen_seconds'],
                'encoding': serial_settings['encoding'],
                'command': serial_settings['command'],
                'line_ending': serial_settings['line_ending'].encode('unicode_escape').decode('ascii'),
                'data_format': serial_settings['data_format'],
            },
            'last_error': self.last_scale_error,
            'supported_scale_types': ['A&D', 'SARTORIUS'],
            'device_catalog': {
                'and': {
                    'enabled': config['scale']['enabled'],
                    'serial_port': serial_settings['port'],
                    'last_error': self.last_scale_error,
                },
                'sartorius': {
                    'enabled': config['sartorius']['enabled'],
                    'serial_port': sartorius_port,
                    'auto_detect_port': sartorius_settings.get('auto_detect_port'),
                    'last_error': self.last_sartorius_error,
                },
                'printer': {
                    'enabled': config['printer']['enabled'],
                    'count': len(self.printers),
                    'last_error': self.last_print_error,
                },
            },
        }

    def post_scale_heartbeat(self):
        config = self.get_config()
        response = self.session.post(
            f"{config['server_url']}/api/scale/agent/heartbeat",
            json=self.scale_heartbeat_payload(),
            timeout=20,
        )
        response.raise_for_status()
        data = response.json()
        agent = data.get('agent') if isinstance(data, dict) else {}
        if isinstance(agent, dict):
            self.scale_server_agent = agent
            desired = agent.get('desired_settings')
            if isinstance(desired, dict):
                device_kind = normalize_indicator_kind(agent.get('device_type') or desired.get('device_type') or desired.get('indicator_type'))
                if device_kind == 'sartorius':
                    self.desired_sartorius_settings = desired
                else:
                    self.desired_scale_settings = desired
        return data

    def poll_scale_command(self):
        config = self.get_config()
        response = self.session.get(
            f"{config['server_url']}/api/scale/agent/poll",
            params={'agent_key': config['agent_key']},
            timeout=20,
        )
        response.raise_for_status()
        data = response.json()
        desired = data.get('desired_settings')
        if isinstance(desired, dict):
            device_kind = normalize_indicator_kind(
                desired.get('device_type') or desired.get('indicator_type') or desired.get('scale_type'),
                default='and',
            )
            if device_kind == 'sartorius':
                self.desired_sartorius_settings = desired
            else:
                self.desired_scale_settings = desired
        command = data.get('command')
        return command if isinstance(command, dict) else None

    def send_scale_result(self, command_id, status, reading=None, error=None, serial_settings=None, device_kind='and'):
        config = self.get_config()
        payload = {
            'agent_key': config['agent_key'],
            'status': status,
            'error': error or '',
            'result': {
                'device_type': 'SARTORIUS' if device_kind == 'sartorius' else 'A&D',
                'serial_settings': {
                    'port': serial_settings.get('port') if serial_settings else '',
                    'baudrate': serial_settings.get('baudrate') if serial_settings else '',
                    'bytesize': serial_settings.get('bytesize') if serial_settings else '',
                    'parity': serial_settings.get('parity') if serial_settings else '',
                    'stopbits': serial_settings.get('stopbits') if serial_settings else '',
                    'timeout_seconds': serial_settings.get('timeout_seconds') if serial_settings else '',
                    'listen_seconds': serial_settings.get('listen_seconds') if serial_settings else '',
                    'encoding': serial_settings.get('encoding') if serial_settings else '',
                    'command': serial_settings.get('command') if serial_settings else '',
                    'line_ending': serial_settings.get('line_ending').encode('unicode_escape').decode('ascii') if serial_settings else '',
                    'data_format': serial_settings.get('data_format') if serial_settings else '',
                },
            },
        }
        if reading:
            payload['reading'] = reading
        response = self.session.post(
            f"{config['server_url']}/api/scale/agent/commands/{command_id}/result",
            json=payload,
            timeout=20,
        )
        response.raise_for_status()
        return response.json()

    def process_scale_command(self, command):
        payload = command.get('payload') if isinstance(command.get('payload'), dict) else {}
        config = self.get_config()
        device_kind = detect_command_indicator_kind(command, payload, default='and')
        if device_kind == 'sartorius':
            serial_settings = normalize_sartorius_settings(config['sartorius']['serial'], self.desired_sartorius_settings, payload)
            serial_label = 'Sartorius'
        else:
            serial_settings = normalize_serial_settings(
                config['scale']['serial'],
                self.desired_scale_settings,
                payload,
                defaults=AND_SERIAL_DEFAULTS,
            )
            serial_label = 'A&D'
        log(f"{serial_label} command #{command['id']} via {serial_settings.get('port') or 'auto-detect'}")
        try:
            if device_kind == 'sartorius':
                reading = read_sartorius_once(serial_settings)
                self.append_sartorius_reading(reading, source='server')
                self.last_sartorius_error = ''
            else:
                reading = read_scale_once(serial_settings)
                self.append_scale_reading(reading, source='server')
                self.last_scale_error = ''
            self.send_scale_result(
                command['id'],
                'completed',
                reading=reading,
                serial_settings=serial_settings,
                device_kind=device_kind,
            )
            log(f"{serial_label} command #{command['id']} completed.")
        except Exception as exc:
            if device_kind == 'sartorius':
                self.last_sartorius_error = str(exc)
                error_text = self.last_sartorius_error
            else:
                self.last_scale_error = str(exc)
                error_text = self.last_scale_error
            self.send_scale_result(
                command['id'],
                'failed',
                error=error_text,
                serial_settings=serial_settings,
                device_kind=device_kind,
            )
            log(f"{serial_label} command #{command['id']} failed: {exc}", level='error')

    def print_heartbeat_payload(self):
        config = self.get_config()
        return {
            'agent_key': config['agent_key'],
            'device_name': config['device_name'] or 'LAN Printer Agent',
            'location': config['location'],
            'machine_name': self._state['machine_name'],
            'status': 'online',
            'last_error': self.last_print_error,
            'printers': copy.deepcopy(self.printers),
        }

    def post_print_heartbeat(self):
        config = self.get_config()
        response = self.session.post(
            f"{config['server_url']}/api/print/agent/heartbeat",
            json=self.print_heartbeat_payload(),
            timeout=25,
        )
        response.raise_for_status()
        data = response.json()
        agent = data.get('agent') if isinstance(data, dict) else {}
        if isinstance(agent, dict):
            self.print_server_agent = agent
        return data

    def poll_print_command(self):
        config = self.get_config()
        response = self.session.get(
            f"{config['server_url']}/api/print/agent/poll",
            params={'agent_key': config['agent_key']},
            timeout=20,
        )
        response.raise_for_status()
        data = response.json()
        command = data.get('command')
        return command if isinstance(command, dict) else None

    def send_print_result(self, command_id, status, result=None, error=None):
        config = self.get_config()
        response = self.session.post(
            f"{config['server_url']}/api/print/agent/commands/{command_id}/result",
            json={
                'agent_key': config['agent_key'],
                'status': status,
                'error': error or '',
                'result': result if isinstance(result, dict) else {},
            },
            timeout=20,
        )
        response.raise_for_status()
        return response.json()

    def process_print_command(self, command):
        log(f"Print command #{command['id']} for {clean_text(command.get('printer_name'))}")
        try:
            result = dispatch_print_job(command, copy.deepcopy(self.printers))
            result = verify_print_result(command, result)
            self.send_print_result(command['id'], 'completed', result=result)
            self.last_print_error = ''
            self.append_print_job(command['id'], 'completed', command.get('printer_name'), result)
            log(f"Print command #{command['id']} completed.")
        except Exception as exc:
            raw_error = str(exc)
            self.last_print_error = simplify_print_error_message(raw_error, command.get('printer_name'))
            self.send_print_result(
                command['id'],
                'failed',
                error=self.last_print_error,
                result={'trace': traceback.format_exc(limit=3), 'raw_error': raw_error},
            )
            self.append_print_job(
                command['id'],
                'failed',
                command.get('printer_name'),
                {'error': self.last_print_error, 'raw_error': raw_error},
            )
            log(f"Print command #{command['id']} failed: {raw_error}", level='error')

    def bootstrap(self):
        self.serial_ports = list_serial_ports()
        try:
            self.refresh_printers(force=False)
        except Exception:
            pass

    def run_loop(self):
        self.bootstrap()
        last_scale_heartbeat = 0.0
        last_scale_poll = 0.0
        last_print_heartbeat = 0.0
        last_print_poll = 0.0
        last_printer_scan = 0.0
        log(f'Device agent started on http://{DASHBOARD_HOST}:{DASHBOARD_PORT}')
        while not self.stop_event.is_set():
            config = self.get_config()
            if not config.get('agent_key'):
                time.sleep(1.0)
                continue
            try:
                now = time.monotonic()
                scale_channel_enabled = config['scale']['enabled'] or config['sartorius']['enabled']

                scale_heartbeat_seconds = min(
                    max(3.0, config['scale']['heartbeat_interval_seconds']),
                    max(3.0, config['sartorius']['heartbeat_interval_seconds']),
                )
                scale_poll_seconds = min(
                    max(1.0, config['scale']['poll_interval_seconds']),
                    max(1.0, config['sartorius']['poll_interval_seconds']),
                )

                if scale_channel_enabled and now - last_scale_heartbeat >= scale_heartbeat_seconds:
                    self.post_scale_heartbeat()
                    last_scale_heartbeat = now

                if config['printer']['enabled'] and (
                    self.scan_event.is_set() or now - last_printer_scan >= max(15.0, config['printer']['scan_interval_seconds'])
                ):
                    self.refresh_printers(force=False)
                    self.scan_event.clear()
                    last_printer_scan = now

                if config['printer']['enabled'] and now - last_print_heartbeat >= max(3.0, config['printer']['heartbeat_interval_seconds']):
                    self.post_print_heartbeat()
                    last_print_heartbeat = now

                if scale_channel_enabled and now - last_scale_poll >= scale_poll_seconds:
                    command = self.poll_scale_command()
                    last_scale_poll = now
                    if command:
                        self.process_scale_command(command)

                if config['printer']['enabled'] and now - last_print_poll >= max(1.0, config['printer']['poll_interval_seconds']):
                    command = self.poll_print_command()
                    last_print_poll = now
                    if command:
                        self.process_print_command(command)

                time.sleep(1.0)
            except requests.RequestException as exc:
                message = f'Network error: {exc}'
                self.last_scale_error = message
                self.last_sartorius_error = message
                self.last_print_error = message
                log(message, level='error')
                time.sleep(4.0)
            except Exception as exc:
                log(f'Unexpected loop error: {exc}', level='error')
                time.sleep(4.0)


ensure_runtime_deps()
AGENT_SERVICE = DeviceAgentService()
APP = Flask(__name__)


@APP.after_request
def add_cors_headers(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
    response.headers['Access-Control-Allow-Methods'] = 'GET,POST,OPTIONS'
    return response


@APP.get('/')
def dashboard():
    return render_template_string(DASHBOARD_HTML, title=APP_TITLE, dashboard_host=DASHBOARD_HOST, dashboard_port=DASHBOARD_PORT)


@APP.get('/api/state')
def api_state():
    return jsonify(AGENT_SERVICE.snapshot())


@APP.post('/api/config')
def api_config():
    payload = request.get_json(force=True, silent=True) or {}
    config = parse_request_config(payload)
    return jsonify({'config': AGENT_SERVICE.update_config(config)})


@APP.post('/api/scale/read-now')
def api_scale_read_now():
    try:
        reading = AGENT_SERVICE.manual_scale_read()
        return jsonify({'ok': True, 'reading': reading})
    except Exception as exc:
        return jsonify({'ok': False, 'error': str(exc)}), 400


@APP.post('/api/and/read-now')
def api_and_read_now():
    return api_scale_read_now()


@APP.post('/api/sartorius/read-now')
def api_sartorius_read_now():
    try:
        reading = AGENT_SERVICE.manual_sartorius_read()
        return jsonify({'ok': True, 'reading': reading})
    except Exception as exc:
        return jsonify({'ok': False, 'error': str(exc)}), 400


@APP.post('/api/printers/scan')
def api_printer_scan():
    try:
        printers = AGENT_SERVICE.refresh_printers(force=True)
        AGENT_SERVICE.scan_event.clear()
        return jsonify({'ok': True, 'printers': printers})
    except Exception as exc:
        return jsonify({'ok': False, 'error': str(exc)}), 400


@APP.post('/api/print/dispatch')
def api_print_dispatch():
    payload = request.get_json(force=True, silent=True) or {}
    printer_name = clean_text(payload.get('printer_name'))
    command = {
        'id': f'local-{int(time.time())}',
        'printer_name': printer_name,
        'document_name': clean_text(payload.get('document_name') or 'Agent print job'),
        'payload': payload,
    }
    try:
        result = dispatch_print_job(command, copy.deepcopy(AGENT_SERVICE.printers))
        result = verify_print_result(command, result)
        AGENT_SERVICE.last_print_error = ''
        AGENT_SERVICE.append_print_job(command['id'], 'completed', printer_name, result)
        return jsonify({'ok': True, 'result': result})
    except Exception as exc:
        raw_error = str(exc)
        friendly_error = simplify_print_error_message(raw_error, printer_name)
        AGENT_SERVICE.last_print_error = friendly_error
        AGENT_SERVICE.append_print_job(
            command['id'],
            'failed',
            printer_name,
            {'error': friendly_error, 'raw_error': raw_error},
        )
        return jsonify({'ok': False, 'error': friendly_error, 'raw_error': raw_error}), 400


DASHBOARD_HTML = """
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{{ title }}</title>
  <style>
    :root {
      --bg: #edf2f8;
      --bg-deep: #e6edf5;
      --card: #ffffff;
      --line: #d7e2ee;
      --text: #0f172a;
      --muted: #64748b;
      --navy: #1f2a40;
      --navy-soft: #34425b;
      --gold: #d5aa66;
      --teal: #0f766e;
      --blue: #1d4ed8;
      --shadow: 0 18px 35px rgba(15, 23, 42, 0.08);
      --radius: 22px;
    }
    * { box-sizing: border-box; }
    html, body { min-height: 100%; }
    body {
      margin: 0;
      background:
        radial-gradient(circle at top left, rgba(213, 170, 102, 0.18), transparent 18%),
        radial-gradient(circle at right center, rgba(31, 42, 64, 0.08), transparent 24%),
        linear-gradient(180deg, #f6f9fc 0%, var(--bg) 55%, var(--bg-deep) 100%);
      color: var(--text);
      font: 14px/1.45 "Bahnschrift", "Trebuchet MS", "Segoe UI", sans-serif;
    }
    .app-shell {
      min-height: 100vh;
      display: grid;
      grid-template-columns: 250px minmax(0, 1fr);
    }
    .sidebar {
      background: linear-gradient(180deg, #1d263a 0%, #243149 100%);
      color: #d7e1ef;
      padding: 24px 18px;
      display: flex;
      flex-direction: column;
      gap: 24px;
      border-right: 1px solid rgba(255, 255, 255, 0.06);
      box-shadow: inset -1px 0 0 rgba(255, 255, 255, 0.04);
    }
    .brand-panel {
      padding: 12px 12px 20px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      display: grid;
      gap: 14px;
    }
    .brand-mark {
      width: 96px;
      height: 96px;
      border-radius: 28px;
      display: grid;
      place-items: center;
      font-size: 44px;
      font-weight: 900;
      letter-spacing: -0.06em;
      color: var(--gold);
      background: linear-gradient(135deg, rgba(213, 170, 102, 0.18), rgba(255, 255, 255, 0.02));
      border: 1px solid rgba(213, 170, 102, 0.18);
    }
    .brand-kicker {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.16em;
      color: rgba(215, 225, 239, 0.6);
      margin-bottom: 4px;
    }
    .brand-name {
      font-size: 24px;
      line-height: 1.05;
      font-weight: 900;
      color: #f8fafc;
    }
    .brand-copy {
      color: rgba(215, 225, 239, 0.72);
      max-width: 180px;
    }
    .nav-group {
      display: grid;
      gap: 8px;
    }
    .nav-link {
      width: 100%;
      border: 0;
      background: transparent;
      color: inherit;
      padding: 12px 14px;
      border-radius: 16px;
      display: grid;
      grid-template-columns: 34px minmax(0, 1fr);
      gap: 12px;
      align-items: center;
      text-align: left;
      cursor: pointer;
      transition: background .2s ease, transform .2s ease, color .2s ease;
    }
    .nav-link:hover {
      background: rgba(255, 255, 255, 0.06);
      transform: translateX(2px);
    }
    .nav-link.active {
      background: var(--navy-soft);
      color: #ffffff;
      box-shadow: inset 3px 0 0 var(--gold);
    }
    .nav-index {
      font-size: 12px;
      font-weight: 900;
      letter-spacing: 0.08em;
      color: rgba(215, 225, 239, 0.65);
    }
    .nav-copy strong {
      display: block;
      font-size: 15px;
      font-weight: 800;
      color: inherit;
    }
    .nav-copy small {
      display: block;
      margin-top: 2px;
      color: rgba(215, 225, 239, 0.62);
      font-size: 12px;
    }
    .sidebar-foot {
      margin-top: auto;
      padding: 16px 14px;
      border-radius: 18px;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.07);
    }
    .foot-label {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.14em;
      color: rgba(215, 225, 239, 0.58);
    }
    .foot-value {
      margin-top: 8px;
      font-size: 20px;
      font-weight: 900;
      color: #ffffff;
    }
    .foot-meta {
      margin-top: 6px;
      color: rgba(215, 225, 239, 0.68);
      word-break: break-word;
    }
    .main {
      padding: 20px 24px 28px;
      display: grid;
      gap: 18px;
    }
    .card {
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
    }
    .topbar,
    .section {
      padding: 18px 20px;
    }
    .topbar {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: center;
      flex-wrap: wrap;
    }
    .eyebrow {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 6px 10px;
      border-radius: 999px;
      background: #eef4fb;
      color: #4b5f79;
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .eyebrow::before {
      content: "";
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--gold);
      box-shadow: 0 0 0 4px rgba(213, 170, 102, 0.15);
    }
    .title {
      margin: 10px 0 0;
      font-size: 30px;
      line-height: 1.02;
      font-weight: 900;
      letter-spacing: -0.04em;
    }
    .subtitle {
      margin-top: 7px;
      max-width: 760px;
      color: var(--muted);
      font-size: 15px;
    }
    .toolbar,
    .fields {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }
    .topbar-meta {
      padding: 10px 14px;
      border-radius: 14px;
      background: #f8fbff;
      border: 1px solid var(--line);
      color: #475569;
      font-weight: 700;
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 14px;
    }
    .stat {
      padding: 18px 20px;
      background:
        linear-gradient(180deg, rgba(248, 250, 252, 0.86), rgba(255, 255, 255, 0.98)),
        var(--card);
    }
    .label {
      font-size: 12px;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-weight: 800;
      margin-bottom: 10px;
    }
    .value {
      font-size: 30px;
      line-height: 1.05;
      font-weight: 900;
      letter-spacing: -0.04em;
      word-break: break-word;
    }
    .value .pill {
      font-size: 13px;
      padding: 6px 12px;
    }
    .view-stack {
      display: grid;
      gap: 18px;
    }
    .grid-two {
      display: grid;
      grid-template-columns: minmax(320px, 1.08fr) minmax(320px, 0.92fr);
      gap: 18px;
      align-items: start;
    }
    .grid-three {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 18px;
      align-items: start;
    }
    .stack {
      display: grid;
      gap: 18px;
    }
    .section-head {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: center;
      margin-bottom: 14px;
      flex-wrap: wrap;
    }
    .section-title {
      font-size: 20px;
      line-height: 1.1;
      font-weight: 900;
      letter-spacing: -0.03em;
    }
    .section-copy {
      color: var(--muted);
      margin-top: 4px;
    }
    .overview-list {
      display: grid;
      gap: 12px;
    }
    .overview-row {
      display: flex;
      justify-content: space-between;
      gap: 18px;
      align-items: center;
      padding: 14px 16px;
      border-radius: 16px;
      background: #f8fbff;
      border: 1px solid #e2ebf4;
    }
    .overview-row span {
      color: var(--muted);
      font-weight: 700;
    }
    .overview-row strong {
      color: var(--text);
      font-size: 15px;
      text-align: right;
      word-break: break-word;
    }
    .fields {
      margin-top: 12px;
    }
    .field {
      flex: 1 1 180px;
      min-width: 160px;
    }
    .field.wide {
      flex-basis: 100%;
    }
    label {
      display: block;
      margin-bottom: 6px;
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--muted);
    }
    input,
    select,
    button {
      font: inherit;
    }
    input,
    select {
      width: 100%;
      padding: 11px 12px;
      border-radius: 12px;
      border: 1.5px solid #d9e4ef;
      background: #ffffff;
      color: var(--text);
    }
    button {
      border: none;
      border-radius: 12px;
      padding: 11px 16px;
      font-weight: 800;
      cursor: pointer;
    }
    .btn-blue { background: var(--blue); color: #fff; }
    .btn-teal { background: var(--teal); color: #fff; }
    .btn-light { background: #e2e8f0; color: #334155; }
    .btn-mini {
      padding: 8px 12px;
      border-radius: 10px;
      font-size: 12px;
      line-height: 1.1;
      white-space: nowrap;
    }
    .btn-mini:disabled {
      opacity: 0.65;
      cursor: wait;
    }
    .table-wrap {
      overflow: auto;
      border: 1px solid var(--line);
      border-radius: 16px;
      background: #fbfdff;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      min-width: 720px;
    }
    th, td {
      padding: 11px 12px;
      border-bottom: 1px solid #e9eef6;
      text-align: left;
      vertical-align: top;
    }
    th {
      font-size: 12px;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.06em;
      background: #f8fafc;
    }
    .muted { color: var(--muted); }
    .pill { display: inline-block; padding: 4px 10px; border-radius: 999px; font-size: 11px; font-weight: 800; }
    .online { background: #dcfce7; color: #166534; }
    .offline { background: #fee2e2; color: #991b1b; }
    .warn { background: #fff7ed; color: #9a3412; }
    .hidden { display: none; }
    pre.log {
      margin: 0;
      padding: 16px;
      min-height: 260px;
      max-height: 520px;
      overflow: auto;
      border-radius: 16px;
      background: #0f172a;
      color: #e2e8f0;
      font: 12px/1.58 Consolas, "Courier New", monospace;
    }
    @media (max-width: 1120px) {
      .app-shell { grid-template-columns: 1fr; }
      .sidebar {
        height: auto;
        padding-bottom: 20px;
      }
      .brand-panel {
        grid-template-columns: 96px 1fr;
        align-items: center;
      }
      .nav-group {
        grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
      }
    }
    @media (max-width: 980px) {
      .main { padding: 14px; }
      .grid-two { grid-template-columns: 1fr; }
      .topbar { align-items: flex-start; }
      .stats { grid-template-columns: 1fr 1fr; }
      .overview-row { flex-direction: column; align-items: flex-start; }
      .overview-row strong { text-align: left; }
    }
    @media (max-width: 640px) {
      .stats { grid-template-columns: 1fr; }
      .brand-panel { grid-template-columns: 1fr; }
      .brand-mark { width: 82px; height: 82px; font-size: 38px; }
      .nav-link { grid-template-columns: 28px 1fr; }
    }
  </style>
</head>
<body>
  <div class="app-shell">
    <aside class="sidebar">
      <div class="brand-panel">
        <div class="brand-mark">JA</div>
        <div>
          <div class="brand-kicker">Jewelry bridge</div>
          <div class="brand-name">Device Agent</div>
          <div class="brand-copy">A&amp;D, Sartorius, LAN printers, and server control in one local panel.</div>
        </div>
      </div>

      <nav class="nav-group">
        <button class="nav-link active" type="button" data-view="overview">
          <span class="nav-index">01</span>
          <span class="nav-copy"><strong>Overview</strong><small>Machine, sync, and device summary</small></span>
        </button>
        <button class="nav-link" type="button" data-view="and">
          <span class="nav-index">02</span>
          <span class="nav-copy"><strong>A&amp;D Indicator</strong><small>7-E-1 readings and command channel</small></span>
        </button>
        <button class="nav-link" type="button" data-view="sartorius">
          <span class="nav-index">03</span>
          <span class="nav-copy"><strong>Sartorius</strong><small>8-N-1 readings and auto-detect</small></span>
        </button>
        <button class="nav-link" type="button" data-view="printer">
          <span class="nav-index">04</span>
          <span class="nav-copy"><strong>Printers</strong><small>LAN printers and test jobs</small></span>
        </button>
        <button class="nav-link" type="button" data-view="config">
          <span class="nav-index">05</span>
          <span class="nav-copy"><strong>Settings</strong><small>Server, serial, and scan options</small></span>
        </button>
        <button class="nav-link" type="button" data-view="logs">
          <span class="nav-index">06</span>
          <span class="nav-copy"><strong>Logs</strong><small>Runtime events and device errors</small></span>
        </button>
      </nav>

      <div class="sidebar-foot">
        <div class="foot-label">Machine</div>
        <div class="foot-value" id="sidebarMachine">-</div>
        <div class="foot-meta">http://{{ dashboard_host }}:{{ dashboard_port }}</div>
      </div>
    </aside>

    <main class="main">
      <section class="card topbar">
        <div>
          <div class="eyebrow">Local dashboard</div>
          <h1 class="title" id="viewTitle">{{ title }}</h1>
          <div class="subtitle" id="viewSubtitle">Monitor A&amp;D, Sartorius, and LAN printer activity from one left-nav dashboard.</div>
        </div>
        <div class="toolbar">
          <div class="topbar-meta" id="topbarMachine">Machine: -</div>
          <button class="btn-light" id="refreshBtn" type="button">Refresh</button>
          <button class="btn-blue" id="manualAndBtn" type="button">Read A&amp;D</button>
          <button class="btn-blue" id="manualSartoriusBtn" type="button">Read Sartorius</button>
          <button class="btn-teal" id="scanPrintersBtn" type="button">Scan Printers</button>
        </div>
      </section>

      <section class="stats">
        <div class="card stat"><div class="label">Agent key</div><div class="value" id="statAgentKey">-</div></div>
        <div class="card stat"><div class="label">A&amp;D status</div><div class="value" id="statAndStatus">-</div></div>
        <div class="card stat"><div class="label">Sartorius status</div><div class="value" id="statSartoriusStatus">-</div></div>
        <div class="card stat"><div class="label">Printers</div><div class="value" id="statPrinterCount">0</div></div>
        <div class="card stat"><div class="label">Last A&amp;D value</div><div class="value" id="statAndValue">-</div></div>
        <div class="card stat"><div class="label">Last Sartorius value</div><div class="value" id="statSartoriusValue">-</div></div>
      </section>

      <section id="view-overview" class="view-stack">
        <div class="grid-two">
          <div class="card section">
            <div class="section-head">
              <div>
                <div class="section-title">Agent overview</div>
                <div class="section-copy">Bridge between jewelry.n-lux.com, A&amp;D indicators, Sartorius indicators, and every LAN printer found on this subnet.</div>
              </div>
            </div>
            <div class="overview-list" id="overviewSummary">Loading...</div>
          </div>
          <div class="card section">
            <div class="section-head">
              <div>
                <div class="section-title">Live snapshot</div>
                <div class="section-copy">Quick health check for reads, scans, and recent device activity.</div>
              </div>
            </div>
            <div class="overview-list" id="overviewHealth">Loading...</div>
          </div>
        </div>
        <div class="grid-three">
          <div class="card section">
            <div class="section-title" style="margin-bottom:12px;">A&amp;D status</div>
            <div id="andStatusMeta" class="muted">No data yet.</div>
          </div>
          <div class="card section">
            <div class="section-title" style="margin-bottom:12px;">Sartorius status</div>
            <div id="sartoriusStatusMeta" class="muted">No data yet.</div>
          </div>
          <div class="card section">
            <div class="section-title" style="margin-bottom:12px;">Printer status</div>
            <div id="printerStatusMeta" class="muted">No data yet.</div>
          </div>
        </div>
      </section>

      <section id="view-and" class="view-stack hidden">
        <div class="grid-two">
          <div class="card section">
            <div class="section-head">
              <div>
                <div class="section-title">A&amp;D readings</div>
                <div class="section-copy">Manual reads and server-triggered reads for the A&amp;D indicator channel.</div>
              </div>
            </div>
            <div class="table-wrap">
              <table><thead><tr><th>Time</th><th>Source</th><th>Stable</th><th>Weight</th><th>Unit</th><th>Header</th><th>Raw</th></tr></thead><tbody id="andReadingsBody"></tbody></table>
            </div>
          </div>
          <div class="stack">
            <div class="card section">
              <div class="section-title" style="margin-bottom:12px;">Detected COM ports</div>
              <div class="table-wrap">
                <table><thead><tr><th>Port</th><th>Description</th><th>Manufacturer</th><th>Location</th></tr></thead><tbody id="andSerialPortsBody"></tbody></table>
              </div>
            </div>
            <div class="card section">
              <div class="section-title" style="margin-bottom:12px;">A&amp;D detail</div>
              <div id="andStatusDetail" class="muted">No data yet.</div>
            </div>
          </div>
        </div>
      </section>

      <section id="view-sartorius" class="view-stack hidden">
        <div class="grid-two">
          <div class="card section">
            <div class="section-head">
              <div>
                <div class="section-title">Sartorius readings</div>
                <div class="section-copy">Manual reads and shared scale commands routed to the Sartorius indicator.</div>
              </div>
            </div>
            <div class="table-wrap">
              <table><thead><tr><th>Time</th><th>Source</th><th>Stable</th><th>Weight</th><th>Unit</th><th>Header</th><th>Raw</th></tr></thead><tbody id="sartoriusReadingsBody"></tbody></table>
            </div>
          </div>
          <div class="stack">
            <div class="card section">
              <div class="section-title" style="margin-bottom:12px;">Detected COM ports</div>
              <div class="table-wrap">
                <table><thead><tr><th>Port</th><th>Description</th><th>Manufacturer</th><th>Location</th></tr></thead><tbody id="sartoriusSerialPortsBody"></tbody></table>
              </div>
            </div>
            <div class="card section">
              <div class="section-title" style="margin-bottom:12px;">Sartorius detail</div>
              <div id="sartoriusStatusDetail" class="muted">No data yet.</div>
            </div>
          </div>
        </div>
      </section>

      <section id="view-printer" class="view-stack hidden">
        <div class="grid-two">
          <div class="card section">
            <div class="section-head">
              <div>
                <div class="section-title">Printers</div>
                <div class="section-copy">Local printers come from Win32_Printer. Network printer shares come from SMB browser, ARP, and subnet SMB probing.</div>
              </div>
            </div>
            <div class="table-wrap">
              <table><thead><tr><th>Action</th><th>Printer</th><th>Host PC</th><th>UNC</th><th>Driver</th><th>Port</th><th>Flags</th><th>Source</th></tr></thead><tbody id="printersBody"></tbody></table>
            </div>
          </div>
          <div style="display:grid;gap:18px;">
            <div class="card section">
              <div class="section-title" style="margin-bottom:12px;">Recent print jobs</div>
              <div class="table-wrap">
                <table><thead><tr><th>Time</th><th>Status</th><th>Printer</th><th>Detail</th></tr></thead><tbody id="printJobsBody"></tbody></table>
              </div>
            </div>
            <div class="card section">
              <div class="section-title" style="margin-bottom:12px;">Printer detail</div>
              <div id="printerStatusDetail" class="muted">No data yet.</div>
            </div>
          </div>
        </div>
      </section>

      <section id="view-config" class="view-stack hidden">
        <section class="card section">
          <div class="section-title">Agent config</div>
          <div class="section-copy">Save the server URL, shared agent identity, A&amp;D settings, Sartorius settings, and printer scan options here.</div>
          <form id="configForm">
            <div class="fields">
              <div class="field"><label>Server URL</label><input name="server_url" /></div>
              <div class="field"><label>Agent key</label><input name="agent_key" /></div>
              <div class="field"><label>Device name</label><input name="device_name" /></div>
              <div class="field"><label>Location</label><input name="location" /></div>
              <div class="field"><label>A&amp;D enabled</label><select name="scale_enabled"><option value="true">true</option><option value="false">false</option></select></div>
              <div class="field"><label>A&amp;D COM</label><input name="scale_port" /></div>
              <div class="field"><label>A&amp;D baudrate</label><input name="scale_baudrate" /></div>
              <div class="field"><label>A&amp;D bytesize</label><input name="scale_bytesize" /></div>
              <div class="field"><label>A&amp;D parity</label><select name="scale_parity"><option value="N">N</option><option value="E">E</option><option value="O">O</option><option value="M">M</option><option value="S">S</option></select></div>
              <div class="field"><label>A&amp;D stopbits</label><select name="scale_stopbits"><option value="1">1</option><option value="1.5">1.5</option><option value="2">2</option></select></div>
              <div class="field"><label>A&amp;D timeout s</label><input name="scale_timeout_seconds" /></div>
              <div class="field"><label>A&amp;D listen s</label><input name="scale_listen_seconds" /></div>
              <div class="field"><label>A&amp;D encoding</label><input name="scale_encoding" /></div>
              <div class="field"><label>A&amp;D command</label><input name="scale_command" /></div>
              <div class="field"><label>A&amp;D line ending</label><input name="scale_line_ending" /></div>
              <div class="field"><label>A&amp;D format</label><select name="scale_data_format"><option value="AUTO">AUTO</option><option value="A&D">A&amp;D</option><option value="AND">AND</option></select></div>
              <div class="field"><label>A&amp;D poll s</label><input name="scale_poll_interval_seconds" /></div>
              <div class="field"><label>A&amp;D heartbeat s</label><input name="scale_heartbeat_interval_seconds" /></div>
              <div class="field"><label>Sartorius enabled</label><select name="sartorius_enabled"><option value="true">true</option><option value="false">false</option></select></div>
              <div class="field"><label>Auto-detect COM</label><select name="sartorius_auto_detect_port"><option value="true">true</option><option value="false">false</option></select></div>
              <div class="field"><label>Sartorius COM</label><input name="sartorius_port" placeholder="Leave blank for auto-detect" /></div>
              <div class="field"><label>Sartorius baudrate</label><input name="sartorius_baudrate" /></div>
              <div class="field"><label>Sartorius bytesize</label><input name="sartorius_bytesize" /></div>
              <div class="field"><label>Sartorius parity</label><select name="sartorius_parity"><option value="N">N</option><option value="E">E</option><option value="O">O</option><option value="M">M</option><option value="S">S</option></select></div>
              <div class="field"><label>Sartorius stopbits</label><select name="sartorius_stopbits"><option value="1">1</option><option value="1.5">1.5</option><option value="2">2</option></select></div>
              <div class="field"><label>Sartorius timeout s</label><input name="sartorius_timeout_seconds" /></div>
              <div class="field"><label>Sartorius listen s</label><input name="sartorius_listen_seconds" /></div>
              <div class="field"><label>Sartorius encoding</label><input name="sartorius_encoding" /></div>
              <div class="field"><label>Sartorius poll command</label><input name="sartorius_command" placeholder="Example: P or SI" /></div>
              <div class="field"><label>Sartorius line ending</label><input name="sartorius_line_ending" /></div>
              <div class="field"><label>Sartorius format</label><select name="sartorius_data_format"><option value="SARTORIUS">SARTORIUS</option><option value="AUTO">AUTO</option></select></div>
              <div class="field"><label>Sartorius poll s</label><input name="sartorius_poll_interval_seconds" /></div>
              <div class="field"><label>Sartorius heartbeat s</label><input name="sartorius_heartbeat_interval_seconds" /></div>
              <div class="field"><label>Printer enabled</label><select name="printer_enabled"><option value="true">true</option><option value="false">false</option></select></div>
              <div class="field"><label>Printer poll s</label><input name="printer_poll_interval_seconds" /></div>
              <div class="field"><label>Printer heartbeat s</label><input name="printer_heartbeat_interval_seconds" /></div>
              <div class="field"><label>Printer scan s</label><input name="printer_scan_interval_seconds" /></div>
              <div class="field"><label>Scan network shares</label><select name="printer_scan_network_shares"><option value="true">true</option><option value="false">false</option></select></div>
              <div class="field"><label>Network host limit (0 = full subnet)</label><input name="printer_network_host_limit" /></div>
            </div>
            <div class="toolbar" style="margin-top:14px;">
              <button type="submit" class="btn-teal">Save config</button>
              <span id="formStatus" class="muted"></span>
            </div>
          </form>
        </section>
      </section>

      <section id="view-logs" class="view-stack hidden">
        <section class="card section">
          <div class="section-title" style="margin-bottom:12px;">Logs</div>
          <pre class="log" id="logsBlock">Starting...</pre>
        </section>
      </section>
    </main>
  </div>
  <script>
    const stateUrl = '/api/state';
    const configForm = document.getElementById('configForm');
    const formStatus = document.getElementById('formStatus');
    const printersBody = document.getElementById('printersBody');
    const navItems = Array.from(document.querySelectorAll('[data-view]'));
    const viewNames = ['overview', 'and', 'sartorius', 'printer', 'config', 'logs'];
    let latestState = null;
    let currentPrinters = [];
    const viewMeta = {
      overview: {
        title: 'Agent console',
        subtitle: 'Monitor A&D, Sartorius, LAN printer, and server sync from one sidebar layout.',
      },
      and: {
        title: 'A&D indicator panel',
        subtitle: 'Review recent A&D readings, serial data, and the shared scale command channel.',
      },
      sartorius: {
        title: 'Sartorius panel',
        subtitle: 'Review recent Sartorius readings, COM detection, and the shared scale command channel.',
      },
      printer: {
        title: 'Printer panel',
        subtitle: 'Review LAN printers, UNC paths, recent print dispatch results, and test pages.',
      },
      config: {
        title: 'Agent config',
        subtitle: 'Update server URL, A&D settings, Sartorius settings, and LAN printer scan behavior.',
      },
      logs: {
        title: 'Runtime logs',
        subtitle: 'Inspect what the local agent is doing in real time.',
      },
    };

    function escapeHtml(value) {
      return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }
    function badge(value) {
      const lowered = String(value || '').toLowerCase();
      const cls = lowered === 'online' ? 'online' : (lowered === 'offline' ? 'offline' : 'warn');
      return `<span class="pill ${cls}">${escapeHtml(value || 'unknown')}</span>`;
    }
    function encodeLineEnding(value) {
      if (value === '\\r\\n') return '\\\\r\\\\n';
      if (value === '\\r') return '\\\\r';
      if (value === '\\n') return '\\\\n';
      return value || '';
    }
    function formatWeight(reading) {
      const row = reading || {};
      return row.weight_text ? `${row.weight_text} ${row.unit || ''}`.trim() : '-';
    }
    function localDeviceStatus(enabled, lastReading, lastError) {
      if (!enabled) return 'disabled';
      if (lastError) return 'error';
      if ((lastReading || {}).raw_line || (lastReading || {}).weight_text) return 'online';
      return 'idle';
    }
    function activateView(name) {
      const meta = viewMeta[name] || viewMeta.overview;
      navItems.forEach((button) => button.classList.toggle('active', button.dataset.view === name));
      viewNames.forEach((view) => {
        const node = document.getElementById(`view-${view}`);
        if (node) node.classList.toggle('hidden', view !== name);
      });
      document.getElementById('viewTitle').textContent = meta.title;
      document.getElementById('viewSubtitle').textContent = meta.subtitle;
    }
    function fillForm(config) {
      const andSerial = ((config || {}).scale || {}).serial || {};
      const sartoriusSerial = ((config || {}).sartorius || {}).serial || {};
      const printer = ((config || {}).printer || {});
      const values = {
        server_url: config.server_url || '',
        agent_key: config.agent_key || '',
        device_name: config.device_name || '',
        location: config.location || '',
        scale_enabled: String(!!((config.scale || {}).enabled)),
        scale_port: andSerial.port || '',
        scale_baudrate: andSerial.baudrate ?? '',
        scale_bytesize: andSerial.bytesize ?? '',
        scale_parity: andSerial.parity || 'E',
        scale_stopbits: andSerial.stopbits ?? 1,
        scale_timeout_seconds: andSerial.timeout_seconds ?? '',
        scale_listen_seconds: andSerial.listen_seconds ?? '',
        scale_encoding: andSerial.encoding || 'ascii',
        scale_command: andSerial.command || 'Q',
        scale_line_ending: encodeLineEnding(andSerial.line_ending || '\\r'),
        scale_data_format: andSerial.data_format || 'A&D',
        scale_poll_interval_seconds: (config.scale || {}).poll_interval_seconds ?? 3,
        scale_heartbeat_interval_seconds: (config.scale || {}).heartbeat_interval_seconds ?? 15,
        sartorius_enabled: String(!!((config.sartorius || {}).enabled)),
        sartorius_auto_detect_port: String(!!sartoriusSerial.auto_detect_port),
        sartorius_port: sartoriusSerial.port || '',
        sartorius_baudrate: sartoriusSerial.baudrate ?? '',
        sartorius_bytesize: sartoriusSerial.bytesize ?? '',
        sartorius_parity: sartoriusSerial.parity || 'N',
        sartorius_stopbits: sartoriusSerial.stopbits ?? 1,
        sartorius_timeout_seconds: sartoriusSerial.timeout_seconds ?? '',
        sartorius_listen_seconds: sartoriusSerial.listen_seconds ?? '',
        sartorius_encoding: sartoriusSerial.encoding || 'utf-8',
        sartorius_command: sartoriusSerial.command || '',
        sartorius_line_ending: encodeLineEnding(sartoriusSerial.line_ending || '\\r\\n'),
        sartorius_data_format: sartoriusSerial.data_format || 'SARTORIUS',
        sartorius_poll_interval_seconds: (config.sartorius || {}).poll_interval_seconds ?? 3,
        sartorius_heartbeat_interval_seconds: (config.sartorius || {}).heartbeat_interval_seconds ?? 15,
        printer_enabled: String(!!printer.enabled),
        printer_poll_interval_seconds: printer.poll_interval_seconds ?? 1,
        printer_heartbeat_interval_seconds: printer.heartbeat_interval_seconds ?? 15,
        printer_scan_interval_seconds: printer.scan_interval_seconds ?? 90,
        printer_scan_network_shares: String(!!printer.scan_network_shares),
        printer_network_host_limit: printer.network_host_limit ?? 0,
      };
      Object.entries(values).forEach(([key, value]) => {
        if (configForm.elements[key]) configForm.elements[key].value = value;
      });
    }
    function tableRows(target, rows, colSpan = 8) {
      target.innerHTML = rows.length ? rows.join('') : `<tr><td colspan="${colSpan}" class="muted">No data.</td></tr>`;
    }
    function renderIndicatorRows(target, readings) {
      tableRows(
        target,
        (readings || []).map((row) => `<tr><td>${escapeHtml(row.captured_at || '')}</td><td>${escapeHtml(row.source || '')}</td><td>${row.stable ? 'true' : 'false'}</td><td>${escapeHtml(row.weight_text || '')}</td><td>${escapeHtml(row.unit || '')}</td><td>${escapeHtml(row.header || '')}</td><td>${escapeHtml(row.raw_line || '')}</td></tr>`),
        7,
      );
    }
    function renderPortRows(target, ports) {
      tableRows(
        target,
        (ports || []).map((row) => `<tr><td>${escapeHtml(row.device || '')}</td><td>${escapeHtml(row.description || '')}</td><td>${escapeHtml(row.manufacturer || '')}</td><td>${escapeHtml(row.location || '')}</td></tr>`),
        4,
      );
    }
    function buildTestPageText(row) {
      const machineName = (((latestState || {}).app || {}).machine_name) || '-';
      const printerName = row.printer_name || row.share_name || row.unc_path || '-';
      const hostName = row.host_pc || row.system_name || '-';
      const uncPath = row.unc_path || '-';
      const printedAt = new Date().toLocaleString('en-US', { hour12: false });
      return [
        'JEWELRY DEVICE AGENT TEST PAGE',
        '',
        `PC Name: ${machineName}`,
        `Printer Name: ${printerName}`,
        `Printer Host: ${hostName}`,
        `Printer UNC: ${uncPath}`,
        `Generated At: ${printedAt}`,
        '',
        'This page was sent from the local agent dashboard.',
      ].join('\\r\\n');
    }
    async function sendTestPrint(index, button) {
      const row = currentPrinters[index];
      if (!row) {
        window.alert('Printer row not found.');
        return;
      }
      const targetName = row.unc_path || row.printer_name || row.share_name || '';
      if (!targetName) {
        window.alert('Printer target is empty.');
        return;
      }

      const label = row.printer_name || row.share_name || targetName;
      const originalText = button.textContent;
      button.disabled = true;
      button.textContent = 'Printing...';

      try {
        const response = await fetch('/api/print/dispatch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            printer_name: targetName,
            document_name: `Test Page - ${label}`.slice(0, 120),
            mode: 'text',
            content_text: buildTestPageText(row),
            copies: 1,
          }),
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Test print failed.');
        }
        button.textContent = 'Sent';
        await refreshState();
        window.setTimeout(() => {
          button.disabled = false;
          button.textContent = originalText;
        }, 1500);
      } catch (error) {
        button.disabled = false;
        button.textContent = originalText;
        window.alert((error && error.message) ? error.message : 'Test print failed.');
        await refreshState().catch(() => {});
      }
    }
    function render(state) {
      latestState = state || {};
      const config = state.config || {};
      const andIndicator = state.scale || {};
      const sartorius = state.sartorius || {};
      const printer = state.printer || {};
      const scaleAgent = andIndicator.server_agent || {};
      const printAgent = printer.server_agent || {};
      const andReading = andIndicator.last_local_reading || {};
      const sartoriusReading = sartorius.last_local_reading || {};
      const machineName = scaleAgent.machine_name || printAgent.machine_name || ((state.app || {}).machine_name) || '-';
      const recentJob = (printer.recent_jobs || [])[0] || {};
      const andStatus = localDeviceStatus(!!((config.scale || {}).enabled), andReading, andIndicator.last_error || '');
      const sartoriusStatus = localDeviceStatus(!!((config.sartorius || {}).enabled), sartoriusReading, sartorius.last_error || '');
      const printerStatus = localDeviceStatus(!!((config.printer || {}).enabled), { raw_line: printer.last_scan_at || '', weight_text: (printer.printers || []).length ? '1' : '' }, printer.last_error || '');
      currentPrinters = printer.printers || [];

      document.getElementById('sidebarMachine').textContent = machineName;
      document.getElementById('topbarMachine').textContent = `Machine: ${machineName}`;
      document.getElementById('statAgentKey').textContent = config.agent_key || '-';
      document.getElementById('statAndStatus').innerHTML = badge(andStatus);
      document.getElementById('statSartoriusStatus').innerHTML = badge(sartoriusStatus);
      document.getElementById('statPrinterCount').textContent = String((printer.printers || []).length);
      document.getElementById('statAndValue').textContent = formatWeight(andReading);
      document.getElementById('statSartoriusValue').textContent = formatWeight(sartoriusReading);

      fillForm(config);

      document.getElementById('overviewSummary').innerHTML = [
        `<div class="overview-row"><span>Machine</span><strong>${escapeHtml(machineName)}</strong></div>`,
        `<div class="overview-row"><span>Server URL</span><strong>${escapeHtml(config.server_url || '-')}</strong></div>`,
        `<div class="overview-row"><span>Agent key</span><strong>${escapeHtml(config.agent_key || '-')}</strong></div>`,
        `<div class="overview-row"><span>Supported devices</span><strong>A&amp;D, Sartorius, LAN printers</strong></div>`,
        `<div class="overview-row"><span>Dashboard</span><strong>http://{{ dashboard_host }}:{{ dashboard_port }}</strong></div>`,
      ].join('');

      document.getElementById('overviewHealth').innerHTML = [
        `<div class="overview-row"><span>A&amp;D readings</span><strong>${escapeHtml(String((andIndicator.recent_readings || []).length))}</strong></div>`,
        `<div class="overview-row"><span>Sartorius readings</span><strong>${escapeHtml(String((sartorius.recent_readings || []).length))}</strong></div>`,
        `<div class="overview-row"><span>Detected printers</span><strong>${escapeHtml(String((printer.printers || []).length))}</strong></div>`,
        `<div class="overview-row"><span>Last printer scan</span><strong>${escapeHtml(printer.last_scan_at || '-')}</strong></div>`,
        `<div class="overview-row"><span>Last print job</span><strong>${escapeHtml(recentJob.printer_name || recentJob.status || '-')}</strong></div>`,
      ].join('');

      renderIndicatorRows(document.getElementById('andReadingsBody'), andIndicator.recent_readings || []);
      renderIndicatorRows(document.getElementById('sartoriusReadingsBody'), sartorius.recent_readings || []);
      renderPortRows(document.getElementById('andSerialPortsBody'), andIndicator.serial_ports || []);
      renderPortRows(document.getElementById('sartoriusSerialPortsBody'), sartorius.serial_ports || []);

      const andConfig = ((config.scale || {}).serial || {});
      const sartoriusConfig = ((config.sartorius || {}).serial || {});
      const andStatusHtml = `<div>Local status: ${badge(andStatus)}</div><div class="muted" style="margin-top:10px;">Scale command channel: ${badge(scaleAgent.status || 'offline')}</div><div class="muted">Configured COM: ${escapeHtml(andConfig.port || '-')}</div><div class="muted">Last weight: ${escapeHtml(formatWeight(andReading))}</div><div class="muted">Last error: ${escapeHtml(andIndicator.last_error || scaleAgent.last_error || '-')}</div>`;
      document.getElementById('andStatusMeta').innerHTML = andStatusHtml;
      document.getElementById('andStatusDetail').innerHTML = andStatusHtml;

      const resolvedSartoriusPort = ((((sartoriusReading.meta || {}).device || {}).device) || sartoriusConfig.port || (sartoriusConfig.auto_detect_port ? 'auto-detect' : '-'));
      const sartoriusStatusHtml = `<div>Local status: ${badge(sartoriusStatus)}</div><div class="muted" style="margin-top:10px;">Scale command channel: ${badge(scaleAgent.status || 'offline')}</div><div class="muted">Configured COM: ${escapeHtml(sartoriusConfig.port || '-')}</div><div class="muted">Resolved COM: ${escapeHtml(resolvedSartoriusPort)}</div><div class="muted">Auto-detect: ${escapeHtml(String(!!sartoriusConfig.auto_detect_port))}</div><div class="muted">Last weight: ${escapeHtml(formatWeight(sartoriusReading))}</div><div class="muted">Last error: ${escapeHtml(sartorius.last_error || '-')}</div>`;
      document.getElementById('sartoriusStatusMeta').innerHTML = sartoriusStatusHtml;
      document.getElementById('sartoriusStatusDetail').innerHTML = sartoriusStatusHtml;

      tableRows(
        document.getElementById('printersBody'),
        (currentPrinters || []).map((row, index) => {
          const hostPc = row.host_pc || row.system_name || '';
          const hostAddress = row.host_address || (hostPc !== (row.system_name || '') ? (row.system_name || '') : '');
          const hostCell = hostAddress && hostAddress !== hostPc
            ? `<div>${escapeHtml(hostPc)}</div><div class="muted">${escapeHtml(hostAddress)}</div>`
            : escapeHtml(hostPc);
          return `<tr><td><button type="button" class="btn-light btn-mini" data-test-print="${index}">Test Print</button></td><td>${escapeHtml(row.printer_name || row.share_name || '')}</td><td>${hostCell}</td><td>${escapeHtml(row.unc_path || '')}</td><td>${escapeHtml(row.driver_name || '')}</td><td>${escapeHtml(row.port_name || '')}</td><td>${row.is_default ? 'default ' : ''}${row.is_network ? 'network ' : ''}${row.is_shared ? 'shared' : ''}</td><td>${escapeHtml(row.source || '')}</td></tr>`;
        }),
        8,
      );
      tableRows(
        document.getElementById('printJobsBody'),
        (printer.recent_jobs || []).map((row) => `<tr><td>${escapeHtml(row.finished_at || '')}</td><td>${escapeHtml(row.status || '')}</td><td>${escapeHtml(row.printer_name || '')}</td><td>${escapeHtml(JSON.stringify(row.detail || {}))}</td></tr>`),
        4,
      );

      const printerStatusHtml = `<div>Local status: ${badge(printerStatus)}</div><div class="muted" style="margin-top:10px;">Print command channel: ${badge(printAgent.status || 'offline')}</div><div class="muted">Last seen: ${escapeHtml(printAgent.last_seen || '-')}</div><div class="muted">Last scan: ${escapeHtml(printer.last_scan_at || printAgent.last_scan_at || '-')}</div><div class="muted">Last error: ${escapeHtml(printer.last_error || printAgent.last_error || '-')}</div><div class="muted">Detected printers: ${escapeHtml(String((printer.printers || []).length))}</div>`;
      document.getElementById('printerStatusMeta').innerHTML = printerStatusHtml;
      document.getElementById('printerStatusDetail').innerHTML = printerStatusHtml;

      document.getElementById('logsBlock').textContent = (state.logs || []).map((row) => `[${row.time}] [${row.level || 'info'}] ${row.message}`).join('\\n');
    }
    async function refreshState() {
      const response = await fetch(stateUrl);
      const data = await response.json();
      render(data);
    }
    configForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      formStatus.textContent = 'Saving...';
      const payload = Object.fromEntries(new FormData(configForm).entries());
      const response = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) {
        formStatus.textContent = data.error || 'Save failed.';
        return;
      }
      formStatus.textContent = 'Config saved.';
      await refreshState();
      setTimeout(() => { formStatus.textContent = ''; }, 2500);
    });
    document.getElementById('refreshBtn').addEventListener('click', () => refreshState().catch(console.error));
    document.getElementById('manualAndBtn').addEventListener('click', async () => {
      const response = await fetch('/api/and/read-now', { method: 'POST' });
      const data = await response.json();
      if (!response.ok) window.alert(data.error || 'A&D read failed.');
      await refreshState();
    });
    document.getElementById('manualSartoriusBtn').addEventListener('click', async () => {
      const response = await fetch('/api/sartorius/read-now', { method: 'POST' });
      const data = await response.json();
      if (!response.ok) window.alert(data.error || 'Sartorius read failed.');
      await refreshState();
    });
    document.getElementById('scanPrintersBtn').addEventListener('click', async () => {
      const response = await fetch('/api/printers/scan', { method: 'POST' });
      const data = await response.json();
      if (!response.ok) window.alert(data.error || 'Printer scan failed.');
      await refreshState();
    });
    printersBody.addEventListener('click', (event) => {
      const button = event.target.closest('[data-test-print]');
      if (!button) return;
      const index = Number(button.dataset.testPrint);
      if (!Number.isFinite(index)) return;
      sendTestPrint(index, button).catch(console.error);
    });
    navItems.forEach((button) => button.addEventListener('click', () => activateView(button.dataset.view)));
    activateView('overview');
    refreshState().catch(console.error);
    window.setInterval(() => refreshState().catch(console.error), 5000);
  </script>
</body>
</html>
"""


def main():
    AGENT_SERVICE.start()
    APP.run(host=DASHBOARD_HOST, port=DASHBOARD_PORT, debug=False, use_reloader=False)


if __name__ == '__main__':
    main()
