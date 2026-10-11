# Kétharmad artwork

Generated with the built-in image generation tool. Each unique card has its own
illustration. `catalog.json` maps the numeric filenames to the Hungarian card
names; `prompts.json` contains the complete generation prompts.

The shared visual style is ink-and-gouache editorial caricature, with paper
texture, bold contours, exaggerated expressions and visual jokes drawn from the
existing cards' flavour text.

| Type | Composition | Type accent |
| --- | --- | --- |
| Szereplő | Large expressive portrait, circular backdrop, signature prop | Ochre |
| Intézmény | Architecture or machinery diorama, rectangular backdrop | Teal |
| Bázis | Location and resource scene | Sage |
| Lépés | Dynamic diagonal narrative | Amber |
| Reakció | Close-up metaphor and burst | Coral |
| Esemény | Panoramic editorial scene | Indigo |
| Jelző | Simple isolated silhouette | Lilac |

The `full/` directory contains full-resolution WebP masters at quality 95.
Top-level WebP files are optimized for the game and printable catalogue.
PNG intermediates created in this run were converted to preserve workspace disk space. Run `python3 game/assets/cards/prepare.py`
from the project root to regenerate the WebP assets and numbered contact sheet.
No gameplay rules are changed by the artwork.
