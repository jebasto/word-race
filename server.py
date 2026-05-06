#!/usr/bin/env python3
"""Word Race — multi-room asyncio server with variable capacity (2-4 players)."""

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
PORT         = int(os.environ.get("PORT", 3000))
HOST         = os.environ.get("HOST", "0.0.0.0")
PUBLIC       = Path(__file__).parent / "public"
MAX_CAPACITY = 4
MIN_CAPACITY = 2

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
    # 7+ letters: start at 10, then each extra letter adds an increasing bonus
    # 7→10, 8→15 (+5), 9→21 (+6), 10→28 (+7), 11→36 (+8)…
    pts = 10
    for k in range(8, n + 1):
        pts += (k - 3)
    return pts

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
# Room
# ---------------------------------------------------------------------------
class Room:
    def __init__(self, room_id: str):
        self.id          = room_id
        self.sockets     = {}     # ws -> player_id (or None for unjoined spectator)
        self.capacity    = None   # set by first joiner (2-4)
        self.timer_task  = None
        self.state       = self._fresh_state()

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

    def player_count(self) -> int:
        return len(self.state["players"])

    def is_full(self) -> bool:
        return self.capacity is not None and self.player_count() >= self.capacity

    def next_slot(self):
        used = set(self.state["players"].keys())
        for i in range(1, MAX_CAPACITY + 1):
            pid = f"p{i}"
            if pid not in used:
                return pid
        return None

    def connected_player_ids(self):
        return {pid for pid in self.sockets.values() if pid is not None}

    def snapshot(self, for_id):
        s = self.state
        return {
            "grid":          s["grid"],
            "players":       s["names"],
            "playerIds":     list(s["players"].keys()),
            "scores":        s["scores"],
            "claimed":       s["claimed"],
            "claimedOrder":  s["claimed_order"],
            "timeLeft":      s["time_left"],
            "active":        s["active"],
            "started":       s["started"],
            "winner":        s["winner"],
            "yourId":        for_id,
            "roomId":        self.id,
            "capacity":      self.capacity,
            "connected":     list(self.connected_player_ids()),
        }

rooms = {}

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
# Timer / round
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
    scores = room.state["scores"]
    winner = None
    if scores:
        ordered = sorted(scores, key=lambda p: scores[p], reverse=True)
        if len(ordered) >= 2 and scores[ordered[0]] == scores[ordered[1]]:
            winner = "tie"
        else:
            winner = ordered[0]
    room.state["winner"] = winner
    await broadcast(
        room,
        type="gameover",
        scores=scores,
        players=room.state["names"],
        playerIds=list(room.state["players"].keys()),
        winner=winner,
    )

async def new_round(room: Room):
    if room.timer_task and not room.timer_task.done():
        room.timer_task.cancel()
    room.reset()
    for ws, pid in list(room.sockets.items()):
        if pid is not None:
            await send(ws, type="newround", **room.snapshot(pid))
    room.timer_task = asyncio.create_task(run_timer(room))

# ---------------------------------------------------------------------------
# HTTP static-file handler
# ---------------------------------------------------------------------------
def serve_static(request):
    raw = request.path.split("?")[0].lstrip("/") or "index.html"
    target = Path(os.path.normpath(PUBLIC / raw))

    # Sandbox: never escape PUBLIC
    try:
        target.relative_to(PUBLIC.resolve())
    except ValueError:
        body = b"Forbidden"
        return Response(HTTPStatus.FORBIDDEN, "Forbidden",
                        Headers([("Content-Type", "text/plain"), ("Content-Length", str(len(body)))]),
                        body)

    # /word-race or /word-race/ → /word-race/index.html
    if target.is_dir():
        target = target / "index.html"
    elif not target.exists() and "." not in target.name:
        alt = PUBLIC / raw / "index.html"
        if alt.exists():
            target = alt

    if not target.exists() or not target.is_file():
        body = b"Not Found"
        return Response(HTTPStatus.NOT_FOUND, "Not Found",
                        Headers([("Content-Type", "text/plain"), ("Content-Length", str(len(body)))]),
                        body)

    content_type = mimetypes.guess_type(str(target))[0] or "application/octet-stream"
    body = target.read_bytes()
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
    """Top-level WS router — dispatches by path to per-game handlers."""
    parsed = urllib.parse.urlparse(ws.request.path)
    p = parsed.path.rstrip("/")

    if p in ("/ws/word-race", "/word-race") or p == "":
        await handle_word_race(ws)
    # Future: elif p == "/ws/blackjack": await handle_blackjack(ws)
    else:
        try: await ws.close(code=1003, reason="unknown game")
        except Exception: pass

async def handle_word_race(ws):
    room_id = parse_room_id(ws.request.path)
    room    = get_room(room_id)

    # Connect as unjoined spectator
    room.sockets[ws] = None

    # Send current room status so the client can decide what to render
    await send(ws, type="room_info",
               roomId=room.id,
               capacity=room.capacity,
               joined=room.player_count(),
               isFull=room.is_full(),
               started=room.state["started"])

    try:
        async for raw in ws:
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue

            t = msg.get("type")

            # ── JOIN ──
            if t == "join":
                if room.sockets.get(ws) is not None:
                    continue   # already joined

                name = str(msg.get("name") or "Player").strip()[:20] or "Player"

                # First joiner sets the capacity for this room
                if room.capacity is None:
                    cap_raw = msg.get("capacity", 2)
                    try:
                        cap = int(cap_raw)
                    except (TypeError, ValueError):
                        cap = 2
                    room.capacity = max(MIN_CAPACITY, min(MAX_CAPACITY, cap))

                if room.is_full():
                    await send(ws, type="room_full")
                    continue

                slot = room.next_slot()
                if slot is None:
                    await send(ws, type="room_full")
                    continue

                room.sockets[ws] = slot
                player_id = slot
                room.state["players"][player_id] = player_id
                room.state["names"][player_id]   = name
                room.state["scores"].setdefault(player_id, 0)

                # Confirm to the joiner
                await send(ws, type="init", **room.snapshot(player_id))

                # Update everyone (joined + still-waiting spectators)
                await broadcast(room, type="waiting",
                                players=room.state["names"],
                                playerIds=list(room.state["players"].keys()),
                                capacity=room.capacity,
                                joined=room.player_count(),
                                connected=list(room.connected_player_ids()))

                # Start the game once room is at capacity
                if room.player_count() >= room.capacity:
                    room.state["active"]  = True
                    room.state["started"] = True
                    for w, pid in list(room.sockets.items()):
                        if pid is not None:
                            await send(w, type="start", **room.snapshot(pid))
                    room.timer_task = asyncio.create_task(run_timer(room))

            # ── SUBMIT ──
            elif t == "submit":
                player_id = room.sockets.get(ws)
                if player_id is None or not room.state["active"]:
                    continue

                wpath = msg.get("path")
                raw_word = msg.get("word", "")
                word = str(raw_word).strip().upper() if isinstance(raw_word, str) else ""

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
                if room.sockets.get(ws) is None:
                    continue
                await new_round(room)

    except Exception:
        pass
    finally:
        player_id = room.sockets.pop(ws, None)
        if not room.sockets:
            cleanup_room(room)
        elif player_id is not None:
            await broadcast(room, type="disconnect",
                            playerId=player_id,
                            connected=list(room.connected_player_ids()))

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
