from fastapi import APIRouter, Depends, Query

from app.core.auth import require_verified_user
from app.controllers.library_controller import library_delete, library_list, library_save
from app.schemas import LibraryItem, LibrarySaveRequest

router = APIRouter()


@router.post("/api/library", response_model=LibraryItem)
async def library_save_route(body: LibrarySaveRequest, user: dict = Depends(require_verified_user)):
    return library_save(body, user)


@router.get("/api/library")
async def library_list_route(project_id: str | None = Query(default=None), user: dict = Depends(require_verified_user)):
    return library_list(user, project_id)


@router.delete("/api/library/{file_id}")
async def library_delete_route(file_id: str, user: dict = Depends(require_verified_user)):
    return library_delete(file_id, user)
