# fuzd

Run the fuzd server as a node process, on a libsql database.

```bash
npx fuzd --port 34002 --chain "31337=http://127.0.0.1:8555#finality=1&worstCaseBlockTime=2" --mnemonic "<mnemonic>"
```

With no `--db` it runs on `:memory:`: the database is created and set up at start, and lost when the process stops. No chain is served unless one is given.

## Options

Every option falls back to an environment variable, which the process env or a `.env` / `.env.local` file in the working directory may set (then `.env.default` shipped with the package). A flag overrides its variable.

| flag                                   | env                    | default                                           |                                                                                                                                                                |
| -------------------------------------- | ---------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `-p, --port <port>`                    |                        | `3000`                                            | port to listen on                                                                                                                                              |
| `-d, --db <url>`                       | `DB`                   | `:memory:`                                        | libsql database url (`:memory:`, `file:./fuzd.db`, a remote url); `:memory:` runs the setup at start                                                           |
| `-c, --chain <chainId>=<rpc>`          | `CHAIN_<chainId>`      | none                                              | a chain to serve, repeatable; the rpc may end with `#finality=<blocks>&worstCaseBlockTime=<seconds>&protocol=<ethereum\|starknet>` (defaults 12, 15, ethereum) |
| `-m, --mnemonic <mnemonic>`            | `HD_MNEMONIC`          | the `test ... junk` mnemonic, from `.env.default` | the remote accounts are derived from it                                                                                                                        |
| `--admin-token <token>`                | `TOKEN_ADMIN`          | `random-token`, from `.env.default`               | password of the admin routes (user `admin`)                                                                                                                    |
| `--time-lock-decryption <true\|false>` | `TIME_LOCK_DECRYPTION` | `true`                                            | decrypt time-locked executions with drand mainnet                                                                                                              |
| `--payment-account <address>`          | `PAYMENT_ACCOUNT`      | none                                              | account whose remote account covers a gas price above what an execution authorised                                                                             |
| `--contract-timestamp <address>`       | `CONTRACT_TIMESTAMP`   | none                                              | contract the chain time is read from, instead of the latest block                                                                                              |
| `--dev`                                | `DEV`                  | `true`, from `.env.default`                       | enable the development routes, like `/admin/setChainOverride`; `--dev` sets `DEV=true`, the only value that enables them                                       |
| `-i, --process-interval <seconds>`     |                        | `1`                                               | seconds between each run of the queue, the transactions and the status checks; `0` disables it                                                                 |

The mnemonic and admin token defaults are public: they are meant for a local chain only. Give your own for anything else.

```bash
# the same configuration from the environment
DB=:memory: CHAIN_31337="http://127.0.0.1:8555#finality=1&worstCaseBlockTime=2" HD_MNEMONIC="<mnemonic>" npx fuzd --port 34002
```

## Develop

```bash
pnpm build
pnpm test # spawns the built CLI on free ports
```
