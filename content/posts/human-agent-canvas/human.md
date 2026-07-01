# Human Notes

## Problem statement

This post is intended as a manual test surface for the dual-pane workbench layout.

For scroll synchronization to be meaningful, we need enough vertical content in both panes so one side can be scrolled independently and the other tracks movement.

## Context

The long-form narrative is in this pane. It should include several sections, each with enough body text to force overflow inside its pane body container.

### 1) Framing

When co-authoring, one pane can hold the primary draft while another pane records feedback, alternative versions, or fact checks.

A useful pattern is:

- Keep each major thought in its own section.
- Add examples and edge cases.
- Preserve historical revision notes in the agent pane.

The goal is to keep enough material so we can test proportional scroll sync behavior.

### 2) Example breakdown

Suppose we have three independent ideas.

First idea: separate content generation from review commentary.

Second idea: keep all shared facts in one place.

Third idea: use deterministic ordering for references.

### 3) Deeper explanation

The human pane should remain readable while the agent pane can still be compared against it.

In synchronous mode, scrolling the human pane should move the agent pane to the analogous semantic position. In a basic heuristic implementation, we approximate this by keeping scroll ratio synchronized.

If the ratio logic is working, both panes should stay aligned by relative depth, not by absolute pixels.

### 4) Additional detail

Let's include several lines so content continues:

1. Start with thesis and motivation.
2. Elaborate on constraints and assumptions.
3. Describe methodology.
4. Call out caveats.
5. Mention next steps.

Each step can itself be expanded into a paragraph to increase vertical height.

### 5) Step-by-step expansion

Step 1: define the user story and success criteria.

We want a workflow where people can quickly review generated work while drafting.

Step 2: define the review boundary.

Agent contributions should be auditable and explicitly labeled.

Step 3: define visual rhythm.

Headers, bullet lists, and spacing help quickly orient between sections.

Step 4: define exit criteria.

A post is done when the structure is stable and sync still behaves consistently while reading.

Step 5: iterate from feedback.

Because both panes are independently scrollable, we can test regression where one side remains visually out-of-sync after layout changes.

### 6) Practical notes

- Keep consistent heading depth across panes when possible.
- Put related points in corresponding sections.
- Keep this test post intentionally long.

### 7) Final stretch

Longer content keeps scroll bars available even after viewport adjustments.

When you scroll here, watch for immediate movement in the agent pane, especially near the bottom where proportional mapping can reveal any rounding issues.

### 8) Closing

If this section is visible while the agent pane is also deep into its own text, then the setup is successful.

Continue adding if needed:

The system should feel natural to scan in both panes without sudden jumps.

A stable sync test case should expose drift quickly if the algorithm changes.

For example, if one pane contains dense single-line lines and another contains short lines, they should still roughly track by relative document position, not visible height alone.

Another quick paragraph to ensure there is still room to spare in testing environments with different viewport sizes.

This is the final section of the human draft content and should be far enough down to require real scrolling.

### 9) Last check

I can keep typing to force even more vertical space.

The final part is intentionally verbose so that when the article is rendered at different widths, each pane still has enough height to test whether `scroll` events and `scrollTop` synchronization are functioning.

### 10) End

That's all for this long-form block. If the panes scroll, we are good.
