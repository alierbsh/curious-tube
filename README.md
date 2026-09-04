# CuriousTube

> Watch what you're curious about, not the algorithm's dictate.

A Chrome extension (Manifest V3) that turns YouTube into a search engine. The
home feed, the recommendations, Shorts, search suggestions, ads, comments and
the account menu go; the search box, the results and the player stay.
Subscriptions are the exception — that list is yours, not the algorithm's — so
`/feed/subscriptions` and the account hub stay one click away. You stay signed
in; only the account UI disappears.

<img width="640" height="400" alt="1" src="https://github.com/user-attachments/assets/999ba9eb-293e-4fbb-869b-334d974a0797" />



<img width="369" height="600" alt="image" src="https://github.com/user-attachments/assets/1cefad8c-28d0-42c4-b243-e98b02d7c9e6" />


<img width="378" height="427" alt="2026-09-04_15-10-12" src="https://github.com/user-attachments/assets/75a131bd-50cf-4d8b-89c3-19341bb4d0e4" />


## Install

Not on the Web Store yet: open `chrome://extensions`, turn on **Developer
mode**, click **Load unpacked** and pick this folder, then reload any open
YouTube tab. Chrome 105 or newer.

## Using it

YouTube opens as a wallpaper with a search box in the middle of it. Search, or
open a video, and the box moves back up to the top bar.

A dock on the right edge holds a **Subscriptions** shortcut and a gear. The gear
stays there even when the extension is switched off — it is the way back on. Its
panel picks a wallpaper, built-in or your own, and carries six switches: the
master switch, Comments, Description, Shorts, Grayscale Thumbnails and Shuffle
Wallpaper. Only the master is on by default; Shorts also redirects
`/shorts/<id>` to the normal player while it is off.

Mobile (`m.youtube.com`) is built from different elements, so most of the hiding
does not apply there.
