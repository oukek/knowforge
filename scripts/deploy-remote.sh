#!/usr/bin/env bash
set -euo pipefail

deploy_id="${1:?Missing deployment id}"
archive_name="${2:?Missing archive name}"
[[ "$deploy_id" =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]*$ ]]
[[ "$archive_name" =~ ^knowforge-[a-zA-Z0-9.+-]+-deploy\.tar\.gz$ ]]
readonly root=/www/wwwroot/knowforge
incoming="$root/.incoming/$deploy_id"
trap 'rm -rf -- "$incoming"; rmdir "$root/.incoming" 2>/dev/null || true' EXIT

command -v node >/dev/null
command -v npm >/dev/null
node -e 'if (Number(process.versions.node.split(".")[0]) < 24) throw new Error("Node.js 24+ is required")'
cd "$incoming"
sha256sum -c "$archive_name.sha256"
mkdir payload
tar -xzf "$archive_name" --strip-components=1 -C payload
payload="$incoming/payload"
# Never copy an archive's runtime directory onto existing learning data.
rmdir "$payload/runtime"
cd "$payload"
NODE_ENV=production npm ci --omit=dev --no-audit --no-fund

mkdir -p "$root/runtime"
# Install dependencies before updating the live application directory.
# Only replace generated dependencies; preserve databases, .env and other local files.
rm -rf -- "$root/node_modules"
mv "$payload/node_modules" "$root/node_modules"
for entry in "$payload"/*; do
  cp -a "$entry" "$root/"
done

if [[ -s "$incoming/restart-command" ]]; then
  (cd "$root" && bash "$incoming/restart-command") || {
    echo "Backend files updated, but service restart failed." >&2
    exit 1
  }
  command -v curl >/dev/null
  healthy=false
  for _ in {1..20}; do
    if curl --fail --silent --max-time 3 http://127.0.0.1:6666/api/health >/dev/null; then
      healthy=true
      break
    fi
    sleep 1
  done
  if [[ "$healthy" != true ]]; then
    echo "Backend files updated, but health check failed." >&2
    exit 1
  fi
else
  echo "Backend files uploaded. SSH_RESTART_COMMAND is empty; service was not restarted."
fi
printf 'Backend deployed directly to: %s\n' "$root"
