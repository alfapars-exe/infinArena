type HttpMethod = "get" | "post" | "put" | "delete";

interface RouteDoc {
  method: HttpMethod;
  path: string;
  tag: string;
  summary: string;
  secured?: boolean;
  parameters?: Array<Record<string, unknown>>;
  requestBody?: Record<string, unknown>;
  responses?: Record<string, unknown>;
}

const jsonOkResponse = {
  "200": {
    description: "Successful response",
    content: {
      "application/json": {
        schema: { type: "object", additionalProperties: true },
      },
    },
  },
};

const authedJsonResponses = {
  ...jsonOkResponse,
  "401": {
    description: "Unauthorized",
    content: {
      "application/json": {
        schema: { $ref: "#/components/schemas/ErrorResponse" },
      },
    },
  },
};

const routes: RouteDoc[] = [
  {
    method: "get",
    path: "/api/docs",
    tag: "system",
    summary: "Swagger UI for OpenAPI document",
    responses: {
      "200": {
        description: "Swagger UI page",
        content: {
          "text/html": {
            schema: { type: "string" },
          },
        },
      },
    },
  },
  {
    method: "get",
    path: "/api/openapi.json",
    tag: "system",
    summary: "Get OpenAPI document",
    responses: {
      "200": {
        description: "OpenAPI document",
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["openapi", "info", "paths"],
              properties: {
                openapi: { type: "string" },
                info: { type: "object" },
                paths: { type: "object" },
              },
            },
          },
        },
      },
    },
  },
  {
    method: "get",
    path: "/api/health",
    tag: "system",
    summary: "Health probe",
    responses: {
      "200": {
        description: "Service health",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/HealthResponse" },
          },
        },
      },
    },
  },
  {
    method: "post",
    path: "/api/auth/login",
    tag: "auth",
    summary: "Admin login",
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/LoginRequest" },
        },
      },
    },
    responses: {
      "200": {
        description: "Successful login",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/LoginResponse" },
          },
        },
      },
      "401": {
        description: "Invalid credentials",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ErrorResponse" },
          },
        },
      },
    },
  },
  {
    method: "get",
    path: "/api/auth/me",
    tag: "auth",
    summary: "Current admin profile",
    secured: true,
    responses: {
      ...authedJsonResponses,
      "200": {
        description: "Current admin profile",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/MeResponse" },
          },
        },
      },
    },
  },
  {
    method: "post",
    path: "/api/auth/logout",
    tag: "auth",
    summary: "Admin logout",
    secured: true,
    responses: authedJsonResponses,
  },
  {
    method: "post",
    path: "/api/upload",
    tag: "media",
    summary: "Upload image file",
    requestBody: {
      required: true,
      content: {
        "multipart/form-data": {
          schema: {
            type: "object",
            required: ["file"],
            properties: { file: { type: "string", format: "binary" } },
          },
        },
      },
    },
    responses: {
      "200": {
        description: "Upload result",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/UploadResponse" },
          },
        },
      },
      "400": {
        description: "Invalid upload",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ErrorResponse" },
          },
        },
      },
    },
  },
  {
    method: "get",
    path: "/api/uploads/{filename}",
    tag: "media",
    summary: "Get uploaded file",
    parameters: [
      {
        name: "filename",
        in: "path",
        required: true,
        schema: { type: "string" },
      },
    ],
    responses: {
      "200": {
        description: "Binary file",
        content: {
          "application/octet-stream": {
            schema: { type: "string", format: "binary" },
          },
        },
      },
      "400": {
        description: "Invalid filename",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ErrorResponse" },
          },
        },
      },
      "404": {
        description: "File not found",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ErrorResponse" },
          },
        },
      },
    },
  },
  {
    method: "get",
    path: "/api/sessions/{pin}",
    tag: "sessions",
    summary: "Lookup session by PIN",
    parameters: [
      { name: "pin", in: "path", required: true, schema: { type: "string", minLength: 6, maxLength: 6 } },
    ],
    responses: jsonOkResponse,
  },
  {
    method: "post",
    path: "/api/sessions/{pin}/live",
    tag: "sessions",
    summary: "Mark session live",
    secured: true,
    parameters: [
      { name: "pin", in: "path", required: true, schema: { type: "string", minLength: 6, maxLength: 6 } },
    ],
    responses: authedJsonResponses,
  },
  { method: "get", path: "/api/quizzes", tag: "quizzes", summary: "List quizzes", secured: true, responses: authedJsonResponses },
  {
    method: "post",
    path: "/api/quizzes",
    tag: "quizzes",
    summary: "Create quiz",
    secured: true,
    requestBody: {
      required: true,
      content: { "application/json": { schema: { $ref: "#/components/schemas/QuizPayload" } } },
    },
    responses: {
      ...authedJsonResponses,
      "201": {
        description: "Created",
        content: { "application/json": { schema: { type: "object", additionalProperties: true } } },
      },
    },
  },
  {
    method: "get",
    path: "/api/quizzes/{id}",
    tag: "quizzes",
    summary: "Get quiz details",
    secured: true,
    parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } }],
    responses: authedJsonResponses,
  },
  {
    method: "put",
    path: "/api/quizzes/{id}",
    tag: "quizzes",
    summary: "Update quiz",
    secured: true,
    parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } }],
    requestBody: {
      required: true,
      content: { "application/json": { schema: { $ref: "#/components/schemas/QuizPayload" } } },
    },
    responses: authedJsonResponses,
  },
  {
    method: "delete",
    path: "/api/quizzes/{id}",
    tag: "quizzes",
    summary: "Delete quiz",
    secured: true,
    parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } }],
    responses: authedJsonResponses,
  },
  {
    method: "post",
    path: "/api/quizzes/{id}/questions",
    tag: "quizzes",
    summary: "Create question",
    secured: true,
    parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } }],
    requestBody: {
      required: true,
      content: { "application/json": { schema: { $ref: "#/components/schemas/QuestionPayload" } } },
    },
    responses: {
      ...authedJsonResponses,
      "201": {
        description: "Created",
        content: { "application/json": { schema: { type: "object", additionalProperties: true } } },
      },
    },
  },
  {
    method: "put",
    path: "/api/quizzes/{id}/questions",
    tag: "quizzes",
    summary: "Update question",
    secured: true,
    parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } }],
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: {
            allOf: [
              { $ref: "#/components/schemas/QuestionPayload" },
              { type: "object", required: ["questionId"], properties: { questionId: { type: "integer", minimum: 1 } } },
            ],
          },
        },
      },
    },
    responses: authedJsonResponses,
  },
  {
    method: "delete",
    path: "/api/quizzes/{id}/questions",
    tag: "quizzes",
    summary: "Delete question",
    secured: true,
    parameters: [
      { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } },
      { name: "questionId", in: "query", required: true, schema: { type: "integer", minimum: 1 } },
    ],
    responses: authedJsonResponses,
  },
  {
    method: "post",
    path: "/api/quizzes/{id}/publish",
    tag: "quizzes",
    summary: "Publish quiz",
    secured: true,
    parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } }],
    responses: authedJsonResponses,
  },
  {
    method: "get",
    path: "/api/quizzes/{id}/export",
    tag: "exports",
    summary: "Export quiz",
    secured: true,
    parameters: [
      { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } },
      { name: "format", in: "query", required: false, schema: { type: "string", enum: ["excel", "word"] } },
    ],
    responses: {
      "200": {
        description: "Binary export",
        content: {
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
            schema: { type: "string", format: "binary" },
          },
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
            schema: { type: "string", format: "binary" },
          },
        },
      },
      "401": authedJsonResponses["401"],
    },
  },
  {
    method: "get",
    path: "/api/quizzes/{id}/results",
    tag: "quizzes",
    summary: "Get quiz results",
    secured: true,
    parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } }],
    responses: authedJsonResponses,
  },
  {
    method: "post",
    path: "/api/quizzes/{id}/sessions/{sessionId}/terminate",
    tag: "sessions",
    summary: "Terminate session",
    secured: true,
    parameters: [
      { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } },
      { name: "sessionId", in: "path", required: true, schema: { type: "integer", minimum: 1 } },
    ],
    responses: authedJsonResponses,
  },
  {
    method: "get",
    path: "/api/quizzes/{id}/results/export",
    tag: "exports",
    summary: "Export results",
    secured: true,
    parameters: [
      { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } },
      { name: "sessionId", in: "query", required: false, schema: { type: "integer", minimum: 1 } },
    ],
    responses: {
      "200": {
        description: "Binary export",
        content: {
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
            schema: { type: "string", format: "binary" },
          },
        },
      },
      "401": authedJsonResponses["401"],
    },
  },
  {
    method: "get",
    path: "/api/quizzes/{id}/sessions/{sessionId}/results/export",
    tag: "exports",
    summary: "Export session results",
    secured: true,
    parameters: [
      { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } },
      { name: "sessionId", in: "path", required: true, schema: { type: "integer", minimum: 1 } },
    ],
    responses: {
      "200": {
        description: "Binary export",
        content: {
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
            schema: { type: "string", format: "binary" },
          },
        },
      },
      "401": authedJsonResponses["401"],
    },
  },
  {
    method: "post",
    path: "/api/ai/generate-quiz",
    tag: "ai",
    summary: "Generate quiz with AI",
    secured: true,
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/AIGeneratePayload" },
        },
      },
    },
    responses: {
      ...authedJsonResponses,
      "201": jsonOkResponse["200"],
      "502": {
        description: "AI upstream error",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ErrorResponse" },
          },
        },
      },
    },
  },
];

const paths = routes.reduce<Record<string, Record<string, unknown>>>((acc, route) => {
  if (!acc[route.path]) {
    acc[route.path] = {};
  }

  const operation: Record<string, unknown> = {
    tags: [route.tag],
    summary: route.summary,
    responses: route.responses || jsonOkResponse,
  };

  if (route.secured) {
    operation.security = [{ bearerAuth: [] }];
  }
  if (route.parameters) {
    operation.parameters = route.parameters;
  }
  if (route.requestBody) {
    operation.requestBody = route.requestBody;
  }

  acc[route.path][route.method] = operation;
  return acc;
}, {});

export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "infinArena Backend API",
    version: "2.0.0",
    description:
      "Source-of-truth OpenAPI contract for backend HTTP endpoints. This spec is contract-tested against Express routes.",
  },
  servers: [{ url: "http://localhost:7860", description: "Local development" }],
  tags: [
    { name: "system", description: "Operational endpoints" },
    { name: "auth", description: "Admin authentication endpoints" },
    { name: "media", description: "Upload and file delivery endpoints" },
    { name: "sessions", description: "Session lifecycle endpoints" },
    { name: "quizzes", description: "Quiz authoring and management endpoints" },
    { name: "exports", description: "Document export endpoints" },
    { name: "ai", description: "AI-backed quiz generation endpoint" },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "Token",
      },
    },
    schemas: {
      ErrorResponse: {
        type: "object",
        required: ["error", "code"],
        properties: {
          error: { type: "string" },
          code: { type: "string" },
          details: {},
        },
      },
      HealthResponse: {
        type: "object",
        required: ["ok", "status", "timestamp"],
        properties: {
          ok: { type: "boolean" },
          status: { type: "string", enum: ["healthy"] },
          timestamp: { type: "string", format: "date-time" },
        },
      },
      LoginRequest: {
        type: "object",
        required: ["username", "password"],
        properties: {
          username: { type: "string", minLength: 1 },
          password: { type: "string", minLength: 1 },
        },
      },
      LoginResponse: {
        type: "object",
        required: ["token", "user"],
        properties: {
          token: { type: "string" },
          user: {
            type: "object",
            required: ["id", "email", "name", "username"],
            properties: {
              id: { type: "integer", minimum: 1 },
              email: { type: "string" },
              name: { type: "string" },
              username: { type: "string" },
            },
          },
        },
      },
      MeResponse: {
        type: "object",
        required: ["user"],
        properties: {
          user: {
            type: "object",
            required: ["id", "email", "name", "username"],
            properties: {
              id: { type: "integer", minimum: 1 },
              email: { type: "string" },
              name: { type: "string" },
              username: { type: "string" },
            },
          },
        },
      },
      UploadResponse: {
        type: "object",
        required: ["url", "absoluteUrl"],
        properties: {
          url: { type: "string", pattern: "^/api/uploads/" },
          absoluteUrl: { type: "string", format: "uri" },
        },
      },
      QuizPayload: {
        type: "object",
        required: ["title"],
        properties: {
          title: { type: "string", minLength: 1, maxLength: 200 },
          description: { type: "string", maxLength: 500, nullable: true },
          customSlug: { type: "string", minLength: 3, maxLength: 50, nullable: true },
        },
      },
      QuestionPayload: {
        type: "object",
        required: [
          "questionText",
          "questionType",
          "timeLimitSeconds",
          "basePoints",
          "deductionPoints",
          "deductionInterval",
          "choices",
        ],
        properties: {
          questionText: { type: "string", minLength: 1, maxLength: 500 },
          questionType: { type: "string" },
          timeLimitSeconds: { type: "integer", minimum: 5, maximum: 120 },
          basePoints: { type: "integer", minimum: 100, maximum: 5000 },
          deductionPoints: { type: "integer", minimum: 0, maximum: 1000 },
          deductionInterval: { type: "integer", minimum: 1, maximum: 60 },
          mediaUrl: { type: "string", nullable: true },
          backgroundUrl: { type: "string", nullable: true },
          choices: {
            type: "array",
            minItems: 1,
            maxItems: 8,
            items: {
              type: "object",
              required: ["choiceText", "isCorrect"],
              properties: {
                choiceText: { type: "string", minLength: 1, maxLength: 200 },
                isCorrect: { type: "boolean" },
              },
            },
          },
        },
      },
      AIGeneratePayload: {
        type: "object",
        required: ["topic", "numQuestions"],
        properties: {
          topic: { type: "string", minLength: 1 },
          difficulty: { type: "string" },
          numQuestions: { type: "integer", minimum: 1, maximum: 50 },
          model: { type: "string" },
          language: { type: "string" },
          timeLimitSeconds: { type: "integer", minimum: 5, maximum: 120 },
        },
      },
    },
  },
  paths,
} as const;

export type OpenApiDocument = typeof openApiDocument;
