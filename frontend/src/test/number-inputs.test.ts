import { afterEach, expect, it } from "vitest";
import { stopWheelChangingNumbers } from "@/lib/number-inputs";

let stop = () => {};
afterEach(() => {
  stop();
  document.body.innerHTML = "";
});

function box(type: string) {
  const input = document.createElement("input");
  input.type = type;
  document.body.append(input);
  input.focus();
  return input;
}

it("drops focus from a number box you scroll over, so its value can't change", () => {
  stop = stopWheelChangingNumbers();
  const amount = box("number");
  amount.dispatchEvent(new WheelEvent("wheel", { bubbles: true, deltaY: 100 }));
  expect(document.activeElement).not.toBe(amount);
});

it("leaves other boxes, and number boxes you aren't scrolling over, alone", () => {
  stop = stopWheelChangingNumbers();
  const text = box("text");
  text.dispatchEvent(new WheelEvent("wheel", { bubbles: true }));
  expect(document.activeElement).toBe(text);

  const amount = box("number");
  document.body.dispatchEvent(new WheelEvent("wheel", { bubbles: true }));
  expect(document.activeElement).toBe(amount);
});
