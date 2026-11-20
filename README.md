# roomnet (rnet)

roomnet runs a home or small site on [antinet](https://github.com/antinet-ai/antinet): local device control, local models, nothing in the cloud.

| Folder | What it is |
|---|---|
| `tapo/` | `rnet-tapo`: Rust client for TP-Link Tapo plugs, bulbs, strips, hubs, sensors and cameras, with Python bindings (`rnet_tapo`) and an MCP server (`rnet-tapo-mcp`) |
| `mercusys/` | `rnet_mercusys`: Python client for Mercusys and Tapo cameras (control, presets, recordings, streams) |
| `app/` | the roomnet app: the agent, the screen and the site setup on top of anet |

## Run the app

The app needs an antinet checkout with release binaries built (`anet`, `anet-access`, `anet-sign`).

```bash
export ANTINET_DIR=~/Desktop/antinet
(cd app/import && cargo build --release)
app/setup-site.sh
cp app/devices.env.example app/site/devices.env   # fill it in
app/run.sh
```

Open http://127.0.0.1:3000.

## Checks

```bash
(cd tapo && cargo test)
(cd mercusys && uv run --locked pytest)
(cd app/agent && uv run --locked pytest)
```
