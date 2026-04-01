import datetime
import re
import unicodedata
from decimal import Decimal

from pgcompat import flag_modified

from .state import app, db
from .models import *
from .setup_base import *
from .setup_base import (
    _ensure_item_tuoi_vang_column,
    _ensure_quay_nho_thu_ngan_column,
    _ensure_search_indexes,
    _ensure_thu_ngan_password_hash_column,
    _ensure_thu_ngan_so_quy_detail_columns,
    _ensure_tuoi_vang_columns,
    _get_or_create_default_kho,
    _is_default_kho_name,
    _migrate_thu_ngan_so_quy_amount_scale,
)


def _fold_ascii_text(text):
    normalized = unicodedata.normalize('NFKD', str(text or '').replace('đ', 'd').replace('Đ', 'D'))
    stripped = ''.join(ch for ch in normalized if not unicodedata.combining(ch))
    return re.sub(r'\s+', ' ', stripped).strip().lower()


def _tuoi_vang_permille(value):
    folded = _fold_ascii_text(value)
    if not folded:
        return None
    four_digit = re.findall(r'\b(\d{4})\b', folded)
    if four_digit:
        return int(Decimal(four_digit[0]) / Decimal('10'))
    three_digit = re.findall(r'\b(\d{3})\b', folded)
    if three_digit:
        return int(three_digit[0])
    karat_match = re.search(r'(\d+(?:[.,]\d+)?)\s*k\b', folded)
    if karat_match:
        karat = Decimal(karat_match.group(1).replace(',', '.'))
        return int((karat / Decimal('24') * Decimal('1000')).quantize(Decimal('1')))
    pct_match = re.search(r'(\d+(?:[.,]\d+)?)\s*%', folded)
    if pct_match:
        pct = Decimal(pct_match.group(1).replace(',', '.'))
        return int((pct * Decimal('10')).quantize(Decimal('1')))
    small_num = re.search(r'\b(\d+(?:[.,]\d+)?)\b', folded)
    if small_num:
        pct = Decimal(small_num.group(1).replace(',', '.'))
        if pct <= 100:
            return int((pct * Decimal('10')).quantize(Decimal('1')))
    return None


def _loai_vang_permille(loai):
    for candidate in (loai.ma_loai, loai.ten_loai, loai.sjc_key):
        permille = _tuoi_vang_permille(candidate)
        if permille is not None:
            return permille
    return None


def _looks_like_sjc_source_row(ma_loai='', ten_loai='', sjc_key=''):
    raw_ma = _sync_clean_text(ma_loai)
    folded = ' '.join(filter(None, [
        _fold_ascii_text(ma_loai),
        _fold_ascii_text(ten_loai),
        _fold_ascii_text(sjc_key),
    ]))
    if raw_ma.upper().startswith('SJC-'):
        return True
    if 'vang sjc' in folded or 'nhan sjc' in folded or 'mieng' in folded:
        return True
    return False


SJC_INTERNAL_CODE_TO_KEY = {
    '417': 'Nữ trang 41,7%',
    '585': 'Nữ trang 58,3%',
    '610': 'Nữ trang 61%',
    '680': 'Nữ trang 68%',
    '750': 'Nữ trang 75%',
    '990': 'Nữ trang 99%',
    '9999': 'Nữ trang 99,99%',
}

SJC_INTERNAL_CODES_TO_CLEAR = {'416', '583', '980', '999'}

SJC_PERMILLE_TO_INTERNAL_CODE = {
    417: '417',
    583: '585',
    585: '585',
    610: '610',
    680: '680',
    750: '750',
    990: '990',
    999: '9999',
    1000: '9999',
}


def _extract_explicit_sjc_internal_code(value):
    folded = _fold_ascii_text(value)
    if not folded:
        return None
    for code in sorted(
        list(SJC_INTERNAL_CODE_TO_KEY.keys()) + list(SJC_INTERNAL_CODES_TO_CLEAR),
        key=lambda item: (-len(item), item),
    ):
        if re.search(rf'(?<!\d){re.escape(code)}(?!\d)', folded):
            return code
    return None


def _suggest_sjc_key_for_loai_vang(loai):
    if _looks_like_sjc_source_row(getattr(loai, 'ma_loai', ''), getattr(loai, 'ten_loai', ''), getattr(loai, 'sjc_key', '')):
        return False, _sync_clean_text(getattr(loai, 'sjc_key', ''))

    folded_values = ' '.join(filter(None, [
        _fold_ascii_text(getattr(loai, 'ma_loai', '')),
        _fold_ascii_text(getattr(loai, 'ten_loai', '')),
    ]))
    if 'bac' in folded_values or 'silver' in folded_values:
        return False, ''

    explicit_code = _extract_explicit_sjc_internal_code(getattr(loai, 'ma_loai', ''))
    if explicit_code:
        return True, SJC_INTERNAL_CODE_TO_KEY.get(explicit_code, '')

    explicit_code = _extract_explicit_sjc_internal_code(getattr(loai, 'ten_loai', ''))
    if explicit_code:
        return True, SJC_INTERNAL_CODE_TO_KEY.get(explicit_code, '')

    permille = _loai_vang_permille(loai)
    if permille is None:
        return False, ''
    canonical_code = SJC_PERMILLE_TO_INTERNAL_CODE.get(permille)
    if not canonical_code:
        return False, ''
    return True, SJC_INTERNAL_CODE_TO_KEY.get(canonical_code, '')


def _auto_map_loai_vang_sjc_keys(force=False):
    updates = []
    for loai in LoaiVang.query.order_by(LoaiVang.id).all():
        managed, suggested_key = _suggest_sjc_key_for_loai_vang(loai)
        if not managed:
            continue
        current_key = _sync_clean_text(getattr(loai, 'sjc_key', ''))
        if current_key == suggested_key:
            continue
        if current_key and not force:
            continue
        loai.sjc_key = suggested_key
        updates.append({
            'id': loai.id,
            'ma_loai': loai.ma_loai,
            'ten_loai': loai.ten_loai,
            'sjc_key': suggested_key,
        })
    if updates:
        db.session.commit()
    return updates


def _suggest_trong_luong_rieng(ten_tuoi):
    permille = _tuoi_vang_permille(ten_tuoi)
    if permille is None:
        return 0.0
    preset = {
        1000: Decimal('19.3200'),
        999: Decimal('19.2500'),
        916: Decimal('17.7000'),
        750: Decimal('15.6000'),
        680: Decimal('15.0000'),
        610: Decimal('14.2000'),
        585: Decimal('13.9000'),
        583: Decimal('13.8600'),
        417: Decimal('11.8200'),
        416: Decimal('11.7800'),
        375: Decimal('10.9000'),
    }
    if permille in preset:
        return float(preset[permille])
    ratio = Decimal(permille) / Decimal('1000')
    base_ratio = Decimal('0.416')
    base_density = Decimal('11.7800')
    pure_ratio = Decimal('0.9999')
    pure_density = Decimal('19.3200')
    slope = (pure_density - base_density) / (pure_ratio - base_ratio)
    density = base_density + (ratio - base_ratio) * slope
    density = max(Decimal('10.0000'), min(Decimal('19.3200'), density))
    return float(density.quantize(Decimal('0.0001')))


def _suggest_tuoi_vang_defaults(ten_tuoi):
    permille = _tuoi_vang_permille(ten_tuoi)
    gia_ban = 0
    gia_mua = 0
    exact_ref = None
    fallback_ref = None
    fallback_ref_permille = None
    smallest_diff = None
    if ten_tuoi:
        folded_target = _fold_ascii_text(ten_tuoi)
        for loai in LoaiVang.query.order_by(LoaiVang.id).all():
            candidates = {_fold_ascii_text(loai.ma_loai), _fold_ascii_text(loai.ten_loai), _fold_ascii_text(loai.sjc_key)}
            loai_permille = _loai_vang_permille(loai)
            has_price = bool((loai.gia_ban or 0) or (loai.gia_mua or 0))
            if folded_target and folded_target in candidates and has_price:
                exact_ref = loai
                break
            if permille is None or loai_permille is None or not has_price:
                continue
            diff = abs(loai_permille - permille)
            if smallest_diff is None or diff < smallest_diff:
                smallest_diff = diff
                fallback_ref = loai
    ref = exact_ref
    if ref is None and fallback_ref is not None and smallest_diff is not None and smallest_diff <= 20:
        ref = fallback_ref
    if ref is not None:
        gia_ban = ref.gia_ban or 0
        gia_mua = ref.gia_mua or 0
    elif permille is not None:
        pure_ref = None
        pure_ref_permille = None
        for loai in LoaiVang.query.order_by(LoaiVang.id).all():
            loai_permille = _loai_vang_permille(loai)
            if loai_permille is None or not loai.gia_ban or not loai.gia_mua:
                continue
            if pure_ref_permille is None or loai_permille > pure_ref_permille:
                pure_ref = loai
                pure_ref_permille = loai_permille
        if pure_ref is not None and pure_ref_permille:
            gia_ban = int(round((pure_ref.gia_ban or 0) * permille / pure_ref_permille))
            gia_mua = int(round((pure_ref.gia_mua or 0) * permille / pure_ref_permille))
    return {
        'gia_ban': gia_ban,
        'gia_mua': gia_mua,
        'trong_luong_rieng': _suggest_trong_luong_rieng(ten_tuoi),
    }


def _backfill_tuoi_vang_defaults():
    changed = False
    for tuoi in TuoiVang.query.order_by(TuoiVang.id).all():
        suggested = _suggest_tuoi_vang_defaults(tuoi.ten_tuoi)
        if not (tuoi.gia_ban or 0) and suggested['gia_ban']:
            tuoi.gia_ban = suggested['gia_ban']
            changed = True
        if not (tuoi.gia_mua or 0) and suggested['gia_mua']:
            tuoi.gia_mua = suggested['gia_mua']
            changed = True
        if not (tuoi.trong_luong_rieng or 0) and suggested['trong_luong_rieng']:
            tuoi.trong_luong_rieng = suggested['trong_luong_rieng']
            changed = True
        if tuoi.lich_su is None:
            tuoi.lich_su = []
            changed = True
    if changed:
        db.session.commit()


def _sync_clean_text(value):
    if value is None:
        return ''
    return re.sub(r'\s+', ' ', str(value)).strip()


def _sync_now_str():
    return datetime.datetime.now().strftime('%d/%m/%Y %H:%M:%S')


def _sync_loai_vang_from_tuoi_vang_record(tuoi, old_ten_tuoi=None, record_history=False):
    ten_tuoi = _sync_clean_text(getattr(tuoi, 'ten_tuoi', ''))
    if not ten_tuoi:
        return None

    old_ten = _sync_clean_text(old_ten_tuoi)
    loai = LoaiVang.query.filter_by(ma_loai=ten_tuoi).first()
    renamed = False

    if loai is None and old_ten and old_ten != ten_tuoi:
        old_loai = LoaiVang.query.filter_by(ma_loai=old_ten).first()
        if old_loai and not LoaiVang.query.filter_by(ma_loai=ten_tuoi).first():
            loai = old_loai
            loai.ma_loai = ten_tuoi
            renamed = True

    created = False
    if loai is None:
        loai = LoaiVang(
            ma_loai=ten_tuoi,
            ten_loai=ten_tuoi,
            gia_ban=0,
            gia_mua=0,
            sjc_key='',
            nguoi_phu_trach='',
            ngay_tao=getattr(tuoi, 'ngay_tao', '') or _sync_now_str(),
            lich_su=[],
        )
        db.session.add(loai)
        created = True

    ten_loai_current = _sync_clean_text(loai.ten_loai)
    if not ten_loai_current or ten_loai_current in {old_ten, ten_tuoi}:
        loai.ten_loai = ten_tuoi

    old_ban = loai.gia_ban or 0
    old_mua = loai.gia_mua or 0
    new_ban = getattr(tuoi, 'gia_ban', 0) or 0
    new_mua = getattr(tuoi, 'gia_mua', 0) or 0

    loai.gia_ban = new_ban
    loai.gia_mua = new_mua
    if loai.lich_su is None:
        loai.lich_su = []

    if record_history and (old_ban != new_ban or old_mua != new_mua):
        loai.lich_su.append({
            'date': _sync_now_str(),
            'gia_ban': new_ban,
            'gia_mua': new_mua,
            'delta_ban': new_ban - old_ban,
            'delta_mua': new_mua - old_mua,
            'note': f'Dong bo tu tuoi vang {ten_tuoi}',
            'by': 'TuoiVangSync',
        })
        flag_modified(loai, 'lich_su')

    return loai


def _sync_all_loai_vang_from_tuoi_vang():
    for tuoi in TuoiVang.query.order_by(TuoiVang.id).all():
        _sync_loai_vang_from_tuoi_vang_record(tuoi, record_history=False)
    if db.session.new or db.session.dirty:
        db.session.commit()


def _resolve_tuoi_vang_name_for_loai_vang_values(ma_loai='', ten_loai='', sjc_key=''):
    if _looks_like_sjc_source_row(ma_loai, ten_loai, sjc_key):
        return ''

    folded_values = ' '.join(filter(None, [
        _fold_ascii_text(ma_loai),
        _fold_ascii_text(ten_loai),
        _fold_ascii_text(sjc_key),
    ]))
    if 'bac' in folded_values or 'silver' in folded_values:
        return ''

    for candidate in (_sync_clean_text(ma_loai), _sync_clean_text(ten_loai)):
        if candidate and TuoiVang.query.filter_by(ten_tuoi=candidate).first():
            return candidate

    explicit_code = _extract_explicit_sjc_internal_code(ma_loai) or _extract_explicit_sjc_internal_code(ten_loai)
    if explicit_code:
        return explicit_code

    permille = None
    for candidate in (ma_loai, ten_loai, sjc_key):
        permille = _tuoi_vang_permille(candidate)
        if permille is not None:
            break
    if permille is None:
        return ''

    canonical_code = SJC_PERMILLE_TO_INTERNAL_CODE.get(permille)
    if canonical_code:
        return canonical_code

    for tuoi in TuoiVang.query.order_by(TuoiVang.id).all():
        if _tuoi_vang_permille(tuoi.ten_tuoi) == permille:
            return tuoi.ten_tuoi

    return str(permille)


def _sync_tuoi_vang_from_loai_vang_record(loai, old_ma_loai=None, old_ten_loai=None, old_sjc_key=None, record_history=False):
    target_name = _resolve_tuoi_vang_name_for_loai_vang_values(
        getattr(loai, 'ma_loai', ''),
        getattr(loai, 'ten_loai', ''),
        getattr(loai, 'sjc_key', ''),
    )
    if not target_name:
        return None

    old_target_name = _resolve_tuoi_vang_name_for_loai_vang_values(
        old_ma_loai,
        old_ten_loai,
        old_sjc_key,
    ) if (old_ma_loai or old_ten_loai or old_sjc_key) else ''

    target = TuoiVang.query.filter_by(ten_tuoi=target_name).first()
    renamed = False
    if target is None and old_target_name and old_target_name != target_name:
        old_target = TuoiVang.query.filter_by(ten_tuoi=old_target_name).first()
        if old_target and not TuoiVang.query.filter_by(ten_tuoi=target_name).first():
            target = old_target
            target.ten_tuoi = target_name
            renamed = True

    created = False
    if target is None:
        target = TuoiVang(
            ten_tuoi=target_name,
            gia_ban=0,
            gia_mua=0,
            trong_luong_rieng=_suggest_trong_luong_rieng(target_name),
            ghi_chu='',
            lich_su=[],
            ngay_tao=getattr(loai, 'ngay_tao', '') or _sync_now_str(),
        )
        db.session.add(target)
        created = True

    old_ban = target.gia_ban or 0
    old_mua = target.gia_mua or 0
    new_ban = getattr(loai, 'gia_ban', 0) or 0
    new_mua = getattr(loai, 'gia_mua', 0) or 0

    target.gia_ban = new_ban
    target.gia_mua = new_mua
    if not (target.trong_luong_rieng or 0):
        target.trong_luong_rieng = _suggest_trong_luong_rieng(target_name)
    if target.lich_su is None:
        target.lich_su = []

    if record_history and (old_ban != new_ban or old_mua != new_mua):
        target.lich_su.append({
            'date': _sync_now_str(),
            'gia_ban': new_ban,
            'gia_mua': new_mua,
            'delta_ban': new_ban - old_ban,
            'delta_mua': new_mua - old_mua,
            'note': f'Dong bo tu loai vang {getattr(loai, "ma_loai", "")}',
            'by': 'LoaiVangSync',
        })
        flag_modified(target, 'lich_su')

    return target


def bootstrap_database():
    db.create_all()
    _ensure_item_tuoi_vang_column()
    _ensure_tuoi_vang_columns()
    _ensure_quay_nho_thu_ngan_column()
    _ensure_thu_ngan_password_hash_column()
    _ensure_thu_ngan_so_quy_detail_columns()
    _ensure_khach_hang_sao_column()
    _ensure_khach_hang_favorite_column()
    _ensure_khach_hang_cccd_image_columns()
    _ensure_khach_hang_photo_gallery_column()
    _ensure_search_indexes()
    _migrate_thu_ngan_so_quy_amount_scale()
    if Kho.query.count() == 0:
        for k in SEED_KHO:
            db.session.add(Kho(**k))
        db.session.commit()
    if LoaiVang.query.count() == 0:
        for v in SEED_LOAI_VANG:
            db.session.add(LoaiVang(**v))
        db.session.commit()
    else:
        # Đảm bảo cột sjc_key không bị NULL cho các hàng cũ
        for v in LoaiVang.query.all():
            if v.sjc_key is None:
                v.sjc_key = ''
        db.session.commit()
    # Auto-seed NhomHang từ giá trị nhom_hang thực tế trong Item
    if NhomHang.query.count() == 0:
        existing = (
            db.session.query(Item.nhom_hang)
            .distinct()
            .filter(Item.nhom_hang.isnot(None), Item.nhom_hang != '')
            .all()
        )
        ts = datetime.datetime.now().strftime('%d/%m/%Y %H:%M:%S')
        for i, row in enumerate(sorted(r[0] for r in existing if r[0])):
            db.session.add(NhomHang(ten_nhom=row, thu_tu=i, ngay_tao=ts))
        db.session.commit()
    if TuoiVang.query.count() == 0:
        existing_tuoi = (
            db.session.query(Item.tuoi_vang)
            .distinct()
            .filter(Item.tuoi_vang.isnot(None), Item.tuoi_vang != '')
            .all()
        )
        ts = datetime.datetime.now().strftime('%d/%m/%Y %H:%M:%S')
        for row in sorted(r[0] for r in existing_tuoi if r[0]):
            suggested = _suggest_tuoi_vang_defaults(row)
            db.session.add(TuoiVang(
                ten_tuoi=row,
                gia_ban=suggested['gia_ban'],
                gia_mua=suggested['gia_mua'],
                trong_luong_rieng=suggested['trong_luong_rieng'],
                lich_su=[],
                ngay_tao=ts,
            ))
        db.session.commit()
    _backfill_tuoi_vang_defaults()
    _sync_all_loai_vang_from_tuoi_vang()
    default_kho = _get_or_create_default_kho()
    all_quays = QuayNho.query.all()
    changed = False
    for q in all_quays:
        if q.kho_id != default_kho.id:
            q.kho_id = default_kho.id
            changed = True
    duplicate_khos = [
        k for k in Kho.query.order_by(Kho.id).all()
        if k.id != default_kho.id and _is_default_kho_name(k.ten_kho)
    ]
    for kho in duplicate_khos:
        db.session.delete(kho)
        changed = True
    if changed:
        db.session.commit()


__all__ = [name for name in globals() if not name.startswith('__')]
