from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os

BASE = os.path.dirname(os.path.abspath(__file__))
KRAFT = (241, 228, 200)
DARK = (34, 42, 61)
INK = (58, 44, 31)
CREAM = (255, 250, 240)

def font(size, bold=False):
    paths = [
        "/System/Library/Fonts/PingFang.ttc",
        "/System/Library/Fonts/Helvetica.ttc",
    ]
    for p in paths:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()

F_TITLE = font(46)
F_SEC = font(30)
F_SMALL = font(22)
F_TINY = font(18)

def rounded(draw, box, r, fill, outline=None, width=2):
    draw.rounded_rectangle(box, radius=r, fill=fill, outline=outline, width=width)

def text(draw, xy, s, f, fill, anchor=None):
    draw.text(xy, s, font=f, fill=fill, anchor=anchor)

def load(name):
    return Image.open(os.path.join(BASE, name))

# ---------- mock 1: banner on phone screen ----------
def phone_banner(scale=2):
    W, H = 390 * scale, 844 * scale
    canvas = Image.new("RGBA", (W, H), (245, 238, 222, 255))
    d = ImageDraw.Draw(canvas)
    d.rectangle((0, 0, W, int(64 * scale)), fill=(255, 250, 240, 255))
    d.line((0, int(64 * scale), W, int(64 * scale)), fill=INK, width=int(3 * scale))
    text(d, (int(20 * scale), int(16 * scale)), "Parcelwood", font(28 * scale), INK)
    bw = int(358 * scale)
    bh = int(bw / 3)
    bx, by = int(16 * scale), int(84 * scale)
    banner = load("banner-week-master.png").resize((bw, bh), Image.LANCZOS)
    mask = Image.new("L", (bw, bh), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, bw, bh), radius=int(14 * scale), fill=255)
    canvas.paste(banner, (bx, by), mask)
    d.rounded_rectangle((bx, by, bx + bw, by + bh), radius=int(14 * scale), outline=INK, width=int(3 * scale))
    overlay = Image.new("RGBA", (bw, bh), (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    text(od, (bw // 2, int(bh * 0.46)), "Station Week", font(40 * scale), (255, 243, 210, 255), "mm")
    text(od, (bw // 2, int(bh * 0.74)), "weekend event", font(18 * scale), (255, 243, 210, 235), "mm")
    canvas.alpha_composite(overlay)
    rounded(d, (int(16 * scale), by + bh + int(18 * scale), W - int(16 * scale), by + bh + int(90 * scale)),
            int(14 * scale), (255, 250, 240, 255), INK, int(3 * scale))
    text(d, (int(34 * scale), by + bh + int(30 * scale)), "Sort crates, earn stamps", font(24 * scale), INK)
    text(d, (int(34 * scale), by + bh + int(60 * scale)), "Weekend only · 3 tries", font(20 * scale), (120, 100, 70, 255))
    rounded(d, (int(16 * scale), H - int(86 * scale), W - int(16 * scale), H - int(20 * scale)),
            int(16 * scale), (36, 86, 196, 255), INK, int(3 * scale))
    text(d, (W // 2, H - int(67 * scale)), "Enter Station Week", font(26 * scale), CREAM, "mm")
    return canvas

# ---------- mock 2: desktop banner ----------
def desktop_banner():
    W, H = 1200, 400
    canvas = Image.new("RGBA", (W, H), (245, 238, 222, 255))
    d = ImageDraw.Draw(canvas)
    rounded(d, (0, 0, W - 1, 64), 0, CREAM, INK, 3)
    text(d, (24, 16), "Parcelwood", font(28), INK)
    bw, bh = 1100, 367
    bx, by = 50, 80
    banner = load("banner-week-master.png").resize((bw, bh), Image.LANCZOS)
    mask = Image.new("L", (bw, bh), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, bw, bh), radius=18, fill=255)
    canvas.paste(banner, (bx, by), mask)
    d.rounded_rectangle((bx, by, bx + bw, by + bh), radius=18, outline=INK, width=3)
    overlay = Image.new("RGBA", (bw, bh), (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    text(od, (bw // 2, int(bh * 0.44)), "Station Week", font(64), (255, 243, 210, 255), "mm")
    pill_w, pill_h = 480, 46
    od.rounded_rectangle((bw // 2 - pill_w // 2, int(bh * 0.67), bw // 2 + pill_w // 2, int(bh * 0.67) + pill_h),
                         radius=23, fill=(58, 44, 31, 235), outline=(255, 243, 210, 220), width=2)
    text(od, (bw // 2, int(bh * 0.67) + 7), "the station's weekly wholesale night", font(23), (255, 243, 210, 255), "mm")
    canvas.alpha_composite(overlay)
    return canvas

# ---------- mock 3: guide on street screen ----------
def guide_mock(scale=2):
    W, H = 390 * scale, 480 * scale
    canvas = Image.new("RGBA", (W, H), (245, 238, 222, 255))
    d = ImageDraw.Draw(canvas)
    rounded(d, (int(16 * scale), int(70 * scale), W - int(16 * scale), int(220 * scale)),
            int(14 * scale), (255, 250, 240, 255), INK, int(3 * scale))
    text(d, (int(34 * scale), int(92 * scale)), "Today's parcels", font(24 * scale), INK)
    for i in range(3):
        x = int(34 * scale) + i * int(108 * scale)
        rounded(d, (x, int(130 * scale), x + int(92 * scale), int(200 * scale)),
                int(12 * scale), (201, 154, 98, 255), INK, int(3 * scale))
    rounded(d, (int(16 * scale), H - int(78 * scale), W - int(16 * scale), H - int(20 * scale)),
            int(16 * scale), (200, 64, 47, 255), INK, int(3 * scale))
    text(d, (W // 2, H - int(62 * scale)), "Open", font(26 * scale), CREAM, "mm")
    guide = load("guide-point.png").resize((int(190 * scale), int(190 * scale)), Image.LANCZOS)
    canvas.alpha_composite(guide, (int(12 * scale), int(226 * scale)))
    bw = int(200 * scale)
    bx, by = int(178 * scale), int(236 * scale)
    rounded(d, (bx, by, bx + bw, by + int(96 * scale)), int(16 * scale),
            (255, 250, 240, 255), INK, int(3 * scale))
    text(d, (bx + int(16 * scale), by + int(14 * scale)), "Tap a parcel,", font(20 * scale), INK)
    text(d, (bx + int(16 * scale), by + int(42 * scale)), "then Open it!", font(20 * scale), INK)
    d.polygon([(bx - int(14 * scale), by + int(40 * scale)), (bx, by + int(28 * scale)), (bx, by + int(52 * scale))], fill=INK)
    d.polygon([(bx - int(10 * scale), by + int(40 * scale)), (bx - 2, by + int(31 * scale)), (bx - 2, by + int(49 * scale))], fill=CREAM)
    return canvas

# ---------- mock 4: facade with decor ----------
def facade_mock(scale=2):
    W, H = 390 * scale, 300 * scale
    canvas = Image.new("RGBA", (W, H), (245, 238, 222, 255))
    d = ImageDraw.Draw(canvas)
    sky = (255, 246, 224)
    d.rectangle((0, 0, W, int(158 * scale)), fill=sky)
    d.rectangle((0, int(158 * scale), W, int(161 * scale)), fill=INK)
    d.rectangle((int(48 * scale), int(56 * scale), W - int(48 * scale), int(158 * scale)), fill=(224, 186, 134), outline=INK, width=int(3 * scale))
    d.polygon([(int(30 * scale), int(60 * scale)), (W // 2, int(18 * scale)), (W - int(30 * scale), int(60 * scale))], fill=(125, 74, 36), outline=INK)
    bunting = load("decor-bunting.png").resize((int(300 * scale), int(106 * scale)), Image.LANCZOS)
    canvas.alpha_composite(bunting, (int(45 * scale), int(28 * scale)))
    scale_img = load("decor-scale.png").resize((int(86 * scale), int(86 * scale)), Image.LANCZOS)
    canvas.alpha_composite(scale_img, (int(30 * scale), int(70 * scale)))
    rounded(d, (int(150 * scale), int(82 * scale), int(240 * scale), int(122 * scale)), int(8 * scale),
            (255, 250, 240, 255), INK, int(3 * scale))
    text(d, (int(195 * scale), int(92 * scale)), "Parcelwood", font(22 * scale), INK, "ma")
    return canvas

def main():
    pb = phone_banner()
    db = desktop_banner()
    gm = guide_mock()
    fm = facade_mock()

    margin = 56
    gutter = 40
    colw = max(pb.width, fm.width)
    rightw = db.width
    total_w = margin * 2 + colw + gutter + rightw
    sec_h = max(pb.height + 60 + fm.height + 120, db.height + 60 + gm.height + 140)
    total_h = 230 + sec_h + 120

    variants = [("kraft", KRAFT), ("dark", DARK)]
    for name, bg in variants:
        sheet = Image.new("RGB", (total_w, total_h), bg)
        d = ImageDraw.Draw(sheet)
        ink = INK if name == "kraft" else (238, 226, 200)
        text(d, (margin, 44), "M3.3 samples - banner / guide / decor", F_TITLE, ink)
        text(d, (margin, 108), "Station Week sample set for founder review - art-bible v0.1 + portrait addendum, $0 Doubao", F_SMALL, ink)
        text(d, (margin, 144), "Every asset checked with magpie vision QA. Text below is HTML overlay, not painted.", F_SMALL, ink)

        x0 = margin
        y = 220
        text(d, (x0, y), "1 - banner at phone width (390)", F_SEC, ink)
        sheet.paste(pb.convert("RGB"), (x0, y + 44))
        y2 = y + 44 + pb.height + 40
        text(d, (x0, y2), "4 - new decor placed on the station facade", F_SEC, ink)
        sheet.paste(fm.convert("RGB"), (x0, y2 + 44))

        xr = margin + colw + gutter
        y = 220
        text(d, (xr, y), "1 - banner at desktop width (1200)", F_SEC, ink)
        sheet.paste(db.convert("RGB"), (xr, y + 44))
        y2 = y + 44 + db.height + 40
        text(d, (xr, y2), "2 - guide (retired postman Dube), pointing pose, next to coach bubble", F_SEC, ink)
        sheet.paste(gm.convert("RGB"), (xr, y2 + 44))
        text(d, (xr, y2 + 44 + gm.height + 12), "340x480 safe: guide sits below targets; cheering pose used on task-complete.", F_SMALL, ink)

        out = os.path.join(BASE, f"contact-sheet-{name}.png")
        sheet.save(dst := out)
        print(out, sheet.size)

if __name__ == "__main__":
    main()
