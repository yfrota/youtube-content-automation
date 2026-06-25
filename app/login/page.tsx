"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { HaloLogo } from "@/components/logo";

// TODO(auth): conectar Supabase Auth
export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    router.push("/dashboard");
  }

  return (
    <div
      className="relative min-h-screen flex items-center justify-center overflow-hidden"
      style={{ backgroundColor: "#f8f5f0" }}
    >
      {/* Blob topo direito */}
      <div
        className="pointer-events-none absolute right-0 top-0 rounded-full"
        style={{
          width: 300,
          height: 300,
          background: "rgba(196,181,253,0.25)",
          filter: "blur(80px)",
          transform: "translate(30%, -30%)",
        }}
      />
      {/* Blob baixo esquerdo */}
      <div
        className="pointer-events-none absolute bottom-0 left-0 rounded-full"
        style={{
          width: 200,
          height: 200,
          background: "rgba(167,243,208,0.2)",
          filter: "blur(60px)",
          transform: "translate(-30%, 30%)",
        }}
      />

      {/* Marca d'água */}
      <div
        className="pointer-events-none fixed bottom-6 right-8 select-none text-right"
        style={{ color: "#9b8ea0", opacity: 0.2 }}
      >
        <p className="text-[10px] font-medium tracking-[0.3em]">HALO STUDIO</p>
        <p className="text-[8px] tracking-widest">content · everywhere</p>
      </div>

      {/* Card */}
      <div
        className="relative z-10 mx-4 w-full max-w-sm rounded-2xl px-8 py-10"
        style={{
          background: "rgba(255,255,255,0.85)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          border: "1px solid rgba(255,255,255,0.9)",
          boxShadow: "0 4px 24px rgba(0,0,0,0.06), 0 1px 4px rgba(0,0,0,0.04)",
        }}
      >
        {/* Logo + brand */}
        <div className="mb-6 flex flex-col items-center gap-2">
          <HaloLogo size={72} />
          <p
            className="text-sm font-medium tracking-[0.22em]"
            style={{ color: "#3d3540" }}
          >
            HALO STUDIO
          </p>
          <p className="text-[9px] tracking-wider" style={{ color: "#b0a0b5" }}>
            content · everywhere
          </p>
        </div>

        {/* Divisor */}
        <div className="mb-6 border-t border-gray-100" />

        {/* Cabeçalho */}
        <div className="mb-6 text-center">
          <h1 className="text-base font-medium text-gray-800">Bem-vindo de volta</h1>
          <p className="mt-1 text-xs text-gray-400">Entre para continuar produzindo</p>
        </div>

        {/* Formulário */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="email" className="text-xs font-medium text-gray-500">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@halostudio.co"
              className="h-10 rounded-lg border border-gray-200 bg-white/70 px-3 text-sm text-gray-800 placeholder-gray-300 outline-none transition focus:border-purple-300 focus:ring-2 focus:ring-purple-100"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="password" className="text-xs font-medium text-gray-500">
              Senha
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="h-10 rounded-lg border border-gray-200 bg-white/70 px-3 text-sm text-gray-800 placeholder-gray-300 outline-none transition focus:border-purple-300 focus:ring-2 focus:ring-purple-100"
            />
          </div>
          <button
            type="submit"
            className="mt-2 h-10 w-full rounded-lg text-sm font-medium transition hover:opacity-90 active:scale-[0.98]"
            style={{
              background: "linear-gradient(135deg, #c4b5fd, #fbcfe8, #bbf7d0)",
              color: "#3d2060",
            }}
          >
            Entrar no Halo Studio
          </button>
        </form>

        {/* Rodapé */}
        <p
          className="mt-6 text-center text-xs"
          style={{ color: "#9b8ea0", opacity: 0.5 }}
        >
          Acesso exclusivo · Plataforma segura
        </p>
      </div>
    </div>
  );
}
