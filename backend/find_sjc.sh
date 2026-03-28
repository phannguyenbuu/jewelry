#!/bin/bash
# Lấy JS goldprice và tìm API endpoint
curl -s 'https://sjc.com.vn/Data/Sites/1/skins/default/js/goldprice.js?v=3.0.1' | grep -o 'url[^;]*' | head -15
