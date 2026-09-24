# Visual Plan

## Global

- Canvas: `1080x1920`
- Safe lane: `x 96..860`, `y 220..1380`
- Duration: `40-60s`
- Template: `data-lab`
- Narrator: none
- Background: dark analytical lab, subtle grid, strong teal accent, large legible data panels.
- Layout: large headline and concise copy in the safe lane, with one dominant visual stage per scene.
- Draft render: `--quality draft --crf 26`
- Final render: `--quality standard --crf 23`
- Do not show scene label pills, visible scene timestamps, or a bottom progress bar.

## Scenes

| Scene | Stage type | Visual | On-screen text |
| --- | --- | --- | --- |
| 01 | `comparison` | Web publicada a trozos vs sitio completo. | NO LANCES A MEDIAS |
| 02 | `timeline` | Staging cerrado, Día 1, Sitemap, Search Console. | DIA 1 COMPLETO |
| 03 | `dashboard` | Señales iniciales: perfiles, directorios, citas, referencias. | 50-150 SENALES |
| 04 | `comparison` | 1.000 páginas con 100-200 enlaces vs 10 páginas con 5 al mes. | ESCALA POR TAMANO |
| 05 | `cta` | Comentario LANZAR con checklist de acciones. | COMENTA LANZAR |

## Notes

- Keep all critical text inside the vertical social safe lane.
- Keep all numbers large enough for mobile reading.
- Treat NotebookLM citation markers as discarded source references, not as script content.
- Phrase ranking and penalty claims as risk management, not guaranteed outcomes.
