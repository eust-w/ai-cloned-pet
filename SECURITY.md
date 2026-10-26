# Security

This alpha is intended for a trusted local, single-user environment. The API has no user authentication or tenant isolation. Keep its default loopback binding; CORS is not authentication. Public hosting requires authentication, authorization, upload hardening, rate/cost limits, and an operational review.

Provider keys belong in server environment variables. Analysis and image generation send selected images to the configured external provider. Use only endpoints you trust. Local `.data` can contain personal photos and messages; protect it and its backups.

Report a reproducible security issue privately to the repository owner through a contact listed on their GitHub profile, or GitHub private vulnerability reporting if enabled. Do not post credentials, private media, or a working exploit with personal data in a public issue. There is no guaranteed response SLA during alpha.

Supported changes currently target the development branch; no stable version has been released.
