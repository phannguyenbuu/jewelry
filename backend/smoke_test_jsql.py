#!/usr/bin/env python3
import datetime
import os
import sys
import uuid


BASE_DIR = os.path.dirname(__file__)
PGHOST = os.environ.get('PGHOST', 'localhost' if os.path.exists('/var/www/jewelry') else 'jewelry.n-lux.com')
PGUSER = os.environ.get('PGUSER', 'postgres')
PGPASSWORD = os.environ.get('PGPASSWORD', 'myPass')
PGDATABASE = os.environ.get('PGDATABASE', 'jsql')
os.environ.setdefault('DATABASE_URL', f'postgresql://{PGUSER}:{PGPASSWORD}@{PGHOST}/{PGDATABASE}')
sys.path.insert(0, BASE_DIR)

from app_jewelry import app  # noqa: E402


def expect(condition, message):
    if not condition:
        raise AssertionError(message)


def expect_ok(response, message):
    if response.status_code < 200 or response.status_code >= 300:
        raise AssertionError(f'{message}: HTTP {response.status_code} {response.get_json()}')


def main():
    client = app.test_client()
    today = datetime.date.today().isoformat()
    suffix = uuid.uuid4().hex[:8]
    created = {
        'quay_id': None,
        'cashier_id': None,
        'kho_id': None,
        'nhom_id': None,
    }

    try:
        for endpoint in [
            '/api/items',
            '/api/kho',
            '/api/quay_nho',
            '/api/loai_vang',
            '/api/nhom_hang',
            '/api/thu_ngan',
            f'/api/thu_ngan_so_quy?ngay={today}',
        ]:
            response = client.get(endpoint)
            expect_ok(response, f'GET {endpoint}')
            print(f'OK GET {endpoint}')

        items = client.get('/api/items').get_json()
        kho_rows = client.get('/api/kho').get_json()
        loai_vang = client.get('/api/loai_vang').get_json()
        expect(len(items) > 0, 'items should not be empty after migration')
        expect(len(kho_rows) > 0, 'kho should not be empty after migration')
        expect(len(loai_vang) > 0, 'loai_vang should not be empty after migration')

        response = client.post('/api/nhom_hang', json={
            'ten_nhom': f'TEMP-NHOM-{suffix}',
            'ma_nhom': f'TMP{suffix[:4]}',
            'mau_sac': '#123456',
            'mo_ta': 'smoke test',
            'thu_tu': 999,
        })
        expect_ok(response, 'POST /api/nhom_hang')
        created['nhom_id'] = response.get_json()['id']
        print('OK create nhom_hang')

        response = client.post('/api/kho', json={
            'ten_kho': f'TEMP-KHO-{suffix}',
            'dia_chi': 'smoke-test',
            'ghi_chu': 'smoke-test',
            'nguoi_phu_trach': 'smoke-test',
        })
        expect_ok(response, 'POST /api/kho')
        created['kho_id'] = response.get_json()['id']
        print('OK create kho')

        response = client.post('/api/thu_ngan', json={
            'ten_thu_ngan': f'TEMP-TN-{suffix}',
            'kho_id': created['kho_id'],
            'ghi_chu': 'smoke-test',
            'quay_ids': [],
        })
        expect_ok(response, 'POST /api/thu_ngan')
        created['cashier_id'] = response.get_json()['id']
        print('OK create thu_ngan')

        response = client.post('/api/quay_nho', json={
            'ten_quay': f'TEMP-QUAY-{suffix}',
            'kho_id': created['kho_id'],
            'thu_ngan_id': created['cashier_id'],
            'ghi_chu': 'smoke-test',
            'nguoi_phu_trach': 'smoke-test',
        })
        expect_ok(response, 'POST /api/quay_nho')
        created['quay_id'] = response.get_json()['id']
        print('OK create quay_nho')

        response = client.put('/api/thu_ngan_so_quy', json={
            'ngay': today,
            'thu_ngan_id': created['cashier_id'],
            'ghi_chu': 'smoke-test save',
            'chi_tiet': [{
                'row_id': f'row-{suffix}',
                'tuoi_vang': 'TEST',
                'ton_dau_ky': 12000000,
                'so_du_hien_tai': 12050000,
                'gia_tri_lech': 50000,
            }],
        })
        expect_ok(response, 'PUT /api/thu_ngan_so_quy')
        payload = response.get_json()
        row = next(item for item in payload['rows'] if item['thu_ngan_id'] == created['cashier_id'])
        expect(row['so_tien_dau_ngay'] == 12000000.0, 'draft so_tien_dau_ngay mismatch')
        expect(row['so_tien_hien_tai'] == 12050000.0, 'draft so_tien_hien_tai mismatch')
        print('OK save thu_ngan_so_quy draft')

        response = client.post('/api/thu_ngan_so_quy/chot', json={
            'ngay': today,
            'thu_ngan_id': created['cashier_id'],
            'ghi_chu': 'smoke-test chot',
            'chi_tiet': [{
                'row_id': f'row-{suffix}',
                'tuoi_vang': 'TEST',
                'ton_dau_ky': 12000000,
                'so_du_hien_tai': 12050000,
                'gia_tri_lech': 50000,
            }],
        })
        expect_ok(response, 'POST /api/thu_ngan_so_quy/chot')
        payload = response.get_json()
        history_entry = next(item for item in payload['history'] if item['thu_ngan_id'] == created['cashier_id'])
        expect(history_entry['so_tien'] == 12050000.0, 'history so_tien mismatch')
        print('OK chot thu_ngan_so_quy')

        response = client.post('/api/thu_ngan_so_quy/history/delete', json={
            'ngay': today,
            'thu_ngan_id': created['cashier_id'],
            'entry_id': history_entry['entry_id'],
            'thoi_gian': history_entry['thoi_gian'],
            'so_tien_dau_ngay': history_entry['so_tien_dau_ngay'],
            'so_tien': history_entry['so_tien'],
            'ghi_chu': history_entry['ghi_chu'],
        })
        expect_ok(response, 'POST /api/thu_ngan_so_quy/history/delete')
        payload = response.get_json()
        expect(not any(item['thu_ngan_id'] == created['cashier_id'] for item in payload['history']), 'history should be removed')
        print('OK delete thu_ngan_so_quy history')

    finally:
        if created['quay_id']:
            client.delete(f"/api/quay_nho/{created['quay_id']}")
        if created['cashier_id']:
            client.delete(f"/api/thu_ngan/{created['cashier_id']}")
        if created['kho_id']:
            client.delete(f"/api/kho/{created['kho_id']}")
        if created['nhom_id']:
            client.delete(f"/api/nhom_hang/{created['nhom_id']}")

    print('Smoke test passed')


if __name__ == '__main__':
    main()
