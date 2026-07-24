# assets/

Screenshots used in the top-level [README](../README.md). Every image is a **real
capture of the running game** — the actual Vite client (`localhost:5173`) talking to
the real WebSocket server and a local Supabase auth stack, driven end-to-end through
a live match (create room → fill with bots → buy phase → combat → scoreboard) with
Playwright in a real browser. Nothing here is a mockup or a staged render.

| File | Where in the game | Notes |
|---|---|---|
| `gameplay-foundry7.jpg` | In-match, FOUNDRY-7 | First-person action phase — enemy stickmen, arena props, HUD (health / ammo / funds / frag), crosshair. The README hero. |
| `gameplay-coldline9.jpg` | In-match, COLDLINE-9 | The second map: the same authoritative arena re-lit cold and blue. |
| `lobby.jpg` | Lobby | Room code, both team rosters filled with bots, host controls (cycle map, fill with bots, start). |
| `buy-menu.jpg` | Buy phase | The armory overlay — Revolver (free) and the Kar98 (locked until affordable). |
| `scoreboard.jpg` | In-match | The hold-<kbd>Tab</kbd> scoreboard with live per-player K/D from bot combat. |
| `briefing.jpg` | Lobby (front door) | The pre-room briefing screen — objective / economy / map blurb and create-or-join. |

Capture settings: 1600×900 viewport, downscaled to 1440px wide, progressive JPEG
q90 (JPEG rather than a 256-colour PNG so the smooth 3D lighting gradients don't
band). Re-shoot by running both dev servers (see [docs/RUNNING.md](../docs/RUNNING.md))
and driving the client with Playwright.
