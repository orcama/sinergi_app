from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import env_list


def register_cors(app: FastAPI) -> None:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=env_list("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000"),
        allow_credentials=False,
        allow_methods=["GET", "POST", "DELETE"],
        allow_headers=["Content-Type", "Authorization"],
    )
