# PlinkoVolume

A browser game where each ball drop changes the volume of a YouTube or SoundCloud track.

Live site:
- https://finnvnoi.azdigi.blog/plinko/

## How it works

The game mixes a simple Plinko board with a media player:

1. The player pastes a YouTube or SoundCloud link.
2. The site loads that media into an embedded player.
3. Each time the player drops a ball:
   - the current volume is reduced by 1% immediately
   - the ball falls through pegs on the canvas board
   - when it lands in a slot, the slot effect is applied to the volume
4. If volume reaches 100%, the player wins.
5. If volume reaches 0%, the player loses.

Slot effects are defined in `script.js`:

```js
const slotEffects = [-4, +5, -2, +3, -1, +2, -3, +4, -5, +6];
```

## Gameplay rules

- Start volume depends on difficulty in the URL:
  - `?diff=easy` → 70%
  - `?diff=normal` → 50%
  - `?diff=hard` → 20%
  - no `diff` param → 30%
- Fall speed can be adjusted from 0.5x to 5.0x.
- The game stores progress in cookies/localStorage, including:
  - current media
  - current volume
  - last effect
  - drop count
  - fall speed
- You can also preload media with the `web` query param.

Example:

```text
/plinko/?diff=hard&web=https://www.youtube.com/watch?v=dQw4w9WgXcQ
```

## Project structure

- `index.html` -> page layout and overlays
- `styles.css` -> visual design, layout, responsive UI
- `script.js` -> media loading, game state, physics, persistence
- `favicon.ico` -> site icon

## Technical overview

### Media support

The game supports:
- YouTube via the IFrame Player API
- SoundCloud via the Widget API

The script detects the input type automatically, then creates the matching player.

### Board simulation

The Plinko board is drawn on an HTML5 canvas.

- Pegs are generated procedurally in rows
- Balls use simple velocity + gravity simulation
- Collisions with pegs change trajectory
- Landing position determines which slot effect is applied

This is lightweight client-side physics, not a full physics engine.

### Persistence

The site saves user progress with cookies and localStorage so the session can resume after refresh.

Saved values include:
- media type/source
- volume
- drop count
- last effect
- default volume
- fall speed

## Run locally

This is a static site. You can run it with any simple local server.

Example:

```bash
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000/
```

## Notes

- The site is playable immediately once a valid YouTube or SoundCloud link is entered.
- Autoplay behavior may still depend on browser media policies.
- Some shortened SoundCloud links are resolved through oEmbed before loading.
