from pathlib import Path

from flask import jsonify, request, send_file

from .state import app, db
from .models import PrintAgent, PrintCommand, PrintDevice
from .setup import *
from .utils import *


def _print_device_identity(data):
    printer_name = _clean_text(data.get('printer_name'))
    unc_path = _clean_text(data.get('unc_path')).lower()
    share_name = _clean_text(data.get('share_name')).lower()
    system_name = _clean_text(data.get('system_name')).lower()
    if unc_path:
        return f'unc:{unc_path}'
    return f'name:{printer_name.lower()}|share:{share_name}|system:{system_name}'


def _print_agent_matches(agent, machine_name='', device_name=''):
    machine_key = _clean_text(machine_name).lower()
    device_key = _clean_text(device_name).lower()
    if machine_key and _clean_text(agent.machine_name).lower() == machine_key:
        return True
    if device_key and _clean_text(agent.device_name).lower() == device_key:
        return True
    return False


def _print_device_matches(device, printer_name='', unc_path=''):
    printer_key = _clean_text(printer_name).lower()
    unc_key = _clean_text(unc_path).lower()
    device_keys = {
        _clean_text(device.printer_name).lower(),
        _clean_text(device.share_name).lower(),
        _clean_text(device.system_name).lower(),
        _clean_text(device.unc_path).lower(),
    }
    return (printer_key and printer_key in device_keys) or (unc_key and unc_key in device_keys)


def _apply_print_device(agent, row, timestamp, existing=None):
    device = existing or PrintDevice(agent_id=agent.id)
    device.printer_name = _clean_text(row.get('printer_name'))
    device.share_name = _clean_text(row.get('share_name'))
    device.unc_path = _clean_text(row.get('unc_path'))
    device.system_name = _clean_text(row.get('system_name'))
    device.driver_name = _clean_text(row.get('driver_name'))
    device.port_name = _clean_text(row.get('port_name'))
    device.location = _clean_text(row.get('location'))
    device.comment = _clean_text(row.get('comment'))
    device.source = _clean_text(row.get('source') or 'local') or 'local'
    device.is_default = bool(row.get('is_default'))
    device.is_network = bool(row.get('is_network'))
    device.is_shared = bool(row.get('is_shared'))
    device.work_offline = bool(row.get('work_offline'))
    device.printer_status = _clean_text(row.get('printer_status'))
    device.meta = row.get('meta') if isinstance(row.get('meta'), dict) else {}
    device.last_seen = timestamp
    device.updated_at = timestamp
    return device


def _ensure_print_agent(d, auto_create=False):
    agent_key = _clean_text(d.get('agent_key') if isinstance(d, dict) else d)
    if not agent_key:
        return None, jsonify({'error': 'Thieu agent_key'}), 400

    agent = PrintAgent.query.filter_by(agent_key=agent_key).first()
    if agent is None and auto_create:
        now = now_str()
        agent = PrintAgent(
            agent_key=agent_key,
            device_name=_clean_text((d or {}).get('device_name')) or 'May in LAN agent',
            location=_clean_text((d or {}).get('location')),
            created_at=now,
            updated_at=now,
        )
        db.session.add(agent)
        db.session.flush()
    if agent is None:
        return None, jsonify({'error': 'Khong tim thay agent'}), 404
    return agent, None, None


def _resolve_print_agent_and_printer(d):
    agent = None
    all_agents = PrintAgent.query.order_by(PrintAgent.id.desc()).all()
    agent_id = d.get('agent_id')
    if agent_id not in (None, ''):
        try:
            agent = PrintAgent.query.get(int(agent_id))
        except (TypeError, ValueError):
            return None, None, jsonify({'error': 'agent_id khong hop le'}), 400
    if agent is None:
        agent_key = _clean_text(d.get('agent_key'))
        if agent_key:
            agent = PrintAgent.query.filter_by(agent_key=agent_key).first()
    if agent is None:
        matched_agents = [
            row for row in all_agents
            if _print_agent_matches(
                row,
                machine_name=d.get('machine_name') or d.get('host_name'),
                device_name=d.get('device_name'),
            )
        ]
        agent = next((row for row in matched_agents if _print_agent_is_online(row)), None) or (matched_agents[0] if matched_agents else None)
    if agent is None:
        agent = next((row for row in all_agents if _print_agent_is_online(row)), None) or (all_agents[0] if all_agents else None)
    if agent is None:
        return None, None, jsonify({'error': 'Chua co print agent nao san sang'}), 404

    printer_name = _clean_text(d.get('printer_name'))
    unc_path = _clean_text(d.get('unc_path'))
    devices = PrintDevice.query.filter_by(agent_id=agent.id).order_by(PrintDevice.is_default.desc(), PrintDevice.printer_name.asc(), PrintDevice.id.asc()).all()
    printer = None
    if printer_name or unc_path:
        printer = next((device for device in devices if _print_device_matches(device, printer_name=printer_name, unc_path=unc_path)), None)
    if printer is None and devices:
        printer = devices[0]
    if printer is None:
        return None, None, jsonify({'error': 'Agent chua co may in nao duoc chia se'}), 400
    return agent, printer, None, None


@app.route('/api/device-agent/script', methods=['GET'])
def get_device_agent_script():
    bundle_dir = Path(__file__).resolve().parents[1] / 'device_agent_bundle'
    download = _clean_text(request.args.get('download')).lower() in {'1', 'true', 'yes'}
    script_path = bundle_dir / 'device_agent.py'
    return send_file(
        script_path,
        as_attachment=download,
        download_name='device_agent.py',
        mimetype='text/x-python',
    )


@app.route('/api/print/agents', methods=['GET'])
def get_print_agents():
    agents = PrintAgent.query.order_by(PrintAgent.id.desc()).all()
    return jsonify([print_agent_json(agent) for agent in agents])


@app.route('/api/print/agents', methods=['POST'])
def add_print_agent():
    d = request.json or {}
    agent_key = _clean_text(d.get('agent_key')) or _generate_print_agent_key()
    if PrintAgent.query.filter_by(agent_key=agent_key).first():
        return jsonify({'error': 'Agent key da ton tai'}), 400

    now = now_str()
    agent = PrintAgent(
        agent_key=agent_key,
        device_name=_clean_text(d.get('device_name')) or 'May in LAN agent',
        location=_clean_text(d.get('location')),
        created_at=now,
        updated_at=now,
    )
    db.session.add(agent)
    db.session.commit()
    return jsonify(print_agent_json(agent)), 201


@app.route('/api/print/agents/<int:agent_id>', methods=['GET', 'PUT', 'DELETE'])
def print_agent_detail(agent_id):
    agent = PrintAgent.query.get_or_404(agent_id)

    if request.method == 'GET':
        return jsonify(print_agent_json(agent))

    if request.method == 'DELETE':
        PrintDevice.query.filter_by(agent_id=agent.id).delete()
        PrintCommand.query.filter_by(agent_id=agent.id).delete()
        db.session.delete(agent)
        db.session.commit()
        return jsonify({'msg': 'Deleted'})

    d = request.json or {}
    new_key = _clean_text(d.get('agent_key'))
    if new_key and new_key != agent.agent_key:
        existing = PrintAgent.query.filter(PrintAgent.agent_key == new_key, PrintAgent.id != agent.id).first()
        if existing:
            return jsonify({'error': 'Agent key da ton tai'}), 400
        agent.agent_key = new_key

    if 'device_name' in d:
        agent.device_name = _clean_text(d.get('device_name')) or agent.device_name
    if 'location' in d:
        agent.location = _clean_text(d.get('location'))
    agent.updated_at = now_str()
    db.session.commit()
    return jsonify(print_agent_json(agent))


@app.route('/api/print/devices', methods=['GET'])
def get_print_devices():
    q = PrintDevice.query
    agent_id = request.args.get('agent_id')
    if agent_id not in (None, ''):
        try:
            q = q.filter_by(agent_id=int(agent_id))
        except (TypeError, ValueError):
            return jsonify({'error': 'agent_id khong hop le'}), 400
    devices = q.order_by(PrintDevice.updated_at.desc(), PrintDevice.printer_name.asc()).all()
    return jsonify([print_device_json(device) for device in devices])


@app.route('/api/print/commands', methods=['GET', 'POST'])
def get_print_commands():
    if request.method == 'POST':
        d = request.json or {}
        agent = None
        agent_id = d.get('agent_id')
        if agent_id not in (None, ''):
            try:
                agent = PrintAgent.query.get(int(agent_id))
            except (TypeError, ValueError):
                return jsonify({'error': 'agent_id khong hop le'}), 400
        if agent is None:
            agent_key = _clean_text(d.get('agent_key'))
            if agent_key:
                agent = PrintAgent.query.filter_by(agent_key=agent_key).first()
        if agent is None:
            return jsonify({'error': 'Khong tim thay print agent'}), 404

        payload = _normalize_print_command_payload(d.get('payload') if isinstance(d.get('payload'), dict) else d)
        printer_name = _clean_text(payload.get('printer_name') or d.get('printer_name'))
        if not printer_name:
            return jsonify({'error': 'Thieu printer_name'}), 400

        cmd = PrintCommand(
            agent_id=agent.id,
            printer_name=printer_name,
            document_name=_clean_text(payload.get('document_name') or d.get('document_name') or 'Lenh in'),
            payload={**payload, 'printer_name': printer_name},
            status='pending',
            requested_by=_clean_text(d.get('requested_by')) or 'Admin',
            requested_at=now_str(),
        )
        db.session.add(cmd)
        agent.updated_at = now_str()
        db.session.commit()
        return jsonify(print_command_json(cmd)), 201

    q = PrintCommand.query
    agent_id = request.args.get('agent_id')
    if agent_id not in (None, ''):
        try:
            q = q.filter_by(agent_id=int(agent_id))
        except (TypeError, ValueError):
            return jsonify({'error': 'agent_id khong hop le'}), 400
    status = _clean_text(request.args.get('status')).lower()
    if status:
        q = q.filter_by(status=status)
    limit = request.args.get('limit', '50')
    try:
        limit = max(1, min(int(limit), 200))
    except (TypeError, ValueError):
        limit = 50
    commands = q.order_by(PrintCommand.id.desc()).limit(limit).all()
    return jsonify([print_command_json(cmd) for cmd in commands])


@app.route('/api/print/agents/<int:agent_id>/commands', methods=['GET', 'POST'])
def print_agent_commands(agent_id):
    agent = PrintAgent.query.get_or_404(agent_id)
    if request.method == 'GET':
        limit = request.args.get('limit', '50')
        try:
            limit = max(1, min(int(limit), 200))
        except (TypeError, ValueError):
            limit = 50
        commands = (
            PrintCommand.query
            .filter_by(agent_id=agent.id)
            .order_by(PrintCommand.id.desc())
            .limit(limit)
            .all()
        )
        return jsonify([print_command_json(cmd) for cmd in commands])

    d = request.json or {}
    payload = _normalize_print_command_payload(d.get('payload') if isinstance(d.get('payload'), dict) else d)
    printer_name = _clean_text(payload.get('printer_name') or d.get('printer_name'))
    if not printer_name:
        return jsonify({'error': 'Thieu printer_name'}), 400

    cmd = PrintCommand(
        agent_id=agent.id,
        printer_name=printer_name,
        document_name=_clean_text(payload.get('document_name') or d.get('document_name') or 'Lenh in'),
        payload={**payload, 'printer_name': printer_name},
        status='pending',
        requested_by=_clean_text(d.get('requested_by')) or 'Admin',
        requested_at=now_str(),
    )
    db.session.add(cmd)
    agent.updated_at = now_str()
    db.session.commit()
    return jsonify(print_command_json(cmd)), 201


@app.route('/api/print/dispatch-image', methods=['POST'])
def dispatch_png_to_agent():
    d = request.get_json(force=True, silent=True) or {}
    image_base64 = _clean_text(d.get('image_base64') or d.get('content_base64'))
    if not image_base64:
        return jsonify({'error': 'Thieu image_base64'}), 400

    agent, printer, error_response, status_code = _resolve_print_agent_and_printer(d)
    if error_response is not None:
        return error_response, status_code

    payload = _normalize_print_command_payload({
        'printer_name': _clean_text(d.get('printer_name')) or printer.printer_name,
        'document_name': _clean_text(d.get('document_name')) or 'Phieu ke mua hang',
        'mode': _clean_text(d.get('mode')) or 'image_base64',
        'content_base64': image_base64,
        'content_type': _clean_text(d.get('content_type')) or 'image/png',
        'file_name': _clean_text(d.get('file_name')) or 'phieu-ke-mua-hang.png',
        'copies': d.get('copies') or 1,
        'options': d.get('options') if isinstance(d.get('options'), dict) else {},
    })
    cmd = PrintCommand(
        agent_id=agent.id,
        printer_name=printer.printer_name or payload['printer_name'],
        document_name=payload['document_name'],
        payload=payload,
        status='pending',
        requested_by=_clean_text(d.get('requested_by')) or 'POS Mobile',
        requested_at=now_str(),
    )
    db.session.add(cmd)
    agent.updated_at = now_str()
    db.session.commit()
    return jsonify({
        'msg': 'Da gui PNG toi agent.',
        'command': print_command_json(cmd),
        'agent': print_agent_json(agent),
        'printer': print_device_json(printer),
    }), 201


@app.route('/api/print/agent/bootstrap', methods=['GET'])
def print_agent_bootstrap():
    agent, error_response, status_code = _ensure_print_agent({'agent_key': request.args.get('agent_key')}, auto_create=False)
    if error_response is not None:
        return error_response, status_code
    return jsonify({
        'agent': print_agent_json(agent),
        'server_time': now_str(),
    })


@app.route('/api/print/agent/heartbeat', methods=['POST'])
def print_agent_heartbeat():
    d = request.get_json(force=True, silent=True) or {}
    agent, error_response, status_code = _ensure_print_agent(d, auto_create=True)
    if error_response is not None:
        return error_response, status_code

    now = now_str()
    if d.get('device_name'):
        agent.device_name = _clean_text(d.get('device_name')) or agent.device_name
    if 'location' in d:
        agent.location = _clean_text(d.get('location'))
    if 'machine_name' in d:
        agent.machine_name = _clean_text(d.get('machine_name'))
    if 'last_error' in d:
        agent.last_error = _clean_text(d.get('last_error'))
    if 'status' in d:
        agent.status = _clean_text(d.get('status')) or 'online'
    else:
        agent.status = 'online'
    agent.last_seen = now
    agent.updated_at = now

    if isinstance(d.get('printers'), list):
        printers = d.get('printers') or []
        existing = {
            _print_device_identity(print_device_json(device)): device
            for device in PrintDevice.query.filter_by(agent_id=agent.id).all()
        }
        seen_keys = set()
        for row in printers:
            if not isinstance(row, dict):
                continue
            identity = _print_device_identity(row)
            if not identity:
                continue
            seen_keys.add(identity)
            device = _apply_print_device(agent, row, now, existing=existing.get(identity))
            if device.id is None:
                db.session.add(device)
        for identity, device in existing.items():
            if identity not in seen_keys:
                db.session.delete(device)
        agent.printer_count = len(seen_keys)
        agent.last_scan_at = now

    db.session.commit()
    return jsonify({'msg': 'ok', 'agent': print_agent_json(agent)})


@app.route('/api/print/agent/poll', methods=['GET'])
def print_agent_poll():
    agent, error_response, status_code = _ensure_print_agent({'agent_key': request.args.get('agent_key')}, auto_create=False)
    if error_response is not None:
        return error_response, status_code

    cmd = (
        PrintCommand.query
        .filter_by(agent_id=agent.id, status='pending')
        .order_by(PrintCommand.id.asc())
        .first()
    )
    if cmd is None:
        return jsonify({
            'command': None,
            'server_time': now_str(),
        })

    cmd.status = 'dispatched'
    cmd.dispatched_at = now_str()
    agent.status = 'online'
    agent.last_seen = now_str()
    agent.updated_at = now_str()
    db.session.commit()
    return jsonify({
        'command': print_command_json(cmd),
        'server_time': now_str(),
    })


@app.route('/api/print/agent/commands/<int:command_id>/result', methods=['POST'])
def print_agent_command_result(command_id):
    d = request.get_json(force=True, silent=True) or {}
    agent_key = _clean_text(d.get('agent_key'))
    if not agent_key:
        return jsonify({'error': 'Thieu agent_key'}), 400

    cmd = PrintCommand.query.get_or_404(command_id)
    agent = PrintAgent.query.get_or_404(cmd.agent_id)
    if agent.agent_key != agent_key:
        return jsonify({'error': 'agent_key khong khop lenh'}), 403

    now = now_str()
    status = _clean_text(d.get('status')).lower()
    failed = status in {'failed', 'error'}
    cmd.status = 'failed' if failed else 'completed'
    cmd.completed_at = now
    cmd.error = _clean_text(d.get('error'))
    cmd.result = d.get('result') if isinstance(d.get('result'), dict) else {}

    agent.status = 'online'
    agent.last_seen = now
    agent.updated_at = now
    agent.last_error = cmd.error if failed else ''

    db.session.commit()
    return jsonify({'msg': 'ok', 'command': print_command_json(cmd)})
