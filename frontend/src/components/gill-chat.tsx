// Gill's chat window, backed by our FastAPI assistant (backend /assistant/...).
// The backend decides what Gill may read (consent cards) and sends structured events we render here.
import { useEffect, useRef, useState } from "react";
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
  PromptInputSubmit,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Mic, Volume2, VolumeX, Square, Send } from "lucide-react";
import { api, apiAudio, ApiError } from "@/lib/api";
import type {
  ConsentChoice,
  GillEvent,
  SaveTarget,
  SessionCreated,
  Turn,
} from "@/lib/gill-protocol";
import chatRoom from "@/assets/gill-chat-room.png";
import mouthClosed from "@/assets/gill-mouth-closed.png";
import mouthOpen from "@/assets/gill-mouth-open.png";

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
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [mouthMoving, setMouthMoving] = useState(false);
  const audio = useRef<AudioContext | null>(null);
  const source = useRef<AudioBufferSourceNode | null>(null);
  const speechRequest = useRef(0);
  const speakerMuted = useRef(muted);
  speakerMuted.current = muted;
  const textarea = useRef<HTMLTextAreaElement | null>(null);
  const recognition = useRef<{ stop: () => void } | null>(null);
  const mounted = useRef(false);

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
    mounted.current = true;
    start();
    return () => {
      mounted.current = false;
      speechRequest.current++;
      recognition.current?.stop();
      source.current?.stop();
      if (audio.current && audio.current.state !== "closed")
        void audio.current.close();
      audio.current = null;
    };
    // one chat per mount; the parent remounts us when the signed-in user changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (muted) {
      speechRequest.current++;
      source.current?.stop();
      source.current = null;
      setSpeaking(false);
    }
  }, [muted]);

  useEffect(() => {
    if (!speaking) {
      setMouthMoving(false);
      return;
    }
    const timer = window.setInterval(
      () => setMouthMoving((open) => !open),
      160,
    );
    return () => window.clearInterval(timer);
  }, [speaking]);

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
    // Unlock audio during the send/card click, before awaiting Gill's reply.
    if (!muted && voiceAvailable) {
      const context = audio.current?.state !== "closed" ? audio.current : null;
      audio.current = context ?? new AudioContext();
      void audio.current.resume().catch(() => undefined);
    }
    speechRequest.current++;
    source.current?.stop();
    source.current = null;
    setSpeaking(false);
    setBusy(true);
    setError("");
    if (before) setItems(before);
    try {
      const turn = await api<Turn>(
        `/assistant/sessions/${sessionId}${path}`,
        "POST",
        body,
      );
      const reply = [...turn.events]
        .reverse()
        .find((event) => event.type === "message");
      if (
        mounted.current &&
        reply?.type === "message" &&
        voiceAvailable &&
        !speakerMuted.current
      )
        void speak(sessionId, reply.message_id);
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

  async function speak(chatSessionId: string, messageId: string) {
    const requestId = ++speechRequest.current;
    try {
      const context =
        audio.current && audio.current.state !== "closed"
          ? audio.current
          : new AudioContext();
      audio.current = context;
      await context.resume();
      const data = await apiAudio(
        `/assistant/sessions/${chatSessionId}/messages/${messageId}/speech`,
      );
      if (requestId !== speechRequest.current || speakerMuted.current) return;
      // A restrained desktop-speaker sound; avoid bit crushing, which adds static.
      const decoded = await context.decodeAudioData(data);
      if (requestId !== speechRequest.current || speakerMuted.current) return;
      const node = context.createBufferSource();
      node.buffer = decoded;
      node.playbackRate.value = 0.94;
      const highpass = context.createBiquadFilter();
      highpass.type = "highpass";
      highpass.frequency.value = 140;
      highpass.Q.value = 0.7;
      const lowpass = context.createBiquadFilter();
      lowpass.type = "lowpass";
      lowpass.frequency.value = 4800;
      lowpass.Q.value = 0.7;
      const compressor = context.createDynamicsCompressor();
      compressor.threshold.value = -20;
      compressor.knee.value = 12;
      compressor.ratio.value = 2;
      compressor.attack.value = 0.01;
      compressor.release.value = 0.15;
      const gain = context.createGain();
      gain.gain.value = 0.85;
      node.connect(highpass);
      highpass.connect(lowpass);
      lowpass.connect(compressor);
      compressor.connect(gain);
      gain.connect(context.destination);
      source.current = node;
      node.onended = () => {
        if (source.current === node) {
          source.current = null;
          if (mounted.current) setSpeaking(false);
        }
        node.disconnect();
        highpass.disconnect();
        lowpass.disconnect();
        compressor.disconnect();
        gain.disconnect();
      };
      node.start();
      setSpeaking(true);
    } catch (e) {
      if (requestId === speechRequest.current && !speakerMuted.current)
        setError(e instanceof Error ? e.message : "Voice playback failed.");
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
    <section
      className={`gill-chatroom ${maximized ? "gill-chatroom-maximized" : ""}`}
      aria-label="Gill’s conversation room"
    >
      <img className="gill-chatroom-art" src={chatRoom} alt="" />
      <div className="gill-room-title">
        <strong>Gill Gates</strong>
        <span>Senior Bowl Street Broker</span>
      </div>
      <button
        className="gill-room-window-control gill-room-minimize"
        onClick={onClose}
        aria-label="Return to your money"
      />
      <button
        className="gill-room-window-control gill-room-maximize"
        onClick={() => setMaximized(!maximized)}
        aria-label={maximized ? "Restore chatroom size" : "Expand chatroom"}
      />
      <button
        className="gill-room-window-control gill-room-close"
        onClick={onClose}
        aria-label="Close Gill’s chatroom"
      />
      <div
        className="gill-room-aquarium"
        aria-label={speaking ? "Gill is speaking" : "Gill is swimming"}
      >
        <div className="gill-room-swimmer">
          <div className="gill-room-fish">
            <img
              src={mouthClosed}
              alt="Gill Gates, a goldfish wearing a tie"
              className={mouthMoving ? "gill-mouth-hidden" : ""}
            />
            <img
              src={mouthOpen}
              alt=""
              aria-hidden="true"
              className={mouthMoving ? "" : "gill-mouth-hidden"}
            />
          </div>
        </div>
        <span className="gill-room-caption">
          {speaking
            ? "Gill has the floor…"
            : busy
              ? "Considering your position…"
              : "Your distinguished financial companion"}
        </span>
      </div>
      <button
        className="gill-room-microphone"
        onClick={microphone}
        aria-label={listening ? "Stop microphone" : "Use microphone"}
        title="Dictate your question"
      >
        {listening ? <Square /> : <Mic />}
      </button>
      <button
        className="gill-room-speaker"
        onClick={onMute}
        aria-label={muted ? "Enable Gill’s voice" : "Mute Gill’s voice"}
        aria-pressed={!muted}
        title={
          voiceAvailable
            ? "Toggle Gill’s voice"
            : "Voice is unavailable on the server"
        }
      >
        {muted ? <VolumeX /> : <Volume2 />}
      </button>
      <div className="gill-room-chat">
        <div className="gill-room-chat-heading">
          <strong>Conversation</strong>
          {!userId && (
            <Button variant="link" size="xs" onClick={onSignIn}>
              Sign in
            </Button>
          )}
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
        <PromptInput
          className="gill-room-input"
          onSubmit={({ text }) => send(text)}
        >
          <PromptInputTextarea
            ref={textarea}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask Gill a financial question…"
            aria-label="Question for Gill"
          />
          <PromptInputSubmit
            className="gill-room-send"
            status={busy ? "submitted" : "ready"}
            disabled={busy || !sessionId || !input.trim()}
            aria-label="Send message to Gill"
          >
            <Send />
          </PromptInputSubmit>
        </PromptInput>
        <small className="text-muted-foreground text-[9px] mt-2">
          Educational guidance. Records accessed only with your OK.
        </small>
      </div>
    </section>
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
