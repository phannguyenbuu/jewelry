import datetime
import os
import re
import unicodedata
import uuid
from decimal import Decimal, InvalidOperation

from .state import db
from .models import *


IMPORT_HEADER_ALIASES = {
    'ma_hang': {'ma hang'},
    'ncc': {'ncc'},
    'nhom_hang': {'nhom hang'},
    'quay_nho': {'quay nho'},
    'cong_le': {'cong le'},
    'cong_si': {'cong si'},
    'tong_tl': {'tong tl'},
    'tl_da': {'tl da'},
    'tl_vang': {'tl vang'},
}


def now_str():
    return datetime.datetime.now().strftime('%d/%m/%Y %H:%M:%S')


def today_iso():
    return datetime.date.today().isoformat()


def _ascii_fold(text):
    normalized = unicodedata.normalize('NFKD', str(text or '').replace('đ', 'd').replace('Đ', 'D'))
    stripped = ''.join(ch for ch in normalized if not unicodedata.combining(ch))
    return re.sub(r'\s+', ' ', stripped).strip().lower()


def _clean_text(value):
    if value is None:
        return ''
    return re.sub(r'\s+', ' ', str(value)).strip()


def _format_decimal(value, max_decimals=None):
    if value is None:
        return ''
    if max_decimals is not None:
        quant = Decimal('1.' + ('0' * max_decimals))
        value = value.quantize(quant)
    text = format(value, 'f')
    if '.' in text:
        text = text.rstrip('0').rstrip('.')
    return '0' if text in ('', '-0') else text


def _normalize_numeric_text(value):
    text = _clean_text(value).replace(',', '')
    if not text:
        return ''
    try:
        return _format_decimal(Decimal(text))
    except (InvalidOperation, ValueError):
        return _clean_text(value)


def _normalize_weight_text(value):
    text = _clean_text(value).replace(',', '')
    if not text:
        return ''
    try:
        return _format_decimal(Decimal(text), max_decimals=4)
    except (InvalidOperation, ValueError):
        return _clean_text(value)


def _parse_local_datetime(value):
    text = _clean_text(value)
    if not text:
        return None
    try:
        return datetime.datetime.strptime(text, '%d/%m/%Y %H:%M:%S')
    except ValueError:
        return None


def _scale_agent_is_online(agent, timeout_seconds=45):
    if not agent or not agent.last_seen:
        return False
    seen_at = _parse_local_datetime(agent.last_seen)
    if seen_at is None:
        return False
    return (datetime.datetime.now() - seen_at).total_seconds() <= timeout_seconds


def _print_agent_is_online(agent, timeout_seconds=45):
    if not agent or not agent.last_seen:
        return False
    seen_at = _parse_local_datetime(agent.last_seen)
    if seen_at is None:
        return False
    return (datetime.datetime.now() - seen_at).total_seconds() <= timeout_seconds


def _normalize_scale_settings(value):
    data = value if isinstance(value, dict) else {}

    def _int_setting(*keys, default):
        for key in keys:
            raw = data.get(key)
            if raw in (None, ''):
                continue
            try:
                return int(raw)
            except (TypeError, ValueError):
                continue
        return default

    def _float_setting(*keys, default):
        for key in keys:
            raw = data.get(key)
            if raw in (None, ''):
                continue
            try:
                return float(raw)
            except (TypeError, ValueError):
                continue
        return default

    parity = _clean_text(data.get('parity') or data.get('serial_parity') or 'E').upper()[:1] or 'E'
    if parity not in {'N', 'E', 'O'}:
        parity = 'E'

    line_ending = data.get('line_ending')
    if not isinstance(line_ending, str):
        line_ending = '\r\n'

    command = _clean_text(data.get('command') or data.get('serial_command') or 'Q').upper() or 'Q'
    data_format = _clean_text(data.get('data_format') or 'A&D').upper() or 'A&D'

    return {
        'baudrate': _int_setting('baudrate', 'baud_rate', default=2400),
        'bytesize': _int_setting('bytesize', 'data_bits', default=7),
        'parity': parity,
        'stopbits': _int_setting('stopbits', 'stop_bits', default=1),
        'timeout_seconds': _float_setting('timeout_seconds', 'timeout', default=2.5),
        'command': command,
        'line_ending': line_ending,
        'data_format': data_format,
    }


def _generate_scale_agent_key():
    return f"scale_{uuid.uuid4().hex[:24]}"


def _generate_print_agent_key():
    return f"print_{uuid.uuid4().hex[:24]}"


def scale_command_json(cmd):
    return {
        'id': cmd.id,
        'agent_id': cmd.agent_id,
        'command_type': cmd.command_type,
        'payload': cmd.payload or {},
        'status': cmd.status,
        'requested_by': cmd.requested_by,
        'requested_at': cmd.requested_at,
        'dispatched_at': cmd.dispatched_at,
        'completed_at': cmd.completed_at,
        'result': cmd.result or {},
        'error': cmd.error or '',
    }


def scale_reading_json(reading):
    return {
        'id': reading.id,
        'agent_id': reading.agent_id,
        'command_id': reading.command_id,
        'stable': bool(reading.stable),
        'header': reading.header or '',
        'weight_text': reading.weight_text or '',
        'weight_value': reading.weight_value,
        'unit': reading.unit or '',
        'raw_line': reading.raw_line or '',
        'meta': reading.meta or {},
        'created_at': reading.created_at or '',
    }


def scale_agent_json(agent):
    pending_count = ScaleCommand.query.filter_by(agent_id=agent.id, status='pending').count()
    inflight_count = ScaleCommand.query.filter(
        ScaleCommand.agent_id == agent.id,
        ScaleCommand.status.in_(['pending', 'dispatched'])
    ).count()
    last_command = (
        ScaleCommand.query
        .filter_by(agent_id=agent.id)
        .order_by(ScaleCommand.id.desc())
        .first()
    )
    return {
        'id': agent.id,
        'agent_key': agent.agent_key,
        'device_name': agent.device_name,
        'model': agent.model or '',
        'location': agent.location or '',
        'machine_name': agent.machine_name or '',
        'serial_port': agent.serial_port or '',
        'serial_settings': agent.serial_settings or {},
        'desired_settings': agent.desired_settings or _normalize_scale_settings({}),
        'status': 'online' if _scale_agent_is_online(agent) else 'offline',
        'reported_status': agent.status or '',
        'last_seen': agent.last_seen or '',
        'last_error': agent.last_error or '',
        'last_weight_text': agent.last_weight_text or '',
        'last_weight_value': agent.last_weight_value,
        'last_unit': agent.last_unit or '',
        'last_stable': bool(agent.last_stable),
        'last_raw_line': agent.last_raw_line or '',
        'last_read_at': agent.last_read_at or '',
        'pending_commands': pending_count,
        'inflight_commands': inflight_count,
        'last_command': scale_command_json(last_command) if last_command else None,
        'created_at': agent.created_at or '',
        'updated_at': agent.updated_at or '',
    }


def _coerce_scale_weight(value):
    if value in (None, ''):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def print_device_json(device):
    return {
        'id': device.id,
        'agent_id': device.agent_id,
        'printer_name': device.printer_name or '',
        'share_name': device.share_name or '',
        'unc_path': device.unc_path or '',
        'system_name': device.system_name or '',
        'driver_name': device.driver_name or '',
        'port_name': device.port_name or '',
        'location': device.location or '',
        'comment': device.comment or '',
        'source': device.source or '',
        'is_default': bool(device.is_default),
        'is_network': bool(device.is_network),
        'is_shared': bool(device.is_shared),
        'work_offline': bool(device.work_offline),
        'printer_status': device.printer_status or '',
        'meta': device.meta or {},
        'last_seen': device.last_seen or '',
        'updated_at': device.updated_at or '',
    }


def print_command_json(cmd):
    return {
        'id': cmd.id,
        'agent_id': cmd.agent_id,
        'printer_name': cmd.printer_name or '',
        'document_name': cmd.document_name or '',
        'payload': cmd.payload or {},
        'status': cmd.status,
        'requested_by': cmd.requested_by or '',
        'requested_at': cmd.requested_at or '',
        'dispatched_at': cmd.dispatched_at or '',
        'completed_at': cmd.completed_at or '',
        'result': cmd.result or {},
        'error': cmd.error or '',
    }


def print_agent_json(agent):
    pending_count = PrintCommand.query.filter_by(agent_id=agent.id, status='pending').count()
    inflight_count = PrintCommand.query.filter(
        PrintCommand.agent_id == agent.id,
        PrintCommand.status.in_(['pending', 'dispatched'])
    ).count()
    last_command = (
        PrintCommand.query
        .filter_by(agent_id=agent.id)
        .order_by(PrintCommand.id.desc())
        .first()
    )
    printers = (
        PrintDevice.query
        .filter_by(agent_id=agent.id)
        .order_by(PrintDevice.printer_name.asc(), PrintDevice.id.asc())
        .all()
    )
    return {
        'id': agent.id,
        'agent_key': agent.agent_key,
        'device_name': agent.device_name or '',
        'location': agent.location or '',
        'machine_name': agent.machine_name or '',
        'status': 'online' if _print_agent_is_online(agent) else 'offline',
        'reported_status': agent.status or '',
        'last_seen': agent.last_seen or '',
        'last_error': agent.last_error or '',
        'last_scan_at': agent.last_scan_at or '',
        'printer_count': int(agent.printer_count or 0),
        'pending_commands': pending_count,
        'inflight_commands': inflight_count,
        'last_command': print_command_json(last_command) if last_command else None,
        'printers': [print_device_json(device) for device in printers],
        'created_at': agent.created_at or '',
        'updated_at': agent.updated_at or '',
    }


def _normalize_print_command_payload(data):
    payload = data if isinstance(data, dict) else {}
    printer_name = _clean_text(payload.get('printer_name') or payload.get('target_printer'))
    document_name = _clean_text(payload.get('document_name') or payload.get('title') or 'Lenh in')
    mode = _clean_text(payload.get('mode') or '').lower()
    if mode in {'image_base64', 'png_base64'}:
        mode = 'image_base64'
    elif mode == 'image_url':
        mode = 'image_url'
    elif mode not in {'text', 'raw', 'file_url', 'file_base64'}:
        if _clean_text(payload.get('content_text')):
            mode = 'text'
        elif _clean_text(payload.get('image_url')):
            mode = 'image_url'
        elif _clean_text(payload.get('file_url')):
            mode = 'file_url'
        elif _clean_text(payload.get('content_base64') or payload.get('raw_base64')):
            mode = 'image_base64' if _clean_text(payload.get('content_type') or payload.get('mime_type')).lower().startswith('image/') else 'file_base64'
        else:
            mode = 'raw'
    try:
        copies = max(1, int(payload.get('copies') or 1))
    except (TypeError, ValueError):
        copies = 1
    return {
        'printer_name': printer_name,
        'document_name': document_name,
        'mode': mode,
        'content_text': str(payload.get('content_text') or ''),
        'content_base64': str(payload.get('content_base64') or payload.get('raw_base64') or ''),
        'content_encoding': _clean_text(payload.get('content_encoding') or 'utf-8') or 'utf-8',
        'image_url': _clean_text(payload.get('image_url')),
        'file_url': _clean_text(payload.get('file_url')),
        'file_name': _clean_text(payload.get('file_name') or payload.get('document_name')),
        'content_type': _clean_text(payload.get('content_type') or payload.get('mime_type')),
        'copies': copies,
        'options': payload.get('options') if isinstance(payload.get('options'), dict) else {},
    }


def _build_scale_command_payload(data):
    serial_command = _clean_text(data.get('serial_command') or '')
    mode = _clean_text(data.get('mode') or '')
    if not serial_command:
        serial_command = 'S' if mode == 'stable' else 'Q'
    timeout_seconds = data.get('timeout_seconds')
    try:
        timeout_seconds = float(timeout_seconds) if timeout_seconds not in (None, '') else 2.5
    except (TypeError, ValueError):
        timeout_seconds = 2.5
    return {
        'mode': mode or ('stable' if serial_command.upper() == 'S' else 'immediate'),
        'serial_command': serial_command.upper(),
        'timeout_seconds': timeout_seconds,
    }


def _touch_nhap_vang_list(obj):
    obj.ngay_cap_nhat = now_str()


def _normalize_nhap_vang_qty(required_qty, imported_qty):
    required_qty = max(0, int(required_qty or 0))
    imported_qty = max(0, int(imported_qty or 0))
    return required_qty, min(imported_qty, required_qty)


def nhap_vang_item_json(item):
    required_qty = int(item.so_luong_yeu_cau or 0)
    imported_qty = int(item.so_luong_da_nhap or 0)
    remaining_qty = max(0, required_qty - imported_qty)
    return {
        'id': item.id,
        'list_id': item.list_id,
        'ten_hang': item.ten_hang or '',
        'nhom_hang': item.nhom_hang or '',
        'tuoi_vang': item.tuoi_vang or '',
        'trong_luong': item.trong_luong or '',
        'so_luong_yeu_cau': required_qty,
        'so_luong_da_nhap': imported_qty,
        'so_luong_con_lai': remaining_qty,
        'ghi_chu': item.ghi_chu or '',
        'thu_tu': item.thu_tu or 0,
        'hoan_thanh': remaining_qty == 0 and required_qty > 0,
        'ngay_tao': item.ngay_tao or '',
        'ngay_cap_nhat': item.ngay_cap_nhat or '',
    }


def nhap_vang_list_json(obj, include_items=True):
    items = [nhap_vang_item_json(item) for item in obj.items] if include_items else []
    total_required = sum(item['so_luong_yeu_cau'] for item in items)
    total_imported = sum(item['so_luong_da_nhap'] for item in items)
    total_remaining = max(0, total_required - total_imported)
    return {
        'id': obj.id,
        'ten_danh_sach': obj.ten_danh_sach or '',
        'ghi_chu': obj.ghi_chu or '',
        'trang_thai': obj.trang_thai or 'dang_mo',
        'nguoi_tao': obj.nguoi_tao or '',
        'ngay_tao': obj.ngay_tao or '',
        'ngay_cap_nhat': obj.ngay_cap_nhat or '',
        'tong_so_luong': total_required,
        'da_nhap': total_imported,
        'con_lai': total_remaining,
        'items': items,
    }


def _decimal_or_none(value):
    text = _clean_text(value).replace(',', '')
    if not text:
        return None
    try:
        return Decimal(text)
    except (InvalidOperation, ValueError):
        return None


def _compute_tong_tl(tl_da, tl_vang, fallback=''):
    da = _decimal_or_none(tl_da)
    vang = _decimal_or_none(tl_vang)
    if da is None and vang is None:
        return _normalize_weight_text(fallback)
    return _format_decimal((da or Decimal('0')) + (vang or Decimal('0')), max_decimals=4)


def _extract_loai_vang(values):
    for value in values:
        folded = _ascii_fold(value)
        match = re.search(r'loai\s+vang\s*:?\s*(.+)', folded)
        if match:
            return match.group(1).strip(' -').upper()
    return ''


def _find_import_header(sheet):
    required = {'ma_hang', 'ncc', 'nhom_hang', 'quay_nho', 'cong_le', 'cong_si', 'tl_da', 'tl_vang'}
    for row_idx in range(sheet.nrows):
        mapping = {}
        for col_idx, value in enumerate(sheet.row_values(row_idx)):
            label = _ascii_fold(value)
            for field, aliases in IMPORT_HEADER_ALIASES.items():
                if label in aliases:
                    mapping[field] = col_idx
                    break
        if required.issubset(mapping.keys()):
            return row_idx, mapping
    raise ValueError('Khong tim thay header hop le trong file XLS.')


def _parse_inventory_xls(file_bytes, filename=''):
    try:
        import xlrd
    except ImportError as exc:
        raise RuntimeError('Server dang thieu thu vien xlrd de doc file .xls.') from exc

    try:
        book = xlrd.open_workbook(file_contents=file_bytes)
    except Exception as exc:
        raise ValueError(f'Khong mo duoc file XLS: {exc}') from exc

    sheet = book.sheet_by_index(0)
    header_row, column_map = _find_import_header(sheet)
    fallback_loai_vang = _clean_text(os.path.splitext(os.path.basename(filename))[0]).upper()
    current_loai_vang = ''

    for row_idx in range(header_row + 1):
        detected = _extract_loai_vang(sheet.row_values(row_idx))
        if detected:
            current_loai_vang = detected

    items = []
    for row_idx in range(header_row + 1, sheet.nrows):
        row_values = sheet.row_values(row_idx)
        detected = _extract_loai_vang(row_values)
        if detected:
            current_loai_vang = detected

        ma_hang = _clean_text(row_values[column_map['ma_hang']])
        if not ma_hang or _ascii_fold(ma_hang) == 'ma hang':
            continue

        tl_da = _normalize_weight_text(row_values[column_map['tl_da']])
        tl_vang = _normalize_weight_text(row_values[column_map['tl_vang']])

        items.append({
            'ma_hang': ma_hang,
            'ncc': _clean_text(row_values[column_map['ncc']]),
            'nhom_hang': _clean_text(row_values[column_map['nhom_hang']]),
            'quay_nho': _clean_text(row_values[column_map['quay_nho']]),
            'cong_le': _normalize_numeric_text(row_values[column_map['cong_le']]),
            'cong_si': _normalize_numeric_text(row_values[column_map['cong_si']]),
            'tl_da': tl_da,
            'tl_vang': tl_vang,
            'tong_tl': _compute_tong_tl(tl_da, tl_vang),
            'loai_vang': current_loai_vang or fallback_loai_vang,
        })

    if not items:
        raise ValueError('Khong tim thay dong du lieu hop le trong file XLS.')

    return {
        'items': items,
        'loai_vang': current_loai_vang or fallback_loai_vang,
        'sheet_name': sheet.name,
    }


def _item_json(it):
    tl = 0.0
    try: tl = float(it.tl_vang or 0)
    except: pass
    gv  = it.gia_vang_mua or 0
    gh  = it.gia_hat or 0
    gnc = it.gia_nhan_cong or 0
    dc  = it.dieu_chinh or 0
    gia_mua_tinh = round(gv * tl + gh + gnc + dc)
    return {
        'id': it.id, 'ma_hang': it.ma_hang, 'ncc': it.ncc,
        'nhom_hang': it.nhom_hang, 'quay_nho': it.quay_nho,
        'cong_le': it.cong_le, 'cong_si': it.cong_si,
        'tong_tl': _compute_tong_tl(it.tl_da, it.tl_vang, it.tong_tl), 'tl_da': it.tl_da, 'tl_vang': it.tl_vang,
        'loai_vang': it.loai_vang, 'tuoi_vang': it.tuoi_vang or '', 'status': it.status,
        'images': it.images, 'certificates': it.certificates, 'history': it.history,
        'gia_vang_mua': gv, 'gia_hat': gh, 'gia_nhan_cong': gnc, 'dieu_chinh': dc,
        'gia_mua_tinh': gia_mua_tinh, 'gia_hien_tai': None,
    }


__all__ = [name for name in globals() if not name.startswith('__')]
