# CuriousTube

> Watch what you're curious about, not the algorithm's dictate.

A Chrome extension (Manifest V3) that turns YouTube into a search engine. The
home feed, the recommendations beside the player, Shorts, search suggestions,
ads, comments and the account menu are gone; the search box, the results and the
player stay. Subscriptions are the one exception — that list is yours, not the
algorithm's — so `/feed/subscriptions` and the account hub stay intact, one
click away in the dock. You stay signed in; only the account UI disappears.

## Install

Not on the Web Store yet, so load it unpacked: open `chrome://extensions`, turn
on **Developer mode**, click **Load unpacked** and pick this folder, then reload
any open YouTube tab. Chrome 105 or newer.

## Using it

YouTube opens as a wallpaper with a search box in the middle of it. Search, or
open a video, and the box moves up to the top bar. The logo goes home; the
avatar opens your channel.

A dock sits at the right edge on every page: a **Subscriptions** shortcut and a
gear. The gear stays there even when the extension is switched off — it is the
way back on. Its panel has two tabs. **Wallpapers** is a grid of the built-in
images plus any you upload; uploads are downscaled before they are stored, and
about a dozen fit. **Settings** has six switches:

| Switch | What it does | Default |
| --- | --- | --- |
| Extension Enabled | Master switch; off means the extension touches nothing. | On |
| Comments | Shows the comments under a video. | Off |
| Description | Shows the video description. | Off |
| Shorts | Shows Shorts shelves, results and the menu entry. Off also redirects `/shorts/<id>` to the normal player. | Off |
| Grayscale Thumbnails | Drains the color from thumbnails until you hover them. | Off |
| Shuffle Wallpaper | Picks a random wallpaper each time the home page opens. | Off |

Comments, Description and Shorts read as "show this", which is why off is the
quiet default. Flipping the master switch reloads the current tab.

If a piece of YouTube ever comes back — its markup changes often — reload the
extension and refresh the tab. Mobile (`m.youtube.com`) is built from different
elements, so most of the hiding does not apply there.
