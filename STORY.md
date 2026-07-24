# Stickfps — Story & World

Flavour lore for the game. Everything here is fiction that dresses the existing
mechanics; none of it changes gameplay or networking. The canonical crew/briefing
copy lives in [client/src/game/lore.ts](client/src/game/lore.ts); the map
names/subtitles live in [client/src/game/maps.ts](client/src/game/maps.ts). Both
are surfaced in the lobby briefing, the in-match map tag, and the Tab scoreboard.

## The world

The old world ran on diesel and never stopped burning. When the grid finally
failed, the things that kept running were the foundries — vast, soot-black plants
that still had fuel, still had brass, still had heat. Whoever holds a working
foundry holds the only currency left that matters.

Two crews fight over the ruins:

- **The Ironclads** (Team A) — *"hold the line."* Disciplined, dug-in, territorial.
  They treat every yard they take as ground to be kept.
- **The Ash Syndicate** (Team B) — *"take what burns."* Fast, opportunistic raiders
  who strip a site and move on before the smoke clears.

## The yards

The crews fight over the same kind of ground in two places. Mechanically these
are the **same ±24m arena** — the sim only knows the bounds — so a "map" is a
palette, a light, and a bit of set-dressing (see
[client/src/game/maps.ts](client/src/game/maps.ts)); the fiction gives each a name
and a mood. The host cycles between them in the lobby.

- **FOUNDRY-7** — *decommissioned munitions yard.* Warm, soot-and-rust dusk:
  shipping containers, fuel barrels, a swinging crane, catwalk towers, steam
  vents, and a patrol drone still running its old route under the smokestacks.
- **COLDLINE-9** — *frozen frontier depot.* The same yard gone cold: blue-white
  floodlight, a gantry frame against the dark, frost on the steel. A depot the
  Ash Syndicate stripped once already and the Ironclads want back.

Cover is thin and the sightlines are long on either — both reward movement over
camping. (The base arena is built in
[client/src/game/environment/Environment.tsx](client/src/game/environment/Environment.tsx);
the map theme just re-lights and re-dresses it.)

## The kit

Both crews scavenge the same two guns — a **Revolver** and a bolt-action
**Kar98** — plus a **frag grenade** cooked from foundry brass, one to a fighter,
recharged each round. A crew that runs a killstreak fights *faster* (the
adrenaline of a hot streak — quicker hands and feet) until they're put down.

## How the fiction maps to the loop

| Fiction | Mechanic |
| --- | --- |
| Two crews contest the yard | 5v5 round-based match |
| "Wipe them or hold the yard till the sirens die" | Round ends on a team wipe or the action-phase timer |
| Banking scrip between raids | Round-win money, spent in the buy phase |
| Keep moving, slide the corners | Krunker-style slide-hop / air-strafe movement |
| The contract is decided | First crew to clinch the majority of rounds wins the match |

## Where it shows up in-game

- **Lobby** — map callsign in the tagline, a setting blurb, a mission briefing on
  the front door, and each roster labelled with its crew.
- **HUD** — the active map's callsign above the score, and the crew names +
  the yard subtitle on the buy-phase "SETUP" banner.
- **Scoreboard** (hold Tab) — each team header carries its crew name.
