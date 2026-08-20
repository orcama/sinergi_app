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

const DEFAULT_CONTEXT_LIMITS: Record<"local" | "deployed", number> = {
  local: 128_000,
  deployed: 262_000,
};

interface ChatState {
  chatSessions: ChatSession[];
  activeSessionId: string | null;
  messages: ChatMessage[];
  isLoading: boolean;
  providerContextLimits: Record<"local" | "deployed", number>;

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
  setProviderContextLimits: (
    limits: Partial<Record<"local" | "deployed", number>>
  ) => void;

  // low-level message mutation used by the chat page send flow
  // low-level message mutation used by the chat page send flow
  // (replaces an existing message with the same id, otherwise appends)
  appendUserMessage: (sessionId: string | null, message: ChatMessage) => string;
  upsertSessionMessage: (
    sessionId: string,
    message: ChatMessage,
    options?: { removeLoading?: boolean }
  ) => void;
  setSessionTitle: (sessionId: string, title: string) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  chatSessions: [],
  activeSessionId: null,
  messages: [],
  isLoading: false,
  providerContextLimits: { ...DEFAULT_CONTEXT_LIMITS },

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
              contextLimit:
                state.providerContextLimits[s.provider ?? "local"] ??
                DEFAULT_CONTEXT_LIMITS[s.provider ?? "local"],
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
              contextLimit:
                state.providerContextLimits[provider] ??
                DEFAULT_CONTEXT_LIMITS[provider],
            }
          : s
      ),
    })),

  setProviderContextLimits: (limits) =>
    set((state) => ({
      providerContextLimits: { ...state.providerContextLimits, ...limits },
      chatSessions: state.chatSessions.map((s) =>
        s.provider
          ? {
              ...s,
              contextLimit:
                (limits[s.provider] ?? state.providerContextLimits[s.provider]) ??
                s.contextLimit,
            }
          : s
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
          contextLimit:
            state.providerContextLimits.local ?? DEFAULT_CONTEXT_LIMITS.local,
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
        const existing = messages.find((m) => m.id === message.id);
        if (existing) {
          return {
            ...s,
            messages: messages.map((m) => (m.id === message.id ? message : m)),
          };
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
