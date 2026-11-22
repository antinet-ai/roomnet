#!/usr/bin/env bash
# Creates roomnet's anet site in app/site from anet's public release page:
# the engine, anet-sign and the signed models (inference runtime,
# sensor-pattern scorer, object detector), each checked against the page's
# SHA-256 list and its Sigstore signature from anet's release workflow; then
# the site itself, an engineer and an operator, the agent's program key bound
# to this account, the three models imported over the service, and the
# explanation model from Hugging Face at a pinned digest. Passwords are
# generated here and kept in site/secrets.env, readable by this account only.
#
#   app/setup-site.sh
#
# Needs curl, tar, openssl and cosign (https://docs.sigstore.dev/cosign/system_config/installation/).
set -euo pipefail

release=2
public_repository="antinet-ai/anet"
signer_identity="https://github.com/antinet-ai/antinet/.github/workflows/release.yml@refs/tags/release-$release"
signer_issuer="https://token.actions.githubusercontent.com"
explanation_url="https://huggingface.co/Qwen/Qwen3-4B-GGUF/resolve/bc640142c66e1fdd12af0bd68f40445458f3869b/Qwen3-4B-Q4_K_M.gguf"
explanation_sha256="7485fe6f11af29433bc51cab58009521f205840f5b4ae3a32fa7f92e8534fdf5"
explanation_name="qwen3-4b"

here="$(cd "$(dirname "$0")" && pwd)"
site="$here/site"
fail() { echo "setup-site.sh: $*" >&2; exit 1; }

for tool in curl tar openssl cosign; do
	command -v "$tool" >/dev/null || fail "$tool is not installed"
done
case "$(uname -s)-$(uname -m)" in
	Linux-x86_64) platform=linux-x86_64 ;;
	Linux-aarch64 | Linux-arm64) platform=linux-aarch64 ;;
	Darwin-arm64) platform=macos-aarch64 ;;
	*) fail "anet has no release for $(uname -s) $(uname -m)" ;;
esac
[ -e "$site" ] && fail "$site exists; remove it to start over"

sha256_of() {
	if command -v sha256sum >/dev/null; then sha256sum "$1" | cut -d' ' -f1; else shasum -a 256 "$1" | cut -d' ' -f1; fi
}

mkdir -p "$site/downloads" "$site/keys" "$site/models" "$site/tools" "$site/run"
chmod 700 "$site" "$site/run"
downloads="$site/downloads"
page="https://github.com/$public_repository/releases/download/release-$release"

curl -fsSL --retry 3 -o "$downloads/SHA256SUMS" "$page/SHA256SUMS"
# Downloads a release asset and its Sigstore bundle, checks the asset's
# SHA-256 against the page's list and its signature against anet's release
# workflow for this release's tag.
fetch_signed() {
	local name="$1"
	curl -fsSL --retry 3 -o "$downloads/$name" "$page/$name"
	curl -fsSL --retry 3 -o "$downloads/$name.sigstore.json" "$page/$name.sigstore.json"
	if [ "$name" != antinet-models-key.json ]; then
		local listed
		listed="$(awk -v name="$name" '$2 == name { print $1 }' "$downloads/SHA256SUMS")"
		[ -n "$listed" ] || fail "$name is not in the release's SHA256SUMS"
		[ "$(sha256_of "$downloads/$name")" = "$listed" ] || fail "$name does not match its SHA-256 in SHA256SUMS"
	fi
	cosign verify-blob "$downloads/$name" --bundle "$downloads/$name.sigstore.json" \
		--certificate-identity "$signer_identity" --certificate-oidc-issuer "$signer_issuer" >/dev/null 2>&1 ||
		fail "$name is not signed by anet's release workflow for release $release"
}

fetch_signed "anet-$release-$platform.tar.gz"
fetch_signed "anet-sign-$release-$platform.tar.gz"
fetch_signed antinet-models-key.json
models=("inference-runtime-$platform" sensor-pattern object-detection)
for model in "${models[@]}"; do
	fetch_signed "anet-models-$release-$model.tar.gz"
done

tar -C "$site" -xzf "$downloads/anet-$release-$platform.tar.gz"
mv "$site/anet-$release-$platform" "$site/engine"
tar -C "$downloads" -xzf "$downloads/anet-sign-$release-$platform.tar.gz"
mv "$downloads/anet-sign-$release-$platform/anet-sign" "$site/tools/anet-sign"
for model in "${models[@]}"; do
	tar -C "$site/models" -xzf "$downloads/anet-models-$release-$model.tar.gz"
done
cp "$downloads/antinet-models-key.json" "$site/keys/antinet-models-key.json"
bin="$site/engine"
anet_sign="$site/tools/anet-sign"

curl -fsSL --retry 3 -o "$downloads/$explanation_name.gguf" "$explanation_url"
[ "$(sha256_of "$downloads/$explanation_name.gguf")" = "$explanation_sha256" ] ||
	fail "the explanation model does not match its pinned SHA-256"

home="$site/home"
admin_password="$(openssl rand -hex 24)"
engineer_password="$(openssl rand -hex 24)"
operator_password="$(openssl rand -hex 24)"
umask 077
cat >"$site/secrets.env" <<EOF
ANET_HOME_ADMIN=admin
ANET_HOME_ADMIN_PASSWORD=$admin_password
ANET_HOME_ENGINEER=engineer
ANET_HOME_ENGINEER_PASSWORD=$engineer_password
ANET_HOME_OPERATOR=operator
ANET_HOME_OPERATOR_PASSWORD=$operator_password
EOF

printf '%s\n%s\n' "$admin_password" "$admin_password" |
	"$bin/anet" setup --home "$home" --admin admin >"$site/initial-keys.txt"

common=(--log-dir "$home/log" --site-key-file "$home/site.key" --as admin)
printf '%s\n%s\n%s\n' "$admin_password" "$engineer_password" "$engineer_password" |
	"$bin/anet-access" person add "$home/access" "${common[@]}" --name engineer \
		--role Engineer --role ConfigureAdmin
printf '%s\n%s\n%s\n' "$admin_password" "$operator_password" "$operator_password" |
	"$bin/anet-access" person add "$home/access" "${common[@]}" --name operator --role Operator

"$anet_sign" keygen "$site/keys/agent"
printf '%s\n' "$admin_password" |
	"$bin/anet-access" program add "$home/access" "${common[@]}" --name home-agent \
		--purpose product --keys "$site/keys/agent/public-key.json"
printf '%s\n' "$admin_password" |
	"$bin/anet-access" binding set "$home/access" "${common[@]}" --name home-agent --uid "$(id -u)"

# The models go in through the running service, as the engineer.
socket="$site/run/anet.sock"
"$here/serve.sh" >>"$site/serve.log" 2>&1 &
serve=$!
trap 'kill "$serve" 2>/dev/null || true' EXIT
for _ in $(seq 1 50); do [ -S "$socket" ] && break; sleep 0.2; done
[ -S "$socket" ] || fail "anet did not start; see $site/serve.log"
for model in "${models[@]}"; do
	printf '%s\n' "$engineer_password" |
		"$bin/anet" import "$site/models/anet-models-$release-$model" --as engineer --socket "$socket"
done
printf '%s\n' "$engineer_password" |
	"$bin/anet" import "$downloads/$explanation_name.gguf" --name "$explanation_name" --version 1 \
		--as engineer --socket "$socket"
kill "$serve"
wait "$serve" 2>/dev/null || true
trap - EXIT
rm -rf "$downloads" "$site/models"

echo "site ready in $home; start roomnet with app/run.sh"
