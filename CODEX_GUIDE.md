# Codex Guide

Guide này dành cho Codex/AI agent khi sửa repo `jewelry`.

## Mục tiêu

- giữ repo ổn định
- không làm vỡ luồng nghiệp vụ đang chạy
- tiếp tục refactor theo hướng chia nhỏ file
- tránh lặp lại các lỗi cũ như mojibake, helper phình to, import thừa

## Quy ước bắt buộc

- giữ file `.js/.jsx/.css/.py` dưới `500` dòng nếu có thể
- không reintroduce `SQLAlchemy`
- runtime backend phải tiếp tục dùng PostgreSQL `jsql`
- không thêm fallback SQLite cho runtime
- ưu tiên tách module thay vì nhồi thêm vào file lớn
- khi sửa text tiếng Việt, lưu file ở UTF-8 sạch
- không khôi phục route `/camera`; OCR chỉ còn qua API và các màn nghiệp vụ đang dùng

## Kiến trúc hiện tại

### Frontend

- `frontend/src/App.jsx`
  - shell chính của dashboard desktop
  - route switch cho tab admin
- `frontend/src/SalePosMobile.jsx`
  - entry của `/sale`
  - logic con nằm ở `frontend/src/sale/`
- `frontend/src/CauHinhPage.jsx`
  - shell tab Cài đặt
  - logic con ở `frontend/src/cauhinh/`
- `frontend/src/KeToanPage.jsx`
  - shell tab Kế toán
  - logic con ở `frontend/src/keToan/`
- `frontend/src/TaiChinhPage.jsx`
  - shell tab Tài chính
  - logic con ở `frontend/src/taiChinh/`
- `frontend/src/ThuNganPage.jsx`
  - shell Thu ngân
  - component con ở `frontend/src/thuNgan/`
- `frontend/src/inventory/`
  - workspace, modal, shared helper cho màn sản phẩm

### Backend

- `backend/app_jewelry.py`
  - entry runtime
  - import route modules để đăng ký endpoint
- `backend/jewelry_backend/state.py`
  - Flask app + CORS + `DATABASE_URL`
- `backend/jewelry_backend/models.py`
  - model definitions qua `pgcompat`
- `backend/jewelry_backend/items_routes.py`
  - item CRUD
- `backend/jewelry_backend/catalog_routes.py`
  - kho, nhóm hàng, loại vàng, quầy nhỏ, nhân sự
- `backend/jewelry_backend/cashier_routes.py`
  - thu ngân, sổ quỹ, chốt
- `backend/jewelry_backend/orders_routes.py`
  - đơn hàng
- `backend/jewelry_backend/config_routes.py`
  - cấu hình hệ thống
- `backend/jewelry_backend/loans_routes.py`
  - tài chính/khoản vay
- `backend/jewelry_backend/scale_routes.py`
  - máy cân vàng
- `backend/jewelry_backend/ocr_routes.py`
  - OCR qua Gemini
- `backend/jewelry_backend/upload_routes.py`
  - upload ảnh/chứng từ

### Database layer

- `backend/pgcompat.py`
- `backend/pgcompat_core.py`
- `backend/pgcompat_db.py`
- `backend/pgcompat_session.py`

Khi cần sửa hành vi DB dùng chung, xem cụm này trước.

## Lệnh cần chạy sau mỗi loại thay đổi

### Chỉ sửa frontend UI/logic

```bash
cd frontend
npm run lint
npm run build
```

### Sửa backend route hoặc logic dữ liệu

```bash
cd backend
python smoke_test_jsql.py
python -m py_compile app_jewelry.py
```

Nếu sửa nhiều file backend:

```bash
cd backend
python -m compileall .
```

### Sửa cả frontend và backend

```bash
cd frontend
npm run lint
npm run build
```

```bash
cd backend
python smoke_test_jsql.py
```

## Những điểm dễ gây lỗi

### 1. Encoding tiếng Việt

- repo từng bị mojibake sau refactor
- đặc biệt chú ý `App.jsx`, `CauHinhPage.jsx`, `KeToanPage.jsx`, shared helper và text button
- nếu text hiển thị thành `Ã`, `á»`, `??` thì phải sửa ngay

### 2. API base của frontend

- `frontend/src/lib/api.js` mặc định gọi production khi chạy `localhost`
- trước khi test local có ghi dữ liệu, cần kiểm tra `VITE_API_BASE_URL`

### 3. Helper modules mixed export

Các file sau đang có `/* eslint-disable react-refresh/only-export-components */`:

- `frontend/src/cauhinh/shared.jsx`
- `frontend/src/inventory/shared.jsx`
- `frontend/src/keToan/shared.jsx`
- `frontend/src/mayCanVang/shared.jsx`
- `frontend/src/taiChinh/shared.jsx`
- `frontend/src/sale/SavedScreens.jsx`

Không gỡ suppress này trừ khi đã tách helper và component ra file riêng.

### 4. Route module mới ở backend

Nếu tạo file route mới trong `backend/jewelry_backend/`, phải import nó trong:

- `backend/app_jewelry.py`

Nếu quên import, Flask sẽ không đăng ký endpoint.

### 5. Thay đổi DB/schema

Nếu đổi schema hoặc shape payload backend:

- cập nhật smoke test `backend/smoke_test_jsql.py`
- kiểm tra script migrate `backend/migrate_sqlite_to_jsql.py`
- không phá dữ liệu đang có trên `jsql`

## Ưu tiên refactor tiếp theo

- code-splitting cho bundle frontend lớn
- tiếp tục tách shared helper bị suppress lint
- dọn script cũ trong `backend/` nếu đã chắc chắn không dùng
- gom tài liệu vận hành production nếu cần deploy nhiều máy

## Không nên làm

- không dùng lại SQLite cho runtime
- không thêm ORM khác
- không nhét logic mới vào `App.jsx` nếu đã có module phù hợp
- không sửa nhanh bằng cách tắt ESLint rule toàn cục khi chưa hiểu nguyên nhân
- không giữ lại README/template cũ đã mojibake
