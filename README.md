# API Capital · Fundos Indicados

App para consultores acompanharem os fundos indicados pela API Capital Investimentos, substituindo o uso indevido de uma carteira do Mais Retorno (ver especificação, seção 1).

**Status:** frontend PWA completo + backend real (funções da Vercel + Postgres) com integração CVM (fundos/FIDCs), Banco Central (CDI) e B3 via Yahoo Finance (ETFs) — cota atualiza sozinha todo dia útil e a busca por CNPJ no "Adicionar fundo" já puxa dado real da CVM. OAuth de verdade pros administradores ainda não existe — ver "O que falta" abaixo.

## Identidade visual

O app consome o design system oficial da API Capital diretamente da folha publicada em
`https://lebeninca.github.io/api-capital-design-system/tokens/api-capital.css` (ver `<link>` em
`index.html`, antes de `src/styles.css`). Cor, tipografia, canto e espaço em `src/styles.css`
usam sempre as variáveis `var(--api-*)` dessa folha, nunca um valor escrito à mão. Logo e ícones
vêm de `design.apicapital.com.br/assets/`. Antes desse adendo, o app usava uma paleta estimada
manualmente (azul `#002B56` e Fraunces/IBM Plex Sans) — isso foi substituído por completo.

Ao mexer no visual, siga o catálogo de vetos (`ANTI_SLOP_VISUAL.md` da skill "api-capital"): sem
sombra, sem gradiente em elemento de interface, canto sempre 15px (ou 10px em botão de
utilidade), sem emoji (usar Lucide), sem travessão no texto da peça.

## Por que o frontend não é um projeto React/Vite

A especificação sugere React (seção 9), mas o frontend foi escrito em **JavaScript puro com módulos ES nativos do navegador — sem build step**, decisão tomada quando esta máquina ainda não tinha Node.js instalado. Isso também tem uma vantagem real para um app interno de 10–50 usuários: hospedar e atualizar é só servir arquivos estáticos, sem pipeline de build no cliente. O backend (pasta `api/`), esse sim, já usa Node de verdade — ver abaixo.

## Arquitetura

```
index.html, manifest.webmanifest, service-worker.js    frontend estático (PWA)
src/                                                    frontend: components, state, lib (ver comentários no código)
api/                                                    backend: funções serverless da Vercel (Node)
  _lib/
    db.js                  conexão com o Postgres (Neon, via DATABASE_URL)
    auth.js                confere e-mail de admin contra ADMIN_EMAILS (variável de ambiente)
    cvm.js                 busca cota e cadastro de fundos/FIDCs na CVM (sem CORS, só roda no servidor)
    mercado.js              CDI (Banco Central) e cotação de ETF (Yahoo Finance)
  fundos.js                 GET (lista) / POST (admin: adicionar fundo)
  fundos/[id].js             GET (histórico de preços) / PATCH (admin: editar) / DELETE (admin: remover)
  cvm-lookup.js              GET — busca por CNPJ pro modal "Adicionar fundo"
  cron/atualizar-precos.js   rotina diária (ver vercel.json), protegida por CRON_SECRET
  init-schema.js             cria as tabelas no Postgres (uso único, protegida por admin)
  migrar-seed.js             carrega os 84 ativos de src/data/seed.json pro banco (uso único, protegida por admin)
vercel.json                 horário do cron + timeout maior pras funções que baixam arquivo grande da CVM
```

## Configuração (variáveis de ambiente na Vercel)

Em **Settings → Environment Variables** no projeto na Vercel:

| Variável | Pra que serve | Como veio |
|---|---|---|
| `DATABASE_URL` e as demais `POSTGRES_*`/`PG*` | Conexão com o banco | Automático, criadas quando você conectou o Postgres (Neon) em Storage |
| `ADMIN_EMAILS` | Allowlist real (no servidor) dos e-mails que podem adicionar/editar/remover fundo | Você precisa criar: lista de e-mails separados por vírgula, ex: `fulano@apicapital.com.br,ciclana@apicapital.com.br` |
| `CRON_SECRET` | Só a Vercel consegue chamar a rotina diária de atualização de preço | Você precisa criar: qualquer string aleatória longa |

Depois de criar `ADMIN_EMAILS` e `CRON_SECRET`, é preciso um novo deploy pra elas valerem (qualquer novo `git push` já resolve).

## Configuração inicial do banco (rodar uma vez só)

Depois do primeiro deploy com `DATABASE_URL` e `ADMIN_EMAILS` configurados, chame estas duas rotas uma vez (por exemplo, com `curl` ou Postman, ou peça pro Claude Code chamar), com o header `x-admin-email` de um e-mail que esteja em `ADMIN_EMAILS`:

```bash
curl -X POST https://apifundos-1tr8.vercel.app/api/init-schema -H "x-admin-email: seu-email@apicapital.com.br"
curl -X POST https://apifundos-1tr8.vercel.app/api/migrar-seed -H "x-admin-email: seu-email@apicapital.com.br"
```

A primeira cria as tabelas; a segunda carrega os 84 ativos de `src/data/seed.json`. As duas são seguras de rodar mais de uma vez (não duplicam nem apagam dado já existente).

## Como rodar o frontend localmente

Um Service Worker exige HTTP(S) — abrir `index.html` direto (`file://`) não funciona. Sirva a pasta com qualquer servidor estático, por exemplo:

```bash
python -m http.server 5500
```

Isso serve os arquivos estáticos, mas as chamadas para `/api/...` vão falhar (não tem backend rodando nesse servidor simples). Pra testar com o backend local de verdade, use `vercel dev` (precisa `vercel login` e `vercel link` uma vez) — ele roda as funções da pasta `api/` e injeta as variáveis de ambiente da Vercel automaticamente.

## Autenticação de administradores

A especificação (seção 3) pede login restrito por e-mail (ex: Google OAuth com allowlist de 2 e-mails), e explicitamente rejeita senha fixa no código. OAuth de verdade ainda não existe — o que há hoje são **duas conferências por e-mail**:

1. No navegador (`public/admin-emails.local.json`, opcional): dá feedback rápido antes de bater no servidor, mas sozinha não protege nada — qualquer pessoa pode digitar um e-mail da lista.
2. No servidor (`api/_lib/auth.js`, variável `ADMIN_EMAILS`): **essa é a que realmente protege** — toda rota que adiciona/edita/remove fundo confere o header `x-admin-email` contra essa lista antes de tocar no banco. Ainda não confirma *de verdade* quem está digitando o e-mail (não é OAuth), mas já impede que alguém sem o e-mail certo escreva no banco.

**Quando OAuth existir**, ele substitui as duas conferências por e-mail acima — é o próximo passo antes de considerar isso seguro para dados sensíveis de verdade.

## Persistência de dados

Os fundos agora vivem num banco Postgres compartilhado (Neon, conectado à Vercel) — toda edição feita por um administrador aparece pra todos os consultores, em qualquer dispositivo. `src/state/store.js` fala com a API (`api/fundos*`) em vez de `localStorage`.

### Editar dados de um fundo já cadastrado

No modo administrador, abra o fundo (clique na linha) e use o botão **"Editar dados do fundo"** no painel de detalhes. Dá pra corrigir nome, instituição, tipo, categoria, CNPJ/ticker, data de adição, preço de entrada e preço atual — inclusive desmarcar "pendente de correção" (isso já acontece sozinho ao digitar um preço de entrada). Preencher também "Valor investido" recalcula a quantidade de cotas (`valor / preço de entrada`, seção 4 da especificação); deixe em branco para manter a quantidade atual.

## Atualização automática de preço e busca por CNPJ

- **Rotina diária** (`api/cron/atualizar-precos.js`, agendada em `vercel.json` para dias úteis): para cada fundo com `cnpjOuTicker` preenchido, busca a cota mais recente (CVM para Fundo/FIDC, Yahoo Finance para ETF), atualiza `precoAtual`/`patrimonio` e grava um ponto novo em `historico_precos`.
- **Busca por CNPJ** no modal "Adicionar fundo": chama `api/cvm-lookup.js`, que consulta o cadastro da CVM (registro atual por classe de cotas + cadastro legado, ver comentário no arquivo) e a cota na data da compra. Só cobre Fundo/FIDC — ETF não tem CNPJ na CVM, usa ticker (seção 6 da especificação).
- Fundos **sem `cnpjOuTicker`** não são cobertos por nenhuma das duas — preencha esse campo em "Editar dados do fundo" pra passar a cobrir.

## Gráfico de evolução (dado real, com backfill retroativo)

O painel de detalhes de cada fundo mostra um gráfico de evolução (fundo vs. benchmark da categoria) e uma tabela de rentabilidade por período. Desde que o fundo tenha `cnpjOuTicker` e `dataAdicao` preenchidos, esses dois usam **dado real**: a CVM mantém o histórico diário de cotas desde o início do fundo, então não é preciso esperar a rotina diária acumular semanas de dados a partir de hoje — dá pra reconstruir o histórico retroativamente até a data em que o fundo foi comprado.

- `POST /api/backfill-historico.js` (admin, `maxDuration: 300`) varre todos os fundos com `cnpjOuTicker` + `dataAdicao`, calcula os meses de Informe Diário da CVM necessários **desde a data real de compra até hoje** (sem truncar — só um teto de segurança de 10 anos pra não sair baixando décadas de arquivo por erro de digitação), baixa cada mês **uma única vez** e distribui as cotas pra todos os fundos daquele mês, grava tudo em lote em `historico_precos`. Pra ETF usa o histórico do Yahoo Finance. Também grava o histórico do benchmark de cada categoria (CDI via Banco Central, Ibovespa/S&P 500 via Yahoo) em `benchmark_historico`. É idempotente (upsert por `fundo_id + data`) — pode rodar de novo quando mais fundos ganharem `cnpjOuTicker`/`dataAdicao`.
- **FIDCs não têm Informe Diário na CVM** — só um relatório mensal (`api/_lib/cvmFidc.js`), com atraso de publicação de vários meses. É usado como último recurso (busca por CNPJ, rotina diária e backfill do gráfico) sempre que o Informe Diário não acha nada; o painel de detalhes de um fundo FIDC mostra uma nota ao lado de "Preço atual" com a data exata da última cota mensal disponível, deixando claro que não é dado do dia.
- `GET /api/benchmark.js?nome=CDI|Ibovespa|S%26P%20500` expõe o histórico do benchmark (leitura pública, sem admin).
- `src/lib/periodos.js` calcula a rentabilidade por período (mês / YTD / 12 meses) a partir da série real — segue a mesma regra da especificação seção 8: se a janela pedida começa antes do primeiro ponto real disponível, a célula mostra "sem histórico suficiente" em vez de extrapolar. Também corta fundo e benchmark pro início em comum entre os dois antes de calcular qualquer coisa, pra evitar comparar contra um trecho em que só um dos dois tem dado real.
- `src/components/benchmarkChart.js` busca `historico_precos` (`store.buscarHistorico`) e o benchmark (`store.buscarBenchmark`) ao expandir um fundo; se houver pontos reais suficientes (5+) dos dois lados, renderiza gráfico e tabela reais. Caso contrário (fundo sem `cnpjOuTicker`/`dataAdicao`, ou ainda sem cobertura), cai de volta pro **exemplo ilustrativo** de `src/lib/illustrative.js`, com a mesma etiqueta "exemplo ilustrativo" de antes.
- A rotina diária (`api/cron/atualizar-precos.js`) continua rodando normalmente e apenas adiciona o ponto do dia em cima do que o backfill já gravou.

A busca no topo (`searchInput`) já compara por nome e por CNPJ (ignorando pontuação) — funciona pra qualquer fundo que já tenha `cnpjOuTicker` preenchido.

## O que falta (em ordem sugerida)

1. **OAuth real para administradores** (seção 3) — ver "Autenticação de administradores" acima.
2. Hoje `quantidadeCotas`/`patrimonio` de vários fundos ainda refletem valores antigos/estimados — completar com "Valor investido" em "Editar dados do fundo" conforme o valor real de cada aporte for confirmado.
3. Ampliar `ADMIN_EMAILS` conforme mais administradores forem definidos.
4. Confirmar com o BTG se existe convênio de API institucional (opcional — CVM + Banco Central + Yahoo Finance já cobrem o essencial).

## Dados iniciais e correção histórica

`src/data/seed.json` começou como cópia exata de `fundos-dados-iniciais.json` (84 ativos: 59 fundos, 16 ETFs, 9 FIDCs). Em seguida, usando uma planilha de datas reais de compra + CNPJs fornecida pelo time, `data_adicao` e `preco_entrada` de **75 fundos** foram corrigidos com a cota real da CVM (fundos/FIDCs) ou do Yahoo Finance (ETFs) na data da compra mais antiga registrada — reduzindo os pendentes de correção de 22 para **9**. Um desses 75 (`GOLD11`) era um caso do mesmo bug (aporte fixo de R$ 1.000) que não estava marcado como `pendente_correcao`, agora corrigido também.

**Limitação conhecida:** `quantidadeCotas` e `patrimonio` desses fundos continuam como estavam antes (a rentabilidade já reflete a correção, mas a quantidade de cotas e o patrimônio na posição não — falta o valor real investido em cada um, que não está em nenhuma fonte automática). Use "Editar dados do fundo" com o campo "Valor investido" para completar isso quando o valor de cada aporte for conhecido.

**Ainda pendentes de correção (9) ou sem `data_adicao` (13)** — motivos e o que falta, por categoria:

- **CNPJ não informado** (não dá pra buscar na CVM sem ele): Genoa Capital Radar FIF CIC Multimercado RL, Guepardo FIC FIA, Manager Absolute Hidra CDI FIF..., Oaktree Global Credit BRL FIC FIM, Subclasse Principal, Subclasse A, Classe Única do Solis Capital Antares Advisory FIC FIDC, Classe Única do Solis Capital Antares Light Master FIC FIDC.
- **CNPJ informado, mas o fundo não aparece no Informe Diário da CVM na data pedida** (provavelmente farejou a cota antes do fundo existir, ou o CNPJ está incorreto — precisa conferir): BTG Pactual Apolo FIF Cotas FIM, Leto Corporate FIC FIF RF CP LP RL, Polo Crédito Corporativo FIC FI RF LP, Classe Única do Valora Vanguard FIC Direitos Creditórios RL, Classe Única FIC do Solis Capital Antares Pioneiro FIC FIDC (as duas últimas são FIDCs — a CVM pode não publicar cota diária pra FIDC, ver seção 6).
- **Nome ambíguo na planilha de datas**: "BTG Pactual Crédito Corporativo I" e "...Corporativo Plus Incentivado..." truncam para o mesmo texto na planilha original, então nenhum dos dois foi corrigido — precisa saber qual data pertence a qual.
- **Data de compra anterior à listagem do ativo na bolsa** (inconsistência a confirmar): SPXR11 e QLBR11 — a data informada é anterior à primeira negociação do ETF encontrada no Yahoo Finance.
