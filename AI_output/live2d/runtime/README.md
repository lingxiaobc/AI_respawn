# Live2D Runtime Export

Export the verified `../model/portrait_cubism_runtime_ready.cmo3` into the `portrait/` subdirectory without overwriting the source model.

Expected minimum layout:

```text
portrait/
  portrait.moc3
  portrait.model3.json
  portrait.cdi3.json
  portrait.<atlas-size>/
    texture_00.png
    texture_01.png  (only when generated)
```

The atlas size and number of texture files are determined by the Cubism texture-atlas settings. The exact directory and file names must match the relative URIs written into `portrait.model3.json`; do not rename exported texture files independently of that JSON file.

This directory intentionally does not contain Cubism Core or the SDK Framework. Their redistribution and repository placement must follow the Live2D SDK license separately from the model export.

The checked export uses one 2048×2048 texture and has been validated in both the official TypeScript sample and the application adapter. Do not rename the runtime files without updating `portrait.model3.json` and the Vite asset route together.
