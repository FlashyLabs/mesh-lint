# Changelog

All notable changes to `@flashyos/mesh-lint` are recorded
here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

**A version number is a promise about what this package will refuse.** A
change that makes it accept something it previously rejected is a major
version, even when the diff is one line.

## [Unreleased]

### Added

- Initial public release preparation.
- `main(argv?)` is now an exported entry point of the library barrel, declared
  in `src/index.d.ts` and pinned by `src/types.test.mjs`.
- `vendor-aao-check.mjs`, the estate's dependency-free AAO charter checker,
  vendored byte-identical from the aao repository so `MESH.md`'s documented
  `node vendor-aao-check.mjs validate flashyos.roles.json` command actually
  runs. A drift test in `src/drift.test.mjs` holds it against canon (UNKNOWN
  when the aao repository is not beside this one).
- `src/mesh.test.mjs`: asserts every local file and `node` command `MESH.md`
  references exists, and that the documented charter check exits 0 — the
  silent-reference defect mesh-lint itself was written to catch, now caught in
  this repository's own docs.

### Changed

- `src/cli.mjs` — the package `bin` — is now a thin wrapper that imports and
  calls `main` from `src/mesh-lint.mjs`, replacing a 263-line byte-for-byte
  copy of that module that nothing held equal and that could silently diverge.
  No change to any check's behaviour or to the CLI's flags, output or exit
  codes.
