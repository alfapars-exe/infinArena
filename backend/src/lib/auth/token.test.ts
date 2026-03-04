import test from "node:test";
import assert from "node:assert/strict";
import { issueAuthToken, verifyAuthToken } from "@/lib/auth/token";

test("issueAuthToken + verifyAuthToken returns payload", () => {
  const token = issueAuthToken(
    { userId: 42, email: "admin@example.com", name: "Admin" },
    60
  );

  const payload = verifyAuthToken(token);
  assert.ok(payload);
  assert.equal(payload.userId, 42);
  assert.equal(payload.email, "admin@example.com");
  assert.equal(payload.name, "Admin");
  assert.ok(payload.exp > payload.iat);
});

test("verifyAuthToken rejects tampered token", () => {
  const token = issueAuthToken(
    { userId: 7, email: "admin@example.com", name: "Admin" },
    60
  );

  const [payload, signature] = token.split(".");
  const tampered = `${payload}.${signature.slice(0, -1)}x`;
  const verified = verifyAuthToken(tampered);
  assert.equal(verified, null);
});

test("verifyAuthToken rejects expired token", async () => {
  const token = issueAuthToken(
    { userId: 99, email: "admin@example.com", name: "Admin" },
    1
  );

  await new Promise((resolve) => setTimeout(resolve, 1100));
  const verified = verifyAuthToken(token);
  assert.equal(verified, null);
});
