#!/usr/bin/env bash
# Starts roomnet: the anet service on its site, the agent and the
# screen at http://127.0.0.1:3000. Ctrl-C stops all three.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
repo="${ANTINET_DIR:?set ANTINET_DIR to an antinet checkout with built release binaries}"
site="$here/site"
socket="$site/run/anet.sock"

[ -f "$site/secrets.env" ] || { echo "run setup-site.sh first" >&2; exit 1; }
[ -f "$site/devices.env" ] || { echo "copy devices.env.example to site/devices.env and fill it in" >&2; exit 1; }
# devices.env is read by the agent itself, literally: sourcing it here would
# expand a `$` in a password.
set -a
source "$site/secrets.env"
set +a
export HOME_SITE_DIR="$site"

children=()
stop() { kill "${children[@]}" 2>/dev/null || true; }
trap stop EXIT INT TERM

if [ ! -S "$socket" ]; then
	mkdir -p "$site/run" && chmod 700 "$site/run"
	"$repo/engine/target/release/anet" serve --home "$site/home" --socket "$socket" \
		--vendor-keys "$site/keys/vendor/public-key.json=inference-runtime,sensor-pattern,object-detection" \
		--memory-mib 9216 >>"$site/serve.log" 2>&1 &
	children+=($!)
	for _ in $(seq 1 50); do [ -S "$socket" ] && break; sleep 0.2; done
	[ -S "$socket" ] || { echo "anet did not start; see $site/serve.log" >&2; exit 1; }
fi

if [ ! -f "$here/web/.next/BUILD_ID" ]; then
	(cd "$here/web" && npm ci --no-audit --no-fund && npx next build)
fi

(cd "$here/agent" && exec uv run --locked rnet-agent) &
agent=$!
children+=($agent)
# The agent checks its settings and reaches anet before it listens; a
# failure there ends the run here with its own message, not later as proxy
# errors from the screen.
for _ in $(seq 1 100); do
	kill -0 "$agent" 2>/dev/null || { echo "the agent stopped; its message is above" >&2; exit 1; }
	nc -z 127.0.0.1 "${HOME_AGENT_PORT:-8787}" 2>/dev/null && break
	sleep 0.3
done
(cd "$here/web" && exec npx next start --hostname 127.0.0.1 --port 3000) &
children+=($!)
echo "open http://127.0.0.1:3000"
# bash 3.2 on macOS has no `wait -n`: stop everything once any part stops.
while kill -0 "${children[@]}" 2>/dev/null; do sleep 1; done
for child in "${children[@]}"; do
	kill -0 "$child" 2>/dev/null || echo "a part of roomnet stopped (pid $child); stopping the rest" >&2
done
