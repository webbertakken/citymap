# Defaults ledger

One row per value the architecture spec leaves silent or qualitative for the Rust implementation.

| Default                | Value                                                                                                                              | Provenance                                             | Safe range   |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------ |
| Rust toolchain         | stable 1.99.1, with rustfmt and clippy                                                                                             | the latest stable when the workspace began             | any stable   |
| Edition, resolver      | 2024, 3                                                                                                                            | current                                                | fixed        |
| Lints                  | `clippy::all` and `clippy::pedantic` denied; `unsafe_code` forbidden                                                               | the operator's rules                                   | fixed        |
| Snapshot queue         | 64 snapshots between the history thread and the fold (`SNAPSHOT_QUEUE`)                                                            | keeps git ahead of the fold, bounded memory            | 8 to 256     |
| Wide integers          | `i128` for TypeScript `bigint` sites; `ethnum::I256` for `inCircle`                                                                | products below 2^110; in-circle terms 2^146            | fixed        |
| JSON maps              | `IndexMap` where order is read; sorted output                                                                                      | JavaScript insertion order                             | fixed        |
| Parity repositories    | takken.io, redux, studio-worker, game-ci-cli, livediagram, react                                                                   | the bench's fast folds and react                       | extend       |
| Long parity run        | next.js, behind `--long`                                                                                                           | a long fold, minutes on Rust                           | extend       |
| Release profile        | `lto = "thin"`, `codegen-units = 1`                                                                                                | speed of the fold                                      | fixed        |
| Land-use memory        | 2^20 paths (`USE_MEMORY`), then it starts afresh                                                                                   | the TypeScript `remembering` limit                     | 2^16 to 2^22 |
| Warp memory            | 2^21 points per town (`WARP_POINTS`)                                                                                               | the TypeScript warp memo                               | 2^16 to 2^23 |
| Allowed pedantic lints | `many_single_char_names`, `similar_names`, `too_many_lines`, `missing_panics_doc`, `missing_errors_doc`, `module_name_repetitions` | code that mirrors the reference formulas and functions | fixed        |
