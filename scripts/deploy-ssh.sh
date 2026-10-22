#!/usr/bin/env bash
set -Eeuo pipefail
stage="validate deployment configuration"
trap 'status=$?; echo "SSH deployment failed during: $stage (line $LINENO, exit $status)." >&2; exit "$status"' ERR

for key in SSH_HOST SSH_USERNAME SSH_PASSWORD DEPLOY_ARCHIVE DEPLOY_UPLOAD_ID; do
  if [[ -z "${!key:-}" ]]; then
    echo "Missing SSH deployment configuration: $key" >&2
    exit 1
  fi
done
port="${SSH_PORT:-22}"
[[ "$port" =~ ^[0-9]+$ && "$port" -ge 1 && "$port" -le 65535 ]]
[[ "$SSH_HOST" =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]*$ ]]
[[ "$SSH_USERNAME" =~ ^[a-zA-Z_][a-zA-Z0-9_.-]*$ ]]
[[ "$DEPLOY_UPLOAD_ID" =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]*$ ]]
archive_name="$(basename "$DEPLOY_ARCHIVE")"
[[ "$archive_name" =~ ^knowforge-[a-zA-Z0-9.+-]+-deploy\.tar\.gz$ ]]
[[ -f "$DEPLOY_ARCHIVE" && -f "$DEPLOY_ARCHIVE.sha256" ]]

scratch="$(mktemp -d)"
trap 'rm -rf -- "$scratch"' EXIT
chmod 700 "$scratch"
touch "$scratch/known_hosts"
printf '%s' "${SSH_RESTART_COMMAND:-}" > "$scratch/restart-command"
chmod 600 "$scratch/known_hosts" "$scratch/restart-command"
export SSHPASS="$SSH_PASSWORD"
destination="$SSH_USERNAME@$SSH_HOST"
options=(-o "UserKnownHostsFile=$scratch/known_hosts" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=20 -o ServerAliveInterval=30 -o ServerAliveCountMax=6)
incoming="/www/wwwroot/knowforge/.incoming/$DEPLOY_UPLOAD_ID"

stage="create upload directory on server"
echo "[SSH 1/3] $stage"
sshpass -e ssh "${options[@]}" -p "$port" "$destination" "mkdir -p '$incoming'"
stage="upload archive, checksum and restart configuration"
echo "[SSH 2/3] $stage"
sshpass -e scp "${options[@]}" -P "$port" \
  "$DEPLOY_ARCHIVE" "$DEPLOY_ARCHIVE.sha256" "$scratch/restart-command" "$destination:$incoming/"
stage="run remote dependency checks and deployment"
echo "[SSH 3/3] $stage"
sshpass -e ssh "${options[@]}" -p "$port" "$destination" \
  "bash -s -- '$DEPLOY_UPLOAD_ID' '$archive_name'" < scripts/deploy-remote.sh
