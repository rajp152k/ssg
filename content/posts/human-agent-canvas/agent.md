<!--agent-session title="Draft"-->
This is agent output for the first pass.

- Clarify thesis
- Suggest structure
- Maintain side-by-side readability
- Provide a concise set of checks

The agent pane can mirror the human pane in broad structure while adding alternative phrasing and consistency notes.

### Alternative opening

For scroll-sync validation, we keep this pane long enough to force independent scrolling.

Long content matters because when both panes exceed the viewport, the sync handler can be observed against a nontrivial document height.

### Detailed review section

Potential improvements:

1. Add explicit examples.
2. Keep terminology consistent.
3. Preserve a clear thesis sentence near the top.
4. Add one short summary after each major section.
5. Validate that transitions between sections are not abrupt.

### Alignment strategy

A practical strategy is to keep analogous headings between panes.

For instance, map this sequence:

- Problem statement
- Context
- Framing
- Example breakdown
- Practical notes

to both panes so synced scrolling appears natural.

### More content for deep scrolling

Here is a repeated stress test block:

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed non risus. Suspendisse lectus tortor, dignissim sit amet, adipiscing nec, ultricies sed, dolor.

Cras elementum ultrices diam. Maecenas ligula massa, varius a, semper congue, euismod non, mi.

Proin porttitor, orci nec nonummy molestie, enim est eleifend mi, non fermentum diam nisl sit amet erat.

Nulla facilisi. Integer lacinia sollicitudin massa. Cras metus. Sed aliquet risus a tortor.

### Validation checklist

- [ ] Is sync enabled?
- [ ] Is source pane set to `human`?
- [ ] Does the scroll ratio clamp correctly at top and bottom?
- [ ] Are both panes independently scrollable?
- [ ] Does heavy content in one pane still synchronize reasonably in the other?

### Observability notes

Try multiple browser widths:

- Narrow windows reduce available pane height and make scroll behavior obvious.
- Wider layouts still work but need enough text to overflow vertically.

### Additional filler

When the page loads, you should be able to scroll slightly and see synchronized movement.

If the ratio mapping is working, moving near the end of one pane should move the other near its own end.

Add more paragraphs:

The objective is not pixel-perfect alignment; it is stable and monotonic coupling.

Scroll-synced panes are useful when the user wants to inspect both the authored and suggested text simultaneously.

Even if exact line correspondence is not perfect, matching the relative progression through each document is often enough.

### Closing notes

This section continues the same cadence as the human notes and keeps the test post tall.

We can always refine the mapping logic later if section-level anchors prove better than ratio-based syncing.

One final check: ensure the two-pane sync still responds if you drag inside the second pane too and then jump back.

The final lines are just here to make sure this pane clearly overflows on most screen sizes.

Add more closing content:

The final stretch is intentionally long to preserve overflow.

Another paragraph.

Another one, right here.

Another one, just to be sure.

Yet another closing sentence.

That should be enough for robust testing.

End of agent pane test content.
<!--/agent-session-->

<!--agent-session title="Review"-->
Potential improvements:

1. Add explicit examples.
2. Keep terminology consistent.
3. Add one tiny glossary.
4. Keep section nesting stable.
5. Make sure the test post is reproducible after rebuilds.

### Supplemental review block

This second block intentionally also has enough length.

When testing sync, use this pane as the secondary target. If you scroll far enough here, the human pane should respond by ratio.

A few more lines:

- Keep headings semantic.
- Avoid mixing unrelated digressions.
- Preserve markdown structure across both panes.

### End of review session

Use this as a final sanity check for both scroll bars and the event listeners.

If both panes move together when dragging one scrollbar, test is successful.

If not, confirm that sync config is still:

```json
{
  "sync": {
    "enabled": true,
    "source": "human"
  }
}
```

And that this post remains using the two-pane layout.

This final note ensures the review block is nontrivial.

Let's add more:

The more text we include, the safer this regression test becomes.

End.
<!--/agent-session-->
