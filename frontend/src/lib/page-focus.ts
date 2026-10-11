/** A stable ref callback: focus only when a new page heading mounts. */
export function focusPageHeading(node: HTMLHeadingElement | null) {
  if (!node) return;
  node.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}
