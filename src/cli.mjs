#!/usr/bin/env node
// mesh-lint — the command `package.json` declares as its `bin`.
//
// This is deliberately thin. The whole tool — the three checks, the report, the
// renderer and the argv handling — lives in `mesh-lint.mjs`, which is both the
// importable library and, run directly, the CLI. This file used to be a
// byte-for-byte copy of that entire module, with nothing holding the two equal:
// the moment somebody edited one and not the other they would diverge, and a
// `bin` serving stale logic while the library stayed correct is exactly the
// silently-diverged defect mesh-lint exists to catch. So the bin imports the
// one implementation and calls it — `main` reads `process.argv` itself.
import { main } from './mesh-lint.mjs'

await main()
