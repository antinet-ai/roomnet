# roomnet watch

roomnet's firmware for the [LilyGO T-Watch S3](https://www.lilygo.cc/products/t-watch-s3): switch the bulb and the plug, and set the bulb's brightness, from your wrist. The watch talks to the roomnet agent over WiFi; it never holds your Tapo account.

## Install

```bash
brew install platformio
```

## Pair the watch with roomnet

1. Make a token and put it in `app/site/devices.env`:

   ```bash
   echo "WATCH_TOKEN=$(openssl rand -hex 32)" >> app/site/devices.env
   ```

2. Copy `src/secrets.example.h` to `src/secrets.h` and fill in your WiFi, the Mac's address on the local network and the same token.
3. Restart roomnet (`app/run.sh`). The agent listens for the watch on port 8788 (`WATCH_PORT`).

The watch's API only switches the bulb and the plug and sets the bulb's brightness. Every request needs the token, and each action shows on roomnet's timeline as "from the watch". The token goes over your WiFi unencrypted, so use this on a network you trust.

## Flash

Plug the watch in over USB-C, wake it with the crown, then:

```bash
pio run -t upload
```

If the upload stops at `No serial data received`, press the crown and run it again.


