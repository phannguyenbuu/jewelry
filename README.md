# Jewelry ERP

Hệ thống quản lý tiệm vàng gồm:

- dashboard desktop cho vận hành nội bộ
- POS mobile tại route `/sale`
- quản lý sản phẩm, thu ngân, kế toán, tài chính, nhập vàng, máy cân
- backend Flask chạy trên PostgreSQL `jsql`

Route `/camera` đã bị loại bỏ. OCR vẫn còn dùng qua các màn nghiệp vụ và API `/api/ocr`, không còn màn standalone riêng.

## Kiến trúc hiện tại

### Frontend

- stack: `React 19 + Vite`
- entry chính: `frontend/src/App.jsx`
- route riêng còn dùng:
  - `/sale` -> `frontend/src/SalePosMobile.jsx`
- các cụm đã tách nhỏ sau refactor:
  - `frontend/src/inventory/` -> màn sản phẩm
  - `frontend/src/cauhinh/` -> tab Cài đặt
  - `frontend/src/keToan/` -> tab Kế toán
  - `frontend/src/taiChinh/` -> tab Tài chính
  - `frontend/src/sale/` -> POS mobile
  - `frontend/src/thuNgan/` -> Thu ngân
  - `frontend/src/mayCanVang/` -> Máy cân vàng
  - `frontend/src/appShell/` -> shell/menu dùng chung
  - `frontend/src/styles/` -> CSS tách theo nhóm

### Backend

- entry runtime: `backend/app_jewelry.py`
- route/service split ở `backend/jewelry_backend/`
- persistence dùng PostgreSQL qua lớp tương thích riêng:
  - `backend/pgcompat.py`
  - `backend/pgcompat_core.py`
  - `backend/pgcompat_db.py`
  - `backend/pgcompat_session.py`
- runtime hiện tại không còn `SQLAlchemy`

## Cấu trúc repo

```text
jewelry/
|- backend/
|  |- app_jewelry.py
|  |- jewelry_backend/
|  |- scale_agent_gp20k.py
|  |- migrate_sqlite_to_jsql.py
|  |- smoke_test_jsql.py
|  `- uploads/
|- frontend/
|  |- src/
|  `- package.json
|- CODEX_GUIDE.md
`- README.md
```

## Các màn chính

- `Sản phẩm`: danh mục sản phẩm, import XLS, ảnh, filter, purge toàn bộ item
- `Thu Ngân`: quản lý quỹ theo từng thu ngân, row chi tiết theo tuổi vàng, chốt và lịch sử
- `Nhập Hàng`: nhập vàng và checklist nhập
- `Đơn Hàng`: đơn mua, bán, trao đổi
- `Nhân Sự`, `Khách Hàng`, `Đối Tác`
- `Kế Toán`: thu chi, chứng từ, báo cáo thuế, cấu hình danh mục
- `Tài Chính`: khoản vay, lịch trả, covenant
- `Máy cân vàng`: agent scale A&D GP-20K
- `Cài Đặt`: tuổi vàng, nhóm hàng, kho, quầy nhỏ, trao đổi, giá vàng

## Chạy local

### 1. Frontend

```bash
cd frontend
npm install
npm run dev
```

Lệnh kiểm tra:

```bash
npm run lint
npm run build
```

### 2. Backend

```bash
cd backend
python -m pip install -r requirements.txt
python app_jewelry.py
```

Backend mặc định chạy cổng `5001`.

## Biến môi trường

### Backend

Ưu tiên `DATABASE_URL`:

```bash
DATABASE_URL=postgresql://postgres:myPass@localhost/jsql
```

Nếu không set `DATABASE_URL`, app sẽ tự ghép từ:

```bash
PGHOST=localhost
PGUSER=postgres
PGPASSWORD=myPass
PGDATABASE=jsql
```

Lưu ý:

- trên máy local không có `/var/www/jewelry`, backend default `PGHOST=jewelry.n-lux.com`
- nếu không muốn local trỏ vào VPS, hãy set `DATABASE_URL` hoặc `PGHOST` rõ ràng

OCR cần:

```bash
GEMINI_API_KEY=your_key
```

### Frontend

```bash
VITE_API_BASE_URL=https://jewelry.n-lux.com
VITE_DEV_API_PROXY_TARGET=https://jewelry.n-lux.com
```

Lưu ý:

- nếu không set `VITE_API_BASE_URL`, frontend chạy trên `localhost` sẽ mặc định gọi API production `https://jewelry.n-lux.com`
- khi deploy cùng domain, frontend dùng same-origin `/api`

## Database

Runtime hiện tại dùng PostgreSQL `jsql`.

### Migrate dữ liệu từ SQLite cũ sang PostgreSQL

```bash
cd backend
python migrate_sqlite_to_jsql.py
```

Script này sẽ:

- đảm bảo DB `jsql` tồn tại
- bootstrap schema PostgreSQL hiện tại
- copy dữ liệu từ snapshot SQLite cũ sang `jsql`

### Smoke test backend

```bash
cd backend
python smoke_test_jsql.py
```

Smoke test hiện cover:

- `items`
- `kho`
- `quay_nho`
- `loai_vang`
- `nhom_hang`
- `thu_ngan`
- `thu_ngan_so_quy`

## Scale agent

Agent cân vàng chạy riêng trên máy Windows có kết nối cân:

```bash
cd backend
python -m pip install -r requirements-scale-agent.txt
copy scale_agent_config.example.json scale_agent_config.json
python scale_agent_gp20k.py --config scale_agent_config.json
```

Luồng hoạt động:

1. tạo/cấu hình agent trong UI
2. chạy agent ở máy gắn cân
3. agent heartbeat và poll lệnh từ server
4. UI gọi đọc cân và nhận lại kết quả

## Kiểm tra chất lượng

### Frontend

```bash
cd frontend
npm run lint
npm run build
```

Trạng thái hiện tại:

- ESLint sạch
- build pass
- vẫn còn warning chunk lớn hơn `500 kB` từ Vite

### Backend

```bash
cd backend
python smoke_test_jsql.py
python -m py_compile app_jewelry.py
```

## Ghi chú vận hành

- `backend/uploads/` phải writable trên server
- `frontend/README.md` chỉ là note ngắn, tài liệu chính nằm ở file này
- nếu thêm route backend mới theo module, nhớ import module đó trong `backend/app_jewelry.py`
- nếu thay đổi schema/runtime DB, cập nhật cả script migrate và smoke test

## Tài liệu cho Codex

Xem thêm `CODEX_GUIDE.md` để biết:

- map module
- lệnh test theo loại thay đổi
- quy ước refactor hiện tại
- các điểm cần tránh khi sửa repo này
