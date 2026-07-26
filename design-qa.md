# ThreadPilot Design QA

## Comparison target

- Source visual truth: `.design-audit/00-source-option-1.png`
- Implementation: `http://127.0.0.1:4173/tests/fixture.html`
- Browser-rendered implementation screenshot: `.design-audit/05-main-1280.png`
- Keyboard-focus preview screenshot: `.design-audit/10-focus-preview.png`
- Dark narrow-screen screenshot: `.design-audit/06-main-dark-640.png`
- Full-view normalized comparison: `.design-audit/09-side-by-side-normalized.png`

## Viewport and normalization

- Source pixels: `1487 × 1058`.
- Main implementation CSS viewport: `1280 × 720`, device pixel ratio reported as `1.25`.
- Main implementation screenshot pixels: `1265 × 712`.
- Narrow implementation CSS viewport: `640 × 800`, device pixel ratio `1`.
- The source was proportionally resized to `1265px` wide and top-cropped to `712px` high for the full-view comparison.
- The comparison excludes browser chrome and compares the same light-theme conversation state.
- The source contains eight compact example turns; the primary implementation evidence contains five realistic turns. Copy and turn count are treated as dynamic content, not visual mismatches.

## States compared

- Light theme, timeline visible, first long answer collapsed.
- Keyboard focus on timeline turn 3, preview visible.
- Dark theme at `640px` wide.
- Popup default state and edited-setting state.

## Full-view comparison evidence

The normalized side-by-side comparison shows:

- The timeline remains a narrow right-edge rail and does not reduce the primary reading column.
- Nodes use neutral circular states with a restrained teal active state.
- The current-position counter stays above the rail.
- A collapsed answer preserves two opening lines, a character count, and a right-aligned expand action.
- The implementation keeps the source's low-border, low-shadow, ChatGPT-native visual hierarchy.

## Focused region comparison evidence

Focused comparison was required for the timeline preview and folding controls:

- `.design-audit/10-focus-preview.png` confirms the preview is anchored to the selected node, includes turn number, fold state, user prompt, answer preview, and a jump hint.
- `.design-audit/04-popup.png` confirms the extension popup contains only the timeline switch, automatic-fold switch, folding threshold, and shortcuts.
- `.design-audit/06-main-dark-640.png` confirms the rail compresses to `32px`, the dark tokens remain legible, and the reading text is not obscured.

## Required fidelity surfaces

### Fonts and typography

Passed. The implementation uses ChatGPT-compatible system sans fallbacks, keeps body text at the host page's size, uses compact `10–12px` utility text only inside the rail and controls, and preserves readable line height and wrapping in Chinese.

### Spacing and layout rhythm

Passed. The rail, position counter, preview, fold metadata, and expand action follow the source hierarchy. Short conversations distribute nodes across the available rail; long conversations switch to an internally scrolling rail.

### Colors and visual tokens

Passed. Neutral surfaces, low-contrast dividers, muted metadata, and one teal active color match the source. Light and dark tokens were rendered and checked.

### Image quality and asset fidelity

Passed. The selected design contains no product photography, illustration, or branded raster asset that needs recreation. No placeholder imagery, custom SVG art, emoji icon, or decorative generated asset was substituted.

### Copy and content

Passed. Product copy is concise and action-oriented: “已折叠 · 351 字”, “展开”, “收起”, “折叠全部回答”, and “展开全部回答”. The popup names only the two core features.

### Icons

Passed. Timeline boundary actions use the official Tabler Icons `arrow-bar-to-up` and `arrow-bar-to-down` SVG assets. Turn navigation uses semantic position ticks rather than decorative icons.

### Accessibility and interaction states

Passed. Timeline nodes and fold actions are native buttons, focus rings are visible, fold controls expose `aria-expanded` and `aria-controls`, the current turn exposes `aria-current`, and reduced motion is supported.

## Comparison history

### Iteration 1

- Earlier finding: `[P2]` Five timeline nodes were vertically concentrated in the center of the rail, unlike the evenly distributed source.
- Historical fix: Changed the rail to equal flexible rows with a `36px` minimum; this approach was superseded by the real-position rail in iteration 3.
- Post-fix evidence: `.design-audit/03-implementation-light-v2.png` and `.design-audit/09-side-by-side-normalized.png`.

### Iteration 2

- Earlier finding: `[P2]` The default `48px` rail was too wide for narrow screens.
- Fix: Added a `32px` compact rail at `640px` and below, with a repositioned preview.
- Post-fix evidence: `.design-audit/06-main-dark-640.png`; measured overlap is limited to the host page's empty right padding and does not cover message text.

### Iteration 3

- Earlier finding: `[P1]` Clicking turn 4 placed the prompt behind the sticky header while the counter reported `5 / 5`.
- Earlier finding: `[P2]` Equal numeric circles looked like pagination, did not represent message positions, and produced an abnormal active line.
- Fix: Replaced equal circles with a real-position tick rail, unified jumping and active-turn detection around the same scroll-container coordinate model, and added top/bottom boundary buttons.
- Measured result: turn 75 in a 100-turn nested scroller landed within `0.1px` of the safe anchor and reported `75 / 100`.
- Post-fix evidence: `.design-audit/timeline-v2/06-before-after-comparison.jpg`, `.design-audit/timeline-v2/04-after-100-turns.jpg`, and `.design-audit/timeline-v2/05-dark-theme.jpg`.

### Iteration 4

- Earlier finding: `[P1]` The bulk fold menu overlapped the timeline by `42 × 75.6px`; clicks near the right edge of “折叠全部” hit turn 1 instead.
- Earlier finding: `[P1]` Expanding or collapsing all answers changed message heights and could move the active timeline turn.
- Earlier finding: `[P1]` Full-height node hit regions prevented the rail's drag-to-scrub handler from starting.
- Fix: Removed the hover menu, moved the context-aware bulk fold button into a separate root outside the rail, preserved the active prompt's viewport offset across every fold operation, and unified click/drag pointer handling with a movement threshold.
- Measured result: the fold button and timeline have zero overlap, with `8px` to the rail hit area and `12px` between visible buttons. In a 100-turn nested scroller, collapse all and expand all both preserved turn `75 / 100` at `155.6–155.8px`.
- Interaction result: dragging the rail navigated from turn 1 to turn 3, then a normal click still landed on turn 4 within `0.1px`.
- Post-fix evidence: `.design-audit/fold-timeline-conflict/04-before-after-comparison.jpg` and `.design-audit/fold-timeline-conflict/05-long-dark-100-turns.jpg`.

## Findings

No actionable P0, P1, or P2 findings remain.

## Follow-up polish

- `[P3]` The generated source shows a smaller preview card. The implementation intentionally uses a wider card so real Chinese prompts and answer excerpts can be identified before jumping.
- `[P3]` Final appearance inside live ChatGPT can shift slightly when OpenAI changes host spacing or selectors; the extension uses neutral inherited typography and tolerant selectors to minimize drift.

## Browser verification

- Primary interactions tested: single-answer expand, isolated bulk fold toggle, viewport preservation across collapse all and expand all, exact timeline jump, current-position update, top/bottom navigation, timeline show/hide, previous/next shortcuts, popup switches, popup threshold selection, keyboard preview focus.
- Boundary states tested: 100 turns, nested ChatGPT-style scrolling container, DOM mutation after manual expansion, streaming answer exclusion, dark theme, and `640px` narrow viewport.
- Console errors checked: none in the conversation fixture or popup.

## Final result

final result: passed
