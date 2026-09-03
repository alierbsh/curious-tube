# CuriousTube

> Watch what you're curious about, not the algorithm's dictate.

A Chrome extension (Manifest V3) that turns YouTube into a search engine. The
home feed, the sidebar, the recommendations next to the player, Shorts, search
suggestions, ads and the account menu are all gone; what is left is the search
box, the search results and the player. Comments and the description are hidden
too, but a switch brings either back.

Subscriptions are the one exception to the emptying — that list is yours, not
the algorithm's — so `/feed/subscriptions` and the account hub stay intact and
are one click away in the dock. Your session lives in cookies, so you stay
signed in; only the account UI disappears.

## Install

Not on the Web Store yet, so load it unpacked:

1. Open `chrome://extensions`.
2. Turn on **Developer mode** in the top right.
3. Click **Load unpacked** and pick this folder.
4. Reload any open YouTube tab.

Chrome 105 or newer is required.

## Using it

Open YouTube and you get a wallpaper with a search box in the middle of it and
nothing else. Search, or open a video, and the box moves back up to the top bar.
The logo in the top-left corner is the way home; the avatar in the top-right
opens your own channel.

A small dock sits at the middle of the right edge, on every page: a
**Subscriptions** shortcut and a gear. The gear opens a panel with two tabs, and
it stays there even when the extension is switched off — it is the way back on.

**Wallpapers** is a grid of the built-in images plus any you upload with the "+"
card; click one to apply it, hover your own to delete it. Uploads are downscaled
before they are stored, and there is room for a dozen of them.

**Settings** has six switches:

| Switch | What it does | Default |
| --- | --- | --- |
| Extension Enabled | Master switch; off means the extension touches nothing. | On |
| Comments | Shows the comments under a video. | Off |
| Description | Shows the video description. | Off |
| Shorts | Shows Shorts shelves, results and the menu entry. Off also redirects `/shorts/<id>` to the normal player. | Off |
| Grayscale Thumbnails | Drains the color from thumbnails until you hover them. | Off |
| Shuffle Wallpaper | Picks a random wallpaper each time the home page opens. | Off |

Comments, Description and Shorts read as "show this", which is why off is the
quiet default. Flipping the master switch reloads the current tab; other open
tabs catch up on their own.

If a piece of YouTube ever comes back — it changes its markup often — reload the
extension from `chrome://extensions` and refresh the tab. Mobile
(`m.youtube.com`) is only partly supported: it is built from different elements,
so most of the hiding does not apply there.
