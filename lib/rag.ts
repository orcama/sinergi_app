const RAG_API_URL =
  process.env.NEXT_PUBLIC_CHAT_API_URL ?? "http://127.0.0.1:8001";

export interface RagSection {
  key: string;
  label: string;
  text: string;
}

export interface RagDoc {
  id: string;
  name: string;
  char_count: number;
  sections: RagSection[];
}

export interface RagHit {
  key: string;
  label: string;
  text: string;
  score: number;
  reason: string;
}

function toDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`Gagal membaca file ${file.name}`));
    reader.readAsDataURL(file);
  });
}

export async function ingestPdf(file: File): Promise<RagDoc> {
  const data = await toDataUrl(file);
  const response = await fetch(`${RAG_API_URL}/api/rag/ingest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: file.name, data }),
  });
  const payload = (await response.json().catch(() => null)) as
    | RagDoc
    | { detail?: string }
    | null;
  if (!response.ok) {
    throw new Error(
      (payload as { detail?: string })?.detail ??
        `RAG ingest returned ${response.status}`
    );
  }
  return payload as RagDoc;
}

export interface ExtractedPdfText {
  name: string;
  text: string;
  char_count: number;
  token_count: number;
}

/** Extract the raw PDF text server-side (PyMuPDF) and return it. */
export async function extractPdfText(file: File): Promise<ExtractedPdfText> {
  const data = await toDataUrl(file);
  const response = await fetch(`${RAG_API_URL}/api/pdf/extract`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: file.name, data }),
  });
  const payload = (await response.json().catch(() => null)) as
    | ExtractedPdfText
    | { detail?: string }
    | null;
  if (!response.ok) {
    throw new Error(
      (payload as { detail?: string })?.detail ??
        `PDF extract returned ${response.status}`
    );
  }
  return payload as ExtractedPdfText;
}

export async function queryRag(
  question: string,
  documentIds: string[],
  topK = 3,
  text?: string
): Promise<RagHit[]> {
  const response = await fetch(`${RAG_API_URL}/api/rag/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question,
      document_ids: documentIds,
      top_k: topK,
      ...(text ? { text } : {}),
    }),
  });
  const payload = (await response.json().catch(() => null)) as
    | { hits?: RagHit[]; detail?: string }
    | null;
  if (!response.ok) {
    throw new Error(
      payload?.detail ?? `RAG query returned ${response.status}`
    );
  }
  return payload?.hits ?? [];
}

/** Flatten retrieved sections into a compact, readable context blob. */
export function hitsToContext(hits: RagHit[], maxChars = 6000): string {
  let used = 0;
  const parts: string[] = [];
  for (const hit of hits) {
    const block = `[${hit.label} | relevansi ${hit.score.toFixed(2)}]\n${hit.text.trim()}`;
    if (used + block.length > maxChars) break;
    parts.push(block);
    used += block.length;
  }
  return parts.join("\n\n");
}
