# Mosc-tools — Presenter View for Google Slides + Ontime

A fullscreen, custom presenter view for Google Slides that adds what Google's own view can't give you:
an Ontime countdown, a confidence monitor that can live on any machine on the show network,
and a dark/light theme. One HTML file. No install, no build. Double-click and go.

```
Mosc-tools--Presenter-View.html   ← the whole app
bridge/Code.gs                    ← small Apps Script that reads private decks as you
extension/                        ← Chrome extension for the playback laptop (follow mode)
```

Hosted copy: [moscone.ca/sheetspresenter.html](https://moscone.ca/sheetspresenter.html) (Ontime Cloud only — see Network notes).
Download: grab `Mosc-tools--Presenter-View.html` from this repo (Code → Download ZIP, or open the file and use the download button).

![dark](docs-screenshot-dark.png)
![light](docs-screenshot-light.png)

## What you get

- **Current slide** (large, 1600 px image) with slide number / total
- **Next slide** thumbnail with its number — click it to advance
- **Speaker notes** for the current slide, with Google's formatting kept — relative font sizes, bold/italic/underline, bullets and indents, coloured text. `A−` / `A+` (or `−` / `+`) scale everything together, so an 18 pt heading stays bigger than 11 pt body text. Turn formatting off in Settings if you'd rather have plain text.
- **Ontime countdown** with the running cue and the **next** cue (from Ontime's `eventNext`) — main timer of the running cue, or AUX 1/2/3. Amber under 3 min, red under 1, flashing past zero.
  Shows the running cue (number chip in its Ontime colour), "of 20:00" duration, Ontime's *message to stage*, and the show clock.
- **Dark / light** toggle (`D` or the moon/sun button), remembered per browser
- **Setup screen** with a box for the Google Slides link and one for the Ontime link (local IP or Ontime Cloud)
- **Slide grid** (`G`) to jump anywhere; hidden slides are skipped like Google does when presenting
- **Program output window** (`O`) — optional full-res mirror of the current slide for a second display, `B` to black it
- Auto-refresh: deck edits picked up every 90 s, expired image URLs refetched, Ontime socket reconnects with backoff, 10 s host heartbeat
- Ontime v3 **and** v4 protocols

## Quick start

1. Open `Mosc-tools--Presenter-View.html` in Chrome or Edge (double-click it). Press `F` for fullscreen.
2. Paste the **Google Slides link** (the normal share/edit link — not a "Publish to web" `/d/e/2PACX…` link).
3. Paste the **Ontime link**:
   - Local Ontime: `192.168.1.50:4001` (port is optional; 4001 is assumed)
   - Ontime Cloud: the show code (`abc123`) or the full link `cloud.getontime.no/abc123`
   - Leave blank to run without a timer
4. Choose the **deck access** method (see below), click **Open presenter view**.

Everything you enter is saved in that browser's localStorage and re-used next time. Click the gear (`S`) to change anything.
`Try the demo` runs a simulated deck and timer with no connections at all.

## Reading decks that aren't public — the bridge

This is the same pattern as the BenchBoss / Shiftbook sheet bridge: a small Apps Script web app deployed from **your** Google
account, *Execute as: Me*, protected by a token. It runs as you, so any deck you can open in Slides — your own, shared with you,
or inside a client's shared drive — the presenter view can read. No OAuth pop-ups, no Cloud Console project, no sharing decks publicly,
and it works from a `file://` page (Google sign-in doesn't).

Setup once (~3 minutes):

1. Go to [script.google.com](https://script.google.com) → **New project** → paste `bridge/Code.gs` over the default `Code.gs`.
2. Change `TOKEN` to a long random string.
3. Left sidebar **Services (+)** → **Google Slides API** → Add. (This is what makes the slide images.)
4. Select the `test` function → **Run** → approve the permissions prompt.
5. **Deploy → New deployment → Web app**: *Execute as* **Me**, *Who has access* **Anyone**. Copy the `…/exec` URL.
6. In the presenter view, paste the `/exec` URL and your token.

"Anyone" is required because the HTML calls the bridge anonymously — the token is what gates it. Anyone who has your token
could read decks you can open, so treat it like a password (it never leaves your browser except to Google). Rotate it by editing
`TOKEN` and creating a new deployment version.

What the bridge does per request: one `deck` call (title, slide ids, notes, hidden flag, revisionId) and `thumbs` calls in batches
of 4 (Slides API `getThumbnail`, LARGE = 1600 px). Image URLs are Google-signed and live ~30 minutes; the view refreshes them itself.
A 60-slide deck fully caches in about a minute in the background — current and next are always fetched first.

### Alternative: API key (public decks only)

If a deck is shared as **Anyone with the link can view**, you can skip the bridge: create an API key in Google Cloud Console with
the **Google Slides API** enabled and pick *API key* on the setup screen. It cannot read anything that needs sign-in.

## Keeping it in sync with the live show

Google does not expose "which slide is on screen right now" — not in the Slides API, not in Apps Script. Two ways to stay together:

### Follow mode (optional — off by default)

A tiny Chrome extension on the **playback laptop** watches the presenting tab. Google writes the current slide ID into that tab's URL,
and it changes only on a real slide change — never on a build/animation click. The extension sends that ID to your bridge, and the
presenter view waits on the bridge and jumps when it changes. Builds, videos and transitions all run natively on the show machine, and
this view moves only when the show moves.

Setup (once):

1. **Bridge**: paste the new `bridge/Code.gs` over your Apps Script project and create a new deployment (Deploy → Manage deployments →
   edit → New version). `ping` should now say version 5.
2. **Extension** (playback laptop, Chrome/Edge/Brave): unzip `extension/`, open `chrome://extensions`, turn on *Developer mode*,
   *Load unpacked*, pick the folder. Click its toolbar icon and paste the same bridge URL and token the presenter uses. Pin it if you
   want to see the "sent ✓" status.
3. **Presenter view**: Settings → tick *Follow the live show*. The Slides pill shows **LIVE** once the first slide arrives.

Latency is roughly a second, which is too slow for a tight caller — the build-step import above is the better fix for a shared
clicker. Follow mode remains for setups where the presenter is only watching.

While following, arrow keys / space / PageUp-Down on the presenter machine are ignored on purpose (a whisper "following live"
appears bottom-centre). That matters when a single clicker such as a Perfect Cue fires both laptops: builds consume presses on the
show machine but would push this view ahead. Number + Enter, Home/End, the grid and the mouse still work, and the next slide change
from the show snaps the view back. If you want the arrows live anyway (two clickers, or a human calling), tick
*Still let arrow keys / clicker move this view while following*.

Latency is about a second (extension 0.25 s + Apps Script). Only the slide ID travels; nothing from the deck. The presenter keeps
one request open to the bridge for up to 25 s at a time and it returns as soon as the slide changes, so it is one call per slide
change plus one every 25 s, not a poll storm. If the show laptop is presenting a different deck the view says so in
*Problems this session* and does not follow it. The extension can also follow the editor (edit view) — tick it in the popup; handy
for rehearsal.

### Manual mode

- **Arrow keys / space / PageUp-Down / Home / End** step through. **Type a number + Enter** jumps (`7B` + Enter for a build step). Mouse wheel over the current slide works too.
- A USB clicker is just arrow keys — plug it into the machine running this page.
- **Program output** (`O`) opens a second window with the full-res current slide. Drag it to the projector display,
  double-click for fullscreen, and this page becomes the whole playback system (no transitions/video/animation — static slides only).
  Arrow keys work in either window; `B` blacks the output.
- **External control hook** — any script or extension can drive it:
  `window.postMessage({ type: 'mosc-presenter', action: 'goto', index: 12 }, '*')` (also `slideId`, `delta`, `next`, `prev`, `black`, `label`),
  or change the URL hash to `#12` / `#7B` / `#slide=id.g1234abcd`.

## URL parameters

Bookmark a fully configured view for a show, e.g. in Ontime's own "external" folder or a kiosk shortcut:

```
Mosc-tools--Presenter-View.html?slides=<link or id>&ontime=10.1.1.100:4001&bridge=<exec url>&token=<token>&timer=main&theme=dark
```

| Param | Meaning |
|---|---|
| `slides` | Google Slides link or ID |
| `ontime` | `ip:4001`, `cloud.getontime.no/code`, or bare show code |
| `bridge` + `token` | Apps Script bridge (private decks) |
| `key` | Slides API key (public decks) — used instead of the bridge |
| `timer` | `main` (default), `auxtimer1`, `auxtimer2`, `auxtimer3` |
| `theme` | `dark` (default) or `light` |
| `demo=1` | Simulated deck + timer |
| `#12` / `#slide=id.…` | Start on a slide |

## Keys

| Key | Action |
|---|---|
| `→` `↓` `PgDn` `space` | Next slide |
| `←` `↑` `PgUp` `Backspace` | Previous slide |
| `Home` / `End` | First / last slide |
| digits then `Enter` | Jump to slide number |
| `G` | Slide grid |
| `O` | Open program output window |
| `B` | Black the program output |
| `D` | Dark / light |
| `F` (or double-click the slide) | Fullscreen |
| `+` / `−` | Notes bigger / smaller (scales Google's sizes proportionally) |
| `R` | Reload the deck now |
| `S` | Settings |
| `Esc` | Close grid / settings |

## Slides with click-builds (animations)

The Slides API renders each slide as one image with every animation already played and exposes no animation data at all, so on
its own this view would count a slide with four clicks as one press — and a clicker that fires both laptops (Perfect Cue) drifts.
The animation timing does exist in the deck's **PowerPoint export**, so the presenter reads it from there:

1. Settings → *Build steps* → **Download the .pptx from Google** (opens Google's export in a new tab using your login; works for any
   deck size — a 335 MB deck with video is fine).
2. Drop the downloaded file anywhere on the presenter page (or *choose it* in Settings). Only the tiny slide-timing XML is inflated,
   so even a 300 MB file imports in well under a second; nothing is uploaded anywhere.

A slide with N click-triggered effects then shows as **7, 7A … 7N**; the next real slide is still **8**; total, grid, Next card and
URL hash all use those labels; the notes stay on 7's notes throughout. "After previous" / "with previous" effects need no press and
are not counted. The result is stored per deck in the browser and survives reloads. If the deck is edited afterwards the Settings
line warns you and steps are matched by slide ID; re-import after changing animations. **Forget imported builds** removes them.

Manual override still works: add `[build]` to the speaker notes of a duplicated slide to make it a step by hand.

## Slide images and the local cache

The first time a deck is opened the presenter pulls every slide image (1600 px) through the bridge, 8 slides per request, one request at a time — current slide first, forward to the end, then backwards to slide 1 — and stores the bytes in the browser's IndexedDB. From then on the images come off disk instantly; Google is only asked again when the deck's revision changes or you press **Clear slide cache & re-download** in Settings. Expect roughly 100–300 KB per slide, so a 100-slide deck is around 20 MB. Each browser profile has its own cache, so pre-open the deck on the show machine before doors.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| "No reply within 90 s" or (older builds) "signal is aborted without reason" | The bridge was too slow. Code.gs v1 read notes slide-by-slide through SlidesApp, which takes 30 s+ on a big deck. Paste the current `bridge/Code.gs` (v2 — one Slides API call for the whole deck), make sure **Services (+) → Google Slides API** is added, then **Deploy → Manage deployments → ✎ → Version: New version → Deploy**. Editing the code alone does not update a live deployment. |
| "Unexpected response (not JSON)" | The deployment is not set to *Who has access: Anyone* — Google returned a sign-in page instead. |
| "Bad token" | Token in the view doesn't match `TOKEN` in Code.gs (case-sensitive, no spaces). |
| "Enable Google Slides API under Services" | Step 3 was skipped. Add the service, run `test` once, redeploy a new version. |
| Deck loads but images never appear | Same as above — thumbnails need the Slides API service. |
| Ontime pill stays red | Wrong IP/port, firewall on the Ontime machine, or page is served over https (see below). |

Quick check of the bridge in a browser tab: `…/exec?action=ping&token=YOURTOKEN` should return `{"ok":true,"user":"you@…","version":2,"slidesApi":true}`.

## Network notes

- The page needs **internet for Google** (deck + images) and **network to Ontime** (LAN for a local server, internet for Ontime Cloud).
- Local Ontime is reached over plain `ws://` / `http://` — that is fine from a `file://` page or an `http://` page.
  If you ever host this page over **https**, browsers will block `ws://` to a local IP; Ontime Cloud (`wss://`) still works.
- Ontime must allow the connection: default port 4001, firewall open on the Ontime machine.
- Thumbnail URLs are Google-signed and public for ~30 minutes to anyone holding the URL — normal for the Slides API.

### Square boxes in the speaker notes
Fixed in 1.4.1. Google Slides stores Shift+Enter as a vertical-tab character (U+000B) and Chrome draws it as a box; the view now turns it into a line break. Wingdings-style bullets from PowerPoint imports are mapped to normal bullets.

### The Slides pill turned red
Something failed quietly — usually a Google time-out while pulling notes or images. Nothing is shown on screen during a show. Open Settings (`S`) → **Problems this session** to read the log (it also clears the red), then press the ↻ sync button (or `R`) to re-pull notes and re-download every image. The old images stay up until the new ones arrive.

### Notes show as plain text (no bold / sizes / colours)

Open Settings (`S`) and click **Test bridge & notes formatting**. The report shows the bridge version, whether the Slides API service is enabled, how many slides carry formatting data, and an example styled run — plus the fix for whatever it finds. The info block above it also shows **Bridge vN** and **Notes formatting**. If it says the bridge is v1 or v2, the deployed Apps Script is old: open the script, replace the code with the current `bridge/Code.gs`, then **Deploy → Manage deployments → ✎ → Version: New version → Deploy**. Saving the file is not enough — Apps Script only serves the code that was in the last *deployment*. Reload the presenter view afterwards (a hard refresh, `Ctrl`+`F5`, if you use the hosted copy).

### Correct token gives a "Sorry, unable to open the file" page (HTTP 404), wrong token gives JSON

The deployment is live but the script was never authorized, so the moment it touches a Google service (looking up your account, reading Slides) Google serves its "Sorry" page instead of a catchable error. Typical after pasting Code.gs into a **new** project or after adding the Slides API service. Fix: in the Apps Script editor pick `test` in the function dropdown → Run → Review permissions → choose your account → Advanced → Go to … (unsafe) → Allow. Reload the presenter; no redeploy needed.

### Everything hangs, even the ping ("No reply within … s")

A ping does no work, so if it hangs the script itself is stuck: Apps Script allows about 30 simultaneous executions per user, and a slow deck request that gets retried piles up until nothing answers. Close every presenter tab for about 6 minutes (the maximum run time of a stuck execution), then open **Executions** in the Apps Script editor (clock icon, left sidebar). It lists every call with its duration and error — that is the ground truth. From 1.3.1 the presenter never overlaps deck requests and backs off after failures, so this should not recur.

### Bridge URL gives "Sorry, unable to open the file" / 404

Google sometimes shows the web-app URL as `https://script.google.com/macros/**u/1/**s/…/exec`. That account-scoped form only works in the browser profile that owns the script and 404s everywhere else. Delete the `u/1/` so it reads `https://script.google.com/macros/s/…/exec`. (The presenter now does this for you when you paste.) Also make sure it ends in `/exec`, not `/dev`.

If you test the ping URL by hand and your token contains `&`, `#`, `%` or `+`, the browser will cut it short — the presenter encodes it correctly, but for hand tests either URL-encode it or use a token made of letters and digits.

## Version history

- **1.7.0** — build steps read from the deck's PPTX export (Settings → Build steps: download from Google, drop the file on the page). Counts click-triggered effects per slide from the `<p:timing>` XML with a built-in zip reader (DecompressionStream, slices only — 339 MB file in ~0.1 s), expands slides into 7, 7A… virtually (same image and notes), stores per deck + revision in localStorage, warns and matches by slide ID after edits, *Forget imported builds*. Pill counts builds; cache/notes counters use real slides. Follow mode now off by default.
- **1.6.0** — follow the live show. New `extension/` (Chrome, load unpacked on the playback laptop) reports the on-screen slide to the bridge; bridge v5 adds `setCurrent` / long-poll `current` (CacheService only). Presenter: *Follow the live show* setting (default on in bridge mode), LIVE pill, arrows/clicker ignored while following unless allowed, unknown slide → deck refresh, other-deck guard, old-bridge notice. Fixes drift when one clicker (Perfect Cue) fires both laptops and builds eat presses on the show machine.
- **1.5.0** — build steps. Google's API renders each slide as one flat image with every animation already played, so click-builds can't be shown. Duplicate the slide once per step instead, and put `[build]` in the speaker notes of each continuation slide: the presenter numbers them 7, 7A, 7B… and the next real slide stays 8 (the total counts real slides only). A continuation slide whose notes contain only `[build]` shows the base slide's notes. Type `7B` + Enter (or `#7B` in the URL) to jump to a step; the grid and Next card show the same labels. Slides pill reads e.g. "Slides · 24 · 3 builds".
- **1.4.2** — overtime timer no longer blinks to black: it pulses gently between red and light red while counting up.
- **1.4.1** — show-safe error handling: problems (deck/thumbnail time-outs, bridge version) no longer pop up on screen; they go to a "Problems this session" log in Settings and the Slides pill quietly turns red until you open Settings. New sync button (↻, left of the Slides pill, or `R`) re-reads notes and slide order from Google Slides and re-downloads every image, while keeping the old images on screen until the new ones arrive. Fixed square boxes in speaker notes: Google Slides stores Shift+Enter as a vertical-tab character (U+000B) that Chrome draws as a box — now rendered as a line break; PowerPoint-import Wingdings bullets are mapped to normal bullets.
- **1.4.0** — whole-deck local slide cache. On load the presenter downloads every slide image once, starting at the current slide and running forward to the end, then backwards to slide 1, and stores the bytes in the browser's IndexedDB keyed by deck + revision. Reopening the presenter for the same deck restores the images from disk without contacting Google; editing the deck (new revision) invalidates and re-downloads. Header pill shows "Caching slides n/N" while it works; Settings shows cache size and a "Clear slide cache & re-download" button.
- **1.3.3** — transient Google front-door errors (HTTP 404/429/5xx "Sorry" pages) are retried twice before being reported; thumbnails are fetched 6 per call and trickle after the first two batches so the bridge is never hammered; Test report pings three times, counts recent bridge calls, and continues to the deck test even if the ping fails.
- **1.3.2** — Test report recognises the unauthorized-script case (HTTP 404 on a correct token) and says exactly what to click; bridge ping answers even before authorization and reports `authorized`.
- **1.3.1** — deck requests never overlap and back off (20→120 s) after failures, so a slow bridge can't exhaust Apps Script execution slots; Test report shows which path the bridge used and why the fast path failed, if it did. Bridge v4: reports `via`/`fastError`/`ms`, and the SlidesApp fallback skips per-run formatting on decks over 40 slides.
- **1.3.0** — Countdown card shows Ontime's **Next** cue (cue number, title, planned duration) under the current one; the time-of-day clock moved to the header pills.
- **1.2.3** — bridge URL field accepts and normalises `…/macros/u/1/s/…/exec` and `/dev` URLs to the universal `/macros/s/…/exec` form.
- **1.2.2** — "Test bridge & notes formatting" button in Settings produces a plain-language diagnostic report.
- **1.2.1** — Settings shows bridge version and whether formatted notes arrived; warns when the bridge is older than v3.
- **1.2** — speaker notes keep Google Slides formatting (sizes, bold/italic, bullets, colours); A−/A+ scale proportionally. Bridge v3 (redeploy a new version to get formatted notes).

- **1.1** — speaker notes moved to the full right half; bridge v2 reads the whole deck in one Slides API call (fixes timeouts on big decks); clearer on-screen errors with auto-retry.
- **1.0** — first release: current/next/notes, Ontime main + AUX timers, dark/light, bridge + API-key access, grid, program output, external sync hook.

mosc-tools · [moscone.ca](https://moscone.ca)
