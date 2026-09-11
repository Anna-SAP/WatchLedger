"""Rebuild the checked-in toolbar PNGs (requires Pillow on Windows)."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

target = Path(__file__).resolve().parents[1] / 'extension' / 'icons'
target.mkdir(exist_ok=True)
font = ImageFont.truetype('C:/Windows/Fonts/msyhbd.ttc', 176)
for state, color in [('connected', '#168347'), ('disconnected', '#737b79')]:
    image = Image.new('RGBA', (256, 256))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((4, 4, 252, 252), radius=52, fill=color)
    draw.text((128, 120), '视', font=font, fill='white', anchor='mm')
    for size in (16, 32, 48, 128):
        image.resize((size, size), Image.Resampling.LANCZOS).save(target / f'{state}-{size}.png')
