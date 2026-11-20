# rnet-tapo

roomnet client for TP-Link Tapo smart devices: bulbs, light strips, plugs, power strips, hubs, switches, sensors and cameras. See [SUPPORTED_DEVICES.md](SUPPORTED_DEVICES.md) for the device and feature matrix.

| Crate | What it is |
|---|---|
| `rnet-tapo` | the Rust library |
| `rnet-tapo-py` | Python bindings, imported as `rnet_tapo` |
| `rnet-tapo-mcp` | an MCP server that exposes the devices as tools |

## Rust

```toml
[dependencies]
rnet-tapo = { git = "https://github.com/iBz-04/roomnet" }
```

```rust
let device = rnet_tapo::ApiClient::new("<tapo-username>", "<tapo-password>")
    .p110("<device ip address>")
    .await?;

device.on().await?;
```

```bash
export TAPO_USERNAME= TAPO_PASSWORD= IP_ADDRESS=
cargo run --example tapo_l530
```

## Python

```bash
cd rnet-tapo-py
uv sync --group dev --locked
uv run maturin develop
uv run python examples/tapo_p110.py
```

```python
from rnet_tapo import ApiClient

client = ApiClient("<tapo-username>", "<tapo-password>")
device = await client.p110("<device ip address>")
await device.on()
```

## MCP server

See [rnet-tapo-mcp/README.md](rnet-tapo-mcp/README.md).

## Troubleshooting

See [TROUBLESHOOTING.md](TROUBLESHOOTING.md).
