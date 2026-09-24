# 2D Narrator Character Kit

This kit is the default reusable narrator for vertical HyperFrames explainers.

## Files

- `narrator.svg`: active transparent SVG character, currently a vectorized static asset.
- `narrator-source.svg`: editable source exported from Inkscape.
- `narrator-snippet.html`: paste-ready static SVG image wrapper for HyperFrames.
- `narrator-layered-default.svg`: backup of the original layered demo narrator.
- `narrator-snippet-layered-default.html`: backup of the original inline layered animation snippet.

## Default Placement

For `1080x1920` Reels/TikTok/Shorts, keep the narrator inside the social safe area:

```text
x: 110px to 360px
y: 520px to 1260px
```

Recommended CSS:

```css
.narrator-wrap {
  position: absolute;
  left: 118px;
  top: 610px;
  width: 230px;
  height: auto;
  z-index: 8;
  pointer-events: none;
}
```

## Poses

Use these pose names in storyboard notes and implementation comments:

- `idle`: neutral listening or explaining.
- `point-right`: points at cards or text to the right.
- `explain`: both hands open, used for step breakdowns.
- `surprised`: hook or pattern interrupt.
- `cta`: points down or toward the comment prompt.

The current `narrator.svg` is a vectorized static character, not a separated rig. Use pose names as creative direction, but animate it as one whole element unless a future SVG is manually separated into parts.

## GSAP Motion Recipe

Add this to the main paused HyperFrames timeline, adjusted to scene timing:

```js
tl.fromTo("#narrator", { opacity: 0, x: -38 }, { opacity: 1, x: 0, duration: 0.45, ease: "power3.out" }, 0.2);
tl.to("#narrator", { y: -8, duration: 1.4, repeat: 3, yoyo: true, ease: "sine.inOut" }, 0.8);
tl.to("#narrator", { rotation: -2, duration: 0.9, repeat: 4, yoyo: true, ease: "sine.inOut" }, 1.0);
```

Keep all motion deterministic: no runtime clocks, no random, no event-driven animation.
