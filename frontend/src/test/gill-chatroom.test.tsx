import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { GillChat } from "@/components/gill-chat";
import { api, apiAudio } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  api: vi.fn(),
  apiAudio: vi.fn(),
  ApiError: class extends Error {},
}));
vi.mock("@/components/ai-elements/conversation", () => ({
  Conversation: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  ConversationContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  ConversationScrollButton: () => null,
}));
vi.mock("@/components/ai-elements/message", () => ({
  Message: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  MessageContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  MessageResponse: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));
vi.mock("@/components/ai-elements/prompt-input", async () => {
  const React = await import("react");
  return {
    PromptInput: ({
      children,
      onSubmit,
    }: {
      children: ReactNode;
      onSubmit: (value: { text: string }) => void;
    }) => (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({ text: e.currentTarget.querySelector("textarea")!.value });
        }}
      >
        {children}
      </form>
    ),
    PromptInputTextarea: React.forwardRef<
      HTMLTextAreaElement,
      React.ComponentProps<"textarea">
    >((props, ref) => <textarea {...props} ref={ref} />),
    PromptInputSubmit: ({
      children,
      status: _status,
      ...props
    }: React.ComponentProps<"button"> & { status: string }) => (
      <button {...props} type="submit">
        {children}
      </button>
    ),
  };
});

let ended: (() => void) | null;
let speechTime = 0;
const stop = vi.fn(() => ended?.());
class FakeAudioContext {
  state = "running";
  get currentTime() {
    return speechTime;
  }
  resume = vi.fn(async () => {});
  close = vi.fn(async () => {
    this.state = "closed";
  });
  decodeAudioData = vi.fn(async () => ({}));
  destination = {};
  createBufferSource() {
    return {
      buffer: null,
      playbackRate: { value: 1 },
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop,
      set onended(fn: () => void) {
        ended = fn;
      },
    };
  }
  createBiquadFilter() {
    return {
      type: "",
      frequency: { value: 0 },
      Q: { value: 0 },
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
  }
  createDynamicsCompressor() {
    return {
      threshold: {},
      knee: {},
      ratio: {},
      attack: {},
      release: {},
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
  }
  createGain() {
    return { gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() };
  }
}
const props = {
  onClose: vi.fn(),
  onDataChanged: vi.fn(),
  onMute: vi.fn(),
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api).mockReset();
  ended = null;
  speechTime = 0;
  vi.stubGlobal("AudioContext", FakeAudioContext);
  vi.mocked(api).mockResolvedValueOnce({
    session_id: "chat",
    voice_available: true,
    suggestions: [],
    events: [{ type: "message", message_id: "greeting", text: "Good day." }],
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
async function sendReply() {
  await screen.findByText("Good day.");
  vi.mocked(api).mockResolvedValueOnce({
    events: [
      {
        type: "message",
        message_id: "reply",
        text: "Save a little each month.",
      },
    ],
  });
  vi.mocked(api).mockResolvedValueOnce({
    audio_base64: "SUQz",
    alignment: {
      characters: ["a", "t", "a"],
      character_start_times_seconds: [0, 1, 4],
      character_end_times_seconds: [1, 1.1, 5],
    },
  });
  fireEvent.change(screen.getByRole("textbox", { name: "Question for Gill" }), {
    target: { value: "How do I save?" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send message to Gill" }));
  await screen.findByText("Save a little each month.");
}
it("shows replies in the chat panel without requesting audio when muted", async () => {
  render(<GillChat {...props} muted />);
  await sendReply();
  expect(apiAudio).not.toHaveBeenCalled();
  expect(
    screen.queryByRole("button", { name: /play/i }),
  ).not.toBeInTheDocument();
});
it("moves Gill's mouth during automatic speech and closes it when muted", async () => {
  const view = render(<GillChat {...props} muted={false} />);
  await sendReply();
  await waitFor(() =>
    expect(screen.getByLabelText("Gill is speaking")).toBeInTheDocument(),
  );
  expect(api).toHaveBeenCalledWith(
    "/assistant/sessions/chat/messages/reply/speech-aligned",
    "POST",
  );
  await waitFor(() =>
    expect(
      view.container.querySelector(
        'img[alt="Gill Gates, a goldfish wearing a tie"]',
      ),
    ).toHaveClass("gill-mouth-hidden"),
  );
  view.rerender(<GillChat {...props} muted />);
  await waitFor(() =>
    expect(screen.getByLabelText("Gill is swimming")).toBeInTheDocument(),
  );
  expect(stop).toHaveBeenCalled();
  expect(
    view.container.querySelector(
      'img[alt="Gill Gates, a goldfish wearing a tie"]',
    ),
  ).not.toHaveClass("gill-mouth-hidden");
});
it("returns to the closed mouth when the audio finishes", async () => {
  render(<GillChat {...props} muted={false} />);
  await sendReply();
  await screen.findByLabelText("Gill is speaking");
  act(() => ended?.());
  expect(screen.getByLabelText("Gill is swimming")).toBeInTheDocument();
});
it("closes Gill's mouth during silence and opens it when speech resumes", async () => {
  const view = render(<GillChat {...props} muted={false} />);
  await sendReply();
  const fish = view.container.querySelector(
    'img[alt="Gill Gates, a goldfish wearing a tie"]',
  );
  await waitFor(() => expect(fish).toHaveClass("gill-mouth-hidden"));
  speechTime = 3;
  await waitFor(() => expect(fish).not.toHaveClass("gill-mouth-hidden"));
  expect(screen.getByLabelText("Gill is speaking")).toBeInTheDocument();
  speechTime = 4.5;
  await waitFor(() => expect(fish).toHaveClass("gill-mouth-hidden"));
});
it("sends a question handed over by a button (like Ask Gill about AAPL) as soon as the chat opens", async () => {
  vi.mocked(api).mockResolvedValueOnce({ events: [{ type: "message", message_id: "reply", text: "Apple designs phones." }] });
  render(<GillChat {...props} muted initialQuestion="I'm researching Apple Inc. (AAPL)." />);
  expect(await screen.findByText("Apple designs phones.")).toBeInTheDocument();
  expect(api).toHaveBeenCalledWith("/assistant/sessions/chat/messages", "POST", { text: "I'm researching Apple Inc. (AAPL)." });
  expect(screen.getByText("I'm researching Apple Inc. (AAPL).")).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "Question for Gill" })).toHaveValue("");
  expect(vi.mocked(api).mock.calls.filter(([path]) => String(path).endsWith("/messages"))).toHaveLength(1);
});
it("keeps the auto-sent question visible when the chat mounts twice (React dev mode)", async () => {
  const { StrictMode } = await import("react");
  vi.mocked(api)
    .mockResolvedValueOnce({ session_id: "chat2", voice_available: false, suggestions: [], events: [{ type: "message", message_id: "greeting", text: "Good day." }] })
    .mockResolvedValueOnce({ events: [{ type: "message", message_id: "reply", text: "Microsoft sells software." }] });
  render(<StrictMode><GillChat {...props} muted initialQuestion="Tell me about MSFT" /></StrictMode>);
  expect(await screen.findByText("Microsoft sells software.")).toBeInTheDocument();
  expect(screen.getByText("Tell me about MSFT")).toBeInTheDocument();
  const sends = vi.mocked(api).mock.calls.filter(([path]) => String(path).endsWith("/messages"));
  expect(sends).toEqual([["/assistant/sessions/chat2/messages", "POST", { text: "Tell me about MSFT" }]]);
});
