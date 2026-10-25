# @fireanon/i-hear-you

Bundled Supertonic TTS engine for pi talk mode. Spawns a local Supertonic
server from inside the pi process so `talk` mode works without a separate
`supertonic.service`. Bundled voices: **M1** and **F1** only.

## Install

```
pi install npm:@fireanon/i-hear-you
```

## What it does

On `session_start`, the extension:

1. Installs the bundled `M1.json` and `F1.json` voice styles into the Supertonic
   voice-styles directory (`~/.cache/supertonic3/voice_styles/` by default).
2. Spawns `supertonic serve --host 127.0.0.1 --port 7788 --model supertonic-3`.
3. Waits for `GET /v1/health` to return OK.

The existing `talk` extension (POST `/v1/tts`, GET `/v1/styles`) then talks to
this bundled engine automatically — no `systemctl --user start supertonic`
required.

## Commands

| Command | What it does |
|---------|--------------|
| `/supertonic` | Engine status (port, model, voices loaded) |
| `/supertonic voices` | List available voice styles (M1, F1, plus any built-ins) |

## Env overrides

| Variable | Default | Purpose |
|----------|---------|---------|
| `PI_SUPERTONIC_BIN` | `~/.local/share/supertonic-tts/venv/bin/supertonic` | Path to the `supertonic` executable |
| `PI_SUPERTONIC_PORT` | `7788` | HTTP port for the local server |
| `PI_SUPERTONIC_MODEL` | `supertonic-3` | Model name to load |
| `SUPERTONIC_CACHE_DIR` | `~/.cache/supertonic3` | Model cache dir (ONNX files + voice_styles) |

## Voices

Only **M1** and **F1** are bundled, per operator request. Other voices (F4,
F5, AG, PG, etc.) are not included. Add additional voices by placing their
`.json` style files in `$SUPERTONIC_CACHE_DIR/voice_styles/`.

## Creator

FireAnon
