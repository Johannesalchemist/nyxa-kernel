#!/usr/bin/env bash
# WP5 prepared fix (NOT executed). Root on Server B. Moves avatar.future24.eu Apache logs from the
# filesystem root into ${APACHE_LOG_DIR}, where Debian's /etc/logrotate.d/apache2 rotates *.log.
# Reversible: backups of both vhost files are kept; old logs are archived, never deleted.
set -euo pipefail
SA=/etc/apache2/sites-available; TS=$(date -u +%Y%m%dT%H%M%SZ)
[[ $EUID == 0 && $(hostname) == ubuntu-4gb-nbg1-1 ]] || { echo HOLD: root on Server B required; exit 2; }
grep -q '^/var/log/apache2/\*\.log' /etc/logrotate.d/apache2 || { echo "HOLD: apache logrotate glob not found"; exit 3; }
for f in avatar.future24.eu.conf avatar.future24.eu-le-ssl.conf; do
  cp -p "$SA/$f" "$SA/$f.pre-logfix-$TS"
  sed -i -e 's#ErrorLog /avatar_error.log#ErrorLog ${APACHE_LOG_DIR}/avatar-error.log#' \
         -e 's#CustomLog /avatar_access.log combined#CustomLog ${APACHE_LOG_DIR}/avatar-access.log combined#' "$SA/$f"
done
if ! apachectl configtest; then
  for f in avatar.future24.eu.conf avatar.future24.eu-le-ssl.conf; do cp -p "$SA/$f.pre-logfix-$TS" "$SA/$f"; done
  echo "ROLLED_BACK: configtest failed"; exit 1
fi
systemctl reload apache2
sleep 2
install -d -m 0750 -o root -g adm /var/log/apache2/archive
for l in /avatar_access.log /avatar_error.log; do
  [[ -f $l ]] && { gzip -c "$l" > "/var/log/apache2/archive/$(basename "$l" .log)-pre-$TS.log.gz" && : > "$l"; }
done
echo "Old root-level files are now empty and kept until the operator removes them explicitly."
echo "AVATAR_LOGFIX=OK ($TS). Rollback: restore $SA/*.pre-logfix-$TS and 'systemctl reload apache2'."
