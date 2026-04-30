#!/usr/bin/env python3
"""Word Race — multi-room asyncio server (HTTP static files + WebSocket game logic)."""

import asyncio
import json
import mimetypes
import os
import random
import urllib.parse
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
# Game helpers (pure functions)
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
    """DFS for any path of adjacent cells spelling `word`. Returns indices or None."""
    word = word.upper()
    n = len(word)
    if n < 3:
        return None
    starts = [i for i, ch in enumerate(grid) if ch == word[0]]

    def dfs(idx, depth, used):
        if depth == n:
            return list(used)
        for nbr in range(25):
            if nbr in used or not adjacent(idx, nbr) or grid[nbr] != word[depth]:
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

# ---------------------------------------------------------------------------
# Room (one game session)
# ---------------------------------------------------------------------------
class Room:
    def __init__(self, room_id: str):
        self.id           = room_id
        self.sockets      = {}    # websocket -> player_id ("p1" / "p2")
        self.timer_task   = None
        self.state        = self._fresh_state()

    @staticmethod
    def _fresh_state(players=None, names=None):
        pl = dict(players) if players else {}
        return {
            "grid":          make_grid(),
            "players":       pl,
            "names":         dict(names) if names else {},
            "scores":        {pid: 0 for pid in pl},
            "claimed":       {},
            "claimed_order": [],
            "time_left":     120,
            "active":        False,
            "started":       False,
            "winner":        None,
        }

    def reset(self):
        self.state = self._fresh_state(self.state["players"], self.state["names"])
        self.state["active"]  = True
        self.state["started"] = True

    def free_slot(self):
        used = set(self.sockets.values())
        if "p1" not in used: return "p1"
        if "p2" not in used: return "p2"
        return None

    def snapshot(self, for_id):
        s = self.state
        return {
            "grid":         s["grid"],
            "players":      s["names"],
            "scores":       s["scores"],
            "claimed":      s["claimed"],
            "claimedOrder": s["claimed_order"],
            "timeLeft":     s["time_left"],
            "active":       s["active"],
            "started":      s["started"],
            "winner":       s["winner"],
            "yourId":       for_id,
            "roomId":       self.id,
        }

rooms = {}    # room_id -> Room

def get_room(room_id: str) -> Room:
    if room_id not in rooms:
        rooms[room_id] = Room(room_id)
    return rooms[room_id]

def cleanup_room(room: Room):
    if not room.sockets:
        if room.timer_task and not room.timer_task.done():
            room.timer_task.cancel()
        rooms.pop(room.id, None)

# ---------------------------------------------------------------------------
# Messaging
# ---------------------------------------------------------------------------
def pack(**kw): return json.dumps(kw)

async def send(ws, **kw):
    try: await ws.send(pack(**kw))
    except Exception: pass

async def broadcast(room: Room, **kw):
    msg = pack(**kw)
    for ws in list(room.sockets):
        try: await ws.send(msg)
        except Exception: pass

async def send_to(room: Room, player_id, **kw):
    for ws, pid in list(room.sockets.items()):
        if pid == player_id:
            await send(ws, **kw)

# ---------------------------------------------------------------------------
# Timer / round management
# ---------------------------------------------------------------------------
async def run_timer(room: Room):
    try:
        while room.state["time_left"] > 0 and room.state["active"]:
            await asyncio.sleep(1)
            if not room.state["active"]:
                break
            room.state["time_left"] -= 1
            await broadcast(room, type="tick", t=room.state["time_left"])
        if room.state["active"]:
            await end_game(room)
    except asyncio.CancelledError:
        pass

async def end_game(room: Room):
    if room.timer_task and not room.timer_task.done():
        room.timer_task.cancel()
    room.state["active"] = False
    ids = list(room.state["scores"])
    winner = None
    if len(ids) == 2:
        a, b = ids
        if   room.state["scores"][a] > room.state["scores"][b]: winner = a
        elif room.state["scores"][b] > room.state["scores"][a]: winner = b
        else:                                                    winner = "tie"
    room.state["winner"] = winner
    await broadcast(
        room,
        type="gameover",
        scores=room.state["scores"],
        players=room.state["names"],
        winner=winner,
    )

async def new_round(room: Room):
    if room.timer_task and not room.timer_task.done():
        room.timer_task.cancel()
    room.reset()
    for ws, pid in list(room.sockets.items()):
        await send(ws, type="newround", **room.snapshot(pid))
    room.timer_task = asyncio.create_task(run_timer(room))

# ---------------------------------------------------------------------------
# HTTP static-file handler
# ---------------------------------------------------------------------------
def serve_static(request):
    raw = request.path.split("?")[0].lstrip("/") or "index.html"
    safe = Path(os.path.normpath(PUBLIC / raw))
    try:
        safe.relative_to(PUBLIC.resolve())
    except ValueError:
        body = b"Forbidden"
        return Response(HTTPStatus.FORBIDDEN, "Forbidden",
                        Headers([("Content-Type", "text/plain"), ("Content-Length", str(len(body)))]),
                        body)
    if not safe.exists() or not safe.is_file():
        body = b"Not Found"
        return Response(HTTPStatus.NOT_FOUND, "Not Found",
                        Headers([("Content-Type", "text/plain"), ("Content-Length", str(len(body)))]),
                        body)
    content_type = mimetypes.guess_type(str(safe))[0] or "application/octet-stream"
    body = safe.read_bytes()
    return Response(HTTPStatus.OK, "OK",
                    Headers([("Content-Type", content_type), ("Content-Length", str(len(body)))]),
                    body)

def process_request(connection, request):
    if request.headers.get("Upgrade", "").lower() != "websocket":
        return serve_static(request)
    return None

# ---------------------------------------------------------------------------
# WebSocket handler
# ---------------------------------------------------------------------------
def parse_room_id(path: str) -> str:
    parsed = urllib.parse.urlparse(path)
    qs = urllib.parse.parse_qs(parsed.query)
    rid = (qs.get("r") or ["main"])[0]
    rid = "".join(ch for ch in rid if ch.isalnum())[:24]
    return rid or "main"

async def handler(ws):
    room_id = parse_room_id(ws.request.path)
    room    = get_room(room_id)

    slot = room.free_slot()
    if slot is None:
        await send(ws, type="error", msg="That game room is full. Try a different link or refresh later.")
        return

    player_id = slot
    room.sockets[ws] = player_id

    try:
        async for raw in ws:
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue

            t = msg.get("type")

            # ── JOIN ──
            if t == "join":
                name = str(msg.get("name") or f"Player {'1' if player_id=='p1' else '2'}").strip()[:20] or "Player"
                room.state["players"][player_id] = player_id
                room.state["names"][player_id]   = name
                room.state["scores"].setdefault(player_id, 0)

                await send(ws, type="init", **room.snapshot(player_id))

                if len(room.sockets) == 2 and len(room.state["players"]) == 2:
                    room.state["active"]  = True
                    room.state["started"] = True
                    for w, pid in list(room.sockets.items()):
                        await send(w, type="start", **room.snapshot(pid))
                    room.timer_task = asyncio.create_task(run_timer(room))
                else:
                    await broadcast(room, type="waiting", players=room.state["names"])

            # ── SUBMIT ──
            elif t == "submit":
                if not room.state["active"]:
                    continue
                wpath = msg.get("path")
                raw_word = msg.get("word", "")
                word  = str(raw_word).strip().upper() if isinstance(raw_word, str) else ""

                if len(word) < 3 or not word.isalpha():
                    await send_to(room, player_id, type="result", ok=False, reason="badpath", word=word)
                    continue

                if wpath is not None:
                    if not valid_path(wpath) or "".join(room.state["grid"][i] for i in wpath) != word:
                        await send_to(room, player_id, type="result", ok=False, reason="badpath", word=word)
                        continue
                else:
                    wpath = find_path(room.state["grid"], word)
                    if wpath is None:
                        await send_to(room, player_id, type="result", ok=False, reason="notongrid", word=word)
                        continue

                if word in room.state["claimed"]:
                    await send_to(room, player_id, type="result", ok=False, reason="taken", word=word)
                    continue

                valid = await dict_check(word)

                if not valid:
                    await send_to(room, player_id, type="result", ok=False, reason="notword", word=word)
                    continue

                if word in room.state["claimed"]:
                    await send_to(room, player_id, type="result", ok=False, reason="taken", word=word)
                    continue

                pts = word_score(word)
                room.state["scores"][player_id] = room.state["scores"].get(player_id, 0) + pts
                room.state["claimed"][word]      = {
                    "playerId": player_id,
                    "name":     room.state["names"].get(player_id, player_id),
                    "pts":      pts,
                }
                room.state["claimed_order"].append(word)

                await broadcast(
                    room,
                    type="claimed", word=word, playerId=player_id,
                    name=room.state["names"].get(player_id, player_id),
                    pts=pts, scores=room.state["scores"], path=wpath,
                )

            # ── NEW ROUND ──
            elif t == "newround":
                await new_round(room)

    except Exception:
        pass
    finally:
        room.sockets.pop(ws, None)
        room.state["players"].pop(player_id, None)
        room.state["names"].pop(player_id, None)
        room.state["scores"].pop(player_id, None)
        if room.timer_task and not room.timer_task.done():
            room.timer_task.cancel()
        room.state["active"] = False
        await broadcast(room, type="disconnect", playerId=player_id, players=room.state["names"])
        cleanup_room(room)

# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
async def main():
    print(f"Word Race listening on {HOST}:{PORT}")
    async with serve(handler, HOST, PORT, process_request=process_request):
        await asyncio.Future()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nServer stopped.")
