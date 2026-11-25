# rnet_mercusys

roomnet's Python client for Mercusys and Tapo cameras on the local network.

## Install

```bash
uv sync --locked
```

## Use

```python
from rnet_mercusys import Tapo

tapo = Tapo("<camera ip>", "<camera user>", "<camera password>")
print(tapo.getBasicInfo())
```

Make the camera user in the app under **Advanced Settings > Camera Account**.

If that login fails, use `admin` and your TP-Link account password.

## Recordings

```bash
HOST= PASSWORD_CLOUD= OUTPUT= DATE=20230221 uv run python experiments/DownloadRecordings.py
```

Needs `ffmpeg`.

## Tests

```bash
export RNET_MERCUSYS_IP= RNET_MERCUSYS_USER= RNET_MERCUSYS_PASSWORD=
uv run --locked pytest
```

The tests move the camera and change its settings, then put them back.
