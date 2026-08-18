export interface Source {
  id: string;
  title: string;
  hakim: string;
  hakimAnggota: string;
  tanggalDitetapkan: string;
  tanggalDibacakan: string;
  tingkat: string;
}

<<<<<<< HEAD
export interface Attachment {
  id: string;
  fileName: string;
  fileSize: number;
  url?: string; // terisi setelah upload sukses
  status: "uploading" | "done" | "error";
=======
export interface ChatImage {
  id: string;
  name: string;
  dataUrl: string; // data URI (base64)
  kind?: "image" | "pdf"; // image dikirim sebagai image_url; pdf hanya dicatat namanya
}

export interface ModelProvider {
  id: string;
  name: string;
  model: string;
  kind: "vllm" | "wandb";
  supportsImages: boolean;
  configured: boolean;
>>>>>>> f01baba (aingmaung)
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  images?: ChatImage[];
  model?: string; // model yang menghasilkan balasan
  sources?: Source[]; // hanya ada jika AI mereferensikan putusan
  isLoading?: boolean;
  attachments?: Attachment[];
}

export interface ChatSession {
  id: string;
  title: string; // dari pertanyaan pertama user, truncated
  messages: ChatMessage[];
  createdAt: string;
  isPinned?: boolean;
  model?: "sft" | "rag"; // model yang dipakai untuk sesi ini
  contextLimit: number; // token limit sesuai model
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