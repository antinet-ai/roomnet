#!/usr/bin/env bash
# Runs the anet service on roomnet's site, trusting anet's models key for the
# three model roles roomnet uses and nothing else (setup-site.sh, run.sh).
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
site="$here/site"
exec "$site/engine/anet" serve --home "$site/home" --socket "$site/run/anet.sock" \
	--vendor-keys "$site/keys/antinet-models-key.json=inference-runtime,sensor-pattern,object-detection" \
	--memory-mib 9216
