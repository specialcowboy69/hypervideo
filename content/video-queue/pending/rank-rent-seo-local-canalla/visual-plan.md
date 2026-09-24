# Visual Plan

## Global

- Canvas: `1080x1920`
- Safe lane: `x 96..860`, `y 220..1380`
- Duration: `40-60s`
- Template: `videos/light-workshop`
- Narrator: 3D GLB character from `assets/character/`
- Background: light editorial workshop grid, paper-like panels, blue/green/pink accents.
- Layout: narrator left/lower-left, concise headline and copy in safe lane, visual stage on the right.
- Draft render: `--quality draft --crf 26`
- Final render: `--quality standard --crf 23`
- Do not show scene label pills, visible scene timestamps, or a bottom progress bar.

## Scenes

| Scene | Visual | On-screen text | Narrator animation |
| --- | --- | --- | --- |
| 01 | Red warning card over a dead SEO report metric. | ¿SIGUES MENDIGANDO? | yelling |
| 02 | SEO report document crossed out with cancellation tag and angry metric cards. | UNA COMPLETA MIERDA | talking |
| 03 | Three connected cards: Crear web, Enviar llamadas, Cobro semanal. | CREA, REGALA Y COBRA | talking |
| 04 | Route cards showing domain, phone number, and call redirection control. | TÚ TIENES EL CONTROL | happy |
| 05 | CTA panel with checklist and highlighted word RENTAR. | COMENTA RENTAR | happy |

## Notes

- Keep all critical text inside the vertical social safe lane.
- Translate NotebookLM visual hints into existing template elements only: cards, flow, route, warning, CTA.
- Do not invent real maps, new 3D objects, camera moves, or precise physical actions for the narrator.
