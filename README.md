# YouTube Content Automation Platform

> AI-powered platform that automates the full YouTube content production workflow — from raw transcript to published video — with human approval at every step.

## The problem

Managing YouTube content manually is time-consuming and error-prone. For a content manager handling weekly uploads, the workflow involves:

- Manually rewriting raw transcripts into YouTube-friendly scripts
- Researching SEO keywords and writing optimized titles and descriptions
- Creating thumbnail copy and coordinating image production
- Tracking which existing videos to cross-reference
- Manually editing out podcast-specific intros and outros before publishing

Each video takes several hours of repetitive work with no systematic memory of past content.

## The solution

A multi-module web platform where AI agents handle each production stage, and humans only make decisions — not repetitive work.

**Modules:**
- **Script Forge** — transforms raw transcripts into YouTube-optimized scripts with hook structure and chapter markers
- **SEO Engine** — generates title options, descriptions, and keywords ranked by estimated CTR
- **RAG Catalog** — indexes all existing channel videos and suggests cross-references automatically in new scripts
- **Thumbnail Studio** — generates copy options and image compositions using pre-approved brand assets
- **Post-Production Assistant** — identifies exact timestamps for intro/outro removal and referral link insertion
- **Publish Checklist** — validates all elements are complete before allowing publication

## Architecture
Raw Transcript (input)
↓
Script Forge Agent
(+ RAG: existing video catalog)
↓
SEO Engine Agent
(+ vidIQ MCP: real channel data)
↓
Thumbnail Studio
(copy → approval → image)
↓
Post-Production Assistant
↓
Publish Checklist → YouTube Studio
Approval flow: `DRAFT → KELLY_REVIEW → CLIENT_REVIEW → APPROVED → PUBLISHED`

## Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js (App Router) |
| Database | Supabase (Postgres + pgvector) |
| Auth | Supabase Auth |
| Vector search (RAG) | pgvector |
| LLM providers | Claude API / Gemini / GPT-4o (selectable per module) |
| YouTube integration | YouTube Data API v3 |
| vidIQ integration | vidIQ MCP server |
| Deploy | Vercel |

## Multi-provider selector

Each module allows selecting the LLM provider independently. This enables side-by-side comparison of outputs and gradual A/B testing to identify which model performs best per task.

## Multi-tenant architecture

Built from day one to support multiple clients and channels. Schema separates clients, projects, and approval flows — enabling future expansion to other content managers and platforms (Instagram, LinkedIn, Facebook).

## Project status

| Module | Status |
|---|---|
| Project schema (multi-tenant) | 🔲 Planned |
| Auth (2-level: admin + client approver) | 🔲 Planned |
| Approval state machine | 🔲 Planned |
| Base dashboard UI | 🔲 Planned |
| Script Forge Agent | 🔲 Planned |
| SEO Engine Agent | 🔲 Planned |
| RAG — video catalog indexing | 🔲 Planned |
| RAG — cross-reference injection | 🔲 Planned |
| Multi-provider selector | 🔲 Planned |
| vidIQ MCP integration | 🔲 Planned |
| Thumbnail Copywriter Agent | 🔲 Planned |
| Thumbnail image composition (v1) | 🔲 Planned |
| Post-Production Assistant | 🔲 Planned |
| Publish Checklist | 🔲 Planned |

## Local setup

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/youtube-content-automation.git
cd youtube-content-automation

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env.local
# Fill in your keys (see Environment Variables section below)

# Run development server
npm run dev
```

## Environment variables

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# YouTube Data API
YOUTUBE_API_KEY=
YOUTUBE_OAUTH_CLIENT_ID=
YOUTUBE_OAUTH_CLIENT_SECRET=

# LLM Providers
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
GEMINI_API_KEY=

# vidIQ MCP (if available)
VIDIQ_MCP_URL=
```

## Folder structure
youtube-content-automation/
├── app/                    # Next.js App Router pages
│   ├── dashboard/          # Main dashboard
│   ├── projects/           # Project management
│   └── api/                # API routes
├── components/             # React components
├── lib/
│   ├── agents/             # AI agent definitions (one per module)
│   ├── connectors/         # Platform connectors (YouTube, Meta, etc.)
│   ├── rag/                # RAG indexing and retrieval
│   └── supabase/           # Database client and queries
├── supabase/
│   └── migrations/         # Database schema migrations
└── docs/                   # Additional documentation

## Related projects

- [Meeting Intelligence](https://github.com/YOUR_USERNAME/meeting-intelligence) — Electron desktop app for real-time meeting transcription and AI analysis using local Whisper + OpenRouter

---

*Built as part of a boutique AI automation consultancy — demonstrating end-to-end applied AI on real client workflows.*
