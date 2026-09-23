/**
 * Types for @flashyos/mesh-lint.
 *
 * Hand-written signatures over derived names: `types.test.mjs` imports the
 * real barrel and fails if this file declares an export the module does not
 * have, or omits one it does.
 */

// ── The report ──────────────────────────────────────────────────────────────

export interface Finding {
  /** Stable across runs, and what an allowance in `.mesh-lint.json` names. */
  key?: string
  /** Repository-relative, POSIX on every platform. */
  file: string
  message: string
  detail?: string
}

/**
 * A silence, never a finding.
 *
 * A URL that did not answer has not said the file is missing. These are
 * reported by name and enter no count of defects.
 */
export interface Unknown {
  what: string
  why: string
}

export interface CheckResult {
  id: string
  about: string
  /** How many things were actually examined. Zero is not clean. */
  checked: number
  findings: Finding[]
  unknown: Unknown[]
  /** Findings an allowance suppressed, each carrying its reason. */
  suppressed: (Finding & { why: string })[]
  /** Allowances matching nothing — an excuse that outlived what it excuses. */
  stale: string[]
  /** Present when the check threw. Not clean, and not a finding either. */
  failed?: string
}

export interface Report {
  root: string
  files: number
  results: CheckResult[]
  findings: number
  unknown: number
  suppressed: number
  /** Checks that examined nothing, by id. The vacuity guard, in the output. */
  vacuous: string[]
  failed: { id: string; why: string }[]
  stale: { id: string; key: string }[]
  configProblems: { why: string }[]
}

// ── Checks ─────────────────────────────────────────────────────────────────

export interface Check {
  id: string
  about: string
  /** Declared, so a runner can refuse honestly rather than half-answer. */
  needs: { network: boolean; history: boolean }
  run(ctx: {
    root: string
    files: string[]
    fetchImpl: typeof fetch
    ref: string
  }): Promise<{ checked: number; findings: Finding[]; unknown: Unknown[] }>
}

/** A JSON Schema `$id` that does not resolve, or two that disagree. */
export declare const schemaIds: Check

/** A published version whose commit the shipping branch cannot reach. */
export declare const publishedFrom: Check

/** A machine surface promised and absent, or served and named nowhere. */
export declare const wellKnown: Check

export declare const CHECKS: readonly Check[]

// ── Running ────────────────────────────────────────────────────────────────

export declare function lint(opts?: {
  root?: string
  checks?: readonly Check[]
  files?: string[]
  fetchImpl?: typeof fetch
  ref?: string
  config?: Record<string, { allow?: { key: string; why: string }[] }>
}): Promise<Report>

/** One `::notice` line per finding, in the form GitHub renders. */
export declare function annotations(report: Report): string[]

/** The human-readable report. */
export declare function render(report: Report): string

/** The branch an ancestry question is asked against. */
export declare function defaultRef(root: string, execImpl?: (args: string[], cwd: string) => string): string

// ── Allowances ─────────────────────────────────────────────────────────────

/** The shortest an excuse may be. */
export declare const WHY_MIN: number

export declare function readConfig(
  root: string,
  readImpl?: (path: string) => string,
): { config: Record<string, { allow?: { key: string; why: string }[] }>; problems: { why: string }[] }

export declare function applyAllowances(
  id: string,
  findings: Finding[],
  config: Record<string, { allow?: { key: string; why: string }[] }> | undefined,
): { kept: Finding[]; suppressed: (Finding & { why: string })[]; stale: string[] }

// ── The pieces, exported because they are testable alone ───────────────────

/** Every file under a root, relative and POSIX, skipping the uninteresting. */
export declare function walk(root: string, opts?: { limit?: number }): string[]

export declare function declaredSchemaIds(root: string, files?: string[]): { file: string; id: string }[]

export declare function publishablePackages(
  root: string,
  files?: string[],
): { file: string; name: string; version: string; registry: string }[]

/**
 * Whether this checkout can answer an ancestry question at all.
 *
 * A shallow clone answers `--is-ancestor` WRONGLY rather than refusing, so
 * this refuses first and names the remedy.
 */
export declare function canAskAncestry(root: string): { ok: boolean; why?: string }

/** The surface a path under `well-known/` serves — the first segment, only. */
export declare function surfaceName(file: string): string | null

// ── Silence ────────────────────────────────────────────────────────────────

export type Silence = 'unreachable' | 'ambiguous' | 'refused'

export declare function proxyUrl(env?: NodeJS.ProcessEnv): string | null

/** What a failed request entitles you to say. Never more than that. */
export declare function classify(error: unknown, env?: NodeJS.ProcessEnv): { state: Silence; why: string }
