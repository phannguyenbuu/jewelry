import argparse
import json
import os
import platform
import re
import socket
import sys
import threading
import time
from dataclasses import asdict, dataclass
from pathlib import Path

import requests
import serial
from serial.tools import list_ports


DEFAULT_CONFIG = {
    'poll_interval_seconds': 3,
    'heartbeat_interval_seconds': 15,
    'serial': {
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
}

PARITY_MAP = {
    'N': serial.PARITY_NONE,
    'E': serial.PARITY_EVEN,
    'O': serial.PARITY_ODD,
    'M': serial.PARITY_MARK,
    'S': serial.PARITY_SPACE,
}

BYTESIZE_MAP = {
    5: serial.FIVEBITS,
    6: serial.SIXBITS,
    7: serial.SEVENBITS,
    8: serial.EIGHTBITS,
}

STOPBITS_MAP = {
    1.0: serial.STOPBITS_ONE,
    1.5: serial.STOPBITS_ONE_POINT_FIVE,
    2.0: serial.STOPBITS_TWO,
}

NEWLINE_MAP = {
    'none': b'',
    'cr': b'\r',
    'lf': b'\n',
    'crlf': b'\r\n',
}

WEIGHT_RE = re.compile(r'([+-]?\d+(?:\.\d+)?)\s*([A-Za-z%]+)?')
PORT_LOCK = threading.Lock()
LINE_ENDING_CHOICES = {
    'CR': '\r',
    'LF': '\n',
    'CRLF': '\r\n',
    'NONE': '',
}


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


def log(message):
    now = time.strftime('%Y-%m-%d %H:%M:%S')
    print(f'[{now}] {message}', flush=True)


def runtime_dir():
    if getattr(sys, 'frozen', False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent


def appdata_dir():
    root = os.environ.get('LOCALAPPDATA') or os.environ.get('APPDATA')
    if root:
        return Path(root).resolve() / 'JewelryScaleAgent'
    return runtime_dir()


def resolve_config_path(explicit_path=''):
    if explicit_path:
        return Path(explicit_path).expanduser().resolve()
    sibling_config = runtime_dir() / 'scale_agent_config.json'
    if sibling_config.exists():
        return sibling_config
    return appdata_dir() / 'scale_agent_config.json'


def merge_config(raw):
    config = dict(DEFAULT_CONFIG)
    config.update(raw or {})
    config['serial'] = {
        **DEFAULT_CONFIG['serial'],
        **((raw or {}).get('serial') or {}),
    }
    return config


def build_runtime_config(raw):
    config = merge_config(raw)
    config['server_url'] = str(config.get('server_url') or '').strip().rstrip('/')
    config['agent_key'] = str(config.get('agent_key') or '').strip()
    config['device_name'] = str(config.get('device_name') or 'May can vang').strip() or 'May can vang'
    config['model'] = str(config.get('model') or 'Weight Indicator Bundle').strip() or 'Weight Indicator Bundle'
    config['location'] = str(config.get('location') or '').strip()
    config['poll_interval_seconds'] = float(config.get('poll_interval_seconds') or 3)
    config['heartbeat_interval_seconds'] = float(config.get('heartbeat_interval_seconds') or 15)
    config['serial'] = normalize_serial_settings(config.get('serial') or {})
    return config


def read_config(path):
    config_path = Path(path)
    if not config_path.exists():
        raise FileNotFoundError(f'Khong tim thay file config: {config_path}')
    with config_path.open('r', encoding='utf-8') as handle:
        raw = json.load(handle)
    return build_runtime_config(raw)


def write_config(path, config):
    config_path = Path(path)
    config_path.parent.mkdir(parents=True, exist_ok=True)
    with config_path.open('w', encoding='utf-8') as handle:
        json.dump(config, handle, indent=2, ensure_ascii=False)


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
    if normalized == '\r':
        return 'cr'
    if normalized == '\n':
        return 'lf'
    if normalized == '\r\n':
        return 'crlf'
    return 'none'


def line_ending_label(value):
    normalized = decode_line_ending(value)
    for label, text in LINE_ENDING_CHOICES.items():
        if text == normalized:
            return label
    return 'CR'


def label_to_line_ending(label):
    return LINE_ENDING_CHOICES.get(str(label or '').strip().upper(), '\r')


def normalize_serial_settings(local_settings, desired_settings=None, command_payload=None):
    desired_settings = desired_settings or {}
    command_payload = command_payload or {}
    merged = {
        **local_settings,
        **desired_settings,
    }
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

    port = str(merged.get('port') or merged.get('serial_port') or '').strip()
    if not port:
        raise ValueError('Config serial chua co port / COM.')

    baudrate = int(merged.get('baudrate') or merged.get('baud_rate') or 2400)
    bytesize = int(merged.get('bytesize') or merged.get('data_bits') or 7)
    parity = str(merged.get('parity') or 'E').strip().upper()[:1] or 'E'
    stopbits = float(merged.get('stopbits') or merged.get('stop_bits') or 1)
    timeout_seconds = float(merged.get('timeout_seconds') or merged.get('timeout') or 2.5)
    listen_seconds = float(merged.get('listen_seconds') or max(timeout_seconds, 3.0))
    encoding = str(merged.get('encoding') or 'ascii').strip() or 'ascii'
    command = str(merged.get('command') or 'Q').strip()
    line_ending = decode_line_ending(merged.get('line_ending'))
    data_format = str(merged.get('data_format') or 'AUTO').strip().upper() or 'AUTO'

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


def fetch_bootstrap_agent(server_url, agent_key, timeout=15):
    base_url = str(server_url or '').strip().rstrip('/')
    key = str(agent_key or '').strip()
    if not base_url:
        raise ValueError('Server URL khong duoc de trong.')
    if not key:
        raise ValueError('Agent key khong duoc de trong.')

    response = requests.get(
        f'{base_url}/api/scale/agent/bootstrap',
        params={'agent_key': key},
        timeout=timeout,
    )
    try:
        data = response.json()
    except ValueError:
        data = {}
    if not response.ok:
        message = data.get('error') if isinstance(data, dict) else ''
        raise RuntimeError(message or f'Bootstrap that bai: HTTP {response.status_code}')

    agent = data.get('agent') if isinstance(data, dict) else None
    if not isinstance(agent, dict):
        raise RuntimeError('Server khong tra ve cau hinh agent hop le.')
    return agent


def build_config_from_agent(server_url, agent_key, agent, existing_config=None):
    seed = merge_config(existing_config or {})
    desired_settings = agent.get('desired_settings') or {}
    serial = normalize_serial_settings({
        **seed.get('serial', {}),
        **desired_settings,
        'port': str((seed.get('serial', {}) or {}).get('port') or agent.get('serial_port') or 'COM3').strip() or 'COM3',
    })
    return build_runtime_config({
        **seed,
        'server_url': str(server_url or '').strip().rstrip('/'),
        'agent_key': str(agent_key or '').strip(),
        'device_name': str(agent.get('device_name') or seed.get('device_name') or 'May can vang').strip() or 'May can vang',
        'model': str(agent.get('model') or seed.get('model') or 'Weight Indicator Bundle').strip() or 'Weight Indicator Bundle',
        'location': str(agent.get('location') or seed.get('location') or '').strip(),
        'serial': serial,
    })


def apply_cli_overrides(config, args):
    updated = merge_config(config or {})
    if getattr(args, 'server_url', ''):
        updated['server_url'] = str(args.server_url).strip()
    if getattr(args, 'agent_key', ''):
        updated['agent_key'] = str(args.agent_key).strip()
    if getattr(args, 'port', ''):
        updated.setdefault('serial', {})
        updated['serial']['port'] = str(args.port).strip()
    return updated


def prompt_text(label, default_value=''):
    suffix = f' [{default_value}]' if default_value else ''
    answer = input(f'{label}{suffix}: ').strip()
    return answer or default_value


def prompt_for_config_console(initial_config, config_path):
    config = merge_config(initial_config or {})
    config['server_url'] = prompt_text('Server URL', str(config.get('server_url') or ''))
    config['agent_key'] = prompt_text('Agent key', str(config.get('agent_key') or ''))

    try:
        agent = fetch_bootstrap_agent(config['server_url'], config['agent_key'])
        config = build_config_from_agent(config['server_url'], config['agent_key'], agent, config)
        log('Da nap cau hinh agent tu server.')
    except Exception as exc:
        log(f'Bootstrap that bai, dung config hien tai: {exc}')

    ports = list_serial_ports()
    default_port = str(((config.get('serial') or {}).get('port')) or (ports[0]['device'] if ports else 'COM3'))
    if ports:
        log('Cong COM hien co: ' + ', '.join(port['device'] for port in ports if port.get('device')))
    config.setdefault('serial', {})
    config['serial']['port'] = prompt_text('COM port', default_port)
    runtime_config = build_runtime_config(config)
    write_config(config_path, runtime_config)
    log(f'Da luu cau hinh vao {config_path}')
    return runtime_config


def prompt_for_config_gui(initial_config, config_path):
    try:
        import tkinter as tk
        from tkinter import messagebox, ttk
    except Exception as exc:
        log(f'Khong mo duoc giao dien setup: {exc}')
        return None

    config = merge_config(initial_config or {})
    serial = config.get('serial') or {}
    result = {'config': None, 'submitted': False}

    root = tk.Tk()
    root.title('Jewelry Scale Agent Setup')
    root.resizable(False, False)
    root.geometry('640x560')

    content = ttk.Frame(root, padding=18)
    content.grid(row=0, column=0, sticky='nsew')
    root.columnconfigure(0, weight=1)
    root.rowconfigure(0, weight=1)

    vars_map = {
        'server_url': tk.StringVar(value=str(config.get('server_url') or '')),
        'agent_key': tk.StringVar(value=str(config.get('agent_key') or '')),
        'device_name': tk.StringVar(value=str(config.get('device_name') or 'May can vang')),
        'model': tk.StringVar(value=str(config.get('model') or 'Weight Indicator Bundle')),
        'location': tk.StringVar(value=str(config.get('location') or '')),
        'port': tk.StringVar(value=str(serial.get('port') or 'COM3')),
        'baudrate': tk.StringVar(value=str(serial.get('baudrate') or 2400)),
        'bytesize': tk.StringVar(value=str(serial.get('bytesize') or 7)),
        'parity': tk.StringVar(value=str(serial.get('parity') or 'E')),
        'stopbits': tk.StringVar(value=str(serial.get('stopbits') or 1)),
        'timeout_seconds': tk.StringVar(value=str(serial.get('timeout_seconds') or 2.5)),
        'listen_seconds': tk.StringVar(value=str(serial.get('listen_seconds') or 3.0)),
        'command': tk.StringVar(value=str(serial.get('command') or 'Q')),
        'line_ending': tk.StringVar(value=line_ending_label(serial.get('line_ending'))),
        'data_format': tk.StringVar(value=str(serial.get('data_format') or 'AUTO')),
    }
    status_var = tk.StringVar(value=f'Config path: {config_path}')

    def fill_form(new_config):
        merged = merge_config(new_config or {})
        merged_serial = merged.get('serial') or {}
        vars_map['server_url'].set(str(merged.get('server_url') or ''))
        vars_map['agent_key'].set(str(merged.get('agent_key') or ''))
        vars_map['device_name'].set(str(merged.get('device_name') or 'May can vang'))
        vars_map['model'].set(str(merged.get('model') or 'Weight Indicator Bundle'))
        vars_map['location'].set(str(merged.get('location') or ''))
        vars_map['port'].set(str(merged_serial.get('port') or 'COM3'))
        vars_map['baudrate'].set(str(merged_serial.get('baudrate') or 2400))
        vars_map['bytesize'].set(str(merged_serial.get('bytesize') or 7))
        vars_map['parity'].set(str(merged_serial.get('parity') or 'E'))
        vars_map['stopbits'].set(str(merged_serial.get('stopbits') or 1))
        vars_map['timeout_seconds'].set(str(merged_serial.get('timeout_seconds') or 2.5))
        vars_map['listen_seconds'].set(str(merged_serial.get('listen_seconds') or 3.0))
        vars_map['command'].set(str(merged_serial.get('command') or 'Q'))
        vars_map['line_ending'].set(line_ending_label(merged_serial.get('line_ending')))
        vars_map['data_format'].set(str(merged_serial.get('data_format') or 'AUTO'))

    def build_form_config():
        return build_runtime_config({
            'server_url': vars_map['server_url'].get().strip(),
            'agent_key': vars_map['agent_key'].get().strip(),
            'device_name': vars_map['device_name'].get().strip(),
            'model': vars_map['model'].get().strip(),
            'location': vars_map['location'].get().strip(),
            'serial': {
                'port': vars_map['port'].get().strip(),
                'baudrate': vars_map['baudrate'].get().strip(),
                'bytesize': vars_map['bytesize'].get().strip(),
                'parity': vars_map['parity'].get().strip(),
                'stopbits': vars_map['stopbits'].get().strip(),
                'timeout_seconds': vars_map['timeout_seconds'].get().strip(),
                'listen_seconds': vars_map['listen_seconds'].get().strip(),
                'encoding': 'ascii',
                'command': vars_map['command'].get().strip(),
                'line_ending': label_to_line_ending(vars_map['line_ending'].get()),
                'data_format': vars_map['data_format'].get().strip(),
            },
        })

    def refresh_ports():
        ports = [port['device'] for port in list_serial_ports() if port.get('device')]
        if not ports:
            ports = ['COM3']
        port_box['values'] = ports
        if vars_map['port'].get() not in ports:
            vars_map['port'].set(ports[0])
        status_var.set('Da quet lai cong COM.')

    def bootstrap_from_server():
        try:
            seed_config = build_form_config()
            agent = fetch_bootstrap_agent(seed_config['server_url'], seed_config['agent_key'])
            hydrated = build_config_from_agent(seed_config['server_url'], seed_config['agent_key'], agent, seed_config)
            fill_form(hydrated)
            status_var.set('Da nap cau hinh tu server.')
        except Exception as exc:
            messagebox.showerror('Bootstrap that bai', str(exc))

    def save_and_run():
        try:
            runtime_config = build_form_config()
            write_config(config_path, runtime_config)
            result['config'] = runtime_config
            result['submitted'] = True
            root.destroy()
        except Exception as exc:
            messagebox.showerror('Config khong hop le', str(exc))

    rows = [
        ('Server URL', 'server_url'),
        ('Agent key', 'agent_key'),
        ('Device name', 'device_name'),
        ('Model', 'model'),
        ('Location', 'location'),
    ]
    for index, (label_text, key) in enumerate(rows):
        ttk.Label(content, text=label_text).grid(row=index, column=0, sticky='w', pady=5)
        ttk.Entry(content, textvariable=vars_map[key], width=44).grid(row=index, column=1, columnspan=3, sticky='ew', pady=5, padx=(12, 0))

    serial_frame = ttk.LabelFrame(content, text='Serial settings', padding=12)
    serial_frame.grid(row=len(rows), column=0, columnspan=4, sticky='ew', pady=(14, 0))
    content.columnconfigure(1, weight=1)
    content.columnconfigure(2, weight=1)
    content.columnconfigure(3, weight=1)

    ttk.Label(serial_frame, text='COM port').grid(row=0, column=0, sticky='w', pady=5)
    port_box = ttk.Combobox(serial_frame, textvariable=vars_map['port'], width=14, state='normal')
    port_box.grid(row=0, column=1, sticky='ew', pady=5, padx=(12, 18))
    ttk.Button(serial_frame, text='Quet COM', command=refresh_ports).grid(row=0, column=2, sticky='w', pady=5)

    ttk.Label(serial_frame, text='Baudrate').grid(row=1, column=0, sticky='w', pady=5)
    ttk.Entry(serial_frame, textvariable=vars_map['baudrate'], width=16).grid(row=1, column=1, sticky='ew', pady=5, padx=(12, 18))
    ttk.Label(serial_frame, text='Bytesize').grid(row=1, column=2, sticky='w', pady=5)
    ttk.Entry(serial_frame, textvariable=vars_map['bytesize'], width=16).grid(row=1, column=3, sticky='ew', pady=5, padx=(12, 0))

    ttk.Label(serial_frame, text='Parity').grid(row=2, column=0, sticky='w', pady=5)
    ttk.Combobox(serial_frame, textvariable=vars_map['parity'], values=['N', 'E', 'O', 'M', 'S'], width=14, state='readonly').grid(row=2, column=1, sticky='ew', pady=5, padx=(12, 18))
    ttk.Label(serial_frame, text='Stopbits').grid(row=2, column=2, sticky='w', pady=5)
    ttk.Combobox(serial_frame, textvariable=vars_map['stopbits'], values=['1', '1.5', '2'], width=14, state='readonly').grid(row=2, column=3, sticky='ew', pady=5, padx=(12, 0))

    ttk.Label(serial_frame, text='Timeout (s)').grid(row=3, column=0, sticky='w', pady=5)
    ttk.Entry(serial_frame, textvariable=vars_map['timeout_seconds'], width=16).grid(row=3, column=1, sticky='ew', pady=5, padx=(12, 18))
    ttk.Label(serial_frame, text='Listen (s)').grid(row=3, column=2, sticky='w', pady=5)
    ttk.Entry(serial_frame, textvariable=vars_map['listen_seconds'], width=16).grid(row=3, column=3, sticky='ew', pady=5, padx=(12, 0))

    ttk.Label(serial_frame, text='Command').grid(row=4, column=0, sticky='w', pady=5)
    ttk.Entry(serial_frame, textvariable=vars_map['command'], width=16).grid(row=4, column=1, sticky='ew', pady=5, padx=(12, 18))
    ttk.Label(serial_frame, text='Line ending').grid(row=4, column=2, sticky='w', pady=5)
    ttk.Combobox(serial_frame, textvariable=vars_map['line_ending'], values=list(LINE_ENDING_CHOICES.keys()), width=14, state='readonly').grid(row=4, column=3, sticky='ew', pady=5, padx=(12, 0))

    ttk.Label(serial_frame, text='Data format').grid(row=5, column=0, sticky='w', pady=5)
    ttk.Combobox(serial_frame, textvariable=vars_map['data_format'], values=['AUTO', 'A&D', 'AND'], width=14, state='readonly').grid(row=5, column=1, sticky='ew', pady=5, padx=(12, 18))

    for column in range(4):
        serial_frame.columnconfigure(column, weight=1)

    ttk.Label(content, textvariable=status_var, foreground='#475569').grid(row=len(rows) + 1, column=0, columnspan=4, sticky='w', pady=(14, 0))

    button_row = ttk.Frame(content)
    button_row.grid(row=len(rows) + 2, column=0, columnspan=4, sticky='ew', pady=(14, 0))
    ttk.Button(button_row, text='Nap tu server', command=bootstrap_from_server).pack(side='left')
    ttk.Button(button_row, text='Luu va chay', command=save_and_run).pack(side='right')

    refresh_ports()
    root.protocol('WM_DELETE_WINDOW', root.destroy)
    root.mainloop()
    if result['submitted']:
        return result['config']
    return False


def prompt_for_config(initial_config, config_path, use_gui=True):
    if use_gui:
        runtime_config = prompt_for_config_gui(initial_config, config_path)
        if runtime_config is False:
            return None
        if runtime_config is not None:
            return runtime_config
    return prompt_for_config_console(initial_config, config_path)


def get_port_metadata(port_name):
    target = str(port_name or '').upper()
    for port in list_serial_ports():
        if str(port.get('device') or '').upper() == target:
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
    line = str(raw_line or '').strip()
    if not line:
        raise RuntimeError('Khong nhan duoc du lieu tu can.')

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

    raise RuntimeError(f'Khong parse duoc dong du lieu can: {line}')


def request_bytes(config):
    if str(config.command or '').lower() == 'none':
        return None
    return str(config.command or '').encode(config.encoding) + NEWLINE_MAP[config.newline]


def open_port(config):
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

    raise RuntimeError('Can khong tra du lieu. Kiem tra COM, baudrate, command va che do output cua can.')


class ScaleAgentClient:
    def __init__(self, config):
        self.config = config
        self.server_url = str(config.get('server_url') or '').rstrip('/')
        self.agent_key = str(config.get('agent_key') or '').strip()
        self.device_name = str(config.get('device_name') or 'May can vang').strip()
        self.model = str(config.get('model') or 'Weight Indicator Bundle').strip()
        self.location = str(config.get('location') or '').strip()
        self.poll_interval = float(config.get('poll_interval_seconds') or 3)
        self.heartbeat_interval = float(config.get('heartbeat_interval_seconds') or 15)
        self.local_serial_settings = config.get('serial') or {}
        self.desired_settings = {}
        self.last_error = ''
        self.session = requests.Session()
        if not self.server_url:
            raise ValueError('Config chua co server_url.')
        if not self.agent_key:
            raise ValueError('Config chua co agent_key.')

    def heartbeat_payload(self):
        serial_settings = normalize_serial_settings(self.local_serial_settings, self.desired_settings)
        return {
            'agent_key': self.agent_key,
            'device_name': self.device_name,
            'model': self.model,
            'location': self.location,
            'machine_name': socket.gethostname() or platform.node(),
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
            'last_error': self.last_error,
        }

    def post_heartbeat(self):
        response = self.session.post(
            f'{self.server_url}/api/scale/agent/heartbeat',
            json=self.heartbeat_payload(),
            timeout=15,
        )
        response.raise_for_status()
        data = response.json()
        agent = data.get('agent') or {}
        if isinstance(agent.get('desired_settings'), dict):
            self.desired_settings = agent['desired_settings']
        return data

    def poll_command(self):
        response = self.session.get(
            f'{self.server_url}/api/scale/agent/poll',
            params={'agent_key': self.agent_key},
            timeout=20,
        )
        response.raise_for_status()
        data = response.json()
        if isinstance(data.get('desired_settings'), dict):
            self.desired_settings = data['desired_settings']
        return data.get('command')

    def send_result(self, command_id, status, reading=None, error=None, serial_settings=None):
        payload = {
            'agent_key': self.agent_key,
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
            f'{self.server_url}/api/scale/agent/commands/{command_id}/result',
            json=payload,
            timeout=20,
        )
        response.raise_for_status()
        return response.json()

    def run(self):
        last_heartbeat_at = 0.0
        log(f'Weight bundle agent started. Server={self.server_url} AgentKey={self.agent_key}')
        while True:
            try:
                now = time.monotonic()
                if now - last_heartbeat_at >= self.heartbeat_interval:
                    self.post_heartbeat()
                    last_heartbeat_at = now
                    log('Heartbeat OK')

                command = self.poll_command()
                if command:
                    payload = command.get('payload') or {}
                    serial_settings = normalize_serial_settings(self.local_serial_settings, self.desired_settings, payload)
                    log(f"Nhan lenh #{command['id']} {payload.get('serial_command') or serial_settings['command']} qua {serial_settings['port']}")
                    try:
                        reading = read_scale_once(serial_settings)
                        self.send_result(command['id'], 'completed', reading=reading, serial_settings=serial_settings)
                        self.last_error = ''
                        log(f"Can OK: {reading.get('weight_text', '')} {reading.get('unit', '')}".strip())
                    except Exception as exc:
                        self.last_error = str(exc)
                        self.send_result(command['id'], 'failed', error=self.last_error, serial_settings=serial_settings)
                        log(f'Loi can: {self.last_error}')

                time.sleep(self.poll_interval)
            except requests.RequestException as exc:
                self.last_error = f'Network error: {exc}'
                log(self.last_error)
                time.sleep(max(self.poll_interval, 5))
            except KeyboardInterrupt:
                log('Agent stopped by user.')
                raise
            except Exception as exc:
                self.last_error = str(exc)
                log(f'Unexpected error: {self.last_error}')
                time.sleep(max(self.poll_interval, 5))


def parse_args(argv):
    parser = argparse.ArgumentParser(description='Scale polling agent based on weight-indicator-bundle')
    parser.add_argument('--config', default='', help='Path to JSON config file. Defaults to AppData or beside the exe/script.')
    parser.add_argument('--setup', action='store_true', help='Open setup flow even if config already exists.')
    parser.add_argument('--server-url', default='', help='Override server URL.')
    parser.add_argument('--agent-key', default='', help='Override agent key.')
    parser.add_argument('--port', default='', help='Override COM port.')
    parser.add_argument('--print-ports', action='store_true', help='Print detected serial ports and exit.')
    parser.add_argument('--no-gui', action='store_true', help='Force console setup instead of GUI.')
    return parser.parse_args(argv)


def main(argv=None):
    args = parse_args(argv or sys.argv[1:])
    if args.print_ports:
        print(json.dumps(list_serial_ports(), indent=2, ensure_ascii=False))
        return 0

    config_path = resolve_config_path(args.config)
    config = None
    force_setup = bool(args.setup)

    if config_path.exists():
        try:
            config = read_config(config_path)
        except Exception as exc:
            log(f'Cau hinh hien tai loi, mo setup lai: {exc}')
            force_setup = True

    if config is None or force_setup:
        seed = apply_cli_overrides(config or {}, args)
        config = prompt_for_config(seed, config_path, use_gui=not args.no_gui)
        if config is None:
            log('Setup bi huy.')
            return 1
    else:
        config = build_runtime_config(apply_cli_overrides(config, args))

    if args.server_url or args.agent_key or args.port:
        write_config(config_path, config)
        log(f'Da cap nhat cau hinh tai {config_path}')

    agent = ScaleAgentClient(config)
    agent.run()
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
