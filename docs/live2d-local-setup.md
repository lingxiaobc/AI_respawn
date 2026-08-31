# Live2D Local Toolchain Setup

The art package is ready, but the official Live2D tools require a person to review and accept Live2D's agreements. This project does not record an email address or automate consent.

## Required downloads

1. Cubism Editor for Windows, stable release:
   `https://www.live2d.com/en/cubism/download/editor/`
2. Cubism SDK for Web, stable release:
   `https://www.live2d.com/en/sdk/download/web/`

On both pages, choose the appropriate individual/enterprise option, enter an email address if required, review the terms, and explicitly consent. Downloading or launching the software constitutes acceptance under Live2D's page notice.

## Install and place files

1. Install Cubism Editor in its default Windows location.
2. Extract the Cubism SDK for Web package outside the repository or under a user-approved local tools directory.
3. Do not commit the proprietary Cubism Core unless its license explicitly permits the intended distribution.
4. Confirm these are available:
   - Cubism Editor executable.
   - `Core/live2dcubismcore.js` and its TypeScript declaration.
   - Cubism Web Framework and TypeScript sample.

## Resume point

Open `AI_output/live2d/model/portrait_cubism_seamless_v2_raw.psd` in Cubism Editor and create a new model. This candidate uses uncompressed PSD channel data after Cubism 5.3 rejected the earlier ZIP encoding and failed to decode the ImageMagick RLE row table. It also replaces the earlier importable packages whose alpha left a transparent ring or whose layer labels were repeated. The intended parameter-to-layer mapping is documented in `AI_output/live2d/model/LAYER_MAP.md`.

Before Web integration, export:

```text
portrait.cmo3
runtime/portrait.moc3
runtime/portrait.model3.json
runtime/portrait.cdi3.json
runtime/textures/*.png
```

Verify the exported model in the official Cubism Web sample before modifying the application.

## Current status

Cubism Editor 5.3.03 FREE and the Web SDK are available under `P:\live2D`. The corrected uncompressed PSD is ready for a fresh import; Cubism parameter setup and runtime export remain to be completed manually in the Editor.
