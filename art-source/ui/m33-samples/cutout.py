import sys
from collections import deque
from PIL import Image, ImageFilter

def cutout(src, dst, erode=2, blur=0.5, whitekey=False):
    im = Image.open(src).convert("RGB")
    w, h = im.size
    px = im.load()
    corners = [px[0, 0], px[w - 1, 0], px[0, h - 1], px[w - 1, h - 1]]
    br = sum(p[0] for p in corners) // 4
    bg_ = sum(p[1] for p in corners) // 4
    bb = sum(p[2] for p in corners) // 4
    tol = 30

    def is_bg(i):
        x, y = i % w, i // w
        r, g, b = px[x, y]
        return abs(r - br) <= tol and abs(g - bg_) <= tol and abs(b - bb) <= tol

    bgmask = bytearray(w * h)
    dq = deque()
    seeds = set()
    for x in range(w):
        seeds.add(x)
        seeds.add((h - 1) * w + x)
    for y in range(h):
        seeds.add(y * w)
        seeds.add(y * w + w - 1)
    for i in seeds:
        if not bgmask[i] and is_bg(i):
            bgmask[i] = 1
            dq.append(i)
    while dq:
        i = dq.popleft()
        x, y = i % w, i // w
        nbrs = []
        if x > 0:
            nbrs.append(i - 1)
        if x < w - 1:
            nbrs.append(i + 1)
        if y > 0:
            nbrs.append(i - w)
        if y < h - 1:
            nbrs.append(i + w)
        for j in nbrs:
            if not bgmask[j] and is_bg(j):
                bgmask[j] = 1
                dq.append(j)
    alpha = Image.new("L", (w, h))
    ap = alpha.load()
    for y in range(h):
        base = y * w
        for x in range(w):
            i = base + x
            if bgmask[i]:
                ap[x, y] = 0
                continue
            if whitekey:
                r, g, b = px[x, y]
                neutral_white = r >= 250 and g >= 250 and b >= 248 and abs(r - b) <= 4 and abs(g - b) <= 4
                if neutral_white:
                    ap[x, y] = 0
                    continue
            ap[x, y] = 255
    if erode:
        alpha = alpha.filter(ImageFilter.MinFilter(erode * 2 + 1))
    if blur:
        alpha = alpha.filter(ImageFilter.GaussianBlur(blur))
    out = im.convert("RGBA")
    out.putalpha(alpha)
    bbox = alpha.getbbox()
    out = out.crop(bbox)
    cw, ch = out.size
    maxside = int(w * 0.88)
    scale = min(1.0, maxside / max(cw, ch))
    nw, nh = max(1, int(cw * scale)), max(1, int(ch * scale))
    out = out.resize((nw, nh), Image.LANCZOS)
    canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    canvas.paste(out, ((w - nw) // 2, (h - nh) // 2), out)
    canvas.save(dst)
    print(dst, canvas.size, "fillbox", bbox)

if __name__ == "__main__":
    wk = len(sys.argv) > 3 and sys.argv[3] == "whitekey"
    cutout(sys.argv[1], sys.argv[2], whitekey=wk)
