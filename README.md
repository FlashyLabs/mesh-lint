# mesh-lint

**A GitHub Action for the checks that fail silently.**

Annotates a pull request with the defects nothing else reports: a JSON Schema `$id` that 404s, a package published from a commit the default branch does not reach, a surface served and never declared. Every check here is a real defect this estate shipped and did not notice.

> **Not released yet.** The source for this one is still being written. The design and the reasoning are below;
> the code lands before this repository is tagged.

## Install

```bash
uses: flashylabs/mesh-lint@v1
```

## Why it exists

Everything here exists because of a defect that shipped somewhere real and
was not noticed. The failure mode these share is a confident wrong answer
rather than an error: nothing goes red, the number looks fine, and it is
acted on.

## It works alone

No account, no API key, no telemetry, and no network call unless you ask
for one. If a tool here ever needs a service of ours to answer, that is a
bug — you would be right to refuse a checker with a dependency on the party
being checked.

## Licence

Apache-2.0, copyright Flashy Labs. See [LICENSE](LICENSE).

## If you are here from a `$id` or a corpus

The formats these tools were written for are published, machine-readable and
implementable without installing anything:

```bash
curl -s https://flashyos.com/.well-known/specs.json | jq .
```
