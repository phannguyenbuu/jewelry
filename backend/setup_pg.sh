#!/bin/bash
set -e

# Tao database PostgreSQL cho runtime hien tai
su -c "psql -c \"CREATE DATABASE jsql OWNER postgres;\"" postgres 2>/dev/null || echo "Database already exists"
su -c "psql -c \"GRANT ALL PRIVILEGES ON DATABASE jsql TO postgres;\"" postgres
su -c "psql -d jsql -c \"GRANT ALL ON SCHEMA public TO postgres;\"" postgres
echo "PostgreSQL setup done"

# Cai psycopg2
cd /var/www/jewelry/backend
./venv/bin/pip install psycopg2-binary 2>&1 | tail -5
echo "psycopg2 installed"
