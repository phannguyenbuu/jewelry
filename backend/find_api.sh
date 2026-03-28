#!/bin/bash
# Tìm SJC API endpoint từ JS files
curl -s 'https://sjc.com.vn/' | grep -o 'src="[^"]*\.js[^"]*"' | head -10

# Thử api nội bộ SJC
echo "=== Testing SJC endpoints ==="
curl -s -o /dev/null -w "%{http_code}" 'https://sjc.com.vn/Handlers/GoldPriceService.ashx' && echo " /Handlers/GoldPriceService.ashx"
curl -s -o /dev/null -w "%{http_code}" 'https://sjc.com.vn/giavang/ajax-show-table-price' && echo " /giavang/ajax-show-table-price"

# Lấy giá từ tygiavang.net  
echo "=== tygiavang.net ==="
curl -s 'https://tygiavang.net/api/sjc-gia-vang' 2>&1 | head -c 300

echo ""
echo "=== investing.com proxy ==="
curl -s 'https://vn.investing.com/api/golds/?currency=VND' -H 'User-Agent: Mozilla/5.0' 2>&1 | head -c 300
