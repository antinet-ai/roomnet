#!/usr/bin/env bash
# Creates roomnet's anet site in app/site: the site
# itself, an engineer, the agent's program key bound to this account, the
# vendor-signed decision bundles (inference runtime, sensor-pattern scorer,
# object detector) and the explanation model. Passwords are generated here
# and kept in site/secrets.env, readable by this account only.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
repo="${ANTINET_DIR:?set ANTINET_DIR to an antinet checkout with built release binaries}"
bin="$repo/engine/target/release"
site="$here/site"
openvino="$repo/vendor/openvino-runtime/2026.4.1-macos-arm64"
sensor_model="$repo/models/sensor-pattern"
detector_model="$repo/vendor/vision/data/resource/visionboxresource_x86/models/prod_X86_9275710_YOLOV8_V1.0.0/model.onnx"
explanation_model="$repo/models/bench/qwen3-4b-Q4_K_M.gguf"

for required in "$bin/anet" "$bin/anet-access" "$bin/anet-sign" "$here/import/target/release/rnet-import" \
	"$openvino/runtime" "$sensor_model/model.xml" "$detector_model" "$explanation_model"; do
	[ -e "$required" ] || { echo "missing: $required" >&2; exit 1; }
done
[ -e "$site" ] && { echo "$site exists; remove it to start over" >&2; exit 1; }

mkdir -p "$site/home" "$site/keys" "$site/bundles"
chmod 700 "$site" "$site/home"
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

"$bin/anet-sign" keygen "$site/keys/agent"
"$bin/anet-sign" keygen "$site/keys/vendor"
printf '%s\n' "$admin_password" |
	"$bin/anet-access" program add "$home/access" "${common[@]}" --name home-agent \
		--purpose product --keys "$site/keys/agent/public-key.json"
printf '%s\n' "$admin_password" |
	"$bin/anet-access" binding set "$home/access" "${common[@]}" --name home-agent --uid "$(id -u)"

vendor_key="$site/keys/vendor/signing-key.json"
"$bin/anet-sign" runtime "$openvino" --platform macos-aarch64 --out "$site/bundles/runtime" \
	--key "$vendor_key" --version 1

mkdir "$site/bundles/sensor-pattern"
cp "$sensor_model/model.xml" "$sensor_model/model.bin" "$sensor_model/provenance.json" "$site/bundles/sensor-pattern/"
"$bin/anet-sign" bundle "$site/bundles/sensor-pattern" --key "$vendor_key" --role sensor-pattern \
	--kind base --version 1 --entry model.xml

mkdir "$site/bundles/object-detection"
cp "$detector_model" "$site/bundles/object-detection/model.onnx"
"$bin/anet-sign" bundle "$site/bundles/object-detection" --key "$vendor_key" --role object-detection \
	--kind base --version 1 --entry model.onnx

ANET_HOME_ENGINEER=engineer ANET_HOME_ENGINEER_PASSWORD="$engineer_password" \
	"$here/import/target/release/rnet-import" "$home" "$site/keys/vendor/public-key.json" \
	"$site/bundles/runtime" "$site/bundles/sensor-pattern" "$site/bundles/object-detection"
rm -rf "$site/bundles"

echo "site ready in $home; the explanation model is imported by run.sh once the service is up"
