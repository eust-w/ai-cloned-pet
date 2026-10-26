# Contributing

Small, reproducible improvements are welcome. Read the current limitations in the README before starting an animation or provider integration.

1. Use Node.js 24, `npm ci`, and `.env.example`. Keep personal credentials local.
2. Describe the observed problem, expected behavior, and proposed scope in an issue or draft PR.
3. Run `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build`.
4. For interaction changes, exercise clicks and local commands in a real browser, including a narrow viewport. Attach evidence using media you have rights to publish.
5. For provider changes, distinguish contract tests from actual paid provider runs. Report which ran and which did not. Never call an artificial response a live test.
6. Run `npm audit` and review the diff before submitting. Never include `.env`, SQLite files, raw user uploads, logs, or absolute private file paths.

Use the existing React, Fastify, TypeScript, and SQLite conventions. Keep provider calls on the server. A new asset pipeline should save raw outputs for retry, reject invalid frames, and preserve provenance.

Contributions to code/documentation are submitted under MIT. Do not submit third-party media without a separate, compatible license and provenance.
