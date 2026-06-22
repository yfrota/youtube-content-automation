# YouTube Content Automation Platform

Plataforma web multi-tenant para automatizar a produção de conteúdo no YouTube, com arquitetura preparada para expansão futura a outras plataformas (Instagram, Facebook, LinkedIn).

## Status

Projeto inicializado. Scaffolding base criado.

## Stack

- Next.js (App Router) + TypeScript
- Tailwind CSS
- Supabase (Postgres + pgvector)

## Estrutura

```
app/dashboard/      # Dashboard da plataforma
app/projects/       # Gestão de projetos de conteúdo
app/api/            # Rotas de API
components/         # Componentes de UI compartilhados
lib/agents/         # Agentes de IA (agnósticos de plataforma)
lib/connectors/     # Adaptadores por plataforma (YouTube, futuramente outras)
lib/rag/            # Pipeline de RAG (pgvector)
lib/supabase/       # Clientes e helpers do Supabase
supabase/migrations/ # Migrations do banco de dados
docs/               # Documentação do projeto
```

## Setup

```bash
cp .env.example .env.local
npm install
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000) no navegador.
