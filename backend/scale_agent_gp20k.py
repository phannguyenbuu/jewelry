import argparse
import json
import platform
import re
import socket
import sys
import time
from pathlib import Path

import requests
import serial


DEFAULT_CONFIG = {
    'poll_interval_seconds': 3,
    'heartbeat_interval_seconds': 15,
    'serial': {
        'baudrate': 2400,
        'bytesize': 7,
        'parity': 'E',
        'stopbits': 1,
        'timeout_seconds': 2.5,
        'command': 'Q',
        'line_ending': '\\r\\n',
        'data_format': 'A&D',
    },
}

SERIAL_PARITY = {
    'N': serial.PARITY_NONE,
    'E': serial.PARITY_EVEN,
    'O': serial.PARITY_ODD,
}

SERIAL_BYTESIZE = {
    7: serial.SEVENBITS,
    8: serial.EIGHTBITS,
}

SERIAL_STOPBITS = {
    1: serial.STOPBITS_ONE,
    2: serial.STOPBITS_TWO,
}


def log(message):
    now = time.strftime('%Y-%m-%d %H:%M:%S')
    print(f'[{now}] {message}', flush=True)


def read_config(path):
    config_path = Path(path)
    if not config_path.exists():
        raise FileNotFoundError(f'Khong tim thay file config: {config_path}')

    with config_path.open('r', encoding='utf-8') as fh:
        raw = json.load(fh)

    config = dict(DEFAULT_CONFIG)
    config.update(raw)
    config['serial'] = {
        **DEFAULT_CONFIG['serial'],
        **(raw.get('serial') or {}),
    }
    return config


def decode_line_ending(value):
    if not isinstance(value, str) or not value:
        return '\r\n'
    try:
        return bytes(value, 'utf-8').decode('unicode_escape')
    except UnicodeDecodeError:
        return value


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

    port = str(merged.get('port') or merged.get('serial_port') or '').strip()
    if not port:
        raise ValueError('Config serial chua co port / COM.')

    baudrate = int(merged.get('baudrate') or merged.get('baud_rate') or 2400)
    bytesize = int(merged.get('bytesize') or merged.get('data_bits') or 7)
    parity = str(merged.get('parity') or 'E').strip().upper()[:1] or 'E'
    stopbits = int(float(merged.get('stopbits') or merged.get('stop_bits') or 1))
    timeout_seconds = float(merged.get('timeout_seconds') or merged.get('timeout') or 2.5)
    command = str(merged.get('command') or 'Q').strip().upper() or 'Q'
    line_ending = decode_line_ending(merged.get('line_ending'))
    data_format = str(merged.get('data_format') or 'A&D').strip().upper() or 'A&D'

    return {
        'port': port,
        'baudrate': baudrate,
        'bytesize': bytesize,
        'parity': parity if parity in SERIAL_PARITY else 'E',
        'stopbits': stopbits if stopbits in SERIAL_STOPBITS else 1,
        'timeout_seconds': timeout_seconds,
        'command': command,
        'line_ending': line_ending,
        'data_format': data_format,
    }


def parse_weight_line(raw_line):
    line = raw_line.strip()
    if not line:
        raise RuntimeError('Khong nhan duoc du lieu tu can.')

    match = re.match(r'^(ST|US|OL),(.+)$', line)
    if match:
        header = match.group(1)
        body = match.group(2)
        stable = header == 'ST'
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
            'stable': stable,
            'header': header,
            'weight_text': weight_text,
            'weight_value': weight_value,
            'unit': unit,
            'raw_line': line,
            'meta': {'status': 'stable' if stable else 'unstable'},
        }

    generic = re.search(r'([+-]?\d+(?:\.\d+)?)\s*([a-zA-Z%]*)$', line)
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


def read_scale_once(serial_settings):
    parity = SERIAL_PARITY[serial_settings['parity']]
    bytesize = SERIAL_BYTESIZE.get(serial_settings['bytesize'], serial.SEVENBITS)
    stopbits = SERIAL_STOPBITS.get(serial_settings['stopbits'], serial.STOPBITS_ONE)
    timeout_seconds = float(serial_settings['timeout_seconds'])

    with serial.Serial(
        port=serial_settings['port'],
        baudrate=serial_settings['baudrate'],
        bytesize=bytesize,
        parity=parity,
        stopbits=stopbits,
        timeout=timeout_seconds,
        write_timeout=max(timeout_seconds, 1.0),
    ) as conn:
        conn.reset_input_buffer()
        conn.reset_output_buffer()

        payload = (serial_settings['command'] + serial_settings['line_ending']).encode('ascii')
        conn.write(payload)
        conn.flush()

        raw = conn.read_until(expected=b'\n', size=128)
        if not raw:
            time.sleep(0.2)
            raw = conn.read_until(expected=b'\n', size=128)
        if not raw:
            raise RuntimeError('Can khong tra du lieu. Kiem tra COM, baudrate va che do output cua GP-20K.')

        line = raw.decode('ascii', errors='ignore').strip('\r\n')
        return parse_weight_line(line)


class ScaleAgentClient:
    def __init__(self, config):
        self.config = config
        self.server_url = str(config.get('server_url') or '').rstrip('/')
        self.agent_key = str(config.get('agent_key') or '').strip()
        self.device_name = str(config.get('device_name') or 'May can vang').strip()
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
            'model': 'AND GP-20K',
            'location': self.location,
            'machine_name': socket.gethostname() or platform.node(),
            'serial_port': serial_settings['port'],
            'serial_settings': {
                'baudrate': serial_settings['baudrate'],
                'bytesize': serial_settings['bytesize'],
                'parity': serial_settings['parity'],
                'stopbits': serial_settings['stopbits'],
                'timeout_seconds': serial_settings['timeout_seconds'],
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
                    'command': serial_settings.get('command') if serial_settings else '',
                    'data_format': serial_settings.get('data_format') if serial_settings else '',
                }
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
        log(f'Agent GP-20K started. Server={self.server_url} AgentKey={self.agent_key}')

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
                    serial_settings = normalize_serial_settings(
                        self.local_serial_settings,
                        self.desired_settings,
                        payload,
                    )
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
    parser = argparse.ArgumentParser(description='A&D GP-20K scale polling agent')
    parser.add_argument(
        '--config',
        default='scale_agent_config.json',
        help='Path to JSON config file. Default: scale_agent_config.json',
    )
    return parser.parse_args(argv)


def main(argv=None):
    args = parse_args(argv or sys.argv[1:])
    config = read_config(args.config)
    agent = ScaleAgentClient(config)
    agent.run()


if __name__ == '__main__':
    main()
