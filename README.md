# CuriousTube

> Watch what you're curious about, not the algorithm's dictate.

A Chrome extension (Manifest V3) that reduces YouTube to a search engine.
Without logging you out, it hides the home feed, the sidebar, the
recommendations, Shorts and everything else that competes for your attention;
what is left is the **search box, the search button and the search results**.
Subscriptions are the one exception — that list is yours, not the
algorithm's — and it stays one click away in the dock.

## What it hides

| Hidden | Kept |
| --- | --- |
| Home feed, Explore, Trending and the other `/feed/*` pages | Search box and search button |
| Sidebar (guide) and mini guide | Search results |
| Top-bar avatar (replaced by our own account link) | Subscriptions (`/feed/subscriptions`) and the account hub (`/feed/you`) |
| Top-bar logo, create and notification buttons | The player (`/watch`) and the video title |
| "Up next" recommendations, comments and description (the last two can be switched back on) | |
| Shorts everywhere (`/shorts/<id>` → `/watch?v=<id>`) | |
| Search history and autocomplete suggestions | |
| Ads, promo bubbles, end-screen cards | |

Routing is decided by `currentPage()` in `content.js`. `/`, `/feed/trending`,
`/feed/explore`, `/feed/storefront` and `/gaming` are emptied, and so is
anything else that starts with `/feed/` — except `/feed/subscriptions` and
`/feed/you`, which are left alone because they are your own lists and both are
reachable from the dock or the account link; emptying them would turn their own
buttons into dead links. `/results` and `/watch` get their own layouts, and
everything else (channels, playlists) is untouched.

Your session lives in cookies, so **you stay signed in** — only the account UI
disappears.

## Install (developer mode)

1. Open `chrome://extensions`.
2. Turn on **Developer mode** in the top right.
3. Click **Load unpacked** and pick this folder.
4. Reload any open YouTube tab once.

## What you get

On an emptied page the search box sits in the **middle of the screen** and
nothing else is on it: no greeting, and YouTube's stock "Search" placeholder is
removed too. Run a search or open a video and the bar returns to its usual spot
in the top bar. Focusing the box swaps YouTube's blue ring for a **red** one
plus a soft glow — only color and shadow change, so the box neither grows nor
shifts.

A wallpaper is spread across the whole page (`cover` + `fixed`, so it does not
scroll). There is a whole catalog rather than one file: the built-in images in
`wallpapers/` plus whatever you upload. The image is applied at runtime through
the `--ymin-wallpaper` variable, because a path inside the extension cannot be
resolved from CSS alone. It shows at full brightness on the blank page and gets
a light scrim on results and watch pages so text stays readable.

`logo.png` appears in two mutually exclusive places: large above the search box
on the blank page, and small in the top-left corner of content pages, where it
takes over as the **home button**. It does not replace YouTube's own home link —
that `<a href="/">` stays in the DOM and we only hide the YouTube mark inside it
and drop our image in — so clicks still go through YouTube's SPA routing (no
full reload) and keyboard access is unaffected.

### The account link

The top-bar avatar is hidden, but our own link (`#ymin-account`) takes the
top-right corner: a round avatar that opens **your own channel**.

Neither the address nor the avatar is guessed; both are learned from YouTube's
DOM and stored in `chrome.storage.local`. The avatar is read from the top-bar
`img` on `settle()` retries, since Polymer paints it late. The channel address
comes from YouTube's account header, and on `/feed/you` a fallback looks at
channel links outside foreign scopes (menus, shelves, video cards) and accepts
one only if there is exactly **one** candidate — ambiguity counts as failure,
because sending you to the wrong channel is worse than leaving the link where it
is. Until it is learned, the link points at `/feed/you`, so it is never dead.
Once learned it opens the channel's **`/videos`** tab, since the main tab shows
the trailer and featured content instead of uploads.

### Dock and settings panel

A small dock sits at the **vertical middle of the right edge**. It is on every
page and stays put **even when the extension is off**, since that gear is the
only way to switch it back on; it hides in fullscreen. The middle of the right
edge is the one strip YouTube leaves free on every route — every bottom offset
we tried collided with the player controls, the floating queue button or the
Share/Save row and swallowed clicks. Above the gear is a **Subscriptions**
shortcut, a real `<a href="/feed/subscriptions">`, so middle-click opens it in a
new tab.

The gear opens a panel with two tabs. **Wallpapers** is a grid: the first tile
is a "+" card that uploads an image from your computer, then the built-in
wallpapers, then your own uploads (hover for a delete button). Clicking one
changes the background instantly. **Settings** has six switches and a storage
summary:

| Switch | What it does | Default |
| --- | --- | --- |
| Extension Enabled | Master switch. Turning it off reloads the page and the extension touches nothing. | On |
| Comments | **Shows** the comment section under a video. | Off |
| Description | **Shows** the video description and its panels. | Off |
| Shorts | **Shows** Shorts shelves, Shorts results and the Shorts menu entry. | Off |
| Grayscale Thumbnails | Drains the color from thumbnails; hovering brings it back. | Off |
| Shuffle Wallpaper | Picks a random wallpaper each time the home page opens, uploads included. | Off |

Comments / Description / Shorts read as "show this", which is why they default
to off. Grayscale works the other way round: its class is added when on.

The master switch removes the `ymin-on` class from `<html>`, which disables the
whole style layer in one move, and the feature classes hang off it too. The tab
that flips it reloads itself (a clean load beats rewinding a live SPA by hand);
other open tabs catch up quietly through `storage.onChanged`. **The Shorts
redirect follows this switch:** while Shorts are off, `/shorts/<id>` becomes
`/watch?v=<id>`.

### Uploads and storage

An uploaded file is read as base64, but before it is stored it is **downscaled
and re-encoded** on a canvas (2560 px longest edge, WebP, with lower-quality
retries). Base64 is ~33% larger than binary, so a raw photo could fill the quota
on its own; images under 700 KB are kept as-is so they are not degraded.

Storage is deliberately split in two: `customWallpapers` holds only metadata
(`{id, bytes, addedAt}`), while each image's base64 lives under its own
`ymin:custom:<id>` key. That way opening a page fetches just the selected image
instead of all of them. The guards are 3 MB per image, 12 images at most, and a
512 KB safety margin checked with `getBytesInUse`; over the limit **nothing is
written** and the panel says why.

Preferences live in `chrome.storage.local`, shared across tabs and sessions. A
copy of the small values also sits in the page's `localStorage` (`ymin:prefs`)
where it can be read synchronously — `chrome.storage` is async, and this cache
keeps the wallpaper from flashing wrong on the first paint. Only small values go
there: the six switches, the selected wallpaper, the learned channel and avatar
URLs, and the **ids** of uploaded images. Base64 data never does; it would eat
the page's localStorage quota, which is shared with YouTube's own data. The
switches have to be cached as well — otherwise a disabled extension would still
apply everything at `document_start` and only undo it once `chrome.storage`
answered, so the page the user turned off would flash into view. The ids are
there for the same reason: shuffle makes its first pick before storage answers,
and without them your own images could not be in that draw.

## Files

| File | What it is |
| --- | --- |
| `manifest.json` | MV3 definition. The only entry in `permissions` is `storage`; page access is not a separate permission but comes from `*://www.youtube.com/*` and `*://m.youtube.com/*` in `content_scripts.matches` — that is what the store panel calls a "host permission". |
| `content.css` | The hiding layer. Injected at `document_start`, so the page never flickers. |
| `content.js` | The core: SPA route tracking, the Shorts redirect, placeholder cleanup, sweeping late-loading ad and shelf nodes, the wallpaper catalog, uploads and quota handling, feature classes on `<html>`, the account link, preferences and their sync cache, and the search-box safety valve. Exposes its API to the settings UI on `window.__curiousYouTube`. |
| `settings-ui.js` | The dock and the drawer panel: wallpaper grid, upload card, the six switches, storage summary, focus trap and Escape. |
| `wallpapers/` | Built-in wallpapers — 11 of them right now. Declared as `web_accessible_resources: ["wallpapers/*"]`, resolved at runtime with `chrome.runtime.getURL`. |
| `logo.png` | Shown above the search bar and in the top bar. |
| `small-logo.png`, `icons/generate_icons.py` | Icon source and the generator that turns it into 16/48/128 px icons (`python3 icons/generate_icons.py`). Build time only; neither is used while the extension runs. |

## Customizing

To add a wallpaper, drop the file into `wallpapers/` and add a line to the
`WALLPAPERS` array in `content.js` — the manifest already covers it with a
wildcard. A catalog entry may set its own `size` and `position`; without them
`cover` / `center` is used. Gaps in the numbering are intentional (5, 6, 7, 13
and 15 are missing): **the file name is the stored preference**, so reusing a
deleted image's number would silently move everyone who picked it to a different
background.

To change the icon, replace `small-logo.png` and run the generator; it
center-crops non-square sources rather than squashing them, and needs no
dependencies. To change the logo, replace `logo.png` — note that only about 44%
of the current file's height is filled, so a cropped file will need its size
rules adjusted.

Everything with a switch in the panel (comments, description, Shorts, grayscale,
shuffle, the wallpaper) should be changed there, not in CSS. Beyond that, the
hiding rules are grouped by topic in `content.css` and the blocked routes are
the `BLOCKED_PATHS` and `ALLOWED_FEEDS` sets in `content.js`.

## Notes

- The extension watches its own back: on every navigation it measures whether
  the search box is really on screen, and if it is not, it adds `ymin-safe` to
  `<html>`, which switches off suggestion hiding and centering. A broken
  selector costs you those two features at worst — it never leaves you on a
  blank screen. A warning shows up in the DevTools console when this happens.
  If something still looks wrong, reload the extension from
  `chrome://extensions` and refresh the YouTube tab.
- YouTube changes its UI often; if a section reappears, its custom element
  (`ytd-*`) has been renamed. Find the new name in DevTools and add it to the
  matching part of `content.css`.
- The CSS uses `:has()`, so Chrome 105 or newer is required.

### Mobile (m.youtube.com) support is partial

The manifest matches `m` as well as `www`, but mobile YouTube uses an entirely
different set of custom elements (`ytm-*` instead of `ytd-*`). The parts that do
not depend on markup work there: the Shorts redirect, preferences and storage,
the dock and settings panel, a handful of mobile-specific rules (bottom pivot
bar, home grid, Shorts shelf, up-next), and the wallpaper on `<html>` — though
mobile's own containers are not made transparent, so it stays mostly covered.
Everything tied to `ytd-*` does not: top-bar cleanup, centering the search box,
the emptied pages, comment and description hiding, results cleanup, the small
top-bar logo, and learning the avatar (the account link still works, it just
stays on `/feed/you`).

In practice this affects very few people — Chrome on Android does not run
extensions, so `m.youtube.com` only shows up if you open it by hand on a
desktop. Still, the honest summary is: **there is no full support for the mobile
layout.**
