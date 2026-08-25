import assert from "node:assert/strict";
import test from "node:test";

import { resolveBackendUrl } from "./backend-url.ts";

test("ignores malformed App Hosting origins", () => {
  assert.equal(
    resolveBackendUrl({
      NEXT_PUBLIC_BACKEND_URL: "ttps://api.legal-verse.id",
      NEXT_PUBLIC_API_BASE_URL: "ttps://api.legal-verse.id",
      NODE_ENV: "production",
    }),
    "https://api.legal-verse.id"
  );
});

test("keeps a valid local override", () => {
  assert.equal(
    resolveBackendUrl({
      NEXT_PUBLIC_CHAT_API_URL: "http://127.0.0.1:8001/",
      NODE_ENV: "development",
    }),
    "http://127.0.0.1:8001"
  );
});
