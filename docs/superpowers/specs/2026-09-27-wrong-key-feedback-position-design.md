# Wrong-key feedback position

## Goal

Place the persistent `Wrong key` message directly beneath the currently mistyped character instead of beside it.

## Design

The current character and its feedback will share a small inline positioning wrapper. The wrapper will preserve the character's place in the station name, while the feedback is absolutely positioned below and horizontally centred on that character. Because the feedback is removed from normal flow, showing it will not push the remaining station name sideways or change line wrapping.

The visible message remains a real `role="status"` element so assistive technology receives the same feedback. The phone recovery button keeps its status outside the button, as required for valid interactive markup; this change targets the normal typing prompt shown in the reported desktop layout.

## Verification

- A component regression test will assert that normal wrong-key feedback is anchored with the current character.
- Existing tests will continue to cover visibility, clearing after a correct key, recovery-button placement, and reduced-motion behavior.
- The prompt will be checked in the browser at the reported layout size to confirm that the message appears below the active character without shifting the station name.
