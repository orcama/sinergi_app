"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type AnchorHTMLAttributes, type ComponentProps } from "react";
import {
  Plus,
  Library,
  FolderKanban,
  History,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Pin,
  PanelLeftClose,
  PanelLeftOpen,
  Sparkles,
  MoreHorizontal,
  FileStack,
  Trash2,
  X,
  FileText,
  Check,
  CircleX,
  Upload,
  AlertCircle,
  ChevronDown,
  Cpu,
  Paperclip,
} from "lucide-react";
import type {
  Attachment,
  ChatMessage,
  ChatSession,
  Source,
} from "@/lib/types";
import { useChatStore } from "@/lib/store/chat-store";
import { collectConversationAttachments } from "@/lib/chat-context";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  extractPdfText,
  hitsToContext,
  ingestPdf,
  queryRag,
  saveToLibrary,
  type RagHit,
} from "@/lib/rag";
import { BACKEND_URL } from "@/lib/backend-url";
import { AuthGuard } from "@/lib/components/auth/AuthGuard";
import { useAuth } from "@/lib/auth-context";

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function uid(prefix: string): string {
  const cryptoObj =
    typeof crypto !== "undefined" ? (crypto as Crypto) : undefined;
  const rand = cryptoObj?.randomUUID
    ? cryptoObj.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `${prefix}-${rand}`;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 2) {
    return `${(bytes / 1024 ** 2).toFixed(1).replace(".", ",")} MB`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(0).replace(".", ",")} KB`;
  }
  return `${bytes} B`;
}

const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024; // 10MB

function estimateTokens(session: ChatSession | null): number {
  if (!session) return 0;
  const chatChars = session.messages.reduce(
    (sum, m) => sum + (m.content?.length ?? 0),
    0
  );
  const attachmentTokens = session.messages.reduce(
    (sum, m) =>
      sum +
      (m.attachments ?? []).reduce(
        (a, att) => a + (att.tokenCount ?? 0),
        0
      ),
    0
  );
  return Math.round(chatChars / 4) + attachmentTokens;
}

function formatTokens(n: number): string {
  if (n >= 1000) {
    return `${(n / 1000).toFixed(1).replace(".", ",")}K`;
  }
  return `${n}`;
}

function trimConversationToLimit(
  messages: ChatMessage[],
  limit: number
): ChatMessage[] {
  let total = 0;
  let start = messages.length;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    const tokens = Math.round((m.content?.length ?? 0) / 4);
    if (total + tokens > limit && i !== messages.length - 1) break;
    total += tokens;
    start = i;
  }
  return messages.slice(start);
}

const CHAT_API_URL = BACKEND_URL;

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`Gagal membaca file ${file.name}`));
    reader.readAsDataURL(file);
  });
}

type ChatContentPart =
  | { type: "text"; text: string }
  | { type: "pdf"; name: string; data: string };

type ChatPayloadMessage = {
  role: "user" | "assistant";
  content: string | ChatContentPart[];
};

async function buildChatBody(
  messages: Pick<ChatMessage, "role" | "content">[],
  provider: "vllm" | "wandb",
  context?: string,
  attachments?: Attachment[]
): Promise<{ provider: "vllm" | "wandb"; messages: ChatPayloadMessage[] }> {
  let lastUserIndex = -1;
  messages.forEach((m, i) => {
    if (m.role === "user") lastUserIndex = i;
  });

  let bodyMessages: ChatPayloadMessage[] = messages;

  if (attachments && attachments.length > 0 && lastUserIndex >= 0) {
    const parts: ChatContentPart[] = [];
    if (context) {
      parts.push({ type: "text", text: `[Konteks dokumen]\n${context}` });
    }
    for (const attachment of attachments) {
      if (attachment.file) {
        parts.push({
          type: "pdf",
          name: attachment.fileName,
          data: await fileToDataUrl(attachment.file),
        });
      } else if (attachment.extractedText?.trim()) {
        parts.push({
          type: "text",
          text: `[Dokumen: ${attachment.fileName}]\n${attachment.extractedText
            .trim()
            .slice(0, 31_000)}`,
        });
      }
    }
    const last = messages[lastUserIndex];
    if (last.content.trim()) {
      parts.push({ type: "text", text: last.content });
    }
    bodyMessages = messages.map((m, i) =>
      i === lastUserIndex ? { ...m, content: parts } : m
    );
  } else if (context) {
    bodyMessages = messages.map((m, i) =>
      i === lastUserIndex && m.role === "user"
        ? { ...m, content: `${m.content}\n\n[Konteks dokumen]\n${context}` }
        : m
    );
  }

  return { provider, messages: bodyMessages };
}

interface StreamHandlers {
  onThinking?: (chunk: string) => void;
  onAnswer?: (chunk: string) => void;
}

/** Stream a chat completion from /api/chat/stream and parse the SSE events. */
async function streamChat(
  body: { provider: string; messages: ChatPayloadMessage[] },
  handlers: StreamHandlers
): Promise<void> {
  const response = await fetch(`${CHAT_API_URL}/api/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as
      | { detail?: string }
      | null;
    throw new Error(data?.detail || `Chat backend returned ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("Streaming is not supported by this browser.");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const rawEvent = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      boundary = buffer.indexOf("\n\n");

      const dataLine = rawEvent
        .split("\n")
        .find((line) => line.startsWith("data:"))
        ?.slice(5)
        .trim();
      if (!dataLine || dataLine === "[DONE]") continue;

      let event: { type?: string; content?: string };
      try {
        event = JSON.parse(dataLine);
      } catch {
        continue;
      }

      if (event.type === "thinking" && event.content) {
        handlers.onThinking?.(event.content);
      } else if (event.type === "answer" && event.content) {
        handlers.onAnswer?.(event.content);
      }
    }
  }
}

async function requestAIResponse(
  messages: Pick<ChatMessage, "role" | "content">[],
  provider: "vllm" | "wandb",
  context?: string,
  attachments?: Attachment[],
  handlers?: StreamHandlers
): Promise<ChatMessage> {
  const body = await buildChatBody(messages, provider, context, attachments);

  // Streaming path (menampilkan thinking + answer secara real-time).
  if (handlers) {
    let thinking = "";
    let content = "";
    await streamChat(body, {
      onThinking: (chunk) => {
        thinking += chunk;
        handlers.onThinking?.(chunk);
      },
      onAnswer: (chunk) => {
        content += chunk;
        handlers.onAnswer?.(chunk);
      },
    });

    if (!content.trim()) {
      throw new Error("The model returned an empty response.");
    }
    return {
      id: uid("ai"),
      role: "assistant",
      content: content.trim(),
      thinking: thinking.trim() || undefined,
    };
  }

  // Non-streaming fallback.
  const response = await fetch(`${CHAT_API_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = (await response.json().catch(() => null)) as
    | { message?: { content?: string; thinking?: string | null }; detail?: string }
    | null;

  if (!response.ok) {
    throw new Error(data?.detail || `Chat backend returned ${response.status}`);
  }

  const content = data?.message?.content?.trim();
  if (!content) throw new Error("The model returned an empty response.");

  return {
    id: uid("ai"),
    role: "assistant",
    content,
    thinking: data?.message?.thinking?.trim() || undefined,
  };
}

function hitsToSources(hits: RagHit[]): Source[] {
  return hits.map((hit) => ({
    id: uid(`src-${hit.key}`),
    title: hit.label,
    hakim: "",
    hakimAnggota: "",
    tanggalDitetapkan: "",
    tanggalDibacakan: "",
    tingkat: "",
    excerpt: hit.text.trim(),
    score: hit.score,
    reason: hit.reason,
  }));
}

async function requestRagResponse(
  question: string,
  attachments: Attachment[],
  conversation: Pick<ChatMessage, "role" | "content">[],
  provider: "local" | "deployed",
  handlers?: StreamHandlers
): Promise<{ message: ChatMessage; sources: Source[] }> {
  const docIds: string[] = [];
  const ingestedNames: string[] = [];
  const inlineTexts: string[] = [];

  for (const attachment of attachments) {
    if (attachment.status !== "done") {
      throw new Error(`File "${attachment.fileName}" belum siap untuk diproses.`);
    }
    if (attachment.libraryFileId) {
      docIds.push(attachment.libraryFileId);
      ingestedNames.push(attachment.fileName);
    } else if (attachment.file) {
      const doc = await ingestPdf(attachment.file);
      docIds.push(doc.id);
      ingestedNames.push(doc.name);
    } else if (attachment.extractedText?.trim()) {
      inlineTexts.push(attachment.extractedText.trim());
      ingestedNames.push(attachment.fileName);
    }
  }

  const hits = await queryRag(
    question,
    docIds,
    3,
    inlineTexts.length > 0 ? inlineTexts.join("\n\n") : undefined
  );
  const context = hitsToContext(hits);
  const sources = hitsToSources(hits);

  // This is only a last-resort path when retrieval returned no hit. Never
  // silently prefix-slice the uploaded source: the complete PDF is persisted
  // in the backend and should either be retrieved or fail visibly.
  const fallbackText = attachments
    .map((attachment) => attachment.extractedText?.trim() ?? "")
    .filter(Boolean)
    .join("\n\n");

  const message = await requestAIResponse(
    conversation,
    provider === "deployed" ? "wandb" : "vllm",
    context ||
      (fallbackText
        ? `[Teks dokumen]\n${fallbackText}`
        : ingestedNames.length
          ? `Dokumen: ${ingestedNames.join(", ")}`
          : undefined),
    undefined,
    handlers
  );

  return { message, sources };
}

/* ------------------------------------------------------------------ */
/* Sub-components                                                      */
/* ------------------------------------------------------------------ */

function ChatItemMenu({
  sessionId,
  isPinned,
  onPin,
  onDelete,
  onViewFiles,
  isOpen,
  onOpen,
  onClose,
}: {
  sessionId: string;
  isPinned?: boolean;
  onPin: (id: string) => void;
  onDelete: (id: string) => void;
  onViewFiles: (id: string) => void;
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        isOpen &&
        menuRef.current &&
        !menuRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, onClose]);

  return (
    <div ref={menuRef} className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (isOpen) onClose();
          else onOpen();
        }}
        className="rounded-md p-1 text-white/40 transition-colors hover:bg-white/15 hover:text-white"
        aria-label="Chat menu"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-8 z-50 w-52 overflow-hidden rounded-xl bg-white shadow-lg">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onViewFiles(sessionId);
              onClose();
            }}
            className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-gray-900 transition-colors hover:bg-gray-100"
          >
            <FileStack className="h-4 w-4 text-gray-600" />
            View files in chat
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onPin(sessionId);
              onClose();
            }}
            className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-gray-900 transition-colors hover:bg-gray-100"
          >
            <Pin className={`h-4 w-4 ${isPinned ? "text-pink-500" : "text-gray-600"}`} />
            {isPinned ? "Unpin chat" : "Pin chat"}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(sessionId);
              onClose();
            }}
            className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-red-500 transition-colors hover:bg-red-50"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

function Sidebar({
  sessions,
  activeSessionId,
  isCollapsed,
  onToggleCollapse,
  onNewChat,
  onSelectSession,
  onTogglePin,
  onDeleteChat,
  onViewFiles,
  openMenuId,
  setOpenMenuId,
  mobileOpen,
  onMobileClose,
}: {
  sessions: ChatSession[];
  activeSessionId: string | null;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onNewChat: () => void;
  onSelectSession: (id: string) => void;
  onTogglePin: (id: string) => void;
  onDeleteChat: (id: string) => void;
  onViewFiles: (id: string) => void;
  openMenuId: string | null;
  setOpenMenuId: (id: string | null) => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}) {
  const router = useRouter();
  const { user, logout, loading } = useAuth();
  const handleLogout = async () => {
    await logout();
    router.push("/");
  };
  const displayName = user?.displayName ?? user?.email ?? "User";
  const initials = (displayName.charAt(0) ?? "U").toUpperCase();
  return (
    <>
      {mobileOpen && (
        <button
          type="button"
          aria-label="Tutup sidebar"
          onClick={onMobileClose}
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex shrink-0 flex-col bg-[#1A1625] text-white transition-transform duration-300 lg:static lg:z-auto lg:transition-[width] ${
          isCollapsed ? "lg:w-[72px]" : "lg:w-[280px]"
        } ${
          mobileOpen
            ? "translate-x-0"
            : "-translate-x-full lg:translate-x-0"
        }`}
      >
      <div className="flex items-center justify-between px-4 pt-5 pb-4">
        {!isCollapsed && (
          <Image
            src="/logo.png"
            alt="LEGAL-VERSE logo"
            width={140}
            height={40}
            priority
            className="h-9 w-auto"
            style={{ width: "auto", height: "2.25rem" }}
          />
        )}
        <button
          onClick={onToggleCollapse}
          className="ml-auto rounded-lg p-1.5 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {isCollapsed ? (
            <PanelLeftOpen className="h-5 w-5" />
          ) : (
            <PanelLeftClose className="h-5 w-5" />
          )}
        </button>
      </div>

      <div className="flex flex-col gap-1 px-3">
        <button
          onClick={onNewChat}
          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition-colors hover:bg-white/10"
        >
          <Plus className="h-5 w-5 shrink-0 text-pink-400" />
          {!isCollapsed && <span>New Chat</span>}
        </button>
        <button
          onClick={() => router.push("/library")}
          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition-colors hover:bg-white/10"
        >
          <Library className="h-5 w-5 shrink-0 text-pink-400" />
          {!isCollapsed && <span>Library</span>}
        </button>
        <button
          onClick={() => router.push("/history")}
          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition-colors hover:bg-white/10"
        >
          <History className="h-5 w-5 shrink-0 text-pink-400" />
          {!isCollapsed && <span>History</span>}
        </button>
        <button
          onClick={() => router.push("/project")}
          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition-colors hover:bg-white/10"
        >
          <FolderKanban className="h-5 w-5 shrink-0 text-pink-400" />
          {!isCollapsed && <span>Project</span>}
        </button>
      </div>

      {!isCollapsed && (
        <>
          <div className="mt-4 flex items-center gap-2 px-5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-white/40">
              Recent
            </span>
            <span className="h-px flex-1 bg-white/10" />
          </div>
          <div className="mt-2 flex-1 space-y-1 overflow-y-auto px-3 pb-4">
            {sessions.map((session) => {
              const active = session.id === activeSessionId;
              return (
                <div
                  key={session.id}
                  onClick={() => onSelectSession(session.id)}
                  className={`group flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2.5 text-sm transition-colors ${
                    active
                      ? "bg-pink-100 text-pink-600"
                      : "text-white/80 hover:bg-white/10"
                  }`}
                >
                  <span className="flex min-w-0 flex-1 items-center gap-1.5">
                    {session.isPinned && (
                      <Pin className="h-3 w-3 shrink-0" />
                    )}
                    <span className="truncate">{session.title}</span>
                  </span>
                  <ChatItemMenu
                    sessionId={session.id}
                    isPinned={session.isPinned}
                    onPin={onTogglePin}
                    onDelete={onDeleteChat}
                    onViewFiles={onViewFiles}
                    isOpen={openMenuId === session.id}
                    onOpen={() => setOpenMenuId(session.id)}
                    onClose={() => setOpenMenuId(null)}
                  />
                </div>
              );
            })}
          </div>
        </>
      )}

      <div className="flex items-center gap-3 border-t border-white/10 px-4 py-4">
        {user?.photoURL ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.photoURL}
            alt="Profile"
            referrerPolicy="no-referrer"
            className="h-9 w-9 shrink-0 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-pink-400 text-sm font-bold text-[#1A1625]">
            {!isCollapsed ? initials : "A"}
          </div>
        )}
        {!isCollapsed && (
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{displayName}</div>
            <div className="mt-0.5 truncate text-[10px] text-white/50">
              {user?.email}
            </div>
            <button
              onClick={handleLogout}
              disabled={loading}
              className="mt-0.5 inline-block rounded-full bg-white/10 px-3 py-0.5 text-[10px] font-semibold text-white/70 transition-colors hover:bg-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Logging out..." : "Log out"}
            </button>
          </div>
        )}
      </div>
      </aside>
    </>
  );
}

const markdownComponents = {
  h1: (props: ComponentProps<"h1">) => (
    <h1 className="mb-3 mt-2 text-xl font-bold text-[#241B3A]" {...props} />
  ),
  h2: (props: ComponentProps<"h2">) => (
    <h2 className="mb-2 mt-4 text-lg font-bold text-[#241B3A]" {...props} />
  ),
  h3: (props: ComponentProps<"h3">) => (
    <h3 className="mb-2 mt-3 text-base font-bold text-[#241B3A]" {...props} />
  ),
  p: (props: ComponentProps<"p">) => (
    <p className="mb-2 leading-relaxed" {...props} />
  ),
  strong: (props: ComponentProps<"strong">) => (
    <strong className="font-bold text-[#241B3A]" {...props} />
  ),
  ul: (props: ComponentProps<"ul">) => (
    <ul className="mb-2 list-disc space-y-1.5 pl-5 leading-relaxed" {...props} />
  ),
  ol: (props: ComponentProps<"ol">) => (
    <ol className="mb-2 list-decimal space-y-1.5 pl-5 leading-relaxed" {...props} />
  ),
  li: (props: ComponentProps<"li">) => (
    <li className="leading-relaxed" {...props} />
  ),
  blockquote: (props: ComponentProps<"blockquote">) => (
    <blockquote
      className="mb-2 border-l-4 border-[#7C3AED] bg-[#7C3AED]/5 py-1 pl-4 pr-3 leading-relaxed text-zinc-700"
      {...props}
    />
  ),
  table: (props: ComponentProps<"table">) => (
    <table
      className="my-2 w-full border-collapse overflow-hidden rounded-lg border border-zinc-200 text-sm"
      {...props}
    />
  ),
  thead: (props: ComponentProps<"thead">) => (
    <thead className="bg-[#7C3AED]/10 text-left" {...props} />
  ),
  th: (props: ComponentProps<"th">) => (
    <th
      className="border-b border-zinc-200 px-3 py-2 font-bold text-[#241B3A]"
      {...props}
    />
  ),
  td: (props: ComponentProps<"td">) => (
    <td className="border-b border-zinc-100 px-3 py-2 align-top" {...props} />
  ),
  a: (props: AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a
      className="font-medium text-[#7C3AED] underline"
      target="_blank"
      rel="noopener noreferrer"
      {...props}
    />
  ),
  code: (props: ComponentProps<"code">) => (
    <code
      className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-[0.85em] text-[#241B3A]"
      {...props}
    />
  ),
};

function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="text-sm text-zinc-800">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {content}
      </ReactMarkdown>
    </div>
  );
}

function ThinkingAnswer({
  thinking,
  isStreaming,
  thinkingSeconds,
}: {
  thinking?: string;
  isStreaming: boolean;
  thinkingSeconds?: number;
}) {
  const hasThinking = !!thinking?.trim();
  const [expanded, setExpanded] = useState(false);

  if (!hasThinking) return null;

  const label = isStreaming
    ? "Berpikir..."
    : thinkingSeconds != null
      ? `Selesai berpikir (${thinkingSeconds.toLocaleString("id-ID")} detik)`
      : "Selesai berpikir";

  return (
    <div className="mb-4 overflow-hidden rounded-xl border border-purple-200/60 bg-[#F7F6FB]">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left"
        aria-expanded={expanded}
      >
        <span className="text-sm" aria-hidden>
          🧠
        </span>
        <span className="flex-1 text-xs font-semibold text-zinc-500">
          {label}
        </span>
        {isStreaming && (
          <span className="flex items-center gap-0.5" aria-hidden>
            <span className="h-1 w-1 animate-bounce rounded-full bg-zinc-400 [animation-delay:0ms]" />
            <span className="h-1 w-1 animate-bounce rounded-full bg-zinc-400 [animation-delay:150ms]" />
            <span className="h-1 w-1 animate-bounce rounded-full bg-zinc-400 [animation-delay:300ms]" />
          </span>
        )}
        <ChevronDown
          className={`h-4 w-4 text-zinc-400 transition-transform duration-200 ${
            expanded ? "" : "-rotate-90"
          }`}
        />
      </button>
      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-out ${
          expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
        aria-hidden={!expanded}
      >
        <div className="overflow-hidden">
          <div className="border-t border-purple-200/60 px-4 py-3">
            <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-zinc-500">
              {thinking}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({
  message,
  onPreviewAttachment,
}: {
  message: ChatMessage;
  onPreviewAttachment?: (attachment: Attachment) => void;
}) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl bg-[#F5A9F2] px-4 py-3 text-sm font-medium text-purple-900">
          {message.attachments && message.attachments.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {message.attachments.map((attachment) => {
                const canPreview =
                  attachment.extractedText !== undefined &&
                  onPreviewAttachment !== undefined;
                return (
                  <button
                    key={attachment.id}
                    type="button"
                    onClick={() => canPreview && onPreviewAttachment(attachment)}
                    disabled={!canPreview}
                    title={
                      canPreview
                        ? "Klik untuk lihat teks hasil ekstraksi"
                        : undefined
                    }
                    className={`flex items-center gap-2 rounded-lg bg-white/70 px-3 py-1.5 transition-colors ${
                      canPreview
                        ? "cursor-pointer hover:bg-white"
                        : "cursor-default"
                    }`}
                  >
                    <FileText className="h-4 w-4 shrink-0 text-red-500" />
                    <span className="max-w-40 truncate">
                      {attachment.fileName}
                    </span>
                    {attachment.status === "done" && (
                      <Check className="h-4 w-4 shrink-0 text-green-600" />
                    )}
                    {attachment.status === "error" && (
                      <CircleX className="h-4 w-4 shrink-0 text-red-600" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
          {message.content}
        </div>
      </div>
    );
  }

  if (message.isLoading && !message.content?.trim() && !message.thinking?.trim()) {
    return (
      <div className="flex justify-start">
        <div className="rounded-2xl border border-pink-300 bg-white px-5 py-4">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 animate-bounce rounded-full bg-pink-400 [animation-delay:0ms]" />
            <span className="h-2 w-2 animate-bounce rounded-full bg-pink-400 [animation-delay:150ms]" />
            <span className="h-2 w-2 animate-bounce rounded-full bg-pink-400 [animation-delay:300ms]" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {message.thinking?.trim() && (
        <div className="flex justify-start">
          <div className="w-full max-w-3xl">
            <ThinkingAnswer
              thinking={message.thinking}
              isStreaming={!!message.isLoading}
              thinkingSeconds={message.thinkingSeconds}
            />
          </div>
        </div>
      )}
      <div className="flex justify-start">
        <div className="w-full max-w-3xl rounded-2xl border border-pink-300 bg-white px-6 py-5">
          <div className="flex items-center gap-2 pb-3">
            <Sparkles className="h-4 w-4 text-pink-500" />
            <span className="text-xs font-bold text-purple-800">LEGAL-VERSE AI</span>
          </div>
          {message.content?.trim() ? (
            <MarkdownContent content={message.content} />
          ) : (
            !message.isLoading && (
              <p className="text-sm text-zinc-400">
                Tidak ada jawaban yang dihasilkan.
              </p>
            )
          )}
        </div>
      </div>
    </>
  );
}

const TEMPLATES = [
  "Ekstrak bagian amar putusan dari dokumen ini",
  "Ekstrak bagian penangkapan dari dokumen ini",
  "Ekstrak bagian identitas terdakwa dari dokumen ini",
  "Ekstrak bagian tuntutan jaksa dari dokumen ini",
];

function TemplateCard({ text, onPick }: { text: string; onPick: (t: string) => void }) {
  return (
    <button
      onClick={() => onPick(text)}
      className="group flex items-center justify-between gap-3 rounded-2xl bg-[#6B1B7A] px-5 py-5 text-left text-sm font-medium text-white transition-transform hover:scale-[1.02]"
    >
      <span>{text}</span>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/20 transition-colors group-hover:bg-white/30">
        <ArrowUp className="h-4 w-4" />
      </span>
    </button>
  );
}

function AttachmentChip({
  attachment,
  onRemove,
  onPreview,
}: {
  attachment: Attachment;
  onRemove: () => void;
  onPreview: (attachment: Attachment) => void;
}) {
  const canPreview =
    attachment.status === "done" && attachment.extractedText !== undefined;

  return (
    <div
      role="button"
      tabIndex={canPreview ? 0 : -1}
      onClick={() => canPreview && onPreview(attachment)}
      onKeyDown={(e) => {
        if (canPreview && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onPreview(attachment);
        }
      }}
      title={
        canPreview
          ? "Klik untuk lihat teks hasil ekstraksi"
          : attachment.status === "error"
            ? attachment.error ?? "Gagal mengekstrak teks"
            : undefined
      }
      className={`flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-3 py-2 transition-colors ${
        canPreview
          ? "cursor-pointer hover:border-pink-300 hover:bg-pink-50"
          : "cursor-default"
      }`}
    >
      <FileText className="h-5 w-5 shrink-0 text-red-500" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-zinc-800">
            {attachment.fileName}
          </span>
          <span className="shrink-0 text-xs text-zinc-400">
            {formatBytes(attachment.fileSize)}
          </span>
        </div>
        {attachment.status === "uploading" && (
          <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-zinc-200">
            <div className="h-full w-1/2 animate-pulse rounded-full bg-purple-500" />
          </div>
        )}
        {attachment.status === "error" && (
          <div className="text-xs font-medium text-red-500" title={attachment.error}>
            {attachment.error ?? "Gagal ekstrak teks"}
          </div>
        )}
        {canPreview && (
          <div className="text-xs font-medium text-purple-600">
            {attachment.tokenCount != null
              ? `${attachment.tokenCount.toLocaleString("id-ID")} token · klik untuk lihat`
              : "Menghitung token..."}
          </div>
        )}
      </div>
      {attachment.status === "done" ? (
        <Check className="h-4 w-4 shrink-0 text-green-500" />
      ) : attachment.status === "uploading" ? (
        <Upload className="h-4 w-4 shrink-0 animate-pulse text-purple-500" />
      ) : (
        <CircleX className="h-4 w-4 shrink-0 text-red-500" />
      )}
      {attachment.status !== "uploading" && (
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.stopPropagation();
              e.preventDefault();
              onRemove();
            }
          }}
          className="shrink-0 cursor-pointer rounded-md p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600"
          aria-label="Remove attachment"
        >
          <X className="h-4 w-4" />
        </span>
      )}
    </div>
  );
}

function ModelSwitch({
  value,
  onChange,
}: {
  value: "local" | "deployed";
  onChange: (m: "local" | "deployed") => void;
}) {
  const options: { key: "local" | "deployed"; label: string }[] = [
    { key: "local", label: "Local" },
    { key: "deployed", label: "Deployed" },
  ];
  const containerRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState({ width: 0, offset: 0 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const update = () => {
      const buttons = Array.from(
        container.querySelectorAll<HTMLButtonElement>("[data-switch-option]")
      );
      const active = buttons.find((b) => b.dataset.switchValue === value);
      const target = active ?? buttons[0];
      if (!target) return;
      const containerRect = container.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      setIndicator({
        width: targetRect.width,
        offset: targetRect.left - containerRect.left,
      });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [value]);

  return (
    <div
      ref={containerRef}
      className="relative w-fit shrink-0 rounded-full bg-zinc-200 p-1"
    >
      <span
        aria-hidden
        className="absolute top-1 bottom-1 rounded-full bg-zinc-900 shadow transition-[left,width] duration-200 ease-out"
        style={{ left: indicator.offset, width: indicator.width }}
      />
      {options.map((option) => {
        const active = option.key === value;
        return (
          <button
            key={option.key}
            data-switch-option
            data-switch-value={option.key}
            onClick={() => onChange(option.key)}
            className={`relative z-10 whitespace-nowrap rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${
              active ? "text-white" : "text-zinc-500 hover:text-zinc-700"
            }`}
            aria-pressed={active}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function ModelSelector({
  value,
  onChange,
}: {
  value: "sft" | "rag";
  onChange: (m: "sft" | "rag") => void;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (open && menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const options: { key: "sft" | "rag"; label: string; desc: string }[] = [
    {
      key: "sft",
      label: "SFT",
      desc: "Model fine-tuned, jawaban lebih cepat",
    },
    {
      key: "rag",
      label: "RAG",
      desc: "Model dengan pencarian dokumen real-time, lebih akurat untuk kasus spesifik",
    },
  ];

  const active = options.find((o) => o.key === value) ?? options[0];

  return (
    <div ref={menuRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-purple-800 transition-colors hover:bg-purple-50"
        aria-label="Select model mode"
      >
        <Cpu className="h-3.5 w-3.5" />
        {active.label}
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute bottom-full left-0 z-50 mb-1.5 w-72 overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-zinc-100">
          {options.map((option, i) => {
            const isActive = option.key === value;
            return (
              <button
                key={option.key}
                type="button"
                onClick={() => {
                  onChange(option.key);
                  setOpen(false);
                }}
                className={`flex w-full items-start gap-2 px-4 py-3 text-left transition-colors hover:bg-gray-50 ${
                  i > 0 ? "border-t border-zinc-100" : ""
                }`}
              >
                <span
                  className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                    isActive ? "bg-purple-700 text-white" : "bg-zinc-100 text-zinc-400"
                  }`}
                >
                  <Cpu className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-zinc-900">
                      {option.label}
                    </span>
                    {isActive && (
                      <span className="rounded-full bg-purple-700 px-2 py-0.5 text-[10px] font-bold text-white">
                        AKTIF
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-xs leading-snug text-zinc-500">
                    {option.desc}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ContextUsageBar({ session }: { session: ChatSession | null }) {
  if (!session) return null;
  const limit = session.contextLimit || 128_000;
  const used = estimateTokens(session);
  const pct = Math.min(100, (used / limit) * 100);
  const barColor =
    pct > 90 ? "bg-red-500" : pct >= 70 ? "bg-yellow-500" : "bg-green-500";

  return (
    <div className="group relative flex items-center justify-end gap-2">
      <div className="flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 shadow-sm ring-1 ring-zinc-100">
        <div className="h-1 w-24 overflow-hidden rounded-full bg-zinc-200">
          <div
            className={`h-full rounded-full transition-all ${barColor}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-[11px] font-medium text-zinc-500">
          {formatTokens(used)} / {formatTokens(limit)} tokens ({Math.round(pct)}%)
        </span>
      </div>
      <span className="pointer-events-none absolute right-0 top-full z-10 mt-1 hidden whitespace-nowrap rounded-lg bg-zinc-900 px-2.5 py-1.5 text-[11px] text-white shadow-lg group-hover:block">
        Semakin dekat limit, riwayat chat lama mungkin akan dipotong otomatis.
      </span>
    </div>
  );
}

function ChatInput({
  value,
  onChange,
  onSubmit,
  disabled,
  attachments,
  onAddFiles,
  onRemoveAttachment,
  onPreviewAttachment,
  model,
  onModelChange,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  disabled: boolean;
  attachments: Attachment[];
  onAddFiles: (files: FileList | null) => void;
  onRemoveAttachment: (id: string) => void;
  onPreviewAttachment: (attachment: Attachment) => void;
  model: "sft" | "rag";
  onModelChange: (m: "sft" | "rag") => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canSubmit = value.trim().length > 0 || attachments.length > 0;

  return (
    <div className="rounded-3xl border border-zinc-200 bg-white p-3 shadow-lg">
      {attachments.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {attachments.map((attachment) => (
            <AttachmentChip
              key={attachment.id}
              attachment={attachment}
              onRemove={() => onRemoveAttachment(attachment.id)}
              onPreview={onPreviewAttachment}
            />
          ))}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!disabled && canSubmit) onSubmit();
        }}
        className="flex items-center gap-3 px-2"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          multiple
          hidden
          onChange={(e) => {
            onAddFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="group relative rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
          aria-label="Lampirkan dokumen"
        >
          <Paperclip className="h-5 w-5" />
          <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-zinc-900 px-2 py-1 text-[11px] text-white shadow group-hover:block">
            Lampirkan dokumen
          </span>
        </button>
        <ModelSelector value={model} onChange={onModelChange} />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Tanyakan tentang putusan, pasal, atau kasus..."
          className="w-full bg-transparent text-sm text-zinc-800 outline-none placeholder:text-zinc-400"
        />
        <button
          type="submit"
          disabled={disabled || !canSubmit}
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
            value.trim().length > 0 ? "bg-[#7C3AED]" : "bg-zinc-400"
          }`}
          aria-label="Send message"
        >
          <ArrowUp className="h-5 w-5" />
        </button>
      </form>
    </div>
  );
}

function SourceCard({ source }: { source: Source }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4">
      <h4 className="text-sm font-bold leading-snug text-zinc-900">
        {source.title}
      </h4>
      {source.excerpt ? (
        <p className="mt-3 line-clamp-5 text-xs leading-relaxed text-zinc-600">
          {source.excerpt}
        </p>
      ) : (
        <div className="mt-3 space-y-1.5 text-xs text-zinc-600">
          <p>
            <span className="font-bold text-pink-500">Hakim:</span> {source.hakim}
          </p>
          <p>
            <span className="font-bold text-pink-500">Hakim Anggota:</span>{" "}
            {source.hakimAnggota}
          </p>
          <p className="text-zinc-500">
            Ditetapkan {source.tanggalDitetapkan}, Dibacakan{" "}
            {source.tanggalDibacakan}
          </p>
        </div>
      )}
      {source.tingkat ? (
        <span className="mt-3 inline-block rounded-full bg-pink-100 px-3 py-1 text-[10px] font-semibold text-pink-600">
          Tingkat: {source.tingkat}
        </span>
      ) : null}
      {source.score !== undefined && (
        <span className="mt-3 inline-block rounded-full bg-emerald-100 px-3 py-1 text-[10px] font-semibold text-emerald-700">
          Skor relevansi: {source.score.toFixed(2)}
          {source.reason ? ` · ${source.reason}` : ""}
        </span>
      )}
      <button className="mt-4 w-full rounded-xl bg-[#6B1B7A] py-2.5 text-sm font-semibold text-white transition-transform hover:scale-[1.02]">
        Ringkasan
      </button>
    </div>
  );
}

function SourcesSidebar({
  sources,
  isOpen,
  onToggle,
}: {
  sources: Source[];
  isOpen: boolean;
  onToggle: () => void;
}) {
  if (!isOpen) {
    return (
      <button
        onClick={onToggle}
        className="fixed bottom-6 right-0 z-20 flex h-12 w-8 shrink-0 items-center justify-center rounded-l-xl bg-[#1A1625] text-white/70 shadow-lg transition-colors hover:bg-[#241d33] hover:text-white lg:static lg:h-full lg:w-8 lg:rounded-none lg:shadow-none"
        aria-label="Open sources sidebar"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
    );
  }

  return (
    <div className="fixed inset-y-0 right-0 z-40 w-[85vw] max-w-[350px] shrink-0 bg-[#F5F5F7] shadow-xl lg:static lg:z-auto lg:w-[350px] lg:shadow-none">
      <aside className="flex h-full flex-col border-l border-zinc-200 bg-white transition-transform duration-300">
        <div className="flex items-center justify-between px-5 py-4">
          <h3 className="text-sm font-bold text-zinc-900">Sumber Jawaban</h3>
          <button
            onClick={onToggle}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
            aria-label="Hide sources sidebar"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto px-4 pb-6">
          {sources.map((source) => (
            <SourceCard key={source.id} source={source} />
          ))}
        </div>
      </aside>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main page                                                           */
/* ------------------------------------------------------------------ */

export default function ChatPage() {
  const [isSourcesSidebarOpen, setIsSourcesSidebarOpen] = useState(true);
  const [input, setInput] = useState("");
  const [draftModel, setDraftModel] = useState<"sft" | "rag">("sft");
  const [draftProvider, setDraftProvider] = useState<"local" | "deployed">(
    "local"
  );
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [filesModalSession, setFilesModalSession] = useState<ChatSession | null>(null);
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  const chatSessions = useChatStore((s) => s.chatSessions);
  const activeSessionId = useChatStore((s) => s.activeSessionId);
  const isLoading = useChatStore((s) => s.isLoading);
  const activeSession = useChatStore((s) => s.activeSession());
  const activeMessages = useChatStore((s) => s.activeMessages());
  const setIsLoading = useChatStore((s) => s.setIsLoading);
  const newSession = useChatStore((s) => s.newSession);
  const selectSession = useChatStore((s) => s.selectSession);
  const togglePin = useChatStore((s) => s.togglePin);
  const deleteChat = useChatStore((s) => s.deleteChat);
  const getSession = useChatStore((s) => s.getSession);
  const setSessionModel = useChatStore((s) => s.setSessionModel);
  const setSessionProvider = useChatStore((s) => s.setSessionProvider);
  const appendUserMessage = useChatStore((s) => s.appendUserMessage);
  const upsertSessionMessage = useChatStore((s) => s.upsertSessionMessage);
  const setProviderContextLimits = useChatStore(
    (s) => s.setProviderContextLimits
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${CHAT_API_URL}/api/models`);
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled || !Array.isArray(data.providers)) return;
        const limits: Partial<Record<"local" | "deployed", number>> = {};
        for (const p of data.providers) {
          const key = p.id === "vllm" ? "local" : p.id === "wandb" ? "deployed" : null;
          if (key && typeof p.context_window === "number") {
            limits[key] = p.context_window;
          }
        }
        if (Object.keys(limits).length > 0) setProviderContextLimits(limits);
      } catch {
        // backend tak terjangkau; pertahankan limit default
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setProviderContextLimits]);

  const latestSources = useCallback(() => {
    if (!activeSession) return undefined;
    const lastAi = [...activeSession.messages]
      .reverse()
      .find((m) => m.role === "assistant" && !m.isLoading);
    return lastAi?.sources;
  }, [activeSession]);

  const sources = latestSources() ?? [];

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [activeMessages.length, isLoading]);

  const handleSend = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isLoading) return;

      const userMessage: ChatMessage = {
        id: uid("user"),
        role: "user",
        content: trimmed,
        ...(attachments.length > 0 ? { attachments } : {}),
      };

      const sessionId = appendUserMessage(activeSessionId, userMessage);

      if (!activeSessionId && sessionId) {
        setSessionModel(sessionId, draftModel);
        setSessionProvider(sessionId, draftProvider);
      }

      setInput("");
      setAttachments([]);
      setIsLoading(true);

      const assistantId = uid("ai");
      const loadingMsg: ChatMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
        thinking: "",
        isLoading: true,
      };

      if (sessionId) {
        upsertSessionMessage(sessionId, loadingMsg);
      }

      const sendModel = activeSession?.model ?? draftModel;
      const sendProvider = activeSession?.provider ?? draftProvider;

      const historyLimit =
        activeSession?.contextLimit ??
        (sendProvider === "deployed" ? 262_000 : 128_000);
      const trimmedHistory = trimConversationToLimit(
        activeSession?.messages ?? [],
        historyLimit
      );
      const conversation = [...trimmedHistory, userMessage].map(
        ({ role, content }) => ({ role, content })
      );
      const conversationAttachments = collectConversationAttachments(
        activeSession?.messages ?? [],
        attachments
      );

      // State akumulasi streaming + waktu berpikir.
      let streamThinking = "";
      let streamAnswer = "";
      let thinkingStartedAt: number | null = null;
      let thinkingSeconds: number | undefined;

      const upsertLive = (done: boolean) => {
        upsertSessionMessage(
          sessionId,
          {
            id: assistantId,
            role: "assistant",
            content: streamAnswer,
            thinking: streamThinking || undefined,
            thinkingSeconds,
            isLoading: !done,
          },
          { removeLoading: done }
        );
      };

      try {
        const streamHandlers: StreamHandlers = {
          onThinking: (chunk) => {
            if (thinkingStartedAt === null) thinkingStartedAt = Date.now();
            streamThinking += chunk;
            upsertLive(false);
          },
          onAnswer: (chunk) => {
            if (thinkingStartedAt !== null) {
              thinkingSeconds =
                Math.round((Date.now() - thinkingStartedAt) / 100) / 10;
            }
            streamAnswer += chunk;
            upsertLive(false);
          },
        };

        if (sendModel === "rag" && conversationAttachments.length > 0) {
          const { message: aiResponse, sources } = await requestRagResponse(
            trimmed,
            conversationAttachments,
            conversation,
            sendProvider,
            streamHandlers
          );
          upsertSessionMessage(
            sessionId,
            {
              ...aiResponse,
              content: streamAnswer || aiResponse.content,
              thinking: streamThinking || aiResponse.thinking,
              thinkingSeconds,
              sources,
            },
            { removeLoading: true }
          );
        } else {
          const provider = sendProvider === "deployed" ? "wandb" : "vllm";
          const aiResponse = await requestAIResponse(
            conversation,
            provider,
            undefined,
            conversationAttachments,
            streamHandlers
          );
          upsertSessionMessage(
            sessionId,
            {
              ...aiResponse,
              content: streamAnswer || aiResponse.content,
              thinking: streamThinking || aiResponse.thinking,
              thinkingSeconds,
            },
            { removeLoading: true }
          );
        }
      } catch (error) {
        const detail = error instanceof Error ? error.message : "Unknown error";
        const errorResponse: ChatMessage = {
          id: uid("ai-error"),
          role: "assistant",
          content: `Tidak dapat menghubungi model: ${detail}`,
        };
        upsertSessionMessage(sessionId, errorResponse, { removeLoading: true });
      } finally {
        setIsLoading(false);
      }
    },
    [
      activeSession,
      activeSessionId,
      isLoading,
      attachments,
      appendUserMessage,
      upsertSessionMessage,
      setIsLoading,
      draftModel,
      draftProvider,
      setSessionModel,
      setSessionProvider,
    ]
  );

  const handlePickTemplate = (text: string) => {
    setInput(text);
    handleSend(text);
  };

  const showToast = (msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const handleAddFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;

const incoming = Array.from(fileList);
    const pending: Attachment[] = [];

    for (const file of incoming) {
      if (
        file.type !== "application/pdf" &&
        !file.name.toLowerCase().endsWith(".pdf")
      ) {
        showToast(`"${file.name}" bukan file PDF.`);
        continue;
      }
      if (attachments.length + pending.length >= MAX_ATTACHMENTS) {
        showToast(`Maksimal ${MAX_ATTACHMENTS} file per pesan.`);
        break;
      }
      if (file.size > MAX_ATTACHMENT_SIZE) {
        showToast(`"${file.name}" melebihi batas 10MB.`);
        continue;
      }
      pending.push({
        id: uid("att"),
        fileName: file.name,
        fileSize: file.size,
        status: "uploading",
        file,
      });
    }

if (pending.length === 0) return;
    setAttachments((prev) => [...prev, ...pending]);

    // Ekstraksi teks asli lewat backend Python, bukan simulasi.
    for (const attachment of pending) {
      extractPdfText(attachment.file!)
        .then(({ text, token_count }) => {
          setAttachments((prev) =>
            prev.map((att) =>
              att.id === attachment.id
                ? {
                    ...att,
                    status: "done" as const,
                    extractedText: text,
                    tokenCount: token_count,
                  }
                : att
            )
          );
          // Simpan PDF (Cloud Storage) + teks/metadata (Firestore) ke library.
          saveToLibrary(
            attachment.file!,
            text,
            token_count,
            activeSessionId ?? undefined
          ).then(
            (record) => {
              setAttachments((prev) =>
                prev.map((att) =>
                  att.id === attachment.id
                    ? { ...att, libraryFileId: record.id }
                    : att
                )
              );
              console.log("[library] tersimpan:", attachment.fileName);
            },
            (err) => {
              console.warn("[library] gagal menyimpan:", attachment.fileName, err);
            }
          );
        })
        .catch((error: unknown) => {
          const message =
            error instanceof Error && error.message
              ? error.message
              : "Gagal mengekstrak teks dari PDF.";
          setAttachments((prev) =>
            prev.map((att) =>
              att.id === attachment.id
                ? { ...att, status: "error" as const, error: message }
                : att
            )
          );
        });
    }
  };

  const handleRemoveAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((att) => att.id !== id));
  };

  const handleNewChat = () => {
    newSession();
    setDraftModel("sft");
    setDraftProvider("local");
    setInput("");
  };

  const handleSelectSession = (id: string) => {
    selectSession(id);
  };

  const handleTogglePin = (id: string) => {
    togglePin(id);
  };

  const handleModelChange = (model: "sft" | "rag") => {
    setDraftModel(model);
    if (activeSessionId && activeSession) {
      if (activeSession.model === model) return;
      setSessionModel(activeSessionId, model);
      const systemMsg: ChatMessage = {
        id: uid("system"),
        role: "assistant",
        content: `Mode diganti ke ${model.toUpperCase()}`,
      };
      upsertSessionMessage(activeSessionId, systemMsg);
    }
  };

  const handleProviderChange = (provider: "local" | "deployed") => {
    setDraftProvider(provider);
    if (activeSessionId && activeSession) {
      if (activeSession.provider === provider) return;
      setSessionProvider(activeSessionId, provider);
      const label =
        provider === "deployed" ? "Deployed (MiniMax M3)" : "Local (vLLM)";
      const systemMsg: ChatMessage = {
        id: uid("system"),
        role: "assistant",
        content: `Model diganti ke ${label}`,
      };
      upsertSessionMessage(activeSessionId, systemMsg);
    }
  };

  const handleDeleteChat = (id: string) => {
    if (!window.confirm("Hapus chat ini?")) return;
    deleteChat(id);
    if (activeSessionId === id) setInput("");
  };

  const handleViewFiles = (id: string) => {
    setFilesModalSession(getSession(id));
  };

  return (
    <AuthGuard>
    <div className="flex h-screen w-full overflow-hidden bg-[#F5F5F7]">
      <Sidebar
        sessions={[...chatSessions].sort((a, b) => {
          if (a.isPinned && !b.isPinned) return -1;
          if (!a.isPinned && b.isPinned) return 1;
          return 0;
        })}
        activeSessionId={activeSessionId}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed((v) => !v)}
        onNewChat={handleNewChat}
        onSelectSession={handleSelectSession}
        onTogglePin={handleTogglePin}
        onDeleteChat={handleDeleteChat}
        onViewFiles={handleViewFiles}
        openMenuId={openMenuId}
        setOpenMenuId={setOpenMenuId}
        mobileOpen={isMobileSidebarOpen}
        onMobileClose={() => setIsMobileSidebarOpen(false)}
      />

      {/* Center chat area */}
      <main className="relative flex min-w-0 flex-1 flex-col">
        <button
          type="button"
          onClick={() => setIsMobileSidebarOpen(true)}
          className="absolute left-3 top-2.5 z-20 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-zinc-600 shadow ring-1 ring-zinc-200 transition-colors hover:bg-zinc-100 lg:hidden"
          aria-label="Buka menu"
        >
          <PanelLeftOpen className="h-5 w-5" />
        </button>
        {activeSession && (
          <div className="flex items-center justify-between border-b border-zinc-200 bg-white/60 px-4 py-2.5 pl-11 sm:px-8 lg:pl-8">
            <span className="truncate text-sm font-semibold text-zinc-800">
              {activeSession.title}
            </span>
            <span
              className={`ml-3 inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                activeSession.model === "rag"
                  ? "bg-purple-100 text-purple-700"
                  : "bg-zinc-100 text-zinc-600"
              }`}
            >
              <Cpu className="h-3 w-3" />
              {(activeSession.model ?? "sft").toUpperCase()}
            </span>
          </div>
        )}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6 sm:px-8">
          {activeMessages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-8">
              <div className="text-center">
<div className="mb-3 flex justify-center">
                <Image
                  src="/logo_dark.png"
                  alt="LEGAL-VERSE logo"
                  width={160}
                  height={48}
                  priority
                  className="h-12 w-auto"
                  style={{ width: "auto", height: "3rem" }}
                />
              </div>
                <p className="text-sm text-zinc-500">
                  Analisis putusan pengadilan dengan bantuan AI
                </p>
              </div>
              <div className="w-full max-w-2xl">
                <div className="mb-4 text-center text-sm font-semibold text-zinc-700">
                  Pilih Template Pertanyaan
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {TEMPLATES.map((t) => (
                    <TemplateCard key={t} text={t} onPick={handlePickTemplate} />
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="mx-auto flex max-w-3xl flex-col gap-4">
              {activeMessages.map((message) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  onPreviewAttachment={setPreviewAttachment}
                />
              ))}
            </div>
          )}
        </div>

        <div className="sticky bottom-0 mx-auto w-full max-w-3xl px-4 pb-5 sm:px-6">
          <div className="mb-2 flex items-center justify-between gap-3 px-1">
            <ModelSwitch
              value={activeSession?.provider ?? draftProvider}
              onChange={handleProviderChange}
            />
            <ContextUsageBar session={activeSession} />
          </div>
          <ChatInput
            value={input}
            onChange={setInput}
            onSubmit={() => handleSend(input)}
            disabled={isLoading}
            attachments={attachments}
            onAddFiles={handleAddFiles}
            onRemoveAttachment={handleRemoveAttachment}
            onPreviewAttachment={setPreviewAttachment}
            model={activeSession?.model ?? draftModel}
            onModelChange={handleModelChange}
          />
          <div className="mt-2 flex items-center justify-center gap-1.5 text-[11px] text-zinc-500">
            <Sparkles className="h-3 w-3 text-purple-500" />
            <span>
              Mode{" "}
              <span className="font-semibold text-zinc-600">
                {(activeSession?.provider ?? draftProvider) === "local"
                  ? "Local"
                  : "Deployed"}
              </span>{" "}
              aktif · Model{" "}
              <span className="font-semibold text-zinc-600">
                {(activeSession?.model ?? draftModel).toUpperCase()}
              </span>
            </span>
          </div>
        </div>
      </main>

      <SourcesSidebar
        sources={sources}
        isOpen={isSourcesSidebarOpen}
        onToggle={() => setIsSourcesSidebarOpen((v) => !v)}
      />

      {filesModalSession && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setFilesModalSession(null)}
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
              <h3 className="text-sm font-bold text-zinc-900">
                Files in chat
              </h3>
              <button
                onClick={() => setFilesModalSession(null)}
                className="rounded-lg p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
                aria-label="Close files"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-72 overflow-y-auto px-5 py-4">
              {filesModalSession.files && filesModalSession.files.length > 0 ? (
                <ul className="space-y-2">
                  {filesModalSession.files.map((file) => (
                    <li
                      key={file.url}
                      className="flex items-center gap-3 rounded-lg border border-zinc-200 px-3 py-2.5"
                    >
                      <FileStack className="h-4 w-4 text-purple-600" />
                      <span className="truncate text-sm text-zinc-800">
                        {file.name}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-6 text-center text-sm text-zinc-400">
                  Belum ada file
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {previewAttachment && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setPreviewAttachment(null)}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
              <div className="min-w-0">
                <h3 className="truncate text-sm font-bold text-zinc-900">
                  {previewAttachment.fileName}
                </h3>
                <p className="text-xs text-zinc-400">
                  Teks hasil ekstraksi ·{" "}
                  {previewAttachment.tokenCount != null
                    ? `${previewAttachment.tokenCount.toLocaleString("id-ID")} token`
                    : "Menghitung token..."}
                </p>
              </div>
              <button
                onClick={() => setPreviewAttachment(null)}
                className="shrink-0 rounded-lg p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
                aria-label="Close preview"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {previewAttachment.extractedText ? (
                <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-zinc-700">
                  {previewAttachment.extractedText}
                </pre>
              ) : (
                <p className="py-6 text-center text-sm text-zinc-400">
                  Tidak ada teks yang berhasil diekstrak dari PDF ini.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white shadow-lg">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {toast}
        </div>
      )}
    </div>
    </AuthGuard>
  );
}
