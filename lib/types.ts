export interface AuthenticatedUser {
  uid: string;
  email: string | null;
  name: string | null;
  photoURL: string | null;
}

export interface UploadedFile {
  file_id: string;
  url: string;
}

export interface Source {
  id: string;
  title: string;
  hakim: string;
  hakimAnggota: string;
  tanggalDitetapkan: string;
  tanggalDibacakan: string;
  tingkat: string;
  excerpt?: string; // snippet teks untuk sumber RAG
  score?: number; // skor relevansi retrieval (RAG)
  reason?: string; // alasan skor (phrase/tokens/qword/fallback)
}

export interface Attachment {
  id: string;
  fileName: string;
  fileSize: number;
  url?: string; // terisi setelah upload sukses
  status: "uploading" | "done" | "error";
  file?: File; // file asli untuk proses RAG ingest / kirim ke model
  extractedText?: string; // teks hasil ekstraksi PDF dari backend
  tokenCount?: number; // jumlah token teks hasil ekstraksi (dari backend)
  error?: string; // detail error ekstraksi bila tersedia
  libraryFileId?: string; // id dokumen yang sudah dibersihkan dan di-embed di backend
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  thinking?: string; // reasoning trace (proses berpikir model), bila ada
  thinkingSeconds?: number; // estimasi durasi proses berpikir
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
  model?: "sft" | "rag"; // mode model: fine-tuned vs retrieval
  provider?: "local" | "deployed"; // local vLLM vs deployed (MiniMax M3)
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
