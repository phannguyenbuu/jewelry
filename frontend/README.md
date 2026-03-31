# Frontend Note

Frontend này là phần UI của repo `jewelry`.

Tài liệu chính đã chuyển về:

- `../README.md`
- `../CODEX_GUIDE.md`

Lệnh dùng nhanh:

```bash
npm install
npm run dev
npm run lint
npm run build
```

Lưu ý:

- local frontend giờ dùng relative `/api`; Vite dev proxy mặc định trỏ tới `https://jewelry.n-lux.com`
- nếu muốn dev frontend bắn sang backend local hay backend khác, set `VITE_DEV_API_PROXY_TARGET`
- nếu muốn override tuyệt đối API base ở client, set `VITE_API_BASE_URL`
