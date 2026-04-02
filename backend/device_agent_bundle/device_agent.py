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
from collections import deque
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

DEFAULT_CONFIG = {
    'server_url': 'http://127.0.0.1:5001',
    'agent_key': '',
    'device_name': 'Device agent',
    'location': '',
    'scale': {
        'enabled': True,
        'poll_interval_seconds': 3,
        'heartbeat_interval_seconds': 15,
        'serial': {
            'port': 'COM3',
            'baudrate': 2400,
            'bytesize': 7,
            'parity': 'E',
            'stopbits': 1,
            'timeout_seconds': 2.5,
            'listen_seconds': 3.0,
            'encoding': 'ascii',
            'command': 'Q',
            'line_ending': '\\r',
            'data_format': 'AUTO',
        },
    },
    'printer': {
        'enabled': True,
        'poll_interval_seconds': 1,
        'heartbeat_interval_seconds': 15,
        'scan_interval_seconds': 90,
        'scan_network_shares': True,
        'network_host_limit': 24,
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
    config['printer']['enabled'] = coerce_bool(config['printer'].get('enabled'), True)
    config['printer']['poll_interval_seconds'] = coerce_float(config['printer'].get('poll_interval_seconds'), 1)
    config['printer']['heartbeat_interval_seconds'] = coerce_float(config['printer'].get('heartbeat_interval_seconds'), 15)
    config['printer']['scan_interval_seconds'] = coerce_float(config['printer'].get('scan_interval_seconds'), 90)
    config['printer']['scan_network_shares'] = True
    config['printer']['network_host_limit'] = coerce_int(config['printer'].get('network_host_limit'), 24)
    config['scale']['serial'] = normalize_serial_settings(config['scale'].get('serial') or {})
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
        'printer': {
            'enabled': payload.get('printer_enabled'),
            'poll_interval_seconds': payload.get('printer_poll_interval_seconds'),
            'heartbeat_interval_seconds': payload.get('printer_heartbeat_interval_seconds'),
            'scan_interval_seconds': payload.get('printer_scan_interval_seconds'),
            'scan_network_shares': True,
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


def normalize_serial_settings(local_settings, desired_settings=None, command_payload=None):
    desired_settings = desired_settings or {}
    command_payload = command_payload or {}
    merged = deep_merge(local_settings or {}, desired_settings or {})
    if command_payload.get('serial_command'):
        merged['command'] = command_payload['serial_command']
    if command_payload.get('timeout_seconds') not in (None, ''):
        merged['timeout_seconds'] = command_payload['timeout_seconds']
    if command_payload.get('listen_seconds') not in (None, ''):
        merged['listen_seconds'] = command_payload['listen_seconds']
    if command_payload.get('encoding'):
        merged['encoding'] = command_payload['encoding']
    if command_payload.get('line_ending'):
        merged['line_ending'] = command_payload['line_ending']

    port = clean_text(merged.get('port') or merged.get('serial_port') or 'COM3') or 'COM3'
    baudrate = coerce_int(merged.get('baudrate') or merged.get('baud_rate'), 2400)
    bytesize = coerce_int(merged.get('bytesize') or merged.get('data_bits'), 7)
    parity = clean_text(merged.get('parity') or 'E').upper()[:1] or 'E'
    stopbits = coerce_float(merged.get('stopbits') or merged.get('stop_bits'), 1.0)
    timeout_seconds = coerce_float(merged.get('timeout_seconds') or merged.get('timeout'), 2.5)
    listen_seconds = coerce_float(merged.get('listen_seconds'), max(timeout_seconds, 3.0))
    encoding = clean_text(merged.get('encoding') or 'ascii') or 'ascii'
    command = str(merged.get('command') or 'Q').strip()
    line_ending = decode_line_ending(merged.get('line_ending'))
    data_format = clean_text(merged.get('data_format') or 'AUTO').upper() or 'AUTO'

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


def request_bytes(config):
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
    config = build_read_config(serial_settings)
    port_info = get_port_metadata(config.port)
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
                    return enrich_reading(parse_weight_line(text, config.data_format), config, port_info)

            if pending:
                text = decode_payload(bytes(pending), config.encoding)
                if text:
                    return enrich_reading(parse_weight_line(text, config.data_format), config, port_info)

    raise RuntimeError('Scale did not return data. Check COM, baudrate, command, and output mode.')


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
        printers.append({
            'printer_name': clean_text(row.get('Name')),
            'share_name': clean_text(row.get('ShareName')),
            'unc_path': '',
            'system_name': clean_text(row.get('SystemName')),
            'driver_name': clean_text(row.get('DriverName')),
            'port_name': clean_text(row.get('PortName')),
            'location': clean_text(row.get('Location')),
            'comment': clean_text(row.get('Comment')),
            'source': 'local',
            'is_default': bool(row.get('IsDefault')),
            'is_network': bool(row.get('IsNetwork')),
            'is_shared': bool(row.get('IsShared')),
            'work_offline': bool(row.get('WorkOffline')),
            'printer_status': clean_text(row.get('PrinterStatus')),
            'meta': {'provider': 'powershell'},
        })
    return printers


def scan_network_hosts(limit=24):
    completed = run_command(['cmd', '/c', 'net view'], timeout=40)
    if completed.returncode != 0:
        return []
    hosts = []
    for line in completed.stdout.splitlines():
        line = line.strip()
        if line.startswith('\\\\'):
            host = line.lstrip('\\').split()[0].strip()
            if host:
                hosts.append(host)
    return hosts[: max(0, int(limit or 0))]


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
        devices.append({
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
        })
    return devices


def scan_network_shared_printers(limit=24):
    devices = []
    for host in scan_network_hosts(limit=limit):
        completed = run_command(['cmd', '/c', f'net view \\\\{host}'], timeout=20)
        if completed.returncode != 0:
            continue
        devices.extend(parse_net_view_shares(host, completed.stdout))
    return devices


def dedupe_printers(items):
    deduped = {}
    for item in items:
        key = clean_text(item.get('unc_path')).lower()
        if not key:
            key = '|'.join([
                clean_text(item.get('printer_name')).lower(),
                clean_text(item.get('share_name')).lower(),
                clean_text(item.get('system_name')).lower(),
            ])
        if not key:
            continue
        deduped[key] = item
    return sorted(deduped.values(), key=lambda row: (
        clean_text(row.get('system_name')).lower(),
        clean_text(row.get('printer_name')).lower(),
        clean_text(row.get('share_name')).lower(),
    ))


def scan_all_printers(scan_network_shares=True, limit=24):
    printers = []
    errors = []
    try:
        printers.extend(scan_local_printers())
    except Exception as exc:
        errors.append(f'local scan failed: {exc}')
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
    return {
        clean_text(device.get('printer_name')).lower(),
        clean_text(device.get('share_name')).lower(),
        clean_text(device.get('unc_path')).lower(),
        clean_text(device.get('system_name')).lower(),
    }


def resolve_printer_target(printers, target_name):
    needle = clean_text(target_name).lower()
    if not needle:
        return None
    for device in printers:
        if needle in printer_match_value(device):
            return device
    for device in printers:
        if (
            needle in clean_text(device.get('printer_name')).lower()
            or needle in clean_text(device.get('share_name')).lower()
            or needle in clean_text(device.get('unc_path')).lower()
        ):
            return device
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


def print_raw_to_unc(unc_path, data, document_name='Print job'):
    temp_path = write_temp_bytes(data, suffix='.raw')
    try:
        completed = run_command(['cmd', '/c', f'copy /b "{temp_path}" "{unc_path}"'], timeout=40)
        if completed.returncode != 0:
            raise RuntimeError(clean_text(completed.stderr) or clean_text(completed.stdout) or 'copy /b failed')
        return {
            'strategy': 'copy_to_unc',
            'target': unc_path,
            'bytes': len(data),
            'document_name': document_name,
        }
    finally:
        try:
            os.remove(temp_path)
        except OSError:
            pass


def print_raw_to_local_printer(printer_name, data, document_name='Print job'):
    if win32print is None:
        raise RuntimeError('Raw printing to installed printers needs pywin32 (pip install pywin32).')
    handle = win32print.OpenPrinter(printer_name)
    try:
        win32print.StartDocPrinter(handle, 1, (document_name, None, 'RAW'))
        try:
            win32print.StartPagePrinter(handle)
            win32print.WritePrinter(handle, data)
            win32print.EndPagePrinter(handle)
        finally:
            win32print.EndDocPrinter(handle)
    finally:
        win32print.ClosePrinter(handle)
    return {
        'strategy': 'win32print_raw',
        'target': printer_name,
        'bytes': len(data),
        'document_name': document_name,
    }


def print_text_to_local_printer(printer_name, text, document_name='Print job'):
    temp_path = write_temp_bytes(text.encode('utf-8'), suffix='.txt')
    try:
        script = r"""
$ErrorActionPreference = 'Stop'
Get-Content -LiteralPath $env:PRINT_FILE | Out-Printer -Name $env:PRINT_TARGET
"""
        completed = run_powershell(script, timeout=40, env={
            'PRINT_FILE': temp_path,
            'PRINT_TARGET': printer_name,
            'PRINT_TITLE': document_name,
        })
        if completed.returncode != 0:
            raise RuntimeError(clean_text(completed.stderr) or 'Out-Printer failed.')
        return {
            'strategy': 'out_printer_text',
            'target': printer_name,
            'chars': len(text),
            'document_name': document_name,
        }
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


def dispatch_print_job(command, printers):
    payload = command.get('payload') if isinstance(command.get('payload'), dict) else {}
    printer_name = clean_text(payload.get('printer_name') or command.get('printer_name'))
    unc_selector = clean_text(payload.get('unc_path') or payload.get('target_unc_path'))
    document_name = clean_text(payload.get('document_name') or command.get('document_name') or f"Print job #{command.get('id')}")
    copies = max(1, coerce_int(payload.get('copies'), 1))
    prepared = build_print_payload(payload)
    options = payload.get('options') if isinstance(payload.get('options'), dict) else {}
    target = resolve_printer_target(printers, unc_selector or printer_name)
    target_name = clean_text(target.get('printer_name') if target else printer_name) or printer_name or unc_selector
    unc_path = clean_text(target.get('unc_path') if target else unc_selector)

    results = []
    for index in range(copies):
        current_name = document_name if copies == 1 else f'{document_name} ({index + 1}/{copies})'
        if prepared['mode'] == 'text':
            if unc_path:
                results.append(print_raw_to_unc(unc_path, prepared['data'], current_name))
            else:
                results.append(print_text_to_local_printer(target_name, prepared['text'], current_name))
            continue

        if prepared['mode'] == 'raw':
            if unc_path:
                results.append(print_raw_to_unc(unc_path, prepared['data'], current_name))
            else:
                results.append(print_raw_to_local_printer(target_name, prepared['data'], current_name))
            continue

        if prepared['mode'] in {'image_base64', 'image_url'}:
            suffix = file_suffix_from_name(prepared['file_name'], prepared['content_type'])
            temp_path = write_temp_bytes(prepared['data'], suffix=suffix)
            try:
                results.append(print_image_to_local_printer(temp_path, target_name or unc_path, current_name, options=options))
            finally:
                try:
                    os.remove(temp_path)
                except OSError:
                    pass
            continue

        suffix = file_suffix_from_name(prepared['file_name'], prepared['content_type'])
        temp_path = write_temp_bytes(prepared['data'], suffix=suffix)
        try:
            results.append(print_file_to_printer(temp_path, target_name or unc_path, current_name))
        finally:
            try:
                os.remove(temp_path)
            except OSError:
                pass

    return {
        'target': target or {'printer_name': printer_name, 'unc_path': unc_path},
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
        self.print_jobs = deque(maxlen=25)
        self.scale_server_agent = {}
        self.print_server_agent = {}
        self.last_scale_error = ''
        self.last_print_error = ''
        self.last_local_reading = {}
        self.last_printer_scan_at = ''
        self.printers = []
        self.serial_ports = list_serial_ports()
        self.desired_scale_settings = {}
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
                    'last_error': self.last_scale_error,
                    'last_local_reading': copy.deepcopy(self.last_local_reading),
                    'recent_readings': list(self.scale_readings),
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
        serial_settings = normalize_serial_settings(config['scale']['serial'], self.desired_scale_settings)
        reading = read_scale_once(serial_settings)
        self.append_scale_reading(reading, source='manual')
        self.last_scale_error = ''
        log(f"Local scale read OK: {reading.get('weight_text', '')} {reading.get('unit', '')}".strip())
        return reading

    def refresh_printers(self, force=False):
        config = self.get_config()
        printer_config = config['printer']
        try:
            printers = scan_all_printers(
                scan_network_shares=True,
                limit=printer_config.get('network_host_limit', 24),
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
        serial_settings = normalize_serial_settings(config['scale']['serial'], self.desired_scale_settings)
        return {
            'agent_key': config['agent_key'],
            'device_name': config['device_name'] or 'May can hang',
            'model': 'Unified device agent',
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
            self.desired_scale_settings = desired
        command = data.get('command')
        return command if isinstance(command, dict) else None

    def send_scale_result(self, command_id, status, reading=None, error=None, serial_settings=None):
        config = self.get_config()
        payload = {
            'agent_key': config['agent_key'],
            'status': status,
            'error': error or '',
            'result': {
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
        serial_settings = normalize_serial_settings(config['scale']['serial'], self.desired_scale_settings, payload)
        log(f"Scale command #{command['id']} via {serial_settings['port']}")
        try:
            reading = read_scale_once(serial_settings)
            self.append_scale_reading(reading, source='server')
            self.send_scale_result(command['id'], 'completed', reading=reading, serial_settings=serial_settings)
            self.last_scale_error = ''
            log(f"Scale command #{command['id']} completed.")
        except Exception as exc:
            self.last_scale_error = str(exc)
            self.send_scale_result(command['id'], 'failed', error=self.last_scale_error, serial_settings=serial_settings)
            log(f"Scale command #{command['id']} failed: {exc}", level='error')

    def print_heartbeat_payload(self):
        config = self.get_config()
        return {
            'agent_key': config['agent_key'],
            'device_name': config['device_name'] or 'May in LAN agent',
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
            self.send_print_result(command['id'], 'completed', result=result)
            self.last_print_error = ''
            self.append_print_job(command['id'], 'completed', command.get('printer_name'), result)
            log(f"Print command #{command['id']} completed.")
        except Exception as exc:
            self.last_print_error = str(exc)
            self.send_print_result(command['id'], 'failed', error=self.last_print_error, result={'trace': traceback.format_exc(limit=3)})
            self.append_print_job(command['id'], 'failed', command.get('printer_name'), {'error': self.last_print_error})
            log(f"Print command #{command['id']} failed: {exc}", level='error')

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

                if config['scale']['enabled'] and now - last_scale_heartbeat >= max(3.0, config['scale']['heartbeat_interval_seconds']):
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

                if config['scale']['enabled'] and now - last_scale_poll >= max(1.0, config['scale']['poll_interval_seconds']):
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
        AGENT_SERVICE.last_print_error = ''
        AGENT_SERVICE.append_print_job(command['id'], 'completed', printer_name, result)
        return jsonify({'ok': True, 'result': result})
    except Exception as exc:
        AGENT_SERVICE.last_print_error = str(exc)
        AGENT_SERVICE.append_print_job(command['id'], 'failed', printer_name, {'error': AGENT_SERVICE.last_print_error})
        return jsonify({'ok': False, 'error': str(exc)}), 400


DASHBOARD_HTML = """
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{{ title }}</title>
  <style>
    :root {
      --bg: #f6f8fb;
      --card: #fff;
      --line: #e2e8f0;
      --text: #0f172a;
      --muted: #64748b;
      --teal: #0f766e;
      --blue: #1d4ed8;
      --red: #b91c1c;
      --shadow: 0 10px 30px rgba(15,23,42,.06);
      --radius: 18px;
    }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 22px; background: linear-gradient(180deg, #f8fbff 0%, #f5f7fb 100%); color: var(--text); font: 14px/1.45 "Segoe UI", Tahoma, sans-serif; }
    .shell { max-width: 1440px; margin: 0 auto; display: grid; gap: 18px; }
    .card { background: var(--card); border: 1px solid var(--line); border-radius: var(--radius); box-shadow: var(--shadow); }
    .header, .section { padding: 18px 20px; }
    .header { display: flex; justify-content: space-between; gap: 16px; align-items: center; flex-wrap: wrap; }
    .title { margin: 0; font-size: 28px; font-weight: 900; }
    .subtitle { margin-top: 6px; color: var(--muted); max-width: 760px; }
    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
    .stat { padding: 16px 18px; }
    .label { font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; font-weight: 700; margin-bottom: 8px; }
    .value { font-size: 28px; font-weight: 900; }
    .tabs, .toolbar, .fields { display: flex; gap: 10px; flex-wrap: wrap; }
    .fields { margin-top: 12px; }
    .field { flex: 1 1 180px; min-width: 160px; }
    label { display: block; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); margin-bottom: 6px; }
    input, select, button { font: inherit; }
    input, select { width: 100%; padding: 10px 12px; border-radius: 10px; border: 1.5px solid #dbe3ef; background: #fff; }
    button { border: none; border-radius: 10px; padding: 10px 15px; font-weight: 700; cursor: pointer; }
    .btn-blue { background: var(--blue); color: #fff; }
    .btn-teal { background: var(--teal); color: #fff; }
    .btn-light { background: #e2e8f0; color: #334155; }
    .btn-tab { background: #e2e8f0; color: #334155; }
    .btn-tab.active { background: var(--teal); color: #fff; }
    .grid-two { display: grid; grid-template-columns: minmax(320px,1.1fr) minmax(320px,.9fr); gap: 18px; align-items: start; }
    .table-wrap { overflow: auto; border: 1px solid var(--line); border-radius: 14px; background: #fbfdff; }
    table { width: 100%; border-collapse: collapse; min-width: 720px; }
    th, td { padding: 11px 12px; border-bottom: 1px solid #e9eef6; text-align: left; vertical-align: top; }
    th { font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; background: #f8fafc; }
    .muted { color: var(--muted); }
    .pill { display: inline-block; padding: 4px 10px; border-radius: 999px; font-size: 11px; font-weight: 800; }
    .online { background: #dcfce7; color: #166534; }
    .offline { background: #fee2e2; color: #991b1b; }
    .warn { background: #fff7ed; color: #9a3412; }
    .hidden { display: none; }
    pre.log { margin: 0; padding: 14px; min-height: 180px; max-height: 380px; overflow: auto; border-radius: 14px; background: #0f172a; color: #e2e8f0; font: 12px/1.55 Consolas, "Courier New", monospace; }
    @media (max-width: 980px) { body { padding: 12px; } .grid-two { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <div class="shell">
    <section class="card header">
      <div>
        <h1 class="title">{{ title }}</h1>
        <div class="subtitle">One Flask dashboard for scale and printer agent functions. Dashboard URL: http://{{ dashboard_host }}:{{ dashboard_port }}</div>
      </div>
      <div class="toolbar">
        <button class="btn-light" id="refreshBtn" type="button">Refresh</button>
        <button class="btn-blue" id="manualScaleBtn" type="button">Read scale now</button>
        <button class="btn-teal" id="scanPrintersBtn" type="button">Scan printers</button>
      </div>
    </section>

    <section class="stats">
      <div class="card stat"><div class="label">Agent key</div><div class="value" id="statAgentKey">-</div></div>
      <div class="card stat"><div class="label">Scale status</div><div class="value" id="statScaleStatus">Offline</div></div>
      <div class="card stat"><div class="label">Printers</div><div class="value" id="statPrinterCount">0</div></div>
      <div class="card stat"><div class="label">Last scale value</div><div class="value" id="statScaleValue">-</div></div>
    </section>

    <section class="card section">
      <div style="font-size:18px;font-weight:800;">Agent config</div>
      <div class="muted" style="margin-top:4px;">Save server URL, shared agent key, scale settings, and printer scan options here.</div>
      <form id="configForm">
        <div class="fields">
          <div class="field"><label>Server URL</label><input name="server_url" /></div>
          <div class="field"><label>Agent key</label><input name="agent_key" /></div>
          <div class="field"><label>Device name</label><input name="device_name" /></div>
          <div class="field"><label>Location</label><input name="location" /></div>
          <div class="field"><label>Scale enabled</label><select name="scale_enabled"><option value="true">true</option><option value="false">false</option></select></div>
          <div class="field"><label>Scale COM</label><input name="scale_port" /></div>
          <div class="field"><label>Scale baudrate</label><input name="scale_baudrate" /></div>
          <div class="field"><label>Scale bytesize</label><input name="scale_bytesize" /></div>
          <div class="field"><label>Scale parity</label><select name="scale_parity"><option value="N">N</option><option value="E">E</option><option value="O">O</option><option value="M">M</option><option value="S">S</option></select></div>
          <div class="field"><label>Scale stopbits</label><select name="scale_stopbits"><option value="1">1</option><option value="1.5">1.5</option><option value="2">2</option></select></div>
          <div class="field"><label>Scale timeout</label><input name="scale_timeout_seconds" /></div>
          <div class="field"><label>Scale listen</label><input name="scale_listen_seconds" /></div>
          <div class="field"><label>Scale encoding</label><input name="scale_encoding" /></div>
          <div class="field"><label>Scale command</label><input name="scale_command" /></div>
          <div class="field"><label>Scale line ending</label><input name="scale_line_ending" /></div>
          <div class="field"><label>Scale format</label><select name="scale_data_format"><option value="AUTO">AUTO</option><option value="A&D">A&amp;D</option><option value="AND">AND</option></select></div>
          <div class="field"><label>Scale poll s</label><input name="scale_poll_interval_seconds" /></div>
          <div class="field"><label>Scale heartbeat s</label><input name="scale_heartbeat_interval_seconds" /></div>
          <div class="field"><label>Printer enabled</label><select name="printer_enabled"><option value="true">true</option><option value="false">false</option></select></div>
          <div class="field"><label>Printer poll s</label><input name="printer_poll_interval_seconds" /></div>
          <div class="field"><label>Printer heartbeat s</label><input name="printer_heartbeat_interval_seconds" /></div>
          <div class="field"><label>Printer scan s</label><input name="printer_scan_interval_seconds" /></div>
          <div class="field"><label>Scan network shares</label><input name="printer_scan_network_shares" value="true" readonly /></div>
          <div class="field"><label>Network host limit</label><input name="printer_network_host_limit" /></div>
        </div>
        <div class="toolbar" style="margin-top:14px;">
          <button type="submit" class="btn-teal">Save config</button>
          <span id="formStatus" class="muted"></span>
        </div>
      </form>
    </section>

    <section class="card section">
      <div class="tabs">
        <button class="btn-tab active" type="button" data-tab="scale">May can hang</button>
        <button class="btn-tab" type="button" data-tab="printer">May in</button>
      </div>
    </section>

    <section id="tab-scale" class="grid-two">
      <div class="card section">
        <div style="font-size:18px;font-weight:800;margin-bottom:12px;">Scale readings</div>
        <div class="table-wrap">
          <table><thead><tr><th>Time</th><th>Source</th><th>Stable</th><th>Weight</th><th>Unit</th><th>Header</th><th>Raw</th></tr></thead><tbody id="scaleReadingsBody"></tbody></table>
        </div>
      </div>
      <div style="display:grid;gap:18px;">
        <div class="card section">
          <div style="font-size:18px;font-weight:800;margin-bottom:12px;">Detected COM ports</div>
          <div class="table-wrap">
            <table><thead><tr><th>Port</th><th>Description</th><th>Manufacturer</th><th>Location</th></tr></thead><tbody id="serialPortsBody"></tbody></table>
          </div>
        </div>
        <div class="card section">
          <div style="font-size:18px;font-weight:800;margin-bottom:12px;">Scale status</div>
          <div id="scaleStatusMeta" class="muted">No data yet.</div>
        </div>
      </div>
    </section>

    <section id="tab-printer" class="grid-two hidden">
      <div class="card section">
        <div style="font-size:18px;font-weight:800;margin-bottom:12px;">Printers</div>
        <div class="muted" style="margin-bottom:12px;">Local printers come from Win32_Printer. Network printer shares come from a best-effort net view scan.</div>
        <div class="table-wrap">
          <table><thead><tr><th>Printer</th><th>UNC</th><th>System</th><th>Driver</th><th>Port</th><th>Flags</th><th>Source</th></tr></thead><tbody id="printersBody"></tbody></table>
        </div>
      </div>
      <div style="display:grid;gap:18px;">
        <div class="card section">
          <div style="font-size:18px;font-weight:800;margin-bottom:12px;">Recent print jobs</div>
          <div class="table-wrap">
            <table><thead><tr><th>Time</th><th>Status</th><th>Printer</th><th>Detail</th></tr></thead><tbody id="printJobsBody"></tbody></table>
          </div>
        </div>
        <div class="card section">
          <div style="font-size:18px;font-weight:800;margin-bottom:12px;">Printer status</div>
          <div id="printerStatusMeta" class="muted">No data yet.</div>
        </div>
      </div>
    </section>

    <section class="card section">
      <div style="font-size:18px;font-weight:800;margin-bottom:12px;">Logs</div>
      <pre class="log" id="logsBlock">Starting...</pre>
    </section>
  </div>
  <script>
    const stateUrl = '/api/state';
    const configForm = document.getElementById('configForm');
    const formStatus = document.getElementById('formStatus');
    const tabs = Array.from(document.querySelectorAll('[data-tab]'));

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
    function fillForm(config) {
      const serial = ((config || {}).scale || {}).serial || {};
      const printer = ((config || {}).printer || {});
      const values = {
        server_url: config.server_url || '',
        agent_key: config.agent_key || '',
        device_name: config.device_name || '',
        location: config.location || '',
        scale_enabled: String(!!((config.scale || {}).enabled)),
        scale_port: serial.port || '',
        scale_baudrate: serial.baudrate ?? '',
        scale_bytesize: serial.bytesize ?? '',
        scale_parity: serial.parity || 'E',
        scale_stopbits: serial.stopbits ?? 1,
        scale_timeout_seconds: serial.timeout_seconds ?? '',
        scale_listen_seconds: serial.listen_seconds ?? '',
        scale_encoding: serial.encoding || 'ascii',
        scale_command: serial.command || 'Q',
        scale_line_ending: serial.line_ending || '\\\\r',
        scale_data_format: serial.data_format || 'AUTO',
        scale_poll_interval_seconds: (config.scale || {}).poll_interval_seconds ?? 3,
        scale_heartbeat_interval_seconds: (config.scale || {}).heartbeat_interval_seconds ?? 15,
        printer_enabled: String(!!printer.enabled),
        printer_poll_interval_seconds: printer.poll_interval_seconds ?? 1,
        printer_heartbeat_interval_seconds: printer.heartbeat_interval_seconds ?? 15,
        printer_scan_interval_seconds: printer.scan_interval_seconds ?? 90,
        printer_scan_network_shares: String(!!printer.scan_network_shares),
        printer_network_host_limit: printer.network_host_limit ?? 24,
      };
      Object.entries(values).forEach(([key, value]) => { if (configForm.elements[key]) configForm.elements[key].value = value; });
    }
    function tableRows(target, rows, colSpan = 8) {
      target.innerHTML = rows.length ? rows.join('') : `<tr><td colspan="${colSpan}" class="muted">No data.</td></tr>`;
    }
    function render(state) {
      const config = state.config || {};
      const scale = state.scale || {};
      const printer = state.printer || {};
      const scaleAgent = scale.server_agent || {};
      const printAgent = printer.server_agent || {};
      const lastReading = scale.last_local_reading || {};
      document.getElementById('statAgentKey').textContent = config.agent_key || '-';
      document.getElementById('statScaleStatus').innerHTML = badge(scaleAgent.status || 'offline');
      document.getElementById('statPrinterCount').textContent = String((printer.printers || []).length);
      document.getElementById('statScaleValue').textContent = lastReading.weight_text ? `${lastReading.weight_text} ${lastReading.unit || ''}`.trim() : '-';
      fillForm(config);
      tableRows(document.getElementById('scaleReadingsBody'), (scale.recent_readings || []).map((row) => `<tr><td>${escapeHtml(row.captured_at || '')}</td><td>${escapeHtml(row.source || '')}</td><td>${row.stable ? 'true' : 'false'}</td><td>${escapeHtml(row.weight_text || '')}</td><td>${escapeHtml(row.unit || '')}</td><td>${escapeHtml(row.header || '')}</td><td>${escapeHtml(row.raw_line || '')}</td></tr>`), 7);
      tableRows(document.getElementById('serialPortsBody'), (scale.serial_ports || []).map((row) => `<tr><td>${escapeHtml(row.device || '')}</td><td>${escapeHtml(row.description || '')}</td><td>${escapeHtml(row.manufacturer || '')}</td><td>${escapeHtml(row.location || '')}</td></tr>`), 4);
      document.getElementById('scaleStatusMeta').innerHTML = `<div>Server status: ${badge(scaleAgent.status || 'offline')}</div><div class="muted" style="margin-top:10px;">Last seen: ${escapeHtml(scaleAgent.last_seen || '-')}</div><div class="muted">Last error: ${escapeHtml(scale.last_error || scaleAgent.last_error || '-')}</div><div class="muted">Machine: ${escapeHtml(scaleAgent.machine_name || state.app.machine_name || '-')}</div>`;
      tableRows(document.getElementById('printersBody'), (printer.printers || []).map((row) => `<tr><td>${escapeHtml(row.printer_name || row.share_name || '')}</td><td>${escapeHtml(row.unc_path || '')}</td><td>${escapeHtml(row.system_name || '')}</td><td>${escapeHtml(row.driver_name || '')}</td><td>${escapeHtml(row.port_name || '')}</td><td>${row.is_default ? 'default ' : ''}${row.is_network ? 'network ' : ''}${row.is_shared ? 'shared' : ''}</td><td>${escapeHtml(row.source || '')}</td></tr>`), 7);
      tableRows(document.getElementById('printJobsBody'), (printer.recent_jobs || []).map((row) => `<tr><td>${escapeHtml(row.finished_at || '')}</td><td>${escapeHtml(row.status || '')}</td><td>${escapeHtml(row.printer_name || '')}</td><td>${escapeHtml(JSON.stringify(row.detail || {}))}</td></tr>`), 4);
      document.getElementById('printerStatusMeta').innerHTML = `<div>Server status: ${badge(printAgent.status || 'offline')}</div><div class="muted" style="margin-top:10px;">Last seen: ${escapeHtml(printAgent.last_seen || '-')}</div><div class="muted">Last scan: ${escapeHtml(printer.last_scan_at || printAgent.last_scan_at || '-')}</div><div class="muted">Last error: ${escapeHtml(printer.last_error || printAgent.last_error || '-')}</div><div class="muted">Detected printers: ${escapeHtml(String((printer.printers || []).length))}</div>`;
      document.getElementById('logsBlock').textContent = (state.logs || []).map((row) => `[${row.time}] ${row.message}`).join('\\n');
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
      const response = await fetch('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await response.json();
      if (!response.ok) { formStatus.textContent = data.error || 'Save failed.'; return; }
      formStatus.textContent = 'Config saved.';
      await refreshState();
      setTimeout(() => { formStatus.textContent = ''; }, 2500);
    });
    document.getElementById('refreshBtn').addEventListener('click', () => refreshState().catch(console.error));
    document.getElementById('manualScaleBtn').addEventListener('click', async () => { const response = await fetch('/api/scale/read-now', { method: 'POST' }); const data = await response.json(); if (!response.ok) window.alert(data.error || 'Scale read failed.'); await refreshState(); });
    document.getElementById('scanPrintersBtn').addEventListener('click', async () => { const response = await fetch('/api/printers/scan', { method: 'POST' }); const data = await response.json(); if (!response.ok) window.alert(data.error || 'Printer scan failed.'); await refreshState(); });
    tabs.forEach((button) => button.addEventListener('click', () => { tabs.forEach((item) => item.classList.remove('active')); button.classList.add('active'); const tab = button.dataset.tab; document.getElementById('tab-scale').classList.toggle('hidden', tab !== 'scale'); document.getElementById('tab-printer').classList.toggle('hidden', tab !== 'printer'); }));
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
