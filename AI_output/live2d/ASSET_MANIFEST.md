# Live2D Portrait Asset Manifest

## Immutable source

- User source: `C:\Users\lenox\Pictures\正脸.png`
- Workspace copy: `source/portrait-original.png`
- Dimensions: 636×821 px
- SHA-256 for both files: `f98a8e34f9216c3806fffc01f55bc29f6e5e941433edc1193667b83e2ba494c3`
- Policy: never overwrite either source; all generated or transformed artifacts use new filenames.

## Approved local-edit masks

- `work/mask-eye-left.png`: viewer-left eye region only.
- `work/mask-eye-right.png`: viewer-right eye region only.
- `work/mask-mouth.png`: mouth and immediately surrounding skin only.
- `work/mask-all-approved.png`: union of the three allowed local-edit masks.
- `work/mask-static-locked.png`: inverse mask defining pixels that generation may never supply.

## Original-pixel layers

- `layers/portrait-locked-reference.png`: byte-equivalent visual reference.
- `layers/static-locked-original.png`: all non-target original pixels with transparent local-edit holes.
- `layers/eye-left-original.png`: original viewer-left eye donor.
- `layers/eye-right-original.png`: original viewer-right eye donor.
- `layers/mouth-closed-original.png`: original closed-mouth donor.

## Working crops

- `work/eye-left-roi.png`
- `work/eye-right-roi.png`
- `work/mouth-roi.png`
- `preview/roi-contact-sheet.png`

Only assets listed under a later “AI local donors” section may contain generated pixels. Final composites must take every pixel outside `mask-all-approved.png` from `portrait-original.png`.

## AI local donors

- `donors/mouth-open-generated-full.png`: ImageGen edit candidate; full output retained only for provenance.
- `donors/mouth-open-aligned.png`: candidate aligned to the immutable 636×821 source canvas.
- `donors/eyes-closed-generated-full.png`: ImageGen edit candidate; full output retained only for provenance.
- `donors/eyes-closed-aligned.png`: candidate aligned to the immutable 636×821 source canvas.
- `layers/mouth-open-local.png`: final mouth donor with alpha restricted to `mask-mouth-final.png`.
- `layers/eye-left-closed-local.png`: final viewer-left closed-eye donor restricted to its final mask.
- `layers/eye-right-closed-local.png`: final viewer-right closed-eye donor restricted to its final mask.

Generated full outputs are never used directly as the character portrait. The final combined preview reports a maximum normalized difference of `0` outside `mask-all-approved.png`.

## AI prompts

- Mouth donor: precise-object edit requesting only a neutral medium-wide speaking mouth, dark oral cavity and subtle upper teeth; all identity, pose, lighting and non-mouth regions locked.
- Eye donor: precise-object edit requesting only naturally closed eyelids; identity, mouth, nose, eyebrows, pose, lighting and non-eye regions locked.
- Half-mouth donor: precise-object edit requesting only a narrow neutral speaking gap with unchanged jaw and mouth corners.
- Half-eye donor: precise-object edit requesting eyelids covering roughly half the irises without eyebrow or expression movement.

## Layered deliverables

- `model/portrait_import.psd`: seven-layer sRGB import package with base, half/closed eyes and half/open mouth states.
- `model/portrait_manual.psd`: preferred ten-layer import package with a dedicated static base plus independent left/right eye open/half/closed layers and mouth closed/half/open layers. It avoids overlap ambiguity in the earlier package.
- `model/portrait_cubism.psd`: Cubism-compatible ten-layer import package. It is the current preferred file: layer names are preserved individually and all PSD image resources use RLE compression (Cubism 5.3 does not accept the previous ZIP-without-prediction encoding).
- `model/portrait_cubism_raw.psd`: current import candidate using uncompressed PSD channel data. This bypasses both the ZIP rejection and Cubism 5.3's failure to decode ImageMagick's RLE row-length table; it preserves the same ten named layers.
- `model/portrait_cubism_seamless_v2_raw.psd`: current corrected Cubism import package. Its ten layer names are independently verified, its stacking order renders a neutral open-eye/closed-mouth default when all layers are initially visible, and its eye/mouth state masks fully cover the static base holes before feathering outside them.
- `model/portrait_cubism_seamless_raw.psd`: superseded seam-test package; do not import because a PSD assembly error assigned `mouth_open_local` to every layer name and its default stack exposed the extreme states.
- `model/portrait_master.psd`: eight-layer provenance/editing package.
- `model/LAYER_MAP.md`: parameter-to-layer key mapping.
- `preview/state-contact-sheet.png`: corrected six-state contact sheet using dedicated half-state donors rather than cross-fades.
- `preview/mobile-320-composite.png`: intended small-screen extreme-state preview.
- `work/preview-seamless-contact-sheet.png`: neutral, half and extreme-state verification for the corrected seam-safe layers.
