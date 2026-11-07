# Troubleshooting

**The page says the UI is not built**
Run `cd frontend && npm ci && npm run build`, then reload.

**The result says the model server is not running**
Start it in its own terminal with `uv run python backend/model_server.py`, and keep it running alongside `main.py`.

**A model can't be selected**
It isn't downloaded yet. Open the model dialog (**Change**), press **Download**, and wait for its progress bar to finish. If the download is refused for space, free the amount it asks for.

**The first start takes a long time**
The first start downloads Z-Image-Turbo (about 33 GB) and builds its 8-bit copy. It only happens once.

**A first run or a build was interrupted**
Builds are written to a `.building` folder and renamed when complete, so an interrupted build is redone on the next start. Delete any leftover `*.building` folder in `models/` if you want the space back.

**Rendering is very slow**
Close other memory-hungry apps; the models need most of a 24 GB Mac's memory. Check that Z-Image-Turbo isn't set to `Z_IMAGE_BITS=original`, which swaps on a 24 GB Mac. See [Performance](performance.md).

**The chat tab is greyed out**
For Grok, set `XAI_API_KEY` in `.env`; for a local model, set `CHAT_PROVIDER=ollama` and `OLLAMA_MODEL`. Then restart `main.py`.

**"Ollama is not running" or "the chat model is not downloaded"**
Start Ollama with `brew services start ollama`, or download the model named in `OLLAMA_MODEL` with `ollama pull <model>`. `ollama list` shows the models you have.

**No notification when a render finishes**
The browser asks for permission the first time you press Generate. If you declined, allow notifications for `127.0.0.1` in your browser's site settings; the tab title still changes either way.

**"The start image is no longer in History"**
The image a variation starts from was deleted. Remove the start image (× in Create) or pick another one with **Make variations**.

**The app on a phone or another computer doesn't load**
The app only answers on this Mac (`127.0.0.1`), on purpose.
