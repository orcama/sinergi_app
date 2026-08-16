"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Plus,
  Library,
  FolderKanban,
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
} from "lucide-react";
import type { ChatMessage, ChatSession, Source } from "@/lib/types";

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function truncateTitle(text: string, max = 24): string {
  const clean = text.trim();
  return clean.length > max ? `${clean.slice(0, max)}...` : clean;
}

function uid(prefix: string): string {
  const cryptoObj =
    typeof crypto !== "undefined" ? (crypto as Crypto) : undefined;
  const rand = cryptoObj?.randomUUID
    ? cryptoObj.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `${prefix}-${rand}`;
}

const KEYWORDS = ["putusan", "tppo", "tipikor", "pidana", "pengadilan", "vonis"];

function simulateAIResponse(userMessage: string): Promise<ChatMessage> {
  return new Promise((resolve) => {
    setTimeout(() => {
      const mentionsPutusan = KEYWORDS.some((kw) =>
        userMessage.toLowerCase().includes(kw)
      );

      const baseContent = mentionsPutusan
        ? `Berdasarkan analisis terhadap perkara tersebut, berikut ringkasan yang dapat saya berikan.\n\nPutusan ini merupakan perkara pidana yang telah diputus oleh Pengadilan Negeri Kupang. Majelis hakim menilai berdasarkan alat bukti dan keterangan para saksi yang diajukan di persidangan.\n\nPertimbangan pokok yang menjadi dasar putusan meliputi:\n\n1. Kualifikasi perbuatan yang didakwakan oleh Jaksa Penuntut Umum.\n2. Kesesuaian alat bukti dengan fakta-fakta hukum di persidangan.\n3. Hal yang memberatkan dan meringankan terdakwa.\n\nSaya mereferensikan putusan terkait pada panel sebelah kanan untuk Anda tinjau lebih lanjut.`
        : `Terima kasih atas pertanyaan Anda.\n\nBerdasarkan pengetahuan hukum yang saya miliki, hal ini dapat dijelaskan dengan beberapa poin penting berikut:\n\n1. Prinsip dasar yang relevan dengan pertanyaan Anda.\n\n2. Penerapan dalam praktik peradilan.\n\nApabila Anda memiliki konteks tambahan atau ingin mendalami bagian tertentu, silakan tanyakan kembali.`;

      const sources: Source[] | undefined = mentionsPutusan
        ? [
            {
              id: "1",
              title: "Putusan Nomor 1/Pid.Sus/2026/PN.KPN",
              hakim: "H. Muhammad Yusuf, S.H.",
              hakimAnggota: "Dra. Siti Aminah, S.H., M.H.",
              tanggalDitetapkan: "12 Februari 2026",
              tanggalDibacakan: "17 Februari 2026",
              tingkat: "Pertama",
            },
            {
              id: "2",
              title: "Putusan Nomor 45/Pid.Sus/2025/PN.KPN",
              hakim: "Rizky Pratama, S.H., M.H.",
              hakimAnggota: "Dewi Lestari, S.H.",
              tanggalDitetapkan: "3 September 2025",
              tanggalDibacakan: "9 September 2025",
              tingkat: "Pertama",
            },
          ]
        : undefined;

      resolve({
        id: uid("ai"),
        role: "assistant",
        content: baseContent,
        sources,
      });
    }, 1000);
  });
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
        <button className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition-colors hover:bg-white/10">
          <Library className="h-5 w-5 shrink-0 text-pink-400" />
          {!isCollapsed && <span>Library</span>}
        </button>
        <button className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition-colors hover:bg-white/10">
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
            <span className="mt-0.5 inline-block rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/70">
              Free
            </span>
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

function ChatInput({
  value,
  onChange,
  onSubmit,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  disabled: boolean;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!disabled && value.trim()) onSubmit();
      }}
      className="flex items-center gap-3 rounded-full border border-zinc-200 bg-white px-5 py-2.5 shadow-lg"
    >
      <Plus className="h-5 w-5 shrink-0 text-zinc-400" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Ask anything"
        className="w-full bg-transparent text-sm text-zinc-800 outline-none placeholder:text-zinc-400"
      />
      <button
        type="submit"
        disabled={disabled || !value.trim()}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black text-white transition-colors disabled:cursor-not-allowed disabled:opacity-40"
        aria-label="Send message"
      >
        <ArrowUp className="h-5 w-5" />
      </button>
    </form>
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
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isSourcesSidebarOpen, setIsSourcesSidebarOpen] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [input, setInput] = useState("");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [filesModalSession, setFilesModalSession] = useState<ChatSession | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  const activeSession = chatSessions.find((s) => s.id === activeSessionId) ?? null;
  const activeMessages = activeSession ? activeSession.messages : messages;

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
      };

      let sessionId = activeSessionId;
      if (!sessionId) {
        sessionId = uid("session");
        const newSession: ChatSession = {
          id: sessionId,
          title: truncateTitle(trimmed),
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
      }

      setMessages([]);
      setInput("");
      setIsLoading(true);

      const loadingMsg: ChatMessage = {
        id: uid("loading"),
        role: "assistant",
        content: "",
        isLoading: true,
      };

      if (sessionId) {
        setChatSessions((prev) =>
          prev.map((s) =>
            s.id === sessionId ? { ...s, messages: [...s.messages, loadingMsg] } : s
          )
        );
      }

      const aiResponse = await simulateAIResponse(trimmed);

      setChatSessions((prev) =>
        prev.map((s) => {
          if (s.id !== sessionId) return s;
          const withoutLoading = s.messages.filter((m) => m.id !== loadingMsg.id);
          return { ...s, messages: [...withoutLoading, aiResponse] };
        })
      );
      setIsLoading(false);
    },
    [activeSessionId, isLoading]
  );

  const handlePickTemplate = (text: string) => {
    setInput(text);
    handleSend(text);
  };

  const handleNewChat = () => {
    setActiveSessionId(null);
    setMessages([]);
    setInput("");
  };

  const handleSelectSession = (id: string) => {
    setActiveSessionId(id);
  };

  const handleTogglePin = (id: string) => {
    setChatSessions((prev) =>
      prev.map((s) =>
        s.id === id ? { ...s, isPinned: !s.isPinned } : s
      )
    );
  };

  const handleDeleteChat = (id: string) => {
    if (!window.confirm("Hapus chat ini?")) return;
    setChatSessions((prev) => prev.filter((s) => s.id !== id));
    if (activeSessionId === id) {
      setActiveSessionId(null);
      setMessages([]);
      setInput("");
    }
  };

  const handleViewFiles = (id: string) => {
    const session = chatSessions.find((s) => s.id === id) ?? null;
    setFilesModalSession(session);
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

        <div className="sticky bottom-0 mx-auto w-full max-w-3xl px-4 pb-5 sm:px-6">
          <ChatInput
            value={input}
            onChange={setInput}
            onSubmit={() => handleSend(input)}
            disabled={isLoading}
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
    </div>
  );
}