/**
 * OpenTelemetry tracing initialization.
 * Must be imported BEFORE any other modules (import order matters).
 *
 * Usage:
 *   Set OTEL_EXPORTER_OTLP_ENDPOINT to enable (e.g. http://tempo:4318)
 *   Defaults to noop if not configured.
 */

import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";
import { createLogger } from "@/lib/logger";

const log = createLogger("Tracing");

const OTEL_ENDPOINT = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

let sdk: NodeSDK | null = null;

export function initTracing(): void {
  if (!OTEL_ENDPOINT) {
    log.info("OTEL_EXPORTER_OTLP_ENDPOINT not set — tracing disabled");
    return;
  }

  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME || "infinarena-backend",
    [ATTR_SERVICE_VERSION]: process.env.npm_package_version || "0.0.0",
    "deployment.environment": process.env.NODE_ENV || "development",
    "host.name": process.env.HOSTNAME || "unknown",
  });

  const traceExporter = new OTLPTraceExporter({
    url: `${OTEL_ENDPOINT}/v1/traces`,
  });

  sdk = new NodeSDK({
    resource,
    traceExporter,
    instrumentations: [
      getNodeAutoInstrumentations({
        // Disable fs instrumentation (too noisy)
        "@opentelemetry/instrumentation-fs": { enabled: false },
        // Auto-instrument HTTP, Express, ioredis, pg
        "@opentelemetry/instrumentation-http": { enabled: true },
        "@opentelemetry/instrumentation-express": { enabled: true },
        "@opentelemetry/instrumentation-ioredis": { enabled: true },
        "@opentelemetry/instrumentation-pg": { enabled: true },
      }),
    ],
  });

  sdk.start();
  log.info(`OpenTelemetry tracing enabled → ${OTEL_ENDPOINT}`);
}

export async function shutdownTracing(): Promise<void> {
  if (sdk) {
    try {
      await sdk.shutdown();
      log.info("OpenTelemetry SDK shut down");
    } catch (err) {
      log.warn("Error shutting down OpenTelemetry SDK", err);
    }
  }
}
