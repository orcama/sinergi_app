from fastapi import APIRouter, Request

from app.controllers.chat_controller import chat, chat_stream
from app.schemas import ChatRequest, ChatResponse

router = APIRouter()


@router.post("/api/chat", response_model=ChatResponse)
async def chat_route(body: ChatRequest, request: Request):
    return await chat(body, request)


@router.post("/api/chat/stream")
async def chat_stream_route(body: ChatRequest, request: Request):
    return await chat_stream(body, request)
