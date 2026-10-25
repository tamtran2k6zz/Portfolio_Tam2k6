#!/bin/sh
set -eu
for value in "$APP_DB_PASSWORD" "$EXPORTER_DB_PASSWORD"; do
 case "$value" in *[!a-fA-F0-9]*|'') echo "DB passwords must use hex characters" >&2; exit 1;; esac
 [ "${#value}" -ge 32 ] || exit 1
done
MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot <<SQL
CREATE DATABASE portfolio CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'portfolio_app'@'%' IDENTIFIED BY '$APP_DB_PASSWORD';
GRANT SELECT, INSERT, UPDATE, DELETE ON portfolio.* TO 'portfolio_app'@'%';
CREATE USER 'exporter'@'%' IDENTIFIED BY '$EXPORTER_DB_PASSWORD' WITH MAX_USER_CONNECTIONS 3;
GRANT PROCESS, REPLICATION CLIENT, SELECT ON *.* TO 'exporter'@'%';
SQL
MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot portfolio < /docker-entrypoint-initdb.d/schema.txt
