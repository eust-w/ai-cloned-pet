# Alpha Verification

Recorded on 2026-10-26, macOS, Node.js 24.14.0. These are bounded checks, not a production-readiness claim.

| Check | Result | Boundary |
| --- | --- | --- |
| TypeScript, ESLint, production build | Passed locally | CI is a separate run |
| Unit and integration suite | 11 tests passed | Synthetic fixtures cover validation; not model quality |
| Clean source package | Fresh Node.js 24 install, 11 tests, build passed | No private `.env` or media included |
| Dependencies | `npm audit` reported 0 vulnerabilities | Snapshot, not a security guarantee |
| Source / Git history | Gitleaks scan passed | Local media and future release attachments need separate review |
| Real Coco ingestion | 2 photos + 4 videos; 24 extracted frames; 8 local photo atlases | No new paid image or vision request |
| Real browser | Chromium, 1600x1000 and 390x844 | Browser plugin absent; regular Playwright used |
| Interaction | Pointer movement persists, touch feedback appears, local rest command stops wandering without recentering | Pose transformations are not articulated animation |
| Runtime cost boundary | Only one local interaction POST per browser scenario; `useProvider: false` | Does not assert that paid provider calls are free |
| Layout and console | No horizontal overflow or browser runtime errors in these scenarios | Other browsers, OSes and accessibility flows remain unverified |

Clean-package line coverage was 47.37%, excluding the client. This does not meet an 80% coverage target. Paid provider generation, identity consistency, matte quality, and natural motion are **not** certified by this test suite. The existing generated Coco asset was reused for browser testing.

## Reproduce

```sh
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npm audit --audit-level=high
npx playwright install chromium
npm run dev
# In another terminal, after creating a pet and an avatar:
PET_TEST_NAME=your-pet npm run test:browser
```

Real-media ingestion uses `COCO_TEST_MEDIA` and `npm run test:real:coco`; see the README before enabling paid provider flags. The browser check reads existing assets and makes a real local interaction request. It does not mock API responses or call generation endpoints.

Screenshots, request summaries, videos, source packages and personal demo material stay in ignored `.artifacts/`. Do not commit that directory. Review the actual video and sprite quality separately from automated test results.
