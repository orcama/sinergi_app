from fastapi import APIRouter, Depends
from app.core.auth import require_verified_user
from app.controllers.project_controller import project_create, project_delete, project_get, project_list, project_update
from app.schemas import ProjectCreateRequest, ProjectItem, ProjectUpdateRequest
router = APIRouter(prefix="/api/projects")
@router.get("")
async def project_list_route(user: dict = Depends(require_verified_user)): return project_list(user)
@router.post("", response_model=ProjectItem)
async def project_create_route(body: ProjectCreateRequest, user: dict = Depends(require_verified_user)): return project_create(body, user)
@router.get("/{project_id}", response_model=ProjectItem)
async def project_get_route(project_id: str, user: dict = Depends(require_verified_user)): return project_get(project_id, user)
@router.patch("/{project_id}", response_model=ProjectItem)
async def project_update_route(project_id: str, body: ProjectUpdateRequest, user: dict = Depends(require_verified_user)): return project_update(project_id, body, user)
@router.delete("/{project_id}")
async def project_delete_route(project_id: str, user: dict = Depends(require_verified_user)): return project_delete(project_id, user)
