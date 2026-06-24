"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon } from "@/components/icons";
import { Breadcrumb } from "@/components/dashboard/Breadcrumb";
import { ClientCard } from "@/components/dashboard/ClientCard";
import { ClientGridSkeleton } from "@/components/dashboard/Skeleton";
import { EmptyState } from "@/components/dashboard/EmptyState";
import type { ClientWithProjectsCount } from "@/lib/dashboard/types";

export default function ClientsPage() {
  const router = useRouter();
  const [clients, setClients] = useState<ClientWithProjectsCount[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const res = await fetch("/api/clients", { signal: controller.signal });
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error ?? "Falha ao carregar clientes");
        setClients(body.clients);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Falha ao carregar clientes");
      }
    }

    load();
    return () => controller.abort();
  }, []);

  function handleCreate() {
    router.push("/clients/new");
  }

  const loading = clients === null && error === null;

  return (
    <div className="mx-auto max-w-5xl px-6 py-12 sm:px-8 sm:py-16">
      <Breadcrumb items={[{ label: "Início", href: "/" }, { label: "Clientes" }]} />

      <header className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-light tracking-tight text-foreground">Clientes</h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Gerencie os clientes e veja os projetos de cada um.
          </p>
        </div>

        <button
          type="button"
          onClick={handleCreate}
          className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-white transition-all duration-200 hover:bg-accent-hover"
        >
          <PlusIcon className="h-4 w-4" />
          Novo cliente
        </button>
      </header>

      <section className="mt-10">
        {loading ? (
          <ClientGridSkeleton />
        ) : error ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 px-8 py-20 text-center dark:border-gray-800">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Não foi possível carregar os clientes.
            </p>
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{error}</p>
          </div>
        ) : clients && clients.length > 0 ? (
          <div className="grid animate-fade-in grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {clients.map((client) => (
              <ClientCard key={client.id} client={client} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="Nenhum cliente ainda"
            message="Crie seu primeiro cliente para começar a organizar projetos por canal ou marca."
            onCreate={handleCreate}
            createLabel="Novo cliente"
          />
        )}
      </section>
    </div>
  );
}
