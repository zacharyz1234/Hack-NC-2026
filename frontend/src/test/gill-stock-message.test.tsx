import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { GillStockMessage } from "@/components/gill-stock-message";
import type { MessageEvent } from "@/lib/gill-protocol";

afterEach(cleanup);

describe("Gill's stock number styling", () => {
  it.each([
    ["decreased", "negative"],
    ["increased", "positive"],
    ["unchanged", null],
  ] as const)(
    "bolds prices and percentages for %s stock data",
    async (direction, color) => {
      const event: MessageEvent = {
        type: "message",
        message_id: "m1",
        text: "NVDA went from **$215.20** to $200.42, a change of $14.78 (6.87%). Budget cash is $500.00. May 10, 2026.",
        stock_numbers: [
          { value: 215.2, unit: "price", direction },
          { value: 200.42, unit: "price", direction },
          { value: -14.78, unit: "price", direction },
          { value: -6.87, unit: "percent", direction },
        ],
      };
      render(<GillStockMessage event={event} />);
      for (const text of ["$215.20", "$200.42", "$14.78", "6.87%"]) {
        const number = await screen.findByText(text);
        const bold = number.closest("strong");
        expect(bold).not.toBeNull();
        if (color) expect(bold).toHaveClass(color);
        else expect(bold).not.toHaveClass("positive", "negative");
      }
      expect(
        screen.getByText(/Budget cash/).querySelector("strong")?.textContent,
      ).not.toBe("$500.00");
    },
  );

  it("supports percentages spelled out and signed dollar changes", async () => {
    render(
      <GillStockMessage
        event={{
          type: "message",
          message_id: "m2",
          text: "The stock fell -$14.78, or 6.87 percent.",
          stock_numbers: [
            { value: -14.78, unit: "price", direction: "decreased" },
            { value: -6.87, unit: "percent", direction: "decreased" },
          ],
        }}
      />,
    );
    expect((await screen.findByText("-$14.78")).closest("strong")).toHaveClass(
      "negative",
    );
    expect(screen.getByText("6.87 percent").closest("strong")).toHaveClass(
      "negative",
    );
  });

  it("leaves ordinary messages unchanged without verified stock hints", async () => {
    const { container } = render(
      <GillStockMessage
        event={{
          type: "message",
          message_id: "m3",
          text: "Your cash is $500.00 and your savings rate is 10%.",
        }}
      />,
    );
    await screen.findByText(/Your cash/);
    expect(container.querySelector("strong")).toBeNull();
    expect(container.querySelector(".positive, .negative")).toBeNull();
  });
});
