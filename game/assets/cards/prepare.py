"""Create browser assets and a review sheet from generated full-resolution masters."""
import json
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps

root = Path(__file__).resolve().parent
cards = json.loads((root / 'catalog.json').read_text())
missing = []
tiles = []
font_path = Path('/System/Library/Fonts/Supplemental/Arial.ttf')
font = ImageFont.truetype(str(font_path), 13) if font_path.exists() else ImageFont.load_default()
for card in cards:
    source = root / 'full' / card['asset']
    if not source.exists():
        missing.append(card['n'])
        continue
    with Image.open(source) as image:
        image = image.convert('RGB')
        image.thumbnail((1000, 750), Image.Resampling.LANCZOS)
        if '--sheet-only' not in sys.argv:
            image.save(root / card['asset'], quality=88, method=6)
        tile = Image.new('RGB', (240, 210), '#f4ecdd')
        tile.paste(ImageOps.contain(image, (240, 180)), (0, 0))
        draw = ImageDraw.Draw(tile)
        label = f"{source.stem}  {card['n']}"
        while draw.textlength(label, font=font) > 224:
            label = label[:-2] + '…'
        draw.text((8, 187), label, font=font, fill='#263545')
        tiles.append(tile)
if missing and '--partial' not in sys.argv:
    raise SystemExit(f'Missing {len(missing)} artworks: {missing}')
sheet = Image.new('RGB', (240 * 9, 210 * ((len(tiles) + 8) // 9)), '#f4ecdd')
for i, tile in enumerate(tiles):
    sheet.paste(tile, ((i % 9) * 240, (i // 9) * 210))
sheet.save(root / 'contact-sheet.jpg', quality=90)
print(f'Prepared {len(tiles)} browser assets and contact-sheet.jpg')
if missing:
    print(f'{len(missing)} cards still need artwork.')
