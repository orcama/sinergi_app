from fastapi import APIRouter, Depends, Request

from app.controllers.chat_controller import (
    chat,
    chat_session_delete,
    chat_session_get,
    chat_session_list,
    chat_session_save,
    chat_stream,
)
from app.core.auth import get_current_user
from app.schemas import ChatRequest, ChatResponse, ChatSessionItem, ChatSessionSaveRequest

router = APIRouter()


@router.post("/api/chat", response_model=ChatResponse)
async def chat_route(body: ChatRequest, request: Request):
    return await chat(body, request)


@router.post("/api/chat/stream")
async def chat_stream_route(body: ChatRequest, request: Request):
    return await chat_stream(body, request)


@router.get("/api/chats")
async def chat_session_list_route(user: dict = Depends(get_current_user)):
    return chat_session_list(user)


@router.post("/api/chats", response_model=ChatSessionItem)
async def chat_session_save_route(body: ChatSessionSaveRequest, user: dict = Depends(get_current_user)):
    return chat_session_save(body, user)


@router.get("/api/chats/{chat_id}", response_model=ChatSessionItem)
async def chat_session_get_route(chat_id: str, user: dict = Depends(get_current_user)):
    return chat_session_get(chat_id, user)


@router.delete("/api/chats/{chat_id}")
async def chat_session_delete_route(chat_id: str, user: dict = Depends(get_current_user)):
    return chat_session_delete(chat_id, user)