#!/usr/bin/env python3
"""Generate first-party PNG social preview and, for PAGES, app icons.
All illustrations and typography are produced from local shapes/fonts.
No visitor tracking, third-party image calls, or credentials.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import math

ROOT = Path(__file__).resolve().parent.parent
W, H = 1200, 630
CONFIG = {"kind":"builder","brand":"POMEGRANATE × LILY","title":["G-CAFL-QC","BUILDER"],"subtitle":"GOAL  ·  CONTEXT  ·  AUDIENCE  ·  FORMAT  ·  LIMITS  ·  QC","base":"#100e0c","accent":"#e8b04b","accent2":"#c6283f"}
FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_REG = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
def font(sz, bold=False):
    try: return ImageFont.truetype(FONT_BOLD if bold else FONT_REG, sz)
    except OSError: return ImageFont.load_default()
def rgb(c):
    return tuple(int(c[i:i+2], 16) for i in (1, 3, 5))

im = Image.new("RGB", (W, H), rgb(CONFIG["base"]))
d = ImageDraw.Draw(im)
accent = rgb(CONFIG["accent"]); secondary = rgb(CONFIG["accent2"])
# Restrained graphic system: framed editorial cover and right-side emblem.
d.rectangle((0, 0, 18, H), fill=secondary)
d.rectangle((64, 64, W-64, H-64), outline=accent, width=2)
d.rectangle((72, 72, W-72, 80), fill=secondary)
d.rectangle((72, H-94, W-72, H-88), fill=secondary)
d.text((104, 109), CONFIG["brand"], font=font(21, True), fill=accent)
d.text((104, 163), "OFFICIAL DIGITAL EXPERIENCE", font=font(16), fill=(180, 180, 178))
# Large text in two steps, using modest tracking and max width.
lines = CONFIG["title"]
size = 78 if CONFIG["kind"] != "builder" else 63
for idx, word in enumerate(lines):
    yy = 257 + idx * 102
    d.text((94, yy), word, font=font(size, True), fill=(248, 245, 235) if CONFIG["kind"] != "pages" else accent)
# Recognizable brand motif, drawn directly rather than loading external assets.
cx, cy, radius = 978, 320, 130
d.ellipse((cx-radius, cy-radius, cx+radius, cy+radius), outline=accent, width=5)
d.ellipse((cx-radius+20, cy-radius+20, cx+radius-20, cy+radius-20), outline=secondary, width=3)
if CONFIG["kind"] == "pages":
    d.rounded_rectangle((cx-67, cy-81, cx-20, cy+85), radius=12, fill=secondary)
    d.ellipse((cx-32, cy-78, cx+75, cy+29), fill=secondary)
elif CONFIG["kind"] == "python":
    d.rounded_rectangle((cx-73,cy-66,cx+73,cy+66),radius=30,outline=accent,width=8)
    d.line((cx-36,cy-10,cx-8,cy+16,cx-36,cy+40),fill=secondary,width=11)
    d.line((cx+11,cy+42,cx+50,cy+42),fill=accent,width=9)
elif CONFIG["kind"] == "arkives":
    d.line([(cx,cy-75),(cx,cy+80)],fill=accent,width=7)
    d.arc((cx-80,cy-56,cx+4,cy+92),90,280,fill=accent,width=9)
    d.arc((cx-4,cy-56,cx+80,cy+92),260,90,fill=accent,width=9)
else:
    d.text((cx-66,cy-53), "QC",font=font(70,True),fill=accent)
d.text((102, 536), CONFIG["subtitle"], font=font(19,True), fill=accent)
# Use lossless palette PNG with exact 1200 x 630 dimensions.
im.convert("P", palette=Image.Palette.ADAPTIVE, colors=64).save(ROOT/"social-preview.png", optimize=True)
print("Created social-preview.png", (ROOT/"social-preview.png").stat().st_size)

def make_pages_icon(side, outfile):
    # Generate four needed raster icons for PAGES using its established
    # cream background / red block-and-circle icon vocabulary.
    ico=Image.new("RGB",(side,side),(255,244,226))
    q=ImageDraw.Draw(ico)
    s=side/512
    q.rounded_rectangle((int(100*s),int(68*s),int(183*s),int(449*s)),radius=max(2,int(18*s)),fill=(164,0,22))
    q.ellipse((int(154*s),int(68*s),int(418*s),int(332*s)),fill=(174,7,27))
    ico.save(ROOT/outfile,optimize=True)
if CONFIG["kind"] == "pages":
    for n,f in [(32,"favicon-32.png"),(180,"apple-touch-icon.png"),(192,"icon-192.png"),(512,"icon-512.png")]:
        make_pages_icon(n,f)
        print("Created",f)
