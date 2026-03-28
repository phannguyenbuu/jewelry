# Vaan Kim Jewelry Management System

Vaan Kim Jewelry Management System is a full-stack web app for a jewelry store workflow. It combines a desktop admin dashboard, a mobile POS flow, inventory intake with photo upload, and OCR-based label extraction.

## Project Structure

- `frontend/` - React + Vite single-page app with CSS-based UI.
- `backend/` - Flask + SQLAlchemy API server with PostgreSQL persistence, image upload, and Gemini OCR integration.

### Frontend Structure

- `frontend/src/App.jsx` - Main desktop admin shell and route switcher.
- `frontend/src/SalePosMobile.jsx` - Mobile POS experience at `/sale`.
- `frontend/src/CameraOcrPage.jsx` - OCR capture page at `/camera`.
- `frontend/src/lib/api.js` - Shared API base URL helper.

### Backend Structure

- `backend/app_jewelry.py` - Main Flask application and REST API.
- `backend/scale_agent_gp20k.py` - Python polling agent for A&D GP-20K scale.
- `backend/scale_agent_config.example.json` - Example config for the scale agent.
- `backend/requirements-scale-agent.txt` - Agent-only dependencies (`requests`, `pyserial`).
- `backend/uploads/` - Uploaded images served back through the API.
- `backend/instance/` - Local SQLite snapshot used as a migration source / backup.

## Core Flows

### 1. Desktop Admin Dashboard

The desktop dashboard is the main back-office workspace for:

- inventory management
- gold type configuration
- warehouse/counter management
- customer and partner records
- order records
- pricing and configuration screens

### 2. Mobile POS at `/sale`

The `/sale` route is the mobile-first point of sale interface. It is designed for quick touch input and fast store operations.

It supports:

- sales transactions
- purchase transactions
- live total calculation
- quick access to same-day orders
- inventory intake from photos
- backend upload of product photos and metadata

### 3. Gold Scale Agent

The admin dashboard now includes a `Máy cân vàng` tab.

This flow is designed for a machine connected to an A&D GP-20K scale:

1. create or configure a scale agent in the dashboard
2. copy the generated JSON config
3. install and run `backend/scale_agent_gp20k.py` on the Windows machine connected to the scale
4. let the agent heartbeat to the server and poll commands
5. trigger `Đọc ngay` or `Đọc ổn định` from the server UI
6. store returned weight readings in the backend

The main sale screen follows a banking-style layout with:

- a hero header
- quick action tiles
- transaction builder cards
- a compact bottom summary bar

### 3. Inventory Intake

Inventory intake is handled from the mobile POS flow and the OCR page.

Workflow:

1. capture or choose product photos
2. upload images to the backend
3. run OCR to extract label text
4. save the stock item with metadata

### 4. OCR at `/camera`

The OCR flow sends an image to the backend `/api/ocr` endpoint.
The backend uses `GEMINI_API_KEY` and Gemini 2.5 Flash to extract label text.

## API Endpoints

The frontend talks to the backend through a shared API base URL helper.

Common endpoints:

- `GET /api/items`
- `POST /api/items`
- `PUT /api/items/<id>`
- `DELETE /api/items/<id>`
- `GET /api/don_hang`
- `POST /api/don_hang`
- `GET /api/loai_vang`
- `GET /api/nhom_hang`
- `GET /api/quay_nho`
- `POST /api/upload`
- `POST /api/ocr`
- `GET /api/scale/agents`
- `POST /api/scale/agents`
- `POST /api/scale/agents/<id>/read`
- `GET /api/scale/readings`
- `POST /api/scale/agent/heartbeat`
- `GET /api/scale/agent/poll`
- `POST /api/scale/agent/commands/<id>/result`

## Local Development

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Backend

```bash
cd backend
python app_jewelry.py
```

The backend runs on port `5001` by default.
By default it connects to PostgreSQL database `jsql` on `jewelry.n-lux.com` unless `DATABASE_URL` overrides it.

To migrate the local SQLite snapshot into PostgreSQL:

```bash
cd backend
python migrate_sqlite_to_jsql.py
python smoke_test_jsql.py
```

### Scale Agent on the machine connected to GP-20K

```bash
cd backend
python -m pip install -r requirements-scale-agent.txt
copy scale_agent_config.example.json scale_agent_config.json
python scale_agent_gp20k.py --config scale_agent_config.json
```

Recommended default serial settings for GP-20K based on the A&D GP Series manual:

- `2400 bps`
- `7 data bits`
- `Even parity`
- `CRLF`
- `A&D standard format`

## Environment Variables

Set the following environment variable on the backend server:

```bash
GEMINI_API_KEY=your_gemini_api_key
```

Optional backend override:

```bash
DATABASE_URL=postgresql://postgres:myPass@jewelry.n-lux.com/jsql
```

Optional frontend override:

```bash
VITE_API_BASE_URL=https://jewelry.n-lux.com
```

If `VITE_API_BASE_URL` is not set:

- local dev on `localhost` defaults to `https://jewelry.n-lux.com`
- deployed frontend uses same-origin `/api/...` through Nginx

Optional Vite dev proxy override:

```bash
VITE_DEV_API_PROXY_TARGET=https://jewelry.n-lux.com
```

## Deployment Notes

- Build the frontend with `npm run build`.
- Serve the generated `frontend/dist` folder with Nginx.
- Proxy `/api/` requests to the Flask backend on `127.0.0.1:5001`.
- Keep uploaded files writable on the backend server.

## Summary

This repo is organized around a simple split:

- `frontend` for the UI and business workflows
- `backend` for persistence, uploads, and OCR

The sale flow is intentionally fast:

- create a sale
- adjust quantities and rates
- review same-day orders
- intake products into stock from photos
