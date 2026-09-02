from fastapi import APIRouter, Depends

from app.core.auth import get_current_user
from app.controllers.auth_controller import me, sync_user

router = APIRouter()


@router.post("/auth/sync")
async def sync_user_route(user: dict = Depends(get_current_user)):
    return sync_user(user)


@router.get("/auth/me")
async def me_route(user: dict = Depends(get_current_user)):
    return me(user)
