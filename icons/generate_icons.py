#!/usr/bin/env python3
"""Eklenti ikonlarini (16/48/128 px) kok dizindeki small-logo.png'den uretir.

Bagimlilik yok: PNG okuma, yeniden boyutlandirma ve yazma islemleri yalnizca
standart kutuphaneyle (zlib + struct) yapilir. Calistirmak icin:

    python3 icons/generate_icons.py

Iki nokta bilerek boyle:

* Kaynak gorsel tam kare degilse (or. 195x211) once MERKEZDEN kare kirpilir.
  Dogrudan kareye sikistirmak logoyu yatay/dikey ezerdi.

* Kucultme, hedef pikselin kaynakta kapladigi alanin agirlikli ortalamasiyla
  yapilir (box filtre). 195 px'den 16 px'e inerken tek tek ornekleme almak
  detaylari titrek ve tirtikli birakirdi. Alfa, renk ortalamasi alinirken
  onceden carpilir; aksi halde saydam kenarlarda hayalet halka olusur.
"""

import math
import os
import struct
import zlib

SOURCE = "small-logo.png"
SIZES = (16, 48, 128)


# --------------------------------------------------------------------- oku


def read_png(path):
    """8 bit derinlikli, interlace'siz bir PNG'yi (genislik, yukseklik, RGBA)
    olarak cozer."""
    with open(path, "rb") as handle:
        data = handle.read()

    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("%s bir PNG dosyasi degil" % path)

    pos, idat, header, palette, trns = 8, [], None, None, None
    while pos < len(data):
        (length,) = struct.unpack(">I", data[pos : pos + 4])
        tag = data[pos + 4 : pos + 8]
        body = data[pos + 8 : pos + 8 + length]
        if tag == b"IHDR":
            header = struct.unpack(">IIBBBBB", body)
        elif tag == b"PLTE":
            palette = body
        elif tag == b"tRNS":
            trns = body
        elif tag == b"IDAT":
            idat.append(body)
        elif tag == b"IEND":
            break
        pos += 12 + length

    width, height, depth, color, _, _, interlace = header
    if depth != 8:
        raise ValueError("yalnizca 8 bit derinlik destekleniyor (bulunan: %d)" % depth)
    if interlace:
        raise ValueError("interlace'li PNG desteklenmiyor")

    channels = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}.get(color)
    if channels is None:
        raise ValueError("bilinmeyen renk tipi: %d" % color)

    raw = zlib.decompress(b"".join(idat))
    rows = unfilter(raw, width, height, channels)
    return width, height, to_rgba(rows, width, height, color, palette, trns)


def unfilter(raw, width, height, channels):
    """PNG satir filtrelerini (None/Sub/Up/Average/Paeth) geri alir."""
    stride = width * channels
    out = bytearray(height * stride)
    prev = bytearray(stride)
    pos = 0

    for y in range(height):
        ftype = raw[pos]
        pos += 1
        line = bytearray(raw[pos : pos + stride])
        pos += stride

        if ftype == 1:
            for x in range(channels, stride):
                line[x] = (line[x] + line[x - channels]) & 0xFF
        elif ftype == 2:
            for x in range(stride):
                line[x] = (line[x] + prev[x]) & 0xFF
        elif ftype == 3:
            for x in range(stride):
                left = line[x - channels] if x >= channels else 0
                line[x] = (line[x] + ((left + prev[x]) >> 1)) & 0xFF
        elif ftype == 4:
            for x in range(stride):
                a = line[x - channels] if x >= channels else 0
                b = prev[x]
                c = prev[x - channels] if x >= channels else 0
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                if pa <= pb and pa <= pc:
                    pred = a
                elif pb <= pc:
                    pred = b
                else:
                    pred = c
                line[x] = (line[x] + pred) & 0xFF
        elif ftype != 0:
            raise ValueError("bilinmeyen satir filtresi: %d" % ftype)

        out[y * stride : (y + 1) * stride] = line
        prev = line

    return out


def to_rgba(rows, width, height, color, palette, trns):
    """Cozulmus satirlari her durumda 4 kanalli RGBA'ya cevirir."""
    if color == 6:
        return rows

    out = bytearray(width * height * 4)
    for i in range(width * height):
        o = i * 4
        if color == 2:  # RGB
            s = i * 3
            out[o : o + 3] = rows[s : s + 3]
            out[o + 3] = 255
        elif color == 0:  # gri
            v = rows[i]
            out[o] = out[o + 1] = out[o + 2] = v
            out[o + 3] = 255
        elif color == 4:  # gri + alfa
            s = i * 2
            out[o] = out[o + 1] = out[o + 2] = rows[s]
            out[o + 3] = rows[s + 1]
        elif color == 3:  # paletli
            idx = rows[i]
            s = idx * 3
            out[o : o + 3] = palette[s : s + 3]
            out[o + 3] = trns[idx] if trns and idx < len(trns) else 255
    return out


# ------------------------------------------------------------------ isle


def center_crop_square(pixels, width, height):
    """Gorseli merkezden en buyuk kareye kirpar."""
    side = min(width, height)
    if width == height:
        return pixels, side

    left = (width - side) // 2
    top = (height - side) // 2
    out = bytearray(side * side * 4)
    for y in range(side):
        src = ((top + y) * width + left) * 4
        out[y * side * 4 : (y + 1) * side * 4] = pixels[src : src + side * 4]
    return out, side


def resize_box(pixels, size, target):
    """Kare gorseli alan agirlikli ortalamayla (box filtre) kucultur."""
    out = bytearray(target * target * 4)
    ratio = size / target

    for dy in range(target):
        y0, y1 = dy * ratio, (dy + 1) * ratio
        sy0, sy1 = int(y0), min(size, int(math.ceil(y1)))

        for dx in range(target):
            x0, x1 = dx * ratio, (dx + 1) * ratio
            sx0, sx1 = int(x0), min(size, int(math.ceil(x1)))

            r = g = b = 0.0
            alpha_sum = 0.0  # agirlik x alfa (renkleri bununla normalize ederiz)
            weight_sum = 0.0

            for sy in range(sy0, sy1):
                wy = min(y1, sy + 1) - max(y0, sy)
                if wy <= 0:
                    continue
                row = sy * size * 4
                for sx in range(sx0, sx1):
                    wx = min(x1, sx + 1) - max(x0, sx)
                    if wx <= 0:
                        continue
                    weight = wx * wy
                    i = row + sx * 4
                    a = pixels[i + 3] / 255.0
                    wa = weight * a
                    r += pixels[i] * wa
                    g += pixels[i + 1] * wa
                    b += pixels[i + 2] * wa
                    alpha_sum += wa
                    weight_sum += weight

            o = (dy * target + dx) * 4
            if alpha_sum > 0:
                out[o] = min(255, int(round(r / alpha_sum)))
                out[o + 1] = min(255, int(round(g / alpha_sum)))
                out[o + 2] = min(255, int(round(b / alpha_sum)))
            out[o + 3] = (
                min(255, int(round(255 * alpha_sum / weight_sum))) if weight_sum else 0
            )

    return out


# ------------------------------------------------------------------- yaz


def write_png(path, size, pixels):
    raw = b"".join(
        b"\x00" + bytes(pixels[y * size * 4 : (y + 1) * size * 4]) for y in range(size)
    )

    def chunk(tag, body):
        payload = tag + body
        return (
            struct.pack(">I", len(body))
            + payload
            + struct.pack(">I", zlib.crc32(payload))
        )

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")

    with open(path, "wb") as handle:
        handle.write(png)
    return len(png)


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    source = os.path.join(os.path.dirname(here), SOURCE)

    if not os.path.exists(source):
        raise SystemExit(
            "Kaynak bulunamadi: %s\nKok dizine %s dosyasini koyun." % (source, SOURCE)
        )

    width, height, pixels = read_png(source)
    print("kaynak: %s (%dx%d)" % (SOURCE, width, height))

    square, side = center_crop_square(pixels, width, height)
    if side != width or side != height:
        print("merkezden kare kirpildi: %dx%d" % (side, side))

    for target in SIZES:
        out = resize_box(square, side, target)
        path = os.path.join(here, "icon%d.png" % target)
        size_bytes = write_png(path, target, out)
        print("  icon%d.png  (%d bayt)" % (target, size_bytes))


if __name__ == "__main__":
    main()
