# Troubleshooting

**Where are the logs?**
Both servers log to the terminal they run in and to `logs/model_server.log` and `logs/web_app.log` in the project folder. Follow them live with `tail -f logs/model_server.log logs/web_app.log`, and set `LOG_LEVEL=DEBUG` in `.env` (then restart both servers) for more detail. Most errors below leave a line there that says why. See [logging.md](logging.md).

**The page says the UI is not built**
Run `cd frontend && npm ci && npm run build` (or `make build`), then reload.

**The result says the model server is not running**
Start it in its own terminal with `make model-server` (`uv run python backend/model_server.py`), and keep it running alongside the web app.

**A model can't be selected**
It isn't downloaded yet. Open the model dialog (**Change**), press **Download**, and wait for its progress bar to finish. If the download is refused for space, free the amount it asks for. FLUX.1-dev needs `HF_TOKEN` in `.env`, and the Civitai add-ons need `CIVITAI_TOKEN`; **Download** says so when one is missing.

**A model or add-on is missing from the list**
Adult models, purposes and add-ons are hidden while adult content is locked: `ADULT_CONTENT=off` in `.env`, or the browser's hidden-word lock is on. See [safety.md](safety.md).

**The first start takes a long time**
The first start downloads Z-Image-Turbo (about 33 GB) and builds its 8-bit copy. It only happens once.

**A first run or a build was interrupted**
Builds are written to a `.building` folder and renamed when complete, so an interrupted build is redone on the next start. Delete any leftover `*.building` folder in `models/` if you want the space back.

**Rendering is very slow**
Close other memory-hungry apps; the models need most of a 24 GB Mac's memory. Check that Z-Image-Turbo isn't set to `Z_IMAGE_BITS=original`, which swaps on a 24 GB Mac. Chatting with the local model during a render also slows both, since they share the GPU. See [Performance](performance.md).

**The chat tab is greyed out**
No chat is set up. For Grok, set `XAI_API_KEY` in `.env`; for a local model, set `CHAT_PROVIDER=ollama` and `OLLAMA_MODEL`. Then restart the web app. The tab is also off while an A/B test runs.

**"Ollama is not running: start it with brew services start ollama"**
Ollama isn't answering at `OLLAMA_URL` (`http://127.0.0.1:11434` by default). Install it if needed (`brew install ollama`), then start it with `brew services start ollama`.

**"The chat model … is not downloaded: run ollama pull …"**
The model named in `OLLAMA_MODEL` isn't in Ollama. Download it with `ollama pull <model>` (for example `ollama pull hf.co/mlabonne/gemma-3-4b-it-abliterated-GGUF:Q4_K_M`). `ollama list` shows the models you have; `OLLAMA_MODEL` must match a name there exactly.

**"This question was refused by the safety check"**
Adult content is locked (`ADULT_CONTENT=off`, or the browser's lock is on), and Laya found the question asks for nudity or a sexual act. The question was saved but never sent to the chat model. Rephrase it, or, if adult content is allowed on this Mac, unlock it with the hidden word. If clothed questions are refused too often, raise `DECISION_NUDITY_REFUSE_AT` a little (default `0.52`). See [decision-model.md](decision-model.md).

**"The safety check is unavailable, try again"**
Laya could not load or answer, so the locked chat question was refused (the check fails closed). To find out why:

1. Look in `logs/web_app.log` for the lines with the trace id. The browser gets it in the `X-Decision-Trace-Id` header of the failed request (the browser's network tab shows it); the log line reads `[<trace id>] Laya could not load (…)` or `Laya could not answer (…)`, with the full error after it.
2. Check `models/laya/`: it must hold `model.safetensors`, `rl_agent_config.json`, `tokenizer/`, `encoder/` and a `.download-complete` marker. If the download was interrupted or the folder is damaged, delete `models/laya/` and ask again: it downloads once more (about 800 MB, so the first question needs a connection).
3. Check `DECISION_MODEL` in `.env` is `on` (the default). With `off`, Laya never runs and locked chat questions are not checked at all; `POST /api/decide` then answers "The decision model is turned off".

**No notification when a render finishes**
The browser asks for permission the first time you press Generate. If you declined, allow notifications for the app's address in your browser's site settings; the tab title still changes either way.

**"The start image is no longer in History"**
The image a variation starts from was deleted. Remove the start image (× in Create) or pick another one with **Make variations**.

**The app on a phone or another computer doesn't load**
By default the web app only answers on this Mac (`APP_HOST=127.0.0.1`). To open it from a phone on the same Wi-Fi, set `APP_HOST=0.0.0.0` in `.env`, restart the web app and open `http://<the Mac's address>:7860`; or keep the default and use Tailscale (see [Use it on your phone](usage.md#use-it-on-your-phone)). The app has no login, so only do this on a trusted network.
