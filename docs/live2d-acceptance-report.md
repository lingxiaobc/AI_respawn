# Live2D Portrait Stage 0 Acceptance

## Delivered behavior

- The immutable 636×821 portrait remains the full opaque identity base. AI-generated pixels are restricted to approved local mouth and eye masks; no generated full-frame portrait is used at runtime.
- The runtime exposes only `ParamMouthOpenY`, `ParamEyeLOpen`, and `ParamEyeROpen` for Stage 0 behavior.
- The React Canvas adapter loads the MOC3, 2048 atlas, Core, and Framework shaders without rebuilding the model on React state changes. Cleanup releases textures and model/renderer resources while preserving React Strict Mode remount compatibility.
- Both eyes share a 200 ms close/hold/open controller. Each next blink is independently randomized between 2.4 and 5.8 seconds.
- Provider PCM playback is scheduled exactly as before, but each `AudioBufferSourceNode` now connects through one shared `AnalyserNode`. RMS mapping plus 42 ms attack and 115 ms release drives the mouth; silence and playback completion return it to zero.

## Recorded checks (2026-09-01)

- Official Cubism Web sample: default, individual eye closures, both eyes closed, mouth open, and mouth-open/eyes-closed combination rendered; final console contained zero errors and warnings.
- Application at 390×844: portrait rendered inside the responsive stage with no current WebGL warning or error. A readback gate confirmed non-transparent pixels before publishing the model handle.
- Blink browser sample: multiple transition samples were observed over seven seconds, minimum sampled eye value `0.112`, final value `1.000`; deterministic tests verify the full 200 ms curve and variable intervals.
- Fixed playback diagnostic: observed mouth envelope samples `0.861, 0.932, 0.911, 0.930, 0.944, 0.875, 0.231, 0.054, 0.013, 0.003, 0.000`; this used the real browser playback/analyser path.
- `npm test`: 42/42 passed.
- `npm run build`: TypeScript check and Vite production build passed; the output contains the Core runtime, shaders, MOC3, model JSON, display metadata, and texture.

The local voice gateway was not running during the final browser check, so a new live provider conversation was not claimed as verified. The fixed PCM diagnostic verifies the same post-network scheduling, analysis, rendering, and close-mouth path. A live round remains an operational smoke check when valid provider credentials and microphone access are available.

## Distribution boundary

This repository does not track the Cubism SDK Framework or Core. Development and builds read them from `LIVE2D_SDK_PATH` (defaulting to the current local `P:/live2D/CubismSdkForWeb-5-r.5`). Before public or commercial distribution, the owner must review the current Live2D SDK/Core and model licensing terms for the intended product and distribution method.
