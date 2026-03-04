import assert from "node:assert/strict";
import test from "node:test";
import SwaggerParser from "@apidevtools/swagger-parser";
import { createHttpApp } from "@/app";
import { openApiDocument } from "@/openapi";

type RouteMethod = "get" | "post" | "put" | "delete";

function normalizeExpressPath(path: string): string {
  return path.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
}

function collectExpressRoutes(): Set<string> {
  const app = createHttpApp();
  const stack = ((app as any)._router?.stack ?? []) as Array<{
    route?: {
      path?: unknown;
      methods?: Record<string, boolean>;
    };
  }>;

  const allowedMethods = new Set<RouteMethod>(["get", "post", "put", "delete"]);
  const routes = new Set<string>();

  for (const layer of stack) {
    if (!layer.route || typeof layer.route.path !== "string" || !layer.route.methods) {
      continue;
    }

    const path = normalizeExpressPath(layer.route.path);
    for (const method of Object.keys(layer.route.methods)) {
      const normalizedMethod = method.toLowerCase() as RouteMethod;
      if (!allowedMethods.has(normalizedMethod)) continue;
      routes.add(`${normalizedMethod} ${path}`);
    }
  }

  return routes;
}

function collectDocumentedRoutes(): Set<string> {
  const allowedMethods = new Set<RouteMethod>(["get", "post", "put", "delete"]);
  const routes = new Set<string>();

  for (const [path, methods] of Object.entries(openApiDocument.paths)) {
    for (const method of Object.keys(methods)) {
      const normalizedMethod = method.toLowerCase() as RouteMethod;
      if (!allowedMethods.has(normalizedMethod)) continue;
      routes.add(`${normalizedMethod} ${path}`);
    }
  }

  return routes;
}

test("OpenAPI document is valid", async () => {
  await SwaggerParser.validate(JSON.parse(JSON.stringify(openApiDocument)));
});

test("every Express route is covered by OpenAPI", () => {
  const implementedRoutes = collectExpressRoutes();
  const documentedRoutes = collectDocumentedRoutes();

  const missingInDocs = [...implementedRoutes].filter((route) => !documentedRoutes.has(route));
  const staleInDocs = [...documentedRoutes].filter((route) => !implementedRoutes.has(route));

  assert.deepEqual(
    missingInDocs,
    [],
    `Undocumented routes found: ${missingInDocs.join(", ")}`
  );
  assert.deepEqual(
    staleInDocs,
    [],
    `Stale documented routes found: ${staleInDocs.join(", ")}`
  );
});
