import base64
import datetime
import json
import os
import urllib.request
from decimal import Decimal

from flask import jsonify, request, send_from_directory

from .state import app, db
from .models import *
from .setup import *
from .utils import *

GEMINI_KEY = os.environ.get('GEMINI_API_KEY', '')

@app.route('/api/ocr', methods=['POST'])
def ocr_image():
    if not GEMINI_KEY:
        return jsonify({'error': 'GEMINI_API_KEY chưa được cấu hình trên server'}), 500
    d = request.get_json(force=True, silent=True) or {}

    img_b64  = d.get('image_base64', '')
    mime     = d.get('mime_type', 'image/jpeg')
    if not img_b64:
        return jsonify({'error': 'Không có dữ liệu ảnh'}), 400

    # Gemini 2.0 Flash REST
    payload = {
        "contents": [{
            "parts": [
                {"inline_data": {"mime_type": mime, "data": img_b64}},
                {"text": (
                    "Bạn là công cụ OCR chuyên nghiệp cho chứng từ tài chính/ngân hàng.\n"
                    "Hãy đọc toàn bộ nội dung văn bản trong ảnh này, giữ nguyên cấu trúc bảng/danh sách nếu có.\n"
                    "Trả về nội dung thô, không thêm ghi chú hay giải thích."
                )},
            ]
        }],
        "generationConfig": {"temperature": 0, "maxOutputTokens": 4096}
    }
    url = f'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEMINI_KEY}'
    req = urllib.request.Request(
        url, data=json.dumps(payload).encode(),
        headers={'Content-Type': 'application/json'}, method='POST'
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read())
        text = result['candidates'][0]['content']['parts'][0]['text']
        return jsonify({'text': text})
    except Exception as e:
        return jsonify({'error': f'Gemini error: {str(e)}'}), 500
