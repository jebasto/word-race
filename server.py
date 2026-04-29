#!/usr/bin/env python3
"""Word Race — single-port asyncio server (HTTP static files + WebSocket game logic)."""

import asyncio
import json
import mimetypes
import os
import random
import ssl
import urllib.request
from http import HTTPStatus
from pathlib import Path

from websockets.asyncio.server import serve
from websockets.datastructures import Headers
from websockets.http11 import Response

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
PORT   = int(os.environ.get("PORT", 3000))
HOST   = os.environ.get("HOST", "0.0.0.0")
PUBLIC = Path(__file__).parent / "public"

POOL = (
    "E" * 12 + "T" * 9 + "A" * 8 + "O" * 7 + "I" * 7 + "N" * 7 +
    "S" * 6  + "R" * 6 + "H" * 5 + "L" * 4 + "D" * 4 + "C" * 3 +
    "U" * 3  + "M" * 3 + "W" * 2 + "F" * 2 + "G" * 2 + "Y" * 2 +
    "P" * 2  + "B" * 2 + "V"     + "K"
)

# ---------------------------------------------------------------------------
# Game helpers
# ---------------------------------------------------------------------------
def make_grid():
    return [random.choice(POOL) for _ in range(25)]

def adjacent(a: int, b: int) -> bool:
    return abs(a // 5 - b // 5) <= 1 and abs(a % 5 - b % 5) <= 1 and a != b

def valid_path(p) -> bool:
    if not isinstance(p, list) or len(p) < 3:
        return False
    seen = set()
    for i, idx in enumerate(p):
        if not isinstance(idx, int) or not (0 <= idx <= 24):
            return False
        if idx in seen:
            return False
        seen.add(idx)
        if i > 0 and not adjacent(p[i - 1], idx):
            return False
    return True

def find_path(grid, word: str):
    """DFS search for any path of adjacent cells spelling `word`. Returns list of indices or None."""
    word = word.upper()
    n = len(word)
    if n < 3:
        return None
    starts = [i for i, ch in enumerate(grid) if ch == word[0]]

    def dfs(idx, depth, used):
        if depth == n:
            return list(used)
        for nbr in range(25):
            if nbr in used:
                continue
            if not adjacent(idx, nbr):
                continue
            if grid[nbr] != word[depth]:
                continue
            used.append(nbr)
            res = dfs(nbr, depth + 1, used)
            if res is not None:
                return res
            used.pop()
        return None

    for s in starts:
        res = dfs(s, 1, [s])
        if res is not None:
            return res
    return None

def word_score(word: str) -> int:
    n = len(word)
    if n <= 3: return 1
    if n == 4: return 2
    if n == 5: return 4
    if n == 6: return 6
    return 10

async def dict_check(word: str) -> bool:
    """Validate word against the Free Dictionary API (async via executor)."""
    url = f"https://api.dictionaryapi.dev/api/v2/entries/en/{urllib.parse.quote(word.lower())}"
    loop = asyncio.get_running_loop()
    def _fetch():
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "WordRace/1.0"})
            with urllib.request.urlopen(req, timeout=6) as resp:
                body = resp.read()
            data = json.loads(body)
            return isinstance(data, list) and len(data) > 0 and isinstance(data[0].get("word"), str)
        except Exception:
            return False
    return await loop.run_in_executor(None, _fetch)

import urllib.parse

# ---------------------------------------------------------------------------
# Shared game state (single room, 2 players)
# ---------------------------------------------------------------------------
def fresh_state(players=None, names=None):
    pl = dict(players) if players else {}
    return {
        "grid":         make_grid(),
        "players":      pl,
        "names":        dict(names) if names else {},
        "scores":       {pid: 0 for pid in pl},
        "claimed":      {},          # word -> {playerId, name, pts}
        "claimed_order": [],
        "time_left":    120,
        "active":       False,
        "started":      False,
        "winner":       None,
    }

state    = fresh_state()
sockets  = {}           # websocket -> playerId
timer_task = None       # asyncio.Task for the game countdown

# ---------------------------------------------------------------------------
# Messaging helpers
# ---------------------------------------------------------------------------
def pack(**kwargs) -> str:
    return json.dumps(kwargs)

async def send(ws, **kwargs):
    try:
        await ws.send(pack(**kwargs))
    except Exception:
        pass

async def broadcast(**kwargs):
    msg = pack(**kwargs)
    for ws in list(sockets):
        try:
            await ws.send(msg)
        except Exception:
            pass

async def send_to(player_id, **kwargs):
    for ws, pid in list(sockets.items()):
        if pid == player_id:
            await send(ws, **kwargs)

def snapshot(for_id):
    return {
        "grid":          state["grid"],
        "players":       state["names"],
        "scores":        state["scores"],
        "claimed":       state["claimed"],
        "claimedOrder":  state["claimed_order"],
        "timeLeft":      state["time_left"],
        "active":        state["active"],
        "started":       state["started"],
        "winner":        state["winner"],
        "yourId":        for_id,
    }

# ---------------------------------------------------------------------------
# Timer / round management
# ---------------------------------------------------------------------------
async def run_timer():
    global state, timer_task
    try:
        while state["time_left"] > 0 and state["active"]:
            await asyncio.sleep(1)
            if not state["active"]:
                break
            state["time_left"] -= 1
            await broadcast(type="tick", t=state["time_left"])
        if state["active"]:
            await end_game()
    except asyncio.CancelledError:
        pass

async def end_game():
    global state, timer_task
    if timer_task and not timer_task.done():
        timer_task.cancel()
    state["active"] = False
    ids = list(state["scores"])
    winner = None
    if len(ids) == 2:
        a, b = ids
        if   state["scores"][a] > state["scores"][b]: winner = a
        elif state["scores"][b] > state["scores"][a]: winner = b
        else:                                          winner = "tie"
    state["winner"] = winner
    await broadcast(
        type="gameover",
        scores=state["scores"],
        players=state["names"],
        winner=winner,
    )

async def new_round():
    global state, timer_task
    if timer_task and not timer_task.done():
        timer_task.cancel()
    old_players = state["players"]
    old_names   = state["names"]
    state = fresh_state(old_players, old_names)
    state["active"]  = True
    state["started"] = True
    for ws, pid in list(sockets.items()):
        await send(ws, type="newround", **snapshot(pid))
    timer_task = asyncio.create_task(run_timer())

# ---------------------------------------------------------------------------
# HTTP static-file handler (called for non-WebSocket requests)
# ---------------------------------------------------------------------------
def serve_static(request):
    raw = request.path.split("?")[0].lstrip("/") or "index.html"
    # Security: strip path traversal
    safe = Path(os.path.normpath(PUBLIC / raw))
    try:
        safe.relative_to(PUBLIC.resolve())
    except ValueError:
        body = b"Forbidden"
        return Response(
            HTTPStatus.FORBIDDEN, "Forbidden",
            Headers([("Content-Type", "text/plain"), ("Content-Length", str(len(body)))]),
            body,
        )
    if not safe.exists() or not safe.is_file():
        body = b"Not Found"
        return Response(
            HTTPStatus.NOT_FOUND, "Not Found",
            Headers([("Content-Type", "text/plain"), ("Content-Length", str(len(body)))]),
            body,
        )
    content_type = mimetypes.guess_type(str(safe))[0] or "application/octet-stream"
    body = safe.read_bytes()
    return Response(
        HTTPStatus.OK, "OK",
        Headers([("Content-Type", content_type), ("Content-Length", str(len(body)))]),
        body,
    )

def process_request(connection, request):
    """Return an HTTP response for static files; return None to continue WS handshake."""
    if request.headers.get("Upgrade", "").lower() != "websocket":
        return serve_static(request)
    return None

# ---------------------------------------------------------------------------
# WebSocket handler
# ---------------------------------------------------------------------------
async def handler(ws):
    global state, timer_task

    if len(sockets) >= 2:
        await send(ws, type="error", msg="Game is full (max 2 players). Try refreshing later.")
        return

    player_id = "p1" if not sockets else "p2"
    sockets[ws] = player_id

    try:
        async for raw in ws:
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue

            t = msg.get("type")

            # ── JOIN ──────────────────────────────────────────────────
            if t == "join":
                name = str(msg.get("name") or f"Player {'1' if player_id=='p1' else '2'}").strip()[:20] or "Player"
                state["players"][player_id] = player_id
                state["names"][player_id]   = name
                state["scores"].setdefault(player_id, 0)

                await send(ws, type="init", **snapshot(player_id))

                if len(sockets) == 2 and len(state["players"]) == 2:
                    state["active"]  = True
                    state["started"] = True
                    for w, pid in list(sockets.items()):
                        await send(w, type="start", **snapshot(pid))
                    timer_task = asyncio.create_task(run_timer())
                else:
                    await broadcast(type="waiting", players=state["names"])

            # ── SUBMIT ────────────────────────────────────────────────
            elif t == "submit":
                if not state["active"]:
                    continue
                wpath = msg.get("path")
                raw_word = msg.get("word", "")
                word  = str(raw_word).strip().upper() if isinstance(raw_word, str) else ""

                if len(word) < 3 or not word.isalpha():
                    await send_to(player_id, type="result", ok=False, reason="badpath", word=word)
                    continue

                # If path was supplied (click-to-build), validate it; otherwise search the grid.
                if wpath is not None:
                    if not valid_path(wpath) or "".join(state["grid"][i] for i in wpath) != word:
                        await send_to(player_id, type="result", ok=False, reason="badpath", word=word)
                        continue
                else:
                    wpath = find_path(state["grid"], word)
                    if wpath is None:
                        await send_to(player_id, type="result", ok=False, reason="notongrid", word=word)
                        continue

                if word in state["claimed"]:
                    await send_to(player_id, type="result", ok=False, reason="taken", word=word)
                    continue

                valid = await dict_check(word)

                if not valid:
                    await send_to(player_id, type="result", ok=False, reason="notword", word=word)
                    continue

                # Race-condition guard: check again after async gap
                if word in state["claimed"]:
                    await send_to(player_id, type="result", ok=False, reason="taken", word=word)
                    continue

                pts = word_score(word)
                state["scores"][player_id] = state["scores"].get(player_id, 0) + pts
                state["claimed"][word]      = {"playerId": player_id, "name": state["names"].get(player_id, player_id), "pts": pts}
                state["claimed_order"].append(word)

                await broadcast(
                    type="claimed",
                    word=word,
                    playerId=player_id,
                    name=state["names"].get(player_id, player_id),
                    pts=pts,
                    scores=state["scores"],
                    path=wpath,
                )

            # ── NEW ROUND ─────────────────────────────────────────────
            elif t == "newround":
                await new_round()

    except Exception:
        pass
    finally:
        sockets.pop(ws, None)
        state["players"].pop(player_id, None)
        state["names"].pop(player_id, None)
        state["scores"].pop(player_id, None)
        if timer_task and not timer_task.done():
            timer_task.cancel()
        state["active"] = False
        await broadcast(type="disconnect", playerId=player_id, players=state["names"])

# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
async def main():
    print(f"Word Race listening on {HOST}:{PORT}")
    async with serve(handler, HOST, PORT, process_request=process_request):
        await asyncio.Future()  # run forever

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nServer stopped.")
