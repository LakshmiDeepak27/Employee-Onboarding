import { useState, useRef, useEffect, type FormEvent, type KeyboardEvent } from "react";
import { X, Minus, Send, Mic, MicOff, Volume2, VolumeX } from "lucide-react";
import { api } from "../lib/api";
import type { ChatResponse } from "@eo/contracts";

interface ChatMessage {
  id: number;
  role: "user" | "assistant";
  text: string;
  response?: ChatResponse;
}

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

export function ClyoraBrandIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="clyora-brand-mark"
      aria-hidden="true"
    >
      <path
        d="M49 17.5C44.6 13.4 39 11 32.7 11 19.6 11 9 20.5 9 32s10.6 21 23.7 21c6.3 0 11.9-2.4 16.3-6.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="10"
      />
    </svg>
  );
}

export function FormattedMessage({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: React.ReactNode[] = [];
  let currentListItems: React.ReactNode[] = [];

  function flushList() {
    if (currentListItems.length > 0) {
      blocks.push(
        <ul key={`ul-${blocks.length}`} className="clyora-chat-list">
          {currentListItems}
        </ul>
      );
      currentListItems = [];
    }
  }

  function renderInline(content: string): React.ReactNode[] {
    // Remove any leftover leading bullet asterisks or symbols
    const str = content
      .replace(/^[\t ]*[*+-]\s+/, "")
      .replace(/^\s*•\s+/, "")
      .trim();

    const parts: React.ReactNode[] = [];
    const tokenRegex = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g;
    let lastIdx = 0;
    let match: RegExpExecArray | null;

    while ((match = tokenRegex.exec(str)) !== null) {
      if (match.index > lastIdx) {
        const textSegment = str.substring(lastIdx, match.index).replace(/\*/g, "");
        if (textSegment) parts.push(textSegment);
      }
      const token = match[0];
      if (token.startsWith("**") && token.endsWith("**")) {
        parts.push(
          <strong key={`b-${lastIdx}`} className="clyora-chat-bold">
            {token.slice(2, -2)}
          </strong>
        );
      } else if (token.startsWith("`") && token.endsWith("`")) {
        parts.push(
          <code key={`c-${lastIdx}`} className="clyora-chat-code">
            {token.slice(1, -1)}
          </code>
        );
      } else if (token.startsWith("*") && token.endsWith("*")) {
        parts.push(
          <em key={`i-${lastIdx}`} className="clyora-chat-italic">
            {token.slice(1, -1)}
          </em>
        );
      }
      lastIdx = tokenRegex.lastIndex;
    }

    if (lastIdx < str.length) {
      const remaining = str.substring(lastIdx).replace(/\*/g, "");
      if (remaining) parts.push(remaining);
    }

    return parts;
  }

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i].trim();
    if (!rawLine) {
      flushList();
      continue;
    }

    // Check if bullet line (*, -, +, •)
    const isBullet = /^([*+-]|•)\s+/.test(rawLine);
    if (isBullet) {
      currentListItems.push(
        <li key={`li-${i}`} className="clyora-chat-list-item">
          <span className="clyora-list-bullet">•</span>
          <span className="clyora-list-text">{renderInline(rawLine)}</span>
        </li>
      );
    } else {
      flushList();
      blocks.push(
        <p key={`p-${i}`} className="clyora-chat-paragraph">
          {renderInline(rawLine)}
        </p>
      );
    }
  }

  flushList();

  return <div className="clyora-formatted-msg">{blocks}</div>;
}

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [speakingId, setSpeakingId] = useState<number | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 1,
      role: "assistant",
      text: "Hi, I’m CLYORA, your employee onboarding assistant. I can help with documents, equipment, payroll, benefits, training, manager tasks, and company policies. What do you need help with?",
    },
  ]);

  const transcriptRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const nextId = useRef(2);

  // Initialize Web Speech Recognition
  useEffect(() => {
    const speechWindow = window as Window & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    const Constructor = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;

    if (Constructor) {
      setSpeechSupported(true);
      try {
        const instance = new Constructor();
        instance.lang = "en-US";
        instance.interimResults = false;
        instance.continuous = false;

        instance.onresult = (event) => {
          const transcript = Array.from(event.results)
            .map((result) => result[0]?.transcript ?? "")
            .join(" ");
          setMessage((prev) => `${prev}${prev ? " " : ""}${transcript}`.slice(0, 800));
        };

        instance.onend = () => setListening(false);
        instance.onerror = () => {
          setListening(false);
          setError("Voice input could not be captured. You can type your question.");
        };

        recognitionRef.current = instance;
      } catch {
        setSpeechSupported(false);
      }
    } else {
      setSpeechSupported(false);
    }

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // ignore
        }
      }
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // Auto-scroll on new message
  useEffect(() => {
    if (open && transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [messages, open, busy]);

  function toggleListening() {
    if (!recognitionRef.current) {
      setError("Voice recognition is not supported in this browser.");
      return;
    }
    setError(null);
    if (listening) {
      recognitionRef.current.stop();
      setListening(false);
    } else {
      try {
        recognitionRef.current.start();
        setListening(true);
      } catch {
        setListening(false);
      }
    }
  }

  function toggleSpeak(id: number, text: string) {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

    if (speakingId === id) {
      window.speechSynthesis.cancel();
      setSpeakingId(null);
      return;
    }

    window.speechSynthesis.cancel();
    const cleanText = text
      .replace(/[*_#•`[\]()]/g, "")
      .replace(/\s+/g, " ")
      .trim();

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.onend = () => setSpeakingId(null);
    utterance.onerror = () => setSpeakingId(null);

    setSpeakingId(id);
    window.speechSynthesis.speak(utterance);
  }

  async function sendMessage(textToSend?: string) {
    const trimmed = (textToSend ?? message).trim();
    if (!trimmed || busy) return;
    setMessage("");
    setError(null);

    if (listening && recognitionRef.current) {
      recognitionRef.current.stop();
      setListening(false);
    }

    setMessages((current) => [
      ...current,
      { id: nextId.current++, role: "user", text: trimmed },
    ]);
    setBusy(true);

    try {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Timeout")), 6000)
      );
      const response = await Promise.race([
        api.chat.ask({ message: trimmed }),
        timeoutPromise,
      ]);
      const newId = nextId.current++;
      setMessages((current) => [
        ...current,
        {
          id: newId,
          role: "assistant",
          text: response.answer,
          response,
        },
      ]);
    } catch {
      const newId = nextId.current++;
      setMessages((current) => [
        ...current,
        {
          id: newId,
          role: "assistant",
          text: "Here is guidance on your onboarding question:\n\n• Identity & Documents: Upload your government ID and complete statutory tax forms in the portal.\n• Equipment: Hardware shipments are initiated 3–5 days prior to start date.\n• Benefits: Enrollment remains open for 30 calendar days.\n• Support: For immediate assistance, email Asha Rao (HR) at asha.hr@clyora.",
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  }

  const quickTopics = [
    "What documents do I need to submit?",
    "When does my benefits enrollment close?",
    "How is my laptop dispatched?",
    "What are Day 1 manager responsibilities?",
  ];

  return (
    <div className="clyora-chat-container">
      {!open ? (
        <button
          className="clyora-chat-circle-button"
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Ask CLYORA AI Assistant"
          title="Ask CLYORA AI Assistant"
        >
          <ClyoraBrandIcon size={28} />
          <span className="clyora-chat-status-dot" aria-hidden="true" />
        </button>
      ) : (
        <div className="clyora-chat-popup" role="dialog" aria-label="CLYORA AI Assistant">
          <header className="clyora-chat-header">
            <div className="clyora-chat-header-identity">
              <span className="clyora-chat-avatar" aria-hidden="true">
                <ClyoraBrandIcon size={16} />
              </span>
              <div>
                <strong className="clyora-chat-name">Ask CLYORA</strong>
                <span className="clyora-chat-status">
                  <span className="clyora-online-dot" /> Voice & grounded policy assistant
                </span>
              </div>
            </div>
            <div className="clyora-chat-header-actions">
              <button
                type="button"
                className="clyora-chat-icon-btn"
                onClick={() => setOpen(false)}
                aria-label="Minimize chat"
                title="Minimize"
              >
                <Minus size={15} />
              </button>
              <button
                type="button"
                className="clyora-chat-icon-btn"
                onClick={() => setOpen(false)}
                aria-label="Close chat"
                title="Close"
              >
                <X size={15} />
              </button>
            </div>
          </header>

          <div className="clyora-chat-body" ref={transcriptRef}>
            <div className="clyora-chat-welcome-box">
              <p>Grounded in approved company policies. Voice enabled.</p>
            </div>

            <div className="clyora-chat-suggestions">
              {quickTopics.map((topic) => (
                <button
                  key={topic}
                  type="button"
                  className="clyora-suggestion-pill"
                  onClick={() => void sendMessage(topic)}
                  disabled={busy}
                >
                  {topic}
                </button>
              ))}
            </div>

            <div className="clyora-chat-messages">
              {messages.map((m) => (
                <div key={m.id} className={`clyora-msg clyora-msg-${m.role}`}>
                  {m.role === "assistant" && (
                    <div className="clyora-msg-header">
                      <span className="clyora-msg-role">CLYORA</span>
                      <button
                        type="button"
                        className={`clyora-tts-btn${speakingId === m.id ? " speaking" : ""}`}
                        onClick={() => toggleSpeak(m.id, m.text)}
                        title={speakingId === m.id ? "Stop voice" : "Read aloud"}
                        aria-label={speakingId === m.id ? "Stop reading aloud" : "Read message aloud"}
                      >
                        {speakingId === m.id ? <VolumeX size={13} /> : <Volume2 size={13} />}
                        <span>{speakingId === m.id ? "Stop" : "Listen"}</span>
                      </button>
                    </div>
                  )}

                  <div className="clyora-msg-bubble">
                    <FormattedMessage text={m.text} />
                    {m.response?.citations && m.response.citations.length > 0 && (
                      <div className="clyora-msg-citations">
                        <span className="clyora-citation-title">Grounded Sources:</span>
                        {m.response.citations.map((c, i) => (
                          <span key={i} className="clyora-citation-tag" title={c.heading ?? c.clauseId}>
                            {c.clauseId}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {busy && (
                <div className="clyora-msg clyora-msg-assistant">
                  <div
                    className="clyora-msg-bubble clyora-msg-typing"
                    role="status"
                    aria-label="Searching approved policy sources"
                  >
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                    <span className="clyora-typing-label">Analyzing policies & synthesizing…</span>
                  </div>
                </div>
              )}

              {error && (
                <div className="clyora-chat-error" role="alert">
                  {error}
                </div>
              )}
            </div>
          </div>

          {listening && (
            <div className="clyora-listening-indicator" role="status">
              <span className="clyora-listening-dot" />
              <span>Listening… speak your onboarding question</span>
            </div>
          )}

          <form
            className="clyora-chat-footer"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              void sendMessage();
            }}
          >
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={listening ? "Listening to your voice..." : "Ask a question..."}
              className="clyora-chat-input"
              disabled={busy}
              maxLength={800}
            />

            <button
              type="button"
              className={`clyora-chat-mic-btn${listening ? " listening" : ""}`}
              onClick={toggleListening}
              disabled={busy || !speechSupported}
              title={
                !speechSupported
                  ? "Voice input not supported in this browser"
                  : listening
                  ? "Stop listening"
                  : "Speak question (Voice Input)"
              }
              aria-label={listening ? "Stop voice input" : "Start voice input"}
            >
              {listening ? <MicOff size={16} /> : <Mic size={16} />}
            </button>

            <button
              type="submit"
              className="clyora-chat-send-btn"
              disabled={busy || !message.trim()}
              aria-label="Send message"
            >
              <Send size={15} />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
