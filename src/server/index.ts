import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import Fastify from "fastify";
import { loadConfig } from "./config.js";
import { openDatabase } from "./db.js";
import { sendError } from "./errors.js";
import { OpenAIProvider } from "./providers/openaiProvider.js";
import { registerApiRoutes } from "./routes/api.js";

export async function buildServer() {
  const config = loadConfig();
  const db = openDatabase(config);
  const app = Fastify({
    logger: {
      level: config.nodeEnv === "test" ? "silent" : "info"
    },
    bodyLimit: config.maxUploadBytes + 1024 * 1024
  });

  await app.register(cors, {
    origin: [config.webOrigin, "http://localhost:5173", "http://127.0.0.1:5173"],
    credentials: true
  });
  await app.register(multipart, {
    limits: {
      fileSize: config.maxUploadBytes,
      files: 24
    }
  });

  app.setErrorHandler((error, _request, reply) => {
    if (typeof error === "object" && error !== null && "validation" in error) {
      return reply.status(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: error instanceof Error ? error.message : "Request validation failed"
        }
      });
    }
    return sendError(reply, error);
  });

  await registerApiRoutes(app, {
    config,
    db,
    openai: new OpenAIProvider(config)
  });

  app.addHook("onClose", async () => {
    db.close();
  });

  return { app, config };
}

if (process.env.NODE_ENV !== "test") {
  const { app, config } = await buildServer();
  await app.listen({ host: config.apiHost, port: config.apiPort });
}
