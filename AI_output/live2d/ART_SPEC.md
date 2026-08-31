# Live2D Portrait Stage 0 Art Specification

## Scope

- Target: mobile portrait viewport, primarily 320–430 CSS px wide.
- Character render: fixed frontal bust; no head, gaze, hair, body, eyebrow, or expression animation.
- Runtime parameters:
  - `ParamMouthOpenY`: 0 closed, 0.5 medium, 1 open.
  - `ParamEyeLOpen`: 1 open, 0.5 half, 0 closed.
  - `ParamEyeROpen`: 1 open, 0.5 half, 0 closed.
- Source identity and all pixels outside the approved eye and mouth masks are immutable.

## Source and target regions

- Source: `C:\Users\lenox\Pictures\正脸.png` (636×821).
- Workspace master: `source/portrait-original.png`; never overwrite it.
- Initial regions in source pixels; refine masks inside these rectangles only:
  - viewer-left eye: x=178..304, y=282..365
  - viewer-right eye: x=332..458, y=282..365
  - mouth and surrounding skin: x=230..408, y=420..520
- Generated pixels are permitted only inside the final masks contained by these rectangles.

## Required art layers

```text
static/background
static/hair_ears_neck_body
static/face_base_repaired
eye_L/sclera
eye_L/iris_pupil_highlight
eye_L/upper_lid_lashes
eye_L/lower_lid
eye_L/closed_lid_texture
eye_L/socket_skin_fill
eye_R/...same
mouth/upper_lip
mouth/lower_lip
mouth/corner_L
mouth/corner_R
mouth/inner_shadow
mouth/upper_teeth (optional)
mouth/tongue_lower_inner (optional)
mouth/surrounding_skin_fill
mouth/philtrum_chin_patch
```

## AI-edit boundary

- Allowed: local donor patches for mouth interior, subtle upper teeth, closed eyelid texture, eye-socket skin, and skin hidden by the original lips.
- Forbidden: full-face regeneration, face-shape changes, nose changes, hair changes, clothing changes, background changes, beautification, age changes, skin smoothing, expression redesign, or new accessories.
- Composition rule: generated candidates are donors only. The final composite must use original pixels everywhere outside the final local mask.

## Static art gate

- Contact sheet must show mouth values 0 / 0.5 / 1 and eye values 1 / 0.5 / 0, plus closed-eyes+closed-mouth and open-eyes+open-mouth combinations.
- At 320 CSS px viewport width there must be no visible hole, duplicate lip/eye, face jump, hard rectangular seam, or color-temperature change.
- At source resolution, a difference image outside the approved masks must be completely black (zero changed pixels).
- Two targeted donor iterations are allowed. If neither passes, stop before Cubism modeling and request a route decision.

## Motion gate

- Mouth must interpolate continuously and return to 0 on silence, playback completion, error, and unmount.
- Blink duration target: 180–260 ms; random interval target: 3.5–7.5 s; occasional double blink is optional, not required.
- Runtime animation must be owned by the Canvas/model loop, not React render state at audio-frame frequency.

## Audio gate

- Drive the mouth from the actual `AudioContext` playback graph or an envelope scheduled on the same audio clock.
- Do not use WebSocket arrival time.
- Apply gain, noise floor, fast attack, slower release, and clamp to 0..1.
- Existing PCM format, monotonic playback ordering, automatic turn detection, and half-duplex behavior are invariant.

## Stop conditions

- Identity drift outside the local masks.
- Local donor remains visibly pasted-on after two single-variable iterations.
- Cubism Editor/Core requires an unapproved purchase or account login.
- Cubism model cannot be loaded by the official Web sample.
- Integration requires changing the provider or browser audio protocol.
