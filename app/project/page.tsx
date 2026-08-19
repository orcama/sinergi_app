"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  Library,
  Plus,
  FolderKanban,
  FolderOpen,
  History,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Trash2,
  SmilePlus,
  Lightbulb,
  X,
} from "lucide-react";
import { AuthGuard } from "@/lib/components/auth/AuthGuard";
import { useAuth } from "@/lib/auth-context";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface Project {
  id: string;
  name: string;
  emoji?: string; // opsional, dari icon smiley picker
  createdBy: "you" | "shared";
  modifiedAt: string; // ISO date
  chatIds?: string[]; // chat yang tergabung dalam project ini
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

function createProjectId(): string {
  const cryptoObj = typeof crypto !== "undefined" ? (crypto as Crypto) : undefined;
  return cryptoObj?.randomUUID
    ? cryptoObj.randomUUID()
    : `proj-${Math.random().toString(36).slice(2)}`;
}

/* ------------------------------------------------------------------ */
/* Mock data                                                           */
/* ------------------------------------------------------------------ */

const DUMMY_PROJECTS: Project[] = [
  { id: "p1", name: "Project 1", emoji: "📁", createdBy: "you", modifiedAt: "2026-08-07T09:00:00.000Z" },
  { id: "p2", name: "Project 2", emoji: "📁", createdBy: "shared", modifiedAt: "2026-08-07T10:00:00.000Z" },
  { id: "p3", name: "Project 3", emoji: "📁", createdBy: "you", modifiedAt: "2026-08-07T11:00:00.000Z" },
];

/* ------------------------------------------------------------------ */
/* Sub-components                                                      */
/* ------------------------------------------------------------------ */

function Sidebar({
  isCollapsed,
  onToggleCollapse,
}: {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
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
          className="flex items-center gap-3 rounded-xl bg-pink-300 px-3 py-2.5 text-left text-sm font-semibold text-purple-900 transition-colors"
        >
          <FolderKanban className="h-5 w-5 shrink-0 text-purple-900" />
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
  );
}

function ProjectSearchBar({
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

function ProjectFilterTabs({
  active,
  onChange,
}: {
  active: "all" | "created" | "shared";
  onChange: (v: "all" | "created" | "shared") => void;
}) {
  const tabs: { key: "all" | "created" | "shared"; label: string }[] = [
    { key: "all", label: "All" },
    { key: "created", label: "Created by you" },
    { key: "shared", label: "Shared with you" },
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

function ProjectTableRow({
  project,
  selected,
  onToggle,
  onDelete,
  onOpen,
}: {
  project: Project;
  selected: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onOpen: () => void;
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
        aria-label={`Select ${project.name}`}
      />
      <button
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <FolderKanban className="h-5 w-5 shrink-0 text-zinc-400" />
        <span className="truncate text-sm font-medium text-zinc-800">
          {project.emoji && <span className="mr-1.5">{project.emoji}</span>}
          {project.name}
        </span>
      </button>
      <div className="hidden w-28 shrink-0 text-sm text-zinc-500 sm:block">
        {formatDate(project.modifiedAt)}
      </div>
      <button
        onClick={onDelete}
        className="shrink-0 rounded-md p-1.5 text-red-500 transition-colors hover:bg-red-50"
        aria-label={`Delete ${project.name}`}
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

function ProjectTable({
  projects,
  selectedIds,
  onToggle,
  onToggleAll,
  onDelete,
  onOpen,
}: {
  projects: Project[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  onDelete: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  if (projects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-zinc-400">
        <FolderOpen className="h-10 w-10" />
        <p className="text-sm">Belum ada project</p>
      </div>
    );
  }

  const allSelected = projects.every((p) => selectedIds.has(p.id));

  return (
    <div>
      <div className="flex items-center gap-3 px-3 pb-2">
        <input
          type="checkbox"
          checked={allSelected}
          onChange={onToggleAll}
          className="h-4 w-4 shrink-0 accent-pink-500"
          aria-label="Select all projects"
        />
        <div className="flex min-w-0 flex-1 items-center text-sm font-medium text-zinc-400">
          <span>Name</span>
        </div>
        <div className="hidden w-28 shrink-0 text-sm font-medium text-zinc-400 sm:block">
          Modified
        </div>
        <div className="w-8 shrink-0" />
      </div>

      <div className="flex flex-col">
        {projects.map((project) => (
          <ProjectTableRow
            key={project.id}
            project={project}
            selected={selectedIds.has(project.id)}
            onToggle={() => onToggle(project.id)}
            onDelete={() => onDelete(project.id)}
            onOpen={() => onOpen(project.id)}
          />
        ))}
      </div>
    </div>
  );
}

function CreateProjectModal({
  isOpen,
  onClose,
  onCreate,
}: {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (name: string) => void;
}) {
  const [name, setName] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onCreate(trimmed);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-2xl"
      >
        <div className="flex items-start justify-between">
          <h2 className="text-3xl font-bold text-zinc-900">Create project</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
            aria-label="Close modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <label className="mt-6 block text-lg font-medium text-zinc-800">
          Project name
        </label>
        <div className="mt-2 flex items-center gap-3 rounded-full border border-zinc-200 bg-white px-4 py-2.5 focus-within:border-pink-300">
          <SmilePlus className="h-5 w-5 shrink-0 text-zinc-400" />
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Copenhagen Trip"
            className="w-full bg-transparent text-sm text-zinc-800 outline-none placeholder:text-zinc-400"
          />
        </div>

        <div className="mt-4 flex items-start gap-3 rounded-2xl bg-pink-200 p-4">
          <Lightbulb className="h-5 w-5 shrink-0 text-purple-700" />
          <p className="text-sm leading-relaxed text-purple-900">
            Projects keep chats, files, and custom instructions in one place.
            Use them for ongoing work, or just to keep things tidy.
          </p>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="submit"
            disabled={!name.trim()}
            className="rounded-full bg-purple-900 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-purple-950 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Create Project
          </button>
        </div>
      </form>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main page                                                           */
/* ------------------------------------------------------------------ */

function ProjectPage() {
  const router = useRouter();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [activeFilter, setActiveFilter] = useState<"all" | "created" | "shared">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [projects, setProjects] = useState<Project[]>(DUMMY_PROJECTS);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [openToken, setOpenToken] = useState(0);

  const filteredProjects = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return projects.filter((project) => {
      const matchesFilter =
        activeFilter === "all" ||
        (activeFilter === "created" && project.createdBy === "you") ||
        (activeFilter === "shared" && project.createdBy === "shared");
      const matchesSearch = !q || project.name.toLowerCase().includes(q);
      return matchesFilter && matchesSearch;
    });
  }, [projects, activeFilter, searchQuery]);

  const visibleIds = useMemo(() => new Set(filteredProjects.map((p) => p.id)), [filteredProjects]);

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

  const handleCreateProject = (name: string) => {
    const newProject: Project = {
      id: createProjectId(),
      name,
      emoji: "📁",
      createdBy: "you",
      modifiedAt: new Date().toISOString(),
    };
    setProjects((prev) => [newProject, ...prev]);
    setIsModalOpen(false);
  };

  const handleDeleteProject = (id: string) => {
    if (!window.confirm("Hapus project ini?")) return;
    setProjects((prev) => prev.filter((p) => p.id !== id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const handleOpenProject = (id: string) => {
    router.push(`/project/${id}`);
  };

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
            <h1 className="text-3xl font-bold text-zinc-900">Project</h1>
            <div className="flex w-full items-center gap-3 sm:w-auto sm:justify-end">
              <div className="sm:w-64">
                <ProjectSearchBar value={searchQuery} onChange={setSearchQuery} />
              </div>
              <button
                onClick={() => {
                setOpenToken((t) => t + 1);
                setIsModalOpen(true);
              }}
                className="shrink-0 rounded-full bg-purple-800 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-purple-900"
              >
                New
              </button>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <ProjectFilterTabs active={activeFilter} onChange={setActiveFilter} />
          </div>

          <div className="mt-6 rounded-2xl bg-white p-3 shadow-sm">
            <ProjectTable
              projects={filteredProjects}
              selectedIds={selectedIds}
              onToggle={toggleSelect}
              onToggleAll={toggleSelectAll}
              onDelete={handleDeleteProject}
              onOpen={handleOpenProject}
            />
          </div>
        </div>
      </main>

      <CreateProjectModal
        key={openToken}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onCreate={handleCreateProject}
      />
    </div>
    </AuthGuard>
  );
}

export default ProjectPage;