#!/usr/bin/env python3
"""TAO-155 batch contact sheet.

All 8 Lost Letter Office items at reveal (132), slot (64), clue (34) sizes,
on kraft and dark rows, next to 4 existing in-game items. Includes a
dark-background halo strip and a silhouette strip.

Usage: contact_sheet155.py <out.png>
"""
import sys

from PIL import Image, ImageDraw, ImageFont

RD = "art-source/bible/redraw"
ITEMS = "art-source/items"
KRAFT = (241, 228, 200)
DARK = (34, 42, 61)
INK = (58, 44, 31)
CREAM = (255, 250, 240)
WHITE = (255, 255, 255)

NEW = [
    ("tied-parcel", "Tied Parcel", "common"),
    ("sealed-letter", "Sealed Letter", "common"),
    ("wax-stamp", "Wax Stamp", "common"),
    ("postal-key", "Postal Key", "common"),
    ("return-to-sender-tag", "Return-to-Sender Tag", "rare"),
    ("mail-pouch", "Mail Pouch", "rare"),
    ("pocket-watch", "Pocket Watch", "epic"),
    ("paper-crane", "Paper Crane", "secret"),
]
OLD = [
    ("clay-pot", "Clay Pot"),
    ("tin-robot", "Tin Robot"),
    ("paper-plane", "Paper Plane"),
    ("brass-scale", "Brass Scale"),
]

PAD = 56
ROW_H = 150
COL_W = 190
COLS = 5
W = PAD * 2 + COLS * COL_W
H = 250 + 8 * ROW_H + 470

out = Image.new("RGB", (W, H), KRAFT)
dr = ImageDraw.Draw(out)

font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 34)
sub = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 22)
small = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 17)
tiny = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 15)
mini = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 13)

dr.text((PAD, 34), "M3.2 Batch - Lost Letter Office (8 items)", font=font, fill=INK)
dr.text((PAD, 80), "new items at 132 / 64 / 34 px; kraft + dark, alongside existing items", font=sub, fill=INK)

y0 = 128
dr.rectangle([PAD, y0, W - PAD, y0 + 56], fill=DARK)
headers = ["ITEM", "132 reveal", "64 slot", "34 on dark", "rarity"]
for i, t in enumerate(headers):
    dr.text((PAD + i * COL_W + 14, y0 + 18), t, font=tiny, fill=CREAM)


def paste(im, x, y, size):
    r = im.resize((size, size), Image.LANCZOS)
    out.paste(r, (x + (COL_W - size) // 2, y + (ROW_H - size) // 2), r)


y = y0 + 64
for slug, title, rarity in NEW:
    im = Image.open(f"{RD}/{slug}.png")
    dr.rectangle([PAD + 1 * COL_W + 6, y + 14, PAD + 2 * COL_W - 6, y + ROW_H - 14], fill=WHITE)
    dr.rectangle([PAD + 2 * COL_W + 6, y + 14, PAD + 3 * COL_W - 6, y + ROW_H - 14], fill=WHITE)
    dr.rectangle([PAD + 3 * COL_W + 6, y + 14, PAD + 4 * COL_W - 6, y + ROW_H - 14], fill=DARK)
    dr.text((PAD + 12, y + ROW_H // 2 - 20), title, font=small, fill=INK)
    dr.text((PAD + 12, y + ROW_H // 2 + 4), slug, font=mini, fill=INK)
    paste(im, PAD + 1 * COL_W, y, 118)
    paste(im, PAD + 2 * COL_W, y, 64)
    paste(im, PAD + 3 * COL_W, y, 34)
    dr.text((PAD + 4 * COL_W + 14, y + ROW_H // 2 - 8), rarity, font=small, fill=INK)
    y += ROW_H

panel_top = y + 24
panel_h = 310
dr.rectangle([PAD, panel_top, W - PAD, panel_top + panel_h], fill=DARK)
dr.text((PAD + 20, panel_top + 12), "Dark-background halo test - 8 new items (88 px)", font=tiny, fill=CREAM)
test_items = [(f"{RD}/{s}.png", t) for s, t, _ in NEW]
old_items = [(f"{ITEMS}/{s}.png", t) for s, t in OLD]
x = PAD + 20
for path, title in test_items:
    im = Image.open(path)
    r = im.resize((80, 80), Image.LANCZOS)
    out.paste(r, (x, panel_top + 38), r)
    dr.text((x, panel_top + 122), title[:17], font=mini, fill=CREAM)
    x += 108
dr.text((PAD + 20, panel_top + 158), "Existing in-game items for side-by-side comparison (80 px)", font=tiny, fill=CREAM)
x = PAD + 20
for path, title in old_items:
    im = Image.open(path)
    r = im.resize((80, 80), Image.LANCZOS)
    out.paste(r, (x, panel_top + 184), r)
    dr.text((x, panel_top + 268), title[:17], font=mini, fill=CREAM)
    x += 108

sil_top = panel_top + panel_h + 20
x = PAD + 20
for path, title in test_items + old_items:
    im = Image.open(path)
    sw = 64
    sil = Image.new("RGBA", im.size, INK)
    sil.putalpha(im.getchannel("A"))
    r = sil.resize((sw, sw), Image.LANCZOS)
    out.paste(r, (x, sil_top), r)
    x += 78
dr.text((PAD, sil_top + 70), "Silhouette test - 8 new + 4 existing (ink shape, cream background)", font=tiny, fill=INK)

out.save(sys.argv[1])
print(sys.argv[1])
