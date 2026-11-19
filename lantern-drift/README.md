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

- **Chain:** touch a lantern and drag through neighbours of the same colour. Slide back to undo the last link.
  Lanterns you can reach next pulse with a faint ring, and the world slows down while you draw.
- **Score:** a chain of *n* lanterns is worth `n² × 10`, times your flow multiplier.
- **Flow (the combo):** release another chain within about 4 seconds to raise flow (×2, ×3, …).
  Each step adds +25% to points, lifts the melody, and warms the colour of the water.
- **Spirit lantern:** chains of 5+ leave a white lantern behind that links with any colour.
- **Tide bloom:** chains of 8+ also release every other lantern of that colour on screen.
- **Sound:** each link plays the next note of a pentatonic scale over a soft ambient pad.
  The speaker button mutes it. Android phones also give a light haptic tick per link.

Your best score is kept on the device. Add `?debug` to the URL to expose game state as `window.__ld` (used for automated tests).
