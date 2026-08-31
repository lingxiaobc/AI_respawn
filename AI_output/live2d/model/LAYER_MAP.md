# Layer and Parameter Map

## Import package

- `portrait_cubism_seamless_v2_raw.psd`: current preferred Cubism 5.3 import candidate. It contains one merged preview frame plus ten independently verified named full-canvas sRGB layers, uses uncompressed channel data, fixes the white seam caused by mismatched alpha, and orders neutral layers on top for a correct initial display.
- `portrait_cubism_seamless_raw.psd`: superseded seam-test package with invalid repeated layer names; do not use.
- `portrait_cubism_raw.psd`: superseded importable candidate; its state-layer alpha did not fully cover the static base holes and exposed the Cubism canvas during opacity keying.
- `portrait_cubism.psd`: superseded RLE candidate; Cubism 5.3 rejected its ImageMagick-produced RLE row-length table.
- `portrait_manual.psd`: preferred 10 full-canvas sRGB layers at 636×821.
  1. `static_locked_base`
  2. `eye_L_open_local`
  3. `eye_L_half_local`
  4. `eye_L_closed_local`
  5. `eye_R_open_local`
  6. `eye_R_half_local`
  7. `eye_R_closed_local`
  8. `mouth_closed_local`
  9. `mouth_half_local`
  10. `mouth_open_local`
- `portrait_import.psd`: legacy fallback 7 full-canvas sRGB package with base, half/closed eyes and half/open mouth states.
- `portrait_master.psd`: provenance-oriented source with original reference and open/closed local layers.
- `../layers/*.png`: canonical transparent bitmap layers if the PSD must be rebuilt in Photoshop or Clip Studio Paint.

## Intended Cubism keys

| Parameter | 0 | 0.5 | 1 |
| --- | --- | --- | --- |
| `ParamMouthOpenY` | base closed mouth visible | `mouth_half_local` visible | `mouth_open_local` visible |
| `ParamEyeLOpen` | `eye_L_closed_local` visible | `eye_L_half_local` visible | base open left eye visible |
| `ParamEyeROpen` | `eye_R_closed_local` visible | `eye_R_half_local` visible | base open right eye visible |

The Stage 0 art uses local state layers so the source identity remains locked. Cubism may key opacity and local mesh deformation between these states, but must not expose generated full-frame pixels. Prefer `portrait_cubism_seamless_v2_raw.psd`; it keeps the individually preserved layer names, avoids the ZIP and RLE decoder failures observed in Cubism 5.3, and ensures every base-layer hole is fully covered before the patch feathers over unchanged skin.

## Static acceptance evidence

- `../preview/state-contact-sheet.png` shows all primary keys and the closed-eyes/open-mouth combination.
- `../preview/mobile-320-composite.png` checks the intended small-screen scale.
- Difference checks for half mouth, half eyes and combined extreme state all report zero changed pixels outside the approved union mask.
