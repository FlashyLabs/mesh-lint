# mesh-lint

```
        ██
       ██
      ██████
        ██
       ██
      ██
```

[![CI](https://github.com/flashylabs/mesh-lint/actions/workflows/ci.yml/badge.svg)](https://github.com/flashylabs/mesh-lint/actions/workflows/ci.yml) [![License](https://img.shields.io/badge/licence-Apache--2.0-blue)](LICENSE)

**A GitHub Action for the checks that fail silently.**

Annotates a pull request with the defects nothing else reports: a JSON Schema `$id` that 404s, a package published from a commit the default branch does not reach, a file served at a URL nothing declares. None of these turns anything red today, and each one was a real defect somebody shipped without noticing.

## Using it

From a clone, today — no install, no registry:

```bash
git clone https://github.com/flashylabs/mesh-lint && cd mesh-lint
node src/cli.mjs --root /path/to/your/repo
```

Once it is on npm and tagged (it is neither yet — see **Status**), the same
checks run as one command, and as an Action:

```bash
npx @flashyos/mesh-lint                       # every check, this directory
npx @flashyos/mesh-lint --checks well-known   # one of them
npx @flashyos/mesh-lint --json                # machine-readable
npx @flashyos/mesh-lint --gate                # exit 1 on a finding
```

```yaml
- uses: flashylabs/mesh-lint@v1
  with:
    checks: schema-ids,published-from,well-known
    gate: false
```

It **annotates and does not fail your build** unless you pass `gate: true`. A
tool that turns a repository red on arrival is one people remove before
reading what it found.

`published-from` asks an ancestry question, so it needs history:
`actions/checkout@v5` with `fetch-depth: 0`. On a shallow clone it refuses
by name rather than answering — `git merge-base --is-ancestor` exits non-zero
for a commit outside the graft window, which is byte-identical to *not an
ancestor*, so the wrong answer arrives looking exactly like the right one.

## The invariants

Everything here follows from these. Each is enforced by something rather
than promised, because a rule with nothing behind it erodes one
convenience at a time.

| Invariant | Why | Enforced by |
| --- | --- | --- |
| **Every finding is reproducible locally** | An Action that finds something you cannot reproduce is an Action people disable | Each check is a command you can run yourself |
| **A silence is never a finding** | A URL that did not answer has not said the file is missing | `unreachable`, `ambiguous` and `refused` are reported as themselves |
| **No check needs a service of ours** | A linter with a dependency on the party being linted is one you should refuse | Everything runs from your own checkout and your own network |

## It works alone

No account, no API key, no telemetry, and no network call unless you ask
for one. If anything here ever needs a service of ours to answer, that is a
bug — you would be right to refuse a checker with a dependency on the party
being checked. That applies to the documentation too: every command in this
file runs against a file in this repository, because a README whose first
line fetches from our domain is one that stops working when we do.

## Types

Shipped, and checked against the module rather than against somebody’s
memory of it. `src/types.test.mjs` imports the real barrel and fails if a
declaration names an export that does not exist, or if an export has no
declaration — the two directions a `.d.ts` rots in, neither of which a
compiler can catch, because a declaration file is authoritative by
construction.

```ts
import { lint, annotations, CHECKS, canAskAncestry } from '@flashyos/mesh-lint'
```

## What mesh-lint is not

- **Not a style linter.** It has no opinion about your code.
- **Not a gate by default.** It annotates. Making it fail a build is your decision to take deliberately.

## Status

**Not released. The code is here; the distribution is not.**

The three checks run, are tested against fixtures rather than against the
estate that found them, and `action.yml` is a composite action with no build
step. What does not exist yet is a published package or a tag — measured
2026-09-23, `@flashyos/mesh-lint` answers 404 on npm and this repository has
no tags — so `npx @flashyos/mesh-lint` and `uses: flashylabs/mesh-lint@v1`
both fail today. Clone it and run `node src/cli.mjs` until they do.

That gap is named here rather than left for the first person who copies a line
out of the section above, which is the same defect this package's own
`well-known` check exists to find.

## Contributing

**The most useful thing you can send is an implementation that disagrees
with ours about a refusal.** Two implementations that have never met,
agreeing about what to reject, is the only real evidence a specification
says what it means.

Sign-off rather than a copyright assignment — see
[CONTRIBUTING.md](CONTRIBUTING.md). There is no CLA.

## Licence

[Apache-2.0](LICENSE), copyright Flashy Labs. The rules are open and the
tooling is open; fork either, and check ours against yours.

## The formats these were written for

`directory/1`, `frontdoor/1`, `countersign/1`, `backlog/1`, `shipped/1` and the
rest are Apache-2.0 and specified in the open at
[github.com/flashylabs](https://github.com/flashylabs). Nothing in them requires
an account, a key, or a call to us — including the checking.
