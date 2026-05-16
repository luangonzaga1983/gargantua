import { useState, Suspense, useCallback, useRef, useEffect } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";
import Blackhole from "./components/Blackhole";

const MASS = 1.5;
const SPIN = 0.8;
const PASSWORD = "Edineia1983.";
const CAM_POS = [10, 14, 26];
const WEBHOOK = "https://discord.com/api/webhooks/1505342531825827941/2KNYWnT2SFQ0qUbXE7RBKQPW3X3oj0kwWt-Q3JLaRd4mpHUbrVgVLZnteftDjEqzm7SH";

const SYSTEM_PROMPT = `Voce e um agente pessoal de automacao. O usuario vai pedir tarefas como abrir programas, sites, executar comandos, etc.

REGRAS:
- Sempre responda em dois blocos separados:
  1. Uma mensagem curta e direta em texto normal explicando o que vai fazer.
  2. Um bloco de codigo marcado com triple-backtick cmd ou powershell contendo o comando exato a executar.
- Se a tarefa nao precisar de codigo (pergunta simples, conversa), responda normalmente sem bloco de codigo.
- Sem emojis. Sem firulas. Seja direto e preciso.
- Os comandos serao lidos por um programa local no PC do usuario e executados automaticamente.
- Para abrir sites use: start https://site.com
- Para abrir programas use o nome do executavel ou o caminho completo.
- Para multiplas acoes, coloque tudo no mesmo bloco separado por linhas.`;

async function sendToWebhook(content) {
  try {
    await fetch(WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
  } catch (e) {
    console.error("Webhook error:", e);
  }
}

function extractCode(text) {
  const regex = /```(?:cmd|powershell|bat|bash|sh)\n?([\s\S]*?)```/gi;
  const matches = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    matches.push(match[1].trim());
  }
  return matches.join("\n");
}

function parseMessage(text) {
  const parts = [];
  const regex = /```(\w+)?\n?([\s\S]*?)```/g;
  let last = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) {
      const chunk = text.slice(last, match.index).trim();
      if (chunk) parts.push({ type: "text", content: chunk });
    }
    parts.push({ type: "code", lang: match[1] || "cmd", content: match[2].trim() });
    last = match.index + match[0].length;
  }
  if (last < text.length) {
    const rest = text.slice(last).trim();
    if (rest) parts.push({ type: "text", content: rest });
  }
  return parts;
}

async function askAgent(messages) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: SYSTEM_PROMPT,
      messages,
    }),
  });
  const data = await res.json();
  return data.content?.[0]?.text ?? "";
}

function CameraSetup() {
  const { camera } = useThree();
  useEffect(() => {
    camera.position.set(...CAM_POS);
    camera.lookAt(0, 0, 0);
  }, [camera]);
  return null;
}

function CodeBlock({ lang, content, dispatched }) {
  return (
    <div style={{
      marginTop: "10px",
      background: "rgba(0,0,0,0.6)",
      border: "1px solid rgba(255,255,255,0.09)",
      borderRadius: "8px",
      overflow: "hidden",
    }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "5px 12px",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
      }}>
        <span style={{
          fontSize: "10px", letterSpacing: "0.15em",
          color: "rgba(255,255,255,0.28)", textTransform: "uppercase",
        }}>
          {lang}
        </span>
        {dispatched && (
          <span style={{
            fontSize: "10px", letterSpacing: "0.12em",
            color: "rgba(140,220,140,0.65)", textTransform: "uppercase",
          }}>
            enviado
          </span>
        )}
      </div>
      <pre style={{
        margin: 0, padding: "12px 14px",
        fontSize: "12px", lineHeight: "1.7",
        color: "rgba(255,255,255,0.7)",
        fontFamily: "'JetBrains Mono', monospace",
        overflowX: "auto", whiteSpace: "pre-wrap", wordBreak: "break-all",
      }}>
        {content}
      </pre>
    </div>
  );
}

function ChatMessage({ role, parts, dispatched }) {
  const isUser = role === "user";
  return (
    <div style={{
      display: "flex",
      justifyContent: isUser ? "flex-end" : "flex-start",
      marginBottom: "20px",
      animation: "fadeUp 0.3s ease forwards",
    }}>
      <div style={{
        maxWidth: "86%",
        ...(isUser ? {
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.09)",
          borderRadius: "10px 10px 2px 10px",
          padding: "10px 14px",
        } : {}),
        fontSize: "13px", lineHeight: "1.78",
        color: "rgba(255,255,255,0.78)",
        fontFamily: "'JetBrains Mono', monospace",
        letterSpacing: "0.01em",
      }}>
        {isUser
          ? <span>{parts[0]?.content}</span>
          : parts.map((p, i) =>
              p.type === "code"
                ? <CodeBlock key={i} lang={p.lang} content={p.content} dispatched={dispatched} />
                : <p key={i} style={{ margin: i > 0 ? "8px 0 0" : "0", color: "rgba(255,255,255,0.7)" }}>{p.content}</p>
            )
        }
      </div>
    </div>
  );
}

export default function App() {
  const [screen, setScreen] = useState("password");
  const [pwInput, setPwInput] = useState("");
  const [pwError, setPwError] = useState(false);
  const [pwShake, setPwShake] = useState(false);

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [dispatchedIds, setDispatchedIds] = useState(new Set());
  const [fadeChat, setFadeChat] = useState(false);

  const orbitRef = useRef(null);
  const inputRef = useRef(null);
  const pwRef = useRef(null);
  const scrollRef = useRef(null);

  useEffect(() => { setTimeout(() => pwRef.current?.focus(), 300); }, []);
  useEffect(() => {
    if (screen === "chat") setTimeout(() => inputRef.current?.focus(), 400);
  }, [screen]);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  const handlePasswordSubmit = useCallback((e) => {
    e.preventDefault();
    if (pwInput === PASSWORD) {
      setScreen("chat");
      setTimeout(() => setFadeChat(true), 10);
    } else {
      setPwError(true);
      setPwShake(true);
      setTimeout(() => setPwShake(false), 500);
      setPwInput("");
    }
  }, [pwInput]);

  const handleApreciar = useCallback(() => {
    setFadeChat(false);
    setTimeout(() => setScreen("appreciate"), 600);
  }, []);

  const handleReturn = useCallback(() => {
    setScreen("chat");
    setTimeout(() => setFadeChat(true), 10);
  }, []);

  const handleSubmit = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    const apiHistory = [
      ...messages.map(m => ({
        role: m.role,
        content: m.parts.map(p => p.content).join("\n"),
      })),
      { role: "user", content: text },
    ];

    setMessages(prev => [...prev, { role: "user", parts: [{ type: "text", content: text }] }]);
    setInput("");
    setLoading(true);

    try {
      const answer = await askAgent(apiHistory);
      const parts = parseMessage(answer);
      const msgId = Date.now();
      setMessages(prev => [...prev, { role: "assistant", parts, id: msgId }]);

      const code = extractCode(answer);
      if (code) {
        await sendToWebhook("```\n" + code + "\n```");
        setDispatchedIds(prev => new Set([...prev, msgId]));
      }
    } catch {
      setMessages(prev => [...prev, {
        role: "assistant",
        parts: [{ type: "text", content: "Falha na comunicacao com o agente." }],
        id: Date.now(),
      }]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [input, loading, messages]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
  }, [handleSubmit]);

  const inputActive = input.trim() && !loading;

  return (
    <div style={{
      position: "relative", width: "100%", height: "100vh",
      background: "#000", overflow: "hidden",
      fontFamily: "'JetBrains Mono', monospace",
    }}>

      {/* Black hole */}
      <div style={{ position: "absolute", inset: 0, zIndex: 0 }}>
        <Canvas camera={{ position: CAM_POS, fov: 42 }}>
          <CameraSetup />
          <color attach="background" args={["#000000"]} />
          <ambientLight intensity={0.1} />
          <Suspense fallback={null}>
            <Blackhole mass={MASS} spin={SPIN} />
          </Suspense>
          <OrbitControls
            ref={orbitRef}
            enabled={screen === "appreciate"}
            enablePan={false} enableDamping dampingFactor={0.05}
            minDistance={6} maxDistance={90}
          />
          <EffectComposer>
            <Bloom intensity={1.15} luminanceThreshold={0.22} luminanceSmoothing={0.82} blendFunction={BlendFunction.SCREEN} />
            <Vignette eskil={false} offset={0.1} darkness={0.92} />
          </EffectComposer>
        </Canvas>
      </div>

      {/* PASSWORD */}
      {screen === "password" && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 20,
          display: "flex", alignItems: "center", justifyContent: "center",
          animation: "fadeIn 0.8s ease forwards",
        }}>
          <form onSubmit={handlePasswordSubmit} style={{ width: "100%", maxWidth: "320px", padding: "0 2rem" }}>
            <div style={{ animation: pwShake ? "shake 0.4s ease" : "none" }}>
              <input
                ref={pwRef} type="password" value={pwInput}
                onChange={e => { setPwInput(e.target.value); setPwError(false); }}
                placeholder="..." autoComplete="off"
                style={{
                  width: "100%", background: "rgba(255,255,255,0.04)",
                  border: `1px solid ${pwError ? "rgba(255,80,80,0.5)" : "rgba(255,255,255,0.12)"}`,
                  borderRadius: "10px", color: "rgba(255,255,255,0.85)",
                  fontFamily: "'JetBrains Mono', monospace", fontSize: "13px",
                  padding: "14px 18px", outline: "none", boxSizing: "border-box",
                  letterSpacing: "0.08em", caretColor: "rgba(255,255,255,0.6)",
                  textAlign: "center", transition: "border-color 0.25s ease",
                }}
              />
              {pwError && (
                <p style={{
                  marginTop: "10px", color: "rgba(255,80,80,0.6)",
                  fontSize: "10px", letterSpacing: "0.2em",
                  textAlign: "center", textTransform: "uppercase",
                }}>
                  acesso negado
                </p>
              )}
            </div>
          </form>
        </div>
      )}

      {/* APPRECIATE */}
      {screen === "appreciate" && (
        <button onClick={handleReturn} style={{
          position: "absolute", top: "1.5rem", left: "50%",
          transform: "translateX(-50%)", zIndex: 10,
          background: "transparent", border: "none",
          color: "rgba(255,255,255,0.2)", fontFamily: "'JetBrains Mono', monospace",
          fontSize: "10px", letterSpacing: "0.22em", padding: "6px 12px",
          cursor: "pointer", transition: "color 0.3s ease", textTransform: "uppercase",
        }}
          onMouseEnter={e => e.currentTarget.style.color = "rgba(255,255,255,0.5)"}
          onMouseLeave={e => e.currentTarget.style.color = "rgba(255,255,255,0.2)"}
        >
          voltar
        </button>
      )}

      {/* CHAT */}
      {screen === "chat" && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 10,
          display: "flex", flexDirection: "column",
          opacity: fadeChat ? 1 : 0, transition: "opacity 0.6s ease",
          pointerEvents: fadeChat ? "auto" : "none",
        }}>

          {/* Top */}
          <div style={{ display: "flex", justifyContent: "center", padding: "1.4rem 2rem 0", flexShrink: 0 }}>
            <button onClick={handleApreciar} style={{
              background: "transparent", border: "none",
              color: "rgba(255,255,255,0.22)", fontFamily: "'JetBrains Mono', monospace",
              fontSize: "10px", letterSpacing: "0.22em", cursor: "pointer",
              padding: "6px 12px", transition: "color 0.3s ease", textTransform: "uppercase",
            }}
              onMouseEnter={e => e.currentTarget.style.color = "rgba(255,255,255,0.55)"}
              onMouseLeave={e => e.currentTarget.style.color = "rgba(255,255,255,0.22)"}
            >
              apreciar
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} style={{
            flex: 1, overflowY: "auto", padding: "1.5rem 0",
            display: "flex", flexDirection: "column",
            justifyContent: messages.length === 0 ? "center" : "flex-start",
            scrollbarWidth: "none",
          }}>
            {messages.length === 0 && (
              <p style={{
                textAlign: "center", color: "rgba(255,255,255,0.11)",
                fontSize: "11px", letterSpacing: "0.2em", textTransform: "uppercase",
              }}>
                agente pronto
              </p>
            )}
            <div style={{ maxWidth: "680px", width: "100%", margin: "0 auto", padding: "0 1.5rem" }}>
              {messages.map((msg, i) => (
                <ChatMessage key={i} role={msg.role} parts={msg.parts} dispatched={dispatchedIds.has(msg.id)} />
              ))}
              {loading && (
                <div style={{ marginBottom: "18px", animation: "fadeUp 0.3s ease forwards" }}>
                  <span style={{ color: "rgba(255,255,255,0.22)", letterSpacing: "0.3em", fontSize: "13px" }}>
                    . . .
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Input */}
          <div style={{ padding: "0 1.5rem 1.8rem", flexShrink: 0 }}>
            <div style={{ maxWidth: "680px", width: "100%", margin: "0 auto", position: "relative" }}>
              <textarea
                ref={inputRef} rows={1} value={input}
                onChange={e => {
                  setInput(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = Math.min(e.target.scrollHeight, 140) + "px";
                }}
                onKeyDown={handleKeyDown}
                placeholder="peca uma tarefa..."
                style={{
                  width: "100%", background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.1)", borderRadius: "10px",
                  color: "rgba(255,255,255,0.85)", fontFamily: "'JetBrains Mono', monospace",
                  fontSize: "13px", padding: "13px 48px 13px 16px",
                  outline: "none", resize: "none", lineHeight: "1.6",
                  overflow: "hidden", boxSizing: "border-box",
                  letterSpacing: "0.02em", caretColor: "rgba(255,255,255,0.6)",
                  transition: "border-color 0.25s ease, background 0.25s ease",
                }}
                onFocus={e => {
                  e.target.style.borderColor = "rgba(255,255,255,0.22)";
                  e.target.style.background = "rgba(255,255,255,0.055)";
                }}
                onBlur={e => {
                  e.target.style.borderColor = "rgba(255,255,255,0.1)";
                  e.target.style.background = "rgba(255,255,255,0.04)";
                }}
              />
              <button onClick={handleSubmit} disabled={!inputActive} style={{
                position: "absolute", right: "10px", bottom: "10px",
                width: "28px", height: "28px", border: "none",
                background: inputActive ? "rgba(255,255,255,0.12)" : "transparent",
                borderRadius: "6px", cursor: inputActive ? "pointer" : "default",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "background 0.2s ease",
              }}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M7 12V2M2 7l5-5 5 5"
                    stroke={inputActive ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.18)"}
                    strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::placeholder { color: rgba(255,255,255,0.18); }
        div::-webkit-scrollbar { display: none; }
        @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
        @keyframes fadeUp {
          from { opacity:0; transform:translateY(6px); }
          to   { opacity:1; transform:translateY(0); }
        }
        @keyframes shake {
          0%,100% { transform:translateX(0); }
          20%     { transform:translateX(-8px); }
          40%     { transform:translateX(8px); }
          60%     { transform:translateX(-5px); }
          80%     { transform:translateX(5px); }
        }
      `}</style>
    </div>
  );
}
