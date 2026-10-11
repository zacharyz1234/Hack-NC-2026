import { Children, cloneElement, isValidElement, type ReactNode } from "react";
import { z } from "zod";
import { MessageResponse } from "@/components/ai-elements/message";
import type { MessageEvent } from "@/lib/gill-protocol";

const hintsSchema = z
  .array(
    z.object({
      value: z.number().finite(),
      unit: z.enum(["price", "percent"]),
      direction: z.enum(["increased", "decreased", "unchanged"]),
    }),
  )
  .max(100);

export function GillStockMessage({ event }: { event: MessageEvent }) {
  const parsed = hintsSchema.safeParse(event.stock_numbers);
  if (!parsed.success || !parsed.data.length) {
    return <MessageResponse>{event.text}</MessageResponse>;
  }
  const hints = parsed.data;
  function highlight(children: ReactNode): ReactNode {
    return Children.map(children, (child) => {
      if (typeof child === "string") {
        const number = "[+−-]?(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d+)?";
        const tokens = new RegExp(
          `(?:[+−-]?\\$${number}|${number}\\s*(?:%|percent\\b))`,
          "gi",
        );
        const parts: ReactNode[] = [];
        let cursor = 0;
        for (const match of child.matchAll(tokens)) {
          const token = match[0];
          const index = match.index ?? 0;
          const unit = token.includes("$") ? "price" : "percent";
          const value = Number(token.replace(/[^\d.]/g, ""));
          const matches = hints.filter(
            (hint) =>
              hint.unit === unit &&
              Math.round(Math.abs(hint.value) * 100) ===
                Math.round(value * 100),
          );
          if (!matches.length) continue;
          parts.push(child.slice(cursor, index));
          // Equal numbers from stocks moving in different directions stay neutral.
          const directions = new Set(matches.map((hint) => hint.direction));
          const direction =
            directions.size === 1 ? matches[0]!.direction : "unchanged";
          parts.push(
            <strong
              key={index}
              className={
                direction === "increased"
                  ? "positive"
                  : direction === "decreased"
                    ? "negative"
                    : undefined
              }
            >
              {token}
            </strong>,
          );
          cursor = index + token.length;
        }
        parts.push(child.slice(cursor));
        return parts;
      }
      if (
        isValidElement<{ children?: ReactNode }>(child) &&
        child.props.children !== undefined
      ) {
        if (child.type === "code" || child.type === "pre") return child;
        return cloneElement(child, {}, highlight(child.props.children));
      }
      return child;
    });
  }
  return (
    <MessageResponse
      components={{
        p: ({ children }) => <p>{highlight(children)}</p>,
        li: ({ children }) => <li>{highlight(children)}</li>,
        td: ({ children }) => <td>{highlight(children)}</td>,
        th: ({ children }) => <th>{highlight(children)}</th>,
      }}
    >
      {event.text}
    </MessageResponse>
  );
}
