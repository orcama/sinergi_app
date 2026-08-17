"use client";

import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  Library,
  Plus,
  FolderKanban,
  PanelLeftClose,
  PanelLeftOpen,
  ArrowLeft,
  Folder,
  MoreHorizontal,
  Search,
  Trash2,
  FileText,
  FileImage,
  File,
  X,
} from "lucide-react";
import type { LibraryFile } from "@/lib/types";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface Project {
  id: string;
  name: string;
  emoji?: string;
  createdBy: "you" | "shared";
  modifiedAt: string;
  chatIds: string[];
  fileIds: string[];
  instructions?: string;
}

interface ChatSummary {
  id: string;
  title: string;
  preview: string;
  updatedAt: string;
  projectId?: string;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatFileSize(bytes: number): string {
  if (bytes >= 1024 ** 3) {
    return `${(bytes / 1024 ** 3).toFixed(2).replace(".", ",")} GB`;
  }
  if (bytes >= 1024 ** 2) {
    return `${(bytes / 1024 ** 2).toFixed(0).replace(".", ",")} MB`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(0).replace(".", ",")} KB`;
  }
  return `${bytes} B`;
}

/* ------------------------------------------------------------------ */
/* Mock data                                                           */
/* ------------------------------------------------------------------ */

const DUMMY_PROJECTS: Project[] = [
  {
    id: "p1",
    name: "Project 1",
    emoji: "📁",
    createdBy: "you",
    modifiedAt: "2026-08-07T09:00:00.000Z",
    chatIds: ["c1", "c2"],
    fileIds: ["f1", "f2"],
    instructions: "Selalu jawab dalam Bahasa Indonesia dan sertakan referensi pasal yang relevan.",
  },
  {
    id: "p2",
    name: "Project 2",
    emoji: "📁",
    createdBy: "shared",
    modifiedAt: "2026-08-07T10:00:00.000Z",
    chatIds: [],
    fileIds: [],
  },
  {
    id: "p3",
    name: "Project 3",
    emoji: "📁",
    createdBy: "you",
    modifiedAt: "2026-08-07T11:00:00.000Z",
    chatIds: ["c3"],
    fileIds: ["f3"],
  },
];

const DUMMY_CHATS: ChatSummary[] = [
  { id: "c1", title: "Jelaskan isi Putusan Nomor 1/Pid.Sus/2026/PN.KPN", preview: "Berdasarkan analisis terhadap perkara tersebut, berikut ringkasan...", updatedAt: "2026-08-07T09:00:00.000Z", projectId: "p1" },
  { id: "c2", title: "Apa saja unsur tindak pidana perdagangan orang (TPPO)?", preview: "Terima kasih atas pertanyaan Anda. Berdasarkan pengetahuan hukum...", updatedAt: "2026-08-07T09:30:00.000Z", projectId: "p1" },
  { id: "c3", title: "Rangkum pertimbangan hakim dalam putusan pidana terbaru", preview: "Putusan ini merupakan perkara pidana yang telah diputus...", updatedAt: "2026-08-07T11:00:00.000Z", projectId: "p3" },
];

const DUMMY_FILES: LibraryFile[] = [
  { id: "f1", name: "Putusan_Tipikor_2026.pdf", type: "document", extension: "pdf", modifiedAt: "2026-08-07T09:30:00.000Z", sizeInBytes: 2_400_000_000, chatId: "c1", projectId: "p1" },
  { id: "f2", name: "SK_KPN_2026.docx", type: "document", extension: "docx", modifiedAt: "2026-08-01T14:20:00.000Z", sizeInBytes: 243_000_000, chatId: "c1", projectId: "p1" },
  { id: "f3", name: "Dokumen_Sidang.png", type: "image", extension: "png", modifiedAt: "2026-07-28T11:05:00.000Z", sizeInBytes: 190_000, chatId: "c3", projectId: "p3" },
];

/* ------------------------------------------------------------------ */
/* Sidebar                                                             */
/* ------------------------------------------------------------------ */

function Sidebar({
  isCollapsed,
  onToggleCollapse,
}: {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
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
          onClick={() => router.push("/project")}
          className="flex items-center gap-3 rounded-xl bg-pink-300 px-3 py-2.5 text-left text-sm font-semibold text-purple-900 transition-colors"
        >
          <FolderKanban className="h-5 w-5 shrink-0 text-purple-900" />
          {!isCollapsed && <span>Project</span>}
        </button>
      </div>

      <div className="mt-auto flex items-center gap-3 border-t border-white/10 px-4 py-4">
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

/* ------------------------------------------------------------------ */
/* Dropdown menu (reuse pattern dari ChatItemMenu)                      */
/* ------------------------------------------------------------------ */

function ProjectMenu({
  isOpen,
  onOpen,
  onClose,
  onRename,
  onShare,
  onDelete,
}: {
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  onRename: () => void;
  onShare: () => void;
  onDelete: () => void;
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
    <div ref={menuRef} className="relative shrink-0">
      <button
        onClick={() => {
          if (isOpen) onClose();
          else onOpen();
        }}
        className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
        aria-label="Project menu"
      >
        <MoreHorizontal className="h-5 w-5" />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-9 z-50 w-56 overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-zinc-100">
          <button
            onClick={() => {
              onRename();
              onClose();
            }}
            className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-gray-900 transition-colors hover:bg-gray-100"
          >
            Rename
          </button>
          <button
            onClick={() => {
              onShare();
              onClose();
            }}
            className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-gray-900 transition-colors hover:bg-gray-100"
          >
            Share
          </button>
          <button
            onClick={() => {
              onDelete();
              onClose();
            }}
            className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-red-500 transition-colors hover:bg-red-50"
          >
            <Trash2 className="h-4 w-4" />
            Delete project
          </button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Header                                                              */
/* ------------------------------------------------------------------ */

function ProjectHeader({
  project,
  onBack,
  onRename,
  onShare,
  onDelete,
}: {
  project: Project;
  onBack: () => void;
  onRename: (name: string) => void;
  onShare: () => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(project.name);
  const [menuOpen, setMenuOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setDraft(project.name);
      inputRef.current?.focus();
    }
  }, [editing, project.name]);

  const commit = () => {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed && trimmed !== project.name) onRename(trimmed);
  };

  const startEditing = () => setEditing(true);

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={onBack}
        className="rounded-lg p-2 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800"
        aria-label="Back to projects"
      >
        <ArrowLeft className="h-5 w-5" />
      </button>
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-pink-100 text-lg">
        {project.emoji ?? <Folder className="h-5 w-5 text-purple-700" />}
      </div>
      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") {
              setDraft(project.name);
              setEditing(false);
            }
          }}
          className="min-w-0 border-b border-pink-400 bg-transparent text-2xl font-bold text-zinc-900 outline-none"
        />
      ) : (
        <button
          onClick={startEditing}
          className="max-w-full truncate text-2xl font-bold text-zinc-900 hover:underline"
          title="Klik untuk rename"
        >
          {project.name}
        </button>
      )}
      <div className="ml-auto">
        <ProjectMenu
          isOpen={menuOpen}
          onOpen={() => setMenuOpen(true)}
          onClose={() => setMenuOpen(false)}
          onRename={startEditing}
          onShare={onShare}
          onDelete={onDelete}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tabs                                                                */
/* ------------------------------------------------------------------ */

type Tab = "chats" | "files" | "instructions";

function ProjectTabs({
  active,
  onChange,
}: {
  active: Tab;
  onChange: (t: Tab) => void;
}) {
  const tabs: { key: Tab; label: string }[] = [
    { key: "chats", label: "Chats" },
    { key: "files", label: "Files" },
    { key: "instructions", label: "Instructions" },
  ];
  return (
    <div className="flex items-center gap-6 border-b border-zinc-200">
      {tabs.map((tab) => {
        const isActive = tab.key === active;
        return (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            className={`relative py-3 text-sm font-medium transition-colors ${
              isActive ? "text-purple-800" : "text-zinc-500 hover:text-zinc-800"
            }`}
          >
            {tab.label}
            {isActive && (
              <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-pink-400" />
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Chats tab                                                           */
/* ------------------------------------------------------------------ */

function ProjectChatCard({
  chat,
  onOpen,
}: {
  chat: ChatSummary;
  onOpen: () => void;
}) {
  return (
    <button
      onClick={onOpen}
      className="group w-full rounded-2xl border border-zinc-200 bg-white p-4 text-left transition-colors hover:border-pink-300 hover:bg-pink-50/40"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="truncate text-sm font-semibold text-zinc-900">
          {chat.title}
        </span>
        <span className="shrink-0 text-xs text-zinc-400">
          {formatDate(chat.updatedAt)}
        </span>
      </div>
      <p className="mt-1 line-clamp-1 text-sm text-gray-500">{chat.preview}</p>
    </button>
  );
}

function ProjectChatsTab({
  chats,
  onNewChat,
  onOpenChat,
}: {
  chats: ChatSummary[];
  onNewChat: () => void;
  onOpenChat: (id: string) => void;
}) {
  return (
    <div className="space-y-4">
      <button
        onClick={onNewChat}
        className="inline-flex items-center gap-2 rounded-full bg-pink-300 px-5 py-2 text-sm font-semibold text-purple-900 transition-colors hover:bg-pink-400"
      >
        <Plus className="h-4 w-4" />
        New chat in this project
      </button>

      {chats.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-zinc-200 py-16 text-center">
          <Folder className="h-10 w-10 text-zinc-300" />
          <p className="text-sm text-zinc-400">Belum ada chat di project ini</p>
          <button
            onClick={onNewChat}
            className="inline-flex items-center gap-2 rounded-full bg-pink-300 px-5 py-2 text-sm font-semibold text-purple-900 transition-colors hover:bg-pink-400"
          >
            <Plus className="h-4 w-4" />
            New chat in this project
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {chats.map((chat) => (
            <ProjectChatCard key={chat.id} chat={chat} onOpen={() => onOpenChat(chat.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Files tab (reuse LibraryTable structure)                             */
/* ------------------------------------------------------------------ */

function LibrarySearchBar({
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

function LibraryFilterTabs({
  active,
  onChange,
}: {
  active: "all" | "images" | "documents";
  onChange: (v: "all" | "images" | "documents") => void;
}) {
  const tabs: { key: "all" | "images" | "documents"; label: string }[] = [
    { key: "all", label: "All" },
    { key: "images", label: "Images" },
    { key: "documents", label: "Documents" },
  ];
  return (
    <div className="flex items-center gap-3">
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

function LibraryTableRow({
  file,
  selected,
  onToggle,
  onDelete,
}: {
  file: LibraryFile;
  selected: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={`group flex items-center gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-gray-50 ${
        selected ? "bg-pink-50" : ""
      }`}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggle}
        className="h-4 w-4 shrink-0 accent-pink-500"
        aria-label={`Select ${file.name}`}
      />
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {file.type === "image" ? (
          <FileImage className="h-5 w-5 shrink-0 text-zinc-400" />
        ) : (
          <FileText className="h-5 w-5 shrink-0 text-zinc-400" />
        )}
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-zinc-800">
            {file.name}
          </div>
          <div className="text-xs text-zinc-400 sm:hidden">
            {formatDate(file.modifiedAt)} · {formatFileSize(file.sizeInBytes)}
          </div>
        </div>
      </div>
      <div className="hidden w-28 shrink-0 text-sm text-zinc-500 sm:block">
        {formatDate(file.modifiedAt)}
      </div>
      <div className="hidden w-24 shrink-0 text-right text-sm text-zinc-500 sm:block">
        {formatFileSize(file.sizeInBytes)}
      </div>
      <button
        onClick={onDelete}
        className="shrink-0 rounded-md p-1.5 text-red-500 transition-colors hover:bg-red-50"
        aria-label={`Delete ${file.name}`}
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

function LibraryTable({
  files,
  selectedIds,
  onToggle,
  onToggleAll,
  onDelete,
}: {
  files: LibraryFile[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  onDelete: (id: string) => void;
}) {
  if (files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-zinc-400">
        <File className="h-10 w-10" />
        <p className="text-sm">Belum ada file di project ini</p>
      </div>
    );
  }

  const allSelected = files.length > 0 && files.every((f) => selectedIds.has(f.id));

  return (
    <div>
      <div className="flex items-center gap-3 px-3 pb-2">
        <input
          type="checkbox"
          checked={allSelected}
          onChange={onToggleAll}
          className="h-4 w-4 shrink-0 accent-pink-500"
          aria-label="Select all files"
        />
        <div className="flex min-w-0 flex-1 items-center gap-3 text-sm font-medium text-zinc-400">
          <span>Name</span>
        </div>
        <div className="hidden w-28 shrink-0 text-sm font-medium text-zinc-400 sm:block">
          Modified
        </div>
        <div className="hidden w-24 shrink-0 text-right text-sm font-medium text-zinc-400 sm:block">
          Size
        </div>
        <div className="w-8 shrink-0" />
      </div>

      <div className="flex flex-col">
        {files.map((file) => (
          <LibraryTableRow
            key={file.id}
            file={file}
            selected={selectedIds.has(file.id)}
            onToggle={() => onToggle(file.id)}
            onDelete={() => onDelete(file.id)}
          />
        ))}
      </div>
    </div>
  );
}

function ProjectFilesTab({ projectId }: { projectId: string }) {
  const [files, setFiles] = useState<LibraryFile[]>(() =>
    DUMMY_FILES.filter((f) => f.projectId === projectId)
  );
  const [activeFilter, setActiveFilter] = useState<"all" | "images" | "documents">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const filteredFiles = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return files.filter((file) => {
      const matchesFilter =
        activeFilter === "all" ||
        (activeFilter === "images" && file.type === "image") ||
        (activeFilter === "documents" && file.type === "document");
      const matchesSearch = !q || file.name.toLowerCase().includes(q);
      return matchesFilter && matchesSearch;
    });
  }, [files, activeFilter, searchQuery]);

  const visibleIds = useMemo(() => new Set(filteredFiles.map((f) => f.id)), [filteredFiles]);

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
      const allSelected = visibleIds.size > 0 && [...visibleIds].every((id) => prev.has(id));
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
    if (!window.confirm("Hapus file ini?")) return;
    setFiles((prev) => prev.filter((f) => f.id !== id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-64">
          <LibrarySearchBar value={searchQuery} onChange={setSearchQuery} />
        </div>
        <LibraryFilterTabs active={activeFilter} onChange={setActiveFilter} />
      </div>
      <div className="rounded-2xl bg-white p-3 shadow-sm">
        <LibraryTable
          files={filteredFiles}
          selectedIds={selectedIds}
          onToggle={toggleSelect}
          onToggleAll={toggleSelectAll}
          onDelete={handleDelete}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Instructions tab                                                    */
/* ------------------------------------------------------------------ */

function ProjectInstructionsTab({
  initial,
  onSave,
}: {
  initial?: string;
  onSave: (text: string) => void;
}) {
  const [value, setValue] = useState(initial ?? "");
  const isDirty = value !== (initial ?? "");

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-zinc-900">Custom Instructions</h3>
        <p className="mt-1 text-sm text-gray-500">
          Instruksi ini akan otomatis disertakan di setiap chat baru dalam project ini.
        </p>
      </div>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Contoh: Selalu jawab dalam Bahasa Indonesia dan sertakan referensi pasal yang relevan."
        className="min-h-[200px] w-full rounded-2xl border border-zinc-200 bg-white p-4 text-sm text-zinc-800 outline-none transition-colors placeholder:text-zinc-400 focus:border-pink-300"
      />
      <div className="flex justify-end">
        <button
          onClick={() => onSave(value)}
          disabled={!isDirty}
          className="rounded-full bg-purple-800 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-purple-900 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Save instructions
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main page                                                           */
/* ------------------------------------------------------------------ */

function ProjectDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const projectId = params.id;

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("chats");
  const [projects, setProjects] = useState<Project[]>(DUMMY_PROJECTS);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const project = projects.find((p) => p.id === projectId) ?? null;

  const projectChats = useMemo(
    () => DUMMY_CHATS.filter((c) => c.projectId === projectId),
    [projectId]
  );

  const showToast = (msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  };

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  if (!project) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#F5F5F7]">
        <div className="flex flex-col items-center gap-4 rounded-2xl bg-white p-10 text-center shadow-sm">
          <Folder className="h-10 w-10 text-zinc-300" />
          <p className="text-sm text-zinc-500">Project tidak ditemukan</p>
          <button
            onClick={() => router.push("/project")}
            className="rounded-full bg-purple-800 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-purple-900"
          >
            Kembali ke Project
          </button>
        </div>
      </div>
    );
  }

  const handleRename = (name: string) => {
    setProjects((prev) =>
      prev.map((p) => (p.id === project.id ? { ...p, name } : p))
    );
  };

  const handleShare = () => {
    showToast("Fitur share segera hadir");
  };

  const handleDeleteProject = () => {
    if (!window.confirm("Hapus project ini?")) return;
    setProjects((prev) => prev.filter((p) => p.id !== project.id));
    router.push("/project");
  };

  const handleNewChat = () => {
    router.push(`/chat?projectId=${project.id}`);
  };

  const handleOpenChat = (chatId: string) => {
    router.push(`/chat?sessionId=${chatId}`);
  };

  const handleSaveInstructions = (text: string) => {
    setProjects((prev) =>
      prev.map((p) => (p.id === project.id ? { ...p, instructions: text } : p))
    );
    showToast("Instructions saved");
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#F5F5F7]">
      <Sidebar
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed((v) => !v)}
      />

      <main className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-8">
          <ProjectHeader
            project={project}
            onBack={() => router.push("/project")}
            onRename={handleRename}
            onShare={handleShare}
            onDelete={handleDeleteProject}
          />

          <div className="mt-8">
            <ProjectTabs active={activeTab} onChange={setActiveTab} />
          </div>

          <div className="mt-6">
            {activeTab === "chats" && (
              <ProjectChatsTab
                chats={projectChats}
                onNewChat={handleNewChat}
                onOpenChat={handleOpenChat}
              />
            )}
            {activeTab === "files" && <ProjectFilesTab projectId={project.id} />}
            {activeTab === "instructions" && (
              <ProjectInstructionsTab
                key={project.id}
                initial={project.instructions}
                onSave={handleSaveInstructions}
              />
            )}
          </div>
        </div>
      </main>

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

export default ProjectDetailPage;