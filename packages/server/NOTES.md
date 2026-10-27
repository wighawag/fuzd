## OpenAPI document

The OpenAPI document of the public API is generated from the same zod schemas that validate the requests (see `src/schemas`, `src/openapi.ts` and docs/adr/0003). `pnpm build` writes it to `doc/openapi.json` (and copies it to the docs site); the running server serves it at `/doc/openapi.json`.

```
pnpm openapi
```
