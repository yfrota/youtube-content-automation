# RLS Policies — estado atual e plano para Fase A (auth)

## 1. Estado atual

RLS está habilitado em todas as 6 tabelas (`clients`, `projects`, `scripts`, `seo`, `thumbnails`, `approval_events`) desde `0001_initial_schema.sql`, sem nenhuma policy.

**Não existe "policy para `service_role`" a ser criada** — e isso não é uma lacuna, é como o Postgres/Supabase funciona por design:

- Todo projeto Supabase provisiona o role `service_role` com o atributo `BYPASSRLS`. Um role com `BYPASSRLS` **pula a avaliação de RLS inteiramente**, antes mesmo de chegar a verificar se existem policies. Não é "uma policy permissiva" — é a ausência total de checagem.
- Por isso, `lib/supabase/admin.ts` (que autentica com `SUPABASE_SERVICE_ROLE_KEY`) já lê/escreve normalmente nas 6 tabelas hoje, e as 3 rotas de API atuais (`/api/projects`, `/api/connectors/youtube/index`, `/api/agents/script-forge`) já funcionam sem nenhuma mudança necessária.
- Se quiser confirmar isso diretamente no seu projeto, rode no SQL Editor:
  ```sql
  select rolname, rolbypassrls from pg_roles where rolname = 'service_role';
  ```
  Deve retornar `rolbypassrls = t`.

**O lado `anon`/`authenticated` (chave pública, usada pelo browser) está hoje 100% bloqueado em todas as tabelas** — RLS habilitado + zero policies = deny-by-default para qualquer role que não seja `service_role`. Isso é seguro e intencional: nenhum Client Component do app fala com o Supabase diretamente ainda, então não há nada hoje que dependa de acesso via `anon`/`authenticated`.

**Resumo**: nada precisa ser aplicado agora. O banco já está seguro e o app já funciona.

## 2. O que precisará ser criado na Fase A (auth)

Modelo de acesso definido:
- **Admin (Kelly)**: acesso completo (select/insert/update/delete) a tudo dos `client_id` em que é membro admin.
- **Cliente (Soulshine)**: acesso somente-leitura a itens específicos enviados para aprovação, via link tokenizado — **não** é uma sessão de login Supabase Auth.

### 2.1 Pré-requisito de schema: `client_members`

Hoje não existe nenhuma tabela ligando `auth.users` a `clients`. Sem isso, não há como uma policy expressar "este usuário autenticado pertence a este `client_id`". `client_members` (desenhada na seção 3) é esse elo — vincula `user_id` (de `auth.users`) a `client_id`, com um `role`.

### 2.2 Policies de admin (uma vez que `client_members` existir)

Para cada tabela tenant-scoped, quatro policies (select/insert/update/delete) checando se `auth.uid()` é membro admin do `client_id` da linha, via uma função helper `is_client_admin(client_id)`:

| Tabela | select | insert | update | delete |
|---|---|---|---|---|
| `clients` | ✅ | — (criado só via service_role) | ✅ | — |
| `projects` | ✅ | ✅ | ✅ | ✅ |
| `scripts` | ✅ | ✅ | ✅ | ✅ |
| `seo` | ✅ | ✅ | ✅ | ✅ |
| `thumbnails` | ✅ | ✅ | ✅ | ✅ |
| `approval_events` | ✅ | ✅ | — | — |

`approval_events` não recebe policy de update/delete **de propósito**, nem para admins — é um log de auditoria append-only (já documentado no comentário da `0001`); permitir edição/exclusão quebraria essa garantia.

`client_members` em si também terá RLS habilitado, mas só com uma policy de `select` ("usuário vê suas próprias memberships") — inserir/editar/remover memberships fica restrito a `service_role` (gestão de quem tem acesso a qual cliente é uma operação interna, não algo que o próprio usuário deveria conseguir fazer de dentro do app).

### 2.3 Fluxo do Cliente (Soulshine) via link tokenizado — recomendação

**Recomendação: não criar nenhuma RLS policy para esse fluxo.** Mediar inteiramente no servidor:

1. O link de aprovação contém um token opaco (tabela `approval_links`, esboçada na seção 3).
2. Uma Route Handler (ex.: `app/api/approval-links/[token]/route.ts`, ainda não construída) recebe o token, valida (existe? não expirou?) usando `lib/supabase/admin.ts` (service-role, bypassa RLS), busca exatamente a linha de `scripts`/`seo`/`thumbnails` referenciada, e devolve só os campos necessários para a tela de aprovação.
3. O browser do cliente **nunca** fala com o Supabase usando a `anon key` nesse fluxo — toda a leitura passa pela rota.

Por quê não usar RLS direto com a `anon key` aqui: expressar "esta requisição anônima carrega um token válido para esta linha específica" dentro de uma policy exigiria custom claims via Auth Hooks ou variáveis de sessão por request (`set_config` por conexão) — mecanismos frágeis e mais complexos do que validar o token numa rota e usar o client admin, que é o padrão que o app já usa em todo o resto do código. Se no futuro o cliente passar a ter login real (Supabase Auth), aí sim caberia revisitar e dar a ele policies de `select` própria, no mesmo molde do admin.

## 3. SQL pronto para aplicar na Fase A (não aplicar agora)

Isto se tornará uma migration (ex.: `0003_auth_rls_policies.sql`) quando a Fase A (auth) for implementada. Não aplique antes disso — as policies abaixo dependem de `client_members` estar populada corretamente, e até lá `authenticated`/`anon` devem continuar sem acesso (estado atual da seção 1).

```sql
-- ============================================================================
-- client_members — liga auth.users a clients. Pré-requisito de todas as
-- policies abaixo: sem isso não há como expressar "este usuário pertence a
-- este client_id".
-- ============================================================================
create table client_members (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'admin' check (role in ('admin')),
  created_at timestamptz not null default now(),
  unique (client_id, user_id)
);

alter table client_members enable row level security;

create policy "users can view their own memberships"
  on client_members for select
  to authenticated
  using (user_id = auth.uid());

-- ============================================================================
-- is_client_admin — helper security definer: evita recursão contra a própria
-- RLS de client_members ao ser chamada de dentro de outras policies.
-- ============================================================================
create or replace function is_client_admin(target_client_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from client_members cm
    where cm.client_id = target_client_id
      and cm.user_id = auth.uid()
      and cm.role = 'admin'
  );
$$;

-- ============================================================================
-- clients
-- ============================================================================
create policy "admins can select their clients"
  on clients for select
  to authenticated
  using (is_client_admin(id));

create policy "admins can update their clients"
  on clients for update
  to authenticated
  using (is_client_admin(id))
  with check (is_client_admin(id));

-- ============================================================================
-- projects
-- ============================================================================
create policy "admins can select their projects"
  on projects for select to authenticated using (is_client_admin(client_id));
create policy "admins can insert their projects"
  on projects for insert to authenticated with check (is_client_admin(client_id));
create policy "admins can update their projects"
  on projects for update to authenticated using (is_client_admin(client_id)) with check (is_client_admin(client_id));
create policy "admins can delete their projects"
  on projects for delete to authenticated using (is_client_admin(client_id));

-- ============================================================================
-- scripts
-- ============================================================================
create policy "admins can select their scripts"
  on scripts for select to authenticated using (is_client_admin(client_id));
create policy "admins can insert their scripts"
  on scripts for insert to authenticated with check (is_client_admin(client_id));
create policy "admins can update their scripts"
  on scripts for update to authenticated using (is_client_admin(client_id)) with check (is_client_admin(client_id));
create policy "admins can delete their scripts"
  on scripts for delete to authenticated using (is_client_admin(client_id));

-- ============================================================================
-- seo
-- ============================================================================
create policy "admins can select their seo"
  on seo for select to authenticated using (is_client_admin(client_id));
create policy "admins can insert their seo"
  on seo for insert to authenticated with check (is_client_admin(client_id));
create policy "admins can update their seo"
  on seo for update to authenticated using (is_client_admin(client_id)) with check (is_client_admin(client_id));
create policy "admins can delete their seo"
  on seo for delete to authenticated using (is_client_admin(client_id));

-- ============================================================================
-- thumbnails
-- ============================================================================
create policy "admins can select their thumbnails"
  on thumbnails for select to authenticated using (is_client_admin(client_id));
create policy "admins can insert their thumbnails"
  on thumbnails for insert to authenticated with check (is_client_admin(client_id));
create policy "admins can update their thumbnails"
  on thumbnails for update to authenticated using (is_client_admin(client_id)) with check (is_client_admin(client_id));
create policy "admins can delete their thumbnails"
  on thumbnails for delete to authenticated using (is_client_admin(client_id));

-- ============================================================================
-- approval_events — append-only: select + insert apenas, mesmo para admins.
-- Nenhuma policy de update/delete é criada de propósito.
-- ============================================================================
create policy "admins can select their approval_events"
  on approval_events for select to authenticated using (is_client_admin(client_id));
create policy "admins can insert their approval_events"
  on approval_events for insert to authenticated with check (is_client_admin(client_id));

-- ============================================================================
-- approval_links — esboço para o fluxo de aprovação via link tokenizado do
-- Cliente (ver seção 2.3). Sem policies de anon/authenticated: o token é
-- validado server-side via lib/supabase/admin.ts, não via RLS.
-- ============================================================================
create table approval_links (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  entity_type approval_entity_type not null,
  entity_id uuid not null,
  token text not null unique,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

alter table approval_links enable row level security;
-- Nenhuma policy criada aqui de propósito — deny-by-default para
-- anon/authenticated; só service_role acessa (ver seção 2.3).
```
