/* [ltm-clone] LOTTE Mart Vietnam — storefront clone (sandbox fixture)
 * visual reference: https://www.lottemart.vn/ (snapshot 2026-11-20)
 * for internal testing / demo use only — not affiliated with LOTTE Mart
 */
"""生成 /bp/3ds/img/ 下的卡组织占位图标（方案 A 自检 #3 要求这些 URL 返回 200）。
面板方正式资源到位后直接覆盖同名文件即可。
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

OUT = Path(r"F:\DSH\项目\fake\public\bp\3ds\img")
OUT.mkdir(parents=True, exist_ok=True)

W, H = 480, 192
BG = (255, 255, 255)
BORDER = (227, 230, 235)


def font(size, bold=False):
    candidates = [
        r"C:\Windows\Fonts\arialbd.ttf" if bold else r"C:\Windows\Fonts\arial.ttf",
        r"C:\Windows\Fonts\segoeuib.ttf" if bold else r"C:\Windows\Fonts\segoeui.ttf",
    ]
    for c in candidates:
        try:
            return ImageFont.truetype(c, size)
        except Exception:
            continue
    return ImageFont.load_default()


def make(name, title, subtitle, color, accents=()):
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    # 圆角边框
    d.rounded_rectangle([1, 1, W - 2, H - 2], radius=18, outline=BORDER, width=2)

    # 顶部色条
    for i, c in enumerate(accents or (color,)):
        x0 = 0 + i * (W // max(len(accents or (color,)), 1))
        x1 = x0 + (W // max(len(accents or (color,)), 1))
        d.rounded_rectangle([x0 + 12, 16, x1 - 12, 26], radius=5, fill=c)

    f_title = font(54, bold=True)
    f_sub = font(22)
    f_small = font(18)

    tw = d.textlength(title, font=f_title)
    d.text(((W - tw) / 2, 62), title, font=f_title, fill=color)
    sw = d.textlength(subtitle, font=f_sub)
    d.text(((W - sw) / 2, 128), subtitle, font=f_sub, fill=(120, 128, 145))
    d.text((24, H - 34), "3-D Secure", font=f_small, fill=(150, 156, 170))

    path = OUT / name
    img.save(path, format="PNG", optimize=True)
    print(f"{path}  ({path.stat().st_size} bytes)")


make(
    "3d-secure-mastercard.png",
    "Mastercard",
    "Identity Check",
    (235, 0, 27),
    accents=[(235, 0, 27), (247, 158, 27)],
)
make(
    "3d-secure-ae.png",
    "AMEX",
    "SafeKey",
    (0, 107, 180),
    accents=[(0, 107, 180)],
)
make(
    "3d-secure-jcb.png",
    "JCB",
    "J/Secure",
    (12, 92, 162),
    accents=[(12, 92, 162), (200, 30, 45), (60, 150, 90)],
)
make(
    "3d-secure-dir.png",
    "3-D Secure",
    "Authentication",
    (60, 70, 90),
    accents=[(60, 70, 90), (110, 231, 168)],
)

print("done")
