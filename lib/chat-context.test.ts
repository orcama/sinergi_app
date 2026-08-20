import assert from "node:assert/strict";
import test from "node:test";

import { collectConversationAttachments } from "./chat-context.ts";
import type { Attachment } from "./types.ts";

function attachment(
  id: string,
  status: Attachment["status"] = "done"
): Attachment {
  return {
    id,
    fileName: `${id}.pdf`,
    fileSize: 100,
    status,
    extractedText: `text for ${id}`,
  };
}

test("retains a PDF from an earlier user message on the second turn", () => {
  const judgment = attachment("judgment");

  const result = collectConversationAttachments(
    [
      { attachments: [judgment] },
      {},
      {},
    ],
    []
  );

  assert.deepEqual(result, [judgment]);
});

test("deduplicates documents and lets current upload state take precedence", () => {
  const prior = attachment("judgment");
  const current = attachment("judgment", "uploading");

  const result = collectConversationAttachments(
    [{ attachments: [prior, attachment("failed", "error")] }],
    [current]
  );

  assert.deepEqual(result, [current]);
});
