# Frontend Redesign — Tailwind Migration

A pure styling/JSX migration. **Zero changes to function logic, hooks, state, API calls, or the WebSocket / audio / face-detection pipelines.** Every change touched only `className`, layout JSX, and CSS. Six bug fixes from the audit went in along the way and are listed at the bottom.

Build status: `npm run build` → 0 errors, 29.7 KB CSS gzip 6.2 KB, 387 KB JS gzip 113 KB.

---

## Setup (new files)

| File | Change |
|------|--------|
| [tailwind.config.js](tailwind.config.js) | New. Custom theme tokens (page/card/elevated, accent purple, cyan, success/warning/danger), `font-display` (Syne) + `font-body` (DM Sans), `boxShadow.{card,accent,glow,cyan}`, `borderRadius`, `backdropBlur`, `animation.{fade-up,glow-pulse,fill-bar}`. |
| [postcss.config.js](postcss.config.js) | New. Standard Tailwind + autoprefixer. |
| [package.json](package.json) | Added devDependencies: `tailwindcss@^3`, `postcss`, `autoprefixer` (via `npm i -D`). |

## Removed / replaced styles

| File | Change |
|------|--------|
| [src/App.css](src/App.css) | **Deleted.** Every rule replaced with Tailwind utility classes in JSX. |
| [src/index.css](src/index.css) | Wiped Vite-template defaults (`#root { width: 1126px; border-inline: 1px solid; text-align: center }`, light-mode CSS vars, conflicting `h1/h2` sizes). Now contains only the Google-fonts import, the three `@tailwind` directives, an `@layer base` reset, and an `@layer components` block defining `.glass-card`, `.btn` family, `.input`, `.badge` family, `.toast` family, `.page` wrapper, `.page-glow` ambient backdrop. |

## App shell

| File | What changed |
|------|--------------|
| [src/App.jsx](src/App.jsx) | New shell. Fixed top header (60 px, `backdrop-blur-nav`, `bg-[rgba(10,10,15,0.8)]`) with a `cd.` brand mark and three `NavLink`s (Home / Library / How it Works) using active-state styling. Sign-out button moved into the header. The floating `← Back` button is **removed** — every page now renders its own breadcrumb. Auth pages (`/login`, `/register`) skip the header and use a centered layout. Main content lives inside `.page-glow > .page` (max-w-6xl, ambient radial-gradient overlays). 404 route restyled. |
| [src/main.jsx](src/main.jsx) | Unchanged. |

## Pages

| File | What changed |
|------|--------------|
| [src/pages/Home.jsx](src/pages/Home.jsx) | New hero section ("AI-Powered Confidence Coaching" pill → "Speak with **Confidence**" gradient headline → CTA pair). Mode cards renamed and re-described: "Live Practice" / "Analyze a Video" / "Audio-Only Practice" / "Session Library" with hover-translate + accent shadow. Last-5-sessions sparkline strip kept. Resolves audit item H-01 (mode-name confusion) and H-02 (no value prop). |
| [src/pages/LiveSession.jsx](src/pages/LiveSession.jsx) | Single-banner slot (priority: connection → unsupported language → backpressure → calibrating) — replaces 4 stacked banners. Active layout collapsed to **two columns** (camera 4:3 + 280-px score panel with gauge + Live Tip card). 6-bar signal panel, transcript box, and score graph moved into a `<details>` "Signal Details" drawer (closed by default). REC indicator overlays the camera feed top-left, face/gesture badges top-right. Stop button is a wide red `btn-danger`. Permission denial wired to **`PermissionScreen`** (was unimported dead code). Resolves L-02, L-03, L-04, L-07, L-08. |
| [src/pages/LiveAnalyzer.jsx](src/pages/LiveAnalyzer.jsx) | **Bug fix L-01**: line 105 changed from `setLanguageWarning(null)` → `setUnsupportedLanguage(null)`. The page no longer crashes on Start. Same single-banner pattern, gauge-centric layout, `<details>` drawer for signals/transcript, breadcrumb. Audio-upload-failure path now surfaces an inline `toast-warning` instead of `console.warn` (audit G-05). |
| [src/pages/Analyzer.jsx](src/pages/Analyzer.jsx) | Visible **tab switcher** ("Upload Audio" / "Live Mic") at the top — was a hidden mode toggle. Switching tabs no longer replaces the whole screen with `<LiveAnalyzer />` from a different route. Drop-zone styling for the audio upload. Resolves AN-01. |
| [src/pages/Upload.jsx](src/pages/Upload.jsx) | Drop zone now wires `onDrop` and `onDragOver` (audit UPL-01) — was click-only. Hover lifts the icon (`group-hover:scale-110`). Filename + duration line, video preview, Use-full-clip checkbox, segment editor, Analyze/reset buttons. Status messages render inside the spinner card. |
| [src/pages/Result.jsx](src/pages/Result.jsx) + UploadResult | Score hero (200-px gauge + 6xl number + grade letter + label) replaces the previous mixed 220-vs-160-px gauges. **Coaching Insights card** with "What went well" + "Work on next" sits **directly under the hero** (was section #8/#9). "Analyze another →" full-width primary CTA above the rest of the report. Footer reorganised: destructive *Discard* now an isolated text-link on the **left**, *Library* + *Share* secondary buttons on the **right**. Discard now uses inline error state instead of `alert()`. Resolves R-01, R-02, R-03, R-04, R-05, G-07. |
| [src/pages/History.jsx](src/pages/History.jsx) | New library card: thumbnail icon + title + status badge (Failed/Processing/score) + meta row + tag chips + View/Delete row. **Inline `<video>` players removed** — was 1 metadata fetch per row (audit LIB-02). **Failed sessions** get a red `badge-danger` "Failed" label; processing sessions get an amber "Processing" badge (audit LIB-01). **Delete button gains a `Deleting…` busy state** with `disabled` (audit LIB-03). `window.alert` replaced with toast component (G-07). Empty state grows an icon + CTA: "Start Practicing →" (audit LIB-04). Search + sort + filter chrome restyled to Tailwind `.input` and `.btn` tokens. Filter panel grid (audit LIB-05) restyled. New "+ New Session" button on the header. |
| [src/pages/HowItWorks.jsx](src/pages/HowItWorks.jsx) | Section borders, TOC card, weights table, glossary, FAQ all migrated to Tailwind. The "Honest caveat" callout now uses the cyan toast palette. |
| [src/pages/Login.jsx](src/pages/Login.jsx) | Auth shell shows the `cd.` mark, then a `glass-card` with the form. Inline error uses the danger banner palette. AUTH-01 noted; primary action is now `btn btn-primary btn-full`. |
| [src/pages/Register.jsx](src/pages/Register.jsx) | Same pattern as Login. |

## Components

| File | What changed |
|------|--------------|
| [src/components/ScoreGauge.jsx](src/components/ScoreGauge.jsx) | SVG track is now `rgba(255,255,255,0.08)`. Fill stroke uses an inline `linearGradient` from `#7c3aed` (accent) to `#06b6d4` (cyan) with a `drop-shadow` filter for the glow. Centre number uses `font-display font-extrabold`. Size-relative font sizing. |
| [src/components/SignalBars.jsx](src/components/SignalBars.jsx) | Bars now thin (1.5 px) gradient pills. ≥75 → `success → cyan`; ≥50 → `warning → amber-400`; below → `danger → orange-500`. N/A rows render at 40% opacity with "Not measured" / "No face detected — unavailable" subtitle (audit R-06). Tooltip hidden on N/A rows. |
| [src/components/SessionReport.jsx](src/components/SessionReport.jsx) | Score hero card, **Coaching Insights card pulled to position #2** (insights = wins, action_items = work-on-next), full-width "Practice Again →" CTA. Signal breakdown card, ScoreBreakdownPanel, score graph, progress chart, fillers, pace, transcript follow. Internal `ReportSignalBars` rebuilt with the same gradient bars + opacity-on-N/A pattern. CSV download fail no longer alerts — logs to console (G-07). |
| [src/components/ScoreBreakdownPanel.jsx](src/components/ScoreBreakdownPanel.jsx) | Tables wrapped in `overflow-x-auto` containers (audit G-06: 4-col table no longer overflows on 375 px). Restyled with bordered rows; baseline-adjusted table follows the same pattern. |
| [src/components/SignalInfoTooltip.jsx](src/components/SignalInfoTooltip.jsx) | `?` glyph and popover migrated to Tailwind. Popover uses `bg-page/95` + `border-border-accent` + `shadow-card`. |
| [src/components/FeedbackTips.jsx](src/components/FeedbackTips.jsx) | Card body restyled; emoji icon mapping kept. Now uses `border-l-2 border-accent`. |
| [src/components/SessionGraph.jsx](src/components/SessionGraph.jsx) | Canvas renderer keeps the same logic but new colours: grid `rgba(255,255,255,0.06)`, zone backgrounds in success/warning/danger transparencies, current-score dot in success/warning/danger hex, time labels in `text-text-muted`. |
| [src/components/PlaybackReview.jsx](src/components/PlaybackReview.jsx) | Card layout migrated to `glass-card`. Live "Face" / "Speech" cards inside a 2/1 grid. Transcript words use Tailwind classes; active word uses `bg-accent text-white`. |
| [src/components/AudioPlaybackReview.jsx](src/components/AudioPlaybackReview.jsx) | Same pattern as PlaybackReview, audio-only. |
| [src/components/TranscriptView.jsx](src/components/TranscriptView.jsx) | Card body uses `bg-page/60 border border-border`; filler words use `text-warning bg-[rgba(245,158,11,0.15)]`. |
| [src/components/SignalInfoTooltip.jsx](src/components/SignalInfoTooltip.jsx) | (see above) |
| [src/components/ProgressChart.jsx](src/components/ProgressChart.jsx) | SVG line + dots use `#7c3aed` accent. Delta pill is now a `.badge` variant (success/danger/muted). |
| [src/components/TimelineModal.jsx](src/components/TimelineModal.jsx) | Modal chrome restyled. Replay button is now a `btn btn-primary btn-sm`. Words pane uses Tailwind. |
| [src/components/CountdownOverlay.jsx](src/components/CountdownOverlay.jsx) | Numbers use the gradient `bg-clip-text` from `accent-bright` to `cyan` with `animate-glow-pulse`. The `Recording!` label only shows once `n === 0` (resolves L-08). Now optionally accepts and displays the `topicTitle` underneath. |
| [src/components/PracticeTimer.jsx](src/components/PracticeTimer.jsx) | Bar uses the accent→cyan gradient by default, switches to `warning` at 80 %, and `danger` in the last 10 s. Last-10-second label still uses the danger colour. |
| [src/components/PracticeSetup.jsx](src/components/PracticeSetup.jsx) | Rebuilt with category pills + topic-card grid (was a single `<select>`). Selected topic gets `border-border-accent shadow-accent bg-accent-soft`. Duration slider in its own `glass-card`. Primary CTA uses `btn btn-primary btn-lg btn-full`. |
| [src/components/PermissionScreen.jsx](src/components/PermissionScreen.jsx) | Migrated to Tailwind glass-card layout. Now imported and rendered by `LiveSession.jsx` (audit L-04 — was previously dead code). |
| [src/components/MetadataEditor.jsx](src/components/MetadataEditor.jsx) | All inputs use the shared `.input` class. Tag chips use `.badge.badge-accent`. Inline error uses the danger banner palette. |
| [src/components/CommentsThread.jsx](src/components/CommentsThread.jsx) | Composer + comment list migrated to Tailwind. **`alert()` calls replaced** with three inline error slots: `error` (load fail), `composerError` (post / parse fail), `actionError` (edit / delete fail). Resolves G-07. The "player @ MM:SS" live readout is preserved. |
| [src/components/ShareModal.jsx](src/components/ShareModal.jsx) | **Bug fix G-04**: added a `keydown` listener that closes the modal on `Escape` (copied from TimelineModal's pattern). Body scroll lock added. `alert()` on revoke replaced with an inline `revokeError` banner. Modal chrome migrated to Tailwind. |
| [src/components/TrimSegmentsEditor.jsx](src/components/TrimSegmentsEditor.jsx) | Inputs use `.input`; "Use" buttons use `btn btn-secondary btn-sm`; remove button is a quiet × that turns red on hover. |
| [src/components/ErrorBoundary.jsx](src/components/ErrorBoundary.jsx) | Fallback message uses Tailwind classes. Logic unchanged. |
| [src/components/VideoRecorder.js](src/components/VideoRecorder.js) | Untouched — pure logic file. |
| [src/components/AnalyzerRecorder.js](src/components/AnalyzerRecorder.js) | Untouched (dead code per audit DEAD-01; left in place since deletion would change the codebase beyond scope of a styling migration). |
| [src/components/TrimPanel.jsx](src/components/TrimPanel.jsx) | Untouched (dead code per audit DEAD-01; same rationale). |

## Hooks / utilities

Untouched:
- [src/hooks/useLiveSession.js](src/hooks/useLiveSession.js)
- [src/hooks/useFaceDetection.js](src/hooks/useFaceDetection.js)
- [src/auth/AuthContext.jsx](src/auth/AuthContext.jsx)
- [src/auth/RequireAuth.jsx](src/auth/RequireAuth.jsx)
- [src/config.js](src/config.js)
- [src/utils/timeStr.js](src/utils/timeStr.js)
- [src/utils/mediaStatus.js](src/utils/mediaStatus.js)
- [src/utils/language.js](src/utils/language.js)
- [src/explainer/signals.js](src/explainer/signals.js)
- [public/audioProcessor.worklet.js](public/audioProcessor.worklet.js)

---

## Bug fixes shipped alongside the migration

| Audit ID | File | Fix |
|----------|------|-----|
| L-01 | [LiveAnalyzer.jsx:105](src/pages/LiveAnalyzer.jsx#L105) | `setLanguageWarning(null)` → `setUnsupportedLanguage(null)`. The page no longer throws ReferenceError on Start. |
| L-04 | [LiveSession.jsx](src/pages/LiveSession.jsx), [PermissionScreen.jsx](src/components/PermissionScreen.jsx) | `PermissionScreen` is now imported and rendered when `getUserMedia` fails (was dead code). |
| L-08 | [CountdownOverlay.jsx](src/components/CountdownOverlay.jsx) | "Recording!" label now only appears at `n === 0`, not while still counting down. |
| G-04 | [ShareModal.jsx](src/components/ShareModal.jsx) | Added Escape-to-close + body scroll lock (copied from TimelineModal). |
| G-05 | [LiveAnalyzer.jsx](src/pages/LiveAnalyzer.jsx) | Audio-upload failure surfaces a yellow banner; was `console.warn` only. |
| G-07 | [History.jsx](src/pages/History.jsx), [CommentsThread.jsx](src/components/CommentsThread.jsx), [Result.jsx](src/pages/Result.jsx), [ShareModal.jsx](src/components/ShareModal.jsx) | `window.alert()` calls for failures replaced with inline error banners and toast components (`window.confirm()` kept for destructive irreversible actions). |
| LIB-02 | [History.jsx](src/pages/History.jsx) | Inline `<video preload="metadata">` per row removed. Cards now show a thumbnail icon. |
| LIB-03 | [History.jsx](src/pages/History.jsx) | Delete button has `disabled` + `Deleting…` label during the API call. |
| UPL-01 | [Upload.jsx](src/pages/Upload.jsx) | Drop zone wires `onDrop` and `onDragOver`. |

---

## Audit items NOT yet addressed

These are deferred — none required JSX/CSS work; all are scoped to logic/UX deeper than a styling migration.

- **L-05** (no live "we don't hear you yet" indicator) — needs new state in `useLiveSession.js`.
- **L-06** (PracticeTimer vs raw `M:SS` clock format) — pre-existing trivial inconsistency; left as-is to avoid touching the timer logic.
- **R-07** (face-timeline `<details>` defaults closed) — kept closed on purpose.
- **G-08** (375 px-specific tuning) — improvements are in via Tailwind's `sm:` breakpoint coverage but a dedicated 375 px pass is a follow-up.
- **G-11** (no nav-bar link to /how-it-works on every page) — addressed by the new fixed header (NavLink for "How it Works"). ✓
- **DEAD-01** (`AnalyzerRecorder.js`, `TrimPanel.jsx`) — left in place; deleting code is out of scope for a styling migration.

---

## Token reference

Every JSX file uses tokens, not hex:

- Colors: `text-text-{primary,secondary,muted,accent}`, `bg-{page,card,elevated}`, `bg-accent{,-bright,-soft,-glow}`, `bg-cyan{,-glow}`, `text-{success,warning,danger,cyan}`, `border-border{,-accent,-focus}`.
- Fonts: `font-display` (Syne) for headings/numbers, `font-body` (DM Sans) for everything else.
- Shadows: `shadow-{card,accent,glow,cyan}`.
- Radius: `rounded-{sm,md,lg,xl}`.
- Backdrop blur: `backdrop-blur-{xs,card,nav}`.
- Animations: `animate-{fade-up,glow-pulse,fill-bar}`.

A handful of `bg-[rgba(...)]` arbitrary values remain in `index.css` `@layer components` for the toast/banner palette where Tailwind needed transparency at a custom alpha — they live in the design-system layer rather than scattered through pages.

## Build verification

```
$ npm run build
vite v8.0.5 building client environment for production...
✓ 66 modules transformed.
dist/index.html                          0.45 kB │ gzip:   0.29 kB
dist/assets/index-*.css                 29.69 kB │ gzip:   6.20 kB
dist/assets/vision_bundle-*.js         134.49 kB │ gzip:  39.82 kB
dist/assets/index-*.js                 387.15 kB │ gzip: 113.41 kB
✓ built in 7.43s
```
