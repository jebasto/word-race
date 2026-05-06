"""Blackjack — multiplayer (1-4 players vs dealer), real-time, 1 shared table per room code."""
import asyncio
import json
import random
import time
import urllib.parse
from typing import Optional

# ── Rules ──────────────────────────────────────────────────────────
MIN_BET            = 50
MAX_PLAYERS        = 4
LOBBY_WINDOW       = 20    # seconds: join + bet
TURN_WINDOW        = 30    # seconds per decision
INSURANCE_WINDOW   = 15
RESULT_LINGER      = 8
DEALER_DRAW_DELAY  = 1.6
TURN_BANNER_DELAY  = 1.0   # let "X's turn" / "Dealer's turn" banners show
DEAL_PER_CARD      = 0.45  # per-card delay during the initial deal
DEAL_LINGER        = 1.6   # pause after dealing so Blackjack banners are visible
DEALER_STANDS_ON   = 17    # standard: dealer stands on all 17 (incl. soft)
BLACKJACK_PAYOUT   = 1.5   # 3:2
INSURANCE_PAYOUT   = 2     # 2:1
DECKS              = 6
RESHUFFLE_AT       = 60    # cards remaining

SUITS = ['S','H','D','C']
RANKS = ['2','3','4','5','6','7','8','9','10','J','Q','K','A']

def make_deck():
    deck = [{'r': r, 's': s} for _ in range(DECKS) for s in SUITS for r in RANKS]
    random.shuffle(deck)
    return deck

def hand_value(cards):
    """Return (best_total, is_soft, is_blackjack)."""
    total = 0
    aces  = 0
    for c in cards:
        r = c['r']
        if r == 'A':
            aces += 1
            total += 11
        elif r in ('J','Q','K'):
            total += 10
        else:
            total += int(r)
    while total > 21 and aces > 0:
        total -= 10
        aces -= 1
    soft = aces > 0 and total <= 21
    is_bj = len(cards) == 2 and total == 21
    return total, soft, is_bj

# ── Table ──────────────────────────────────────────────────────────
class BlackjackTable:
    def __init__(self, tid: str):
        self.id              = tid
        self.sockets         = {}           # ws -> player_id (or None for spectator)
        self.players         = {}           # pid -> player dict
        self.seat_order      = []           # ordered list of pids (turn order)
        self.deck            = make_deck()
        self.dealer          = []           # list[card]
        self.dealer_hole_revealed = False
        self.dealer_skipped  = False
        self.phase           = 'idle'       # idle | lobby | dealing | insurance | playing | dealer | resolution
        self.phase_deadline  = 0            # epoch ts when current phase auto-ends
        self.lobby_event     = asyncio.Event()
        self.round_task: Optional[asyncio.Task] = None
        self.current_pid     = None
        self.current_hand    = 0
        self.action_event    = asyncio.Event()
        self.last_action_text = ""

    # ---- player helpers ----
    def free_seat(self):
        used = {p['seat'] for p in self.players.values()}
        for i in range(1, MAX_PLAYERS + 1):
            if i not in used:
                return i
        return None

    def is_full(self):
        return len(self.players) >= MAX_PLAYERS

    def make_player(self, pid, name, chips, seat):
        return {
            'id': pid, 'name': name, 'chips': max(0, int(chips)),
            'seat': seat,
            'hands': [],            # list of {cards, bet, doubled, surrendered, finished, result, payout, isSplit}
            'currentHand': 0,
            'insurance': 0,
            'sitOut': False,
            'connected': True,
            'pendingAction': False,
            'turnDeadline': 0,
            'profileId': None,
        }

    def reset_hands(self):
        for p in self.players.values():
            p['hands'] = []
            p['currentHand'] = 0
            p['insurance'] = 0
            p['sitOut'] = False
            p['pendingAction'] = False
        self.dealer = []
        self.dealer_hole_revealed = False
        self.dealer_skipped = False
        self.last_action_text = ""

    # ---- JSON state ----
    def public_state(self, for_pid=None):
        """Snapshot tailored for one viewer (hides dealer hole pre-reveal)."""
        # Dealer view: hide hole card if not revealed
        if self.dealer:
            shown = [self.dealer[0]] + (
                self.dealer[1:] if self.dealer_hole_revealed
                else [{'r': '?', 's': '?'} for _ in self.dealer[1:]]
            )
        else:
            shown = []

        dealer_total = None
        dealer_soft  = False
        dealer_bj    = False
        if self.dealer_hole_revealed and self.dealer:
            dealer_total, dealer_soft, dealer_bj = hand_value(self.dealer)
        elif self.dealer:
            # Show value of just the up-card so the player can plan
            up_total, up_soft, _ = hand_value([self.dealer[0]])
            dealer_total = up_total
            dealer_soft  = up_soft

        players_view = []
        for pid in self.seat_order:
            p = self.players.get(pid)
            if not p: continue
            hands_view = []
            for h in p['hands']:
                t, soft, bj = hand_value(h['cards']) if h['cards'] else (0, False, False)
                hands_view.append({
                    **{k: h[k] for k in ('cards','bet','doubled','surrendered','finished','result','payout','isSplit')},
                    'total': t, 'soft': soft, 'isBlackjack': bj,
                })
            players_view.append({
                'id': p['id'], 'name': p['name'], 'chips': p['chips'],
                'seat': p['seat'], 'hands': hands_view,
                'currentHand': p['currentHand'], 'insurance': p['insurance'],
                'sitOut': p['sitOut'], 'connected': p['connected'],
                'pendingAction': p['pendingAction'],
                'turnDeadline': p['turnDeadline'],
                'sitOutToggle': bool(p.get('sitOutToggle')),
                'skipRound':    bool(p.get('skipRound')),
            })

        return {
            'tableId':       self.id,
            'phase':         self.phase,
            'phaseDeadline': self.phase_deadline,
            'dealer':        shown,
            'dealerTotal':   dealer_total,
            'dealerSoft':    dealer_soft,
            'dealerBJ':      dealer_bj,
            'dealerRevealed': self.dealer_hole_revealed,
            'dealerSkipped':  bool(self.dealer_skipped),
            'players':       players_view,
            'currentPid':    self.current_pid,
            'currentHandIdx': self.current_hand,
            'minBet':        MIN_BET,
            'maxPlayers':    MAX_PLAYERS,
            'yourId':        for_pid,
            'lastAction':    self.last_action_text,
            'now':           time.time(),
        }


# ── Module-level state ─────────────────────────────────────────────
tables: dict[str, BlackjackTable] = {}

def get_table(tid: str) -> BlackjackTable:
    if tid not in tables:
        tables[tid] = BlackjackTable(tid)
        # Spawn long-running round driver
        tables[tid].round_task = asyncio.create_task(run_table(tables[tid]))
    return tables[tid]

def cleanup_table(table: BlackjackTable):
    if not table.sockets and not table.players:
        if table.round_task and not table.round_task.done():
            table.round_task.cancel()
        tables.pop(table.id, None)


# ── Messaging ──────────────────────────────────────────────────────
def pack(**kw): return json.dumps(kw)

async def send(ws, **kw):
    try: await ws.send(pack(**kw))
    except Exception: pass

async def broadcast_state(table: BlackjackTable, **extra):
    for ws, pid in list(table.sockets.items()):
        snap = table.public_state(for_pid=pid)
        snap.update(extra)
        snap['type'] = 'state'
        try: await ws.send(json.dumps(snap))
        except Exception: pass

async def broadcast(table: BlackjackTable, **kw):
    msg = pack(**kw)
    for ws in list(table.sockets):
        try: await ws.send(msg)
        except Exception: pass


# ── Dealing & resolution ───────────────────────────────────────────
def draw(table: BlackjackTable):
    if len(table.deck) <= RESHUFFLE_AT:
        table.deck = make_deck()
    return table.deck.pop()

def deal_initial(table: BlackjackTable, active_pids):
    """Synchronous full deal — kept for compatibility (not used)."""
    table.dealer = []
    for pid in active_pids:
        table.players[pid]['hands'][0]['cards'] = []
    for _ in range(2):
        for pid in active_pids:
            table.players[pid]['hands'][0]['cards'].append(draw(table))
        table.dealer.append(draw(table))

async def deal_initial_animated(table: BlackjackTable, active_pids):
    """Deal one card at a time, broadcasting in between so clients animate each card."""
    table.dealer = []
    for pid in active_pids:
        table.players[pid]['hands'][0]['cards'] = []
    await broadcast_state(table)
    await asyncio.sleep(DEAL_PER_CARD * 0.4)

    # Round 1: each player, then dealer up
    for pid in active_pids:
        table.players[pid]['hands'][0]['cards'].append(draw(table))
        await broadcast_state(table)
        await asyncio.sleep(DEAL_PER_CARD)
    table.dealer.append(draw(table))
    await broadcast_state(table)
    await asyncio.sleep(DEAL_PER_CARD)

    # Round 2: each player again, then dealer hole (still hidden)
    for pid in active_pids:
        table.players[pid]['hands'][0]['cards'].append(draw(table))
        await broadcast_state(table)
        await asyncio.sleep(DEAL_PER_CARD)
    table.dealer.append(draw(table))
    await broadcast_state(table)

def player_hand(table, pid, idx=None):
    p = table.players[pid]
    return p['hands'][p['currentHand'] if idx is None else idx]

def can_double(p, hand):
    return len(hand['cards']) == 2 and not hand['surrendered'] and p['chips'] >= hand['bet']

def can_split(p, hand):
    if len(p['hands']) >= 4: return False
    if len(hand['cards']) != 2: return False
    if hand['surrendered']: return False
    a, b = hand['cards']
    same_rank = a['r'] == b['r'] or (a['r'] in ('10','J','Q','K') and b['r'] in ('10','J','Q','K'))
    return same_rank and p['chips'] >= hand['bet']

def can_surrender(p, hand):
    return len(hand['cards']) == 2 and not hand['doubled'] and not hand['isSplit']

# ── Round driver ───────────────────────────────────────────────────
async def run_table(table: BlackjackTable):
    """Long-running coroutine that drives one table through rounds forever."""
    try:
        while True:
            # Idle until at least one player is seated
            if not table.players:
                table.phase = 'idle'
                table.phase_deadline = 0
                table.lobby_event.clear()
                await broadcast_state(table)
                await table.lobby_event.wait()
                continue

            await play_round(table)

            # Kick anyone with < MIN_BET chips
            kicked = []
            for pid in list(table.players.keys()):
                p = table.players[pid]
                if p['chips'] < MIN_BET:
                    kicked.append((pid, p['chips']))
            for pid, chips in kicked:
                # Tell them they're broke; close their socket cleanly
                ws_to_close = [w for w, x in table.sockets.items() if x == pid]
                for w in ws_to_close:
                    try: await send(w, type='broke', chips=chips, minBet=MIN_BET)
                    except Exception: pass
                # Remove from table
                seat_remove(table, pid)
                # Their socket stays open as spectator (pid -> None)
                for w in ws_to_close:
                    if w in table.sockets:
                        table.sockets[w] = None
            if kicked:
                await broadcast_state(table)

            await asyncio.sleep(1)   # tiny pause between rounds
    except asyncio.CancelledError:
        pass


def seat_remove(table: BlackjackTable, pid):
    table.players.pop(pid, None)
    if pid in table.seat_order:
        table.seat_order.remove(pid)


async def play_round(table: BlackjackTable):
    # ── PHASE: lobby (open until first bet, then 20s for others) ──
    table.reset_hands()
    table.phase          = 'lobby'
    table.phase_deadline = 0          # no timer until someone bets
    table.lobby_event.clear()
    for p in table.players.values():
        p['hands'] = [{
            'cards': [], 'bet': 0, 'doubled': False, 'surrendered': False,
            'finished': False, 'result': None, 'payout': 0, 'isSplit': False,
        }]
        # Carry over sticky sit-out from previous round
        p['skipRound'] = bool(p.get('sitOutToggle'))
        p['sitOut']    = False
        p.pop('insuranceDecided', None)
    await broadcast_state(table)

    # 1) Wait for the FIRST bet (no deadline). Bail if everyone sits out.
    while True:
        if not table.players:
            return
        any_bet = any(p['hands'][0]['bet'] >= MIN_BET
                      for p in table.players.values() if not p['skipRound'])
        any_eligible = any(not p['skipRound'] for p in table.players.values())
        if not any_eligible:
            await asyncio.sleep(2)
            return
        if any_bet:
            break
        try:
            await asyncio.wait_for(table.lobby_event.wait(), timeout=2.0)
        except asyncio.TimeoutError:
            pass
        table.lobby_event.clear()

    # 2) First bet was placed inside handle_bet (which already set phase_deadline
    #    AND broadcast it). Just wait for the rest to decide.
    while time.time() < table.phase_deadline:
        if everyone_decided(table):
            break
        try:
            await asyncio.wait_for(table.lobby_event.wait(),
                                   timeout=max(0.3, table.phase_deadline - time.time()))
        except asyncio.TimeoutError:
            pass
        table.lobby_event.clear()

    # 3) Anyone without a bet sits out this round (and is locked out)
    for p in table.players.values():
        if p['skipRound'] or p['hands'][0]['bet'] < MIN_BET:
            p['sitOut'] = True

    active = [p['id'] for p in table.players.values() if not p['sitOut'] and p['chips'] >= 0]
    if not active:
        return   # nothing to do this round

    # ── PHASE: dealing ─────────────────────────────────────────────
    table.phase = 'dealing'
    table.phase_deadline = 0
    table.dealer_skipped = False
    await deal_initial_animated(table, active)
    await asyncio.sleep(DEAL_LINGER)   # lets Blackjack banner play

    dealer_up = table.dealer[0]
    _, _, dealer_bj_potential = hand_value(table.dealer)

    # ── PHASE: insurance (only if dealer up = A) ───────────────────
    if dealer_up['r'] == 'A':
        table.phase = 'insurance'
        table.phase_deadline = time.time() + INSURANCE_WINDOW
        await broadcast_state(table)
        try:
            await asyncio.wait_for(wait_for_insurance(table, active), timeout=INSURANCE_WINDOW)
        except asyncio.TimeoutError:
            pass

        # Reveal dealer for BJ check
        if dealer_bj_potential:
            table.dealer_hole_revealed = True
            table.last_action_text = "Dealer has Blackjack!"
            for pid in active:
                p = table.players[pid]
                hand = p['hands'][0]
                _, _, p_bj = hand_value(hand['cards'])
                if p_bj:
                    hand['result'] = 'push'
                    hand['payout'] = hand['bet']
                    p['chips'] += hand['bet']
                else:
                    hand['result'] = 'lose'
                    hand['payout'] = 0
                hand['finished'] = True
                # Insurance pays 2:1
                if p['insurance'] > 0:
                    p['chips'] += p['insurance'] * (1 + INSURANCE_PAYOUT)
            await broadcast_state(table)
            await asyncio.sleep(RESULT_LINGER)
            return
        else:
            # No BJ → insurance loses
            for pid in active:
                table.players[pid]['insurance'] = 0   # already deducted
            table.last_action_text = "Dealer doesn't have Blackjack — insurance lost."
            await broadcast_state(table)

    # Check for any player-only blackjacks vs non-A dealer up: settle later in dealer phase
    # ── PHASE: playing ─────────────────────────────────────────────
    table.phase = 'playing'
    for pid in active:
        p = table.players[pid]
        # Auto-finish blackjacks (no decisions to make)
        _, _, p_bj = hand_value(p['hands'][0]['cards'])
        if p_bj:
            p['hands'][0]['finished'] = True

        if all(h['finished'] for h in p['hands']): continue
        await play_player_turn(table, p)

    # ── PHASE: dealer ──────────────────────────────────────────────
    table.phase = 'dealer'
    table.dealer_hole_revealed = True
    table.last_action_text = ""
    await broadcast_state(table)
    await asyncio.sleep(TURN_BANNER_DELAY + 0.5)   # banner shows first

    # Skip dealer if all players busted/surrendered
    any_live = any(
        any(not h['finished'] or (h['finished'] and not h['surrendered'] and hand_value(h['cards'])[0] <= 21 and not h['doubled'] is None) for h in p['hands'])
        for p in table.players.values() if not p['sitOut']
    )
    # Simpler check: any active hand that didn't bust and didn't surrender?
    any_live = False
    for p in table.players.values():
        if p['sitOut']: continue
        for h in p['hands']:
            t, _, _ = hand_value(h['cards'])
            if not h['surrendered'] and t <= 21:
                any_live = True; break
        if any_live: break

    table.dealer_skipped = not any_live
    await broadcast_state(table)

    if any_live:
        while True:
            t, soft, _ = hand_value(table.dealer)
            if t >= DEALER_STANDS_ON:
                break
            table.dealer.append(draw(table))
            await broadcast_state(table)
            await asyncio.sleep(DEALER_DRAW_DELAY)
    else:
        # No live hands — give the "Dealer doesn't play" banner time to read
        await asyncio.sleep(1.5)

    # ── PHASE: resolution ──────────────────────────────────────────
    table.phase = 'resolution'
    dealer_total, _, dealer_bj = hand_value(table.dealer)
    dealer_bust = dealer_total > 21

    for p in table.players.values():
        if p['sitOut']: continue
        for h in p['hands']:
            if h['result']: continue   # already resolved (insurance BJ path)
            if h['surrendered']:
                continue   # half bet was already deducted
            t, _, p_bj = hand_value(h['cards'])
            if t > 21:
                h['result'] = 'bust'
                h['payout'] = 0
            elif p_bj and not h['isSplit']:
                # BJ pays 3:2 (only on initial hand, not split)
                h['result'] = 'bj'
                h['payout'] = int(h['bet'] * (1 + BLACKJACK_PAYOUT))
                p['chips'] += h['payout']
            elif dealer_bust or t > dealer_total:
                h['result'] = 'win'
                h['payout'] = h['bet'] * 2
                p['chips'] += h['payout']
            elif t == dealer_total:
                h['result'] = 'push'
                h['payout'] = h['bet']
                p['chips'] += h['payout']
            else:
                h['result'] = 'lose'
                h['payout'] = 0

    # Push chips updates to clients (and persist)
    table.phase_deadline = time.time() + RESULT_LINGER
    await broadcast_state(table)
    table.last_action_text = ""
    await broadcast(table, type='roundend')
    await asyncio.sleep(RESULT_LINGER)


async def wait_for_insurance(table, active_pids):
    deadline = table.phase_deadline
    while time.time() < deadline:
        if all(table.players[pid].get('insuranceDecided', False) for pid in active_pids):
            return
        try:
            await asyncio.wait_for(table.action_event.wait(), timeout=max(0.3, deadline - time.time()))
        except asyncio.TimeoutError:
            return
        table.action_event.clear()


def everyone_bet(table):
    if not table.players: return False
    return all(p['hands'] and p['hands'][0]['bet'] >= MIN_BET for p in table.players.values())

def everyone_decided(table):
    """All seated players have either placed a bet or toggled sit-out."""
    if not table.players: return False
    return all(
        p.get('skipRound') or (p['hands'] and p['hands'][0]['bet'] >= MIN_BET)
        for p in table.players.values()
    )


async def play_player_turn(table: BlackjackTable, p):
    """Play through all hands of one player (split-aware)."""
    # Brief pause so the "X's turn" banner is readable before action UI appears
    table.current_pid  = p['id']
    table.current_hand = p['currentHand']
    await broadcast_state(table)
    await asyncio.sleep(TURN_BANNER_DELAY)

    while p['currentHand'] < len(p['hands']):
        h = p['hands'][p['currentHand']]
        if h['finished']:
            p['currentHand'] += 1
            continue

        # Auto-finish 21
        t, _, _ = hand_value(h['cards'])
        if t >= 21:
            h['finished'] = True
            p['currentHand'] += 1
            await broadcast_state(table)
            continue

        # Wait for the player's action with a per-decision timer
        table.current_pid  = p['id']
        table.current_hand = p['currentHand']
        p['pendingAction'] = True
        p['turnDeadline']  = time.time() + TURN_WINDOW
        table.action_event.clear()
        await broadcast_state(table)

        try:
            await asyncio.wait_for(table.action_event.wait(), timeout=TURN_WINDOW + 0.3)
        except asyncio.TimeoutError:
            # Auto-stand
            table.last_action_text = f"{p['name']} timed out — standing."
            h['finished'] = True

        p['pendingAction'] = False
        await broadcast_state(table)

        if h['finished']:
            p['currentHand'] += 1

    table.current_pid  = None
    table.current_hand = 0


# ── Action handlers ────────────────────────────────────────────────
async def handle_bet(table, pid, amount):
    p = table.players.get(pid)
    if not p or table.phase != 'lobby': return
    h = p['hands'][0]
    if h['bet'] > 0: return  # already bet
    amount = int(amount)
    if amount < MIN_BET or amount > p['chips']: return
    p['chips'] -= amount
    h['bet']    = amount
    # First bet of the round? Start the 20s window now so the broadcast already carries the deadline.
    if table.phase_deadline == 0:
        table.phase_deadline = time.time() + LOBBY_WINDOW
    table.last_action_text = f"{p['name']} bet {amount}."
    table.lobby_event.set()
    await broadcast_state(table)

async def handle_action(table, pid, action):
    if table.phase != 'playing' or table.current_pid != pid: return
    p  = table.players.get(pid)
    if not p: return
    h  = p['hands'][p['currentHand']]
    if h['finished']: return

    if action == 'hit':
        h['cards'].append(draw(table))
        t, _, _ = hand_value(h['cards'])
        if t > 21:
            h['finished'] = True
            table.last_action_text = f"{p['name']} hit and BUSTED at {t}."
        else:
            table.last_action_text = f"{p['name']} hit."
            if t == 21: h['finished'] = True

    elif action == 'stand':
        h['finished'] = True
        t, _, _ = hand_value(h['cards'])
        table.last_action_text = f"{p['name']} stood at {t}."

    elif action == 'double':
        if not can_double(p, h): return
        p['chips'] -= h['bet']
        h['bet']    *= 2
        h['doubled']= True
        h['cards'].append(draw(table))
        h['finished']= True
        t, _, _ = hand_value(h['cards'])
        bust = ' (BUST)' if t > 21 else ''
        table.last_action_text = f"{p['name']} doubled to {h['bet']} → {t}{bust}."

    elif action == 'split':
        if not can_split(p, h): return
        new_hand = {
            'cards': [h['cards'].pop()], 'bet': h['bet'], 'doubled': False,
            'surrendered': False, 'finished': False, 'result': None,
            'payout': 0, 'isSplit': True,
        }
        h['isSplit'] = True
        p['chips'] -= h['bet']
        # Add a new card to current hand and to new split hand
        h['cards'].append(draw(table))
        new_hand['cards'].append(draw(table))
        p['hands'].insert(p['currentHand'] + 1, new_hand)
        table.last_action_text = f"{p['name']} split."
        # Auto-finish split aces (one card only)
        if h['cards'][0]['r'] == 'A':
            h['finished']        = True
            new_hand['finished'] = True

    elif action == 'surrender':
        if not can_surrender(p, h): return
        h['surrendered'] = True
        h['finished']    = True
        h['result']      = 'surrender'
        p['chips'] += h['bet'] // 2   # refund half
        h['payout']     = h['bet'] // 2
        table.last_action_text = f"{p['name']} surrendered."

    table.action_event.set()
    await broadcast_state(table)

async def handle_insurance(table, pid, take):
    p = table.players.get(pid)
    if not p or table.phase != 'insurance': return
    if p.get('insuranceDecided'): return
    p['insuranceDecided'] = True
    if take:
        h = p['hands'][0]
        cost = h['bet'] // 2
        if p['chips'] >= cost:
            p['chips'] -= cost
            p['insurance'] = cost
            table.last_action_text = f"{p['name']} took insurance ({cost})."
        else:
            p['insurance'] = 0
    else:
        p['insurance'] = 0
    table.action_event.set()
    await broadcast_state(table)


# ── Connection handler ─────────────────────────────────────────────
def parse_table_id(path: str) -> str:
    parsed = urllib.parse.urlparse(path)
    qs = urllib.parse.parse_qs(parsed.query)
    rid = (qs.get("r") or ["public"])[0]
    rid = "".join(ch for ch in rid if ch.isalnum())[:24]
    return rid or "public"

async def handle_blackjack(ws):
    table_id = parse_table_id(ws.request.path)
    table    = get_table(table_id)
    table.sockets[ws] = None

    # Initial snapshot
    await send(ws, type='hello', **table.public_state())

    try:
        async for raw in ws:
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue
            t = msg.get('type')

            if t == 'sit':
                # Take a seat at the table. Bring chips from client profile.
                if table.is_full():
                    await send(ws, type='full'); continue
                if table.sockets.get(ws) is not None: continue   # already seated

                pid = f"p{table.free_seat()}"
                name = str(msg.get('name') or 'Player').strip()[:18] or 'Player'
                chips = int(msg.get('chips') or 0)
                if chips < MIN_BET:
                    await send(ws, type='broke', chips=chips, minBet=MIN_BET); continue

                player = table.make_player(pid, name, chips, int(pid[1]))
                player['profileId'] = msg.get('profileId')
                player['hands']     = [{
                    'cards': [], 'bet': 0, 'doubled': False, 'surrendered': False,
                    'finished': False, 'result': None, 'payout': 0, 'isSplit': False,
                }]
                table.players[pid]  = player
                table.seat_order.append(pid)
                table.sockets[ws]   = pid

                # If table was idle, kick off the lobby right away so bets are accepted
                if table.phase == 'idle':
                    table.phase          = 'lobby'
                    table.phase_deadline = time.time() + LOBBY_WINDOW

                table.lobby_event.set()
                await send(ws, type='seated', yourId=pid)
                await broadcast_state(table)

            elif t == 'leave':
                pid = table.sockets.get(ws)
                if pid:
                    seat_remove(table, pid)
                    table.sockets[ws] = None
                    await broadcast_state(table)

            elif t == 'bet':
                pid = table.sockets.get(ws)
                if pid:
                    await handle_bet(table, pid, msg.get('amount', 0))

            elif t == 'action':
                pid = table.sockets.get(ws)
                if pid:
                    await handle_action(table, pid, msg.get('action'))

            elif t == 'insurance':
                pid = table.sockets.get(ws)
                if pid:
                    await handle_insurance(table, pid, bool(msg.get('take')))

            elif t == 'sitout':
                pid = table.sockets.get(ws)
                p = table.players.get(pid) if pid else None
                if p and table.phase == 'lobby':
                    p['sitOutToggle'] = bool(msg.get('on'))
                    p['skipRound']    = p['sitOutToggle']
                    table.lobby_event.set()
                    await broadcast_state(table)

            elif t == 'chat':
                # Simple chat passthrough
                pid = table.sockets.get(ws)
                if pid and table.players.get(pid):
                    text = str(msg.get('text', ''))[:120]
                    if text:
                        await broadcast(table, type='chat', from_=table.players[pid]['name'], text=text)

    except Exception:
        pass
    finally:
        pid = table.sockets.pop(ws, None)
        if pid:
            # Mark disconnected; if mid-round, auto-stand current hand
            p = table.players.get(pid)
            if p:
                p['connected'] = False
                if table.current_pid == pid and p['currentHand'] < len(p['hands']):
                    p['hands'][p['currentHand']]['finished'] = True
                    table.action_event.set()
                seat_remove(table, pid)
            await broadcast_state(table)
        cleanup_table(table)
