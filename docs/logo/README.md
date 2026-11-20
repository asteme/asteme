# Logo

The mark is the product icon, unchanged: five stars joined into one figure. The word is set in Inter SemiBold capitals with wide spacing and stored as outlines, so no font is needed to show it.

| File | Use |
| --- | --- |
| `logo-light.svg`, `logo-dark.svg` | Mark and word side by side. `light` is for light backgrounds, `dark` for dark ones |
| `logo-stacked-light.svg`, `logo-stacked-dark.svg` | Mark above the word, for square or narrow spaces |
| `mark-light.svg`, `mark-dark.svg` | The mark alone. Not below 20 px: the rings close up |
| `wordmark-light.svg`, `wordmark-dark.svg` | The word alone |
| `avatar.svg`, `avatar.png` | Square, on the star chart's indigo, the middle star in ochre. For a profile or repository picture |

Colors: ink `#1f2430`, paper white `#ece4d4`, indigo `#16203a`, ochre `#c98f4a`.

The name is aster (a star) and -eme (a smallest unit, as in phoneme): one star, one memory. In running text it is written "Asteme". All capitals is the logo only; all lower case is for package, command and tool names.

To follow the reader's theme on GitHub:

```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/logo/logo-dark.svg">
  <img src="docs/logo/logo-light.svg" alt="Asteme" height="48">
</picture>
```

Keep clear space around the logo of at least the height of one letter. Do not recolor the rings separately, stretch it, or set the word in another typeface.
