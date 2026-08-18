import { create } from "zustand";
import type { ChatMessage, ChatSession } from "@/lib/types";

function uid(prefix: string): string {
  const cryptoObj =
    typeof crypto !== "undefined" ? (crypto as Crypto) : undefined;
  const rand = cryptoObj?.randomUUID
    ? cryptoObj.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `${prefix}-${rand}`;
}

function truncateTitle(text: string, max = 24): string {
  const clean = text.trim();
  return clean.length > max ? `${clean.slice(0, max)}...` : clean;
}

function daysAgo(n: number, hour = 10): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

const MODEL_CONTEXT_LIMIT: Record<string, number> = {
  "local-sft": 32_000,
  "local-rag": 128_000,
  "deployed-sft": 262_000,
  "deployed-rag": 262_000,
};

function contextLimitFor(
  provider: "local" | "deployed" | undefined,
  model: "sft" | "rag" | undefined
): number {
  return (
    MODEL_CONTEXT_LIMIT[`${provider ?? "local"}-${model ?? "sft"}`] ??
    MODEL_CONTEXT_LIMIT["local-sft"]
  );
}

const SEED_SESSIONS: ChatSession[] = [
  {
    id: "seed-1",
    title: "Jelaskan isi Putusan Nomor 1/Pid.Sus/2026/PN.KPN secara singkat",
    model: "rag",
    provider: "local",
    contextLimit: contextLimitFor("local", "rag"),
    isPinned: true,
    createdAt: daysAgo(0),
    messages: [
      {
        id: "m1",
        role: "user",
        content: "Jelaskan isi Putusan Nomor 1/Pid.Sus/2026/PN.KPN secara singkat",
      },
      {
        id: "m2",
        role: "assistant",
        content:
          "Putusan ini merupakan perkara pidana yang telah diputus oleh Pengadilan Negeri Kupang. Majelis hakim menilai berdasarkan alat bukti dan keterangan para saksi yang diajukan di persidangan.",
      },
    ],
  },
  {
    id: "seed-2",
    title: "Apa saja unsur tindak pidana perdagangan orang (TPPO)?",
    model: "sft",
    provider: "deployed",
    contextLimit: contextLimitFor("deployed", "sft"),
    createdAt: daysAgo(1),
    messages: [
      {
        id: "m3",
        role: "user",
        content: "Apa saja unsur tindak pidana perdagangan orang (TPPO)?",
      },
      {
        id: "m4",
        role: "assistant",
        content:
          "TPPO diatur dalam Undang-Undang Nomor 21 Tahun 2007. Unsur-unsurnya meliputi perekrutan, pengangkutan, penampungan, pengiriman, atau penerimaan seseorang dengan cara kekerasan, penipuan, atau penyalahgunaan kekuasaan.",
      },
    ],
  },
  {
    id: "seed-3",
    title: "Bagaimana alur sidang perkara tindak pidana korupsi (Tipikor)?",
    model: "sft",
    provider: "deployed",
    contextLimit: contextLimitFor("deployed", "sft"),
    createdAt: daysAgo(3),
    messages: [
      {
        id: "m5",
        role: "user",
        content: "Bagaimana alur sidang perkara tindak pidana korupsi (Tipikor)?",
      },
      {
        id: "m6",
        role: "assistant",
        content:
          "Alur sidang Tipikor dimulai dari tahap pembacaan dakwaan, eksepsi, tanggapan, pembuktian, hingga pembacaan putusan.",
      },
    ],
  },
  {
    id: "seed-4",
    title: "Rangkum pertimbangan hakim dalam putusan pidana terbaru",
    model: "rag",
    provider: "local",
    contextLimit: contextLimitFor("local", "rag"),
    createdAt: daysAgo(6),
    messages: [
      {
        id: "m7",
        role: "user",
        content: "Rangkum pertimbangan hakim dalam putusan pidana terbaru",
      },
      {
        id: "m8",
        role: "assistant",
        content:
          "Pertimbangan hakim meliputi kualifikasi perbuatan, kesesuaian alat bukti, serta hal yang memberatkan dan meringankan terdakwa.",
      },
    ],
  },
  {
    id: "seed-5",
    title: "Unsur-unsur tindak pidana penggelapan (Pasal 372 KUHP)",
    model: "sft",
    provider: "deployed",
    contextLimit: contextLimitFor("deployed", "sft"),
    createdAt: daysAgo(12),
    messages: [
      {
        id: "m9",
        role: "user",
        content: "Unsur-unsur tindak pidana penggelapan (Pasal 372 KUHP)",
      },
      {
        id: "m10",
        role: "assistant",
        content:
          "Penggelapan diatur dalam Pasal 372 KUHP, dengan unsur memiliki barang milik orang lain secara melawan hukum.",
      },
    ],
  },
];

interface ChatState {
  chatSessions: ChatSession[];
  activeSessionId: string | null;
  messages: ChatMessage[];
  isLoading: boolean;
  deployedContextLimit: number;

  // selectors (read-only helpers)
  activeSession: () => ChatSession | null;
  activeMessages: () => ChatMessage[];

  // actions
  setActiveSessionId: (id: string | null) => void;
  setMessages: (messages: ChatMessage[]) => void;
  setIsLoading: (loading: boolean) => void;
  newSession: () => void;
  selectSession: (id: string) => void;
  togglePin: (id: string) => void;
  deleteChat: (id: string) => void;
  getSession: (id: string) => ChatSession | null;
  setSessionModel: (id: string, model: "sft" | "rag") => void;
  setSessionProvider: (id: string, provider: "local" | "deployed") => void;
  setDeployedContextLimit: (limit: number) => void;

  // low-level message mutation used by the chat page send flow
  appendUserMessage: (sessionId: string | null, message: ChatMessage) => string;
  upsertSessionMessage: (
    sessionId: string,
    message: ChatMessage,
    options?: { removeLoading?: boolean }
  ) => void;
  setSessionTitle: (sessionId: string, title: string) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  chatSessions: SEED_SESSIONS,
  activeSessionId: null,
  messages: [],
  isLoading: false,
  deployedContextLimit: MODEL_CONTEXT_LIMIT["deployed-sft"],

  activeSession: () => {
    const { chatSessions, activeSessionId } = get();
    return (
      chatSessions.find((s) => s.id === activeSessionId) ?? null
    );
  },

  activeMessages: () => {
    const session = get().activeSession();
    return session ? session.messages : get().messages;
  },

  setActiveSessionId: (id) => set({ activeSessionId: id }),

  setMessages: (messages) => set({ messages }),

  setIsLoading: (isLoading) => set({ isLoading }),

  newSession: () =>
    set({
      activeSessionId: null,
      messages: [],
    }),

  selectSession: (id) => set({ activeSessionId: id }),

  togglePin: (id) =>
    set((state) => ({
      chatSessions: state.chatSessions.map((s) =>
        s.id === id ? { ...s, isPinned: !s.isPinned } : s
      ),
    })),

  deleteChat: (id) =>
    set((state) => {
      const chatSessions = state.chatSessions.filter((s) => s.id !== id);
      const activeSessionId =
        state.activeSessionId === id ? null : state.activeSessionId;
      return {
        chatSessions,
        activeSessionId,
        messages: activeSessionId === null ? [] : state.messages,
      };
    }),

  getSession: (id) => get().chatSessions.find((s) => s.id === id) ?? null,

  setSessionModel: (id, model) =>
    set((state) => ({
      chatSessions: state.chatSessions.map((s) =>
        s.id === id
          ? {
              ...s,
              model,
              contextLimit: contextLimitFor(s.provider ?? "local", model),
            }
          : s
      ),
    })),

  setSessionProvider: (id, provider) =>
    set((state) => ({
      chatSessions: state.chatSessions.map((s) =>
        s.id === id
          ? {
              ...s,
              provider,
              contextLimit: contextLimitFor(provider, s.model ?? "sft"),
            }
          : s
      ),
    })),

  setDeployedContextLimit: (limit) =>
    set((state) => ({
      deployedContextLimit: limit,
      chatSessions: state.chatSessions.map((s) =>
        s.provider === "deployed" ? { ...s, contextLimit: limit } : s
      ),
    })),

  appendUserMessage: (sessionId, message) => {
    let createdId: string | null = null;
    set((state) => {
      if (!sessionId) {
        // create a brand new session from the first user message
        const newSession: ChatSession = {
          id: uid("session"),
          title: truncateTitle(message.content),
          messages: [message],
          createdAt: new Date().toISOString(),
          model: "sft",
          provider: "local",
          contextLimit: contextLimitFor("local", "sft"),
        };
        createdId = newSession.id;
        return {
          chatSessions: [newSession, ...state.chatSessions],
          activeSessionId: newSession.id,
          messages: [],
        };
      }
      return {
        chatSessions: state.chatSessions.map((s) =>
          s.id === sessionId
            ? { ...s, messages: [...s.messages, message] }
            : s
        ),
      };
    });
    return createdId ?? sessionId ?? "";
  },

  upsertSessionMessage: (sessionId, message, options) =>
    set((state) => ({
      chatSessions: state.chatSessions.map((s) => {
        if (s.id !== sessionId) return s;
        let messages = s.messages;
        if (options?.removeLoading) {
          messages = messages.filter((m) => !m.isLoading);
        }
        return { ...s, messages: [...messages, message] };
      }),
    })),

  setSessionTitle: (sessionId, title) =>
    set((state) => ({
      chatSessions: state.chatSessions.map((s) =>
        s.id === sessionId ? { ...s, title } : s
      ),
    })),
}));
