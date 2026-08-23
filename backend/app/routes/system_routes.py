from fastapi import APIRouter, Request

from app.controllers.system_controller import health, list_models, wake_vllm

router = APIRouter()
router.add_api_route("/health", health, methods=["GET"])
router.add_api_route("/api/models", list_models, methods=["GET"])
router.add_api_route("/api/vllm/wake", wake_vllm, methods=["POST"])
