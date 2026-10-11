// Browsers change a focused number box's value when you scroll over it. Nobody means to do that
// with money, so drop focus first: the value stays put and the page scrolls as usual.
export function stopWheelChangingNumbers(): () => void {
  const onWheel = (e: WheelEvent) => {
    const box = document.activeElement;
    if (
      box instanceof HTMLInputElement &&
      box.type === "number" &&
      e.target === box
    )
      box.blur();
  };
  document.addEventListener("wheel", onWheel, { capture: true, passive: true });
  return () =>
    document.removeEventListener("wheel", onWheel, { capture: true });
}
