import base64
import datetime
import io
import json
import os
import urllib.request
import zipfile
from decimal import Decimal
from pathlib import Path

from flask import jsonify, request, send_file

from .state import app, db
from .models import *
from .setup import *
from .utils import *


def _normalize_scale_device_type(value):
    text = _clean_text(value).upper()
    if text in {'A&D', 'AND', 'A+D', 'AD'}:
        return 'A&D'
    if text in {'SARTORIUS', 'STARTORIUS', 'SARTO'}:
        return 'SARTORIUS'
    return text


def _create_scale_reading(agent, reading_payload, now, command_id=None, default_source='', default_device_type=''):
    if not isinstance(reading_payload, dict):
        return None

    meta = reading_payload.get('meta') if isinstance(reading_payload.get('meta'), dict) else {}
    merged_meta = dict(meta)

    source = _clean_text(merged_meta.get('source') or reading_payload.get('source') or default_source)
    if source:
        merged_meta['source'] = source

    device_type = _normalize_scale_device_type(
        merged_meta.get('device_type') or reading_payload.get('device_type') or default_device_type
    )
    if device_type:
        merged_meta['device_type'] = device_type

    captured_at = _clean_text(reading_payload.get('captured_at') or merged_meta.get('captured_at'))
    if captured_at:
        merged_meta['captured_at'] = captured_at

    reading_obj = ScaleReading(
        agent_id=agent.id,
        command_id=command_id,
        stable=bool(reading_payload.get('stable')),
        header=_clean_text(reading_payload.get('header')).upper(),
        weight_text=_clean_text(reading_payload.get('weight_text')),
        weight_value=_coerce_scale_weight(reading_payload.get('weight_value')),
        unit=_clean_text(reading_payload.get('unit')),
        raw_line=_clean_text(reading_payload.get('raw_line')),
        meta=merged_meta,
        created_at=now,
    )
    db.session.add(reading_obj)

    agent.last_weight_text = reading_obj.weight_text
    agent.last_weight_value = reading_obj.weight_value
    agent.last_unit = reading_obj.unit
    agent.last_stable = reading_obj.stable
    agent.last_raw_line = reading_obj.raw_line
    agent.last_read_at = now
    return reading_obj


def _apply_scale_agent_runtime(agent, payload, now):
    if payload.get('device_name'):
        agent.device_name = _clean_text(payload.get('device_name')) or agent.device_name
    if payload.get('model'):
        agent.model = _clean_text(payload.get('model')) or agent.model
    if 'location' in payload:
        agent.location = _clean_text(payload.get('location'))
    if 'machine_name' in payload:
        agent.machine_name = _clean_text(payload.get('machine_name'))
    if 'serial_port' in payload:
        agent.serial_port = _clean_text(payload.get('serial_port'))
    if 'serial_settings' in payload:
        agent.serial_settings = _normalize_scale_settings(payload.get('serial_settings'))
    if 'last_error' in payload:
        agent.last_error = _clean_text(payload.get('last_error'))
    if not agent.desired_settings and 'serial_settings' in payload:
        agent.desired_settings = _normalize_scale_settings(payload.get('serial_settings'))
    agent.status = 'online'
    agent.last_seen = now
    agent.updated_at = now


@app.route('/api/scale/agents', methods=['GET'])
def get_scale_agents():
    agents = ScaleAgent.query.order_by(ScaleAgent.id.desc()).all()
    return jsonify([scale_agent_json(agent) for agent in agents])


@app.route('/api/scale/agents', methods=['POST'])
def add_scale_agent():
    d = request.json or {}
    agent_key = _clean_text(d.get('agent_key')) or _generate_scale_agent_key()
    if ScaleAgent.query.filter_by(agent_key=agent_key).first():
        return jsonify({'error': 'Agent key da ton tai'}), 400

    now = now_str()
    agent = ScaleAgent(
        agent_key=agent_key,
        device_name=_clean_text(d.get('device_name')) or 'May can vang',
        model=_clean_text(d.get('model')) or 'AND GP-20K',
        location=_clean_text(d.get('location')),
        serial_port=_clean_text(d.get('serial_port')),
        desired_settings=_normalize_scale_settings(d.get('desired_settings') or d.get('serial_settings')),
        created_at=now,
        updated_at=now,
    )
    db.session.add(agent)
    db.session.commit()
    return jsonify(scale_agent_json(agent)), 201


@app.route('/api/scale/agents/<int:agent_id>', methods=['GET', 'PUT', 'DELETE'])
def scale_agent_detail(agent_id):
    agent = ScaleAgent.query.get_or_404(agent_id)

    if request.method == 'GET':
        return jsonify(scale_agent_json(agent))

    if request.method == 'DELETE':
        ScaleReading.query.filter_by(agent_id=agent.id).delete()
        ScaleCommand.query.filter_by(agent_id=agent.id).delete()
        db.session.delete(agent)
        db.session.commit()
        return jsonify({'msg': 'Deleted'})

    d = request.json or {}
    new_key = _clean_text(d.get('agent_key'))
    if new_key and new_key != agent.agent_key:
        existing = ScaleAgent.query.filter(ScaleAgent.agent_key == new_key, ScaleAgent.id != agent.id).first()
        if existing:
            return jsonify({'error': 'Agent key da ton tai'}), 400
        agent.agent_key = new_key

    if 'device_name' in d:
        agent.device_name = _clean_text(d.get('device_name')) or agent.device_name
    if 'model' in d:
        agent.model = _clean_text(d.get('model')) or agent.model
    if 'location' in d:
        agent.location = _clean_text(d.get('location'))
    if 'serial_port' in d:
        agent.serial_port = _clean_text(d.get('serial_port'))
    if 'desired_settings' in d or 'serial_settings' in d:
        agent.desired_settings = _normalize_scale_settings(d.get('desired_settings') or d.get('serial_settings'))
    agent.updated_at = now_str()
    db.session.commit()
    return jsonify(scale_agent_json(agent))


@app.route('/api/scale/agents/<int:agent_id>/read', methods=['POST'])
def queue_scale_read(agent_id):
    agent = ScaleAgent.query.get_or_404(agent_id)
    d = request.json or {}

    existing = (
        ScaleCommand.query
        .filter(
            ScaleCommand.agent_id == agent.id,
            ScaleCommand.status.in_(['pending', 'dispatched'])
        )
        .order_by(ScaleCommand.id.desc())
        .first()
    )
    if existing:
        return jsonify({'message': 'Agent dang co lenh chua xu ly', 'command': scale_command_json(existing)}), 202

    cmd = ScaleCommand(
        agent_id=agent.id,
        command_type='read_weight',
        payload=_build_scale_command_payload(d),
        status='pending',
        requested_by=_clean_text(d.get('requested_by')) or 'Admin',
        requested_at=now_str(),
    )
    db.session.add(cmd)
    agent.updated_at = now_str()
    db.session.commit()
    return jsonify(scale_command_json(cmd)), 201


@app.route('/api/scale/agent/script', methods=['GET'])
def get_scale_agent_script():
    bundle_dir = Path(__file__).resolve().parents[1] / 'device_agent_bundle'
    download = _clean_text(request.args.get('download')).lower() in {'1', 'true', 'yes'}
    script_path = bundle_dir / 'device_agent.py'
    return send_file(
        script_path,
        as_attachment=download,
        download_name='device_agent.py',
        mimetype='text/x-python',
    )


@app.route('/api/scale/agent/exe', methods=['GET'])
def get_scale_agent_exe():
    bundle_dir = Path(__file__).resolve().parents[1] / 'scale_agent_bundle'
    download = _clean_text(request.args.get('download')).lower() in {'1', 'true', 'yes'}
    exe_path = bundle_dir / 'dist' / 'scale-agent.exe'
    if not exe_path.exists():
        return jsonify({'error': 'Chua co file scale-agent.exe. Hay build agent exe truoc.'}), 404
    return send_file(
        exe_path,
        as_attachment=download,
        download_name='scale-agent.exe',
        mimetype='application/vnd.microsoft.portable-executable',
    )


@app.route('/api/scale/agent/bundle', methods=['GET'])
def get_scale_agent_bundle():
    bundle_dir = Path(__file__).resolve().parents[1] / 'scale_agent_bundle'
    download = _clean_text(request.args.get('download')).lower() in {'1', 'true', 'yes'}
    archive_stream = io.BytesIO()
    with zipfile.ZipFile(archive_stream, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
        for file_path in sorted(bundle_dir.rglob('*')):
            if file_path.is_file():
                archive.write(file_path, arcname=file_path.relative_to(bundle_dir).as_posix())
    archive_stream.seek(0)
    return send_file(
        archive_stream,
        mimetype='application/zip',
        as_attachment=download,
        download_name='scale-agent-bundle.zip',
    )


@app.route('/api/scale/readings', methods=['GET'])
def get_scale_readings():
    limit = request.args.get('limit', '30')
    try:
        limit = max(1, min(int(limit), 200))
    except (TypeError, ValueError):
        limit = 30

    q = ScaleReading.query
    agent_id = request.args.get('agent_id')
    if agent_id not in (None, ''):
        try:
            q = q.filter_by(agent_id=int(agent_id))
        except (TypeError, ValueError):
            return jsonify({'error': 'agent_id khong hop le'}), 400

    readings = q.order_by(ScaleReading.id.desc()).limit(limit).all()
    return jsonify([scale_reading_json(r) for r in readings])


@app.route('/api/scale/agent/heartbeat', methods=['POST'])
def scale_agent_heartbeat():
    d = request.get_json(force=True, silent=True) or {}
    agent_key = _clean_text(d.get('agent_key'))
    if not agent_key:
        return jsonify({'error': 'Thieu agent_key'}), 400

    now = now_str()
    agent = ScaleAgent.query.filter_by(agent_key=agent_key).first()
    created = False
    if agent is None:
        created = True
        agent = ScaleAgent(
            agent_key=agent_key,
            device_name=_clean_text(d.get('device_name')) or 'May can vang',
            model=_clean_text(d.get('model')) or 'AND GP-20K',
            location=_clean_text(d.get('location')),
            created_at=now,
        )
        db.session.add(agent)

    _apply_scale_agent_runtime(agent, d, now)
    db.session.commit()
    return jsonify({'msg': 'ok', 'created': created, 'agent': scale_agent_json(agent)})


@app.route('/api/scale/agent/bootstrap', methods=['GET'])
def scale_agent_bootstrap():
    agent_key = _clean_text(request.args.get('agent_key'))
    if not agent_key:
        return jsonify({'error': 'Thieu agent_key'}), 400

    agent = ScaleAgent.query.filter_by(agent_key=agent_key).first()
    if agent is None:
        return jsonify({'error': 'Khong tim thay agent'}), 404

    return jsonify({
        'agent': scale_agent_json(agent),
        'server_time': now_str(),
    })


@app.route('/api/scale/agent/poll', methods=['GET'])
def scale_agent_poll():
    agent_key = _clean_text(request.args.get('agent_key'))
    if not agent_key:
        return jsonify({'error': 'Thieu agent_key'}), 400

    agent = ScaleAgent.query.filter_by(agent_key=agent_key).first()
    if agent is None:
        return jsonify({'error': 'Khong tim thay agent'}), 404

    cmd = (
        ScaleCommand.query
        .filter_by(agent_id=agent.id, status='pending')
        .order_by(ScaleCommand.id.asc())
        .first()
    )
    if cmd is None:
        return jsonify({
            'command': None,
            'desired_settings': agent.desired_settings or _normalize_scale_settings({}),
            'server_time': now_str(),
        })

    cmd.status = 'dispatched'
    cmd.dispatched_at = now_str()
    agent.status = 'online'
    agent.last_seen = now_str()
    agent.updated_at = now_str()
    db.session.commit()
    return jsonify({
        'command': scale_command_json(cmd),
        'desired_settings': agent.desired_settings or _normalize_scale_settings({}),
        'server_time': now_str(),
    })


@app.route('/api/scale/agent/commands/<int:command_id>/result', methods=['POST'])
def scale_agent_command_result(command_id):
    d = request.get_json(force=True, silent=True) or {}
    agent_key = _clean_text(d.get('agent_key'))
    if not agent_key:
        return jsonify({'error': 'Thieu agent_key'}), 400

    cmd = ScaleCommand.query.get_or_404(command_id)
    agent = ScaleAgent.query.get_or_404(cmd.agent_id)
    if agent.agent_key != agent_key:
        return jsonify({'error': 'agent_key khong khop lenh'}), 403

    now = now_str()
    status = _clean_text(d.get('status')).lower()
    failed = status in {'failed', 'error'}
    cmd.status = 'failed' if failed else 'completed'
    cmd.completed_at = now
    cmd.error = _clean_text(d.get('error'))
    cmd.result = d.get('result') if isinstance(d.get('result'), dict) else {}

    reading_payload = d.get('reading') if isinstance(d.get('reading'), dict) else None
    reading_obj = _create_scale_reading(
        agent,
        reading_payload,
        now,
        command_id=cmd.id,
        default_source='command',
        default_device_type=(cmd.result or {}).get('device_type'),
    )

    agent.status = 'online'
    agent.last_seen = now
    agent.updated_at = now
    agent.last_error = cmd.error if failed else ''

    db.session.flush()
    if reading_obj is not None:
        cmd.result = {**(cmd.result or {}), 'reading_id': reading_obj.id}
    db.session.commit()
    return jsonify({'msg': 'ok', 'command': scale_command_json(cmd)})


@app.route('/api/scale/agent/live-reading', methods=['POST'])
def scale_agent_live_reading():
    d = request.get_json(force=True, silent=True) or {}
    agent_key = _clean_text(d.get('agent_key'))
    if not agent_key:
        return jsonify({'error': 'Thieu agent_key'}), 400

    reading_payload = d.get('reading') if isinstance(d.get('reading'), dict) else None
    if not reading_payload:
        return jsonify({'error': 'Thieu reading'}), 400

    now = now_str()
    agent = ScaleAgent.query.filter_by(agent_key=agent_key).first()
    created = False
    if agent is None:
        created = True
        agent = ScaleAgent(
            agent_key=agent_key,
            device_name=_clean_text(d.get('device_name')) or 'May can vang',
            model=_clean_text(d.get('model')) or 'Weight Indicator Bundle',
            location=_clean_text(d.get('location')),
            created_at=now,
        )
        db.session.add(agent)

    _apply_scale_agent_runtime(agent, d, now)
    agent.last_error = ''
    reading_obj = _create_scale_reading(
        agent,
        reading_payload,
        now,
        default_source='realtime',
        default_device_type=d.get('device_type'),
    )
    db.session.flush()
    db.session.commit()
    return jsonify({
        'msg': 'ok',
        'created': created,
        'agent': scale_agent_json(agent),
        'reading': scale_reading_json(reading_obj) if reading_obj else None,
    })
