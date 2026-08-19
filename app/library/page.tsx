"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  Library,
  Plus,
  FolderKanban,
  History,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Trash2,
  FileText,
  FileImage,
  File,
} from "lucide-react";
import { AuthGuard } from "@/lib/components/auth/AuthGuard";
import { useAuth } from "@/lib/auth-context";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface LibraryFile {
  id: string;
  name: string;
  type: "image" | "document";
  extension: string; // "docx", "pdf", "img", dll
  modifiedAt: string; // ISO date string
  sizeInBytes: number;
  chatId?: string; // referensi ke chat asal file ini dikirim
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

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

function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/* ------------------------------------------------------------------ */
/* Mock data                                                           */
/* ------------------------------------------------------------------ */

const MOCK_FILES: LibraryFile[] = [
  {
    id: "f1",
    name: "Putusan_Tipikor_2026.pdf",
    type: "document",
    extension: "pdf",
    modifiedAt: "2026-08-07T09:30:00.000Z",
    sizeInBytes: 2_400_000_000,
    chatId: "s1",
  },
  {
    id: "f2",
    name: "SK_KPN_2026.docx",
    type: "document",
    extension: "docx",
    modifiedAt: "2026-08-01T14:20:00.000Z",
    sizeInBytes: 243_000_000,
    chatId: "s1",
  },
  {
    id: "f3",
    name: "Dokumen_Sidang.png",
    type: "image",
    extension: "png",
    modifiedAt: "2026-07-28T11:05:00.000Z",
    sizeInBytes: 190_000,
    chatId: "s2",
  },
  {
    id: "f4",
    name: "Laporan_Analisis.docx",
    type: "document",
    extension: "docx",
    modifiedAt: "2026-07-15T16:45:00.000Z",
    sizeInBytes: 243_000_000,
    chatId: "s3",
  },
  {
    id: "f5",
    name: "Bukti_Foto.img",
    type: "image",
    extension: "img",
    modifiedAt: "2026-06-30T08:10:00.000Z",
    sizeInBytes: 5_000_000,
    chatId: "s2",
  },
  {
    id: "f6",
    name: "Permohonan_Banding.docx",
    type: "document",
    extension: "docx",
    modifiedAt: "2026-06-12T10:00:00.000Z",
    sizeInBytes: 190_000,
    chatId: "s4",
  },
];

/* ------------------------------------------------------------------ */
/* Sub-components                                                      */
/* ------------------------------------------------------------------ */

function Sidebar({ isCollapsed, onToggleCollapse }: { isCollapsed: boolean; onToggleCollapse: () => void }) {
  const router = useRouter();
  const { user, logout, loading } = useAuth();
  const handleLogout = async () => {
    await logout();
    router.push("/");
  };
  const displayName = user?.displayName ?? user?.email ?? "User";
  const initials = (displayName.charAt(0) ?? "U").toUpperCase();
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
          className="flex items-center gap-3 rounded-xl bg-pink-300 px-3 py-2.5 text-left text-sm font-semibold text-purple-900 transition-colors"
        >
          <Library className="h-5 w-5 shrink-0 text-purple-900" />
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

      <div className="flex items-center gap-3 border-t border-white/10 px-4 py-4 mt-auto">
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
  );
}

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
        <p className="text-sm">Tidak ada file ditemukan</p>
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

function LibraryPage() {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [activeFilter, setActiveFilter] = useState<"all" | "images" | "documents">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [files, setFiles] = useState<LibraryFile[]>(MOCK_FILES);

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

  const handleBulkDelete = () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Hapus ${selectedIds.size} file terpilih?`)) return;
    setFiles((prev) => prev.filter((f) => !selectedIds.has(f.id)));
    setSelectedIds(new Set());
  };

  const selectedCount = selectedIds.size;

  return (
    <AuthGuard>
    <div className="flex h-screen w-full overflow-hidden bg-[#F5F5F7]">
      <Sidebar
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed((v) => !v)}
      />

      <main className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-8">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <h1 className="text-3xl font-bold text-zinc-900">Library</h1>
            <LibrarySearchBar value={searchQuery} onChange={setSearchQuery} />
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <LibraryFilterTabs active={activeFilter} onChange={setActiveFilter} />
            {selectedCount > 0 && (
              <div className="ml-auto flex items-center gap-3 rounded-full bg-white px-4 py-1.5 shadow-sm">
                <span className="text-sm font-medium text-zinc-600">
                  {selectedCount} file dipilih
                </span>
                <button
                  onClick={handleBulkDelete}
                  className="flex items-center gap-1.5 rounded-full bg-red-500 px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-red-600"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Hapus
                </button>
              </div>
            )}
          </div>

          <div className="mt-6 rounded-2xl bg-white p-3 shadow-sm">
            <LibraryTable
              files={filteredFiles}
              selectedIds={selectedIds}
              onToggle={toggleSelect}
              onToggleAll={toggleSelectAll}
              onDelete={handleDelete}
            />
          </div>
        </div>
      </main>
    </div>
    </AuthGuard>
  );
}

export default LibraryPage;