"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
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
<<<<<<< HEAD
  FileText,
  Check,
  CircleX,
  Upload,
  AlertCircle,
  ChevronDown,
  Cpu,
} from "lucide-react";
import type {
  Attachment,
  ChatMessage,
  ChatSession,
  Source,
} from "@/lib/types";
import { useChatStore } from "@/lib/store/chat-store";
=======
  Cpu,
  Cloud,
  ImagePlus,
  FileText,
} from "lucide-react";
import type { ChatImage, ChatMessage, ChatSession, ModelProvider, Source } from "@/lib/types";

type Provider = string;

type ApiContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "pdf"; name: string; data: string };

type ApiMessage = {
  role: "user" | "assistant" | "system";
  content: string | ApiContentPart[];
};

const FALLBACK_PROVIDERS: ModelProvider[] = [
  {
    id: "vllm",
    name: "vLLM (Local)",
    model: "mlx-community/DeepSeek-R1-Distill-Qwen-1.5B-4bit",
    kind: "vllm",
    supportsImages: false,
    configured: true,
  },
  {
    id: "wandb",
    name: "WandB (MiniMax M3)",
    model: "MiniMaxAI/MiniMax-M3",
    kind: "wandb",
    supportsImages: true,
    configured: true,
  },
];
>>>>>>> f01baba (aingmaung)

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
  const chars = session.messages.reduce(
    (sum, m) => sum + (m.content?.length ?? 0),
    0
  );
  return Math.round(chars / 4);
}

function formatTokens(n: number): string {
  if (n >= 1000) {
    return `${(n / 1000).toFixed(1).replace(".", ",")}K`;
  }
  return `${n}`;
}

const CHAT_API_URL =
  process.env.NEXT_PUBLIC_CHAT_API_URL ?? "http://127.0.0.1:8001";

function buildMessageContent(text: string, images: ChatImage[]): string | ApiContentPart[] {
  const parts: ApiContentPart[] = [];
  if (text.trim()) parts.push({ type: "text", text });
  for (const image of images) {
    if (image.kind === "pdf") {
      parts.push({ type: "pdf", name: image.name, data: image.dataUrl });
    } else {
      parts.push({ type: "image_url", image_url: { url: image.dataUrl } });
    }
  }
  if (parts.length === 0) return "";
  if (parts.length === 1 && parts[0].type === "text") return parts[0].text;
  return parts;
}

async function requestAIResponse(
  messages: ApiMessage[],
  provider: Provider
): Promise<{ message: ChatMessage; model: string }> {
  const response = await fetch(`${CHAT_API_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider, messages }),
  });

  const payload = (await response.json().catch(() => null)) as
    | { message?: { content?: string }; detail?: string; model?: string }
    | null;

  if (!response.ok) {
    throw new Error(payload?.detail || `Chat backend returned ${response.status}`);
  }

  const content = payload?.message?.content?.trim();
  if (!content) throw new Error("The model returned an empty response.");

  return {
    message: { id: uid("ai"), role: "assistant", content, model: payload?.model },
    model: payload?.model ?? provider,
  };
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
}) {
  const router = useRouter();
  return (
    <aside
      className={`flex h-full shrink-0 flex-col bg-[#1A1625] text-white transition-[width] duration-300 ${
        isCollapsed ? "w-[72px]" : "w-[280px]"
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
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-pink-400 text-sm font-bold text-[#1A1625]">
          {!isCollapsed ? "AD" : "A"}
        </div>
        {!isCollapsed && (
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">Ahmad Developer</div>
            <button
              onClick={() => router.push("/")}
              className="mt-0.5 inline-block rounded-full bg-white/10 px-3 py-0.5 text-[10px] font-semibold text-white/70 transition-colors hover:bg-white/20 hover:text-white"
            >
              Log out
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl bg-[#F5A9F2] px-4 py-3 text-sm font-medium text-purple-900">
<<<<<<< HEAD
          {message.attachments && message.attachments.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {message.attachments.map((attachment) => (
                <span
                  key={attachment.id}
                  className="flex items-center gap-2 rounded-lg bg-white/70 px-3 py-1.5"
                >
                  <FileText className="h-4 w-4 shrink-0 text-red-500" />
                  <span className="max-w-40 truncate">{attachment.fileName}</span>
                  {attachment.status === "done" && (
                    <Check className="h-4 w-4 shrink-0 text-green-600" />
                  )}
                  {attachment.status === "error" && (
                    <CircleX className="h-4 w-4 shrink-0 text-red-600" />
                  )}
                </span>
              ))}
=======
          {message.images && message.images.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {message.images.map((image) =>
                image.kind === "pdf" ? (
                  <div
                    key={image.id}
                    className="flex items-center gap-1.5 rounded-lg bg-white/60 px-3 py-2 text-xs font-semibold text-purple-800"
                  >
                    <FileText className="h-4 w-4" />
                    <span className="max-w-[160px] truncate">{image.name}</span>
                  </div>
                ) : (
                  <Image
                    key={image.id}
                    src={image.dataUrl}
                    alt={image.name}
                    width={96}
                    height={96}
                    unoptimized
                    className="h-24 w-24 rounded-lg object-cover"
                  />
                )
              )}
>>>>>>> f01baba (aingmaung)
            </div>
          )}
          {message.content}
        </div>
      </div>
    );
  }

  if (message.isLoading) {
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
    <div className="flex justify-start">
      <div className="w-full max-w-3xl rounded-2xl border border-pink-300 bg-white px-6 py-5">
        <div className="flex items-center gap-2 pb-3">
          <Sparkles className="h-4 w-4 text-pink-500" />
          <span className="text-xs font-bold text-purple-800">LEGAL-VERSE AI</span>
          {message.model && (
            <span className="ml-auto rounded-full bg-purple-100 px-2.5 py-0.5 text-[10px] font-semibold text-purple-700">
              {message.model}
            </span>
          )}
        </div>
        <div className="space-y-3 text-sm leading-relaxed text-zinc-800">
          {message.content.split("\n").map((line, i) => {
            if (!line.trim()) return null;
            const isList = /^\d+\./.test(line);
            if (isList) {
              const [num, ...rest] = line.split(" ");
              return (
                <div key={i} className="flex gap-3">
                  <span className="font-bold text-pink-500">{num}</span>
                  <span>{rest.join(" ")}</span>
                </div>
              );
            }
            return <p key={i}>{line}</p>;
          })}
        </div>
      </div>
    </div>
  );
}

const TEMPLATES = [
  "Jelaskan isi Putusan Nomor 1/Pid.Sus/2026/PN.KPN secara singkat",
  "Apa saja unsur tindak pidana perdagangan orang (TPPO)?",
  "Bagaimana alur sidang perkara tindak pidana korupsi (Tipikor)?",
  "Rangkum pertimbangan hakim dalam putusan pidana terbaru",
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

<<<<<<< HEAD
function AttachmentChip({
  attachment,
  onRemove,
}: {
  attachment: Attachment;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-3 py-2">
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
          <div className="text-xs font-medium text-red-500">
            Upload gagal
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
        <button
          onClick={onRemove}
          className="shrink-0 rounded-md p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600"
          aria-label="Remove attachment"
        >
          <X className="h-4 w-4" />
        </button>
      )}
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
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-purple-800 transition-colors hover:bg-purple-50"
        aria-label="Select model"
      >
        <Cpu className="h-3.5 w-3.5" />
        {active.label}
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute bottom-full left-0 z-50 mb-1.5 w-72 overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-zinc-100">
          {options.map((option) => {
            const isActive = option.key === value;
            return (
              <button
                key={option.key}
                onClick={() => {
                  onChange(option.key);
                  setOpen(false);
                }}
                className={`flex w-full items-start gap-2 px-4 py-3 text-left transition-colors hover:bg-gray-50 ${
                  isActive ? "bg-pink-50" : ""
                }`}
              >
                <Cpu className="mt-0.5 h-4 w-4 shrink-0 text-purple-700" />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-zinc-900">
                    {option.label}
                    {isActive && (
                      <span className="ml-2 rounded-full bg-pink-200 px-2 py-0.5 text-[10px] font-bold text-purple-800">
                        Aktif
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
  const limit = session.contextLimit || 200_000;
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
=======
function ProviderSwitch({
  providers,
  provider,
  onChange,
  disabled,
}: {
  providers: ModelProvider[];
  provider: Provider;
  onChange: (p: Provider) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex items-center gap-1 rounded-full border border-zinc-200 bg-white p-1 shadow-sm">
        {providers.map((option) => {
          const active = provider === option.id;
          const Icon = option.kind === "vllm" ? Cpu : Cloud;
          return (
            <button
              key={option.id}
              type="button"
              disabled={disabled}
              onClick={() => onChange(option.id)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                active
                  ? "bg-[#6B1B7A] text-white"
                  : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {option.name}
            </button>
          );
        })}
      </div>
      <span className="text-[10px] text-zinc-400">
        {providers.find((o) => o.id === provider)?.model ?? "Pilih model"}
>>>>>>> f01baba (aingmaung)
      </span>
    </div>
  );
}

function ChatInput({
  value,
  onChange,
  onSubmit,
  disabled,
<<<<<<< HEAD
  attachments,
  onAddFiles,
  onRemoveAttachment,
  model,
  onModelChange,
=======
  images,
  onAddImages,
  onRemoveImage,
>>>>>>> f01baba (aingmaung)
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  disabled: boolean;
<<<<<<< HEAD
  attachments: Attachment[];
  onAddFiles: (files: FileList | null) => void;
  onRemoveAttachment: (id: string) => void;
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
          className="rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
          aria-label="Attach PDF files"
        >
          <Plus className="h-5 w-5" />
        </button>
        <ModelSelector value={model} onChange={onModelChange} />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Ask anything"
=======
  images: ChatImage[];
  onAddImages: (files: File[]) => void;
  onRemoveImage: (id: string) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    onAddImages(Array.from(fileList));
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="rounded-3xl border border-zinc-200 bg-white shadow-lg">
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2 px-5 pt-4">
          {images.map((image) => (
            <div key={image.id} className="relative">
              {image.kind === "pdf" ? (
                <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-pink-50">
                  <FileText className="h-6 w-6 text-pink-500" />
                </div>
              ) : (
                <Image
                  src={image.dataUrl}
                  alt={image.name}
                  width={64}
                  height={64}
                  unoptimized
                  className="h-16 w-16 rounded-lg object-cover"
                />
              )}
              <button
                type="button"
                onClick={() => onRemoveImage(image.id)}
                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-zinc-800 text-white shadow"
                aria-label="Remove file"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!disabled && (value.trim() || images.length > 0)) onSubmit();
        }}
        className="flex items-center gap-2 px-3 py-2.5"
      >
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Attach image or PDF"
        >
          <ImagePlus className="h-5 w-5" />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf,.pdf"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Ask anything (attach image atau PDF untuk analisis)"
>>>>>>> f01baba (aingmaung)
          className="w-full bg-transparent text-sm text-zinc-800 outline-none placeholder:text-zinc-400"
        />
        <button
          type="submit"
<<<<<<< HEAD
          disabled={disabled || !canSubmit}
=======
          disabled={disabled || (!value.trim() && images.length === 0)}
>>>>>>> f01baba (aingmaung)
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black text-white transition-colors disabled:cursor-not-allowed disabled:opacity-40"
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
      <span className="mt-3 inline-block rounded-full bg-pink-100 px-3 py-1 text-[10px] font-semibold text-pink-600">
        Tingkat: {source.tingkat}
      </span>
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
        className="flex h-full w-8 shrink-0 items-center justify-center bg-[#1A1625] text-white/70 transition-colors hover:bg-[#241d33] hover:text-white"
        aria-label="Open sources sidebar"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
    );
  }

  return (
    <div className="relative h-full w-[350px] shrink-0 bg-[#F5F5F7]">
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
<<<<<<< HEAD
  const [draftModel, setDraftModel] = useState<"sft" | "rag">("sft");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [toast, setToast] = useState<string | null>(null);
=======
  const [pendingImages, setPendingImages] = useState<ChatImage[]>([]);
  const [providers, setProviders] = useState<ModelProvider[]>(FALLBACK_PROVIDERS);
  const [provider, setProvider] = useState<Provider>(() => {
    if (typeof window === "undefined") return FALLBACK_PROVIDERS[0]?.id ?? "wandb";
    const stored = window.localStorage.getItem("sinergi-provider");
    return stored || FALLBACK_PROVIDERS[0]?.id || "wandb";
  });
>>>>>>> f01baba (aingmaung)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [filesModalSession, setFilesModalSession] = useState<ChatSession | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

<<<<<<< HEAD
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
  const appendUserMessage = useChatStore((s) => s.appendUserMessage);
  const upsertSessionMessage = useChatStore((s) => s.upsertSessionMessage);
=======
  useEffect(() => {
    window.localStorage.setItem("sinergi-provider", provider);
  }, [provider]);

  useEffect(() => {
    let cancelled = false;
    fetch(`${CHAT_API_URL}/api/models`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((payload: { default?: string; providers?: ModelProvider[] }) => {
        if (cancelled || !payload?.providers?.length) return;
        setProviders(payload.providers);
        const stored = window.localStorage.getItem("sinergi-provider");
        const available = payload.providers.map((p) => p.id);
        const chosen =
          stored && available.includes(stored)
            ? stored
            : payload.default && available.includes(payload.default)
              ? payload.default
              : payload.providers[0].id;
        setProvider(chosen);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const handleProviderChange = (next: Provider) => {
    setProvider(next);
  };

  const handleAddImages = (files: File[]) => {
    const readers = files.map(
      (file) =>
        new Promise<ChatImage>((resolve, reject) => {
          const kind: "image" | "pdf" =
            file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
              ? "pdf"
              : "image";
          const reader = new FileReader();
          reader.onload = () =>
            resolve({
              id: uid("img"),
              name: file.name,
              dataUrl: String(reader.result ?? ""),
              kind,
            });
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(file);
        })
    );
    Promise.all(readers)
      .then((newImages) => setPendingImages((prev) => [...prev, ...newImages]))
      .catch(() => undefined);
  };

  const handleRemoveImage = (id: string) => {
    setPendingImages((prev) => prev.filter((img) => img.id !== id));
  };

  const activeSession = chatSessions.find((s) => s.id === activeSessionId) ?? null;
  const activeMessages = activeSession ? activeSession.messages : messages;
>>>>>>> f01baba (aingmaung)

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
      const images = pendingImages;
      if ((!trimmed && images.length === 0) || isLoading) return;

      const userMessage: ChatMessage = {
        id: uid("user"),
        role: "user",
        content: trimmed,
<<<<<<< HEAD
        ...(attachments.length > 0 ? { attachments } : {}),
      };

      const sessionId = appendUserMessage(activeSessionId, userMessage);

      if (!activeSessionId && sessionId) {
        setSessionModel(sessionId, draftModel);
=======
        images: images.length > 0 ? images : undefined,
      };

      let sessionId = activeSessionId;
      if (!sessionId) {
        sessionId = uid("session");
        const newSession: ChatSession = {
          id: sessionId,
          title: truncateTitle(trimmed || images[0]?.name || "New chat"),
          messages: [userMessage],
          createdAt: new Date().toISOString(),
        };
        setChatSessions((prev) => [newSession, ...prev]);
        setActiveSessionId(sessionId);
      } else {
        setChatSessions((prev) =>
          prev.map((s) =>
            s.id === sessionId ? { ...s, messages: [...s.messages, userMessage] } : s
          )
        );
>>>>>>> f01baba (aingmaung)
      }

      setInput("");
<<<<<<< HEAD
      setAttachments([]);
=======
      setPendingImages([]);
>>>>>>> f01baba (aingmaung)
      setIsLoading(true);

      const loadingMsg: ChatMessage = {
        id: uid("loading"),
        role: "assistant",
        content: "",
        isLoading: true,
      };

      if (sessionId) {
        upsertSessionMessage(sessionId, loadingMsg);
      }

      const conversation: ApiMessage[] = [
        ...(activeSession?.messages ?? []),
        userMessage,
      ].map(({ role, content, images: msgImages }) => ({
        role,
        content: buildMessageContent(content, msgImages ?? []),
      }));

      try {
<<<<<<< HEAD
        const aiResponse = await requestAIResponse(conversation);
        upsertSessionMessage(sessionId, aiResponse, { removeLoading: true });
=======
        const { message: aiResponse } = await requestAIResponse(conversation, provider);
        setChatSessions((prev) =>
          prev.map((s) => {
            if (s.id !== sessionId) return s;
            const withoutLoading = s.messages.filter((m) => m.id !== loadingMsg.id);
            return { ...s, messages: [...withoutLoading, aiResponse] };
          })
        );
>>>>>>> f01baba (aingmaung)
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
<<<<<<< HEAD
    [
      activeSession,
      activeSessionId,
      isLoading,
      attachments,
      appendUserMessage,
      upsertSessionMessage,
      setIsLoading,
      draftModel,
      setSessionModel,
    ]
=======
    [activeSession, activeSessionId, isLoading, provider, pendingImages]
>>>>>>> f01baba (aingmaung)
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

  const handleAddFiles = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;

    setAttachments((prev) => {
      const next = [...prev];
      const added: Attachment[] = [];

      for (const file of Array.from(fileList)) {
        if (next.length + added.length >= MAX_ATTACHMENTS) {
          showToast(`Maksimal ${MAX_ATTACHMENTS} file per pesan.`);
          break;
        }
        if (file.size > MAX_ATTACHMENT_SIZE) {
          showToast(`"${file.name}" melebihi batas 10MB.`);
          continue;
        }
        added.push({
          id: uid("att"),
          fileName: file.name,
          fileSize: file.size,
          status: "uploading",
        });
      }

      return [...next, ...added];
    });

    // Simulasi progress upload
    setTimeout(() => {
      setAttachments((prev) =>
        prev.map((att) =>
          att.status === "uploading" ? { ...att, status: "done" as const } : att
        )
      );
    }, 1200);
  };

  const handleRemoveAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((att) => att.id !== id));
  };

  const handleNewChat = () => {
    newSession();
    setDraftModel("sft");
    setInput("");
    setPendingImages([]);
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
        content: `Model diganti ke ${model.toUpperCase()}`,
      };
      upsertSessionMessage(activeSessionId, systemMsg);
    }
  };

  const handleDeleteChat = (id: string) => {
    if (!window.confirm("Hapus chat ini?")) return;
<<<<<<< HEAD
    deleteChat(id);
    if (activeSessionId === id) setInput("");
=======
    setChatSessions((prev) => prev.filter((s) => s.id !== id));
    if (activeSessionId === id) {
      setActiveSessionId(null);
      setMessages([]);
      setInput("");
      setPendingImages([]);
    }
>>>>>>> f01baba (aingmaung)
  };

  const handleViewFiles = (id: string) => {
    setFilesModalSession(getSession(id));
  };

  return (
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
      />

      {/* Center chat area */}
      <main className="flex min-w-0 flex-1 flex-col">
        {activeSession && (
          <div className="flex items-center justify-between border-b border-zinc-200 bg-white/60 px-4 py-2.5 sm:px-8">
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
                <MessageBubble key={message.id} message={message} />
              ))}
            </div>
          )}
        </div>

<<<<<<< HEAD
        <div className="sticky bottom-0 mx-auto w-full max-w-3xl px-4 pb-5 sm:px-6">
          <div className="mb-2">
            <ContextUsageBar session={activeSession} />
          </div>
=======
        <div className="sticky bottom-0 mx-auto w-full max-w-3xl space-y-2 px-4 pb-5 sm:px-6">
          <ProviderSwitch
            providers={providers}
            provider={provider}
            onChange={handleProviderChange}
            disabled={isLoading}
          />
>>>>>>> f01baba (aingmaung)
          <ChatInput
            value={input}
            onChange={setInput}
            onSubmit={() => handleSend(input)}
            disabled={isLoading}
<<<<<<< HEAD
            attachments={attachments}
            onAddFiles={handleAddFiles}
            onRemoveAttachment={handleRemoveAttachment}
            model={activeSession?.model ?? draftModel}
            onModelChange={handleModelChange}
=======
            images={pendingImages}
            onAddImages={handleAddImages}
            onRemoveImage={handleRemoveImage}
>>>>>>> f01baba (aingmaung)
          />
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

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white shadow-lg">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {toast}
        </div>
      )}
    </div>
  );
}
