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

> **Not released yet.** The source for this one is still being written.
>
> Everything below is the design and the reasoning. The code lands before
> this repository is tagged, and the version stays at 0.0.0 until it does.

## Using it

```yaml
- uses: flashylabs/mesh-lint@v1
  with:
    checks: schema-ids,published-from,declared-surfaces
```

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

## What mesh-lint is not

- **Not a style linter.** It has no opinion about your code.
- **Not a gate by default.** It annotates. Making it fail a build is your decision to take deliberately.

## Status

**Not released.** The checks exist and run inside the estate that
found them; packaging them as an Action is the next piece of work. This
repository is the licence, the security policy and the direction — nothing
here is installable yet, and the version will say 0.1.0 on the day it is.

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
