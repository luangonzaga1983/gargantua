import { useState, Suspense, useCallback, useRef, useEffect } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import {
  EffectComposer,
  Bloom,
  Vignette,
} from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";

import Blackhole from "./components/Blackhole";

const MASS = 1.5;
const SPIN = 0.8;

async function askClaude(messages) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system:
        "Você é uma inteligência artificial integrada a uma simulação de buraco negro chamada Gargantua. Responda de forma concisa, poética e inteligente. Máximo 3 parágrafos.",
      messages,
    }),
  });
  const data = await res.json();
  return data.content?.[0]?.text ?? "…";
}

export default function App() {
  const [showUI, setShowUI] = useState(true);
  const [input, setInput] = useState("");
  const [response, setResponse] = useState("");
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);
  const [fadeIn, setFadeIn] = useState(true);
  const orbitRef = useRef(null);
  const inputRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    if (showUI && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 400);
    }
  }, [showUI]);

  const handleApreciar = useCallback(() => {
    setFadeIn(false);
    setTimeout(() => {
      setShowUI(false);
      setResponse("");
      setInput("");
    }, 600);
  }, []);

  const handleReturn = useCallback(() => {
    setShowUI(true);
    setTimeout(() => setFadeIn(true), 10);
  }, []);

  const handleSubmit = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    const newHistory = [...history, { role: "user", content: text }];
    setHistory(newHistory);
    setInput("");
    setLoading(true);
    setResponse("");

    try {
      const answer = await askClaude(newHistory);
      setResponse(answer);
      setHistory([...newHistory, { role: "assistant", content: answer }]);
    } catch {
      setResponse("Falha na comunicação com a singularidade.");
    } finally {
      setLoading(false);
    }
  }, [input, loading, history]);

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  return (
    <div style={{ position: "relative", width: "100%", height: "100vh", background: "#000", overflow: "hidden", fontFamily: "'JetBrains Mono', monospace" }}>

      {/* Black hole canvas — always rendered */}
      <div style={{ position: "absolute", inset: 0, zIndex: 0 }}>
        <Canvas camera={{ position: [0, 5, 25], fov: 45 }}>
          <color attach="background" args={["#000000"]} />
          <ambientLight intensity={0.1} />
          <Suspense fallback={null}>
            <Blackhole mass={MASS} spin={SPIN} />
          </Suspense>
          <OrbitControls
            ref={orbitRef}
            enabled={!showUI}
            enablePan={false}
            enableDamping
            dampingFactor={0.05}
            minDistance={8}
            maxDistance={40}
          />
          <EffectComposer>
            <Bloom
              intensity={1.15}
              luminanceThreshold={0.22}
              luminanceSmoothing={0.82}
              blendFunction={BlendFunction.SCREEN}
            />
            <Vignette eskil={false} offset={0.1} darkness={0.9} />
          </EffectComposer>
        </Canvas>
      </div>

      {/* "Apreciar" button — shown when UI is hidden */}
      {!showUI && (
        <button
          onClick={handleReturn}
          style={{
            position: "absolute",
            bottom: "2rem",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 10,
            background: "transparent",
            border: "1px solid rgba(255,255,255,0.15)",
            color: "rgba(255,255,255,0.35)",
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: "11px",
            letterSpacing: "0.18em",
            padding: "8px 20px",
            cursor: "pointer",
            borderRadius: "4px",
            transition: "all 0.3s ease",
          }}
          onMouseEnter={e => {
            e.currentTarget.style.color = "rgba(255,255,255,0.7)";
            e.currentTarget.style.borderColor = "rgba(255,255,255,0.35)";
          }}
          onMouseLeave={e => {
            e.currentTarget.style.color = "rgba(255,255,255,0.35)";
            e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)";
          }}
        >
          VOLTAR
        </button>
      )}

      {/* AI overlay */}
      {showUI && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 10,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "2rem",
            opacity: fadeIn ? 1 : 0,
            transition: "opacity 0.6s ease",
            pointerEvents: fadeIn ? "auto" : "none",
          }}
        >
          {/* Response area */}
          {(response || loading) && (
            <div
              style={{
                maxWidth: "580px",
                width: "100%",
                marginBottom: "1.5rem",
                color: "rgba(255,255,255,0.75)",
                fontSize: "13px",
                lineHeight: "1.85",
                letterSpacing: "0.01em",
                textAlign: "left",
                padding: "0 2px",
                animation: "fadeUp 0.5s ease forwards",
              }}
            >
              {loading ? (
                <span style={{ color: "rgba(255,255,255,0.3)", letterSpacing: "0.3em" }}>
                  · · ·
                </span>
              ) : (
                response
              )}
            </div>
          )}

          {/* Input */}
          <div
            style={{
              maxWidth: "580px",
              width: "100%",
              position: "relative",
            }}
          >
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              onChange={e => {
                setInput(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
              }}
              onKeyDown={handleKeyDown}
              placeholder="…"
              style={{
                width: "100%",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: "10px",
                color: "rgba(255,255,255,0.85)",
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: "13px",
                padding: "14px 48px 14px 18px",
                outline: "none",
                resize: "none",
                lineHeight: "1.6",
                overflow: "hidden",
                boxSizing: "border-box",
                letterSpacing: "0.02em",
                caretColor: "rgba(255,255,255,0.6)",
                transition: "border-color 0.25s ease, background 0.25s ease",
              }}
              onFocus={e => {
                e.target.style.borderColor = "rgba(255,255,255,0.28)";
                e.target.style.background = "rgba(255,255,255,0.06)";
              }}
              onBlur={e => {
                e.target.style.borderColor = "rgba(255,255,255,0.12)";
                e.target.style.background = "rgba(255,255,255,0.04)";
              }}
            />

            {/* Send button */}
            <button
              onClick={handleSubmit}
              disabled={!input.trim() || loading}
              style={{
                position: "absolute",
                right: "10px",
                bottom: "10px",
                width: "28px",
                height: "28px",
                border: "none",
                background: input.trim() && !loading ? "rgba(255,255,255,0.15)" : "transparent",
                borderRadius: "6px",
                cursor: input.trim() && !loading ? "pointer" : "default",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "background 0.2s ease",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path
                  d="M7 12V2M2 7l5-5 5 5"
                  stroke={input.trim() && !loading ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.2)"}
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>

          {/* Apreciar button */}
          <button
            onClick={handleApreciar}
            style={{
              marginTop: "2rem",
              background: "transparent",
              border: "none",
              color: "rgba(255,255,255,0.22)",
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: "10px",
              letterSpacing: "0.22em",
              cursor: "pointer",
              padding: "6px 12px",
              transition: "color 0.3s ease",
              textTransform: "uppercase",
            }}
            onMouseEnter={e => e.currentTarget.style.color = "rgba(255,255,255,0.5)"}
            onMouseLeave={e => e.currentTarget.style.color = "rgba(255,255,255,0.22)"}
          >
            Apreciar
          </button>
        </div>
      )}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::placeholder { color: rgba(255,255,255,0.2); }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
