#!/usr/bin/env python3
"""Eklenti ikonlarini (16/48/128 px) uretir.

Bagimlilik yok: PNG dosyalari zlib ile elle yazilir. Simge, yuvarlatilmis
kirmizi bir kare uzerinde beyaz bir buyutec camindan olusur. Yeniden uretmek
icin: python3 icons/generate_icons.py
"""

import os
import struct
import zlib

BG = (255, 0, 51)        # YouTube kirmizisi
FG = (255, 255, 255)     # Buyutec rengi
SS = 4                   # Kenar yumusatma icin asiri ornekleme carpani


def rounded_square(x, y, size, radius):
    """Yuvarlatilmis kare icinde mi?"""
    cx = min(max(x, radius), size - radius)
    cy = min(max(y, radius), size - radius)
    return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2


def magnifier(x, y, size):
    """Buyutec (halka + sap) uzerinde mi?"""
    cx, cy = size * 0.44, size * 0.44
    outer, inner = size * 0.26, size * 0.17
    d2 = (x - cx) ** 2 + (y - cy) ** 2
    if inner ** 2 <= d2 <= outer ** 2:
        return True

    # Sap: halkanin sag-alt kosesinden disari uzanan kalin cizgi.
    hx0, hy0 = size * 0.62, size * 0.62
    hx1, hy1 = size * 0.80, size * 0.80
    half = size * 0.06
    dx, dy = hx1 - hx0, hy1 - hy0
    t = ((x - hx0) * dx + (y - hy0) * dy) / (dx * dx + dy * dy)
    t = min(max(t, 0.0), 1.0)
    px, py = hx0 + t * dx, hy0 + t * dy
    return (x - px) ** 2 + (y - py) ** 2 <= half ** 2


def render(size):
    """RGBA piksel satirlarini uretir."""
    radius = size * 0.22
    rows = []
    for py in range(size):
        row = bytearray()
        for px in range(size):
            bg_hits = fg_hits = 0
            for sy in range(SS):
                for sx in range(SS):
                    x = px + (sx + 0.5) / SS
                    y = py + (sy + 0.5) / SS
                    if rounded_square(x, y, size, radius):
                        bg_hits += 1
                        if magnifier(x, y, size):
                            fg_hits += 1
            total = SS * SS
            alpha = round(255 * bg_hits / total)
            mix = fg_hits / bg_hits if bg_hits else 0.0
            color = tuple(round(BG[i] + (FG[i] - BG[i]) * mix) for i in range(3))
            row += bytes(color) + bytes([alpha])
        rows.append(bytes(row))
    return rows


def write_png(path, size):
    rows = render(size)
    raw = b"".join(b"\x00" + row for row in rows)

    def chunk(tag, data):
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body))

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")

    with open(path, "wb") as handle:
        handle.write(png)
    print("%s (%dx%d, %d bayt)" % (path, size, size, len(png)))


if __name__ == "__main__":
    here = os.path.dirname(os.path.abspath(__file__))
    for px in (16, 48, 128):
        write_png(os.path.join(here, "icon%d.png" % px), px)
