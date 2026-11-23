# roomnet 

roomnet runs a home or small site on [antinet](https://github.com/antinet-ai/antinet): local device control, local models, nothing in the cloud.

| Folder | What it is |
|---|---|
| `tapo/` | `rnet-tapo`: Rust client for TP-Link Tapo plugs, bulbs, strips, hubs, sensors and cameras |
| `mercusys/` | `rnet_mercusys`: Python client for Mercusys and Tapo cameras 
| `app/` | the roomnet app: the agent, the screen and the site setup on top of anet |

## Run the app

The app runs on anet's public release: `setup-site.sh` downloads the engine and Antinet's signed models from [antinet-ai/anet](https://github.com/antinet-ai/anet/releases), checks each against the release's SHA-256 list and its Sigstore signature, creates the site in `app/site` and imports the models. It needs `curl`, `tar`, `openssl`, [`cosign`](https://docs.sigstore.dev/cosign/system_config/installation/), `uv` and Node 22, on Linux (x86-64, arm64) or macOS (Apple silicon).

```bash
app/setup-site.sh
cp app/devices.env.example app/site/devices.env  
app/run.sh
```

Open http://127.0.0.1:3000.

## Checks

```bash
(cd tapo && cargo test)
(cd mercusys && uv run --locked pytest)
(cd app/agent && uv run --locked pytest)
```
