from __future__ import annotations

from unittest import mock

import httpx
import pytest
from fastapi import HTTPException

from app.main import app


def _fake_user(uid: str = "uid-123", email: str = "user@example.com", name: str = "Alice") -> dict:
    return {"uid": uid, "email": email, "name": name}


def _doc(data: dict | None) -> mock.Mock:
    doc = mock.Mock()
    doc.exists = data is not None
    doc.to_dict.return_value = data or {}
    return doc


async def _get(path: str) -> httpx.Response:
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        return await client.get(path, headers={"Authorization": "Bearer fake-token"})


@pytest.mark.asyncio
async def test_sync_new_user_starts_unverified() -> None:
    ref = mock.Mock()
    ref.get.return_value = _doc(None)
    fake_db = mock.Mock()
    fake_db.collection.return_value.document.return_value = ref

    with (
        mock.patch("app.core.auth.firebase_auth.verify_id_token", return_value=_fake_user()),
        mock.patch("app.main.db", fake_db),
    ):
        response = await _get("/auth/me")

    assert response.status_code == 200
    ref.set.assert_called_once()
    updates = ref.set.call_args[0][0]
    assert updates["verified"] is False
    assert updates["role"] == "user"


@pytest.mark.asyncio
async def test_sync_existing_user_without_verified_is_auto_approved() -> None:
    ref = mock.Mock()
    ref.get.return_value = _doc({"email": "user@example.com"})  # user sebelum fitur
    fake_db = mock.Mock()
    fake_db.collection.return_value.document.return_value = ref

    with (
        mock.patch("app.core.auth.firebase_auth.verify_id_token", return_value=_fake_user()),
        mock.patch("app.main.db", fake_db),
    ):
        response = await _get("/auth/me")

    assert response.status_code == 200
    updates = ref.set.call_args[0][0]
    assert updates["verified"] is True
    assert updates["role"] == "user"


@pytest.mark.asyncio
async def test_sync_admin_from_env_is_verified_and_has_role() -> None:
    ref = mock.Mock()
    ref.get.return_value = _doc(None)
    fake_db = mock.Mock()
    fake_db.collection.return_value.document.return_value = ref

    with (
        mock.patch("app.core.auth.firebase_auth.verify_id_token", return_value=_fake_user(uid="admin-1")),
        mock.patch("app.main.db", fake_db),
        mock.patch("app.config.ADMIN_UIDS", frozenset({"admin-1"})),
    ):
        response = await _get("/auth/me")

    assert response.status_code == 200
    updates = ref.set.call_args[0][0]
    assert updates["verified"] is True
    assert updates["role"] == "admin"


@pytest.mark.asyncio
async def test_require_verified_user_allows_approved_user() -> None:
    ref = mock.Mock()
    ref.get.return_value = _doc({"verified": True, "role": "user"})
    fake_db = mock.Mock()
    fake_db.collection.return_value.document.return_value = ref

    with (
        mock.patch("app.core.auth.firebase_auth.verify_id_token", return_value=_fake_user()),
        mock.patch("app.core.firebase.db", fake_db),
    ):
        from app.core.auth import require_verified_user

        result = await require_verified_user("Bearer fake-token")

    assert result["uid"] == "uid-123"


@pytest.mark.asyncio
async def test_require_verified_user_blocks_unverified() -> None:
    ref = mock.Mock()
    ref.get.return_value = _doc({"verified": False, "role": "user"})
    fake_db = mock.Mock()
    fake_db.collection.return_value.document.return_value = ref

    with (
        mock.patch("app.core.auth.firebase_auth.verify_id_token", return_value=_fake_user()),
        mock.patch("app.core.firebase.db", fake_db),
    ):
        from app.core.auth import require_verified_user

        with pytest.raises(HTTPException) as exc:
            await require_verified_user("Bearer fake-token")
        assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_require_verified_user_allows_admin_from_env_without_doc() -> None:
    fake_db = mock.Mock()
    fake_db.collection.return_value.document.return_value.get.return_value = _doc(None)

    with (
        mock.patch("app.core.auth.firebase_auth.verify_id_token", return_value=_fake_user(uid="admin-1")),
        mock.patch("app.core.firebase.db", fake_db),
        mock.patch("app.config.ADMIN_UIDS", frozenset({"admin-1"})),
    ):
        from app.core.auth import require_verified_user

        result = await require_verified_user("Bearer fake-token")

    assert result["uid"] == "admin-1"


@pytest.mark.asyncio
async def test_require_admin_blocks_non_admin() -> None:
    ref = mock.Mock()
    ref.get.return_value = _doc({"verified": True, "role": "user"})
    fake_db = mock.Mock()
    fake_db.collection.return_value.document.return_value = ref

    with (
        mock.patch("app.core.auth.firebase_auth.verify_id_token", return_value=_fake_user()),
        mock.patch("app.core.firebase.db", fake_db),
    ):
        from app.core.auth import require_admin

        with pytest.raises(HTTPException) as exc:
            await require_admin("Bearer fake-token")
        assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_admin_approve_and_revoke() -> None:
    ref = mock.Mock()
    ref.get.return_value = _doc({"email": "user@example.com"})
    fake_db = mock.Mock()
    fake_db.collection.return_value.document.return_value = ref

    with (
        mock.patch("app.core.auth.firebase_auth.verify_id_token", return_value=_fake_user()),
        mock.patch("app.core.firebase.db", fake_db),
        mock.patch("app.main.db", fake_db),
        mock.patch("app.config.ADMIN_UIDS", frozenset({"uid-123"})),
    ):
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            response = await client.post(
                "/api/admin/users/other-uid/approve",
                headers={"Authorization": "Bearer fake-token"},
            )
            response2 = await client.post(
                "/api/admin/users/other-uid/revoke",
                headers={"Authorization": "Bearer fake-token"},
            )

    assert response.status_code == 200
    assert response.json() == {"uid": "other-uid", "verified": True}
    ref.update.assert_any_call({"verified": True})
    assert response2.status_code == 200
    ref.update.assert_any_call({"verified": False})


@pytest.mark.asyncio
async def test_admin_route_blocks_non_admin() -> None:
    ref = mock.Mock()
    ref.get.return_value = _doc({"verified": True, "role": "user"})
    fake_db = mock.Mock()
    fake_db.collection.return_value.document.return_value = ref

    with (
        mock.patch("app.core.auth.firebase_auth.verify_id_token", return_value=_fake_user()),
        mock.patch("app.core.firebase.db", fake_db),
    ):
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
        base_url="http://test",
        ) as client:
            response = await client.get(
                "/api/admin/users",
                headers={"Authorization": "Bearer fake-token"},
            )

    assert response.status_code == 403