import { test } from "node:test";
import assert from "node:assert/strict";
import { readEditedImageStream } from "./src/image-stream.ts";

function stream(text: string, chunkSize = 7) {
  return new Response(new ReadableStream({ start(controller) {
    const bytes = new TextEncoder().encode(text);
    for (let i=0;i<bytes.length;i+=chunkSize) controller.enqueue(bytes.slice(i,i+chunkSize));
    controller.close();
  } }), { headers: { "content-type": "text/event-stream" } });
}

test("image SSE handles split CRLF and ignores partial previews", async () => {
  const response = stream(': keepalive\r\n\r\nevent: image_edit.partial_image\r\ndata: {"type":"image_edit.partial_image","b64_json":"PARTIAL"}\r\n\r\ndata: {"type":"image_edit.completed","b64_json":"FINAL"}\r\n\r\n');
  assert.equal(await readEditedImageStream(response), "FINAL");
});

test("partial-only EOF is not accepted as success", async () => {
  await assert.rejects(readEditedImageStream(stream('data: {"type":"image_edit.partial_image","b64_json":"PARTIAL"}\n\n')), /ended before completed/);
});

test("image SSE errors and malformed events fail closed", async () => {
  await assert.rejects(readEditedImageStream(stream('data: {"type":"error","message":"provider failed"}\n\n')), /provider failed/);
  await assert.rejects(readEditedImageStream(stream('data: invalid\n\n')), /Invalid image stream/);
});
