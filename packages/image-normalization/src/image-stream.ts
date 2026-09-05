/** Bounded SSE reader. Partial previews never count as a completed asset. */
export async function readEditedImageStream(response: Response): Promise<string> {
  if (!response.body) throw new Error("Image stream has no body");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const parse = (block: string): string | undefined => {
    const data = block.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
    if (!data || data === "[DONE]") return;
    let event: { type?: string; b64_json?: string; error?: { message?: string }; message?: string };
    try { event = JSON.parse(data); } catch { throw new Error("Invalid image stream event JSON"); }
    if (event.type === "error" || event.error) throw new Error(event.error?.message ?? event.message ?? "Image stream error");
    if (event.type !== "image_edit.completed") return;
    if (typeof event.b64_json !== "string" || !event.b64_json.length) throw new Error("Completed image event has no image");
    return event.b64_json;
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      if (buffer.length > 32 * 1024 * 1024) throw new Error("Image stream event exceeds size limit");
      let match: RegExpExecArray | null;
      while ((match = /\r?\n\r?\n/.exec(buffer))) {
        const block = buffer.slice(0, match.index);
        buffer = buffer.slice(match.index + match[0].length);
        const result = parse(block);
        if (result) return result;
      }
      if (done) {
        const result = parse(buffer);
        if (result) return result;
        throw new Error("Image stream ended before completed event; completion is unknown");
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
