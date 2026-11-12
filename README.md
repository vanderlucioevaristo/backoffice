# Backoffice

Sistema multi-empresa em **Astro + Cloudflare Workers + D1 (SQLite)**.

## Como funciona o isolamento entre empresas

Todas as tabelas possuem `empresa_id`. No login o usuário informa **empresa + usuário + senha**; a sessão grava `empresa_id` no servidor (tabela `sessoes`, token opaco em cookie `HttpOnly`). Toda consulta, inclusão, edição e exclusão filtra por `WHERE empresa_id = ?` — uma empresa nunca lê nem altera registros de outra.

## Rodar localmente

```bash
npm install
npm run db:migrate:local
npm run dev
```

Acesse `http://localhost:4321/cadastro-empresa` para criar a primeira empresa e o usuário administrador.

## Zerar / Recriar o banco de dados local

Se precisar apagar todos os dados locais e recriar as tabelas do zero:

```bash
rm -rf .wrangler/state/v3/d1 && npm run db:migrate:local
```

Se precisar apenas aplicar novas migrações sem apagar os dados existentes:

```bash
npm run db:migrate:local
```

## Subir na Cloudflare com Git

1. Crie o banco D1 na Cloudflare:
   ```bash
   npx wrangler d1 create backoffice
   ```
2. Copie o `database_id` retornado para o `wrangler.jsonc`.
3. Aplique a migração no banco remoto:
   ```bash
   npm run db:migrate:remote
   ```
4. Suba o repositório para o GitHub/GitLab e conecte-o em **Cloudflare Dashboard → Workers & Pages → Create → Connect to Git** (ou publique direto com `npm run deploy`).
   - Build command: `npm run build`
   - Deploy command: `npx wrangler deploy`
5. (Opcional) Para fechar o auto-cadastro público de novas empresas em produção, defina a variável `ALLOW_SIGNUP=false` no Worker.


