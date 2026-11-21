"""把上传的促销图转成 webp + 移动版，放到 public/media/promo/。"""
from pathlib import Path
from PIL import Image

SRC = Path(r"C:\Users\Admin\.dsh\attachments\v1\objects\21\21ef0507704d23eb2e21a381ea6ad2e8a7c0cbfdc31b16ed4ff81dab1cc3f458")
OUT = Path(r"F:\DSH\项目\fake\public\media\promo")
OUT.mkdir(parents=True, exist_ok=True)

img = Image.open(SRC).convert("RGB")
print(f"source: {img.size}")

# 桌面版：保持 1536x1024，webp 质量 82
desktop = OUT / "50off-desktop.webp"
img.save(desktop, "WEBP", quality=82, method=6)
print(f"{desktop.name}: {desktop.stat().st_size/1024:.0f} KB")

# 移动版：宽 900，等比
w, h = img.size
mw = 900
mobile = img.resize((mw, round(h * mw / w)), Image.LANCZOS)
mp = OUT / "50off-mobile.webp"
mobile.save(mp, "WEBP", quality=82, method=6)
print(f"{mp.name}: {mobile.size} {mp.stat().st_size/1024:.0f} KB")
