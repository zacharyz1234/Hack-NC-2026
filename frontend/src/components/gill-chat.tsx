// Gill's chat window, backed by our FastAPI assistant (backend /assistant/...).
// The backend decides what Gill may read (consent cards) and sends structured events we render here.
import { useEffect, useRef, useState } from "react";
import { XPWindow } from "./xp-window";
import { ConsentCard, GillCard } from "./gill-cards";
import { Button } from "@/components/ui/button";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputSubmit,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Fish, Mic, Volume2, VolumeX, Play, Square } from "lucide-react";
import { api, apiAudio, ApiError } from "@/lib/api";
import type {
  ConsentChoice,
  GillEvent,
  SaveTarget,
  SessionCreated,
  Turn,
} from "@/lib/gill-protocol";
import bowl from "@/assets/gill-bowl.png";

type Item =
  | { key: string; event: GillEvent; done: boolean }
  | { key: string; user: string };

let keySeq = 0;
const nextKey = () => `item-${++keySeq}`;

export function GillChat({
  userId,
  onClose,
  onSignIn,
  onDataChanged,
  initialQuestion = "",
  muted,
  onMute,
}: {
  userId: number | null;
  onClose: () => void;
  onSignIn: () => void;
  onDataChanged: () => void;
  initialQuestion?: string;
  muted: boolean;
  onMute: () => void;
}) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [voiceAvailable, setVoiceAvailable] = useState(false);
  const [input, setInput] = useState(initialQuestion);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [playing, setPlaying] = useState(false);
  const [listening, setListening] = useState(false);
  const audio = useRef<AudioContext | null>(null);
  const source = useRef<AudioBufferSourceNode | null>(null);
  const textarea = useRef<HTMLTextAreaElement | null>(null);
  const recognition = useRef<{ stop: () => void } | null>(null);

  async function start(notice?: string) {
    setError("");
    try {
      const session = await api<SessionCreated>("/assistant/sessions", "POST");
      setSessionId(session.session_id);
      setSuggestions(session.suggestions);
      setVoiceAvailable(session.voice_available);
      setItems([
        ...(notice
          ? [
              {
                key: nextKey(),
                event: { type: "notice", text: notice } as GillEvent,
                done: true,
              },
            ]
          : []),
        ...session.events.map((event) => ({
          key: nextKey(),
          event,
          done: false,
        })),
      ]);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Gill's office is closed right now.",
      );
    }
  }

  useEffect(() => {
    start();
    textarea.current?.focus();
    return () => {
      recognition.current?.stop();
      source.current?.stop();
      audio.current?.close();
    };
    // one chat per mount; the parent remounts us when the signed-in user changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (muted) {
      source.current?.stop();
      setPlaying(false);
    }
  }, [muted]);

  // Every call returns a turn: append its events. A 404 means the chat expired.
  async function run(
    path: string,
    body: unknown,
    {
      before,
      answered,
    }: { before?: (items: Item[]) => Item[]; answered?: string } = {},
  ) {
    if (!sessionId || busy) return;
    setBusy(true);
    setError("");
    if (before) setItems(before);
    try {
      const turn = await api<Turn>(
        `/assistant/sessions/${sessionId}${path}`,
        "POST",
        body,
      );
      setItems((now) => [
        // a card counts as answered only once the backend accepted the answer
        ...now.map((item) =>
          item.key === answered && "event" in item
            ? { ...item, done: true }
            : item,
        ),
        ...turn.events.map((event) => ({ key: nextKey(), event, done: false })),
      ]);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404)
        await start("That chat expired, so Gill started a fresh one.");
      else setError(e instanceof Error ? e.message : "Gill couldn't answer.");
    } finally {
      setBusy(false);
      textarea.current?.focus();
    }
  }

  function send(text: string) {
    if (!text.trim() || busy) return;
    setInput("");
    setSuggestions([]);
    // typing instead of answering closes any open cards (the backend does the same)
    run(
      "/messages",
      { text },
      {
        before: (now) => [
          ...now.map((item) =>
            "event" in item ? { ...item, done: true } : item,
          ),
          { key: nextKey(), user: text },
        ],
      },
    );
  }

  function saved(target: SaveTarget) {
    onDataChanged();
    if (sessionId)
      api(`/assistant/sessions/${sessionId}/events`, "POST", {
        type: "user_saved",
        target,
      }).catch(() => undefined);
  }

  async function speak() {
    setError("");
    if (playing) {
      source.current?.stop();
      setPlaying(false);
      return;
    }
    const last = [...items]
      .reverse()
      .find((item) => "event" in item && item.event.type === "message");
    if (
      !sessionId ||
      !last ||
      !("event" in last) ||
      last.event.type !== "message"
    )
      return;
    try {
      setPlaying(true);
      const data = await apiAudio(
        `/assistant/sessions/${sessionId}/messages/${last.event.message_id}/speech`,
      );
      // the team's retro "old broker on a speakerphone" filter chain
      const context = new AudioContext();
      audio.current = context;
      const decoded = await context.decodeAudioData(data);
      const node = context.createBufferSource();
      node.buffer = decoded;
      node.playbackRate.value = 0.91;
      const filter = context.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = 1300;
      filter.Q.value = 0.5;
      const wave = context.createWaveShaper();
      const curve = new Float32Array(65536);
      for (let i = 0; i < curve.length; i++) {
        const x = (i * 2) / curve.length - 1;
        curve[i] = Math.round(x * 20) / 20;
      }
      wave.curve = curve;
      node.connect(filter);
      filter.connect(wave);
      wave.connect(context.destination);
      source.current = node;
      node.onended = () => {
        setPlaying(false);
        context.close();
      };
      node.start();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Voice playback failed.");
      setPlaying(false);
    }
  }

  function microphone() {
    if (listening) {
      recognition.current?.stop();
      setListening(false);
      return;
    }
    type Recognition = {
      start: () => void;
      stop: () => void;
      lang: string;
      onresult:
        ((event: { results: { transcript: string }[][] }) => void) | null;
      onerror: ((event: { error: string }) => void) | null;
      onend: (() => void) | null;
    };
    const win = window as unknown as {
      SpeechRecognition?: new () => Recognition;
      webkitSpeechRecognition?: new () => Recognition;
    };
    const Constructor = win.SpeechRecognition ?? win.webkitSpeechRecognition;
    if (!Constructor) {
      setError(
        "Speech input is unavailable in this browser. You can still type your question.",
      );
      return;
    }
    setError("Your microphone is used to turn your question into text.");
    const r = new Constructor();
    r.lang = "en-US";
    r.onresult = (e) => {
      setInput((prev) =>
        `${prev} ${e.results[0]?.[0]?.transcript ?? ""}`.trim(),
      );
      setError("");
      textarea.current?.focus();
    };
    r.onerror = (e) => {
      setError(`Microphone: ${e.error}.`);
      setListening(false);
    };
    r.onend = () => setListening(false);
    recognition.current = r;
    r.start();
    setListening(true);
  }

  return (
    <XPWindow
      title="Gill Gates — Your financial advisor"
      icon={<Fish size={15} />}
      onClose={onClose}
      className="chat-window"
    >
      <div className="chat-intro">
        <img src={bowl} alt="Gill Gates" />
        <div>
          <strong>Gill Gates</strong>
          <p className="text-muted-foreground">
            {userId ? (
              "Bowl Street’s finest. No contest."
            ) : (
              <>
                Chatting as a guest.{" "}
                <Button
                  variant="link"
                  size="xs"
                  className="tiny-link"
                  onClick={onSignIn}
                >
                  Sign in
                </Button>{" "}
                to let Gill (with your OK) look at your money.
              </>
            )}
          </p>
        </div>
      </div>
      <Conversation className="chat-transcript">
        <ConversationContent className="p-1 gap-3">
          {items.map((item) =>
            "user" in item ? (
              <Message key={item.key} from="user">
                <MessageContent>{item.user}</MessageContent>
              </Message>
            ) : (
              <EventView
                key={item.key}
                event={item.event}
                active={!item.done && !busy}
                onSubmit={(value) =>
                  item.event.type === "component" &&
                  run(
                    "/submit",
                    { call_id: item.event.call_id, value },
                    { answered: item.key },
                  )
                }
                onDismiss={() =>
                  item.event.type === "component" &&
                  run(
                    "/submit",
                    { call_id: item.event.call_id, dismissed: true },
                    { answered: item.key },
                  )
                }
                onConsent={(decisions) =>
                  item.event.type === "consent_request" &&
                  run(
                    "/consent",
                    { request_id: item.event.request_id, decisions },
                    { answered: item.key },
                  )
                }
                onSaved={saved}
              />
            ),
          )}
          {busy && <Shimmer>Gill is considering your position…</Shimmer>}
          {suggestions.length > 0 && !busy && (
            <div className="gill-suggestions">
              {suggestions.map((s) => (
                <Button
                  key={s}
                  variant="soft"
                  size="xs"
                  onClick={() => send(s)}
                >
                  {s}
                </Button>
              ))}
            </div>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
      {error && (
        <p className="chat-error" role="status">
          {error}
        </p>
      )}
      <PromptInput onSubmit={({ text }) => send(text)}>
        <PromptInputTextarea
          ref={textarea}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask Gill a financial question…"
          aria-label="Question for Gill"
        />
        <PromptInputFooter>
          <div className="chat-controls">
            <Button
              variant="ghost"
              size="icon-sm"
              type="button"
              onClick={microphone}
              aria-label={listening ? "Stop microphone" : "Use microphone"}
              title="Speak your question"
            >
              {listening ? <Square /> : <Mic />}
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              type="button"
              onClick={onMute}
              aria-label={muted ? "Enable voice" : "Mute voice"}
              title="Text-only mode"
            >
              {muted ? <VolumeX /> : <Volume2 />}
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              type="button"
              onClick={speak}
              disabled={muted || !voiceAvailable}
              aria-label={playing ? "Stop playback" : "Play Gill’s reply"}
              title={
                voiceAvailable
                  ? "Retro voice playback"
                  : "Voice isn't set up on the server"
              }
            >
              {playing ? <Square /> : <Play />}
            </Button>
          </div>
          <PromptInputSubmit
            variant="aero"
            status={busy ? "submitted" : "ready"}
            disabled={busy || !input.trim()}
          />
        </PromptInputFooter>
      </PromptInput>
      <small className="text-muted-foreground text-[9px] mt-2">
        Educational guidance only. Gill can read your data only with your OK,
        and can’t change anything.
      </small>
    </XPWindow>
  );
}

function EventView({
  event,
  active,
  onSubmit,
  onDismiss,
  onConsent,
  onSaved,
}: {
  event: GillEvent;
  active: boolean;
  onSubmit: (value: Record<string, unknown>) => void;
  onDismiss: () => void;
  onConsent: (decisions: Record<string, ConsentChoice>) => void;
  onSaved: (target: SaveTarget) => void;
}) {
  switch (event.type) {
    case "message":
      return (
        <Message from="assistant">
          <MessageContent>
            <MessageResponse>{event.text}</MessageResponse>
          </MessageContent>
        </Message>
      );
    case "component":
      return (
        <GillCard
          event={event}
          active={active && event.awaits_input}
          onSubmit={onSubmit}
          onDismiss={onDismiss}
          onSaved={onSaved}
        />
      );
    case "consent_request":
      return <ConsentCard event={event} active={active} onAnswer={onConsent} />;
    case "data_access":
      return <p className="gill-chip">🐟 {event.label}</p>;
    case "notice":
      return <p className="gill-notice">{event.text}</p>;
    default:
      return null; // unknown event types are ignored
  }
}
