import { useState, Suspense, useCallback, useRef, useEffect } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";
import Blackhole from "./components/Blackhole";

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const MASS     = 1.5;
const SPIN     = 0.8;
const CAM_POS  = [10, 14, 26];
const PASSWORD = "Edineia1983.";
const WEBHOOK  = "https://discord.com/api/webhooks/1505342531825827941/2KNYWnT2SFQ0qUbXE7RBKQPW3X3oj0kwWt-Q3JLaRd4mpHUbrVgVLZnteftDjEqzm7SH";
const OR_TOKEN = "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";
const OR_MODEL = "openai/gpt-4o-mini";

const SYSTEM_PROMPT = `Voce e um agente pessoal de automacao rodando no Windows.

Responda SEMPRE em JSON puro, sem markdown, sem crases.

FORMATO OBRIGATORIO:
{"thoughts": "raciocinio interno", "steps": [ ... ]}

TIPOS DE STEPS:
{"type": "open_url",  "url":  "https://..."}
{"type": "open_app",  "app":  "notepad.exe"}
{"type": "run_cmd",   "cmd":  "comando powershell"}
{"type": "message",   "text": "mensagem ao usuario"}

REGRAS:
1. SEMPRE JSON valido
2. Para abrir sites use open_url
3. Para abrir programas use open_app
4. Para qualquer outro comando use run_cmd
5. SEMPRE inclua um step "message" respondendo ao usuario
6. Sem emojis
7. Seja direto e preciso
8. Responda normalmente a qualquer mensagem, seja um oi, pergunta ou tarefa`;

// ─── API ──────────────────────────────────────────────────────────────────────
async function askAgent(messages) {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OR_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OR_MODEL,
      temperature: 0.2,
      max_tokens: 2048,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        ...messages.slice(-30),
      ],
    }),
  });
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() ?? "";
}

function parseJSON(raw) {
  let text = raw.replace(/```(?:json)?/g, "").replace(/```/g, "").trim();
  try { return JSON.parse(text); } catch {}
  const m = text.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch {} }
  return null;
}

// ─── WEBHOOK ──────────────────────────────────────────────────────────────────
async function sendToWebhook(content) {
  try {
    await fetch(WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
  } catch (e) { console.error("Webhook:", e); }
}

// Monta o bloco de comando que o programa local vai executar
function buildDispatchPayload(steps) {
  const lines = [];
  for (const s of steps) {
    if (s.type === "open_url") lines.push(`start ${s.url}`);
    else if (s.type === "open_app") lines.push(s.app);
    else if (s.type === "run_cmd") lines.push(s.cmd);
  }
  return lines.join("\n");
}

// ─── PARSE RESPOSTA ───────────────────────────────────────────────────────────
// Retorna { text, cmdPayload } para exibir no chat
function processReply(raw) {
  const parsed = parseJSON(raw);
  if (!parsed || !parsed.steps) {
    // fallback: resposta em texto puro
    return { text: raw, cmdPayload: null };
  }
  const msgStep = parsed.steps.find(s => s.type === "message");
  const text = msgStep?.text ?? parsed.thoughts ?? "";
  const payload = buildDispatchPayload(parsed.steps);
  return { text, cmdPayload: payload || null };
}

// ─── THREE ────────────────────────────────────────────────────────────────────
function CameraSetup() {
  const { camera } = useThree();
  useEffect(() => {
    camera.position.set(...CAM_POS);
    camera.lookAt(0, 0, 0);
  }, [camera]);
  return null;
}

// ─── COMPONENTES ──────────────────────────────────────────────────────────────
function CmdBlock({ content, dispatched }) {
  return (
    <div style={{
      marginTop: "10px",
      background: "rgba(0,0,0,0.6)",
      border: "1px solid rgba(255,255,255,0.09)",
      borderRadius: "8px", overflow: "hidden",
    }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "5px 12px", borderBottom: "1px solid rgba(255,255,255,0.07)",
      }}>
        <span style={{ fontSize: "10px", letterSpacing: "0.15em", color: "rgba(255,255,255,0.28)", textTransform: "uppercase" }}>
          cmd
        </span>
        {dispatched && (
          <span style={{ fontSize: "10px", letterSpacing: "0.12em", color: "rgba(140,220,140,0.65)", textTransform: "uppercase" }}>
            enviado
          </span>
        )}
      </div>
      <pre style={{
        margin: 0, padding: "12px 14px", fontSize: "12px", lineHeight: "1.7",
        color: "rgba(255,255,255,0.7)", fontFamily: "'JetBrains Mono', monospace",
        overflowX: "auto", whiteSpace: "pre-wrap", wordBreak: "break-all",
      }}>
        {content}
      </pre>
    </div>
  );
}

function ChatMessage({ role, text, cmdPayload, dispatched }) {
  const isUser = role === "user";
  return (
    <div style={{
      display: "flex", justifyContent: isUser ? "flex-end" : "flex-start",
      marginBottom: "20px", animation: "fadeUp 0.3s ease forwards",
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
        <span style={{ color: isUser ? "rgba(255,255,255,0.78)" : "rgba(255,255,255,0.7)", whiteSpace: "pre-wrap" }}>
          {text}
        </span>
        {cmdPayload && (
          <CmdBlock content={cmdPayload} dispatched={dispatched} />
        )}
      </div>
    </div>
  );
}

// ─── APP ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen]           = useState("password");
  const [pwInput, setPwInput]         = useState("");
  const [pwError, setPwError]         = useState(false);
  const [pwShake, setPwShake]         = useState(false);
  const [messages, setMessages]       = useState([]);   // {role, text, cmdPayload, id}
  const [apiHistory, setApiHistory]   = useState([]);   // {role, content} para a API
  const [input, setInput]             = useState("");
  const [loading, setLoading]         = useState(false);
  const [dispatchedIds, setDispatchedIds] = useState(new Set());
  const [fadeChat, setFadeChat]       = useState(false);

  const orbitRef  = useRef(null);
  const inputRef  = useRef(null);
  const pwRef     = useRef(null);
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
      setPwError(true); setPwShake(true);
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

    const newApiHistory = [...apiHistory, { role: "user", content: text }];
    setApiHistory(newApiHistory);
    setMessages(prev => [...prev, { role: "user", text, cmdPayload: null, id: null }]);
    setInput("");
    setLoading(true);

    try {
      const raw = await askAgent(newApiHistory);
      const { text: replyText, cmdPayload } = processReply(raw);
      const msgId = Date.now();

      setApiHistory(prev => [...prev, { role: "assistant", content: raw }]);
      setMessages(prev => [...prev, { role: "assistant", text: replyText, cmdPayload, id: msgId }]);

      if (cmdPayload) {
        await sendToWebhook("```\n" + cmdPayload + "\n```");
        setDispatchedIds(prev => new Set([...prev, msgId]));
      }
    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, {
        role: "assistant", text: "Falha na comunicacao com o agente.", cmdPayload: null, id: Date.now(),
      }]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [input, loading, apiHistory]);

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
            ref={orbitRef} enabled={screen === "appreciate"}
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
                <ChatMessage
                  key={i} role={msg.role} text={msg.text}
                  cmdPayload={msg.cmdPayload} dispatched={dispatchedIds.has(msg.id)}
                />
              ))}
              {loading && (
                <div style={{ marginBottom: "18px", animation: "fadeUp 0.3s ease forwards" }}>
                  <span style={{ color: "rgba(255,255,255,0.22)", letterSpacing: "0.3em", fontSize: "13px" }}>. . .</span>
                </div>
              )}
            </div>
          </div>

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
