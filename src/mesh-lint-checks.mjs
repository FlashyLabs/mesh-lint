// The checks. Three questions nothing else in a repository asks.
//
// ── What they have in common ───────────────────────────────────────────────
//
// Each one has a real receipt. A JSON Schema `$id` that 404s was found on this
// estate's own `defined/1` — an identifier built to be cited, resolving to
// nothing. Two packages reached public npm from commits the default branch does
// not reach (2026-09-22), and on one of them the VERSIONS matched, so every
// version check in the world saw agreement. And 15 properties served a
// `frontdoor.json` while not one declared the format, so a stranger merging the
// graph could not discover that any of them published a door.
//
// None of the three turns anything red today, in any repository, anywhere. That
// is the whole category: a defect whose failure mode is silence.
//
// ── Three rules every check obeys ──────────────────────────────────────────
//
// 1. **A silence is never a finding.** A URL that did not answer has not said
//    the file is missing. `unknown` is reported apart, by name, and enters no
//    count of defects.
// 2. **Nothing checked is not clean.** Every check reports how many things it
//    actually looked at. A walk that resolved nothing reports a clean
//    repository and reads exactly like one, so the number travels with the
//    verdict rather than being inferred from it.
// 3. **Every finding is reproducible locally.** No check needs a service of
//    ours. An annotation a contributor cannot reproduce is an annotation they
//    learn to scroll past.
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { join, sep } from 'node:path'

/** Directories never worth walking, and never interesting when they are. */
const SKIP = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.next', 'out', 'vendor', '.venv'])

/** Paths are POSIX in every message, whatever platform read them. */
const posix = (p) => p.split(sep).join('/')

/**
 * Every file under `root`, relative and POSIX, skipping the uninteresting.
 *
 * Bounded at 20,000 entries: a runaway walk in an Action is a job somebody
 * cancels, and a checker that hangs is a checker that gets removed.
 */
export function walk(root, { limit = 20000 } = {}) {
  const out = []
  const stack = ['']
  while (stack.length && out.length < limit) {
    const rel = stack.pop()
    const abs = rel ? join(root, rel) : root
    let entries
    try {
      entries = readdirSync(abs, { withFileTypes: true })
    } catch {
      continue
    }
    for (const e of entries) {
      if (SKIP.has(e.name)) continue
      const next = rel ? `${rel}${sep}${e.name}` : e.name
      if (e.isDirectory()) stack.push(next)
      else if (e.isFile()) out.push(posix(next))
    }
  }
  return out.sort()
}

const readJson = (p) => {
  try {
    return JSON.parse(readFileSync(p, 'utf8'))
  } catch {
    return null
  }
}

// ── Silence ────────────────────────────────────────────────────────────────
//
// The same three-state vocabulary `@flashyos/tools` publishes, restated here
// on purpose rather than depended on: a GitHub Action's supply chain is the
// one place an extra package is hardest to justify, and this is forty lines.
// In the monorepo a test compares this function's VERDICTS against
// `tools/reachability.mjs` on shared fixtures, so the two cannot drift in
// what they decide even though they are separate code.

/** The proxy this process would use, if any. Set by the environment, not us. */
export const proxyUrl = (env = process.env) =>
  env.HTTPS_PROXY ?? env.https_proxy ?? env.HTTP_PROXY ?? env.http_proxy ?? null

const codeOf = (error) => {
  for (let e = error; e; e = e.cause) if (typeof e?.code === 'string') return e.code
  return null
}

/**
 * What a failed request entitles you to say.
 *
 * `refused` is a fact about this runner. `unreachable` is the nearest thing to
 * a fact about the host. `ambiguous` is what a failure behind a proxy
 * entitles you to, which is nothing — and returning it rather than guessing is
 * what stops an Action annotating somebody's pull request to say their domain
 * is down when it is the runner's egress that refused.
 */
export function classify(error, env = process.env) {
  const code = codeOf(error)
  if (code === 'ENOTFOUND') return { state: 'unreachable', why: 'no DNS record' }
  if (error?.name === 'AbortError' || code === 'ABORT_ERR')
    return { state: proxyUrl(env) ? 'ambiguous' : 'unreachable', why: 'timed out' }
  if (proxyUrl(env)) return { state: 'ambiguous', why: `${code ?? 'request failed'}, and an egress proxy is configured` }
  return { state: 'unreachable', why: code ?? String(error?.message ?? error).slice(0, 80) }
}

/** One request, with a bound, returning a status or a named silence. */
async function ask(url, { fetchImpl = fetch, timeoutMs = 10000 } = {}) {
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), timeoutMs)
  try {
    const res = await fetchImpl(url, { signal: ac.signal, redirect: 'follow' })
    // A 403 behind a proxy is the gateway refusing a CONNECT or the host
    // refusing a request, identically on the wire. Saying which would be
    // inventing the answer.
    if (res.status === 403 && proxyUrl()) return { state: 'ambiguous', why: '403 — the host, or this runner’s egress; identical from here' }
    return { state: 'answered', status: res.status }
  } catch (e) {
    return classify(e)
  } finally {
    clearTimeout(t)
  }
}

// ── 1 · schema-ids ─────────────────────────────────────────────────────────

/** Every `$id` the repository declares, with the file that declares it. */
export function declaredSchemaIds(root, files = walk(root)) {
  const found = []
  for (const f of files) {
    if (!f.endsWith('.json')) continue
    const doc = readJson(join(root, f))
    const id = doc?.$id
    if (typeof id === 'string' && /^https?:\/\//.test(id)) found.push({ file: f, id })
  }
  return found
}

export const schemaIds = {
  id: 'schema-ids',
  about: 'A JSON Schema `$id` is dereferenced by every resolver that meets it. One that 404s is worse than none: it promises a document and hands back an error page.',
  needs: { network: true, history: false },
  async run({ root, files, fetchImpl }) {
    const declared = declaredSchemaIds(root, files)
    const findings = []
    const unknown = []
    const seen = new Map()

    // ── Two documents, one identifier ──────────────────────────────────────
    //
    // A resolver that meets this gets whichever it found first, and neither
    // document knows the other exists. But a repository that keeps a served
    // COPY of a schema beside its source is doing something normal and
    // correct, so byte-for-byte duplication is not the defect — DIVERGENCE is.
    //
    // Compared as parsed documents rather than as bytes, which is the same
    // discipline this estate applies to a charter served in two places:
    // formatting is not disagreement.
    const byId = new Map()
    for (const d of declared) {
      if (!byId.has(d.id)) byId.set(d.id, [])
      byId.get(d.id).push(d.file)
    }
    for (const [id, where] of byId) {
      if (where.length < 2) continue
      const shapes = new Set(where.map((f) => JSON.stringify(readJson(join(root, f)))))
      if (shapes.size === 1) continue
      findings.push({
        key: `duplicate:${id}`,
        file: where[1],
        message: `${id} is declared by ${where.length} files that do not agree`,
        detail: `A resolver gets whichever it found first. Also declared in ${where.filter((f) => f !== where[1]).join(', ')}.`,
      })
    }

    for (const { file, id } of declared) {
      if (!seen.has(id)) seen.set(id, await ask(id, { fetchImpl }))
      const r = seen.get(id)
      if (r.state === 'answered') {
        if (r.status >= 400) findings.push({ key: id, file, message: `$id ${id} answered ${r.status}`, detail: 'A resolver following this identifier gets an error page where a schema should be.' })
      } else {
        unknown.push({ what: `${file} → ${id}`, why: r.why ?? r.state })
      }
    }
    return { checked: declared.length, findings, unknown }
  },
}

// ── 2 · published-from ─────────────────────────────────────────────────────

/** Whether this checkout can answer an ancestry question at all. */
export function canAskAncestry(root) {
  try {
    const shallow = execFileSync('git', ['rev-parse', '--is-shallow-repository'], { cwd: root, encoding: 'utf8' }).trim()
    // A shallow clone answers `--is-ancestor` WRONGLY rather than refusing: a
    // commit outside the graft window exits non-zero, byte-identical to "not an
    // ancestor". An Action on a default `fetch-depth: 1` checkout would
    // therefore annotate every published version as unreachable. Refuse, and
    // name the remedy.
    if (shallow === 'true') return { ok: false, why: 'this is a shallow clone; `git merge-base --is-ancestor` would answer wrongly rather than refuse. Check out with fetch-depth: 0.' }
    return { ok: true }
  } catch {
    return { ok: false, why: 'not a git repository, or git is unavailable' }
  }
}

/** Every package in the tree that a registry could have published. */
export function publishablePackages(root, files = walk(root)) {
  const out = []
  for (const f of files) {
    if (f !== 'package.json' && !f.endsWith('/package.json')) continue
    const pkg = readJson(join(root, f))
    if (!pkg || pkg.private || typeof pkg.name !== 'string' || typeof pkg.version !== 'string') continue
    out.push({
      file: f,
      name: pkg.name,
      version: pkg.version,
      // Ask each package its OWN registry. A 404 from npmjs says nothing about
      // a package whose publishConfig names GitHub Packages.
      registry: (pkg.publishConfig?.registry ?? 'https://registry.npmjs.org').replace(/\/$/, ''),
    })
  }
  return out
}

const reaches = (sha, ref, root) => {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', sha, ref], { cwd: root, stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

export const publishedFrom = {
  id: 'published-from',
  about: 'A published version records the commit it was built from. One the default branch cannot reach was published from somewhere else — and if the version numbers happen to match, every version check in the world sees agreement.',
  needs: { network: true, history: true },
  async run({ root, files, fetchImpl, ref }) {
    const history = canAskAncestry(root)
    const pkgs = publishablePackages(root, files)
    if (!history.ok) return { checked: 0, findings: [], unknown: [{ what: 'every package', why: history.why }] }

    const findings = []
    const unknown = []
    let checked = 0

    for (const p of pkgs) {
      const url = `${p.registry}/${p.name.replace('/', '%2F')}`
      const res = await ask(url, { fetchImpl })
      if (res.state !== 'answered') {
        unknown.push({ what: `${p.name} at ${p.registry}`, why: res.why ?? res.state })
        continue
      }
      // Never published is not a defect. It is the normal state of most code.
      if (res.status === 404) continue
      if (res.status >= 400) {
        unknown.push({ what: `${p.name} at ${p.registry}`, why: `registry answered ${res.status}` })
        continue
      }
      let doc = null
      try {
        doc = await (await fetchImpl(url)).json()
      } catch {
        unknown.push({ what: p.name, why: 'the registry answered, and the body did not parse' })
        continue
      }
      const v = doc?.versions?.[p.version]
      if (!v) continue
      const sha = v.gitHead
      if (typeof sha !== 'string' || !/^[0-9a-f]{7,40}$/.test(sha)) {
        // npm records `gitHead` only when the publish happened in a git
        // worktree. Its absence is not evidence of anything.
        unknown.push({ what: `${p.name}@${p.version}`, why: 'the registry records no gitHead for this version' })
        continue
      }
      checked++
      if (!reaches(sha, ref, root)) {
        findings.push({
          key: `${p.name}@${p.version}`,
          file: p.file,
          message: `${p.name}@${p.version} was published from ${sha.slice(0, 12)}, which ${ref} does not reach`,
          detail: 'The artefact people install was built from a commit that is not on the branch this repository ships. If the version numbers match, nothing else will ever notice.',
        })
      }
    }
    return { checked, findings, unknown }
  },
}

// ── 3 · well-known ─────────────────────────────────────────────────────────

/**
 * A promise is a whole string value that IS a well-known path.
 *
 * Not a substring of a sentence, and not a fixture. Three passes of narrowing
 * got here, each removing a class of finding that was real text and not a real
 * promise:
 *
 *   64 → a framework route file is the IMPLEMENTATION of a surface, not an
 *        undeclared one
 *   33 → a path inside a README, a code comment or a generator template is a
 *        description, not a declaration
 *    4 → a path inside a conformance corpus or a schema's `examples` is test
 *        data by construction, and a path inside a sentence in a JSON string
 *        is still a sentence
 *
 * So: parse the JSON, walk its values, and count a value only when the ENTIRE
 * value is the path. A machine reading that file would follow it; a machine
 * reading a sentence would not.
 *
 * JSON only. YAML would need a parser, and this package takes no dependency —
 * which is a real limit and is stated rather than hidden.
 */
const WHOLE_VALUE = /^(?:https?:\/\/[^/]+)?\/?\.?well-known\/([A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*)$/

/** Fixture directories, by the conventions everybody already uses. */
const FIXTURE = /(^|\/)(conformance|fixtures?|__fixtures__|testdata|test-data|examples?|mocks?|snapshots?)(\/|$)/

/** Every string value in a parsed document, however deep. */
function* strings(node, depth = 0) {
  if (depth > 12) return
  if (typeof node === 'string') yield node
  else if (Array.isArray(node)) for (const v of node) yield* strings(v, depth + 1)
  else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      // A schema's own `examples` and `default` are illustrations of the
      // shape, never the repository promising a surface.
      if (k === 'examples' || k === 'example' || k === 'default') continue
      yield* strings(v, depth + 1)
    }
  }
}

/** Both spellings. Some static hosts will not serve a dot-directory. */
const isWellKnownPath = (f) => /(^|\/)\.?well-known\//.test(f)

/**
 * The surface a path under `well-known/` actually serves.
 *
 * The first segment after the directory, and nothing after it. A framework
 * route handler lives at `app/.well-known/flashyos.json/route.ts` and serves
 * `/.well-known/flashyos.json` — so the surface is `flashyos.json` and
 * `route.ts` is its implementation. Reading the whole tail as the surface name
 * reported every route file in this monorepo as an undeclared surface, which
 * is 64 annotations a maintainer would read once before removing the tool.
 */
export function surfaceName(file) {
  const m = file.match(/(?:^|\/)\.?well-known\/([^/]+)/)
  return m ? m[1] : null
}

export const wellKnown = {
  id: 'well-known',
  about: 'A machine surface promised and absent answers 404 to the agent that believed you. A surface served and named nowhere is one nobody fetches, because nobody was told about it.',
  needs: { network: false, history: false },
  async run({ root, files }) {
    const served = new Map()
    for (const f of files) {
      if (!isWellKnownPath(f)) continue
      if (/\.test\.[cm]?[jt]sx?$/.test(f)) continue
      const name = surfaceName(f)
      if (name && !served.has(name)) served.set(name, f)
    }

    // Two kinds of reference, because a repository may name a surface by its
    // path or simply by its filename — `frontdoor.json` in a registry, a
    // route table, a README. Requiring the full `.well-known/` form reported
    // surfaces as undeclared that the repository names on almost every page.
    const byPath = new Map()
    const byName = new Set()
    for (const f of files) {
      if (isWellKnownPath(f)) continue
      if (!/\.(json|md|ts|tsx|js|mjs|cjs|ya?ml|txt|html)$/.test(f)) continue
      let text
      try {
        text = readFileSync(join(root, f), 'utf8')
      } catch {
        continue
      }
      if (text.length > 2_000_000) continue
      // A promise is only read out of a declaration, and only where the whole
      // value is the path. Being NAMED, the weaker and more forgiving test,
      // counts from anywhere including prose.
      if (f.endsWith('.json') && !FIXTURE.test(f)) {
        let doc
        try {
          doc = JSON.parse(text)
        } catch {
          doc = null
        }
        if (doc !== null) {
          for (const v of strings(doc)) {
            const m = v.match(WHOLE_VALUE)
            if (m && !byPath.has(m[1])) byPath.set(m[1], f)
          }
        }
      }
      for (const name of served.keys()) if (!byName.has(name) && text.includes(name)) byName.add(name)
    }

    const findings = []
    for (const [name, where] of [...byPath].sort()) {
      if (!served.has(name)) {
        findings.push({
          key: `.well-known/${name}`,
          file: where,
          message: `.well-known/${name} is referenced here and is not in the tree`,
          detail: 'An agent that believed the reference gets a 404.',
        })
      }
    }
    for (const [name, file] of [...served].sort()) {
      if (!byName.has(name)) {
        findings.push({
          key: file,
          file,
          message: `${file} is served and nothing in this repository names it`,
          detail: 'Over-declaring fails the first time anybody fetches. Serving and never declaring fails nothing, because nobody fetches what they were never told about.',
        })
      }
    }
    // Both directions counted: a repository with neither served nor referenced
    // surfaces checked nothing, and must not read as clean.
    return { checked: served.size + byPath.size, findings, unknown: [] }
  },
}

/** Every check, by id. The CLI's `--checks` names a subset of these. */
export const CHECKS = Object.freeze([schemaIds, publishedFrom, wellKnown])
