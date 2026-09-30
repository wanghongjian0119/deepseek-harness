# Agent Note: Desktop update refuses a non-descendant baseline

Status: implemented

English | [中文](2026-09-30-desktop-update-downgrade.zh.md)

## Problem

The update check compared two commit SHAs for inequality: a different branch head was itself proof of newer code. Two refs that differ are not thereby ordered, so a source whose head the running payload had already passed read as an update and the Update Center offered it. On 2026-09-30 the configured source had been frozen at `d9489d83` (2026-09-18) since its daily baseline rebase began failing on 2026-09-26, while the installed payload came from `2b84d0298` (2026-09-30). Accepting the offer replaced the running 0.2.0-rc.2 payload with the 0.1.6-alpha.2 baseline: a silent downgrade that also dropped everything landed in between.

## Decision

`checkForUpdate` asks the compare API (`/repos/<repo>/compare/<current>...<latest>`) once the branch head differs from the payload's ref, and reports the answer as `UpdateRelation`: `ahead`, `behind`, `diverged`, `identical`, or `unknown`. `available` — which gates the install — is true only for `ahead`. The second request is skipped when the SHAs match, so an up-to-date app still costs one request.

`unknown` covers a ref the source repository does not contain, which GitHub answers with 404 — the normal case for a payload built from a local checkout — along with any status the compare API does not name. An unprovable direction installs nothing: a wrong "yes" replaces working code with older code, while a wrong "no" costs one manual update.

`describeUpdateCheck` renders each relation in the Update Center, so `behind`, `diverged`, and `unknown` name the two refs and the relation between them instead of reporting the app as up to date.

## Alternatives considered

- **Compare commit dates.** The commits API carries author and committer dates, which would order two refs without a second request. Rejected: a rebase or a force-push rewrites them, so the freshest commit by date can still be built from older code — the case that regressed here.
- **Keep the inequality check and repair the source instead.** Restoring the daily baseline rebase removes this instance but not the class: any fork, mirror, or temporarily rewound branch reproduces it, and the running app cannot tell which ref is newer.
- **Report every non-`ahead` relation as up to date.** Rejected: the window would claim the app is current while the source is stale, hiding the relation that explains the state.

## Consequences

An update can no longer install older code, and a stale or divergent source is visible in the Update Center instead of silently acted on. The cost: a payload whose commit the source repository does not contain cannot be updated from that source at all — the window reports `unknown` until the payload's ref appears there, which is the honest answer for a locally built payload pointed at an upstream repository.

## Verification

- `desktop-linux/tests/update-check.spec.ts` covers every relation, the 404 and unrecognized-status paths, the skipped comparison when the SHAs match, and a failed comparison request.
- `desktop-linux/tests/update-center.spec.ts` covers the copy rendered for every relation.
