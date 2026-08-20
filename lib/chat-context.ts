import type { Attachment, ChatMessage } from "./types";

/**
 * Keep every successfully uploaded document available for later turns in the
 * same chat. Composer attachments override matching historical entries so the
 * turn that added an in-flight or failed upload still reports that state.
 */
export function collectConversationAttachments(
  messages: Pick<ChatMessage, "attachments">[],
  current: Attachment[]
): Attachment[] {
  const documents = new Map<string, Attachment>();

  for (const message of messages) {
    for (const attachment of message.attachments ?? []) {
      if (attachment.status === "done") documents.set(attachment.id, attachment);
    }
  }
  for (const attachment of current) documents.set(attachment.id, attachment);

  return [...documents.values()];
}
