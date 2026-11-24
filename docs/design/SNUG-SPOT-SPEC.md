# Snug Spot — product & UI spec

A cozy, online spot-the-match game for **two players on two phones**. Each player sees their own card and a shared pile card; the first to tap the one picture their card shares with the pile wins that card. Whoever has the most cards when the pile runs out wins.

> Naming: the mechanic is the well-known "find the one matching symbol" family. The product name (**Snug Spot**) and all 26 symbol illustrations are original. Never use another game's name, logo, card art or symbol set in code, copy or metadata.

Visual reference: `design/screens/*.dc.html` (exact markup and inline styles of each screen), `design/tokens.css`, `design/symbol-sheet.png`.

---

## 1. Look & feel

Mood: **evening at a cabin table.** Dark pine felt, cream cards with a stitched edge, honey-coloured buttons, rounded type, soft chunky shadows. Calm, warm, never flashy.

| Element | Rule |
|---|---|
| Background | `--felt` with the 7 px dot texture (`.felt` class). Never a gradient wash. |
| Type | Fredoka (headings, buttons, numbers, code letters), Nunito (body). Labels are UPPERCASE 14 px / 800 / +1 px tracking in `--text-muted`. |
| Cards | Perfect circles, `--card` face, `--shadow-card` (6 px solid "thickness" + soft drop), dashed `--card-stitch` ring inset 9 px. |
| Buttons | Primary: honey fill, ink text, 58 px tall, radius 18, `--shadow-button`; sinks 3 px on press. Secondary: transparent, 2 px `--line-strong` border, linen text. Disabled/waiting: 2 px **dashed** border, muted text. |
| Player colours | **You = honey**, **opponent = coral**. Used for avatar rings, score pills, bars, highlights. Never swap them. |
| Icons | Inline 24 px stroke icons (2–2.4 px stroke, round caps). Symbols are the only illustrations. No emoji anywhere. |
| Tokens (avatars) | A symbol on a cream disc with a 3 px coloured ring. Choices: robin, mushroom, acorn, moon, mitten, fish (mug is the host default in the mockups). |

Layout target: phone portrait, designed at **390 × 844**. Must work from 320 to 480 px wide without horizontal scroll; on tablets/desktop render a centred phone-width column (max 480 px) on the felt. Card diameter on the game screen: 260 px at 390 wide; scale down to keep both cards + chrome on screen at 667 px tall (iPhone SE) — minimum symbol tap target 44 px.

---

## 2. Screens & flow

```
Welcome ──Create a room──▶ Lobby (host) ──Deal the cards──▶ Game ──pile empty──▶ Results
   │                         ▲                                   ▲                 │
   └──Join with a code──▶ Join ──Join room──▶ Lobby (guest)      └──Rematch────────┘
                                                                 Leave → Welcome
```

### 2.1 Welcome (`Main.dc.html`)
- Top bar: token chip (your token + name, default "Guest") → opens token/name editor (reuse the Join form as a sheet); sound toggle icon button (on/off state, `aria-label` "Sound is on/off").
- Hero illustration: two tilted cards, the shared mushroom ringed in honey on both, a tilted honey sticker "Same one!". Decorative (`aria-hidden`).
- Wordmark "Snug Spot" (52 px), tagline: "A cozy matching game for two. Find the one picture your card shares with the pile — before your friend does."
- Buttons pinned to bottom: **Create a room** (primary, plus icon) → creates room, goes to Lobby as host. **Join with a code** (secondary) → Join.
- Footer: "2 players · 2 phones · about 3 minutes a game".

### 2.2 Join a room (`Join.dc.html`)
- Back button + title "Join a room".
- **Room code**: 4 cream letter tiles (66 × 78, Fredoka 38). Typing a letter advances focus; Backspace on an empty tile goes back; paste of a 4-letter code fills all; letters only, auto-uppercase. Helper: "Ask your friend for the 4-letter code on their screen."
- **Your name**: text input, placeholder "e.g. Ema", max 16 chars. Remember last used name + token locally.
- **Pick your token**: 3 × 2 grid of toggle tiles (`aria-pressed`), selected = raised panel + 3 px honey ring.
- Bottom: when 4 letters are entered → **Join room MOSS →** (primary). Otherwise a dashed disabled button "Enter all 4 letters to join".
- Errors (new, style as a coral-outline toast above the button): room not found, room full, room expired. Keep the code in the tiles so they can fix one letter.
- Deep link: `/join/MOSS` opens this screen pre-filled.

### 2.3 Room lobby (`Lobby.dc.html`)
- Back button ("Leave room") + title "Your room".
- Code panel: label "Room code", 4 slightly rotated letter tiles (−3°, 2°, −1°, 3°), then **Copy code** (→ check icon + "Copied!" for 1.6 s) and **Send invite** (Web Share API with the deep link; fall back to copying the link).
- "At the table": seat rows (68 px). Each: token, name, sub-line ("Host · Mug token" / "Joined just now · Robin token"), "Ready" chip with check. Empty seat: dashed row, animated three-dot token, "Saving a seat…" / "Waiting for your friend to enter the code".
- "Game length": 3-option segmented control — Quick 12 cards (default) · Cozy 24 cards · Long 40 cards. Selected = honey fill, ink text.
- Switch: "Pause after a wrong tap" / "1 second, so guessing doesn't pay" (`role="switch"`, default on).
- Bottom: host with 2 players → **Deal the cards →**; host alone → dashed "Waiting for a second player".
- **Guest view (not in mockups, build it):** same screen, settings shown read-only, bottom shows dashed "Waiting for {host} to deal…". Settings changes by the host appear live.

### 2.4 Game (`Game.dc.html`, playable in the prototype)
Top to bottom at 390 × 844 (16 px top / 22 px bottom padding, 20 px sides):
1. Top bar 48 px: leave (×) button → confirm sheet "Leave the game? Your friend wins the cards left." · "Room MOSS" · pile counter chip "12 left".
2. Opponent row 56 px: coral-ringed token, name, live status ("Ready when you are" → "Looking closely…" → "Got the moon!"), coral score pill "3 cards".
3. Caption "THE PILE", then the **pile card** (260 px).
4. Toast line 44 px (`role="status"`, `aria-live="polite"`), pill styles:
   - hint: panel bg, soft text — "Find the one picture both cards share", "Keep looking…", "Next card!", "Last card in the pile!"
   - good: honey bg, ink text — "{Symbol}! The card is yours"
   - bad: `--miss-toast` bg, ink text — "Not that one — 1 second pause"
   - opponent: transparent, 2 px coral border, coral text — "{Name} spotted the {symbol} first"
5. **Your card** (260 px).
6. Your row 56 px (pinned bottom): honey-ringed token, "You", sub-line "Your card" or "Your card · 3 in a row" (streak ≥ 2), honey score pill.

Each symbol is a real `<button>` (`aria-label` = symbol name) positioned per `reference/layout.mjs`; the image inside is tilted, the button is not. Tapping a symbol on **either** card counts.

Feedback & motion (see `tokens.css` durations):
- **You win the round:** the shared symbol on both cards gets a 4 px honey ring + 28% honey fill + scale 1.14. After 750 ms the pile card slides down 324 px into your card's place (`slide`), and a new pile card drops in (`deal`: from −36 px, −14°, scale .88, fading in).
- **Opponent wins the round:** the symbol they matched on the pile card gets a coral ring + scale 1.1; after 1100 ms a new pile card deals in. Your card stays.
- **Wrong tap:** that symbol gets a 3 px `--miss` ring and scale .92, the card shakes (380 ms), both cards dim to 60% for the 1 s pause, taps ignored. (If the pause setting is off: ring + shake only.)
- Before the first card: a 3-2-1 countdown overlay (Fredoka 96 px numbers on a dimmed felt), not in the mockups.
- Haptics (if available): short buzz on win, double buzz on miss. Sounds: soft card flick on deal, warm chime on win, muted thunk on miss; respect the sound toggle.

### 2.5 Results (`Results.dc.html`)
- Caption "THE PILE IS EMPTY · ROOM MOSS".
- Fanned stack of three cards with the winner's token as a sticker (tie: both tokens).
- Headline + line, by outcome:
  - you win: "You win!" — "7 cards to 5. Ema owes you a cocoa."
  - you lose: "Ema wins!" — "7 cards to 5. You owe Ema a cocoa."
  - tie: "A perfect tie!" — "6 cards each. Two cocoas, then."
  - Use "1 card" for singular.
- Score panel: a row per player with token, name, "WINNER" chip, bar (width ∝ score / max), big number in the player colour.
- Two stat tiles: **Fastest spot** (your quickest valid claim, "1.6 s", "—" if none) and **Best streak** ("3 in a row").
- **Rematch** (primary): shows "Waiting for Ema…" after you press it; starts a new game in the same room when both have pressed. **Leave the table** (secondary) → Welcome.

### 2.6 States not in the mockups (build in the same style)
Connecting / reconnecting banner (coral outline pill at top: "Reconnecting…"), opponent left ("Ema left the table" sheet with Back to lobby), room expired, server unreachable, landscape on phone (ask to rotate), and a short "How to play" sheet reachable from Welcome (3 steps with a mini card illustration).

---

## 3. Components to build
`Button` (primary / secondary / waiting), `IconButton` (48 px round, panel bg), `TokenDisc` (size, ring colour), `TokenPicker`, `CodeTiles` (display) and `CodeInput` (4 inputs), `TextField`, `SegmentedControl`, `Switch`, `SeatRow` (filled / waiting), `ScorePill`, `PlayerBar` (opponent / you variants), `GameCard` (+ `SymbolButton`), `Toast`, `ResultBars`, `StatTile`, `Sheet` (bottom sheet for confirms), `Countdown`.

## 4. Accessibility
- Contrast: text pairs in `tokens.css` pass 4.5:1. One fix vs. the mockups: inside the score pills, the small "cards" label uses `--honey-on-tint` / `--coral-on-tint` (the mockup's plain honey/coral there is only 4.0 / 3.5:1); the big numbers keep honey/coral. Don't put coral or honey text on light backgrounds.
- Everything clickable is a `<button>` or `<a>`; focus ring 3 px honey, 3 px offset.
- Toast is a polite live region; announce round results ("You won the card", "Ema won the card").
- `prefers-reduced-motion`: no slide/shake/deal travel, keep the rings.
- Colour is never the only signal: winner chip has text, wrong taps show a toast.

## 5. Decisions taken during handoff
- 8 symbols per card, cards dealt on demand by the server (see `docs/GAMEPLAY.md`). This needs ≥ 22 symbols; the set now has **26** (6 new: bell, cherries, feather, pumpkin, sock, umbrella — same style, see `design/symbol-sheet.png`).
- The prototype's opponent "Ema" is simulated; in the real app both seats are real people.
- Small-text contrast fixes: pill labels (`--*-on-tint`) and input placeholder (`--placeholder` #9FB8A9).
- Game length options stay 12 / 24 / 40 as designed — on-demand dealing has no deck-size limit.
