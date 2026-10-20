This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

Use Node.js **22.23.3**, pinned in `.nvmrc`, and **pnpm 10.10.0**, declared
in `package.json`. With nvm installed, run `nvm install` and `nvm use` (or
`nvm install 22.23.3` and `nvm use 22.23.3` with nvm-windows).
The `engines` range permits compatible Node 22 patches from this baseline;
it does not install or select Node. Configure CI to use `.nvmrc` explicitly.

Install the locked dependencies with `pnpm install --frozen-lockfile`.

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Production build

```bash
pnpm build
pnpm start
```

`pnpm build` runs `prisma generate --config prisma7.config.ts` before
`next build`. A generation failure stops compilation. This explicit sequence
does not depend on install hooks or automatic pre/post-script execution.
The generated client in `src/generated/prisma` is intentionally ignored by
Git, so build environments must install development dependencies, including
the Prisma CLI. Do not rely on a previously generated local client.

Client generation reads the schema and writes generated code; it does not
apply migrations, seed records, or connect to MySQL. Database migrations are
a separate, controlled deployment step and are not part of `pnpm build`.

The server modules validate `DATABASE_URL` and `BETTER_AUTH_SECRET` when
imported. Provide them through protected build and runtime environment
configuration, along with the environment-specific `BETTER_AUTH_URL` (HTTPS
in production). Never use `NEXT_PUBLIC_` for credentials or auth secrets, and
never commit secret environment files. These requirements come from server
initialization, not Prisma client generation. `SHADOW_DATABASE_URL` belongs
to development migration tooling and is not required for generation or the
production runtime.

The current `next/font/google` imports download Geist fonts during the build.
Build workers need HTTPS access to Google Fonts and its font-file hosts;
the built application serves the fonts locally afterward. An offline build
has not been established. Production builds must finish successfully before
running `pnpm start`; an interrupted compile is not a successful build.

## Custom mutation request origins

Finance and Health mutations require an authenticated session and a trusted
browser origin. Set server-only `BETTER_AUTH_URL` to the canonical application
origin, including scheme and any non-default port (for local development,
`http://localhost:3000`). There is no implicit localhost or request-host fallback;
missing or invalid canonical configuration rejects authenticated mutations in
every environment, including production.

Additional origins reuse Better Auth's existing `BETTER_AUTH_TRUSTED_ORIGINS`
environment variable: a comma-separated list of exact HTTP(S) origins, with no
spaces, empty entries, wildcards, credentials, paths, queries or fragments.
For example: `https://app.example.com,https://preview.example.com`.
An optional root `/` is accepted, and URL normalization handles hostname case
and default ports. Invalid entries reject the entire custom mutation policy.
Preview and alternate origins must be explicitly listed; configuring them does
not enable CORS or change cookies. Better Auth retains its own validation rules.

Custom mutations require an allowlisted `Origin`, or a valid HTTP(S) `Referer`
with an allowlisted origin only when `Origin` is absent. A present invalid,
untrusted or `null` Origin never falls back to Referer. Missing both headers is
rejected. `Sec-Fetch-Site: cross-site` and unrecognized values of that header are rejected
even for allowlisted origins; `same-site` alone never establishes trust.
Host and proxy-forwarded headers are never used to build the allowlist.

Origin rejection returns a private, non-cacheable HTTP 403 `UNTRUSTED_ORIGIN`
without exposing the allowlist. Authentication still runs first, so signed-out
requests retain HTTP 401. Read-only endpoints need no Origin header. Non-browser
clients using these session-based mutations must supply trusted origin evidence;
future headerless server-to-server access needs separate authentication.

## MySQL TLS configuration

The runtime Prisma MariaDB adapter receives TLS options directly; SSL query
parameters in `DATABASE_URL` do not configure this application. Keep the provider's
DNS hostname in that URL so it can be checked against the server certificate.
The pool limit remains five connections per application process.

| Environment | `DATABASE_SSL_MODE` | Behavior |
| --- | --- | --- |
| Non-production | omitted or `disable` | TLS disabled, preserving local MySQL defaults |
| Non-production | `verify` | TLS with certificate-chain and hostname verification |
| Production | omitted or `verify` | TLS with certificate-chain and hostname verification |
| Production | `disable` | Configuration error; no adapter is created |
| Any | any other value, including an empty string | Configuration error |

`verify` is the only TLS-enabled mode; there is no encryption-only or
trust-all mode. The adapter always passes `rejectUnauthorized: true` for TLS
and leaves the connector's default hostname verifier enabled. Changing a URL
query parameter cannot turn these checks off. Fix a certificate or hostname
error rather than disabling verification.

`DATABASE_SSL_CA` is optional for providers using a CA trusted by Node.js.
When omitted in verified mode, the adapter explicitly supplies Node's current
default CA set using the pinned Node runtime. This also prevents the installed
connector from switching to its MariaDB-specific fingerprint authentication
fallback. The adapter does not override the expected hostname or identity check.

For a custom CA, supply the complete PEM certificate or certificate bundle as
`DATABASE_SSL_CA`, including every `BEGIN CERTIFICATE` / `END CERTIFICATE` line.
Real multiline values and literal `\n` or `\r\n` sequences are supported.
Certificates are parsed as X.509 before adapter creation; malformed, empty or
mixed-content bundles fail with a generic configuration error. No certificate
contents are logged. A supplied bundle replaces the default trust set for this
connection; it is not a certificate-file path or a client private key.
Supplying a CA while TLS is disabled also fails, rather than ignoring it.
PEM validation does not prove a live server's identity; the connection handshake
still must validate the chain, validity period and hostname.

To test verified TLS locally, use a TLS-capable test MySQL server, set
`DATABASE_SSL_MODE=verify`, and provide `DATABASE_SSL_CA` if its CA is not already
trusted. Leave both variables unset for the current local MySQL setup.

### Aiven and Vercel setup, when provisioned

Aiven MySQL's documented `VERIFY_CA` and `VERIFY_IDENTITY` modes require the
**Aiven project CA certificate**. For this application, configure that project
CA in `DATABASE_SSL_CA` and use `verify` (which retains hostname verification).
Download the CA from the service's **Overview → Connection information →
CA Certificate → Download**. During CA rotation, use the current provider bundle
and update it before the old CA stops being accepted. See
[Aiven certificate requirements and download instructions](https://aiven.io/docs/platform/concepts/tls-ssl-certificates).

Later, in Vercel Project Settings → Environment Variables, configure the
environment-specific `DATABASE_URL`, set `DATABASE_SSL_MODE=verify` (or omit it
for the production default), and paste the complete provider PEM bundle into
`DATABASE_SSL_CA`. Scope values to the intended deployment environments and
redeploy after changing them. Do not put certificate files in Git or use a
developer's Windows certificate path. See
[Vercel environment variables](https://vercel.com/docs/environment-variables).

All database variables are server-only and must never use `NEXT_PUBLIC_`.
Do not commit credentials, CA files or secret environment files. No hosted
service has been provisioned or tested by this configuration change.

Prisma client generation reads `prisma7.config.ts` and the schema, not the
runtime TLS helper; it requires neither TLS variables nor database connectivity.
`pnpm build` still generates the client before Next.js compilation. Server
imports validate runtime configuration during the Next.js build, so any TLS
variables supplied there must be valid; no database connection is opened by
constructing the adapter. Prisma CLI migrations use a separate connection path
and need their own verified provider TLS setup before any future migration;
these runtime variables do not configure the CLI or apply migrations.

## Public authentication deployment

`BETTER_AUTH_URL` must be an explicitly configured canonical HTTP(S) origin.
Local development continues to use `http://localhost:3000`; actual production
runtime requires HTTPS. Production additional origins must also use HTTPS.
No domain is hardcoded or inferred from Host, forwarded-host or Vercel preview
headers. Missing or invalid configuration fails closed, without echoing its
contents. `BETTER_AUTH_SECRET` is required, and production requires at least
32 characters: supply a securely generated random secret, never a sample value.
Keep it stable between deployments unless intentionally rotating sessions.

Better Auth and the Finance/Health mutation guard use the same pure origin
parser and allowlist builder. `BETTER_AUTH_TRUSTED_ORIGINS` remains an explicit
comma-separated list; normalized entries are deduplicated. Wildcards (including
encoded wildcard hostnames), credentials, paths, queries and fragments are
rejected. Do not add a wildcard for Vercel previews; configure each approved
HTTPS origin explicitly. Configuring another origin does not share cookies
between domains or enable arbitrary credentialed CORS.

### Local builds versus production runtime

`next.config.ts` uses Next's documented configuration-function `phase` argument
to set an internal, process-only `LIFEOS_NEXT_PHASE` marker. Build workers inherit
it. Only the production-build phase permits HTTP origins with an exact loopback
hostname (`localhost`, `127.0.0.1` or `[::1]`), so an ordinary `pnpm build` using
the existing local environment still works. Public HTTP origins remain invalid
during builds. The dev/server config callback overwrites the marker on startup,
and a cold serverless runtime without the marker enforces HTTPS.

**Do not configure `LIFEOS_NEXT_PHASE` in Vercel, shell profiles or environment
files.** It is internal lifecycle context, not an authentication bypass setting.
It must never be added to Next's `env` config, which would inline a build-time
exception into deployed code. See [Next configuration phases](https://nextjs.org/docs/app/api-reference/config/next-config-js#phase).
An additional Better Auth before-hook rechecks production HTTPS for actual auth
operations without any build exception. Even an accidentally retained phase
marker cannot permit production HTTP signup, sign-in or session access.

A successful localhost production build does not make HTTP `next start` an
approved production authentication environment. For HTTP localhost use
`pnpm dev`; production-server testing requires an HTTPS origin and endpoint.
Configure the final canonical HTTPS URL and protected server secrets for the
intended Vercel environments before deployment. No actual `.env` is modified
by these checks and none of these variables should use `NEXT_PUBLIC_`.

### Cookies, signup and recovery

Production cookies explicitly use Secure, HttpOnly and SameSite=Lax. They remain
host-only, with cross-subdomain sharing disabled. Better Auth selects its own
cookie names and Secure prefixes; no domain or name overrides are configured.
Local HTTP development keeps non-Secure cookies. CSRF/origin checks remain
enabled, and request-host proxy inference is disabled. Session durations,
signup auto-sign-in and logout/revocation behavior retain their existing defaults.

Public email/password signup stays enabled. Passwords remain 8–128 characters;
email uniqueness is enforced by Better Auth and the existing MySQL unique index.
Dashboard and API session checks and Health/Finance ownership filtering remain
unchanged. See [Better Auth cookies](https://better-auth.com/docs/concepts/cookies).

Email delivery is **not configured**. Verification and password-reset endpoints
exist in the installed library, but their send operations are unavailable without
senders. Email verification is not mandatory, and users can currently register
and sign in with an unverified email. Before calling public registration fully
production-ready, select an email provider and implement verified ownership,
verification/resend and recovery UI, expiry/replay tests, abuse controls and
privacy-safe delivery diagnostics. Never log tokens or verification/reset URLs.

On a real HTTPS deployment, inspect signup/sign-in and logout Set-Cookie headers
in browser developer tools. Record only Secure, HttpOnly, SameSite, Path and
whether Domain is absent; confirm logout invalidates the session. Never paste
cookie values or unredacted network captures into reports. Configuration and
memory-adapter tests do not establish real browser or production HTTPS behavior.

### Authentication rate limits and deployment gates

Production explicitly enables Better Auth's shared MySQL rate limiter. Limits
apply to the resolved client IP and normalized auth path across instances:

| Auth path | Requests | Window |
| --- | --- | --- |
| `/sign-up/email` | 3 | 300 seconds |
| `/sign-in/email` | 3 | 60 seconds |
| `/request-password-reset` | 3 | 300 seconds |
| `/reset-password` | 3 | 300 seconds |
| `/send-verification-email` | 3 | 300 seconds |
| `/verify-email` | 10 | 60 seconds |
| Other auth paths | 100 | 60 seconds |

The email-related limits do not enable email delivery. Development retains
disabled rate limiting. The installed library returns HTTP 429 with
`X-Retry-After` when a limit is reached. See [Better Auth rate limiting](https://better-auth.com/docs/concepts/rate-limit).

Better Auth and its Prisma adapter are **1.7.10**, with Prisma **7.10.1**.
`RateLimit` maps to `rate_limit`; its unique `key` prevents competing first
requests from creating independent counters. `lastRequest` is a millisecond
`BigInt`, indexed for cleanup. Deploy migration
`20261021000000_auth_rate_limit` before deploying this configuration; it adds
only this table. This task applied it only to loopback MySQL, never a hosted DB.

A real MySQL concurrency test exposed an installed adapter defect: guarded
`update()` calls could return a row even when another request had consumed the
last slot. The `rateLimitSafeAdapter` override handles **only** the native
limiter's `incrementOne` operation with guarded Prisma `updateMany()` and its
actual affected-row count. It preserves the native limiter, rules, expiry,
first-insert handling and HTTP 429 contract; no custom SQL limiter is used.
Keep this regression test when upgrading Prisma or Better Auth.

**Window behavior:** every accepted request refreshes `lastRequest`. A bucket
resets after a full window without an accepted request; rejected requests do
not extend it. This is the installed library's inactivity-window behavior,
not a fixed wall-clock window.

**Cleanup:** on successful renewal of an expired existing bucket, Better Auth
best-effort deletes rows older than the longest configured window (currently
300 seconds). It does not prune on first insert or every request, so one-off
keys can accumulate. Before public launch, schedule a trusted maintenance job
(no public cleanup endpoint) to run bounded batches, e.g.:

```sql
DELETE FROM rate_limit
WHERE lastRequest < (UNIX_TIMESTAMP() - 86400) * 1000
LIMIT 1000;
```

Run batches with a pause until fewer than 1000 rows are removed, and monitor
failures/table size without logging keys. The 24-hour retention exceeds every
current window; reassess it if any future rule exceeds that duration. Use UTC
synchronized clocks across app and database nodes. Never delete active buckets.

**Client-IP attribution remains a deployment gate.** The installed library's
default accepts a single-value `X-Forwarded-For`, which is not a verified trust
boundary here. `advanced.ipAddress.ipAddressHeaders: []` deliberately ignores
all forwarding headers, without disabling IP tracking or limiting. Production
uses the library's shared `no-trusted-ip` per-path bucket until a platform-owned,
edge-overwritten IP header is verified on the deployed Vercel environment.
This prevents header rotation from bypassing limits, but unrelated users share
budgets and can block one another. Do not launch publicly with this fallback:
verify spoofing resistance through the actual ingress, then explicitly configure
only the proven header. `trustedProxyHeaders: false` protects URL attribution;
it does not itself secure rate-limiter IP attribution.

Local integration check (requires generated client and the migration on a
loopback MySQL datasource; the test never applies migrations):

```powershell
$env:LIFEOS_TEST_MYSQL_RATE_LIMIT = '1'
node --experimental-transform-types --test tests/auth-rate-limit.mysql.test.mjs
Remove-Item Env:LIFEOS_TEST_MYSQL_RATE_LIMIT
```

It uses two independent Prisma pools/auth instances, tests all configured paths,
100-request default, concurrent creation/increment/renewal and native cleanup,
verifies signup/login/session/logout across clients, and deletes its disposable
user and synthetic counters in `finally`. It is explicitly skipped in
the default suite; never point it at a hosted database.

Release gates remain: deploy the additive migration, final HTTPS URL/secrets,
verified IP attribution, scheduled expired-row cleanup, functioning
verification/recovery email flows, and a staging browser check of cookies,
session lifecycle, CSRF rejection and isolation.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
