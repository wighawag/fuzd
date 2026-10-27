# Publishing

Releases go out through changesets and npm Trusted Publishing (OIDC), from `.github/workflows/release.yml`. **There is no `NPM_TOKEN` secret**: npm trusts this repository and that workflow file directly, and every publish is stamped with provenance.

## What is published

| package                 | from                       | command       |
| ----------------------- | -------------------------- | ------------- |
| `@fuzd/common`          | `packages/common`          |               |
| `@fuzd/chain-protocol`  | `packages/chain-protocol`  |               |
| `@fuzd/executor`        | `packages/executor`        |               |
| `@fuzd/scheduler`       | `packages/scheduler`       |               |
| `@fuzd/tlock-decrypter` | `packages/tlock-decrypter` |               |
| `@fuzd/server`          | `packages/server`          |               |
| `@fuzd/client`          | `packages/client`          | `fuzd-client` |
| `fuzd`                  | `platforms/nodejs`         | `fuzd`        |

`@fuzd/cf-worker` is `private` and in changesets' `ignore`: it is a deployment, not a package. The list lives in `scripts/npm-names.txt` too, and `pnpm check:packaging` (part of the verify gate) checks every publishable package has the `repository`, `license` and `publishConfig.access` that provenance and scoped publishing need.

These names replaced `fuzd-common`, `fuzd-chain-protocol`, `fuzd-executor`, `fuzd-scheduler`, `fuzd-tlock-decrypter`, `fuzd-server`, `fuzd-client` and `fuzd-nodejs`, which stop at their last version and are deprecated.

## The normal flow

1. Add a changeset with the change: `pnpm changeset`.
2. Merge to `main`. The release workflow opens (or updates) a **"Version Packages"** PR that applies the pending changesets.
3. Merge that PR. The workflow runs `pnpm release:ci`: the verify gate (packaging check, format, build, tests), then `changeset publish`, which publishes in dependency order and skips versions already on npm.

## The one-time bootstrap (per package name)

npm keeps the trusted-publisher setting on the package, so a name has to exist before it can hold one. `~/dev/tools/reserve-npm-name.mjs` does both steps for the whole list: it publishes an empty `0.0.0` placeholder for every name that does not exist yet, then runs `npm trust github <name> --file release.yml --repo wighawag/fuzd --allow-publish` for every name (new ones, and existing ones you maintain such as `fuzd`), skipping a package that already has a trusted publisher.

Requirements: npm `>= 11.15.0` for `npm trust` (on the my-boxes hosts it comes with Node 24 from the flake, currently npm 11.17.0; upgrade it there rather than with `npm install -g`), 2FA on the npm account, and the `@fuzd` org. The first `npm trust` call asks for 2FA in the browser; tick "skip 2FA for the next 5 minutes" there and the rest of the list goes through.

```bash
# dry run first: prints what it would reserve and trust, changes nothing
node ~/dev/tools/reserve-npm-name.mjs --names-file scripts/npm-names.txt --license MIT --repo https://github.com/wighawag/fuzd --trust-github wighawag/fuzd --workflow release.yml

# then for real
node ~/dev/tools/reserve-npm-name.mjs --names-file scripts/npm-names.txt --license MIT --repo https://github.com/wighawag/fuzd --trust-github wighawag/fuzd --workflow release.yml --publish
```

A new trusted publisher is reported to need a real OIDC publish within about two days, so run the release workflow straight after (Actions, `release`, Run workflow). If it lapses: `npm trust list <name>`, `npm trust revoke <name> --id <id>`, then trust again.

The same setting by hand, per package on npmjs.com, Settings, Trusted publisher: GitHub Actions, user `wighawag`, repository `fuzd`, workflow `release.yml`, environment empty. A package added later needs the same bootstrap.

## Checking a release

```bash
npm view @fuzd/server version
npm view @fuzd/server --json | jq .dist.attestations
npx fuzd@latest --help
```

The attestations block is the provenance. If it is missing, the publish did not go through OIDC.
