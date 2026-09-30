import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
// The source lives in a monorepo that may or may not be checked out beside
// this one. Absent is UNKNOWN, never passed: a drift test that quietly
// succeeds when it cannot see the source is worse than no drift test, because
// it reads as a check that ran.
const SOURCE = join(HERE, '..', '..', 'flashyos', 'tools')

const COPIED = ["mesh-lint-checks.mjs","mesh-lint.mjs"]

describe('the copies still match their source', () => {
  for (const file of COPIED) {
    test(`${file} is byte-identical to its origin`, { skip: !existsSync(join(SOURCE, file)) && 'flashyos is not checked out beside this repository — unknown, not current' }, () => {
      assert.equal(
        readFileSync(join(HERE, file), 'utf8'),
        readFileSync(join(SOURCE, file), 'utf8'),
        `${file} has drifted from its source`,
      )
    })
  }

  test('there is something to compare', () => {
    assert.ok(COPIED.length > 0, 'no files are declared as copies, so the check above asserts nothing')
  })
})

// The AAO charter checker MESH.md tells a reader to run. Canon is the aao
// repository's own dependency-free port (`vendor-aao-check.mjs`), vendored
// byte-identical at the repository root — the same way stack.json and every
// other estate copy travels. Its source is a DIFFERENT sibling from the one
// above, so it gets its own comparison rather than a row in COPIED.
const AAO_SOURCE = join(HERE, '..', '..', 'aao', 'vendor-aao-check.mjs')
const AAO_COPY = join(HERE, '..', 'vendor-aao-check.mjs')

describe('the vendored AAO checker still matches canon', () => {
  test('vendor-aao-check.mjs is byte-identical to the aao repository', { skip: !existsSync(AAO_SOURCE) && 'the aao repository is not checked out beside this one — unknown, not current' }, () => {
    assert.equal(
      readFileSync(AAO_COPY, 'utf8'),
      readFileSync(AAO_SOURCE, 'utf8'),
      'vendor-aao-check.mjs has drifted from aao/vendor-aao-check.mjs — re-vendor, never hand-edit',
    )
  })

  test('the copy is present at all', () => {
    // Existence is what MESH.md's `node vendor-aao-check.mjs` line depends on,
    // and its absence is the exact defect this vendoring closed. Held here
    // unconditionally, because the byte-identity test above SKIPS when the
    // source sibling is missing and a skip must never be the only word on
    // whether the file a documented command runs even exists.
    assert.ok(existsSync(AAO_COPY), 'vendor-aao-check.mjs is missing from the repository root')
  })
})
