import { Suspense, lazy, useEffect, useState, type ComponentType } from "react";

/**
 * Code-split a dialog/drawer so its JS is only downloaded the first time it opens.
 *
 * Behaviour after the first open is identical to a normal import: the component
 * stays mounted, so close animations, internal state and `open` toggling work
 * exactly as before. Until it has been opened once, nothing is rendered (a
 * closed Radix dialog renders nothing visible anyway).
 *
 * `preload()` can be called on hover/focus of the trigger to warm the chunk.
 */
export function lazyDialog<P extends object>(
  loader: () => Promise<ComponentType<P>>,
  isOpen: (props: P) => boolean,
) {
  let cached: Promise<{ default: ComponentType<P> }> | null = null;
  const load = () => (cached ??= loader().then((c) => ({ default: c })));
  const Lazy = lazy(load);

  function LazyDialog(props: P) {
    const open = isOpen(props);
    const [everOpened, setEverOpened] = useState(open);
    useEffect(() => {
      if (open) setEverOpened(true);
    }, [open]);
    if (!open && !everOpened) return null;
    return (
      <Suspense fallback={null}>
        <Lazy {...props} />
      </Suspense>
    );
  }

  LazyDialog.preload = () => {
    void load();
  };
  return LazyDialog;
}
