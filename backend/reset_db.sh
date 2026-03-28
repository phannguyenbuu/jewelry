#!/bin/bash
set -e
systemctl stop jewelry || true

# Drop & recreate DB
su -c "psql -c 'DROP DATABASE IF EXISTS jewelry_db;'" postgres
su -c "psql -c 'CREATE DATABASE jewelry_db OWNER jewelry_user;'" postgres
su -c "psql -d jewelry_db -c 'GRANT ALL ON SCHEMA public TO jewelry_user;'" postgres
echo "DB recreated"

systemctl start jewelry
sleep 5
systemctl status jewelry --no-pager | head -10
echo "Done"
