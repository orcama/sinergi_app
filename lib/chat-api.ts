import { apiClient } from "@/lib/api";
import type { ChatMessage, ChatSession } from "@/lib/types";

type StoredMessagePayload = {
  id: string;
  role: "user" | "assistant";
  content: string;
  thinking?: string | null;
  thinking_seconds?: number | null;
  sources?: unknown[] | null;
};

type ChatPayload = {
  id?: string;
  title: string;
  messages: StoredMessagePayload[];
  is_pinned: boolean;
  model?: string | null;
  provider?: string | null;
  context_limit?: number | null;
  project_id?: string | null;
  created_at?: string;
  updated_at?: string;
};

function serializeMessage(message: ChatMessage): StoredMessagePayload {
  const payload: StoredMessagePayload = {
    id: message.id,
    role: message.role,
    content: message.content ?? "",
    thinking: message.thinking ?? null,
    thinking_seconds: message.thinkingSeconds ?? null,
    sources: message.sources ?? null,
  };
  return payload;
}

function normalizeMessage(payload: StoredMessagePayload): ChatMessage {
  return {
    id: payload.id,
    role: payload.role,
    content: payload.content,
    thinking: payload.thinking ?? undefined,
    thinkingSeconds: payload.thinking_seconds ?? undefined,
    sources: payload.sources as ChatMessage["sources"],
  };
}

function normalizeSession(payload: ChatPayload): ChatSession {
  return {
    id: payload.id ?? "",
    title: payload.title ?? "",
    messages: (payload.messages ?? []).map(normalizeMessage),
    createdAt: payload.created_at ?? payload.updated_at ?? "",
    isPinned: Boolean(payload.is_pinned),
    model: (payload.model as ChatSession["model"]) ?? undefined,
    provider: (payload.provider as ChatSession["provider"]) ?? undefined,
    contextLimit: payload.context_limit ?? 128_000,
    projectId: payload.project_id ?? undefined,
  };
}

export function serializeSession(session: ChatSession): ChatPayload {
  return {
    id: session.id,
    title: session.title,
    messages: session.messages
      .filter((m) => !m.isLoading)
      .map(serializeMessage),
    is_pinned: Boolean(session.isPinned),
    model: session.model ?? null,
    provider: session.provider ?? null,
    context_limit: session.contextLimit ?? null,
    project_id: session.projectId ?? null,
  };
}

export async function listChatSessions(): Promise<ChatSession[]> {
  const response = await apiClient.get<{ chats: ChatPayload[] }>("/api/chats");
  return (response.data.chats ?? []).map(normalizeSession);
}

export async function getChatSession(id: string): Promise<ChatSession> {
  const response = await apiClient.get<ChatPayload>(`/api/chats/${id}`);
  return normalizeSession(response.data);
}

export async function saveChatSession(session: ChatSession): Promise<void> {
  await apiClient.post("/api/chats", serializeSession(session));
}

export async function deleteChatSession(id: string): Promise<void> {
  await apiClient.delete(`/api/chats/${id}`);
}