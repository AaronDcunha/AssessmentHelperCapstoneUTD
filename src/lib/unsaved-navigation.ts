type NavigationEvent = Event & { navigationType: string; destination: { url: string } };
type GuardWindow = Window & { navigation?: EventTarget };

/** Capture links before Next's client router handles them. Native unload protection
 * covers refresh, tab close and full-document navigation. Navigation API traversal
 * events additionally cover same-document Back/Forward where supported.
 */
export function guardUnsavedNavigation(win: GuardWindow, doc: Document, message: string) {
  const click = (event: MouseEvent) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
    if (!anchor || anchor.hasAttribute("download") || (anchor.target && anchor.target !== "_self")) return;
    const destination = new URL(anchor.href, win.location.href);
    // Full-document/external navigation uses the native unload warning instead.
    if (destination.origin !== win.location.origin) return;
    // Same-page/hash links retain the mounted editor.
    if (destination.origin === win.location.origin && destination.pathname === win.location.pathname && destination.search === win.location.search) return;
    if (!win.confirm(message)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  };
  const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
  const traverse = (event: Event) => {
    const navigation = event as NavigationEvent;
    if (navigation.navigationType !== "traverse" || !event.cancelable) return;
    const destination = new URL(navigation.destination.url);
    if (destination.pathname === win.location.pathname && destination.search === win.location.search) return;
    if (!win.confirm(message)) event.preventDefault();
  };
  const capture = { capture: true };
  doc.addEventListener("click", click, capture);
  win.addEventListener("beforeunload", unload);
  win.navigation?.addEventListener("navigate", traverse);
  return () => {
    doc.removeEventListener("click", click, capture);
    win.removeEventListener("beforeunload", unload);
    win.navigation?.removeEventListener("navigate", traverse);
  };
}
