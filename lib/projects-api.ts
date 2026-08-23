import { apiClient } from "@/lib/api";
import type { LibraryFile, Project } from "@/lib/types";

type ProjectPayload = { id: string; name: string; emoji?: string; created_by: "you" | "shared"; modified_at: string; chat_ids: string[]; file_ids: string[]; instructions?: string };

function normalizeProject(payload: ProjectPayload): Project {
  return { id: payload.id, name: payload.name, emoji: payload.emoji, createdBy: payload.created_by, modifiedAt: payload.modified_at, chatIds: payload.chat_ids, fileIds: payload.file_ids, instructions: payload.instructions };
}

export async function listProjects(): Promise<Project[]> {
  const response = await apiClient.get<{ projects: ProjectPayload[] }>("/api/projects");
  return response.data.projects.map(normalizeProject);
}

export async function getProject(id: string): Promise<Project> {
  const response = await apiClient.get<ProjectPayload>("/api/projects/" + id);
  return normalizeProject(response.data);
}

export async function createProject(name: string): Promise<Project> {
  const response = await apiClient.post<ProjectPayload>("/api/projects", { name, emoji: "📁" });
  return normalizeProject(response.data);
}

export async function updateProject(id: string, changes: { name?: string; instructions?: string }): Promise<Project> {
  const response = await apiClient.patch<ProjectPayload>("/api/projects/" + id, changes);
  return normalizeProject(response.data);
}

export async function deleteProject(id: string): Promise<void> {
  await apiClient.delete("/api/projects/" + id);
}

export async function listProjectFiles(projectId: string): Promise<LibraryFile[]> {
  const response = await apiClient.get<{ files: Array<Record<string, unknown>> }>("/api/library", { params: { project_id: projectId } });
  return response.data.files.map((file) => ({ id: String(file.id), name: String(file.name ?? ""), type: file.type === "image" ? "image" : "document", extension: String(file.extension ?? ""), modifiedAt: String(file.modified_at ?? ""), sizeInBytes: Number(file.size_in_bytes ?? 0), chatId: file.chat_id ? String(file.chat_id) : undefined, projectId }));
}

