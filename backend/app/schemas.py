from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, Field

MAX_DATA_URL_LENGTH = 14_000_000


class ProviderConfig(BaseModel):
    id: str
    name: str
    model: str
    base_url: str
    kind: Literal["vllm", "wandb"]
    supports_images: bool = False
    api_key_env: str | None = None
    context_window: int = 128_000


class TextPart(BaseModel):
    type: Literal["text"] = "text"
    text: str = Field(min_length=1, max_length=32_000)


class ImageUrlPart(BaseModel):
    type: Literal["image_url"] = "image_url"
    image_url: str | dict[str, str] = Field(min_length=1)


class PdfPart(BaseModel):
    type: Literal["pdf"] = "pdf"
    name: str = Field(min_length=1, max_length=255)
    data: str = Field(min_length=1, max_length=MAX_DATA_URL_LENGTH)


ContentPart = Annotated[TextPart | ImageUrlPart | PdfPart, Field(discriminator="type")]


class Message(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str | list[ContentPart]
    thinking: str | None = None


class ChatRequest(BaseModel):
    provider: str = "vllm"
    messages: list[Message] = Field(min_length=1, max_length=50)
    temperature: float = Field(default=0.6, ge=0, le=2)
    max_tokens: int = Field(default=1024, ge=1, le=4096)
    stream: bool = False


class ChatResponse(BaseModel):
    message: Message
    model: str
    provider: str


class RagIngestRequest(BaseModel):
    name: str = Field(default="dokumen.pdf", min_length=1, max_length=255)
    data: str = Field(min_length=1, max_length=MAX_DATA_URL_LENGTH)


class RagSection(BaseModel):
    key: str
    label: str
    text: str


class RagIngestResponse(BaseModel):
    id: str
    name: str
    char_count: int
    sections: list[RagSection]


class RagQueryRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2_000)
    document_ids: list[str] = Field(default_factory=list, max_length=10)
    text: str | None = Field(default=None, max_length=1_000_000)
    top_k: int = Field(default=3, ge=1, le=10)


class RagHit(BaseModel):
    key: str
    label: str
    text: str
    score: float
    reason: str


class RagQueryResponse(BaseModel):
    question: str
    hits: list[RagHit]


class PdfExtractResponse(BaseModel):
    name: str
    text: str
    char_count: int
    token_count: int


class LibrarySaveRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    data: str = Field(min_length=1, max_length=MAX_DATA_URL_LENGTH)
    size: int = Field(default=0, ge=0)
    text: str = Field(default="", max_length=1_000_000)
    token_count: int = Field(default=0, ge=0)
    chat_id: str | None = Field(default=None, max_length=255)
    project_id: str | None = Field(default=None, max_length=255)


class LibraryItem(BaseModel):
    id: str
    name: str
    type: str
    extension: str
    modified_at: str
    size_in_bytes: int
    chat_id: str | None
    storage_path: str
    token_count: int
    project_id: str | None = None
    embedding_status: str = "pending"
    embedding_model: str | None = None
    embedding_dimensions: int | None = None
    embedding_error: str | None = None

class ProjectCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    emoji: str | None = Field(default=None, max_length=16)

class ProjectUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    emoji: str | None = Field(default=None, max_length=16)
    instructions: str | None = Field(default=None, max_length=50_000)

class ProjectItem(BaseModel):
    id: str
    name: str
    emoji: str | None
    created_by: str
    modified_at: str
    chat_ids: list[str]
    file_ids: list[str]
    instructions: str | None = None
