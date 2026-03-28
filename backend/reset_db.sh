#!/bin/bash
set -e
systemctl stop jewelry || true

# Drop & recreate DB
su -c "psql -c 'DROP DATABASE IF EXISTS jsql;'" postgres
su -c "psql -c 'CREATE DATABASE jsql OWNER postgres;'" postgres
su -c "psql -d jsql -c 'GRANT ALL ON SCHEMA public TO postgres;'" postgres
echo "DB recreated"

systemctl start jewelry
sleep 5
systemctl status jewelry --no-pager | head -10
echo "Done"
