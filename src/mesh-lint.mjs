#!/usr/bin/env node
// mesh-lint — the checks that fail silently.
//
//   npx @flashyos/mesh-lint                       every check, this directory
//   npx @flashyos/mesh-lint --checks well-known   one of them
//   npx @flashyos/mesh-lint --github              GitHub annotations
//   npx @flashyos/mesh-lint --json                machine-readable
//   npx @flashyos/mesh-lint --gate                exit 1 on a finding
//
// ── It annotates. It does not fail your build ──────────────────────────────
//
// Default exit is 0 even with findings, and `--gate` is the deliberate opt-in.
// A tool that arrives in somebody's repository and immediately turns it red is
// a tool they remove before they read a word of what it found. These three
// defects have been latent for months in repositories that were otherwise
// perfectly healthy; one more morning is not the cost. Being deleted is.
//
// ── A silence is never a finding ───────────────────────────────────────────
//
// `unknown` is printed in its own section, by name, and is never counted as a
// defect. A URL that did not answer has not said the file is missing, and an
// Action that annotated a pull request to say somebody's domain is down — when
// it was this runner's egress that refused — is an Action nobody trusts twice.
//
// ── Nothing checked is not clean ───────────────────────────────────────────
//
// Every check reports what it looked at, and a check that looked at nothing
// says so where a reader cannot miss it. A walk that resolves nothing reports
// a clean repository and reads exactly like one.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { CHECKS, walk } from './mesh-lint-checks.mjs'

/** The shortest an excuse may be. */
export const WHY_MIN = 40

/**
 * A repository's declared exceptions.
 *
 * ── Why a tool like this needs one ─────────────────────────────────────────
 *
 * Run against this estate, `schema-ids` reported 16 dead identifiers — and
 * several are dead ON PURPOSE, because serving an unpublished format's schema
 * publishes the format. A checker that annotates a deliberate refusal as a
 * defect is a checker whose annotations people learn to scroll past, and then
 * it has stopped finding the real ones too.
 *
 * ── Why it is shaped like this ─────────────────────────────────────────────
 *
 * Every allowance carries a REASON, of at least forty characters, because an
 * exception with no reason is indistinguishable from an oversight and the two
 * need opposite treatment. And an allowance matching nothing is reported as
 * STALE rather than ignored: an excuse that outlives what it excuses is how a
 * suppression file quietly grows into a second, undocumented policy.
 *
 * `.mesh-lint.json`:
 *
 * ```json
 * {
 *   "schema-ids": {
 *     "allow": [
 *       { "key": "https://example.org/schema/draft.json",
 *         "why": "unpublished on purpose; serving the schema publishes the format" }
 *     ]
 *   }
 * }
 * ```
 */
export function readConfig(root, readImpl) {
  const read = readImpl ?? ((p) => readFileSync(p, 'utf8'))
  let raw
  try {
    raw = read(join(root, '.mesh-lint.json'))
  } catch {
    return { config: {}, problems: [] }
  }
  let doc
  try {
    doc = JSON.parse(raw)
  } catch {
    // Refuse rather than proceed: a config that does not parse and a config
    // that is absent must not look the same, or a typo silently un-suppresses
    // everything or suppresses nothing.
    return { config: {}, problems: [{ why: '.mesh-lint.json does not parse' }] }
  }
  const problems = []
  for (const [id, cfg] of Object.entries(doc)) {
    for (const a of cfg?.allow ?? []) {
      if (typeof a?.key !== 'string') problems.push({ why: `${id}: an allowance with no \`key\`` })
      else if (typeof a?.why !== 'string' || a.why.trim().length < WHY_MIN)
        problems.push({ why: `${id}: the allowance for ${a.key} gives a reason under ${WHY_MIN} characters` })
    }
  }
  return { config: doc, problems }
}

/**
 * Split a check's findings into the ones that stand and the ones allowed.
 *
 * Returns the stale allowances too — named, because that is the half a
 * suppression file always loses.
 */
export function applyAllowances(id, findings, config) {
  const allow = config?.[id]?.allow ?? []
  const keys = new Set(findings.map((f) => f.key ?? f.file))
  const suppressed = []
  const kept = []
  for (const f of findings) {
    const hit = allow.find((a) => a.key === (f.key ?? f.file))
    if (hit) suppressed.push({ ...f, why: hit.why })
    else kept.push(f)
  }
  const stale = allow.filter((a) => !keys.has(a.key)).map((a) => a.key)
  return { kept, suppressed, stale }
}

/** The branch an ancestry question is asked against. */
export function defaultRef(root, execImpl) {
  const run = (args) => {
    try {
      return execImpl(args, root)
    } catch {
      return null
    }
  }
  return run(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']) ?? 'origin/main'
}

/**
 * Run a set of checks over one directory.
 *
 * Injectable throughout — `fetchImpl`, `files`, `ref` — because a checker
 * whose own tests need the network is a checker with no tests.
 */
export async function lint({ root = process.cwd(), checks = CHECKS, files, fetchImpl = fetch, ref = 'origin/main', config: given } = {}) {
  const tree = files ?? walk(root)
  const { config, problems } = given ? { config: given, problems: [] } : readConfig(root)
  const results = []
  for (const check of checks) {
    let r
    try {
      r = await check.run({ root, files: tree, fetchImpl, ref })
    } catch (e) {
      // A check that threw has not found a clean repository. It is reported as
      // a check that could not run, which is a third thing.
      r = { checked: 0, findings: [], unknown: [], failed: String(e?.message ?? e).slice(0, 200) }
    }
    const { kept, suppressed, stale } = applyAllowances(check.id, r.findings, config)
    results.push({ id: check.id, about: check.about, ...r, findings: kept, suppressed, stale })
  }
  return {
    root,
    files: tree.length,
    results,
    findings: results.reduce((n, r) => n + r.findings.length, 0),
    unknown: results.reduce((n, r) => n + r.unknown.length, 0),
    // A check that examined nothing is named here rather than folded into a
    // clean verdict. This is the vacuity guard, and it is part of the output.
    vacuous: results.filter((r) => r.checked === 0 && !r.failed).map((r) => r.id),
    failed: results.filter((r) => r.failed).map((r) => ({ id: r.id, why: r.failed })),
    suppressed: results.reduce((n, r) => n + r.suppressed.length, 0),
    // An excuse that outlives what it excuses. Reported every run, because a
    // suppression file nobody prunes becomes a second policy nobody wrote.
    stale: results.flatMap((r) => r.stale.map((k) => ({ id: r.id, key: k }))),
    configProblems: problems,
  }
}

/** One line per finding, in the format GitHub turns into an annotation. */
export function annotations(report) {
  const out = []
  for (const r of report.results) {
    for (const f of r.findings) {
      // `notice`, not `error`: this annotates, and the level says so. A tool
      // that calls everything an error trains people to ignore its errors.
      const msg = `${f.message}${f.detail ? ` — ${f.detail}` : ''}`.replace(/\r?\n/g, ' ')
      out.push(`::notice file=${f.file},title=mesh-lint (${r.id})::${msg}`)
    }
  }
  return out
}

/** What a person reads in a terminal. */
export function render(report) {
  const L = []
  L.push('')
  L.push(`  mesh-lint — ${report.files} files under ${report.root}`)
  L.push('')
  for (const r of report.results) {
    if (r.failed) {
      L.push(`    ${r.id.padEnd(16)} could not run — ${r.failed}`)
      continue
    }
    const verdict = r.checked === 0 ? 'nothing to check' : r.findings.length === 0 ? 'clean' : `${r.findings.length} finding(s)`
    L.push(`    ${r.id.padEnd(16)} ${String(r.checked).padStart(4)} checked   ${verdict}`)
    for (const f of r.findings) {
      L.push(`      ${f.file}`)
      L.push(`        ${f.message}`)
    }
  }
  if (report.unknown) {
    L.push('')
    L.push(`    ${report.unknown} unknown — reported, never counted as a defect:`)
    for (const r of report.results) for (const u of r.unknown) L.push(`      ${r.id}: ${u.what} — ${u.why}`)
  }
  if (report.suppressed) {
    L.push('')
    L.push(`    ${report.suppressed} allowed by .mesh-lint.json, each with a reason:`)
    for (const r of report.results) for (const f of r.suppressed) L.push(`      ${r.id}: ${f.key ?? f.file} — ${f.why}`)
  }
  if (report.stale.length) {
    L.push('')
    L.push(`    ${report.stale.length} allowance(s) matching nothing — an excuse that outlived what it excuses:`)
    for (const s of report.stale) L.push(`      ${s.id}: ${s.key}`)
  }
  for (const p of report.configProblems) L.push(`    config: ${p.why}`)
  if (report.vacuous.length) {
    L.push('')
    L.push(`    checked nothing: ${report.vacuous.join(', ')}`)
    L.push('    A check that looked at nothing has not found a clean repository.')
  }
  L.push('')
  L.push(`    ${report.findings} finding(s), ${report.unknown} unknown`)
  L.push('')
  return L.join('\n')
}

const RUN = import.meta.url === `file://${process.argv[1]}`
if (RUN) {
  const argv = process.argv.slice(2)
  const flag = (n) => argv.includes(`--${n}`)
  const value = (n) => {
    const i = argv.indexOf(`--${n}`)
    return i === -1 ? null : argv[i + 1]
  }

  const wanted = value('checks')
  const ids = wanted ? wanted.split(',').map((s) => s.trim()).filter(Boolean) : null
  const unknownIds = ids?.filter((i) => !CHECKS.some((c) => c.id === i)) ?? []
  if (unknownIds.length) {
    // Named a check that does not exist → refuse. Silently running the others
    // would report a clean repository over a check nobody ran.
    process.stderr.write(`\n  no such check: ${unknownIds.join(', ')}\n  available: ${CHECKS.map((c) => c.id).join(', ')}\n\n`)
    process.exit(2)
  }

  const root = value('root') ?? process.cwd()
  const { execFileSync } = await import('node:child_process')
  const ref = value('ref') ?? defaultRef(root, (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim())

  const report = await lint({ root, ref, checks: ids ? CHECKS.filter((c) => ids.includes(c.id)) : CHECKS })

  if (flag('json')) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  else if (flag('github')) for (const line of annotations(report)) process.stdout.write(`${line}\n`)
  else process.stdout.write(render(report))

  // Exit 2 where a check could not run: that is not a clean result and it is
  // not a finding either, and collapsing it into 0 is how a broken check stays
  // broken for a year.
  if (report.failed.length) process.exit(2)
  process.exit(flag('gate') && report.findings > 0 ? 1 : 0)
}
