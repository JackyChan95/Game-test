# Lantern Drift

A calm chain-and-combo game for phones. Glowing lanterns drift across a pond at dusk;
drag your finger through lanterns of the same colour to release them.

No timer, no game over. Play as long as you like.

## Play

It's a single self-contained file: open `index.html` in any mobile browser.
On a phone, use "Add to Home Screen" to play it full-screen like an app.

To try it locally from your computer on your phone (same Wi-Fi):

```bash
cd lantern-drift
python3 -m http.server 8000   # then open http://<your-computer-ip>:8000 on the phone
```

## How it plays

There are seven lantern colours, in rainbow order: red, orange, yellow, green, blue, indigo, violet.
Touch a lantern and drag to build a chain. There's no distance limit, so any matching lantern on the pond can join.

- **Same-colour chain:** link lanterns that are all one colour.
- **Rainbow chain:** link each lantern to the next colour in the spectrum (red → orange → yellow …).
  It works in either direction and wraps round from violet back to red.
  Your first link decides which kind of chain it is. Lanterns that fit next pulse with a faint ring.
- **Undo:** slide straight back along the thread to drop the last link. Swiping across an earlier lantern on the way somewhere else doesn't undo.
- **Score:** a same-colour chain of *n* is worth `n² × 10`; a rainbow chain `n² × 15`.
  Each full red-to-violet run adds +350 (**full spectrum**), and clearing every lantern of one colour adds +100.
  All of it is multiplied by flow.
- **Flow (the combo):** release another chain within about 4 seconds to raise flow (×2, ×3, …).
  Each step adds +25% to points, lifts the melody, and warms the colour of the water.
- **Spirit lantern:** chains of 5+ leave a white lantern that can stand in for any colour. A full spectrum leaves an extra one.
- **Sound:** each link plays the next note of a pentatonic scale over a soft ambient pad.
  The speaker button mutes it. Android phones also give a light haptic tick per link.

Your best score is kept on the device. Add `?debug` to the URL to expose game state as `window.__ld` (used for automated tests).
