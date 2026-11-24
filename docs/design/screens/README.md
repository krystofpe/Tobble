# Screen sources (visual reference)

These five files are the exact screens from the Snug Spot design canvas, exported as-is. They are **not runnable** here (they need the canvas runtime), but they are plain HTML with a tiny template layer, so read them as the pixel spec:

| File | Screen |
|---|---|
| `Main.dc.html` | Welcome |
| `Join.dc.html` | Join a room |
| `Lobby.dc.html` | Room lobby (host). Prop `friend`: "Joined" / "Waiting" |
| `Game.dc.html` | Game — contains the full prototype game loop with a simulated opponent |
| `Results.dc.html` | Results — also mounted inside Game when the pile is empty |

How to read them:
- Everything between `<x-dc>` and `</x-dc>` is the markup. All sizes, colours, radii and shadows are in the inline `style` attributes — copy values from there (they map to `design/tokens.css`).
- `<helmet>` = global CSS for that screen (fonts, felt texture, keyframes).
- `{{name}}` = a value computed in `renderVals()` in the `<script type="text/x-dc">` block at the bottom. `onClick="{{fn}}"` = event handler.
- `<sc-for list="{{items}}" as="item">` = map/repeat; `<sc-if value="{{cond}}">` = conditional render.
- `<a href="Lobby.dc.html">` = navigation to that screen.
- `<dc-import name="Results" …>` = renders `Results.dc.html` as a child component with those props.
- Image paths point to `../../assets/symbols/*.svg`.

The game logic in `Game.dc.html` (`tap`, `oppClaim`, `advance`) is a **single-device simulation**. Use it for feel and timings only; the real rules live in `docs/GAMEPLAY.md` and run on the server.
