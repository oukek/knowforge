#!/usr/bin/env bash
set -Eeuo pipefail
stage="validate remote deployment arguments"
trap 'status=$?; echo "Remote deployment failed during: $stage (line $LINENO, exit $status)." >&2; exit "$status"' ERR

deploy_id="${1:?Missing deployment id}"
archive_name="${2:?Missing archive name}"
[[ "$deploy_id" =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]*$ ]]
[[ "$archive_name" =~ ^knowforge-[a-zA-Z0-9.+-]+-deploy\.tar\.gz$ ]]
readonly root=/www/wwwroot/knowforge
incoming="$root/.incoming/$deploy_id"
trap 'rm -rf -- "$incoming"; rmdir "$root/.incoming" 2>/dev/null || true' EXIT

stage="check server Node.js, npm and system tools"
echo "[remote] $stage"
for tool in node npm tar sha256sum; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "Missing server command: $tool. It must be available in the non-interactive SSH PATH. Install Node.js 24+ and npm or configure their executable directory in the SSH account's PATH." >&2
    exit 1
  fi
done
node -e 'if (Number(process.versions.node.split(".")[0]) < 24) throw new Error("Node.js 24+ is required")'
stage="verify uploaded archive checksum"
echo "[remote] $stage"
cd "$incoming"
sha256sum -c "$archive_name.sha256"
stage="extract server runtime"
echo "[remote] $stage"
mkdir payload
tar -xzf "$archive_name" --strip-components=1 -C payload
payload="$incoming/payload"
# Never copy an archive's runtime directory onto existing learning data.
rmdir "$payload/runtime"
cd "$payload"
stage="install production dependencies"
echo "[remote] $stage"
NODE_ENV=production npm ci --omit=dev --no-audit --no-fund

stage="update application files in /www/wwwroot/knowforge"
echo "[remote] $stage"
mkdir -p "$root/runtime"
# Install dependencies before updating the live application directory.
# Only replace generated dependencies; preserve databases, .env and other local files.
rm -rf -- "$root/node_modules"
mv "$payload/node_modules" "$root/node_modules"
# Replace generated runtime directories so obsolete source files/chunks do not linger.
for directory in server data resources; do
  if [[ -d "$payload/$directory" ]]; then
    rm -rf -- "$root/$directory"
    mv "$payload/$directory" "$root/$directory"
  fi
done
# These application-owned directories belonged to the old full-stack package.
# Personal data and local configuration live in runtime/ and .env, never here.
rm -rf -- "$root/dist" "$root/client" "$root/shared" "$root/docs" "$root/examples"
rm -f -- "$root/README.md"
for entry in "$payload"/*; do
  cp -a "$entry" "$root/"
done

if [[ -s "$incoming/restart-command" ]]; then
  stage="restart application service"
  echo "[remote] $stage"
  (cd "$root" && bash "$incoming/restart-command") || {
    echo "Backend files updated, but service restart failed." >&2
    exit 1
  }
  stage="check backend health on port 6666"
  echo "[remote] $stage"
  if ! command -v curl >/dev/null 2>&1; then
    echo "Missing server command: curl (required for the health check)." >&2
    exit 1
  fi
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
