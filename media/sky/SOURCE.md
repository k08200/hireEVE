# Hero sky photograph

- **File**: `dusk-{1280,1920,2560}.{webp,jpg}`
- **Source**: Unsplash — "Soft pink and orange clouds in a pastel sky"
  https://unsplash.com/photos/soft-pink-and-orange-clouds-in-a-pastel-sky-A3u8Ugv1EAw
- **Photographer**: Scott Goodwill
- **Licence**: Unsplash License — "free to use ... for commercial and
  non-commercial purposes. No permission needed." Attribution is not required;
  this file records it anyway so the provenance is auditable.
  https://unsplash.com/license
- **Not permitted by that licence** (neither applies here): selling the image
  unmodified, or compiling Unsplash images into a competing image service.

Derivatives were transcoded through the Unsplash image CDN (`?w=…&fm=…&q=72`)
and are served from this repo — the deployed site never hotlinks their CDN.

AVIF is deliberately absent. On this image it encodes LARGER than WebP
(482 KB vs 191 KB at 2560px) because the frame is mostly smooth gradient, so
shipping it would cost bytes rather than save them.
