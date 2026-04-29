# Word Race

A real-time 2-player word race game on a 5×5 grid.

## Run locally

```bash
pip install -r requirements.txt
python server.py
```

Open `http://localhost:3000` in two browser tabs.

## Deploy on Render (free)

1. Push this folder to a GitHub repository.
2. Sign in to https://render.com → **New +** → **Web Service**.
3. Connect your repo. Render auto-detects `render.yaml`.
4. Click **Create Web Service**. Wait ~2 minutes for the build.
5. Open the assigned URL (e.g. `word-race.onrender.com`) — share it with a friend.

Both players hit the same URL; the first two connections are paired into one match.
