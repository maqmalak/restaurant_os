# Operation video scripts

Playwright (playwright-core 1.49.1, uses the installed Google Chrome) drives the real app on restaurant.localhost:5181 and
records one WebM per operation; captions and click ripples are injected into the page.

```bash
npm i playwright-core@1.49.1          # in a scratch folder with these three files
node run.js            # all; or: node run.js 02 07   (ids are the number prefixes in ops.js)
```

- Passwords are read from `~/.restaurant-site-secrets` at run time (never stored here).
- The runs create real records on the demo site (sales, orders, a closed shift). 01 needs the cashier without an open
  shift; 09 needs 08 first; 10 needs a rider with cash (after 09).
- Convert to MP4 with any ffmpeg: `ffmpeg -i X.webm -c:v libx264 -crf 23 -pix_fmt yuv420p -movflags +faststart X.mp4`.
