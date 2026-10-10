import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getGillHistory } from "@/lib/gill.functions";
import { XPWindow } from "./xp-window";
import { AuthPanel } from "./auth-panel";
import { Button } from "@/components/ui/button";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputSubmit,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Fish, Mic, Volume2, VolumeX, Play, Square } from "lucide-react";
import bowl from "@/assets/gill-bowl.png";
import bowlWithComputer from "@/assets/gill-computer-bowl.png";
import gillFish from "@/assets/gill-fuller-fish.png";
export function GillChat({
  userId,
  onClose,
  onSignedIn,
  initialQuestion = "",
  muted,
  onMute,
}: {
  userId: string | null;
  onClose: () => void;
  onSignedIn: () => void;
  initialQuestion?: string;
  muted: boolean;
  onMute: () => void;
}) {
  const [history, setHistory] = useState<UIMessage[] | null>(null);
  const [error, setError] = useState("");
  const load = useServerFn(getGillHistory);
  useEffect(() => {
    if (!userId) return;
    load()
      .then((data) => setHistory(data as unknown as UIMessage[]))
      .catch(() => setError("Your conversation could not be loaded."));
  }, [load, userId]);
  return (
    <XPWindow
      title="Gill Gates — Your financial advisor"
      icon={<Fish size={15} />}
      onClose={onClose}
      className="chat-window"
    >
      {!userId ? (
        <div className="chat-auth">
          <span
            className="bowl-portrait"
            role="img"
            aria-label="Gill Gates swimming in his bowl beside his old computer"
          >
            <img className="bowl-portrait-glass" src={bowlWithComputer} alt="" width={1024} height={1024} />
            <span className="bowl-portrait-fish">
              <img src={gillFish} alt="" width={1024} height={1024} />
            </span>
          </span>
          <AuthPanel onSuccess={onSignedIn} />
          <small>Sign in to keep your conversation private and saved.</small>
        </div>
      ) : history ? (
        <ChatSession
          key={userId}
          history={history}
          initialQuestion={initialQuestion}
          muted={muted}
          onMute={onMute}
        />
      ) : (
        <p role="status">{error || "Opening Gill’s office…"}</p>
      )}
    </XPWindow>
  );
}
function ChatSession({
  history,
  initialQuestion,
  muted,
  onMute,
}: {
  history: UIMessage[];
  initialQuestion: string;
  muted: boolean;
  onMute: () => void;
}) {
  const [input, setInput] = useState(initialQuestion);
  const [error, setError] = useState("");
  const [playing, setPlaying] = useState(false);
  const [listening, setListening] = useState(false);
  const audio = useRef<AudioContext | null>(null);
  const source = useRef<AudioBufferSourceNode | null>(null);
  const textarea = useRef<HTMLTextAreaElement | null>(null);
  const recognition = useRef<{ stop: () => void } | null>(null);
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        headers: async () => {
          const { data } = await supabase.auth.getSession();
          return { Authorization: `Bearer ${data.session?.access_token ?? ""}` };
        },
      }),
    [],
  );
  const { messages, sendMessage, status, stop } = useChat({
    id: "gill-single",
    messages: history,
    transport,
    onError: (e) => setError(e.message),
    onFinish: () => textarea.current?.focus(),
  });
  useEffect(() => {
    textarea.current?.focus();
  }, []);
  useEffect(() => {
    if (muted) {
      source.current?.stop();
      setPlaying(false);
    }
  }, [muted]);
  useEffect(
    () => () => {
      recognition.current?.stop();
      source.current?.stop();
      audio.current?.close();
    },
    [],
  );
  async function speak() {
    setError("");
    const last = [...messages].reverse().find((m) => m.role === "assistant");
    const text =
      last?.parts
        .filter((p) => p.type === "text")
        .map((p) => p.text)
        .join(" ") ??
      "I, Gill Gates, welcome you to Bowl Street. Let us make your money work swimmingly.";
    try {
      if (playing) {
        source.current?.stop();
        setPlaying(false);
        return;
      }
      setPlaying(true);
      const { data } = await supabase.auth.getSession();
      const response = await fetch("/api/voice", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${data.session?.access_token ?? ""}`,
        },
        body: JSON.stringify({ text }),
      });
      if (!response.ok) {
        const r = await response.json();
        throw new Error(r.error);
      }
      const context = new AudioContext();
      audio.current = context;
      const decoded = await context.decodeAudioData(await response.arrayBuffer());
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
      onresult: ((event: { results: { transcript: string }[][] }) => void) | null;
      onerror: ((event: { error: string }) => void) | null;
      onend: (() => void) | null;
    };
    const win = window as unknown as {
      SpeechRecognition?: new () => Recognition;
      webkitSpeechRecognition?: new () => Recognition;
    };
    const Constructor = win.SpeechRecognition ?? win.webkitSpeechRecognition;
    if (!Constructor) {
      setError("Speech input is unavailable in this browser. You can still type your question.");
      return;
    }
    setError("Your microphone is used to turn your question into text.");
    const r = new Constructor();
    r.lang = "en-US";
    r.onresult = (e) => {
      setInput((prev) => `${prev} ${e.results[0]?.[0]?.transcript ?? ""}`.trim());
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
  const busy = status === "submitted" || status === "streaming";
  return (
    <>
      <div className="chat-intro">
        <img src={bowl} alt="Gill Gates" />
        <div>
          <strong>Gill Gates</strong>
          <p className="text-muted-foreground">Bowl Street’s finest. No contest.</p>
        </div>
      </div>
      <Conversation className="chat-transcript">
        <ConversationContent className="p-1 gap-4">
          {messages.length === 0 && (
            <Message from="assistant">
              <MessageContent>
                <MessageResponse>
                  I, Gill Gates, welcome you to my office. What financial matter shall we untangle
                  today?
                </MessageResponse>
              </MessageContent>
            </Message>
          )}
          {messages.map((m) => (
            <Message key={m.id} from={m.role}>
              <MessageContent>
                {m.parts.map((p, i) =>
                  p.type === "text" ? (
                    <MessageResponse key={i}>{p.text}</MessageResponse>
                  ) : p.type === "reasoning" ? (
                    <details key={i} className="text-muted-foreground text-xs">
                      <summary>Gill’s deliberations</summary>
                      <MessageResponse>{p.text}</MessageResponse>
                    </details>
                  ) : null,
                )}
              </MessageContent>
            </Message>
          ))}
          {status === "submitted" && <Shimmer>Gill is considering your position…</Shimmer>}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
      {error && (
        <p className="chat-error" role="status">
          {error}
        </p>
      )}
      <PromptInput
        onSubmit={({ text }) => {
          if (!text.trim() || busy) return;
          setError("");
          sendMessage({ text });
          setInput("");
          textarea.current?.focus();
        }}
      >
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
              disabled={muted}
              aria-label={playing ? "Stop playback" : "Play Gill’s reply"}
              title="Retro voice playback"
            >
              {playing ? <Square /> : <Play />}
            </Button>
          </div>
          <PromptInputSubmit
            variant="aero"
            status={status}
            onStop={stop}
            disabled={!busy && !input.trim()}
          />
        </PromptInputFooter>
      </PromptInput>
      <small className="text-muted-foreground text-[9px] mt-2">
        Educational guidance only. Investing involves risk.
      </small>
    </>
  );
}
