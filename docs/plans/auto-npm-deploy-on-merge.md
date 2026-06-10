# Auto npm publish on merge to `main`

Status: proposed
Scope: `agent-isles` npm package — publish a new version automatically on every merge to `origin/main`.

---

## 1. Recommendation summary

**Use an auto-incrementing alpha prerelease, with the next version derived from the npm registry at publish time** (option 3, hardened). The package is pre-1.0 alpha (`package.json:3` → `0.1.0-alpha.0`) publishing to the `next` dist-tag (`package.json:44-47`), so semantic version meaning is deliberately deferred — consumers opt in via `agent-isles@next`. Deriving the next `-alpha.N` from `npm view` (not from a committed counter) makes the workflow idempotent, immune to infinite bump-commit loops, and tolerant of branch protection: the commit-back of the bumped `package.json` is a best-effort convenience, never a correctness requirement. It literally satisfies "every merge publishes" (semantic-release would skip `docs:`/`chore:` merges, and `main` already has 5 non-conforming commit subjects out of ~77, e.g. `Support full-page dark mode propagation (#136)`), needs zero new dependencies, and reuses every hardening step from the existing `npm-release.yml` (provenance, `npm ci`, full tests, pack dry-run, already-published guard). Revisit **Changesets** when the package graduates to 1.0 / `latest` and changelogs + deliberate semver start to matter.

## 2. Decision matrix

| Criterion | 1. Changesets | 2. semantic-release | 3. Auto-increment prerelease (recommended) |
|---|---|---|---|
| Publishes on *every* merge | No — batches bumps into a "Version Packages" PR; publish happens when *that* PR merges. Snapshot mode exists but yields timestamp versions and still needs changeset files. | Mostly — but `docs:`, `chore:`, `ci:`, `test:`, `refactor:` and malformed subjects produce **no release**. ~6% of current `main` history would silently not publish. | Yes — unconditional bump per merge. |
| Version semantic accuracy | High (human-declared intent per PR) | High *if* commit discipline holds; squash-merge titles must stay conventional | None beyond the alpha counter — acceptable: the whole point of `0.1.0-alpha.N` on `next` is "every build is a snapshot" |
| Contributor burden | High — every PR needs a changeset file (or a bot nags) | Medium — enforce Conventional Commits on squash titles | Zero |
| Setup effort / new deps | Medium — `@changesets/cli`, `@changesets/action`, config, bot PR flow | High — `semantic-release` + 4-5 plugins, `.releaserc`, prerelease-channel branch config (notoriously fiddly pre-1.0), and it owns tagging/GH releases | Low — one workflow file, ~30 lines of shell, `npx semver` only |
| Loop risk (bump commit retriggering CI) | Low (bot PR pattern) | None (doesn't commit `package.json` by default — repo version goes stale) | None — version derived from registry; commit-back is optional and double-guarded (`GITHUB_TOKEN` pushes don't trigger workflows + `[skip ci]`) |
| Fit for alpha / `next` dist-tag | Poor now, **best at 1.0** | Workable (`prerelease: 'alpha'`, `channel: 'next'` branch config) but config churn at graduation | Best — matches current posture exactly; graduation is "merge a PR that sets a stable version" |
| Changelog / GH Releases | Excellent | Excellent | Adequate — auto `gh release create --generate-notes` per publish |
| Traceability | Tags + changelog | Tags + releases | Tag `vX.Y.Z-alpha.N` + GitHub prerelease per publish |

## 3. Proposed workflow: `.github/workflows/npm-publish.yml`

This **replaces** `.github/workflows/npm-release.yml` (see §6). It reuses, line for line where possible, the existing hardening: Playwright install pattern (`ci.yml:27-33`), full `npm test` (`package.json:18-20` — unit + Playwright browser tests; `prepack` at `package.json:22` rebuilds via rollup on publish), render smoke and `pack:dry-run` (`npm-release.yml:54-61`), already-published guard (`npm-release.yml:45-52`), and `--provenance` with `id-token: write` (`npm-release.yml:7-9`, `npm-release.yml:63-73`).

```yaml
name: Publish npm package on merge

"on":
  push:
    branches: [main]
  workflow_dispatch:
    inputs:
      dry_run:
        description: "Run everything but publish with --dry-run and skip tag/release"
        type: boolean
        default: false

permissions:
  contents: write   # push version-bump commit + tag, create GitHub Release
  id-token: write   # npm --provenance attestation

# Serialize publishes. A second merge while one is running queues; a third
# supersedes the queued one. Each run re-derives the version from the
# registry at start, so superseded runs lose nothing.
concurrency:
  group: npm-publish-main
  cancel-in-progress: false

jobs:
  publish:
    name: Test, version, publish
    runs-on: ubuntu-latest
    # Belt-and-suspenders: GITHUB_TOKEN pushes never trigger workflows, but if
    # the bump push is ever switched to a PAT this guard still stops the loop.
    if: ${{ !startsWith(github.event.head_commit.message, 'chore(release):') }}

    steps:
      - name: Check out repository
        uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          registry-url: https://registry.npmjs.org

      - name: Install dependencies
        env:
          PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: "1"
        run: npm ci

      - name: Install Playwright Chromium
        run: npx playwright install --with-deps chromium

      - name: Run tests
        run: npm test

      - name: Render demo smoke test
        run: npm run render -- --out dist/demo.html --assets local

      - name: Compute next version from registry
        id: version
        run: |
          set -euo pipefail
          PKG_NAME="$(node -p "require('./package.json').name")"
          PKG_VERSION="$(node -p "require('./package.json').version")"
          NEXT_TAG="$(npm view "${PKG_NAME}@next"   version 2>/dev/null || echo "")"
          LATEST_TAG="$(npm view "${PKG_NAME}@latest" version 2>/dev/null || echo "")"

          # Highest version already on the registry (next or latest channel).
          PUBLISHED="$(npx --yes semver ${NEXT_TAG:+"$NEXT_TAG"} ${LATEST_TAG:+"$LATEST_TAG"} | tail -n1 || echo "")"

          if [ -z "$PUBLISHED" ]; then
            # Nothing published yet: publish package.json as-is.
            NEXT_VERSION="$PKG_VERSION"
          elif [ "$PKG_VERSION" != "$PUBLISHED" ] && \
               [ "$(npx --yes semver "$PKG_VERSION" "$PUBLISHED" | tail -n1)" = "$PKG_VERSION" ]; then
            # package.json was manually bumped AHEAD of the registry
            # (e.g. 0.2.0-alpha.0, or a stable 0.1.0 for graduation): honor it.
            NEXT_VERSION="$PKG_VERSION"
          else
            # Normal case: increment the alpha counter on the published version.
            NEXT_VERSION="$(npx --yes semver -i prerelease --preid alpha "$PUBLISHED")"
          fi

          # Final guard (mirrors the old npm-release.yml check): never overwrite.
          if npm view "${PKG_NAME}@${NEXT_VERSION}" version >/dev/null 2>&1; then
            echo "::error::${PKG_NAME}@${NEXT_VERSION} is already published"; exit 1
          fi

          # Prerelease -> next, stable -> latest (same split as npm-release.yml).
          case "$NEXT_VERSION" in
            *-*) DIST_TAG="next" ;;
            *)   DIST_TAG="latest" ;;
          esac

          echo "version=${NEXT_VERSION}" >> "$GITHUB_OUTPUT"
          echo "dist_tag=${DIST_TAG}"    >> "$GITHUB_OUTPUT"
          echo "Publishing ${PKG_NAME}@${NEXT_VERSION} to dist-tag ${DIST_TAG}"

      - name: Apply version to package.json
        run: npm version "${{ steps.version.outputs.version }}" --no-git-tag-version

      - name: Verify package contents
        run: npm run pack:dry-run

      - name: Publish to npm
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
          DRY_RUN: ${{ inputs.dry_run && '--dry-run' || '' }}
        run: npm publish --access public --tag "${{ steps.version.outputs.dist_tag }}" --provenance $DRY_RUN

      - name: Commit version bump and tag (best effort)
        if: ${{ !inputs.dry_run }}
        run: |
          set -euo pipefail
          VERSION="${{ steps.version.outputs.version }}"
          git config user.name  "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add package.json package-lock.json
          git commit -m "chore(release): v${VERSION} [skip ci]"
          git tag "v${VERSION}"
          if ! git push origin "HEAD:main" "v${VERSION}"; then
            echo "::warning::Could not push bump commit/tag (branch protection or a \
          newer merge). Safe to ignore: the next run derives its version from the registry."
          fi

      - name: Create GitHub release
        if: ${{ !inputs.dry_run }}
        continue-on-error: true
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          VERSION="${{ steps.version.outputs.version }}"
          PRERELEASE_FLAG=""
          case "$VERSION" in *-*) PRERELEASE_FLAG="--prerelease" ;; esac
          gh release create "v${VERSION}" --generate-notes $PRERELEASE_FLAG \
            --title "v${VERSION}"
```

### How the pieces satisfy the requirements

- **Version determination**: derived from `npm view <pkg>@next` / `@latest` at run time, with `npx semver` doing the comparison and `-i prerelease --preid alpha` doing the bump. The repo's `package.json` version only matters when it is *ahead* of the registry (manual minor bump or stable graduation) — then it is published verbatim.
- **No infinite loop**, three independent layers: (1) pushes made with the default `GITHUB_TOKEN` never trigger new workflow runs (GitHub platform rule); (2) `[skip ci]` in the bump commit message; (3) the job-level `if:` guard on `chore(release):` subjects.
- **Hardening reuse**: identical Playwright pattern as `ci.yml:27-33` and `npm-release.yml:27-33` (`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` on `npm ci`, then `npx playwright install --with-deps chromium` — required because `npm test` runs Playwright browser tests, `package.json:18-20`); render smoke + `pack:dry-run` as in `npm-release.yml:54-61`; already-published guard folded into the compute step; `--provenance` + `id-token: write` as in `npm-release.yml:7-9,63-73`.
- **dist-tag**: prerelease versions → `next`, stable → `latest`, same split as `npm-release.yml:63-73`. `publishConfig` (`package.json:44-47`) keeps `next` as the safe default for any manual publish.
- **Concurrency**: `group: npm-publish-main`, `cancel-in-progress: false` — runs queue; the registry-derived version means even a superseded queue entry never causes a collision or a skipped number that matters.
- **Failure handling**: tests/render/pack failures abort before any version or publish side effect. Publish failure leaves the repo untouched (bump commit/tag are pushed only *after* a successful publish) — just re-run. Bump-push failure is a warning, self-heals next run. "Already published" is a hard `exit 1` only in the pathological case (manual out-of-band publish racing the workflow) — fail loudly is correct there.

### Optional variant: npm Trusted Publishing (OIDC) instead of `NPM_TOKEN`

npm supports trusted publishing from GitHub Actions (GA since 2025): configure a Trusted Publisher on the package's npmjs.com settings (owner `zpyoung`, repo `agent-isles`, workflow file `npm-publish.yml`), require npm CLI ≥ 11.5.1 in the job (`npm install -g npm@latest` after `setup-node`, since Node 20 bundles npm 10.x), keep `id-token: write`, and **delete** the `NODE_AUTH_TOKEN` env from the publish step. Provenance is then attached automatically and there is no long-lived secret to rotate. Recommended as a fast-follow once the workflow is proven with the token; the YAML above works unchanged apart from those two edits.

## 4. Supporting config

None required — that is a deliberate advantage of the recommendation. No `.releaserc`, no `.changeset/`, no new devDependencies (`npx --yes semver` resolves the standalone `semver` CLI on demand). The only repo file changes are:

1. Add `.github/workflows/npm-publish.yml` (above).
2. Delete `.github/workflows/npm-release.yml` (§6).
3. Update `docs/MAINTAINER_PLAYBOOK.md:144-147` — "Ask Zach first: npm publish, creating a GitHub release" is superseded for *alpha/`next`* publishes by this automation; keep the approval boundary for *stable/`latest`* graduation (which still requires a deliberate human PR, see §7).

## 5. Repo setup checklist

- [ ] **`NPM_TOKEN` secret** (already used by `npm-release.yml:66`): confirm it is a **granular automation token** with publish scope limited to `agent-isles`, 2FA-bypass for automation, and note its expiry date (granular tokens expire — set a calendar reminder or move to Trusted Publishing, §3 variant, which eliminates it).
- [ ] **Actions workflow permissions**: the workflow declares `permissions: contents: write` explicitly, which works regardless of the repo-level default. If the repo/org setting "Workflow permissions" is pinned to *read-only with no per-workflow elevation* (rare), relax it.
- [ ] **Branch protection / rulesets on `main`**: if "require a pull request" is enforced with no bypass, the bump commit push will fail (the workflow tolerates this — see warning path — but `package.json` on `main` will drift behind the registry). To keep them in sync, add a ruleset bypass for the `github-actions` app, or accept the drift (the registry is the source of truth either way).
- [ ] **Repo must remain public** for `--provenance` to succeed with the free npm tier.
- [ ] **dist-tag hygiene (do once, now)**: the registry currently has `latest: 0.1.0-alpha.0` — the very first publish pinned `latest` to the alpha, so `npm install agent-isles` today installs prerelease code. Either accept it until graduation, or after the first auto-publish run: `npm dist-tag add agent-isles@<newest-alpha> latest` is wrong (still alpha) — realistically just leave it and let the first stable publish repoint `latest` correctly.
- [ ] Delete `.github/workflows/npm-release.yml` in the same PR that adds `npm-publish.yml` (never have both live — §6).
- [ ] Update `docs/MAINTAINER_PLAYBOOK.md:144-147` approval boundaries.

## 6. Relationship to the existing `npm-release.yml`: **replace it**

Delete `.github/workflows/npm-release.yml`. Rationale:

- **It would break, not just duplicate.** The new workflow creates GitHub Releases. Releases created with `GITHUB_TOKEN` do *not* trigger other workflows, so there is no double-publish — but any **manually** created GitHub Release (its trigger, `npm-release.yml:3-5`) would now hit the already-published guard (`npm-release.yml:45-52`) and `exit 1`, producing a red run for a version that is already correctly on npm. Its tag-matches-package.json validation (`npm-release.yml:35-43`) also becomes unreliable whenever the bump-commit push was skipped by branch protection.
- **Everything it does is subsumed**: tests, render smoke, pack dry-run, provenance publish, prerelease→`next`/stable→`latest` split all live in the new workflow; the manual escape hatch is now `workflow_dispatch` (with a `dry_run` input the old workflow never had).
- Keeping it "just in case" invites the classic two-publishers failure mode where nobody is sure which workflow owns a release. Git history preserves it if ever needed.

`ci.yml`, `browser-smoke.yml`, and `static.yml` are untouched and continue to run on push to `main`. Yes, that means tests run ~3x per merge (CI, browser-smoke, publish) — accepted: the publish job must gate on its *own* test run atomically rather than trust a sibling workflow's result. (A `workflow_run`-chained design was considered and rejected: it complicates failure semantics and loses the atomic test→publish guarantee for marginal compute savings.)

## 7. Rollout steps

1. **PR 1** — add `.github/workflows/npm-publish.yml`, delete `npm-release.yml`, update `MAINTAINER_PLAYBOOK.md`. Review, merge.
   - The merge of PR 1 itself triggers the first run. Expected outcome: registry has `0.1.0-alpha.0` (published), repo has `0.1.0-alpha.0` → compute step increments → publishes `0.1.0-alpha.1` to `next`, pushes `chore(release): v0.1.0-alpha.1 [skip ci]` + tag `v0.1.0-alpha.1`, creates GitHub prerelease.
   - If you want a rehearsal **before** that live run: merge PR 1 with the publish step temporarily hard-coded to `--dry-run`, then trigger **`workflow_dispatch` with `dry_run: true`** from the Actions tab; inspect the logs (computed version, pack contents) and then remove the hard-coding. Alternatively test on a fork with a scoped throwaway package name.
2. **Verify**: `npm view agent-isles dist-tags` shows `next: 0.1.0-alpha.1`; `npm i agent-isles@next` in a scratch dir; check the provenance badge on npmjs.com; confirm `main` got exactly one bot commit and no second workflow run was triggered by it.
3. **Merge a trivial follow-up PR** and confirm `0.1.0-alpha.2` appears — proves the increment path, the loop guards, and concurrency queueing.
4. **Graduation to stable (when ready)**: open a PR that sets `"version": "0.1.0"` (or `1.0.0`) in `package.json`. On merge, the compute step sees a repo version ahead of the registry with no prerelease suffix → publishes it verbatim to **`latest`**, creates a non-prerelease GitHub Release. The next ordinary merge after that auto-resumes the alpha train at `0.1.1-alpha.0` on `next`. If you instead want to *stop* prereleases at 1.0, that is the moment to swap this workflow for Changesets (§2).

## 8. Risks & mitigations

| Risk | Mitigation |
|---|---|
| **Infinite loop of bump commits** | Triple guard: `GITHUB_TOKEN` pushes don't trigger workflows (platform-level), `[skip ci]` in the commit message, job `if:` filter on `chore(release):`. If a PAT is ever introduced for branch-protection bypass, layers 2–3 still hold. |
| **Two rapid merges double-publish / collide** | `concurrency` group serializes runs; version is computed from the registry at run start, so the queued run always picks the next free number. The final already-published `exit 1` guard catches any out-of-band race. |
| **Bump push rejected (branch protection / newer merge)** | Push is explicitly best-effort with a `::warning`; correctness is unaffected because the registry, not `package.json`, drives versioning. Add a ruleset bypass for the Actions app if the drift is annoying. |
| **Provenance failure** (`--provenance` errors if OIDC token unavailable or repo visibility changes) | `id-token: write` is declared at workflow level; repo must stay public. If a provenance outage ever blocks an urgent publish, re-run via `workflow_dispatch` after temporarily removing the flag — never remove it permanently. |
| **`NPM_TOKEN` expiry/revocation** (granular tokens expire) | Publish step fails cleanly with E401 before any git side effects; rotate the secret, re-run. Better: adopt Trusted Publishing (§3 variant) and delete the secret. |
| **Every merge publishes — including docs-only churn** | By design (the stated requirement). If `next` gets noisy, add `paths-ignore: ["docs/**", "**/*.md"]` to the `push` trigger — note this trades away "every merge". |
| **Alpha→stable graduation mistakes** (accidental stable publish) | A stable version can only reach `latest` via an explicit human-authored `package.json` edit in a reviewed PR — the automation can never *invent* a stable version (`semver -i prerelease` always yields a prerelease). Matches the playbook's "Ask Zach first" boundary in spirit. |
| **`latest` currently points at the alpha** (`0.1.0-alpha.0`) | Pre-existing registry state, not caused by this plan; first stable publish repoints it. Until then, README/installation docs should keep instructing `npm i agent-isles@next`. |
| **Stale `package.json` confuses local `npm pack`** | Only occurs if bump pushes persistently fail (branch protection); fix the ruleset bypass, or run `npm version <registry-version> --no-git-tag-version` locally before packing. |
