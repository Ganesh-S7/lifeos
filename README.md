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

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
