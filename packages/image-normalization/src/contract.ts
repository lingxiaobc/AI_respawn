export const NORMALIZATION_CONTRACT = Object.freeze({
  width: 1024,
  height: 1536,
  outputFormat: "png" as const,
  model: "openai/gpt-image-2",
  quality: "high",
  inputFidelity: "high",
  count: 1,
  promptVersion: "portrait-normalization-v1",
});

export const NORMALIZATION_PROMPT = `Edit the supplied portrait into a standardized mobile video-call portrait while preserving the same person's identity exactly.

Required composition:
- Output a vertical 1024 by 1536 portrait.
- One person only, facing the camera, head level and horizontally centered.
- Keep the entire head and every facial feature clear and unobstructed.
- Show the shoulders and upper chest. If shoulders are missing, extend the existing clothing and background naturally.
- Leave modest space above the hair and on both sides of the head.
- Use a relaxed, approachable expression: eyes naturally open, mouth naturally closed, not pursed, not stern; a very subtle smile is acceptable.

Identity and scene preservation are strict:
- Preserve facial geometry, age, skin texture, ethnicity, hair, eyebrows, eyes, nose, lips, ears, and all distinctive features.
- Preserve the original clothing, colors, lighting, and background. Only extend them where canvas completion requires it.
- Do not beautify, rejuvenate, retouch, slim, stylize, add makeup, change hairstyle, change clothes, replace the background, add objects, or make the result look like an ID photo.
- Keep everything outside the minimum composition/expression corrections visually unchanged.`;

export const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const MAX_INPUT_BYTES = 12 * 1024 * 1024;
export const MIN_INPUT_EDGE = 512;
export const MAX_INPUT_EDGE = 8192;

