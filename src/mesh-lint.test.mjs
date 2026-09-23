/**
 * mesh-lint, against fixtures rather than against this estate.
 *
 * A checker tested only on the repository it was written in is a checker
 * tuned to that repository. Every case below builds a small tree on disk, so
 * each check is exercised on a shape somebody else might actually have — and,
 * more importantly, so each one is proved capable of FINDING something. The
 * `well-known` check returned clean on this monorepo the first time it ran,
 * and a check that has only ever said "clean" is indistinguishable from one
 * that cannot speak.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { CHECKS, canAskAncestry, classify, declaredSchemaIds, publishablePackages, schemaIds, surfaceName, walk, wellKnown } from './mesh-lint-checks.mjs'
import { WHY_MIN, annotations, applyAllowances, lint, readConfig, render } from './mesh-lint.mjs'

/** A throwaway repository. `files` is a map of relative path to contents. */
function repo(files) {
  const dir = mkdtempSync(join(tmpdir(), 'meshlint-'))
  for (const [rel, body] of Object.entries(files)) {
    const full = join(dir, rel)
    mkdirSync(dirname(full), { recursive: true })
    writeFileSync(full, typeof body === 'string' ? body : JSON.stringify(body, null, 2))
  }
  return dir
}

/** A fetch that answers from a table, so no test touches the network. */
const answering = (table) => async (url) => {
  const hit = table[String(url)]
  if (hit === undefined) throw Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' })
  if (typeof hit === 'number') return { status: hit, json: async () => ({}) }
  return { status: 200, json: async () => hit }
}

describe('the walk', () => {
  test('skips what is never interesting, and returns POSIX paths', () => {
    const dir = repo({ 'a.json': {}, 'node_modules/x/b.json': {}, 'src/deep/c.json': {} })
    const files = walk(dir)
    assert.deepEqual(files, ['a.json', 'src/deep/c.json'])
    for (const f of files) assert.ok(!f.includes('\\'), `${f} carries a backslash`)
  })
})

describe('schema-ids', () => {
  test('a dead $id is a finding, and a live one is not', async () => {
    const dir = repo({
      'schema/live.json': { $id: 'https://example.org/live.json' },
      'schema/dead.json': { $id: 'https://example.org/dead.json' },
    })
    const r = await schemaIds.run({
      root: dir,
      files: walk(dir),
      fetchImpl: answering({ 'https://example.org/live.json': 200, 'https://example.org/dead.json': 404 }),
    })
    assert.equal(r.checked, 2)
    assert.equal(r.findings.length, 1)
    assert.match(r.findings[0].message, /dead\.json answered 404/)
  })

  test('a silence is unknown, never a finding', async () => {
    // The rule the whole tool rests on. A URL that did not answer has not said
    // the file is missing, and annotating somebody's pull request to say their
    // domain is down — when it was this runner's egress — is unrecoverable.
    const dir = repo({ 'schema/x.json': { $id: 'https://unreachable.invalid/x.json' } })
    const r = await schemaIds.run({ root: dir, files: walk(dir), fetchImpl: answering({}) })
    assert.equal(r.findings.length, 0)
    assert.equal(r.unknown.length, 1)
    assert.match(r.unknown[0].why, /DNS|unreachable/i)
  })

  test('two files, one $id, different contents — a finding', async () => {
    const dir = repo({
      'a/s.json': { $id: 'https://example.org/s.json', type: 'object' },
      'b/s.json': { $id: 'https://example.org/s.json', type: 'array' },
    })
    const r = await schemaIds.run({ root: dir, files: walk(dir), fetchImpl: answering({ 'https://example.org/s.json': 200 }) })
    assert.equal(r.findings.length, 1)
    assert.match(r.findings[0].message, /declared by 2 files that do not agree/)
  })

  test('a served copy that AGREES with its source is not a finding', async () => {
    // Keeping a published copy beside the source is normal and correct.
    // Divergence is the defect, not duplication.
    const doc = { $id: 'https://example.org/s.json', type: 'object' }
    const dir = repo({ 'public/s.json': doc, 'packages/x/schema/s.json': doc })
    const r = await schemaIds.run({ root: dir, files: walk(dir), fetchImpl: answering({ 'https://example.org/s.json': 200 }) })
    assert.deepEqual(r.findings, [])
  })

  test('a repository with no schemas checks nothing, and says so', () => {
    const dir = repo({ 'README.md': '# hi' })
    assert.equal(declaredSchemaIds(dir).length, 0)
  })
})

describe('published-from', () => {
  test('a shallow clone is refused by name, never answered', () => {
    // `git merge-base --is-ancestor` exits non-zero for a commit outside the
    // graft window, byte-identical to "not an ancestor" — so on a default
    // fetch-depth: 1 checkout this check would annotate every published
    // version as unreachable. It must refuse instead.
    const dir = repo({ 'README.md': 'x' })
    const r = canAskAncestry(dir)
    assert.equal(r.ok, false)
    assert.match(r.why, /not a git repository|shallow/)
  })

  test('each package is asked its OWN registry', () => {
    const dir = repo({
      'package.json': { name: 'a', version: '1.0.0' },
      'packages/b/package.json': { name: 'b', version: '1.0.0', publishConfig: { registry: 'https://npm.pkg.github.com/' } },
      'packages/c/package.json': { name: 'c', version: '1.0.0', private: true },
    })
    const pkgs = publishablePackages(dir)
    assert.deepEqual(pkgs.map((p) => p.name).sort(), ['a', 'b'])
    assert.equal(pkgs.find((p) => p.name === 'b').registry, 'https://npm.pkg.github.com')
    // A 404 from npmjs says nothing about a package published elsewhere.
    assert.equal(pkgs.find((p) => p.name === 'a').registry, 'https://registry.npmjs.org')
  })

  test('a private package is not a publishable one', () => {
    const dir = repo({ 'package.json': { name: 'p', version: '1.0.0', private: true } })
    assert.deepEqual(publishablePackages(dir), [])
  })
})

describe('well-known', () => {
  test('a framework route file is an implementation, not an undeclared surface', async () => {
    // Reading the whole tail as the surface name reported every route file in
    // the monorepo — 64 annotations a maintainer would read once.
    assert.equal(surfaceName('app/.well-known/flashyos.json/route.ts'), 'flashyos.json')
    assert.equal(surfaceName('public/.well-known/security.txt'), 'security.txt')
    assert.equal(surfaceName('src/index.ts'), null)
  })

  test('promised and absent is a finding', async () => {
    const dir = repo({ 'frontdoor.json': { surfaces: ['/.well-known/missing.json'] } })
    const r = await wellKnown.run({ root: dir, files: walk(dir) })
    assert.equal(r.findings.length, 1)
    assert.match(r.findings[0].message, /missing\.json is referenced here and is not in the tree/)
  })

  test('served and named nowhere is a finding', async () => {
    const dir = repo({ 'public/.well-known/orphan.json': {}, 'README.md': '# nothing about it' })
    const r = await wellKnown.run({ root: dir, files: walk(dir) })
    assert.equal(r.findings.length, 1)
    assert.match(r.findings[0].message, /served and nothing in this repository names it/)
  })

  test('a path inside a sentence is not a promise', async () => {
    // Three passes of narrowing got here. A README describing a surface, a
    // code comment illustrating one, a generator's template: none is a
    // repository promising anything.
    const dir = repo({
      'README.md': 'Fetch /.well-known/example.json to see it.',
      'docs.json': { note: 'we serve /.well-known/example.json for agents' },
    })
    const r = await wellKnown.run({ root: dir, files: walk(dir) })
    assert.deepEqual(r.findings, [])
  })

  test('a fixture is not a promise', async () => {
    const dir = repo({ 'conformance/suite.json': { cases: [{ url: '/.well-known/fixture.json' }] } })
    const r = await wellKnown.run({ root: dir, files: walk(dir) })
    assert.deepEqual(r.findings, [])
  })

  test("a schema's own examples are illustrations", async () => {
    const dir = repo({ 'schema/s.json': { properties: { at: { examples: ['/.well-known/shown.json'] } } } })
    const r = await wellKnown.run({ root: dir, files: walk(dir) })
    assert.deepEqual(r.findings, [])
  })
})

describe('allowances', () => {
  test('a reason under the bound is refused', () => {
    const dir = repo({ '.mesh-lint.json': { 'schema-ids': { allow: [{ key: 'x', why: 'because' }] } } })
    const { problems } = readConfig(dir)
    assert.equal(problems.length, 1)
    assert.match(problems[0].why, new RegExp(`under ${WHY_MIN}`))
  })

  test('a config that does not parse is a problem, not an empty config', () => {
    // Absent and broken must not look the same, or a typo silently suppresses
    // nothing or everything.
    const dir = repo({ '.mesh-lint.json': '{ not json' })
    const { config, problems } = readConfig(dir)
    assert.deepEqual(config, {})
    assert.equal(problems.length, 1)
  })

  test('an allowance suppresses its finding and carries the reason forward', () => {
    const why = 'unpublished on purpose; serving the schema would publish a format with no adopter'
    const { kept, suppressed, stale } = applyAllowances('schema-ids', [{ key: 'a', file: 'f' }, { key: 'b', file: 'g' }], {
      'schema-ids': { allow: [{ key: 'a', why }] },
    })
    assert.deepEqual(kept.map((f) => f.key), ['b'])
    assert.equal(suppressed[0].why, why)
    assert.deepEqual(stale, [])
  })

  test('an allowance matching nothing is reported as stale', () => {
    // An excuse that outlives what it excuses is how a suppression file grows
    // into a second policy nobody wrote.
    const { stale } = applyAllowances('schema-ids', [], { 'schema-ids': { allow: [{ key: 'gone', why: 'x'.repeat(50) }] } })
    assert.deepEqual(stale, ['gone'])
  })
})

describe('the report', () => {
  test('a check that examined nothing is named, never folded into clean', async () => {
    // The vacuity guard, and it is part of the output rather than something a
    // reader infers from a zero.
    const dir = repo({ 'README.md': '# empty' })
    const report = await lint({ root: dir, checks: [schemaIds], fetchImpl: answering({}) })
    assert.equal(report.findings, 0)
    assert.deepEqual(report.vacuous, ['schema-ids'])
    assert.match(render(report), /checked nothing: schema-ids/)
  })

  test('a check that throws is reported as a check that could not run', async () => {
    const boom = { id: 'boom', about: '', needs: {}, run: async () => { throw new Error('exploded') } }
    const report = await lint({ root: repo({}), checks: [boom], fetchImpl: answering({}) })
    assert.equal(report.failed.length, 1)
    assert.match(report.failed[0].why, /exploded/)
    // Not clean, and not a finding either.
    assert.equal(report.findings, 0)
  })

  test('annotations are notices, and carry the file GitHub needs', async () => {
    const dir = repo({ 'schema/dead.json': { $id: 'https://example.org/dead.json' } })
    const report = await lint({ root: dir, checks: [schemaIds], fetchImpl: answering({ 'https://example.org/dead.json': 404 }) })
    const lines = annotations(report)
    assert.equal(lines.length, 1)
    assert.match(lines[0], /^::notice file=schema\/dead\.json,title=mesh-lint \(schema-ids\)::/)
    // One line, always: a newline inside an annotation truncates it.
    assert.ok(!lines[0].slice(2).includes('\n'))
  })

  test('every shipped check declares what it needs', () => {
    // A runner can then refuse honestly rather than producing a silent
    // half-answer on a machine with no network or no history.
    for (const c of CHECKS) {
      assert.equal(typeof c.id, 'string')
      assert.equal(typeof c.needs?.network, 'boolean', `${c.id} does not declare whether it needs the network`)
      assert.equal(typeof c.needs?.history, 'boolean', `${c.id} does not declare whether it needs history`)
    }
  })
})

describe('the silence vocabulary agrees with the one the estate publishes', () => {
  test('same verdicts on the same inputs', async (t) => {
    // This file restates `tools/reachability.mjs` rather than importing it,
    // because a GitHub Action is the one place an extra dependency is hardest
    // to justify. Restating it means it can drift — so this compares the two
    // on shared inputs and pins the VERDICTS, never the wording.
    //
    // The published copy of this package ships without that source. It SKIPS
    // there, with the reason, rather than failing: a drift test that cannot
    // see what it compares against reports unknown, never passed and never
    // red. Failing would train a contributor to ignore a red suite; passing
    // would claim a comparison nobody made.
    let theirs
    try {
      ;({ classify: theirs } = await import('./reachability.mjs'))
    } catch {
      return t.skip('reachability.mjs is not beside this copy — unknown, not agreed')
    }
    const cases = [
      Object.assign(new Error('getaddrinfo ENOTFOUND x'), { code: 'ENOTFOUND' }),
      Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }),
      Object.assign(new Error('aborted'), { name: 'AbortError' }),
    ]
    for (const env of [{}, { HTTPS_PROXY: 'http://proxy:8080' }]) {
      for (const e of cases) {
        assert.equal(classify(e, env).state, theirs(e, env).state, `disagreed on ${e.code ?? e.name} with proxy=${Boolean(env.HTTPS_PROXY)}`)
      }
    }
  })
})
