/**
 * MESH.md references only files and commands that exist.
 *
 * MESH.md told a reader to run `node vendor-aao-check.mjs validate
 * flashyos.roles.json` while that file was absent from the tree — a documented
 * command that fails the moment anyone runs it, and the exact class of defect
 * mesh-lint's own `well-known` check exists to catch: a reference to something
 * that is not there, with nothing red until a human follows it. A document
 * cannot lint itself, so this test does.
 *
 * Scope, stated rather than hidden: it holds MESH.md's LOCAL references —
 * markdown links to paths in this repository, and the scripts of `node <file>`
 * commands meant to be run from a checkout. It deliberately does NOT assert the
 * monorepo commands the document marks as run elsewhere (`npx tsx
 * packages/api/scripts/…` "from a machine that holds DATABASE_URL", `npx
 * @flashyos/conformance <domain>` against a live domain): those name files in
 * other repositories and a domain, neither of which a checkout can see, and
 * asserting them would report UNKNOWN as a defect — the mistake mesh-lint
 * refuses everywhere else.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const MESH = readFileSync(join(ROOT, 'MESH.md'), 'utf8')

/** Markdown link targets that point at a file in this repository. */
function localLinkTargets(md) {
  const out = []
  for (const m of md.matchAll(/\]\(([^)]+)\)/g)) {
    const target = m[1].trim()
    // Not a URL, not a bare anchor, not a mailto — a path this checkout holds.
    if (/^[a-z]+:\/\//i.test(target) || target.startsWith('#') || target.startsWith('mailto:')) continue
    out.push(target.split('#')[0])
  }
  return out
}

/**
 * The script of every `node <file> …` command in a fenced block, plus any file
 * argument to it that names a data file by a known extension. A `<placeholder>`
 * or a flag is neither.
 */
function nodeCommandFiles(md) {
  const out = []
  for (const line of md.split('\n')) {
    const m = line.match(/\bnode\s+(\S+\.mjs)\b(.*)$/)
    if (!m) continue
    out.push(m[1])
    for (const tok of m[2].trim().split(/\s+/)) {
      if (!tok || tok.startsWith('-') || tok.startsWith('<') || tok.startsWith('#')) continue
      if (/\.(json|mjs|cjs|js)$/.test(tok)) out.push(tok)
    }
  }
  return out
}

const links = localLinkTargets(MESH)
const commandFiles = nodeCommandFiles(MESH)

describe('MESH.md points only at things that exist', () => {
  test('the scan actually found references', () => {
    // Vacuity guard. If either regex quietly matched nothing, the assertions
    // below would pass over empty lists and certify a document read by no one.
    assert.ok(links.length > 0, 'no local markdown links parsed out of MESH.md')
    assert.ok(commandFiles.length > 0, 'no `node <file>` commands parsed out of MESH.md')
    // The reference whose absence was the defect must be one of them.
    assert.ok(commandFiles.includes('vendor-aao-check.mjs'), 'MESH.md no longer runs vendor-aao-check.mjs — the case this test was written for')
  })

  for (const target of [...new Set(links)]) {
    test(`local link → ${target} exists`, () => {
      assert.ok(existsSync(join(ROOT, target)), `MESH.md links [..](${target}) and the file is not in the tree`)
    })
  }

  for (const file of [...new Set(commandFiles)]) {
    test(`node-command file → ${file} exists`, () => {
      assert.ok(existsSync(join(ROOT, file)), `MESH.md runs a command against ${file} and it is not in the tree`)
    })
  }
})

describe('the documented charter check runs and passes', () => {
  // Existence is not enough: MESH.md claims `node vendor-aao-check.mjs validate
  // flashyos.roles.json` reports "0 issues". Run exactly that and hold it to
  // exit 0 — asserting the command's behaviour, not the sentence about it.
  // Both files are in this repository, so this needs no sibling and never skips.
  test('vendor-aao-check.mjs validate flashyos.roles.json exits 0', () => {
    let status = 0
    let output = ''
    try {
      output = execFileSync('node', ['vendor-aao-check.mjs', 'validate', 'flashyos.roles.json'], {
        cwd: ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch (e) {
      status = e.status ?? 1
      output = `${e.stdout ?? ''}${e.stderr ?? ''}`
    }
    assert.equal(status, 0, `the documented charter check did not pass:\n${output}`)
  })
})
