#!/bin/bash
set -e
# Tạo user + database PostgreSQL
su -c "psql -c \"CREATE USER jewelry_user WITH PASSWORD 'jewelry2026';\"" postgres 2>/dev/null || echo "User already exists"
su -c "psql -c \"CREATE DATABASE jewelry_db OWNER jewelry_user;\"" postgres 2>/dev/null || echo "DB already exists"
su -c "psql -c \"GRANT ALL PRIVILEGES ON DATABASE jewelry_db TO jewelry_user;\"" postgres
su -c "psql -d jewelry_db -c \"GRANT ALL ON SCHEMA public TO jewelry_user;\"" postgres
echo "PostgreSQL setup done"

# Cài psycopg2
cd /var/www/jewelry/backend
./venv/bin/pip install psycopg2-binary 2>&1 | tail -5
echo "psycopg2 installed"
