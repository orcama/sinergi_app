"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  Library,
  Plus,
  FolderKanban,
  History,
  Pin,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Trash2,
  MessageSquare,
  Cpu,
  Sparkles,
} from "lucide-react";
import { useChatStore } from "@/lib/store/chat-store";
import type { ChatSession } from "@/lib/types";
import { AuthGuard } from "@/lib/components/auth/AuthGuard";
import { useAuth } from "@/lib/auth-context";

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function lastMessagePreview(session: ChatSession): string {
  const last = [...session.messages]
    .reverse()
    .find((m) => !m.isLoading && m.content.trim().length > 0);
  if (!last) return "Belum ada pesan";
  const text = last.content.replace(/\s+/g, " ").trim();
  return text.length > 80 ? `${text.slice(0, 80)}...` : text;
}

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function isWithinLast7Days(iso: string): boolean {
  const d = new Date(iso).getTime();
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return d >= weekAgo;
}

/* ------------------------------------------------------------------ */
/* Sidebar                                                             */
/* ------------------------------------------------------------------ */

function Sidebar({
  isCollapsed,
  onToggleCollapse,
  mobileOpen,
  onMobileClose,
}: {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
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
          onClick={() => router.push("/chat")}
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
          className="flex items-center gap-3 rounded-xl bg-pink-300 px-3 py-2.5 text-left text-sm font-semibold text-purple-900 transition-colors"
        >
          <History className="h-5 w-5 shrink-0 text-purple-900" />
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

      <div className="mt-auto flex items-center gap-3 border-t border-white/10 px-4 py-4">
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

/* ------------------------------------------------------------------ */
/* Sub-components                                                      */
/* ------------------------------------------------------------------ */

type Filter = "all" | "pinned" | "today" | "week";

function HistorySearchBar({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex w-full items-center gap-2 rounded-full border border-zinc-200 bg-white px-4 py-2">
      <Search className="h-4 w-4 shrink-0 text-zinc-400" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search"
        className="w-full bg-transparent text-sm text-zinc-800 outline-none placeholder:text-zinc-400"
      />
    </div>
  );
}

function HistoryFilterTabs({
  active,
  onChange,
}: {
  active: Filter;
  onChange: (f: Filter) => void;
}) {
  const tabs: { key: Filter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "pinned", label: "Pinned" },
    { key: "today", label: "Today" },
    { key: "week", label: "Last 7 days" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-3">
      {tabs.map((tab) => {
        const isActive = tab.key === active;
        return (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            className={`rounded-full px-4 py-1 text-sm transition-colors ${
              isActive
                ? "bg-pink-300 font-semibold text-purple-900"
                : "text-zinc-500 hover:text-zinc-800"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

function ModelBadge({ model }: { model?: "sft" | "rag" }) {
  const value = model ?? "sft";
  const isRag = value === "rag";
  const label = value.toUpperCase();
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
        isRag ? "bg-purple-100 text-purple-700" : "bg-zinc-100 text-zinc-600"
      }`}
    >
      {isRag ? (
        <Sparkles className="h-3 w-3" />
      ) : (
        <Cpu className="h-3 w-3" />
      )}
      {label}
    </span>
  );
}

function HistoryTableRow({
  session,
  selected,
  onToggle,
  onDelete,
  onOpen,
}: {
  session: ChatSession;
  selected: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onOpen: () => void;
}) {
  return (
    <div
      className={`group flex cursor-pointer items-center gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-gray-50 ${
        selected ? "bg-pink-50" : ""
      }`}
      onClick={onOpen}
    >
      <input
        type="checkbox"
        checked={selected}
        onClick={(e) => e.stopPropagation()}
        onChange={onToggle}
        className="h-4 w-4 shrink-0 accent-pink-500"
        aria-label={`Select ${session.title}`}
      />
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {session.isPinned && <Pin className="h-4 w-4 shrink-0 text-pink-500" />}
        <MessageSquare className="h-4 w-4 shrink-0 text-zinc-400" />
        <span className="truncate text-sm font-medium text-zinc-800">
          {session.title}
        </span>
      </div>
      <div className="hidden w-16 shrink-0 sm:block">
        <ModelBadge model={session.model} />
      </div>
      <div className="hidden min-w-0 flex-1 truncate pl-4 text-sm text-zinc-500 md:block">
        {lastMessagePreview(session)}
      </div>
      <div className="hidden w-24 shrink-0 text-right text-sm text-zinc-500 sm:block">
        {formatDate(session.createdAt)}
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="shrink-0 rounded-md p-1.5 text-red-500 transition-colors hover:bg-red-50"
        aria-label={`Delete ${session.title}`}
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

function HistoryTable({
  sessions,
  selectedIds,
  onToggle,
  onToggleAll,
  onDelete,
  onOpen,
}: {
  sessions: ChatSession[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  onDelete: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-zinc-400">
        <History className="h-10 w-10" />
        <p className="text-sm">Tidak ada riwayat chat ditemukan</p>
      </div>
    );
  }

  const allSelected = sessions.every((s) => selectedIds.has(s.id));

  return (
    <div>
      <div className="flex items-center gap-3 px-3 pb-2">
        <input
          type="checkbox"
          checked={allSelected}
          onChange={onToggleAll}
          className="h-4 w-4 shrink-0 accent-pink-500"
          aria-label="Select all chats"
        />
        <div className="flex min-w-0 flex-1 items-center text-sm font-medium text-zinc-400">
          <span>Title</span>
        </div>
        <div className="hidden w-16 shrink-0 text-sm font-medium text-zinc-400 sm:block">
          Model
        </div>
        <div className="hidden min-w-0 flex-1 pl-4 text-sm font-medium text-zinc-400 md:block">
          Last message
        </div>
        <div className="hidden w-24 shrink-0 text-right text-sm font-medium text-zinc-400 sm:block">
          Modified
        </div>
        <div className="w-8 shrink-0" />
      </div>

      <div className="flex flex-col">
        {sessions.map((session) => (
          <HistoryTableRow
            key={session.id}
            session={session}
            selected={selectedIds.has(session.id)}
            onToggle={() => onToggle(session.id)}
            onDelete={() => onDelete(session.id)}
            onOpen={() => onOpen(session.id)}
          />
        ))}
      </div>
    </div>
  );
}

function HistoryPage() {
  const router = useRouter();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState<Filter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const chatSessions = useChatStore((s) => s.chatSessions);
  const deleteChat = useChatStore((s) => s.deleteChat);
  const loadSessions = useChatStore((s) => s.loadSessions);
  const setSessions = useChatStore((s) => s.setSessions);
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (user) {
      loadSessions().catch(() => {});
    } else {
      setSessions([], null);
    }
  }, [user, loading, loadSessions, setSessions]);

  const filteredSessions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return [...chatSessions]
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
      .filter((session) => {
        const matchesFilter =
          activeFilter === "all" ||
          (activeFilter === "pinned" && session.isPinned) ||
          (activeFilter === "today" && isToday(session.createdAt)) ||
          (activeFilter === "week" && isWithinLast7Days(session.createdAt));
        const matchesSearch = !q || session.title.toLowerCase().includes(q);
        return matchesFilter && matchesSearch;
      });
  }, [chatSessions, activeFilter, searchQuery]);

  const visibleIds = useMemo(
    () => new Set(filteredSessions.map((s) => s.id)),
    [filteredSessions]
  );

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      const allSelected =
        visibleIds.size > 0 && [...visibleIds].every((id) => prev.has(id));
      const next = new Set(prev);
      if (allSelected) {
        visibleIds.forEach((id) => next.delete(id));
      } else {
        visibleIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const handleDelete = (id: string) => {
    if (!window.confirm("Hapus chat ini?")) return;
    deleteChat(id);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const handleOpen = (id: string) => {
    router.push(`/chat?sessionId=${id}`);
  };

  const selectedCount = selectedIds.size;

  return (
    <AuthGuard>
    <div className="flex h-screen w-full overflow-hidden bg-[#F5F5F7]">
      <Sidebar
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed((v) => !v)}
        mobileOpen={isMobileSidebarOpen}
        onMobileClose={() => setIsMobileSidebarOpen(false)}
      />

      <main className="relative flex min-w-0 flex-1 flex-col overflow-y-auto">
        <button
          type="button"
          onClick={() => setIsMobileSidebarOpen(true)}
          className="fixed left-3 top-3 z-20 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-zinc-600 shadow ring-1 ring-zinc-200 transition-colors hover:bg-zinc-100 lg:hidden"
          aria-label="Buka menu"
        >
          <PanelLeftOpen className="h-5 w-5" />
        </button>
        <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-8">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <h1 className="text-3xl font-bold text-zinc-900">History</h1>
            <div className="w-full sm:w-64">
              <HistorySearchBar value={searchQuery} onChange={setSearchQuery} />
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <HistoryFilterTabs active={activeFilter} onChange={setActiveFilter} />
            {selectedCount > 0 && (
              <div className="ml-auto flex items-center gap-3 rounded-full bg-white px-4 py-1.5 shadow-sm">
                <span className="text-sm font-medium text-zinc-600">
                  {selectedCount} chat dipilih
                </span>
                <button
                  onClick={() => {
                    if (!window.confirm(`Hapus ${selectedCount} chat terpilih?`))
                      return;
                    selectedIds.forEach(deleteChat);
                    setSelectedIds(new Set());
                  }}
                  className="flex items-center gap-1.5 rounded-full bg-red-500 px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-red-600"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Hapus
                </button>
              </div>
            )}
          </div>

          <div className="mt-6 rounded-2xl bg-white p-3 shadow-sm">
            <HistoryTable
              sessions={filteredSessions}
              selectedIds={selectedIds}
              onToggle={toggleSelect}
              onToggleAll={toggleSelectAll}
              onDelete={handleDelete}
              onOpen={handleOpen}
            />
          </div>
        </div>
      </main>
    </div>
    </AuthGuard>
  );
}

export default HistoryPage;