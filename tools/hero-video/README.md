# Hero video source

`www/media/hero.mp4` is generated from these files: an 8-second seamless loop (1280×720, 30fps) built on `stage.png`, the still from the original Project artifact video.

`entrance.html` draws every frame as a pure function of time (`render(t)`), so the first and last frames join up. What's in it:
- The old one-line tagline is painted out, and a two-line tagline is set and bent to the measured curve of the ROPEBREAK lettering (`buildBase`).
- The letters are cut out by whiteness (`prepare`), so the glow, relighting and glitch follow the lettering and never show a box.
- The orange is cooled towards blue (`coolStage`), with a steel-blue industrial grade, grime, grain, scratches and scanlines.
- Timeline: dim build-up, the hit at 2.2s (strobes, glitch, spark waterfall), and a smaller hit at 5.6s. The camera is locked off.
- Strobes are photosafe: at most 2 flashes in any second.

Owner decisions: no camera movement, no stage cannons or floor beams, mostly blue with a touch of amber, and the tagline on two lines with no shadow.

## Re-render
```
python3 -m http.server 8766          # from the repo root, in another terminal
node tools/hero-video/render.cjs /tmp/frames
ffmpeg -framerate 30 -i /tmp/frames/f_%04d.png -c:v libx264 -preset slow -crf 28 -pix_fmt yuv420p \
  -profile:v high -level 4.0 -movflags +faststart -an www/media/hero.mp4
ffmpeg -i www/media/hero.mp4 -frames:v 1 -q:v 6 www/media/hero-poster.jpg
```
Then check the flash rate (≤ 3 per second) and that the loop joins before publishing.
