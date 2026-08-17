export interface Source {
  id: string;
  title: string;
  hakim: string;
  hakimAnggota: string;
  tanggalDitetapkan: string;
  tanggalDibacakan: string;
  tingkat: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Source[]; // hanya ada jika AI mereferensikan putusan
  isLoading?: boolean;
}

export interface ChatSession {
  id: string;
  title: string; // dari pertanyaan pertama user, truncated
  messages: ChatMessage[];
  createdAt: string;
  isPinned?: boolean;
  projectId?: string;
  files?: { name: string; url: string }[]; // untuk fitur "View files in chat"
}

export interface LibraryFile {
  id: string;
  name: string;
  type: "image" | "document";
  extension: string;
  modifiedAt: string;
  sizeInBytes: number;
  chatId?: string;
  projectId?: string;
}

export interface Project {
  id: string;
  name: string;
  emoji?: string;
  createdBy: "you" | "shared";
  modifiedAt: string;
  chatIds: string[];
  fileIds: string[];
  instructions?: string;
}