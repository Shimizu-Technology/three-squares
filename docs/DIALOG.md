# Shared modal dialog

`web/src/components/ui/Dialog.tsx` is a controlled native `<dialog>` rendered into `document.body`. Use it for customer or staff modals and drawers. It has no customer, cart, or admin dependencies.

```tsx
const titleId = useId();
<Dialog open={open} onOpenChange={setOpen} labelledBy={titleId}
  className="w-full max-w-lg rounded-xl">
  <h2 id={titleId}>Edit item</h2>
  <button onClick={() => setOpen(false)}>Close</button>
  {/* Form or other content */}
</Dialog>
```

- `labelledBy` is required and refers to a visible heading ID. `describedBy` optionally refers to short explanatory text; do not describe a whole form or long document.
- Opening enters the browser's modal top layer. The browser makes the background inert and stacks nested dialogs. The primitive wraps Tab/Shift+Tab at the panel's boundaries, including when a removed control leaves focus on the document. The first focusable control receives native initial focus. Use a stable `initialFocusRef` for a deliberate alternative, such as a heading with `tabIndex={-1}` or the first field.
- Closing or unmounting restores the opener if it still exists. While mounted and closed, the primitive remembers focus and pointer activation, covering async buttons that temporarily disable themselves and Safari buttons that do not take pointer focus. A stable `returnFocusRef` is appropriate for conditionally mounted dialogs or a replacement control when the opener is removed. A parent that navigates away should focus the destination's heading through its own route focus management.
- Escape and a pointer press/release on the backdrop request `onOpenChange(false)`. Dragging from the panel onto the backdrop does not dismiss. `dismissible={false}` blocks those requests during a save or required choice; provide an explicit, reachable next action. Keep drafts in the caller when closing should preserve them.
- Every caller supplies a visible, named close/cancel action unless the flow requires a choice. Never add a second focus trap, body lock, or `open` HTML attribute. Native modal behavior requires `showModal()`; the component manages it.
- Scroll locks are reference counted across users of `useLockBodyScroll`. Nested modal cleanup preserves the outer lock and restores original document styles after the final close. Give scrolling content `min-h-0 overflow-y-auto overscroll-contain`, leaving the heading and actions reachable on short screens. Wheel and touch scrolling remain native.
- Tab navigation marks the panel for a shared visible-focus fallback: WebKit can retain pointer modality after touch and a programmatic focus trap. Pointer input and reopening clear the marker. Focus rings remain 2px with 2px offset; dark-surface shared controls use white.
- `className` styles the panel. Defaults bound it to the viewport using `dvh`. Drawers may use `m-0 ml-auto h-dvh max-h-dvh w-full max-w-full sm:w-[420px] flex flex-col`. Closed panels stay hidden even when a layout utility requests flex/grid.
- The primitive introduces no entrance/exit delay. If adding motion, preserve immediate focus/input, reduced motion, and interruptible closing. Do not keep a hidden modal in the top layer for an exit animation.

Browser acceptance covers keyboard entry/Tab containment/Escape/return, inert background, backdrop press versus drag, repeated open/close, nested lock cleanup, short-screen scrolling, and Chromium/WebKit. Screen reader and physical device acceptance remain part of release QA.
