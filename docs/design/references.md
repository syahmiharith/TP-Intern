# Visual references

## Pearlescent canvas — 9 November 2026

User direction: an iridescent or pearlescent background. Preserve the existing receipt workflow and component styling.

Inspected Mobbin screenshots:

- [Portrait sign-in](https://mobbin.com/screens/a9311893-ff3a-452c-8389-fa9991708af7): pale multicolor reflections behind a white form. Adopt the low saturation and broad, blended color transitions; keep fields and receipt cards neutral.
- [Gumloop profile setup](https://mobbin.com/screens/712fbb80-dedf-41d4-98db-2426f02db828): light lilac, blue and peach canvas with a sharply readable white task surface. Adopt that separation between atmospheric background and operational content.

Implementation uses layered CSS gradients with a diagonal white sheen, an ivory base, and lilac, sage, peach and blue reflections. The finish is static, has no pointer effects or extra DOM, and adds no asset downloads or dependencies. Existing typography, spacing, controls, focus styling and semantic colors remain authoritative.
