Tiếp tục trong repo `d:\Dropbox\_Documents\_Vlance_2026\jewelry`.

Không cần review lại codebase từ đầu. Hãy tiếp tục từ trạng thái đã hoàn tất dưới đây.

## Trạng thái hiện tại

Ngày cập nhật gần nhất: `2026-03-30`

Hệ thống đang có 2 phần chính:

- app jewelry:
  - frontend: `frontend/src/*`
  - backend Flask: `backend/jewelry_backend/*`
- vận hành VPS:
  - domain live: `https://jewelry.n-lux.com`
  - backend jewelry chạy local qua `127.0.0.1:5001`
  - nginx reverse proxy nhiều app khác trên cùng VPS

## Những gì đã xong

### 1. `/sale`

Các file đã sửa nhiều vòng:

- `frontend/src/sale/OrderScreen.jsx`
- `frontend/src/sale/PaymentScreen.jsx`
- `frontend/src/sale/printSaleReceipt.js`
- `frontend/src/sale/printPaymentVoucher.js`
- `frontend/src/sale/EasyInvoiceResultModal.jsx`
- `frontend/src/sale/DocumentPreviewModal.jsx`
- `frontend/src/SalePosMobile.jsx`

Các hành vi chính hiện đã đúng:

- tìm khách hàng không cần gõ dấu tiếng Việt
- khi click một kết quả tìm khách, form bị thay thế toàn bộ theo record đã chọn
- khi lưu khách ở `/sale`, nếu tên trống sẽ tự điền mặc định `PHAN NGUYEN BUU`
- nếu trùng tên / CCCD / số điện thoại thì hiện modal xác nhận, chỉ lưu đè khi người dùng chấp nhận
- có rating 5 sao cho khách hàng trong `/sale`
- phần `Thông tin khách hàng` là panel chung
- phần `Hóa đơn đỏ` tách riêng
- phần `Phiếu kê mua hàng` tách riêng
- đơn đổi:
  - vàng mới đi vào hóa đơn đỏ
  - dẻ cũ đi vào phiếu kê mua hàng
- `Phiếu kê mua hàng` không mở lệnh in trình duyệt nữa
  - chỉ tạo PNG preview trong modal
  - có nút tải / copy / gửi agent
- `EasyInvoice` tạo xong sẽ hiện modal kết quả, không tự `window.open` ngay

### 2. EasyInvoice

Đã đổi backend sang logic mới theo ref trong `D:/ref/easyinvoice_project_export_20260330_113227`.

File chính:

- `backend/jewelry_backend/easyinvoice_client.py`
- `backend/jewelry_backend/orders_routes.py`

Luồng hiện tại:

- dùng `api/publish/importInvoice`
- sau đó lookup qua `getInvoicesByIkeys`
- check thêm `checkInvoiceState`
- response trả thêm:
  - `ikey`
  - `invoice_no`
  - `lookup_code`
  - `buyer`
  - `amount`
  - `status_text`

Quan trọng:

- route live là `POST /api/easyinvoice/export`
- trạng thái chứng từ local đang lưu là `Da tao unsigned`

### 3. Agent máy in / máy cân

Tab frontend `Máy cân vàng` đã đổi tên thành `Agent`.

Ý nghĩa tab này hiện tại:

- quản lý agent
- agent nhận lệnh in từ server
- agent nhận dữ liệu máy cân vàng và gửi về server

Các phần chính:

- frontend:
  - `frontend/src/MayCanVangPage.jsx`
  - `frontend/src/inventory/shared.jsx`
  - `frontend/src/mayCanVang/*`
- backend:
  - `backend/jewelry_backend/print_routes.py`
  - `backend/jewelry_backend/scale_routes.py`
  - `backend/device_agent_bundle/device_agent.py`

Đã có:

- `GET /api/device-agent/script`
- `POST /api/print/dispatch-image`
- agent local API `POST /api/print/dispatch`
- agent có CORS mở để dashboard local gọi được

### 4. Ảnh CCCD

Đây là thay đổi mới nhất và quan trọng:

- ảnh CCCD không còn chỉ giữ local/base64 ở frontend
- khi chụp hoặc chọn ảnh CCCD trong `/sale`, frontend upload ngay lên backend server
- state khách hàng giữ URL server
- khi lưu khách hàng, backend lưu luôn:
  - `anh_mat_truoc`
  - `anh_mat_sau`

File chính:

- frontend:
  - `frontend/src/sale/OrderScreen.jsx`
  - `frontend/src/SalePosMobile.jsx`
  - `frontend/src/sale/printPaymentVoucher.js`
- backend:
  - `backend/jewelry_backend/upload_routes.py`
  - `backend/jewelry_backend/orders_routes.py`
  - `backend/jewelry_backend/models.py`
  - `backend/jewelry_backend/setup_base.py`
  - `backend/jewelry_backend/gold_sync.py`

Ghi chú:

- `printPaymentVoucher.js` đã thêm `image.crossOrigin = 'anonymous'` để load ảnh server vào canvas
- `/api/upload` hiện trả cả:
  - `url`
  - `absolute_url`
  - `stored_name`
- `absolute_url` đã được ép trả `https` trên domain public

## Deploy live hiện tại

Đã deploy lên VPS `31.97.76.62`.

Đường dẫn:

- backend: `/var/www/jewelry/backend`
- frontend build: `/var/www/jewelry/dist`

Service:

- `jewelry.service` đang `active`

Frontend live hiện đang chạy bundle:

- `index-BrKrYmEi.js`

Domain live:

- `https://jewelry.n-lux.com`

### Lưu ý deploy rất quan trọng

Không được xóa cả thư mục `/var/www/jewelry/backend` một cách mù quáng.

Lý do:

- service đang dùng virtualenv nằm trong:
  - `/var/www/jewelry/backend/venv`

Nếu xóa cả thư mục backend rồi chép lại nguyên cục, `jewelry.service` sẽ fail `203/EXEC`.

Cách an toàn:

- chỉ copy đè file đã đổi trong `backend/jewelry_backend/`
- hoặc nếu thay cả backend thì phải giữ lại `venv`

## Backup gần nhất

Các backup quan trọng mới nhất:

- deploy trước vòng modal EasyInvoice / agent PNG:
  - `/root/jewelry_deploy_backups/20260330_083647_easyinvoice_agent_modal`
- deploy trước vòng lưu ảnh CCCD lên server:
  - `/root/jewelry_deploy_backups/20260330_133032_cccd_image_server`

## Trạng thái VPS / hardening

Public ingress hiện chỉ còn:

- `22/tcp`
- `80/tcp`
- `443/tcp`

UFW outbound hiện là `deny` mặc định, chỉ allow:

- `22/tcp`
- `53/tcp`
- `53/udp`
- `80/tcp`
- `443/tcp`
- `123/udp`

Các app nội bộ chính đã bind local-only.

## Những file nên đọc đầu tiên nếu làm tiếp

Nếu tiếp tục `/sale`:

- `frontend/src/sale/OrderScreen.jsx`
- `frontend/src/sale/PaymentScreen.jsx`
- `frontend/src/sale/printPaymentVoucher.js`
- `frontend/src/sale/printSaleReceipt.js`
- `frontend/src/SalePosMobile.jsx`

Nếu tiếp tục EasyInvoice / customer / upload:

- `backend/jewelry_backend/orders_routes.py`
- `backend/jewelry_backend/easyinvoice_client.py`
- `backend/jewelry_backend/upload_routes.py`
- `backend/jewelry_backend/models.py`

Nếu tiếp tục agent:

- `backend/device_agent_bundle/device_agent.py`
- `backend/jewelry_backend/print_routes.py`
- `backend/jewelry_backend/scale_routes.py`
- `frontend/src/MayCanVangPage.jsx`

## Việc còn treo / cần test thật

Những phần chưa test end-to-end hoàn chỉnh với thiết bị hoặc tài khoản thật:

1. EasyInvoice thật trên tài khoản doanh nghiệp thật:
   - cần tạo một hóa đơn thật từ `/sale`
   - xác nhận modal hiển thị đúng `ikey`, `invoice_no`, `lookup_code`

2. Phiếu kê mua hàng qua agent thật:
   - cần có agent đang online
   - cần có printer LAN thật
   - xác nhận `POST /api/print/dispatch-image` đi hết hàng đợi

3. Ảnh CCCD:
   - cần chụp mặt trước + mặt sau trên `/sale`
   - lưu khách
   - tìm lại khách
   - xác nhận ảnh vẫn hiện bằng URL server

## Ghi chú môi trường local

Frontend local trên `localhost` đang mặc định gọi production API nếu không set `VITE_API_BASE_URL`.

File liên quan:

- `frontend/src/lib/api.js`

Nghĩa là khi test local:

- rất dễ ghi dữ liệu thật lên production nếu quên env override

## Checklist nhanh cho account mới

1. Đọc file này.
2. Mở các file ưu tiên nêu trên, không cần scan lại cả repo.
3. Nếu deploy:
   - backup trước
   - không xóa mất `backend/venv`
4. Nếu sửa `/sale`:
   - chạy `npm run lint`
   - chạy `npm run build`
5. Nếu sửa backend:
   - chạy `py_compile` các file đã đổi
6. Nếu đụng upload/CCCD:
   - test thật `POST /api/upload`
   - test ảnh trả `https`
