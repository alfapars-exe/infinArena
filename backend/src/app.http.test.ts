import assert from "node:assert/strict";
import test from "node:test";
import request from "supertest";
import { createHttpApp } from "@/app";
import { issueAuthToken } from "@/lib/auth/token";

const tinyPngBuffer = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Y4QAAAABJRU5ErkJggg==",
  "base64"
);

function authToken(): string {
  return issueAuthToken({
    userId: 1,
    email: "admin@example.com",
    name: "Admin",
  });
}

test("GET /api/health returns operational metadata", async () => {
  const app = await createHttpApp();
  const response = await request(app).get("/api/health").expect(200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.status, "healthy");
  assert.equal(Number.isNaN(Date.parse(String(response.body.timestamp))), false);
});

test("GET /api/openapi.json serves contract", async () => {
  const app = await createHttpApp();
  const response = await request(app).get("/api/openapi.json").expect(200);
  assert.equal(typeof response.body?.openapi, "string");
  assert.ok(response.body?.paths);
});

test("GET /api/auth/me rejects requests without bearer token", async () => {
  const app = await createHttpApp();
  const response = await request(app).get("/api/auth/me").expect(401);
  assert.equal(response.body.code, "UNAUTHORIZED");
});

test("POST /api/auth/login fails with missing credentials", async () => {
  const app = await createHttpApp();
  const response = await request(app)
    .post("/api/auth/login")
    .send({})
    .expect(401);

  assert.equal(response.body.code, "UNAUTHORIZED");
  assert.match(String(response.body.error), /invalid username or password/i);
});

test("GET /api/quizzes/:id validates numeric id before data access", async () => {
  const app = await createHttpApp();
  const response = await request(app)
    .get("/api/quizzes/not-a-number")
    .set("Authorization", `Bearer ${authToken()}`)
    .expect(400);

  assert.equal(response.body.code, "VALIDATION_ERROR");
  assert.match(String(response.body.error), /invalid quiz id/i);
});

test("DELETE /api/quizzes/:id/questions validates questionId query", async () => {
  const app = await createHttpApp();
  const response = await request(app)
    .delete("/api/quizzes/7/questions?questionId=abc")
    .set("Authorization", `Bearer ${authToken()}`)
    .expect(400);

  assert.equal(response.body.code, "VALIDATION_ERROR");
  assert.match(String(response.body.error), /invalid question id/i);
});

test("POST /api/upload rejects non-image files", async () => {
  const app = await createHttpApp();
  const response = await request(app)
    .post("/api/upload")
    .attach("file", Buffer.from("plain text", "utf8"), {
      filename: "notes.txt",
      contentType: "text/plain",
    })
    .expect(400);

  assert.match(String(response.body.error), /invalid file type/i);
});

test("POST /api/upload stores image and serves it back", async () => {
  const app = await createHttpApp();
  const uploadResponse = await request(app)
    .post("/api/upload")
    .attach("file", tinyPngBuffer, {
      filename: "tiny.png",
      contentType: "image/png",
    })
    .expect(200);

  assert.match(String(uploadResponse.body.url), /^\/api\/uploads\/.+\.png$/);
  assert.equal(typeof uploadResponse.body.absoluteUrl, "string");

  const fileResponse = await request(app).get(uploadResponse.body.url).expect(200);
  assert.match(String(fileResponse.headers["content-type"]), /^image\/png/i);
});

test("unknown routes return structured 404 payload", async () => {
  const app = await createHttpApp();
  const response = await request(app).get("/api/not-found-route").expect(404);
  assert.equal(response.body.code, "NOT_FOUND");
  assert.match(String(response.body.error), /route not found/i);
});
