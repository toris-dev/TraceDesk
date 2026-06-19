# TraceDesk Product Design Audit

Date: 2026-06-19
Destination: local folder
Capture target: local Vite preview with dev-only Tauri IPC mock data

## Captured Steps

1. `01-command-center.png` - Initial command center preview before final copy fix.
2. `02-ai-chat-empty.png` - AI chat tab with an empty session.
3. `03-ai-chat-response.png` - AI chat tab after sending a prompt and receiving a response.
4. `04-command-center-revised.png` - Command center after replacing the remaining system-monitor assistant copy.
5. `05-ai-chat-narrow.png` - AI chat tab at a narrower desktop viewport.

## Audit Scope

Primary surfaces:
- Command center
- AI chat tab
- Narrow desktop reflow for AI chat

User goal:
- Understand personal behavior patterns from copy, paste, capture, app usage, and activity history.
- Chat interactively with an AI assistant without losing conversation context.
- Use an interface that feels cybernetic and desktop-native, not like a generic analytics dashboard.

Accessibility target:
- Text should remain readable and not overlap.
- Primary actions should be discoverable.
- Chat and navigation states should be perceivable from visible labels and active styling.

## Strengths

- The command center now clearly prioritizes behavior signals: identity scan, copy/paste/capture vectors, activity signal, app context, and event stream.
- CPU, memory, and port monitoring are absent from the primary UI, so the product feels like a personal activity intelligence tool instead of a system monitor.
- The AI chat tab has a clear workspace model: session rail, date context, connection state, transcript, include-activity toggle, composer, and session controls.
- Chat response text wraps cleanly in the main desktop viewport and preserves readable line breaks.
- Navigation active states are visually strong and the AI chat tab is discoverable from the sidebar.
- The narrow desktop capture shows the AI chat layout reflows into stacked panels instead of overlapping.

## Fixed During Audit

- The floating mascot assistant still referred to "system status" on the command center, which contradicted the removed CPU/memory monitoring direction.
- Fixed by changing the command-center assistant state from `system` to `command` and updating the copy to: `오늘의 행동 패턴을 같이 읽어볼게요`.
- Verified in `04-command-center-revised.png`; the old system-status copy no longer appears.

## UX Risks

- The command center is visually dense. It works for a power-user desktop app, but first-time users may need the AI chat tab to become the primary explanation layer.
- In a narrow desktop viewport, the AI chat content becomes vertically tall. It does not overlap, but users must scroll to reach the composer and full transcript.
- The AI deep scan panel and AI chat tab partially overlap in concept. The tab is now the stronger long-form conversation surface; the command-center scan should remain a quick summary action.

## Accessibility Risks

- The cyber palette uses low-luminance backgrounds and neon accents. Key body copy appears readable in screenshots, but automated contrast checks were not run.
- Several controls use symbolic icons. They have visible text or labels in primary nav, but icon-only controls should keep strong `aria-label` coverage in future changes.
- The narrow layout remains usable visually, but keyboard tab order and focus rings were not verified from screenshots.

## Evidence Limits

- Screenshots were captured from a local browser preview using dev-only mock data because the Tauri desktop IPC is not available in the in-app browser.
- The audit verifies visual structure, copy, wrapping, and layout behavior. It does not prove native desktop permission flows, updater behavior, or macOS window behavior.
- Full accessibility compliance cannot be claimed from screenshots alone.

## Recommendations

- Keep AI chat as the primary place for multi-turn personal behavior analysis.
- Keep the command center focused on glanceable signals and one-click summaries.
- Avoid reintroducing CPU, memory, process, or port language into primary surfaces.
- Add a future keyboard/focus audit pass for AI chat controls and the session rail.
