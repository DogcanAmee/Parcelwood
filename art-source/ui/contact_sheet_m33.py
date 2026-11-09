from PIL import Image, ImageDraw, ImageFont
import os

BASE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(BASE))
KRAFT = (241, 228, 200)
DARK = (34, 42, 61)
INK = (58, 44, 31)
PAPER = (245, 238, 222)
CREAM = (255, 250, 240)

def font(size):
    for p in ("/System/Library/Fonts/PingFang.ttc", "/System/Library/Fonts/Helvetica.ttc"):
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()

F_TITLE = font(46)
F_SUB = font(24)
F_SEC = font(30)
F_SMALL = font(21)
F_TINY = font(18)

def text(d, xy, s, f, fill, anchor=None):
    d.text(xy, s, font=f, fill=fill, anchor=anchor)

def rr(d, box, r, fill, outline=None, width=2):
    d.rounded_rectangle(box, radius=r, fill=fill, outline=outline, width=width)

def load(rel):
    return Image.open(os.path.join(ROOT, rel))

EVENTS = [
    ("rain", "Rainy Day", "deliveries kept dry"),
    ("powercut", "Power Cut", "candle-lit sorting night"),
    ("moving", "Moving Day", "new neighbours inbound"),
    ("week", "Station Week", "weekly wholesale night"),
]

# ---------- phone banner mock ----------
def phone_banner(event, title, sub):
    S = 2
    W, H = 390 * S, 560 * S
    c = Image.new("RGBA", (W, H), PAPER + (255,))
    d = ImageDraw.Draw(c)
    d.rectangle((0, 0, W, 60 * S), fill=CREAM + (255,))
    d.line((0, 60 * S, W, 60 * S), fill=INK, width=3 * S)
    text(d, (20 * S, 14 * S), "Parcelwood", font(28 * S), INK)
    bw, bh = 358 * S, int(358 / 3) * S
    bx, by = 16 * S, 80 * S
    b = load(f"art-source/ui/banner-{event}.png").resize((bw, bh), Image.LANCZOS)
    m = Image.new("L", (bw, bh), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, bw, bh), radius=14 * S, fill=255)
    c.paste(b, (bx, by), m)
    d.rounded_rectangle((bx, by, bx + bw, by + bh), radius=14 * S, outline=INK, width=3 * S)
    ov = Image.new("RGBA", (bw, bh), (0, 0, 0, 0))
    od = ImageDraw.Draw(ov)
    text(od, (bw // 2, int(bh * 0.45)), title, font(34 * S), (255, 243, 210, 255), "mm")
    text(od, (bw // 2, int(bh * 0.74)), sub, font(17 * S), (255, 243, 210, 235), "mm")
    c.alpha_composite(ov)
    rr(d, (16 * S, by + bh + 18 * S, W - 16 * S, by + bh + 86 * S), 14 * S, CREAM + (255,), INK, 3 * S)
    text(d, (34 * S, by + bh + 30 * S), "Sort the parcels", font(23 * S), INK)
    text(d, (34 * S, by + bh + 58 * S), "Event only today", font(19 * S), (120, 100, 70, 255))
    rr(d, (16 * S, H - 82 * S, W - 16 * S, H - 20 * S), 16 * S, (36, 86, 196, 255), INK, 3 * S)
    text(d, (W // 2, H - 63 * S), "Enter event", font(25 * S), CREAM, "mm")
    return c

# ---------- desktop banner mock ----------
def desktop_banner(event, title, sub):
    W, H = 1100, 360
    c = Image.new("RGBA", (W, H), PAPER + (255,))
    d = ImageDraw.Draw(c)
    d.rectangle((0, 0, W, 56), fill=CREAM + (255,))
    d.line((0, 56, W, 56), fill=INK, width=3)
    text(d, (24, 13), "Parcelwood", font(26), INK)
    bw, bh = 1000, 250
    bx, by = 50, 78
    b = load(f"art-source/ui/banner-{event}.png").resize((bw, bh), Image.LANCZOS)
    m = Image.new("L", (bw, bh), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, bw, bh), radius=16, fill=255)
    c.paste(b, (bx, by), m)
    d.rounded_rectangle((bx, by, bx + bw, by + bh), radius=16, outline=INK, width=3)
    ov = Image.new("RGBA", (bw, bh), (0, 0, 0, 0))
    od = ImageDraw.Draw(ov)
    text(od, (bw // 2, int(bh * 0.42)), title, font(58), (255, 243, 210, 255), "mm")
    pw, ph = 380, 40
    od.rounded_rectangle((bw // 2 - pw // 2, int(bh * 0.66), bw // 2 + pw // 2, int(bh * 0.66) + ph),
                         radius=20, fill=(58, 44, 31, 235), outline=(255, 243, 210, 220), width=2)
    text(od, (bw // 2, int(bh * 0.66) + 5), sub, font(20), (255, 243, 210, 255), "mm")
    c.alpha_composite(ov)
    return c

# ---------- guide bubble mock: both poses ----------
def guide_mock(pose, caption):
    S = 2
    W, H = 390 * S, 300 * S
    c = Image.new("RGBA", (W, H), PAPER + (255,))
    d = ImageDraw.Draw(c)
    rr(d, (16 * S, 16 * S, W - 16 * S, 150 * S), 14 * S, CREAM + (255,), INK, 3 * S)
    text(d, (34 * S, 34 * S), "Today's parcels", font(23 * S), INK)
    for i in range(3):
        x = 34 * S + i * 108 * S
        rr(d, (x, 72 * S, x + 92 * S, 134 * S), 12 * S, (201, 154, 98, 255), INK, 3 * S)
    g = load(f"art-source/ui/guide-{pose}.png").resize((150 * S, 150 * S), Image.LANCZOS)
    c.alpha_composite(g, (14 * S, 142 * S))
    bx, by = 178 * S, 158 * S
    rr(d, (bx, by, W - 16 * S, by + 86 * S), 16 * S, CREAM + (255,), INK, 3 * S)
    text(d, (bx + 16 * S, by + 16 * S), caption, font(20 * S), INK)
    text(d, (bx + 16 * S, by + 50 * S), "with Mr. Dube", font(18 * S), (120, 100, 70, 255))
    return c

# ---------- facade mock with 4 decor ----------
def facade_mock():
    S = 2
    W, H = 390 * S, 300 * S
    c = Image.new("RGBA", (W, H), PAPER + (255,))
    d = ImageDraw.Draw(c)
    d.rectangle((0, 0, W, 158 * S), fill=(255, 246, 224, 255))
    d.rectangle((0, 158 * S, W, 161 * S), fill=INK)
    d.rectangle((48 * S, 56 * S, W - 48 * S, 158 * S), fill=(224, 186, 134, 255), outline=INK, width=3 * S)
    d.polygon([(30 * S, 60 * S), (W // 2, 18 * S), (W - 30 * S, 60 * S)], fill=(125, 74, 36, 255), outline=INK)
    gar = load("art-source/bible/redraw/decor-garland.png").resize((260 * S, 92 * S), Image.LANCZOS)
    c.alpha_composite(gar, (65 * S, 30 * S))
    sc = load("art-source/bible/redraw/decor-scale.png").resize((70 * S, 70 * S), Image.LANCZOS)
    c.alpha_composite(sc, (52 * S, 86 * S))
    hn = load("art-source/bible/redraw/decor-horn.png").resize((70 * S, 70 * S), Image.LANCZOS)
    c.alpha_composite(hn, (270 * S, 84 * S))
    tr = load("art-source/bible/redraw/decor-trolley.png").resize((74 * S, 74 * S), Image.LANCZOS)
    c.alpha_composite(tr, (158 * S, 84 * S))
    rr(d, (150 * S, 96 * S, 240 * S, 132 * S), 8 * S, CREAM + (255,), INK, 3 * S)
    text(d, (195 * S, 105 * S), "Parcelwood", font(21 * S), INK, "ma")
    return c

# ---------- decor lineup ----------
def decor_lineup():
    W, H = 1080, 210
    c = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(c)
    items = [("scale", "parcel scale"), ("garland", "envelope garland"),
             ("horn", "post horn"), ("trolley", "mail trolley")]
    x = 10
    for i, (id_, label) in enumerate(items):
        im = load(f"art-source/bible/redraw/decor-{id_}.png").resize((170, 170), Image.LANCZOS)
        c.alpha_composite(im, (x + 20, 0))
        text(d, (x + 105, 178), label, F_TINY, INK, "ma")
        x += 265
    return c

def main():
    margin = 56
    gutter = 44
    phone = phone_banner("week", "Station Week", "weekly wholesale night")
    desk = desktop_banner("rain", "Rainy Day", "deliveries kept dry")
    gp = guide_mock("point", "Tap a parcel!")
    gc = guide_mock("cheer", "Well done!")
    fm = facade_mock()
    dl = decor_lineup()

    colw = phone.width
    total_w = margin * 2 + colw + gutter + desk.width

    Y_HEAD = 210
    L_PHONE_Y = Y_HEAD + 42
    L_FAC_SEC = L_PHONE_Y + phone.height + 56
    L_FAC_Y = L_FAC_SEC + 42
    R_DESK_Y = Y_HEAD + 42
    R_POINT_SEC = R_DESK_Y + desk.height + 40
    R_POINT_Y = R_POINT_SEC + 42
    R_CHEER_SEC = R_POINT_Y + gp.height + 28
    R_CHEER_Y = R_CHEER_SEC + 42
    B_LINE_SEC = max(L_FAC_Y + fm.height, R_CHEER_Y + gc.height) + 56
    B_LINE_Y = B_LINE_SEC + 42
    total_h = B_LINE_Y + 210 + 80

    for name, bg in (("kraft", KRAFT), ("dark", DARK)):
        sheet = Image.new("RGB", (total_w, total_h), bg)
        d = ImageDraw.Draw(sheet)
        ink = INK if name == "kraft" else (238, 226, 200)
        text(d, (margin, 44), "M3.3 production batch - 4 banners / 2 guide poses / 4 decor", F_TITLE, ink)
        text(d, (margin, 106), "Art-bible v0.1, $0 Doubao via Magpie; every asset passed magpie vision QA.", F_SUB, ink)
        text(d, (margin, 142), "Titles below are overlays only - no painted text in any asset.", F_SUB, ink)

        x0 = margin
        text(d, (x0, Y_HEAD), "Banner on phone (390 wide) - Station Week", F_SEC, ink)
        sheet.paste(phone.convert("RGB"), (x0, L_PHONE_Y))
        text(d, (x0, L_FAC_SEC), "All 4 decor on the station facade (390)", F_SEC, ink)
        sheet.paste(fm.convert("RGB"), (x0, L_FAC_Y))

        xr = margin + colw + gutter
        text(d, (xr, Y_HEAD), "Banner on desktop (1100) - Rainy Day", F_SEC, ink)
        sheet.paste(desk.convert("RGB"), (xr, R_DESK_Y))
        text(d, (xr, R_POINT_SEC), "Guide Mr. Dube: point pose (first run)", F_SEC, ink)
        sheet.paste(gp.convert("RGB"), (xr, R_POINT_Y))
        text(d, (xr, R_CHEER_SEC), "Cheer pose (task complete)", F_SEC, ink)
        sheet.paste(gc.convert("RGB"), (xr, R_CHEER_Y))

        text(d, (x0, B_LINE_SEC), "Decor lineup, native style (labels are sheet overlay)", F_SEC, ink)
        tmp = Image.new("RGBA", dl.size, bg + (255,))
        tmp.alpha_composite(dl)
        sheet.paste(tmp.convert("RGB"), (x0, B_LINE_Y))

        out = os.path.join(BASE, f"contact-sheet-m33-{name}.png")
        sheet.save(out)
        print(out, sheet.size)

if __name__ == "__main__":
    main()
