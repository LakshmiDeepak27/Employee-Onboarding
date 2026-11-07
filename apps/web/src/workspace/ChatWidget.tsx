import { useState, useRef, useEffect, type FormEvent, type KeyboardEvent } from "react";
import { X, Minus, Send } from "lucide-react";
import { api } from "../lib/api";
import type { ChatResponse } from "@eo/contracts";

interface ChatMessage {
  id: number;
  role: "user" | "assistant";
  text: string;
  response?: ChatResponse;
}

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 1,
      role: "assistant",
      text: "Hello! I am CLYORA, your onboarding assistant. Ask me anything about required documents, equipment, benefits, payroll, or company policies.",
    },
  ]);

  const transcriptRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(2);

  useEffect(() => {
    if (open && transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [messages, open]);

  async function sendMessage(textToSend?: string) {
    const trimmed = (textToSend ?? message).trim();
    if (!trimmed || busy) return;
    setMessage("");
    setError(null);
    setMessages((current) => [
      ...current,
      { id: nextId.current++, role: "user", text: trimmed },
    ]);
    setBusy(true);

    try {
      const response = await api.chat.ask({ message: trimmed });
      setMessages((current) => [
        ...current,
        {
          id: nextId.current++,
          role: "assistant",
          text: response.answer,
          response,
        },
      ]);
    } catch (err: any) {
      setError(err?.message || "CLYORA assistant is currently unreachable.");
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
          className="clyora-chat-pill-button"
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Ask CLYORA AI Assistant"
        >
          <span className="clyora-pill-icon-circle" aria-hidden="true">
            <span className="clyora-c-letter">C</span>
          </span>
          <span className="clyora-pill-title">Ask CLYORA</span>
          <span className="clyora-pill-badge">AI Assistant</span>
        </button>
      ) : (
        <div className="clyora-chat-popup" role="dialog" aria-label="CLYORA AI Assistant">
          <header className="clyora-chat-header">
            <div className="clyora-chat-header-identity">
              <span className="clyora-chat-avatar">C</span>
              <div>
                <strong className="clyora-chat-name">CLYORA</strong>
                <span className="clyora-chat-status">
                  <span className="clyora-online-dot" /> AI Onboarding Assistant
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
              <p>Grounded in approved policy sources & worker profile.</p>
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
                  <div className="clyora-msg-bubble">
                    <p>{m.text}</p>
                    {m.response?.citations && m.response.citations.length > 0 && (
                      <div className="clyora-msg-citations">
                        <span className="clyora-citation-title">Grounded Sources:</span>
                        {m.response.citations.map((c, i) => (
                          <span key={i} className="clyora-citation-tag">
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
                  <div className="clyora-msg-bubble clyora-msg-typing">
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                    <span className="typing-dot" />
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
              placeholder="Ask a question..."
              className="clyora-chat-input"
              disabled={busy}
              maxLength={600}
            />
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
