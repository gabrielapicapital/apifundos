# API Capital · Fundos Indicados

App para consultores acompanharem os fundos indicados pela API Capital Investimentos, substituindo o uso indevido de uma carteira do Mais Retorno (ver especificação, seção 1).

**Status:** primeira fase — frontend PWA completo, com os dados reais dos 84 ativos, replicando o protótipo validado. Backend, integração CVM/B3 e autenticação real (OAuth) ainda não existem — ver "O que falta" abaixo.

## Por que não é um projeto React/Vite

A especificação sugere React (seção 9), mas esta máquina não tem Node.js/npm instalado, então o app foi escrito em **JavaScript puro com módulos ES nativos do navegador — sem build step**. Isso também tem uma vantagem real para um app interno de 10–50 usuários: hospedar e atualizar é só servir arquivos estáticos, sem pipeline de build. Se depois quiserem migrar para React (por exemplo, para reaproveitar mais lógica ao construir o backend em conjunto), a estrutura em `src/` já separa dados, estado e componentes o suficiente para isso ser uma reescrita incremental, não um recomeço.

## Como rodar localmente

Um Service Worker exige HTTP(S) — abrir `index.html` direto (`file://`) não funciona. Sirva a pasta com qualquer servidor estático, por exemplo (Python já está instalado nesta máquina):

```bash
python -m http.server 5500
```

Depois abra `http://localhost:5500` no navegador.

## Estrutura

```
index.html              marcação principal (mesma UX do protótipo)
manifest.webmanifest     manifest do PWA
service-worker.js        cache network-first + auto-update
src/
  config.js               flags e listas de configuração (não tem segredos)
  main.js                 bootstrap + registro do service worker
  app.js                  liga estado <-> componentes
  styles.css              visual idêntico ao protótipo (paleta e tipografia da API Capital)
  data/
    seed.json               os 84 ativos indicados (carga inicial)
    normalize.js            mapeia o seed pro formato interno + cálculo de rentabilidade
  state/store.js           estado do app + persistência local (ver "O que falta")
  lib/                     formatação e cálculos (resumo, comparador)
  components/               um módulo por parte da tela (tabs, tabela, modais — adicionar/editar fundo, admin...)
public/
  icons/                    ícones do PWA (gerados a partir da logo fornecida)
  logo-source.jpg           logo original, para regenerar ícones se precisar
```

## Autenticação de administradores

A especificação (seção 3) pede login restrito por e-mail (ex: Google OAuth com allowlist de 2 e-mails), e explicitamente rejeita senha fixa no código. Implementar OAuth de verdade exige um backend para validar o token do provedor — que ainda não existe nesta fase.

Como estado intermediário, o botão "Administrar" pede um e-mail e confere contra uma allowlist **no navegador**. Deixe claro para o time: **isso não é autenticação real** — qualquer pessoa pode digitar um e-mail da lista, já que não há verificação de identidade nenhuma por trás. É só a UI do fluxo pronta para o dia em que o backend existir.

Para configurar os e-mails sem editar `config.js`:

```bash
cp public/admin-emails.local.json.example public/admin-emails.local.json
```

e edite o arquivo com os e-mails reais. **Esse arquivo precisa estar commitado no git** — como o app não tem backend nem build step, não existe outro jeito de essa lista chegar até a versão publicada (Vercel/Netlify/etc.); não é um segredo real (é só uma lista de e-mails, e a "autenticação" já é reconhecidamente frágil, ver acima), então commitar é aceitável nesta fase.

**Quando o backend existir**, trocar esse gate por OAuth de verdade (Google, allowlist de e-mail no servidor) é o próximo passo antes de qualquer uso em produção com dados sensíveis.

## Persistência de dados (importante)

Sem backend, adicionar/remover/editar fundos e editar diagnósticos salva **apenas no `localStorage` do navegador de quem fez a ação** — não sincroniza entre consultores nem entre dispositivos. Isso é aceitável para validar a interface, mas não serve como fonte de verdade compartilhada.

### Editar dados de um fundo já cadastrado

No modo administrador, abra o fundo (clique na linha) e use o botão **"Editar dados do fundo"** no painel de detalhes. Dá pra corrigir nome, instituição, tipo, categoria, CNPJ/ticker, data de adição, preço de entrada e preço atual — inclusive desmarcar "pendente de correção" quando a cota real for conhecida. Preencher também "Valor investido" recalcula a quantidade de cotas (`valor / preço de entrada`, seção 4 da especificação); deixe em branco para manter a quantidade atual. É assim que um administrador corrige manualmente um dos 22 fundos pendentes hoje, antes de a integração CVM automatizar isso (seção 7).

Quando o backend (API + Postgres, seção 9 da especificação) existir, trocar `src/state/store.js` (`persist()`/`hydrate()`) por chamadas HTTP é a única mudança necessária — os componentes já conversam só com as funções desse módulo, não direto com `localStorage`.

## O que falta (em ordem sugerida)

1. **Backend + banco de dados** (seção 9): API + Postgres com a tabela de fundos e a tabela de `historico_precos`. Sem isso, os dados não são compartilhados entre consultores.
2. **OAuth real para administradores** (seção 3), rodando no backend.
3. **Integração CVM contínua** — Informe Diário + Cadastro de Fundos (seção 6), usada para autocompletar dados ao buscar por CNPJ no modal "Adicionar fundo" (hoje é um placeholder que avisa que a integração automática não está conectada) e para manter `precoAtual`/`historicoPrecos` atualizados diariamente.
4. **Cotação de ETFs**: a especificação previa **brapi.dev**, mas o provedor passou a exigir uma chave de API (não é mais gratuito sem cadastro). A correção histórica abaixo usou o Yahoo Finance (mesmos dados de mercado da B3) como alternativa pontual — falta decidir a fonte definitiva para o job diário (brapi.dev com chave, Yahoo Finance, ou outro provedor B3) e implementá-la.
5. **Job agendado** que atualiza `precoAtual` diariamente e grava pontos em `historicoPrecos` (seção 8) — só depois de alguns meses de histórico real dá pra mostrar gráfico de evolução, volatilidade, Sharpe etc. O app já está pronto para receber esse campo (`historicoPrecos` já existe no formato de dado).
6. **Hospedagem**: ainda não escolhida (Render, Railway ou Vercel são as opções levantadas na especificação, seção 10). Como o app não depende de build step, qualquer hospedagem de arquivo estático com HTTPS funciona (o Service Worker exige HTTPS ou localhost).
7. Confirmar com o BTG se existe convênio de API institucional (opcional).

## Dados iniciais e correção histórica

`src/data/seed.json` começou como cópia exata de `fundos-dados-iniciais.json` (84 ativos: 59 fundos, 16 ETFs, 9 FIDCs). Em seguida, usando uma planilha de datas reais de compra + CNPJs fornecida pelo time, `data_adicao` e `preco_entrada` de **75 fundos** foram corrigidos com a cota real da CVM (fundos/FIDCs) ou do Yahoo Finance (ETFs) na data da compra mais antiga registrada — reduzindo os pendentes de correção de 22 para **9**. Um desses 75 (`GOLD11`) era um caso do mesmo bug (aporte fixo de R$ 1.000) que não estava marcado como `pendente_correcao`, agora corrigido também.

**Limitação conhecida:** `quantidadeCotas` e `patrimonio` desses fundos continuam como estavam antes (a rentabilidade já reflete a correção, mas a quantidade de cotas e o patrimônio na posição não — falta o valor real investido em cada um, que não está em nenhuma fonte automática). Use "Editar dados do fundo" com o campo "Valor investido" para completar isso quando o valor de cada aporte for conhecido.

**Ainda pendentes de correção (9) ou sem `data_adicao` (13)** — motivos e o que falta, por categoria:

- **CNPJ não informado** (não dá pra buscar na CVM sem ele): Genoa Capital Radar FIF CIC Multimercado RL, Guepardo FIC FIA, Manager Absolute Hidra CDI FIF..., Oaktree Global Credit BRL FIC FIM, Subclasse Principal, Subclasse A, Classe Única do Solis Capital Antares Advisory FIC FIDC, Classe Única do Solis Capital Antares Light Master FIC FIDC.
- **CNPJ informado, mas o fundo não aparece no Informe Diário da CVM na data pedida** (provavelmente farejou a cota antes do fundo existir, ou o CNPJ está incorreto — precisa conferir): BTG Pactual Apolo FIF Cotas FIM, Leto Corporate FIC FIF RF CP LP RL, Polo Crédito Corporativo FIC FI RF LP, Classe Única do Valora Vanguard FIC Direitos Creditórios RL, Classe Única FIC do Solis Capital Antares Pioneiro FIC FIDC (as duas últimas são FIDCs — a CVM pode não publicar cota diária pra FIDC, ver seção 6).
- **Nome ambíguo na planilha de datas**: "BTG Pactual Crédito Corporativo I" e "...Corporativo Plus Incentivado..." truncam para o mesmo texto na planilha original, então nenhum dos dois foi corrigido — precisa saber qual data pertence a qual.
- **Data de compra anterior à listagem do ativo na bolsa** (inconsistência a confirmar): SPXR11 e QLBR11 — a data informada é anterior à primeira negociação do ETF encontrada no Yahoo Finance.
