// The Living Project views live in the homepage URL: #<slug> is the preview and #<slug>/workspace
// the workspace. Each step forward is a history entry, so browser Back and Forward agree with what is
// on screen, and a link to /#<slug>/workspace opens the workspace directly.

export type View = 0 | 1 | 2; // card, preview, workspace
export const CHANGE = "living-project-change";

export function viewFromHash(slug: string): View {
  const hash = window.location.hash;
  if (hash === `#${slug}`) return 1;
  if (hash === `#${slug}/workspace`) return 2;
  return 0;
}

export const hrefFor = (slug: string, view: View) => (view === 0 ? "/" : view === 1 ? `/#${slug}` : `/#${slug}/workspace`);

/** How many Living Project entries this visit has pushed, counting back to the page itself. */
const depth = (): number => window.history.state?.livingDepth ?? 0;

const announce = () => window.dispatchEvent(new Event(CHANGE));

function replace(slug: string, view: View) {
  // Keep the router's own history state; only the URL changes.
  window.history.replaceState(window.history.state, "", view === 0 ? window.location.pathname : hrefFor(slug, view).slice(1));
  announce();
}

export function open(slug: string, view: 1 | 2) {
  window.history.pushState({ ...window.history.state, livingDepth: depth() + 1 }, "", hrefFor(slug, view).slice(1));
  announce();
}

// The Navigation API, where the browser has it (TypeScript's DOM types do not include it yet).
// history.back() and history.go() move through the joint session history, which also holds the
// entries a framed application adds as it navigates; so after a visitor clicks around inside a demo,
// they would step back through the demo instead of closing it. The Navigation API moves through this
// page's own entries only.
type PageEntry = { key: string; index: number };
type PageNavigation = { currentEntry: PageEntry | null; entries(): PageEntry[]; traverseTo(key: string): unknown };
const pageNavigation = (): PageNavigation | undefined => (window as Window & { navigation?: PageNavigation }).navigation;

/** Moves `steps` of this page's own entries back. */
function goBack(steps: number) {
  const nav = pageNavigation();
  const target = nav?.currentEntry && nav.entries()[nav.currentEntry.index - steps];
  if (nav && target) nav.traverseTo(target.key);
  else window.history.go(-steps);
}

/** One step back: workspace to preview. Uses the history entry when this visit made one. */
export function back(slug: string) {
  if (depth() > 0) goBack(1);
  else replace(slug, 1);
}

/** Back to the page, unwinding the entries this visit pushed. */
export function close(slug: string) {
  if (depth() > 0) goBack(depth());
  else replace(slug, 0);
}
