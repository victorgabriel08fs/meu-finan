# 02 · Frontend design — Meu Finan

> Especificação visual e de interação, **mobile-first**. Desenhado para 390 px de largura (iPhone 13–16 / Android médio) e validado em 360 px; escala para tablet e desktop na §4.5. Os mockups de referência estão no canvas de design publicado junto com estes documentos.

**Sumário**

1. [Direção visual: "Sereno"](#1-direção-visual-sereno)
2. [Princípios de experiência](#2-princípios-de-experiência)
3. [Design tokens](#3-design-tokens)
4. [Navegação e layout](#4-navegação-e-layout)
5. [Biblioteca de componentes](#5-biblioteca-de-componentes)
6. [Telas](#6-telas)
7. [Padrões de interação](#7-padrões-de-interação)
8. [Estados: carregando, vazio, erro, offline](#8-estados-carregando-vazio-erro-offline)
9. [Gráficos](#9-gráficos)
10. [Conteúdo: formatação e microcopy](#10-conteúdo-formatação-e-microcopy)
11. [Acessibilidade](#11-acessibilidade)
12. [PWA e particularidades do mobile web](#12-pwa-e-particularidades-do-mobile-web)
13. [Performance de front-end](#13-performance-de-front-end)
14. [Checklist de qualidade por tela](#14-checklist-de-qualidade-por-tela)

---

## 1. Direção visual: "Sereno"

**Calmo, claro, confiável.** Dinheiro já gera ansiedade suficiente; a interface não deve somar a isso.

| É | Não é |
|---|---|
| Superfícies neutras e frias, cards brancos sobre cinza muito claro (escuro: grafite profundo) | Gradientes, "glassmorphism" em tudo, fundos coloridos |
| **Um** acento: verde-esmeralda (ação, seleção, positivo) | Vermelho em toda despesa |
| Números grandes, firmes, com hierarquia (R$ e centavos menores) | Tabelas densas no celular |
| Muito respiro, cantos generosos (20 px nos cards) | Bordas pesadas e sombras escuras |
| Cor só quando significa algo (categoria, estado, série de gráfico) | Emojis como ícones, ilustrações infantis |
| Movimento curto e funcional | Animações decorativas longas |

Personalidade da escrita: direta, gentil, sem julgamento ("Você gastou R$ 320 a mais com Restaurantes do que costuma" — nunca "Você estourou!").

---

## 2. Princípios de experiência

| # | Princípio | Regra concreta |
|---|---|---|
| 1 | **Polegar primeiro** | Ações primárias no terço inferior (tab bar, botão "+", botões de sheet). No topo só voltar, título e ações secundárias. Criar/editar abre de baixo (sheet) |
| 2 | **Um número herói por tela** | Cada tela tem um valor principal em `display` (40 px). Todos os outros valores são menores (≤ 20 px) |
| 3 | **Cor tem significado** | Receita: verde com "+". Despesa: tinta neutra com "−". Transferência: azul com ícone de setas. Âmbar = atenção. Vermelho = erro ou orçamento estourado. Nunca cor sozinha — sempre com sinal, ícone ou texto |
| 4 | **Registrar em 5 segundos** | "+" sempre visível; teclado próprio já aberto; data = hoje; conta = última usada; categoria sugerida pela descrição; descrição opcional |
| 5 | **Revelação progressiva** | Mostrar o essencial; parcelar, repetir, tags e anexo ficam em "Mais opções". Relatórios começam no resumo e descem ao detalhe por toque |
| 6 | **Desfazer > confirmar** | Ações reversíveis executam na hora com toast "Desfazer" (5 s). Diálogo de confirmação só para o irreversível (apagar todos os dados, mesclar categorias) |
| 7 | **Discrição sob demanda** | Ícone de olho oculta todos os valores do app com um toque; preferência lembrada por aparelho |
| 8 | **Previsibilidade** | Mesmo gesto, mesmo resultado em todo lugar: criar/editar = sheet; detalhe = nova tela (ou sheet sobre lista); deslizar linha = ações; pressionar e segurar = seleção múltipla |

---

## 3. Design tokens

### 3.1 Cores semânticas

Todos os pares texto/fundo abaixo foram medidos (WCAG 2.x): texto ≥ 4,5:1, componentes de UI ≥ 3:1.

| Token | Claro | Escuro | Uso |
|---|---|---|---|
| `--bg` | `#F4F5F7` | `#0B0D10` | fundo das páginas |
| `--surface` | `#FFFFFF` | `#14171C` | cards, sheets, tab bar |
| `--surface-2` | `#EEF0F3` | `#1C2027` | chips, campos, trilho do segmented, teclas |
| `--surface-3` | `#E5E8EC` | `#252A32` | estado pressionado |
| `--switch-off` | `#7D8491` | `#6B7484` | trilha do interruptor desligado (3,8:1 / 3,8:1 sobre `--surface`; polegar 3,8:1 / 4,3:1 sobre a trilha) |
| `--border` | `#E3E6EA` | `#262B33` | divisórias hairline (1 px) |
| `--border-strong` | `#8A919E` | `#6B7484` | contorno de campos de formulário (3,2:1 / 3,8:1) |
| `--text` | `#0E1116` | `#F2F4F7` | texto principal e valores |
| `--text-2` | `#4A5260` | `#B4BCC8` | texto secundário (7,9:1 / 9,4:1) |
| `--text-3` | `#646B78` | `#8A93A1` | metadados, placeholders, eixos (≥ 4,7:1 em `--surface-2`) |
| `--primary` | `#0A7F58` | `#3DDC97` | ação primária, seleção, foco, links |
| `--on-primary` | `#FFFFFF` | `#04130C` | texto sobre `--primary` (5,0:1 / 10,8:1) |
| `--primary-soft` | `#E3F4EC` | `#1B3730` | fundo de chip selecionado, destaques |
| `--on-primary-soft` | `#075E41` | `#7FEBC0` | texto sobre `--primary-soft` (6,9:1 / 8,9:1) |
| `--income` | `#0A7F58` | `#3DDC97` | valor de receita |
| `--expense` | `= --text` | `= --text` | valor de despesa (neutro de propósito) |
| `--transfer` | `#1F5BB5` | `#9DC4FF` | transferências |
| `--transfer-soft` | `#E5EEFA` | `#222E40` | fundo de ícone de transferência |
| `--warning` | `#8A5100` | `#F5C66A` | texto de atenção |
| `--warning-soft` | `#FFF3DC` | `#383121` | fundo de aviso |
| `--warning-fill` | `#FAB219` | `#FAB219` | preenchimento de barra em atenção (sempre com ícone + rótulo) |
| `--danger` | `#B42318` | `#FF9A9A` | erro, estouro, ação destrutiva |
| `--danger-soft` | `#FCE9E9` | `#3A2429` | fundo de erro |
| `--danger-fill` | `#D03B3B` | `#D03B3B` | barra estourada (3,6:1 no escuro) |
| `--focus-ring` | `#0A7F58` | `#3DDC97` | anel de foco 2 px + 2 px de afastamento |
| `--scrim` | `rgb(14 17 22 / .45)` | `rgb(0 0 0 / .60)` | atrás de sheets e diálogos |
| `--thumb` | `= --surface` | `#323946` | polegar do segmented control: no escuro, mais claro que o trilho (`--surface-2`), para o item selecionado parecer elevado |
| `--switch-thumb` | `#FFFFFF` | `#F2F4F7` | polegar do switch, quase branco nos dois temas |
| `--chart-3-rest` | `#408D79` | `#187858` | coluna de receitas no mês não selecionado: mais fosca que `--chart-3`, mas ≥ 3:1 contra `--surface` (3,96:1 / 3,31:1) |
| `--chart-2-rest` | `#A86A56` | `#AA4924` | coluna de despesas no mês não selecionado (4,32:1 / 3,15:1) |
| `--autofill` | `--primary` 7% sobre `--surface` | `--primary` 9% sobre `--surface` | fundo de campo preenchido pelo navegador (no lugar do azul do Chrome) |

O app abre **escuro por padrão** (§3.11): os valores da coluna "Escuro" são os da primeira visita em qualquer aparelho.

### 3.2 Cores de categoria

Oito tons fixos (os mesmos matizes da paleta de gráficos, §3.3). Cada categoria guarda um token `cat-1…cat-8`; o ícone usa `fg` sobre `bg` com contraste ≥ 3,6:1.

| Token | Matiz | Claro `bg` | Claro `fg` | Escuro `bg` | Escuro `fg` |
|---|---|---|---|---|---|
| `cat-1` | azul | `#E1ECF9` | `#2A78D6` | `#1B2D44` | `#3987E5` |
| `cat-2` | laranja | `#FCEAE3` | `#CA592D` | `#3B241E` | `#D95926` |
| `cat-3` | água | `#DFF4EC` | `#168C62` | `#15322D` | `#199E70` |
| `cat-4` | amarelo | `#FCF2DB` | `#AB7400` | `#382D16` | `#C98500` |
| `cat-5` | magenta | `#FCEDF2` | `#B56080` | `#3B2330` | `#D55181` |
| `cat-6` | verde | `#DBEEDB` | `#008300` | `#102D16` | `#1F921F` |
| `cat-7` | violeta | `#E9E6F9` | `#6250D6` | `#2D2D45` | `#9085E9` |
| `cat-8` | vermelho | `#FBE6E5` | `#D54544` | `#3E272B` | `#E66767` |

**Categorias padrão** (ícones Lucide):

| Despesas | Ícone | Cor | | Receitas | Ícone | Cor |
|---|---|---|---|---|---|---|
| Moradia | `house` | cat-1 | | Salário | `briefcase` | cat-6 |
| Mercado | `shopping-cart` | cat-3 | | Freelance | `laptop` | cat-3 |
| Restaurantes | `utensils` | cat-2 | | Rendimentos | `trending-up` | cat-6 |
| Transporte | `car` | cat-4 | | Reembolsos | `rotate-ccw` | cat-1 |
| Saúde | `heart-pulse` | cat-8 | | Outras receitas | `plus` | neutro |
| Lazer | `ticket` | cat-5 | | | | |
| Educação | `graduation-cap` | cat-1 | | **Transferência** | `arrow-left-right` | `--transfer` |
| Compras | `shopping-bag` | cat-7 | | **Ajuste de saldo** | `scale` | neutro |
| Contas da casa | `zap` | cat-4 | | | | |
| Assinaturas | `repeat` | cat-7 | | | | |
| Cuidados pessoais | `scissors` | cat-5 | | | | |
| Pets | `paw-print` | cat-2 | | | | |
| Viagem | `plane` | cat-1 | | | | |
| Impostos e taxas | `landmark` | cat-8 | | | | |
| Presentes e doações | `gift` | cat-5 | | | | |
| Outros | `ellipsis` | neutro | | | | |

> A cor de categoria é **identidade visual do ícone**, não codificação de gráfico. Como há mais de 8 categorias, cores se repetem — por isso o gráfico de categorias usa um único tom e o ícone carrega a identidade (§9).

### 3.3 Cores de gráficos

Paleta categórica validada para daltonismo (protanopia/deuteranopia, ΔE OKLab ≥ 8 entre vizinhos) nos dois temas. **Ordem fixa, nunca reciclada.**

| Slot | Claro | Escuro | Uso no app |
|---|---|---|---|
| 1 azul | `#2A78D6` | `#3987E5` | "Investido" no simulador; cenário A |
| 2 laranja | `#EB6834` | `#D95926` | "Despesas"; cenário B |
| 3 água | `#1BAF7A` | `#199E70` | "Receitas"; "Juros"; cenário C |
| 4 amarelo | `#EDA100` | `#C98500` | reserva |
| 5 magenta | `#E87BA4` | `#D55181` | reserva |
| 6 verde | `#008300` | `#008300` | reserva |
| 7 violeta | `#6250D6` | `#9085E9` | reserva |
| 8 vermelho | `#E34948` | `#E66767` | reserva |

Pares em uso, medidos: Receitas × Despesas (água × laranja) ΔE 9,2 claro / 9,4 escuro; Investido × Juros (azul × água) ΔE 19,6 escuro. No tema claro, água tem contraste 2,8:1 com o branco → **obrigatório** rótulo direto no valor destacado e a visão em tabela (§9.5).

| Papel | Claro | Escuro |
|---|---|---|
| Série única (categorias, patrimônio, fluxo) | `--primary` | `--primary` |
| Linhas de grade | `#EAECEF` | `#232830` |
| Eixo/base | `#C9CED6` | `#3A404A` |
| Rótulos de eixo | `--text-3` | `--text-3` |
| Status ok / atenção / estourado | `--primary` / `--warning-fill` / `--danger-fill` | idem |
| Série em repouso (colunas não selecionadas) | `--chart-3-rest` / `--chart-2-rest` (§3.1) | idem |

### 3.4 Tipografia

**Família**: **Manrope** (variável, 200–800), via `next/font/google`, subset `latin`. Geometria limpa, numerais largos e legíveis, suporte a `tnum`. Fallback: `ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`.

| Token | Tamanho / altura | Peso | Tracking | Uso |
|---|---|---|---|---|
| `amount-input` | 48 / 52 | 700 | −0.03em | valor sendo digitado (Nova transação) |
| `display` | 40 / 44 | 700 | −0.025em | número herói da tela |
| `title-1` | 28 / 34 | 700 | −0.02em | título grande de página |
| `title-2` | 22 / 28 | 700 | −0.015em | título de sheet, valores de destaque secundário |
| `title-3` | 18 / 24 | 700 | −0.01em | título de card de destaque, saudação |
| `headline` | 16 / 22 | 650 | −0.005em | título de card, nome na linha de lista, valores em lista |
| `body` | 15 / 22 | 500 | 0 | texto corrido |
| `input` | 16 / 24 | 500 | 0 | **todo campo de texto** (abaixo de 16 px o Safari do iOS dá zoom) |
| `callout` | 14 / 20 | 500 | 0 | subtítulo de linha, descrições |
| `caption` | 13 / 18 | 500 | 0 | metadados, legendas |
| `overline` | 12 / 16 | 700 | 0.06em, MAIÚSCULAS | rótulo de seção ("SALDO EM CONTAS") |
| `micro` | 11 / 14 | 600 | 0.02em | rótulos da tab bar, eixos de gráfico |

Regras numéricas:

- **Números grandes isolados** (herói, tiles): algarismos **proporcionais** (padrão da fonte).
- **Números em coluna** (valores à direita na lista, tabelas, eixos): `font-variant-numeric: tabular-nums` para alinharem.
- Tamanhos em `rem` (respeitam o tamanho de fonte do sistema); testar com 200% de zoom.
- Texto grande: o corpo quebra palavras longas (`overflow-wrap: break-word`); títulos de página e de sheet hifenizam (`lang="pt-BR"`) e, se a palavra mais longa não cabe, encolhem até 60% (`title-fit`) em vez de partir no meio; **valores monetários encolhem até 50% para caber** no cartão (§5.4).

**Anatomia do valor monetário (`<Money>`)**

```
   R$ 27.670,15          variante display/title (≥ 22 px)
   ── ────── ───
   │    │     └─ centavos: 0,55em · peso 700 · cor --text-2
   │    └─────── inteiro: 1em · peso 700 · cor --text
   └──────────── moeda: 0,5em · peso 600 · cor --text-2 · margem direita 0,2em

   −R$ 64,50             variante lista (headline/callout): tudo no mesmo tamanho
   +R$ 7.800,00          receita em --income; sinal sempre explícito em listas
```

- Sinal de menos tipográfico **U+2212 (−)**, não hífen. Receita leva **+**. Transferência sem sinal, em `--text-2`.
- Gerado com `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).formatToParts()` — cada parte recebe seu estilo.
- Modo discreto: os dígitos viram `••••` (largura estável), `aria-label="valor oculto"`.

### 3.5 Espaçamento e grid

Base de **4 px**.

| Token | px | Uso típico |
|---|---|---|
| `1` | 4 | ícone ↔ texto pequeno |
| `2` | 8 | entre chips; entre teclas |
| `3` | 12 | entre cards; padding de chip |
| `4` | 16 | **margem lateral da tela**; padding de card |
| `5` | 20 | padding do card herói; margem lateral ≥ 430 px |
| `6` | 24 | entre blocos dentro de um card |
| `7` | 28 | entre seções da página |
| `8` | 32 | topo de sheet até conteúdo |
| `12` | 48 | respiro antes do fim da página |

- Alvos de toque **≥ 44 × 44 px**, com ≥ 8 px entre alvos adjacentes.
- Linha de lista: 64 px (com subtítulo) ou 52 px (uma linha).
- Com o texto do sistema grande, o que não é texto cresce em `rem` até um teto (`min(2.75rem, 56px)`): alvo `--target`, barra inferior `--tab-bar-h` (80 px), ícone da barra `--tab-icon`, "+" `--fab` (60 px), interruptor `--switch-w`/`--switch-h`, ícone de linha `--row-icon` e avatar `--avatar`. A 100% os valores são os de sempre.
- Conteúdo rolável termina com `padding-bottom: calc(64px + env(safe-area-inset-bottom) + 24px)` para nunca ficar sob a tab bar.

### 3.6 Raios

| Token | px | Uso |
|---|---|---|
| `--r-xs` | 6 | badges, marcador de parcela "2/6" |
| `--r-sm` | 10 | chips pequenos, tooltips |
| `--r-md` | 14 | botões, campos, teclas do teclado, ícone de categoria quadrado |
| `--r-lg` | 20 | cards |
| `--r-xl` | 28 | topo de sheets |
| `--r-full` | 9999 | pílulas, avatar, ícones circulares, anel |

### 3.7 Elevação e bordas

| Nível | Claro | Escuro |
|---|---|---|
| 0 · página | `--bg` | `--bg` |
| 1 · card | `--surface` + `0 1px 2px rgb(14 17 22 / .04), 0 2px 8px rgb(14 17 22 / .04)` | `--surface` + borda `1px rgb(255 255 255 / .06)` (sem sombra) |
| 2 · barras fixas | `--surface` a 88% + `backdrop-filter: blur(16px)` + hairline `--border` | idem com `--surface` a 85% |

| 3 · sheet / diálogo | `0 -12px 40px rgb(14 17 22 / .18)` + `--scrim` | borda superior `rgb(255 255 255 / .08)` + `--scrim` |
| Botão "+" | `0 6px 16px rgb(10 127 88 / .35)` | `0 6px 16px rgb(61 220 151 / .25)` |

**Exceção, a barra inferior** (05/11/2026): usa `--surface` opaco e hairline `--border`, sem translucidez nem desfoque. Com o fundo translúcido, o contraste do item ativo (`--primary`) variava com o que passava por baixo da barra e o axe o reprovava; opaco, o par é fixo e medido (§3.1). É um desvio do nível 2 da tabela.

### 3.8 Movimento

| Token | Valor | Uso |
|---|---|---|
| `--dur-1` | 100 ms | estado pressionado |
| `--dur-2` | 160 ms | fades, toggles, troca de aba |
| `--dur-3` | 240 ms | push de tela, expandir card |
| `--dur-4` | 360 ms | sheet (fallback sem spring) |
| `--ease-standard` | `cubic-bezier(.2, 0, 0, 1)` | maioria |
| `--ease-enter` | `cubic-bezier(.05, .7, .1, 1)` | elementos entrando |
| `--ease-exit` | `cubic-bezier(.3, 0, .8, .15)` | elementos saindo |
| Spring de sheet | `stiffness 420, damping 40` | abrir/arrastar/fechar sheets |
| Spring de seleção | `stiffness 500, damping 38` | indicador da tab bar e do segmented (`layoutId`) |

Coreografia:

- **Pressionar**: `scale(.97)` + `--surface-3` em 100 ms; botão "+" `scale(.94)`.
- **Push de tela**: nova tela entra 24 px da direita com fade (240 ms); a anterior recua 8 px com fade parcial. Troca de aba: só crossfade (160 ms), sem deslocamento.
- **Valores**: ao mudar, o número herói conta do valor antigo ao novo (500 ms, `--ease-standard`). Valores em lista não animam.
- **Barras e anéis**: crescem de 0 na primeira exibição (600 ms, `--ease-enter`), não em revisitas.
- **Lista**: itens novos entram com fade + 8 px (stagger 20 ms, no máximo 8 itens); linha recém-criada recebe um realce `--primary-soft` que esmaece em 1,2 s.
- **`prefers-reduced-motion`**: todo deslocamento vira fade de 120 ms; sem contagem de números, sem stagger, sem crescimento de barras.

### 3.9 Ícones

- **Lucide**, traço 1,75 (2 em 16 px), cantos arredondados. Tamanhos: 16 (inline), 20 (padrão), 24 (tab bar e topo).
- Ícone de categoria: glifo 20 px dentro de círculo 40 px (`bg`/`fg` da categoria). Em chips: 16 px dentro de 28 px.
- Contas: ícone por tipo (`landmark` corrente, `piggy-bank` poupança, `wallet` dinheiro, `trending-up` investimento, `vault` caixinha, `utensils-crossed` benefício, `credit-card` cartão). **Sem logos de bancos** (marcas registradas): usar monograma com a cor escolhida pelo usuário.
- Ícone sozinho como botão sempre tem `aria-label`.

### 3.10 Breakpoints e camadas

| Breakpoint | Largura | Layout |
|---|---|---|
| base | 0–639 | celular: 1 coluna, tab bar inferior (desenhar em 390, validar em 360) |
| `sm` | ≥ 640 | celular grande/paisagem: tiles em 2–3 colunas |
| `md` | ≥ 768 | tablet: **nav rail** lateral de 80 px; sheets viram diálogos centrados de 560 px |
| `lg` | ≥ 1024 | **sidebar** de 248 px com rótulos; conteúdo em 2 colunas |
| `xl` | ≥ 1280 | dashboard em 3 colunas; largura máxima do conteúdo 1200 px |

**Largura do contêiner, não da tela, para o tamanho do texto.** O texto em `rem` cresce com a fonte do sistema, a largura em pixels não. Onde o layout precisa saber se o texto cabe, usa-se *container query* em `rem`: `@max-tight` (contêiner abaixo de `--container-tight`, 16 rem) e `@max-tighter` (`--container-tighter`, 12 rem); a barra inferior usa 21,5 rem (§4.2). A 100% nenhum celular chega a esses limites, então nada muda. Nunca *media query* para reagir ao tamanho do texto.

`z-index`: cabeçalhos fixos 10 · tab bar 20 · botão "+" 30 · menus 40 · sheet/diálogo 50 · toast 60 · tooltip 70.

### 3.11 Implementação (Tailwind CSS v4)

O Tailwind v4 entra pelo loader `@tailwindcss/turbopack`, configurado no `next.config.ts` (sem PostCSS). Tema controlado por `next-themes` (`attribute="data-theme"`, `defaultTheme="dark"`, `enableSystem`, `storageKey="meu-finan:tema"`), que resolve o tema antes da hidratação (sem flash).

**Escuro por padrão.** O `<html>` já sai do servidor com `data-theme="dark"` e o viewport declara `color-scheme: dark`, então a primeira visita (login, convite, primeiro acesso, onboarding) é escura sem depender de script. A escolha (Escuro · Claro · Sistema) fica no aparelho (localStorage, aplicada por um script no `<head>` antes de qualquer pintura e depois pelo next-themes) e **na conta** (`user_settings.theme`): um aparelho novo adota o tema da conta depois de entrar, e uma troca feita em outro aparelho chega no próximo carregamento; num aparelho usado por mais de uma conta, quem entra passa a ver o tema da própria conta. Constantes, chaves e os scripts ficam em `src/lib/theme.ts`.

```css
/* src/app/globals.css */
@import "tailwindcss";

@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *));

:root {
  color-scheme: light;
  --bg: #F4F5F7;  --surface: #FFFFFF;  --surface-2: #EEF0F3;  --surface-3: #E5E8EC;
  --border: #E3E6EA;  --border-strong: #8A919E;  --switch-off: #7D8491;
  --text: #0E1116;  --text-2: #4A5260;  --text-3: #646B78;
  --primary: #0A7F58;  --on-primary: #FFFFFF;  --primary-soft: #E3F4EC;  --on-primary-soft: #075E41;
  --income: #0A7F58;  --expense: var(--text);  --transfer: #1F5BB5;  --transfer-soft: #E5EEFA;
  --warning: #8A5100;  --warning-soft: #FFF3DC;  --warning-fill: #FAB219;
  --danger: #B42318;  --danger-soft: #FCE9E9;  --danger-fill: #D03B3B;
  --chart-1: #2A78D6; --chart-2: #EB6834; --chart-3: #1BAF7A; --chart-4: #EDA100;
  --chart-5: #E87BA4; --chart-6: #008300; --chart-7: #6250D6; --chart-8: #E34948;
  --chart-grid: #EAECEF;  --chart-axis: #C9CED6;
  --cat-1-bg: #E1ECF9; --cat-1-fg: #2A78D6;   /* … cat-2 a cat-8 conforme §3.2 */
  --shadow-card: 0 1px 2px rgb(14 17 22 / .04), 0 2px 8px rgb(14 17 22 / .04);
}

[data-theme="dark"] {
  color-scheme: dark;
  --bg: #0B0D10;  --surface: #14171C;  --surface-2: #1C2027;  --surface-3: #252A32;
  --border: #262B33;  --border-strong: #6B7484;  --switch-off: #6B7484;
  --text: #F2F4F7;  --text-2: #B4BCC8;  --text-3: #8A93A1;
  --primary: #3DDC97;  --on-primary: #04130C;  --primary-soft: #1B3730;  --on-primary-soft: #7FEBC0;
  --income: #3DDC97;  --transfer: #9DC4FF;  --transfer-soft: #222E40;
  --warning: #F5C66A;  --warning-soft: #383121;
  --danger: #FF9A9A;  --danger-soft: #3A2429;
  --chart-1: #3987E5; --chart-2: #D95926; --chart-3: #199E70; --chart-4: #C98500;
  --chart-5: #D55181; --chart-6: #008300; --chart-7: #9085E9; --chart-8: #E66767;
  --chart-grid: #232830;  --chart-axis: #3A404A;
  --cat-1-bg: #1B2D44; --cat-1-fg: #3987E5;   /* … */
  --shadow-card: 0 0 0 1px rgb(255 255 255 / .06);
}

@theme inline {
  --color-bg: var(--bg);
  --color-surface: var(--surface);
  --color-surface-2: var(--surface-2);
  --color-surface-3: var(--surface-3);
  --color-border: var(--border);
  --color-border-strong: var(--border-strong);
  --color-fg: var(--text);
  --color-fg-2: var(--text-2);
  --color-fg-3: var(--text-3);
  --color-primary: var(--primary);
  --color-on-primary: var(--on-primary);
  --color-primary-soft: var(--primary-soft);
  --color-on-primary-soft: var(--on-primary-soft);
  --color-income: var(--income);
  --color-transfer: var(--transfer);
  --color-warning: var(--warning);
  --color-danger: var(--danger);
  --font-sans: var(--font-manrope), ui-sans-serif, system-ui, sans-serif;
  --radius-card: 20px;
  --radius-sheet: 28px;
  --shadow-card: var(--shadow-card);
  --ease-standard: cubic-bezier(.2, 0, 0, 1);
  --ease-enter: cubic-bezier(.05, .7, .1, 1);
}

html { -webkit-tap-highlight-color: transparent; text-size-adjust: 100%; }
body { background: var(--bg); color: var(--text); }
.tabular { font-variant-numeric: tabular-nums; }
```

`<meta name="theme-color">` e `<meta name="color-scheme">` começam no padrão escuro; um script no início do `<body>` os aponta para o tema salvo e o `ThemeMetaSync` (em `Providers`) os mantém iguais ao tema em uso, inclusive quando o Next recria as metatags em navegações — assim a barra do navegador e a do PWA acompanham o tema:

```tsx
export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: '#0B0D10',
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
};
```

---

## 4. Navegação e layout

### 4.1 Mapa de rotas

| Área | Rota | Tela |
|---|---|---|
| Tab **Início** | `/inicio` | dashboard |
| Tab **Extrato** | `/extrato` · `/extrato/[id]` | lista · detalhe (abre em sheet sobre a lista via rota interceptada) |
| Botão **+** | `?novo=despesa\|receita\|transferencia` em qualquer rota | sheet "Nova transação" (o voltar do Android/navegador fecha) |
| Tab **Planejar** | `/planejar/orcamentos` · `/planejar/metas` · `/planejar/metas/[id]` · `/planejar/simulador` | segmented control no topo alterna as três |
| Tab **Relatórios** | `/relatorios/visao-geral` · `categorias` · `fluxo` · `patrimonio` · `calendario` | abas roláveis |
| Pelo avatar / Início | `/contas` · `/contas/[id]` · `/cartoes/[id]` · `/cartoes/[id]/faturas/[yyyy-mm]` | contas e cartões |
| Pelo avatar | `/ajustes/*` · `/importar` | perfil e preferências |
| Atrás da flag `financas_compartilhadas` (Ajustes › Organização; barra lateral no desktop; bloco do Início) | `/compartilhado` · `/compartilhado/[grupo]` (`?mes=`) · `/compartilhado/[grupo]/caixinhas` · `/compartilhado/[grupo]/caixinhas/[caixinha]` | grupos e convites · um grupo · caixinhas do grupo · uma caixinha (§6.18) |
| Administradores (Ajustes; barra lateral no desktop) | `/admin/usuarios` · `/admin/flags` · `/admin/atividade` · `/admin/rotina` | contas e convites · feature flags · auditoria · rotina diária (§6.17) |
| Onboarding | `/onboarding` | 4 passos, logo depois do primeiro acesso ou do convite |
| Sem sessão | `/entrar` · `/primeiro-acesso` · `/recuperar` · `/convite/[token]` | login · configuração única da primeira conta · recuperação de emergência · convite ou link de redefinição (§6.1) |

Não há landing pública nem "Criar conta": a primeira conta é a do dono, que administra, e as outras chegam por convite (doc 01 §11). `/` leva ao Início, e todas as rotas fora das quatro acima exigem sessão, verificada no servidor; as de Administração exigem também o papel de administrador, e quem não o tem vê a página 404.

Filtros e período vivem na URL (`?mes=2026-10&conta=…&categoria=…`) com **nuqs**: o botão voltar desfaz filtros e links podem ser compartilhados.

### 4.2 App shell no celular

```
┌────────────────────────────────────┐
│ (AN) Boa tarde, Ana      [◉]  [🔔•]│  TopBar 56 px (Início)
│      terça, 14 de outubro          │
├────────────────────────────────────┤
│                                    │
│          conteúdo rolável          │
│     margem lateral 16 px           │
│                                    │
├────────────────────────────────────┤
│  ⌂       ≡      ┌───┐    ◎     ▥   │  BottomNav 64 px
│ Início Extrato  │ + │ Planejar Rel.│  + safe-area-inset-bottom
│  ▔▔▔            └───┘              │
└────────────────────────────────────┘
```

**BottomNav**

- 5 posições de mesma largura. Ícone 24 px + rótulo `micro` visível. Com texto grande, quando a barra tem menos de 21,5 rem, **só os ícones** ficam à vista e o rótulo vira `sr-only` (o link segue com o nome). A barra cresce em `rem` até 80 px (`--tab-bar-h`), o ícone até 28 px e a pílula até 36 px de altura.
- Ativo: ícone e rótulo em `--primary`, pílula `--primary-soft` de 56 × 30 px atrás do ícone, que **desliza** entre abas (spring de seleção, `layoutId`).
- Inativo: `--text-3`. Badge numérico (`--danger`, 16 px) para contas vencendo hoje, no ícone de Início.
- Centro: botão **+** 52 × 52 px (até 60 px com texto grande, `--fab`), raio 18, `--primary`, ícone `plus` 26 px em `--on-primary`, sombra do botão. Toque = abre "Nova transação" no tipo **Despesa**. Pressionar e segurar = menu rápido com Despesa / Receita / Transferência.
- A tab bar **não se esconde** ao rolar (previsibilidade); fundo translúcido com blur.
- Tocar na aba já ativa rola ao topo; tocar de novo volta à raiz da aba.

**TopBar**

- Início: avatar (iniciais sobre `--primary-soft`, 36 px), saudação `title-3` + data `caption`; à direita, botões de 44 px: tema (`moon`/`sun`, alterna escuro e claro; só abaixo de `lg`, onde não há sidebar), modo discreto (`eye`/`eye-off`) e notificações (`bell` com ponto).
- Com texto grande, avatar, saudação e botões do Início quebram em linhas (a saudação desce inteira); as ações do cabeçalho de página também.
- Demais abas: **título grande** (`title-1`, hifenizado) que, após 40 px de rolagem, colapsa num título centralizado `headline` numa barra de 52 px com hairline.
- Telas empilhadas: voltar (`chevron-left` + rótulo da tela anterior em telas largas), título, até 2 ações.

### 4.3 Período ativo

- `MonthSwitcher`: `‹  outubro de 2026  ›`, botões de seta de 44 px (`--target`); o rótulo ocupa o miolo de uma grade e quebra em duas linhas com texto grande. Tocar no texto abre uma sheet com grade 3 × 4 de meses e seletor de ano.
- Deslizar horizontalmente sobre o cabeçalho de período troca o mês (com a mesma animação das setas).
- Fora do mês atual aparece o chip **"Voltar para hoje"** (no mínimo 32 px de altura e 44 de toque; quebra com texto grande).
- O período é compartilhado entre Início, Extrato, Orçamentos e Relatórios durante a sessão.
- Com dia de início ≠ 1 (ex.: 5), o rótulo mostra o intervalo: "outubro · 5/out – 4/nov".

### 4.4 Padrões de navegação

| Situação | Padrão |
|---|---|
| Criar ou editar algo | **Sheet** inferior (altura total para formulários longos; 50% para escolhas rápidas) |
| Ver detalhe vindo de uma lista | **Sheet** sobre a lista (rota interceptada); recarregar a URL abre a tela cheia |
| Ir para uma área | **Push** (nova tela com voltar) |
| Escolha simples (conta, categoria, data) | **Sheet** de seleção com busca quando houver > 8 itens |
| Ação destrutiva irreversível | **Diálogo** de confirmação com o verbo no botão ("Apagar todos os dados") |
| Ação reversível | Executa + **toast** com Desfazer |

Sheets: alça de 36 × 4 px no topo, cabeçalho com título `title-2` e botão fechar (44 px). Fecham com arrastar para baixo (> 25% da altura ou velocidade > 500 px/s), toque no scrim, botão fechar ou **voltar do sistema** (cada sheet empilha uma entrada no histórico).

### 4.5 Tablet e desktop

| Elemento | Celular | Tablet (`md`) | Desktop (`lg`+) |
|---|---|---|---|
| Navegação | tab bar inferior | nav rail 80 px à esquerda, "+" no topo do rail | sidebar 248 px com rótulos, botão "Nova transação" e, no rodapé, o tema (segmented só de ícones) |
| Início | 1 coluna | 2 colunas (herói ocupa 2) | 3 colunas: [herói + tiles] [orçamento + próximas contas] [contas + metas]; com o Início personalizado, um fluxo na ordem escolhida (§6.3, "Personalizar") |
| Extrato | lista | lista + filtros em barra | lista à esquerda, detalhe fixo à direita (master–detail) |
| Sheets | inferior | diálogo centrado 560 px | diálogo; detalhe em painel lateral |
| Simulador | entradas e resultado empilhados | 2 colunas | entradas 360 px à esquerda, resultado e gráfico à direita |
| Relatórios | 1 gráfico por linha | 2 por linha | grade de 12 colunas |

A barra lateral ganha **Compartilhado** (`Users`) depois de Relatórios, só com a flag `financas_compartilhadas` (decidido no servidor, num `<Suspense>`, como Administração).

Atalhos de teclado (desktop): `N` nova despesa, `R` nova receita, `T` transferência, `/` buscar, `←`/`→` mês anterior/seguinte, `G` depois `I`/`E`/`P`/`R` navega entre áreas, `Esc` fecha sheet. Lista de atalhos com `?`.

---

## 5. Biblioteca de componentes

Cada componente define anatomia, variantes, estados e acessibilidade. Base: shadcn/ui adaptado aos tokens.

### 5.1 Button

| Variante | Aparência | Uso |
|---|---|---|
| `primary` | `--primary` / `--on-primary` | uma por tela/sheet: a ação principal |
| `tonal` | `--primary-soft` / `--on-primary-soft` | ações secundárias positivas ("Pagar", "Aportar") |
| `secondary` | `--surface-2` / `--text` | ações neutras |
| `ghost` | transparente / `--primary` | links de ação ("Ver tudo") |
| `destructive` | `--danger` / branco | somente em diálogos de confirmação |

Tamanhos: `lg` 52 px (rodapé de sheet, largura total), `md` 44 px, `sm` 36 px (só dentro de linhas, com área de toque estendida a 44). Alturas são **mínimas**: com texto grande o rótulo quebra (`text-balance`, centralizado) e o botão cresce, nunca corta. Raio `--r-md`, rótulo `headline`. Estados: pressionado (`scale .97`, escurece 6%), carregando (spinner no lugar do ícone, largura fixa, `aria-busy`), desabilitado (opacidade 40% + motivo explicado próximo — nunca desabilitar sem dizer por quê).

### 5.2 IconButton

44 × 44 px, ícone 20–24 px, raio cheio; fundo transparente, pressionado `--surface-2`. `aria-label` obrigatório. Badge opcional (ponto 8 px ou número).

### 5.3 Card e seções

- Card: `--surface`, raio 20, padding 16 (herói 20), elevação 1.
- Cabeçalho de card: título `headline` à esquerda; ação `ghost` à direita ("Ver tudo", 44 px de altura).
- Cabeçalho de seção (fora de card): `overline` em `--text-3`, 28 px acima, 12 px abaixo.
- Card inteiro tocável quando leva a um detalhe: chevron à direita no cabeçalho; feedback de pressão no card todo.

### 5.4 Money

Props: `value` (centavos), `variant` (`display` \| `title` \| `headline` \| `callout` \| `caption`), `sign` (`auto` \| `always` \| `never`), `tone` (`auto` \| `neutral` \| `income` \| `transfer`), `animate`. Regras da §3.4. Aplica `tabular-nums` nas variantes de lista. **O valor sempre aparece inteiro e exato.** O tamanho é o da variante até onde cabe no contêiner (`@container`: `Card`, lista, cartão do carrossel) e encolhe até **50%** quando falta largura, pela largura estimada em `em` dos algarismos, vírgula, sinal e "R$" (`src/components/money/fit.ts`, utilitário `money-fit`). Formato compacto ("R$ 1,2 mi") só em eixos de gráfico e tiles, como sempre. Respeita o modo discreto. Leitor de tela: "Despesa de 64 reais e 50 centavos" (via `aria-label` gerado).

### 5.5 MoneyInput + Keypad

- **Display**: `amount-input` (48 px) centralizado; símbolo R$ menor (0,5em). Cursor piscante de 2 px em `--primary` após o último dígito. Linha da expressão acima em `caption` `--text-3` quando há operação ("120 + 35,50").
- **Teclado** (4 × 4, teclas 52 px de altura, raio 14, `--surface-2`, dígitos `title-2`):

```
┌──────┬──────┬──────┬──────┐
│  1   │  2   │  3   │  ⌫   │
├──────┼──────┼──────┼──────┤
│  4   │  5   │  6   │  +   │
├──────┼──────┼──────┼──────┤
│  7   │  8   │  9   │  −   │
├──────┼──────┼──────┼──────┤
│  ,   │  0   │  00  │  =   │
└──────┴──────┴──────┴──────┘
```

- Entrada estilo **calculadora**: "35" = R$ 35,00 (gastos do dia a dia costumam ser inteiros). "," inicia centavos (máx. 2). Máx. 9 dígitos inteiros. Zeros à esquerda colapsam. Operador após operador substitui. `=` resolve; "Salvar" resolve automaticamente. `⌫` pressionado e segurado limpa tudo.
- Resultado ≤ 0 → tremida horizontal (6 px, 3×, 240 ms) + "O valor precisa ser maior que zero".
- Teclas com feedback visual imediato (`--surface-3`, 100 ms) e vibração de 8 ms (Android).
- Teclado físico: dígitos, `,`/`.`, `Backspace`, `+`, `-`, `Enter` (salvar), `Esc` (fechar).
- Em desktop o teclado na tela some e o campo aceita digitação direta (`inputMode="decimal"`).
- A11y: o display é um `role="textbox"` com `aria-live="polite"` anunciando o valor formatado; cada tecla é `<button>` com rótulo ("apagar", "mais", "menos", "igual").

### 5.6 CategoryIcon / AccountIcon

Círculo 40 px (lista) / 32 px (cards compactos) / 28 px (chips) com `bg`/`fg` da categoria. Variante quadrada (raio 14) para contas. Ícone neutro para "Outros" (`--surface-2` / `--text-2`).

### 5.7 TransactionRow

```
┌────────────────────────────────────────────┐
│ (🛒)  Supermercado               −R$ 64,50 │  64 px
│       Mercado · Conta principal       Pago │
└────────────────────────────────────────────┘
  40px  título headline (1 linha, reticências)   valor headline tabular
        subtítulo caption --text-3               selo caption (opcional)
```

- **Texto grande** (zoom ou fonte a 200%): a linha quebra em vez de cortar. O ícone e os textos ficam juntos e o valor, com o selo, desce para a linha de baixo, alinhado à direita (`flex-wrap`); nunca fica fora do cartão.
- Subtítulo: `Categoria · Conta` (subcategoria só com o próprio nome: "Feira · Conta"); extras como selos: parcela `2/6` (badge `--surface-2`, raio 6), `↻` recorrente, clipe se tem anexo.
- **Pendente**: ícone com contorno tracejado, valor em `--text-2`, selo "Agendado · 15/out" ou "Vence amanhã" (âmbar quando ≤ 3 dias).
- **Vence em dia não útil** (flag `alerta_dia_nao_util`, só despesa pendente; 12/11/2026): terceira linha na coluna esquerda, "Dia não útil · passa para seg, 16 nov" (`caption` `--text-3`, ícone `calendar-clock` de 14 px `aria-hidden`, no máximo 2 linhas), por baixo de "Categoria · Conta". É informação, não alerta: nenhuma cor de estado e nenhum valor no texto (o modo discreto não muda). A linha só existe nessas linhas raras: a altura de 64 px e os skeletons são os da linha sem nota. Com texto grande (container query `@max-tight`, linha mais estreita que 16 rem), a nota sai da coluna e desce para baixo da linha toda, na largura inteira (`placement="below"`), para não espremer o título. O nome acessível do botão da linha ganha ", vence em dia não útil, passa para segunda, 16 de novembro" (datas por extenso). Entre o vencimento e o próximo dia útil o selo da direita é "Prazo até seg, 16 nov" (âmbar), no lugar de "Venceu ontem" (§6.4).
- **Transferência**: ícone `arrow-left-right` em `--transfer-soft`, título "Para Reserva", valor sem sinal em `--text-2`.
- **Gestos**: deslizar para a esquerda revela **Excluir** (80 px, `--danger`); deslizar até o fim executa com toast "Desfazer". Para a direita revela **Pago/Pendente** (alterna) e **Duplicar**. Ações também no menu de contexto (pressionar e segurar no desktop / botão "⋯" acessível por teclado).
- Toque abre o detalhe. Pressionar e segurar (400 ms) entra em **modo de seleção** (checkbox 24 px aparece à esquerda com animação).

### 5.8 DayHeader

Cabeçalho fixo ao rolar (40 px, fundo `--bg` 92% + blur): "Hoje · terça, 14 out" à esquerda (`caption` 700), total do dia à direita (`caption` tabular, `−R$ 87,40`). Com texto grande o cabeçalho cresce (`min-h-10`) e o total desce para a linha de baixo, à direita, em vez de ser cortado.

### 5.9 Meter (barra de orçamento)

```
 Mercado                              R$ 640 de R$ 900
 ████████████████████████░░░░░│░░░░░░░░░   ⚠ Acima do ritmo
                               ▲ hoje (45% do mês)
```

- Trilho 8 px, raio cheio, `--surface-2`. Preenchimento por estado: no ritmo `--primary` · acima do ritmo `--warning-fill` · estourado `--danger-fill` (preenchimento total + texto "R$ 10 acima").
- **Marcador de ritmo**: traço vertical 2 × 14 px em `--text` com 2 px de anel `--surface`, posicionado no % do período decorrido.
- Variante **empilhada** (orçamento total): gasto (sólido) + agendado (mesma cor com hachura a 45°, 40%), com legenda.
- Estado sempre com **ícone + rótulo** ("No ritmo", "Acima do ritmo", "Estourou", "Agendado"), nunca só cor.
- A11y: `role="meter"` com `aria-valuenow`, `aria-valuemax` e `aria-valuetext="640 de 900 reais, 71%, acima do ritmo"`.

### 5.10 Ring (meta)

SVG, traço 6 px (44 px) ou 10 px (120 px), trilho `--surface-2`, arco `--primary` com ponta arredondada; texto central `headline` com %. Meta concluída: arco completo + ícone `check`.

### 5.11 StatTile

Card compacto: ícone (32 px) + rótulo `caption` + valor `title-2` proporcional + linha de apoio `caption` (delta ou complemento). Delta: seta + valor + "vs set" — cor por direção **e** por significado (gasto menor = `--income`).

### 5.12 Chips

| Tipo | Aparência | Uso |
|---|---|---|
| Filtro | 36 px, `--surface`, borda `--border`; ativo: `--primary-soft` + texto `--on-primary-soft` + `x` para limpar | filtros do extrato |
| Escolha | 36–40 px com ícone 28 px; selecionado com anel 2 px `--primary` | categoria rápida, conta, data |
| Selo | 22 px, raio 6, `caption` 600 | status, parcela |

Linhas de chips roláveis horizontalmente com máscara de fade de 16 px nas bordas e `scroll-snap`.

### 5.13 SegmentedControl

Trilho `--surface-2` 40 px, raio 12; "polegar" `--thumb` com `shadow-thumb` que desliza (spring de seleção): igual a `--surface` no claro e mais claro que o trilho no escuro (§3.1), para o item selecionado parecer elevado. Rótulo `callout` 600. 2–4 opções. Rótulos longos quebram e o trilho cresce (`min-h-10`); com contêiner abaixo de 16 rem os itens quebram em linhas. Teclado: setas trocam, `role="tablist"` ou `radiogroup` conforme o uso.

### 5.14 Sheet

Raio superior 28; alça; snap points `[0.5, 0.92]` para escolhas, altura total para formulários. Conteúdo rola dentro (`overscroll-behavior: contain`). Rodapé fixo com ação primária acima do `safe-area`. Folhas de altura total (`fullHeight`, a Nova transação) têm corpo e rodapé num só rolador: o rodapé fica colado embaixo enquanto a folha tem 32 rem de altura e, com texto grande, desce junto do conteúdo para não escondê-lo. O título da sheet encolhe se a palavra mais longa não cabe (§3.4). Foco preso dentro e devolvido ao gatilho ao fechar. Ajusta-se ao teclado via `visualViewport` (iOS) e `interactive-widget=resizes-content` (Android).

### 5.15 Toast

Sonner, posição inferior acima da tab bar (`bottom: 64px + safe-area + 12px`), largura total − 32 px, raio 14, `--text` como fundo e `--surface` como texto (alto contraste nos dois temas). Ação à direita ("Desfazer") em `--primary` claro/escuro adequado, com alvo de **44 px**; com texto grande ela desce para baixo da mensagem. A posição acompanha `--tab-bar-h`. Duração 5 s (com ação) / 3 s (sem). Arrastar para baixo dispensa. `aria-live="polite"`.

### 5.16 EmptyState

Ícone de linha 48 px em círculo `--surface-2` 88 px, título `title-3`, texto `body` `--text-2` (máx. 2 linhas), CTA `primary` ou `tonal`. Sem ilustrações infantis.

### 5.17 Skeleton

Blocos `--surface-2` com o **formato exato** do conteúdo final (mesmas alturas → zero CLS). Brilho diagonal de 1,2 s (desligado com movimento reduzido). Ao **recarregar** dados já exibidos, nunca voltar ao skeleton: manter o conteúdo a 60% de opacidade com spinner discreto.

No Início, cada skeleton tem a altura medida do bloco carregado. A altura segue a **largura do próprio bloco** (container query), não a da tela: o mesmo bloco quebra uma linha a mais numa coluna estreita do `xl` e num celular pequeno. Quando a forma muda com o mês (o Fluxo de caixa num mês passado, no atual ou num futuro), o skeleton também segue a **fase do mês** em tela.

### 5.18 Inputs de formulário

Campo 52 px, raio 14, fundo `--surface`, borda 1 px `--border-strong`; foco: borda 2 px `--primary` + anel. Rótulo **sempre visível** acima (`callout` 600), nunca só placeholder. Erro: borda `--danger`, ícone + mensagem `caption` abaixo, anunciada (`aria-describedby` + `aria-invalid`). `enterKeyHint`, `autocomplete` e `inputMode` corretos em todos.

### 5.19 DatePicker

Sheet com atalhos ("Hoje", "Ontem", "Anteontem", "Início do mês") + calendário mensal (células 44 px, hoje com anel, selecionado preenchido `--primary`, dias com lançamentos com ponto). Semana começa no domingo (padrão brasileiro).

### 5.20 InsightCard

Card com ícone `lightbulb` em `--primary-soft`, texto `body` com o número em destaque (`headline`), ação `ghost` ("Ver Restaurantes") e botão fechar (dispensa e não repete por 30 dias, para esta pessoa neste aparelho: a lista de dispensas no `localStorage` tem o id da pessoa na chave).

---

## 6. Telas

Convenções desta seção: wireframes em 390 px; valores de exemplo iguais aos dos mockups (usuária fictícia Ana, hoje = terça, 14/out/2026).

### 6.1 Entrar, primeiro acesso e recuperação

**Não existe "Criar conta"**: a primeira conta é a do dono e as outras chegam por convite. Estas são as únicas telas sem sessão (doc 01 §11). Layout mínimo: logo pequeno, título `title-1` e um card centrado, sem tab bar. Erros sempre genéricos — nunca revelar se um e-mail existe nem qual campo estava errado. Colar e gerenciadores de senha sempre permitidos (WCAG 2.2, critério 3.3.8).

**Entrar** (`/entrar`)

- **Passkey primeiro**: botão primário **"Entrar com passkey"** (Face ID/biometria) quando o aparelho suporta; campo de e-mail com `autocomplete="username webauthn"` — a autenticação condicional oferece a passkey já no foco do campo.
- **Senha como alternativa**: "Usar senha" (`ghost`) revela o campo de senha (`autocomplete="current-password"`, botão mostrar/ocultar). Erro: "E-mail ou senha incorretos".
- Muitas tentativas: mensagem inline com o tempo de espera devolvido pelo servidor ("Muitas tentativas. Tente de novo em 40 s.").
- Depois de entrar, volta para a tela de `?voltar=` (só caminhos internos) ou para o Início.
- Sem "Continuar com Google", sem link por e-mail e sem atalho para a recuperação — ela só existe quando o dono a liga.

**Primeiro acesso** (`/primeiro-acesso`) — usado uma única vez

- Só abre enquanto não existe usuário e com `SETUP_TOKEN` e `OWNER_EMAIL` configurados; caso contrário, 404 sem pistas.
- Campos: código de configuração (apoio: "O valor de SETUP_TOKEN definido na Vercel."), seu nome, e-mail, senha e "Confirme a senha" (`autocomplete="new-password"`; apoio: "Pelo menos 12 caracteres. Depois você cadastra uma passkey.").
- Botão primário "Criar acesso". Erros: "Código de configuração inválido.", "Use o e-mail configurado para o dono do app." (nunca mostra o e-mail certo) ou "Não foi possível criar o acesso. Confira os dados."
- Em seguida, Ajustes › Segurança com "Acesso criado. Agora cadastre uma passkey para entrar com Face ID, digital ou o PIN do aparelho…", o botão de cadastrar a passkey e "Pular e continuar" ("Continuar: primeiros passos" depois de cadastrar). Depois, onboarding (§6.2).

**Recuperação de emergência** (`/recuperar`)

- Existe só enquanto o `RECOVERY_TOKEN` está configurado na Vercel (doc 01 §11.4); sem ele, 404.
- Campos: código de recuperação, nova senha e confirmação (12+ caracteres) e a caixa "Remover todas as passkeys" (desmarcada; apoio: "Use se perdeu o aparelho. Depois cadastre uma passkey nova."). Não há campo de e-mail: a conta é escolhida pelo servidor.
- Botão primário "Redefinir acesso". Sucesso: volta ao login com o aviso "Acesso recuperado. Entre com a nova senha e cadastre uma passkey de novo, se removeu as antigas." (todas as sessões foram encerradas).
- Vale para a conta do dono (`OWNER_EMAIL`; sem a variável, a conta mais antiga, a do primeiro acesso), que volta a ser administradora ativa. Se o `OWNER_EMAIL` não for de nenhuma conta, recusa com "Nenhuma conta usa o e-mail de OWNER_EMAIL…" em vez de assumir outra.

**Convite e link de redefinição** (`/convite/[token]`)

- Link de uso único gerado por um administrador (§6.17), válido por 72 h. Token desconhecido ou adulterado: 404, sem dizer por quê.
- **Convite**: "Olá, Bruno" + "Você recebeu um convite para o Meu Finan. Crie uma senha para entrar: suas finanças ficam só na sua conta." E-mail só leitura (oferecido ao gerenciador de senhas), senha e confirmação (12+ caracteres, indicador com ✓) e "Criar senha e entrar" → entra na hora, recebe a oferta de passkey como no primeiro acesso (Ajustes › Segurança, com "Pular e continuar") e segue para o onboarding (§6.2). Embaixo, com relógio: "O link vale até ter, 20/out, 14:32 e funciona uma única vez."
- **Redefinição**: "Redefinir acesso" + "Bruno, defina uma nova senha. As sessões abertas da sua conta serão encerradas.", com "Remover todas as passkeys" como em `/recuperar`; "Redefinir e entrar" leva a Ajustes › Segurança, com o aviso para cadastrar uma passkey.
- **Link que não serve mais**, com ícone num círculo `--surface-2`: "Este link expirou" (72 h; "Peça um novo a quem administra o app."), "Este link já foi usado" (botão "Entrar") ou "Este link não funciona mais" (trocado por um mais novo ou cancelado).
- **Aparelho já conectado** a outra conta: "Este aparelho está conectado à conta …" + "Sair e continuar" — nunca troca de conta sem a pessoa perceber.
- Muitas visitas do mesmo endereço: "Muitas tentativas" + "Espere alguns minutos e abra o link de novo."

### 6.2 Onboarding (4 passos, < 1 minuto)

Indicador de progresso (4 pontos) no topo; "Pular" no canto.

1. **Boas-vindas** — título "Seu dinheiro, claro como deveria ser", 3 benefícios em linhas com ícone, botão "Começar".
2. **Sua primeira conta** — nome pré-preenchido "Conta principal", chips de tipo (Corrente, Poupança, Dinheiro), **saldo atual** com MoneyInput. Texto de apoio: "Não precisa ser exato — você ajusta depois."
3. **Categorias** — grade de chips com as categorias padrão, todas ligadas; tocar desliga. "Você pode criar e editar depois."
4. **Seu mês** — "Seu mês financeiro começa no dia": chips 1 · 5 · 10 · 15 · 20 · Outro. Apoio: "Use o dia em que costuma receber o salário."

Ao concluir: Início com **3 dicas contextuais** sequenciais (balão apontando): botão "+", previsão do mês, olho do modo discreto. Cada dica some ao tocar fora; só reaparece com "Rever dicas" (§6.16). As regras dos balões e das novidades estão na §6.16.

### 6.3 Início

**Objetivo**: em 3 segundos, responder "quanto tenho?", "como está o mês?" e "o que vence logo?".

```
┌────────────────────────────────────┐
│ (AN) Boa tarde, Ana      [◉]  [🔔] │
│      terça, 14 de outubro          │
│ ┌────────────────────────────────┐ │
│ │ SALDO EM CONTAS                │ │
│ │ R$ 27.670,15                   │ │  display 40 px
│ │ [↗ +R$ 1.240,10 em outubro]    │ │  chip primary-soft
│ │ ────────────────────────────── │ │
│ │ Previsto para 31/out           │ │
│ │ R$ 24.719,83              (i)  │ │
│ └────────────────────────────────┘ │
│ ┌──────────────┐ ┌──────────────┐  │
│ │ ↙ Receitas   │ │ ↗ Despesas   │  │
│ │ R$ 7.952,30  │ │ R$ 1.544,98  │  │
│ │ +R$ 650 a    │ │ R$ 2.264,80  │  │
│ │  receber     │ │  agendados   │  │
│ └──────────────┘ └──────────────┘  │
│ ┌ Orçamento de outubro ─── Ver ┐   │
│ │ R$ 1.445 de R$ 4.500          │   │
│ │ ██████▒▒▒▒▒▒▒▒▒▒▒│░░░░░░░░    │   │  gasto + agendado + ritmo
│ │ Pode gastar R$ 53/dia até 31  │   │
│ │ (🍽) Restaurantes  ⛔ Estourou │   │
│ │ (🛒) Mercado       ⚠ Acima    │   │
│ │ (🚗) Transporte    ✓ No ritmo │   │
│ └───────────────────────────────┘   │
│ PRÓXIMAS CONTAS                     │
│ (⌂) Aluguel · amanhã  R$ 2.100 [Pagar]
│ (▭) Fatura Cartão · 25/out  R$ 1.380,42
│ (⚡) Internet · 20/out   R$ 119,90   │
│ CONTAS                    ← rolagem →│
│ [Conta principal][Reserva][Carteira]│
│ METAS                               │
│ (◔62%) Reserva de emergência  No ritmo
│ ┌ 💡 Transporte: 32% abaixo da  ┐   │
│ │   média de 3 meses até hoje   │   │
│ └───────────────────────────────┘   │
├────────────────────────────────────┤
│  Início  Extrato  [+]  Planejar Rel.│
└────────────────────────────────────┘
```

| Bloco | Conteúdo e regras | Toque leva a |
|---|---|---|
| Saldo em contas | soma das contas com "incluir no patrimônio" **para gastar**: fora cartões e caixinhas (doc 03 §12); chip com variação do mês (guardar na caixinha aparece como queda, pois o dinheiro saiu das contas do dia a dia); com caixinha no patrimônio, a linha "Guardado em caixinhas: R$ X" (`caption`, `--text-3`) logo abaixo do chip, só para quem tem; **previsto para o fim do período** = saldo + receitas pendentes − despesas pendentes − faturas a vencer no período. O "(i)" abre sheet com a conta detalhada e, com caixinha, a nota "Não inclui R$ X guardados em caixinhas." | `/contas` |
| Receitas / Despesas | efetivados no período; linha de apoio com pendentes | extrato filtrado por tipo |
| Orçamento | meter empilhado (gasto + agendado) com marcador de ritmo; "pode gastar por dia" já desconta contas agendadas; até 3 categorias priorizadas por gravidade (estourou > acima do ritmo > no ritmo) | `/planejar/orcamentos` |
| Próximas contas | pendentes dos próximos 7 dias + faturas, sempre contados a partir de hoje, mesmo na virada do mês; num mês que não é o atual (`?mes=`), a legenda "A partir de hoje" avisa; botão `tonal sm` "Pagar" marca como pago (toast com Desfazer); vencidas no topo com selo `--danger` "Venceu ontem"; com a flag `alerta_dia_nao_util`, a conta que vence em dia não útil (conta e fatura) ganha abaixo a nota "Dia não útil · passa para seg, 16 nov" (§5.7) e, do dia seguinte ao vencimento até o próximo dia útil, o selo âmbar "Prazo até amanhã" / "Prazo até seg, 16 nov" no lugar de "Venceu" (não sobe ao topo nem fica vermelha) | detalhe do lançamento / fatura |
| Contas | carrossel `scroll-snap` de cards 156 × 112 px (ícone, nome, saldo; selos "Caixinha" e "Benefício" como o do cartão); último card tracejado "+ Adicionar conta"; o card seguinte aparece cortado para sugerir rolagem | `/contas/[id]` |
| Metas | até 2 metas com anel 44 px, % e status | `/planejar/metas/[id]` |
| Insight | no máximo 1 por vez; dispensável | relatório relacionado |

Estados: primeira vez (sem lançamentos) → cards substituídos por um checklist "Comece por aqui" (Adicionar 1º gasto · Criar orçamento · Instalar o app). Carregando → skeleton por bloco (streaming independente), com a altura medida do bloco carregado. Erro → só o bloco vira um card com o título do bloco ("Não deu para carregar o orçamento"), "Pode ter sido a conexão. Seus dados estão seguros." e o botão `tonal` "Tentar de novo"; o resto da tela continua. Um bloco que não tem o que mostrar (o Destaque na maioria dos meses) não deixa buraco. Modo discreto → todos os valores `R$ ••••`.

#### Personalizar

Atrás da flag `inicio_personalizavel` (desligada por padrão; doc 01 §11.10). Cada pessoa mostra, esconde e reordena os blocos; a escolha fica na conta (`user_settings.home_layout`) e vale em todos os aparelhos. Quem nunca mexeu vê o padrão do app, inclusive blocos que entrarem nele depois.

**Catálogo** (`src/lib/home/blocks.ts`, ids nunca renomeados nem reaproveitados):

| Bloco | Descrição na folha | Tamanho | No padrão |
|---|---|---|---|
| Saldo em contas | Quanto você tem hoje e quanto deve sobrar no fim do mês. | estreito, fixo no topo | sim |
| Receitas e despesas | O que entrou e saiu no mês, com o que ainda vai cair. | estreito | sim |
| Orçamento | Quanto do orçamento já foi e o ritmo do mês. | estreito | sim |
| Próximas contas | O que vence nos próximos 7 dias, faturas incluídas. | estreito | sim |
| Contas | O saldo de cada conta e cartão. | estreito | sim |
| Metas | Como andam as suas metas. | estreito | sim |
| Destaque do mês | Um gasto fora do seu normal, quando houver. | estreito | sim |
| Calendário de gastos | Quanto você gastou em cada dia do mês. | largo | não |
| Fluxo de caixa | O saldo das contas dia a dia, com o que ainda vai cair. | largo | não |
| Para onde foi o dinheiro | As categorias em que você mais gastou no mês. | estreito | não |
| Receitas × despesas por mês | O que entrou e saiu em cada um dos últimos 6 meses. | estreito | não |
| Patrimônio | O que você tem menos o que deve, e como mudou em 6 meses. | estreito | não |
| Quanto dá para gastar por dia | Quanto dá para gastar por dia em cada um dos próximos 14 dias. | largo | não |
| Maior gasto da semana | Os 3 maiores gastos dos últimos 7 dias. | estreito | não |
| Parcelas a terminar | Compras parceladas que ainda faltam pagar e quanto saem por mês. | estreito | não |
| Comparado ao mês passado | Seu gasto do mês até hoje contra o mesmo ponto do mês passado. | estreito | não |
| Assinaturas do mês | Despesas que se repetem todo mês, quanto somam e o próximo débito. | estreito | não |

"Receitas × despesas por mês" leva "por mês" para não confundir com "Receitas e despesas", os dois cards do mês. O título de cada bloco no Início é o nome dele na folha.

**Mesclagem**: o Saldo vem sempre primeiro e visível. Ids desconhecidos, repetidos (vale o primeiro) ou mal formados são ignorados. Um bloco do catálogo que a pessoa não conhecia ao salvar entra no fim, escondido, com o selo "Novo". Um bloco fora do padrão também leva "Novo" nos primeiros 30 dias depois de lançado.

**Folha "Personalizar o Início"** (sheet no celular, diálogo de 560 px a partir de `md`). Abre pelo botão `secondary` "Personalizar o Início" (ícone de controles) no fim do Início e pela linha "Personalizar o Início" da seção INÍCIO de Ajustes › Preferências, logo depois de Aparência (legenda "Padrão do app" ou "Na sua ordem"; sem contagem de blocos, porque o Destaque nem sempre aparece).

- Título "Personalizar o Início"; descrição "Escolha os blocos e a ordem. Vale em todos os seus aparelhos."
- Lista numerada, uma linha por bloco. O Saldo fica fixo, com cadeado e "Sempre no topo", sem controles. Os outros têm "Subir" e "Descer" empilhados (44 × 44, `aria-label` "Subir {bloco}" / "Descer {bloco}"), nome, descrição, selo "Novo" quando for o caso e um interruptor à direita (nomeado pelo nome do bloco, descrito pela descrição).
- Sem arrastar: os botões funcionam por toque, teclado e leitor de tela (§11, critério 2.5.7). Nas pontas, o botão fica `aria-disabled` (não `disabled`), para o foco não se perder; depois de mover, o foco volta ao mesmo botão, e uma região de status anuncia "{Bloco} na posição {n} de {total}." A linha desliza para o lugar novo (respeita "reduzir movimento").
- A edição fica na folha até "Salvar" (`primary`, rodapé fixo; "Salvando…" enquanto grava), que grava e fecha. Aberta de Preferências, confirma com o toast "Início atualizado." e a ação "Ver Início".
- "Restaurar padrão" (`ghost`, só quando a pessoa já personalizou) grava na hora, fecha e mostra o toast "O Início voltou ao padrão." com "Desfazer".
- Erros: "Não conseguimos salvar. Verifique a conexão." (rede) e "Não conseguimos salvar. Atualize a página e tente de novo." (app desatualizado mandando um bloco que o servidor não conhece).

**Desktop**: os blocos seguem a ordem escolhida. Cada bloco largo ocupa uma linha inteira; os estreitos entre dois largos se dividem em até 3 colunas contíguas, equilibradas pela altura estimada de cada bloco (com o padrão, saem as três colunas de sempre). Com 3 colunas, a primeira ocupa a largura toda em `md` e as três ficam lado a lado a partir de `xl`. Coluna ou linha cujos blocos não mostram nada some, e as outras ocupam o espaço. O Saldo nunca fica sozinho numa linha: quando um bloco largo vem logo depois dele, os dois dividem a linha a partir de `xl` (um terço e dois terços); abaixo disso, empilham. Os blocos largos se arranjam pela largura que recebem (container queries), não pela da tela.

**Calendário de gastos** (bloco largo): card "Calendário de gastos", legenda "Despesas pagas por dia; no cartão, na data da compra" e o link "Ver relatório". O mapa de calor do relatório (§6.12, com "Ver como tabela") mostra o mês do Início (`?mes=`); ao lado, ou embaixo quando falta largura, ficam "Gasto no mês", "Média por dia" e "Dia mais caro" (somem num mês que ainda não começou). Tocar num dia abre Relatórios › Calendário nesse dia (`dia=`, com o `mes=` do Início). Mês sem despesas → convite compacto: "Nenhuma despesa em {mês}", "Quando houver, o calendário mostra os dias de mais gasto." e "Adicionar despesa".

**Blocos dos relatórios** (05/11/2026). Os quatro reaproveitam as consultas e os gráficos dos Relatórios (§6.12), com o mês do Início (`?mes=`), e entram fora do padrão, com "Novo" por 30 dias. Cada um tem título, legenda e um link `ghost` de 44 px à direita. Quando não há o que mostrar, um convite compacto toma o lugar do gráfico (ícone, título, uma linha e o próximo passo). O link "Ver relatório" leva o mês do Início: em outro mês, o relatório abre naquele mês (`?mes=`, §6.12); no mês atual e num mês futuro, o link é o de hoje. **Mês anterior ao primeiro registro** (o primeiro lançamento não excluído ou a criação da conta mais antiga, o que vier antes): os quatro blocos viram "Sem registros em {mês de ano}" / "Seus registros começam em {mês de ano}." e o botão `tonal sm` "Ir para {mês de ano}" volta ao Início naquele mês, sem o botão de lançar (ícone de calendário riscado). Nunca vale para o primeiro mês, o atual nem um futuro. No modo discreto, além dos valores, a fala dos gráficos diz "valor oculto".

- **Fluxo de caixa** (largo): legenda "Saldo dia a dia, sem os cartões" ("…, sem cartões e caixinhas" quando há uma caixinha no patrimônio), link "Ver relatório" para Relatórios › Fluxo no mesmo mês. Mostra a legenda Realizado/Previsto, o gráfico do saldo com o dia escolhido e "Ver como tabela", e só o indicador "Menor saldo previsto" ("Menor saldo" num mês passado): o saldo de hoje e o previsto para o fim do mês já estão no Saldo. O indicador fica embaixo do gráfico e ao lado dele quando o bloco tem uma linha inteira do desktop (container query). Num mês futuro, a nota "Só entra o que já está agendado…". Sem conta para o dia a dia → "Nenhuma conta para o dia a dia" / "O fluxo de caixa acompanha o saldo das suas contas, sem cartões e caixinhas." e "Ver contas"; mês sem nada → "Nenhum lançamento em {mês}" / "Quando houver, o gráfico mostra o saldo dia a dia." e "Adicionar lançamento".
- **Para onde foi o dinheiro** (estreito): legenda "Despesas pagas em {mês}, até hoje" (no mês atual) ou "Despesas pagas em {mês}", o total do mês e o ranking do relatório com as 5 maiores categorias e "Outras N categorias". "Ver relatório" leva a Relatórios › Categorias do mês (`?periodo=1`, com `&mes=` fora do mês atual); o "Ver no extrato" saiu. Sem despesa paga (um mês futuro também) → "Nenhuma despesa paga em {mês}" / "Quando houver, o ranking mostra para onde foi o dinheiro." e "Adicionar despesa".
- **Receitas × despesas por mês** (estreito): legenda "Últimos 6 meses, até {mês}", legenda de cores e as colunas do relatório, com o mês escolhido em cima e a nota do mês parcial ("* outubro parcial (até o dia 14 de 31)"). Num mês futuro, a série termina no mês atual. Link "Ver relatório" para a Visão geral em 6 meses, até o mês do Início (`&mes=`). Seis meses sem nada → "Nenhuma receita ou despesa em 6 meses" / "Com seus lançamentos, o gráfico compara o que entrou e saiu a cada mês." e "Adicionar lançamento".
- **Patrimônio** (estreito): o card da Visão geral (valor, variação em 6 meses e sparkline), com a legenda "no fim de {mês}" num mês passado ou "hoje". Num mês futuro, termina hoje. Link "Ver relatório" para Relatórios › Patrimônio em 6 meses, até o mês do Início (`&mes=`). Tudo zerado → "Seu patrimônio está zerado" / "Com saldo nas contas, a evolução dos últimos meses aparece aqui." e "Ver contas".

- **Quanto dá para gastar por dia** (largo, 10/11/2026; sem orçamento e na horizontal desde 11/11/2026): sempre de hoje até o fim do mês financeiro, qualquer que seja o `?mes=` (a legenda diz "Contas do dia a dia, até 30/nov", ou "A partir de hoje, até 30/nov" em outro mês). O cálculo usa só o saldo de hoje das contas para gastar e as despesas e receitas agendadas (o saldo previsto, doc 03 §12; as faturas de cartão contam como despesa agendada); o orçamento não entra. Título em `text-balance`. Abaixo, uma faixa de até 14 cartões lado a lado, um por dia ("Hoje", "Amanhã", depois o dia da semana curto, "sex"; a data, "13 nov", em outra linha; o valor em `callout` negrito, com " por dia" só para leitor de tela). Hoje vem primeiro, com `aria-current="date"`, fundo `--primary-soft` e rótulo e data em `--on-primary-soft`; o rótulo "Hoje" já diz, a cor não é a única pista. A faixa é uma região rolável com nome "Quanto dá para gastar em cada dia" e `tabindex="0"` (o teclado rola com as setas, WCAG 2.1.1, foco `--focus`), com encaixe (`snap-x`) e sem barra de rolagem; só ela rola, a página nunca (a 360 px o próximo cartão aparece cortado). Cartões de `6.25rem` (em `rem`, crescem com o texto a 200%) e da mesma altura; o valor encolhe até a metade antes de cortar. No último dia do mês há um cartão só. Rodapé: "Pelo saldo e pelo agendado, sem o orçamento, dividido pelos dias que faltam." Link "Ver fluxo" para Relatórios › Fluxo. Estados: **não sobra** ("Não sobra para gastar até 30/nov" com "Faltam R$ X para as contas agendadas.", ou "O saldo previsto chega a zero antes de 30/nov." com saldo de hoje positivo, ou "Sem saldo nas contas para gastar até 30/nov."; sem faixa); **sem contas para gastar**: convite "Nenhuma conta para o dia a dia" / "A conta de quanto dá para gastar usa o saldo das suas contas, sem cartões e caixinhas." e "Ver contas". Modo discreto: o `Money` mascara. O card Orçamento não tem nota sobre o saldo previsto (a ideia de avisar no Orçamento foi tirada em 11/11/2026). A novidade "Quanto dá para gastar por dia" (`when: { flag: "inicio_personalizavel" }`) fica só em Ajustes › Novidades.

- **Maior gasto da semana** (estreito, 13/11/2026): as 3 maiores despesas pagas dos últimos 7 dias (hoje e os 6 dias antes), qualquer que seja o `?mes=`. Título "Maior gasto da semana" (`headline`), legenda "Pagas nos últimos 7 dias" (`caption`, `--text-3`) e o link "Ver no Extrato" para `/extrato?tipo=despesa`; o cabeçalho quebra de linha (`flex-wrap`) com texto grande. Cada linha é um `TransactionRow` (doc 02 §5.7) com valor negativo e cor de despesa, subtítulo "Categoria · dia" (`Hoje`, `Ontem`, `qua, 11 nov`; "Sem categoria" quando não há) e a parcela ("parcela 2 de 5") ou a marca de recorrente quando houver. A linha abre o Extrato do mês do lançamento (a semana pode atravessar a virada do mês financeiro), com a conta, o tipo despesa e o começo da descrição (`q`). O nome acessível diz o dia uma vez só: o `TransactionRow` não repete o dia quando o `subtitle` já o traz. Entram compras no cartão, parcelas (o valor da parcela) e recorrências; ficam fora transferências (o pagamento da fatura e a caixinha incluídos), ajustes de saldo, receitas, pendentes e apagados. Despesa de grupo conta pelo valor cheio; nada das tabelas compartilhadas é lido. Ordem: maior valor, depois o dia mais recente, depois o lançado por último. Estado vazio: convite "Nenhum gasto nos últimos 7 dias" / "Quando você lançar uma despesa, as maiores aparecem aqui." e "Adicionar gasto". Modo discreto: o `Money` mascara os valores (descrição e categoria seguem visíveis). Skeleton `h-75.5 @min-[19.125rem]:h-73 @min-[20rem]:h-67.5` (medido com 3 linhas; com menos, o bloco carregado fica mais baixo e o salto é aceito). Novidade `novidade-inicio-maior-gasto-semana` (`when: { flag: "inicio_personalizavel" }`), só em Ajustes › Novidades.
- **Comparado ao mês passado** (estreito, 14/11/2026): o gasto pago do mês em tela contra o mesmo ponto do mês financeiro anterior (doc 03 §12: dias 1..E, com E contando hoje; o fim do mês anterior limita a janela, então nunca invade o período seguinte). Segue o `?mes=`: num mês passado, o mês inteiro contra o anterior inteiro; num mês futuro, convite "{Dezembro} ainda não começou". Título "Comparado ao mês passado", legenda "Despesas pagas até hoje, contra 1/out – 14/out" (ou "Despesas pagas em novembro, contra outubro inteiro") e o link "Ver relatório" para `/relatorios/categorias`, no mesmo mês. O total vem em `Money` com um chip: "{R$ 230,00} a mais que em outubro (+17,5%)", "{…} a menos que em outubro (−12,0%)", "Igual a outubro" ou "Sem despesas pagas em outubro até esse ponto" (sem base, o bloco mostra só isso). Gastar mais não fica vermelho ("sem culpa", §10.2): a queda usa `bg-primary-soft`, o resto `bg-surface-2`; o ícone é `aria-hidden` e o texto diz a direção. Abaixo, "Em outubro, até 14/out: {R$ …}" e a lista "O que mais mudou": até 3 categorias principais (`CategoryIcon`, nome, "{R$} em novembro · {R$} em outubro", a diferença com sinal e o percentual, ou "Nova no mês" sem gasto antes), com a diferença lida em texto ("a mais/a menos que em outubro"); a linha leva ao detalhe da categoria no mesmo mês (alvo de 44 px), e "Sem categoria" não tem link. Só entram categorias com diferença de R$ 10,00 ou mais; sem nenhuma, "Nenhuma categoria mudou mais de R$ 10,00." Conta o que "Para onde foi o dinheiro" conta (despesas pagas por competência; fora transferências, ajustes, receitas, pendentes e apagados; estorno reduz e a categoria não passa de 0); despesa de grupo conta pelo valor cheio e nenhuma tabela compartilhada é lida. Modo discreto: todo valor passa pelo `Money`; os percentuais seguem visíveis. Sem nada nas duas janelas: convite "Nenhuma despesa para comparar" com "Adicionar despesa". Skeleton `h-141 @min-[19rem]:h-125 @min-[21.75rem]:h-116 @min-[35rem]:h-99.5` (medido com 3 categorias; com menos, o salto é aceito). Novidade `novidade-inicio-comparado-mes-passado` (`when: { flag: "inicio_personalizavel" }`), só em Ajustes › Novidades.

- **Parcelas a terminar** (estreito, 13/11/2026): as 3 compras parceladas que acabam primeiro, qualquer que seja o `?mes=`. Entra a compra com ao menos uma parcela pendente (atrasada conta); compra toda paga ou toda apagada some. O andamento sai das linhas de `transactions`, não de `installment_plans` (que não segue parcelas pagas, editadas ou apagadas). Título "Parcelas a terminar" (`headline`) e legenda "Saem R$ 450,00 por mês" (`caption`, `--text-3`; a frase é "Saem " + `Money` + " por mês", para o modo discreto mascarar só o valor). "Por mês" é a soma, de todas as compras (não só as 3 mostradas), do valor da próxima parcela de cada uma. Ordem: acaba primeiro, depois o menor restante, depois o id da compra. Cada linha é um link (alvo mínimo de 64 px, foco `--focus` por `after:`): descrição da próxima parcela (`body`, cortada com reticências), subtítulo "parcela 3 de 6 · faltam 4 · acaba em março de 2027" (`caption`, quebra de linha, nunca cortado) e, à direita, "falta pagar" (`micro`, `--text-3`) com o restante em `headline`. Última parcela: "última parcela · março de 2027". Nome acessível: "{descrição}, parcela 3 de 6, faltam 4 parcelas, acaba em março de 2027, restam R$ 400,00; abrir no Extrato" ("falta 1 parcela, a última, em …" no singular). A linha abre o Extrato do mês da próxima parcela, na conta, só despesas pendentes, com o começo da descrição (`q`). Com mais de 3 compras, rodapé "e mais N compras parceladas" ("e mais 1 compra parcelada"), sem link. Sem link no cabeçalho: o Extrato não tem filtro de parcelados. Estado vazio: convite "Nenhuma parcela em aberto" / "Quando você parcelar uma compra, o que falta pagar aparece aqui." e "Adicionar gasto" (o botão não abre já em Parcelar). Modo discreto: o `Money` mascara. Skeleton `h-89` (356 px medidos a 360, 430 e 1280 px com 3 linhas; com menos linhas o bloco carregado fica mais baixo e o salto é aceito). Novidade `novidade-inicio-parcelas-a-terminar` (`when: { flag: "inicio_personalizavel" }`), só em Ajustes › Novidades.

- **Assinaturas do mês** (estreito, 14/11/2026): as despesas que se repetem todo mês, a partir de hoje, qualquer que seja o `?mes=`. Não há marca de "assinatura": vale a recorrência de despesa mensal (a cada 1 mês) ativa, sem pausa, com a conta não arquivada e um próximo débito (aluguel e curso contam; anuais, semanais e "a cada 2 meses" ficam fora). Título "Assinaturas do mês" (`headline`) e legenda "Somam R$ 329,30 por mês" (`caption`, `--text-3`; a soma é de todas, não só das 5 mostradas). Até 5 linhas, ordenadas pelo próximo débito, depois o maior valor. Cada linha é um link com alvo de 64 px: a descrição (truncada com reticências) e o subtítulo "Conta · próximo débito hoje | amanhã | em 3 dias | em 20/nov" ("em 5/jan/27" em outro ano; o subtítulo quebra, nunca é cortado); à direita o valor (`headline`) e, quando a próxima cobrança custa mais do que a última antes do mês financeiro atual, o selo `warning` com o ícone `TrendingUp` e "subiu R$ 5,00" (cor nunca sozinha). O selo vale o mês inteiro e some no seguinte; série nova ou queda de preço não têm selo. A referência segue a divisão de "Este e os próximos" (a regra velha, que termina na véspera). Nome acessível da linha: "Streaming, R$ 44,90 por mês, próximo débito em 20 de novembro de 2026, Conta Principal, subiu R$ 5,00 desde outubro; abrir no Extrato". A linha abre o Extrato do mês do próximo débito, nas despesas pendentes da conta, com o começo da descrição (`q`). Rodapé sem link quando passa de 5: "e mais 2 assinaturas" (", 1 subiu" / ", 2 subiram" com aumentos escondidos). Estado vazio: convite "Nenhuma assinatura por aqui" / "Lance uma despesa com Repetir “Todo mês” e ela aparece aqui, com o próximo débito." e "Adicionar gasto". Modo discreto: o `Money` mascara valores e selo. Skeleton `h-129.5 @min-[24rem]:h-116.75 @min-[27rem]:h-109.75` (medido com 5 linhas e rodapé; com menos, o salto é aceito). Novidade `novidade-inicio-assinaturas` (`when: { flag: "inicio_personalizavel" }`), só em Ajustes › Novidades.

  **Por conta (12/11/2026).** Com 2 ou mais contas para gastar, cada cartão do dia traz, abaixo do total, uma linha por conta mostrada (padrão: todas): ponto `cat-*` da conta (`aria-hidden`, alinhado à primeira linha do nome), nome em `caption` `--text-3` e valor por dia em `caption` negrito, ou "Não sobra" (`--text-3`) sempre que o valor da conta é 0. O total ganha o rótulo visível "Total" acima, só quando há linhas; o leitor de tela ouve "Hoje, 12 nov: R$ 85,00 por dia no total; Conta principal: R$ 50,00; Reserva: Não sobra;". Com linhas, o cartão é mais largo (`w-34`, 8,5 rem: "Conta principal" cabe e um pedaço do próximo cartão aparece a 360 px) e os cartões têm a mesma altura; a 200% de texto um cartão pode passar da largura da faixa e a faixa rola (aceito). Rodapé com linhas: "Pelo saldo e pelo agendado, sem o orçamento, dividido pelos dias que faltam. Em cada conta, o saldo e o agendado dela, com as faturas que ela paga." As linhas podem não somar o total (os mínimos caem em dias diferentes e cada conta arredonda para baixo): o total é o número do bloco. Fatura que nenhuma conta para gastar paga (sem conta escolhida nem pagamento anterior, ou paga por caixinha) entra só no total, com a nota "A fatura do {cartão} entra só no total." e o link "Escolher a conta que paga" (`/cartoes/{id}`), ou, com 2 ou mais, "As faturas de {n} cartões entram só no total." e "Ver contas"; a nota só aparece com linhas visíveis e não está no skeleton. Botão ghost "Escolher contas" (44 px, ícone `ListChecks`) no rodapé, com 2 ou mais contas e fora do estado "não sobra" (que não tem linhas). A folha **Contas no bloco** (sheet no celular, diálogo de 560 px a partir de `md`, padrão de "Personalizar o Início") tem um interruptor por conta (nome e tipo), "Salvar"/"Salvando…", a descrição "Escolha as contas que aparecem em cada dia. Esconder uma não muda o total." e, com tudo desligado, "Sem contas marcadas, cada dia mostra só o total."; toast "Contas do bloco salvas." (action `saveDailySpendAccountsAction`, atrás da flag `inicio_personalizavel`). Os avisos "Próxima receita" e "Resumo do dia" seguem com o total. Contas novas recebem todas a mesma cor padrão e o "Não sobra" por conta continua visível no modo discreto (ficam para depois).

  **Benefício (12/11/2026).** Cada benefício não arquivado (vale-refeição, vale-alimentação; doc 03 §12) tem linha própria em cada cartão do dia, mesmo com uma conta só para gastar e qualquer que seja "Incluir no patrimônio", sempre abaixo das contas e separada por um fio (`border-t`) e pela legenda visível "Fora do total" (`caption`, `--text-3`). A linha é igual às das contas (ponto `cat-*`, nome, valor por dia ou "Não sobra"), nunca soma no total, no Saldo, no previsto, no Fluxo nem nos avisos. O leitor de tela ouve "Hoje, 12 nov: Total R$ 85,00 por dia; Conta principal: R$ 50,00; Fora do total: Vale-refeição: R$ 32,00;". Rodapé com benefício: o texto de antes (com a frase das contas só quando há linhas de contas) mais " O benefício fica fora do total." ou, com 2 ou mais, " Os benefícios ficam fora do total.". "Escolher contas" aparece com 1 conta ou mais (benefício conta) e a folha lista o benefício com a legenda "Benefício · fora do total". Só benefício, sem conta para gastar: continua o convite "Nenhuma conta para o dia a dia". Total zerado com dinheiro no benefício: "Não sobra para gastar até {dia}" e, abaixo, a faixa de dias com a linha do benefício. Skeleton: `dailySpendExtraRem` soma a seção do benefício (`BENEFITS_AFTER_ACCOUNTS_PX` = 33 px depois das contas, `BENEFITS_ALONE_PX` = 22 px sozinho, medidos no navegador; 24 dava 2 px a menos) e o rodapé do benefício vem de `DAILY_SPEND_BENEFITS` (`--daily-spend-foot`); o bloco que chega com o benefício salta cerca de 52 px (aceito).

No desktop, só o Fluxo de caixa ocupa uma linha inteira (e divide a linha com o Saldo a partir de `xl` quando vem logo depois dele); os estreitos entram nas colunas como os outros. O skeleton de cada um segue a largura do bloco (§5.17) e a fase do mês (passado, atual, futuro) nos blocos cujo texto muda com ela: Fluxo, os dois cards de Receitas e Despesas, Orçamento (some "N% do mês decorrido"), Para onde foi o dinheiro e Receitas × despesas por mês (some a nota do mês parcial). O de "Quanto dá para gastar por dia" (altura medida de 262 a 204 px conforme o bloco alarga, pois só o título e o rodapé quebram linha) não segue o mês: a faixa rola dentro do bloco, então o número de cartões não muda a altura; os estados sem faixa ("não sobra", convite, erro) são mais baixos e o salto ao carregar é aceito. O de "Para onde foi o dinheiro" tem a altura do ranking cheio (5 categorias e "Outras"): no começo do mês, com menos categorias, o bloco carregado fica mais baixo que o skeleton, o que foi aceito.

O skeleton de "Quanto dá para gastar por dia" recebe o número de linhas por conta (`HomeBlockFrame` › `dailySpend: { lines, chooser }`, variável CSS `--daily-spend-extra`): soma a altura medida de cada linha e a faixa do botão "Escolher contas", para o bloco carregar sem salto. A nota das faturas sem conta não entra nele.

**Flag desligada**: o Início é o padrão do app (a página nem lê a escolha), sem botão e sem a seção em Preferências; o servidor recusa salvar. A escolha salva fica guardada para quando a flag voltar.

**Dica e novidade** (§6.16, ambas com `when: { flag }`): a dica "Seu Início, do seu jeito" aponta para a linha de Preferências (o Início já tem 3 dicas, e o botão fica abaixo da dobra); a novidade "Monte o seu Início" fica só em Ajustes › Novidades, com o link "Personalizar o Início" para Preferências. A novidade "Mais blocos para o Início" (05/11/2026; "Agora dá para trazer o fluxo de caixa, as categorias, receitas × despesas e o patrimônio para o Início.") segue o mesmo caminho.

**Bloco "Compartilhado"** (`shared`, estreito, último do padrão, desde 12/11/2026): só com a flag `financas_compartilhadas` e pelo menos um grupo ou convite; sem isso não renderiza nada e o lugar fecha (fallback `null`, para não pular). Mostra até 3 grupos com a frase do saldo, a linha do convite pendente ("2 convites para você.") e "Ver tudo", que leva a `/compartilhado`.

### 6.4 Extrato

**Objetivo**: encontrar e conferir lançamentos rapidamente.

**Vence em dia não útil** (flag `alerta_dia_nao_util`, 12/11/2026): a despesa pendente que vence em sábado, domingo, feriado nacional ou dia sem expediente bancário mostra a nota da §5.7 em "Agendados" e nos grupos por dia, e o selo "Prazo até …" (âmbar) entre o vencimento e o próximo dia útil. O detalhe (§6.6) explica.

```
┌────────────────────────────────────┐
│ Extrato                     [⌕][⚙] │  título grande
│ [ outubro ▾ ][ Contas ▾ ][ Categ.▾ ]│  chips de filtro (roláveis)
│ ┌────────────────────────────────┐ │
│ │ Entradas     Saídas     Saldo  │ │  resumo do filtro atual
│ │ R$ 7.952,30  R$ 1.544,98 +6.407│ │
│ └────────────────────────────────┘ │
│ Hoje · ter, 14 out        −R$ 87,40│  DayHeader fixo
│ (🛒) Supermercado         −R$ 64,50│
│      Mercado · Conta principal     │
│ (🚗) Uber                 −R$ 22,90│
│      Transporte · Cartão Principal │
│ Ontem · seg, 13 out       −R$ 37,90│
│ (♥) Farmácia              −R$ 37,90│
│ sáb, 11 out               …        │
│ ◄◄ (🍽) Restaurante  −R$128 [Excluir]│  linha deslizada
└────────────────────────────────────┘
```

- **Busca**: o ícone expande um campo no topo (foco automático, teclado com `enterKeyHint="search"`); antes de digitar mostra buscas recentes e atalhos ("Pendentes", "Com anexo", "Parcelados"). Resultados destacam o trecho encontrado em `--primary-soft`. Tolerante a acentos e erros ("farmacia" encontra "Farmácia").
- **Filtros** (como ficou; a folha `⚙` de seleção múltipla do desenho não existe): chips roláveis abaixo do mês (§5.12) — **Conta**, **Categoria**, **Tipo**, **Pendentes** (liga e desliga) e, com algum ativo, **Limpar**.
  - Conta, Categoria e Tipo abrem cada um a **sua** folha, de **escolha única** ("Filtrar por conta", "Filtrar por categoria", "Filtrar por tipo") com "Todas as contas/categorias", "Todos os tipos" no topo. Tocar numa opção fecha a folha e aplica na hora; a lista escurece até recarregar. Escolher o que já está marcado só fecha a folha. Tocar no próximo chip, ou em outra linha, enquanto a folha anterior ainda sai abre a nova folha e ela fica aberta (a folha ignora o toque que começou antes de ela abrir); Voltar a fecha e fica no Extrato.
  - Contas: todas, inclusive cartões e arquivadas ("Investimento · arquivada"). Filtrar uma conta traz as transferências que saíram dela e as que entraram nela.
  - Categorias: em Despesas e Receitas; cada subcategoria vem logo depois da mãe, como "Mercado › Feira". **Filtrar a mãe traz as filhas, arquivadas também** (a Padaria arquivada continua no total do Mercado). As categorias arquivadas ficam num grupo **"Arquivadas"** no fim ("Mercado › Padaria"), como as contas arquivadas. Uma categoria arquivada também filtra pela URL (o link do ranking dos Relatórios e o do insight levam a ela): o chip mostra "Padaria (arquivada)" e o leitor de tela lê "Categoria: Mercado › Padaria (arquivada)".
  - **Busca nas folhas**: Conta e Categoria, com mais de 8 opções (§4.4), ganham um campo "Buscar conta" / "Buscar categoria" no topo, sem acento e pelo nome inteiro ("mercado" traz a mãe e as filhas). "Todas as …" fica sempre no alto. Sem resultado: "Nenhuma categoria com “{busca}”." (`role="status"`). A busca começa vazia a cada abertura e a lista mantém a altura enquanto se estreita. Tipo nunca tem busca.
  - **"Limpar"** fica **fora** da linha rolável, no fim da linha de chips, sempre dentro da tela (a 360 e 430 px, com os quatro filtros, a 100% e a 200%); o esmaecido da direita fica antes dele e indica que há mais chips.
  - Chip ativo: `--primary-soft` com o nome escolhido e um "×" ("Limpar filtro de conta"). Depois do "×" o foco fica no próprio chip; depois de "Limpar" (ou "Limpar filtros", no vazio) vai para o primeiro chip.
  - Tudo fica na URL (`conta`, `categoria`, `tipo`, `status`, `q`, junto com `mes`): recarregar mantém, cada filtro escolhido é um passo no histórico (**Voltar desfaz o filtro**) e Voltar com a folha aberta só fecha a folha (§4.4).
  - Id que não é da pessoa, ou inválido, é ignorado pelo servidor e não acende chip nem "Limpar".
  - Ainda não há filtro de período (o mês faz esse papel), tags e valor, nem contagem ao vivo.
- **Resumo** reflete exatamente o filtro aplicado. Com texto grande, as estatísticas quebram de linha (rótulo em cima, valor embaixo) em vez de cortar o valor; o desenho não tem divisórias entre elas. Valores a partir de R$ 1 mi a 200% em 360 px cabem: o `Money` encolhe (§5.4).
- **Agrupamento por dia** com total do dia. Pendentes futuros aparecem em seção própria no topo: "Agendados (3)" recolhível.
- **Seleção múltipla**: a TopBar vira "3 selecionados" com ações Categoria, Marcar pago, Excluir; o total dos selecionados aparece num rodapé.
- **Rolagem infinita** com keyset (50 por página); ao chegar ao fim, "Isso é tudo de outubro" + botão "Ver setembro".

### 6.5 Nova transação (fluxo mais importante)

**Meta**: despesa comum salva em ≤ 5 s, com no máximo 3 toques além do valor.

```
┌────────────────────────────────────┐
│               ▔▔▔▔                 │  alça
│ [✕]       Nova transação           │
│ ┌──────────┬──────────┬──────────┐ │
│ │▣ Despesa │  Receita │Transfer. │ │  segmented
│ └──────────┴──────────┴──────────┘ │
│                                    │
│            R$ 64,50▍               │  amount-input 48 px
│          120 + 35,50 (quando há op)│
│                                    │
│ [Descrição (opcional)            ] │
│ (🛒Mercado✓)(🍽Restaurantes)(🚗Tr..│  categorias mais usadas + "Todas"
│ [📅 Hoje] [🏦 Conta principal] [✓ Pago]
│ Mais opções  ▾  parcelar · repetir · anexo
│ ┌──────┬──────┬──────┬──────┐      │
│ │  1   │  2   │  3   │  ⌫   │      │
│ │  4   │  5   │  6   │  +   │      │
│ │  7   │  8   │  9   │  −   │      │
│ │  ,   │  0   │  00  │  =   │      │
│ └──────┴──────┴──────┴──────┘      │
│ [        Salvar despesa          ] │  primary lg
└────────────────────────────────────┘
```

Regras de comportamento:

| Elemento | Regra |
|---|---|
| Abertura | sheet de altura total em < 100 ms (componente pré-carregado no idle); foco no valor; teclado próprio visível |
| Tipo | trocar de tipo **mantém** o valor; Transferência troca a linha de categorias por "De" e "Para" (contas) |
| Valor | §5.5. A cor do valor acompanha o tipo: despesa `--text`, receita `--income`, transferência `--transfer` |
| Descrição | opcional (se vazia, salva com o nome da categoria). Autocomplete do histórico ao digitar: escolher uma sugestão preenche categoria e conta (e o último valor, se o campo estiver vazio). Tocar no campo esconde o teclado próprio e abre o do sistema; tocar no valor volta |
| Categoria | 6 mais usadas para o tipo, ordenadas por frequência dos últimos 90 dias, + chip "Todas" (sheet com grade 4 colunas, busca e subcategorias). Os chips mostram só o nome ("Feira"); na grade "Todas" uma subcategoria mostra a mãe pequena em cima do nome ("Mercado" e "Feira") e o nome acessível é "Mercado › Feira". A busca é a mesma das folhas do Extrato (sem acento, pelo nome inteiro). Se uma regra aprendida casar com a descrição, a categoria vem selecionada com o selo "sugerida" |
| Data | "Hoje" por padrão; "Ontem"; ícone de calendário abre DatePicker. Data futura → status vira **Agendado** automaticamente (com aviso discreto) |
| Conta | última usada, **nunca uma caixinha nem um benefício** (despesa e receita começam na última conta que não é caixinha nem benefício, senão na primeira conta para gastar; a origem da transferência segue a mesma regra; a importação de extrato também). Despesa ou receita direto na caixinha é permitida, escolhendo-a à mão; para rendimento, o caminho é "Ajustar saldo". Ao escolher cartão de crédito, aparece "Entra na fatura de novembro" (calculado pelo fechamento) |
| Pago | switch, ligado para datas ≤ hoje |
| Mais opções | **Parcelar**: stepper 2–72 com prévia "6x de R$ 99,98" (e "1ª parcela R$ 100,00" se houver sobra de centavos). **Repetir**: Nunca · Toda semana · Todo mês · Todo ano · Personalizado; término: nunca / data / após N vezes. **Tags**, **Nota**, **Anexo** (câmera ou galeria, miniatura com remover) |
| Salvar | rótulo acompanha o tipo ("Salvar despesa" / "Salvar receita" / "Transferir"). Desabilitado só com valor 0 e com o motivo visível ("Digite um valor"). Ao salvar: fecha, toast "Despesa de R$ 64,50 salva · Desfazer", vibração curta, linha aparece no extrato com realce |
| Continuar adicionando | caixa "Adicionar outra em seguida" (lembrada): mantém a sheet, limpa valor e descrição, mantém data e conta |
| Fechar | arrastar, `✕` ou voltar. Se houver conteúdo, guarda **rascunho** por 10 min; ao reabrir: "Rascunho restaurado · Limpar". Sem diálogo de confirmação |
| Desktop | diálogo de 480 px, sem teclado na tela; `Enter` salva; `Tab` percorre na ordem visual |

### 6.6 Detalhe e edição do lançamento

- Topo: ícone da categoria 56 px, valor `display`, descrição `title-3`, status como selo.
- A categoria aparece inteira ("Mercado › Padaria"). Ao editar, o select de Categoria é uma árvore ("Mercado", "Mercado › Feira") só com as categorias ativas do tipo; se a do lançamento está arquivada, ela continua na lista como "Mercado › Padaria (arquivada)", em vez de aparecer como "Sem categoria".
- **Dia não útil** (flag `alerta_dia_nao_util`, despesa pendente): linha "Dia não útil" empilhada depois de "Data", com a frase inteira e as datas por extenso: "Vence num sábado, dia não útil. O pagamento costuma passar para o próximo dia útil, segunda, 16 de novembro. Se preferir não esperar, pague até sexta, 13 de novembro." Num feriado, "Vence num feriado (Consciência Negra)."; em 31/12, "Vence num dia sem expediente bancário (31/dez)." No último dia útil antes, a última frase é "Se preferir não esperar, pague hoje."; passado esse dia, sai. Depois do vencimento, "Venceu …". O status do topo é "Prazo até seg, 16 nov" (âmbar) entre o vencimento e o próximo dia útil. Diz "costuma", nunca "sem multa": a regra vale para boleto e fatura, não para toda conta.
- Lista agrupada (estilo ajustes) com linhas editáveis: Categoria, Conta, Data, Status, Tags, Nota, Anexo (miniatura que abre em tela cheia com zoom por pinça).
- **Parcelado**: bloco "Parcela 2 de 6 · total R$ 599,88" com linha do tempo horizontal das 6 parcelas (pagas preenchidas, futuras vazadas) e ação "Antecipar parcelas".
- **Recorrente**: "Repete todo mês no dia 16" + "Editar recorrência". Ao salvar mudanças, sheet de escopo: **Só este** · **Este e os próximos** · **Todos**.
- **Dividir** (flag `financas_compartilhadas`, só em despesa e só com algum grupo ativo): botão `secondary` com `Users` acima de Duplicar. Abre o passo "Dividir despesa" na mesma folha, com o grupo (select, se houver mais de um), "Grupo: Casa. Só a descrição, o valor e a data vão para o grupo." e o editor de divisão (§6.18); a despesa vai "paga por você". Depois de dividir, a folha volta ao detalhe e mostra a linha **"Dividida em Casa"**, que leva ao grupo; o lançamento em si não muda e não pode ser dividido duas vezes.
- Ações no rodapé: Duplicar (`secondary`), Excluir (`ghost` em `--danger`, com Desfazer).

### 6.7 Contas

- Herói: **Patrimônio líquido** (`display`) = soma de todas as contas incluídas, cartões como passivo.
- Grupos: **Disponível** (corrente, dinheiro) · **Benefícios** · **Caixinhas** · **Investimentos** (com rendimento configurado: "102% do CDI") · **Cartões de crédito** (fatura atual + limite disponível) · **Arquivadas** (recolhido). Cada grupo com subtotal.
- **Caixinha** (tipo novo, ícone `vault` "Cofre", cor padrão `cat-6`, nome sugerido "Caixinha"): conta no patrimônio, fora do Saldo em contas e do que dá para gastar (doc 03 §12). O herói com Caixinhas mostra 4 grupos em grade `auto-fit`; a linha de uma caixinha fora do patrimônio diz "Caixinha · fora do patrimônio". Criar: `/contas/nova?tipo=caixinha` (o seletor de tipo ganha o chip "Caixinha"), com a nota "Para guardar dinheiro à parte. Conta no patrimônio, mas fica fora do Saldo em contas e do que dá para gastar.", sem limite nem ciclo, saldo inicial sem negativo, botão "Criar caixinha" e toast "Caixinha criada". "Incluir no patrimônio" explica: "O saldo entra no patrimônio, mas não no Saldo em contas."
- **Benefício** (tipo novo, 12/11/2026; ícone `utensils-crossed` "Talheres cruzados", cor padrão `cat-4`, nome sugerido "Vale-refeição"): vale-refeição ou vale-alimentação. Fora do Saldo em contas e do que dá para gastar (doc 03 §12) e, por padrão, do patrimônio: "Incluir no patrimônio" começa desligado ao criar (e só acompanha o tipo enquanto a pessoa não mexe nele; Mudar o tipo nunca o muda). A linha diz "Benefício · fora do patrimônio" e o card do carrossel leva o selo "Benefício". Criar: `/contas/nova?tipo=beneficio`, com a nota "Para vale-refeição ou vale-alimentação. Fica fora do Saldo em contas e não paga fatura de cartão." (também sob o seletor de tipo de Editar), botão "Criar benefício", toast "Benefício criado" e "Benefício não fica com saldo negativo.". Detalhe: "Não entra no Saldo em contas do Início.". Nunca paga fatura (fora de "Pagar com" e de "Conta que paga a fatura"; o servidor recusa) e nunca é a conta com que a Nova transação abre; despesa e receita nele são permitidas e contam nas categorias. Quem já tem uma conta de vale: Editar › Mudar o tipo.
- Poupança e Investimento continuam contando como dinheiro para gastar (decisão do dono, 06/11/2026). Uma meta pode ser ligada a uma caixinha.
- **Mudar o tipo**: em Editar, uma conta que não é cartão troca de tipo entre os tipos que não são cartão (cartão não muda de tipo, nem vira outro); o ícone acompanha se ainda era o padrão do tipo antigo.
- Reordenar por arrastar (alça à direita, modo "Editar").
- **Detalhe da conta**: saldo `display`, gráfico de área de 6 meses (série única), ações em linha (Transferir · Ajustar saldo · Editar), extrato da conta. Na caixinha, a legenda "Não entra no Saldo em contas do Início." e as ações **Guardar** (transferência da primeira conta para gastar para a caixinha) e **Resgatar** (da caixinha para ela), alvos de 44 px, que abrem a Nova transação já como transferência. "Ajustar saldo" pede o saldo real e cria um lançamento de ajuste com a diferença, explicando: "Vamos registrar −R$ 12,40 como ajuste."

### 6.8 Cartão de crédito e fatura

```
┌────────────────────────────────────┐
│ ‹ Contas      Cartão Principal  ⋯  │
│ ┌────────────────────────────────┐ │
│ │ Cartão Principal       •••• 4821│ │  cartão em tinta escura sólida
│ │ Limite disponível              │ │
│ │ R$ 3.719,66 de R$ 5.500,00     │ │
│ │ ███████░░░░░░░░░░░░░           │ │
│ └────────────────────────────────┘ │
│ [ set ][• out ][ nov ][ dez ]      │  faturas (rolagem)
│ ┌────────────────────────────────┐ │
│ │ (Aberta)  Fecha em 3 dias      │ │
│ │ R$ 1.380,42                    │ │  title-1
│ │ Fecha 17/out · Vence 25/out    │ │
│ │ [ Pagar fatura ] [Parcelamentos]│ │
│ └────────────────────────────────┘ │
│ 📅 Melhor dia de compra: 17        │
│ LANÇAMENTOS DA FATURA              │
│ 16/out (▶) Streaming  Agendado 44,90│
│ 14/out (🚗) Uber             22,90  │
│ …                                  │
└────────────────────────────────────┘
```

- Estados da fatura (selo com ícone): **Aberta** (`--transfer`), **Fechada** (`--warning`, "Vence em 5 dias"), **Paga** (`--income`, check), **Vencida** (`--danger`).
- **Dia não útil** (flag `alerta_dia_nao_util`, só com saldo em aberto; 12/11/2026): abaixo de "Fecha 17/out · Vence 25/out", caixa no padrão das notas (`rounded-control bg-bg px-3 py-2.5`, `callout` `--text-2`, ícone `calendar-clock` de 20 px `--text-3`) com a mesma frase do detalhe da §6.6. Entre o vencimento e o próximo dia útil a fatura segue "Fechada" (selo e ponto da aba) com "Prazo até seg, 16 nov" no lugar de "Venceu há 1 dia"; depois vira Vencida. Só a apresentação muda: o estado gravado da fatura é o do doc 03 §9.3.
- Limite disponível considera **parcelas futuras** (texto de apoio: "R$ 399,92 comprometidos em parcelas futuras").
- **Pagar fatura** (sheet): valor sugerido = saldo em aberto (editável para pagamento parcial), conta de origem, data. Gera transferência conta → cartão. A conta de origem abre na "Conta que paga a fatura" do cartão (campo de Editar cartão, 12/11/2026: select "Nenhuma" + contas que não são cartão, ajuda "Vem escolhida ao pagar a fatura. Sem conta escolhida, vale a do último pagamento.", erro "Escolha uma conta, não um cartão."); sem ela, na primeira conta da lista. Uma conta arquivada gravada no campo aparece como "Nenhuma". O campo ainda não existe no cartão novo.
- Abas de faturas: mês corrente centralizado ao abrir; ponto colorido indica status.

### 6.9 Planejar › Orçamentos

```
┌────────────────────────────────────┐
│ Planejar                           │
│ [▣ Orçamentos ][ Metas ][Simulador]│
│      ‹  outubro de 2026  ›         │
│ ┌────────────────────────────────┐ │
│ │ R$ 955 disponíveis             │ │  title-1
│ │ R$ 53 por dia · 18 dias        │ │
│ │ ████▒▒▒▒▒▒▒▒▒▒▒│░░░░           │ │  gasto · agendado · ritmo
│ │ ■ Gasto R$ 1.445  ▨ Agendado    │ │
│ │   R$ 2.100  □ Livre R$ 955     │ │
│ └────────────────────────────────┘ │
│ (🍽) Restaurantes    R$ 410 / 400  │
│ ████████████████████████████ ⛔ R$ 10 acima
│ (🛒) Mercado         R$ 640 / 900  │
│ ███████████████░░░│░░░░  ⚠ Acima do ritmo
│ (🚗) Transporte      R$ 180 / 450  │
│ ███████░░░░░░░░░░░│░░░░  ✓ No ritmo │
│ …                                  │
│ [ + Novo orçamento ] [Copiar de set]│
└────────────────────────────────────┘
```

- O herói é o **disponível** (orçado − gasto − agendado), porque é o que orienta decisão.
- Ordenação: estourados → acima do ritmo → no ritmo → agendados; "Ordenar por" no menu.
- Linha de categoria → sheet de edição: MoneyInput, "Repetir nos próximos meses" (ligado), "Acumular sobra para o mês seguinte" (rollover), histórico dos 3 últimos meses como dica ("Média: R$ 870").
- Sem orçamentos: EmptyState com **sugestão automática** baseada na média de 3 meses ("Sugerimos R$ 4.380 em 6 categorias") e botão "Usar sugestão".

### 6.10 Planejar › Metas

- Resumo: "R$ 32.300 guardados de R$ 95.000" + barra fina.
- **Card de meta**: anel 56 px, nome `headline`, "R$ 18.600 de R$ 30.000", selo de status e **linha de projeção**:
  - No ritmo: "No ritmo atual, você chega lá em **ago/2027**." (metas sem prazo também usam este estado)
  - Atrasada: "Para chegar em dez/2027, aporte **R$ 931/mês** (hoje: R$ 800)." + ação "Ajustar plano".
  - Adiantada: "Chega em **ago/2029**, 4 meses antes do prazo."
- **Detalhe**: anel 120 px, gráfico de projeção (linha do saldo projetado em `--primary`, meta como linha horizontal **tracejada** — aqui o tracejado significa "alvo"), aportes realizados como pontos, botão `primary` "Aportar" (sheet: valor + conta de origem; com conta vinculada vira transferência).
- **Caixinhas compartilhadas** (flag `financas_compartilhadas`): depois das metas próprias, a seção "Caixinhas compartilhadas" com os cards das caixinhas dos grupos da pessoa (anel de 56 px, "Casa · R$ 2.900 de R$ 8.000" e a linha de projeção no plural, §6.18); cada card abre a caixinha no grupo. Sem metas próprias e com caixinhas, o vazio da tela fica compacto. A seção não aparece sem a flag nem sem caixinhas.
- **Criar meta**: nome + ícone, valor-alvo, prazo (opcional), conta vinculada (opcional), rentabilidade (sem rendimento · % do CDI · prefixado · IPCA+), aporte mensal planejado → **prévia ao vivo** "Você chega lá em ago/2027".

### 6.11 Planejar › Simulador de juros compostos

**Objetivo**: entender o efeito dos juros compostos com premissas honestas, mexendo em controles simples.

```
┌────────────────────────────────────┐
│ [Quanto terei][Quanto investir][Em quanto tempo]
│ ┌────────────────────────────────┐ │
│ │ Em 10 anos você terá           │ │
│ │ R$ 252.988,52                  │ │  display
│ │ (Líquido de IR R$ 234.450,21)  │ │  chips
│ │ (Em valores de hoje R$ 150.968)│ │
│ │ ████████████▒▒▒▒▒▒▒▒▒▒▒▒       │ │  investido × juros (100%)
│ │ ■ Investido R$ 130.000 · 51%   │ │
│ │ ■ Juros R$ 122.988 · 49%       │ │
│ └────────────────────────────────┘ │
│ ┌ Evolução ──────────────────────┐ │
│ │      ╱▔ juros                  │ │  área empilhada + scrub
│ │  ___╱  investido     │ ano 7   │ │
│ │ 0  2  4  6  8  10 anos         │ │
│ └────────────────────────────────┘ │
│ Valor inicial      [ R$ 10.000  ] ─●──│
│ Aporte mensal      [ R$ 1.000   ] ─●──│
│ Rentabilidade (% a.a.)(% a.m.)(% CDI)(IPCA+)
│                    [ 12,00% a.a.] ≈ 0,95% a.m.
│ Prazo              [ 10 anos ]   ───●─│
│ Avançado ▾ (IR, inflação, reajuste do aporte)
│ 💡 A partir do 6º ano, os juros do mês│
│    passam a render mais que o aporte. │
│ [Salvar] [Comparar] [Compartilhar]  │
│ Simulação com taxa constante; não é  │
│ recomendação de investimento.        │
└────────────────────────────────────┘
```

| Controle | Detalhe |
|---|---|
| Modo | **Quanto terei** (valor futuro) · **Quanto investir** (pede valor-alvo → resultado é o aporte mensal) · **Em quanto tempo** (pede valor-alvo → resultado é a data) |
| Valor inicial / aporte | MoneyInput compacto + slider. Slider com escala **não linear** (passos de R$ 50 até R$ 1 mil, R$ 100 até R$ 10 mil, R$ 1 mil acima) para precisão onde importa |
| Rentabilidade | chips de tipo: % a.a. · % a.m. · % do CDI · IPCA +. Campo com stepper ±0,25. Linha de apoio sempre mostra a conversão ("≈ 0,95% a.m.") e, para CDI/IPCA, o índice usado com fonte e data ("CDI 13,65% a.a. · BCB, 13/out") — editável |
| Prazo | slider 1–50 anos; alternar anos/meses |
| Avançado | aporte no início ou no fim do mês · reajuste anual do aporte (%) · IR: regressivo (renda fixa) / isento (LCI/LCA, poupança) · inflação esperada (IPCA) para "valores de hoje" |
| Resultado | herói `display` com contagem animada; chips "Líquido de IR" e "Em valores de hoje"; barra 100% investido × juros com legenda |
| Gráfico | área empilhada investido (azul) + juros (água), eixo em anos, **scrub** com o dedo: linha vertical + tooltip "Ano 7 · Investido R$ 94.000 · Juros R$ 55.697 · Total R$ 149.697"; marco no mês em que os juros do mês superam o aporte |
| Insights | ponto de virada dos juros; renda mensal estimada sem consumir o capital (em valores de hoje); comparação com poupança quando relevante |
| Tabela | "Ver ano a ano" (acordeão): Ano · Aportado · Juros no ano · Saldo — tabular, com cabeçalho fixo |
| Comparar | até 3 cenários (A, B, C) em abas; o gráfico mostra uma linha de total por cenário (azul, laranja, água) com legenda e rótulo no fim de cada linha |
| Salvar / compartilhar | salva com nome; compartilhar gera a imagem (`/api/og/simulacao`, que exige sessão como toda rota) e a envia como **arquivo** pela Web Share API — nunca um link público; sem suporte a arquivos, baixa a imagem |
| Resumo fixo | ao rolar até os controles, uma barra compacta fixa no topo mostra "R$ 252.988,52 em 10 anos" — o efeito de cada ajuste continua visível |

Recalcula a cada mudança **sem rede** (motor do doc 03 roda no cliente). Valores inválidos (taxa > 100% a.m., prazo 0) exibem erro inline e mantêm o último resultado válido esmaecido.

### 6.12 Relatórios

```
┌────────────────────────────────────┐
│ Relatórios                     [⇩] │
│ [Mês][3M][6M][•12M][Ano][Período…] │  um único filtro para tudo
│ Visão geral  Categorias  Fluxo  Patr│  abas roláveis (sublinhado)
│ ┌──────────┐┌──────────┐┌─────────┐│
│ │Receitas  ││Despesas  ││Poupança ││
│ │R$105,8mil││R$ 73,1mil││ 26,8%   ││
│ │out parc. ││out parc. ││meses c. ││
│ └──────────┘└──────────┘└─────────┘│
│ ┌ Receitas × despesas ───────────┐ │
│ │ ■ Receitas ■ Despesas          │ │
│ │ ▌▌ ▌▌ ▌▌ ▌▌ ▌▌ ▌▌ … ▌▌        │ │  colunas agrupadas
│ │ nov dez jan …          out*    │ │  *parcial
│ │ [Ver como tabela]              │ │
│ └────────────────────────────────┘ │
│ ┌ Para onde foi o dinheiro ──────┐ │
│ │ (⌂) Moradia   ████████  31,6%  │ │  barras ranqueadas, 1 cor
│ │ (🛒) Mercado  ████      14,0%  │ │
│ │ …                              │ │
│ │ Outras 9 categorias   26,6%    │ │
│ └────────────────────────────────┘ │
└────────────────────────────────────┘
```

| Visão | Conteúdo | Forma |
|---|---|---|
| **Visão geral** | KPIs (receitas, despesas, taxa de poupança, guardado); receitas × despesas por mês; taxa de poupança por mês (gráfico próprio, nunca eixo duplo) | tiles + colunas agrupadas + linha |
| **Categorias** | ranking com % do total e variação vs. período anterior; toque → detalhe da categoria (barras mensais, maiores descrições, lançamentos) e subcategorias | barras horizontais ranqueadas, cor única |
| **Fluxo de caixa** | saldo acumulado dia a dia no mês: realizado (linha sólida) até hoje, projeção (linha tracejada) até o fim do mês, marcadores nos grandes agendados ("Aluguel", "Fatura") | linha + marcadores |
| **Patrimônio** | patrimônio líquido mês a mês (a caixinha entra; o Fluxo de caixa a deixa de fora, com os cartões); ativos × passivos em gráficos separados (pequenos múltiplos) | área de série única |
| **Calendário** | gasto por dia em mapa de calor (escala sequencial de um tom); toque no dia → lançamentos | heatmap mensal |

- **Detalhe da categoria** (`/relatorios/categorias/[id]`; ranking de Categorias, Visão geral e bloco do Início abrem ele): link "Todas as categorias" (mantém `periodo` e `mes`); card com o ícone, o nome ("Mercado › Feira", "(arquivada)"), a janela e o total, e "14,0% das despesas do período"; "Por subcategoria" (só com filhas com valor: o ranking delas, "Padaria (arquivada)" e "Sem subcategoria", sem link, porcentagem sobre o total da categoria; cada linha leva ao Extrato do mês, nome acessível "… Ver no extrato de {mês}"); "Mês a mês" (período de 3 meses ou mais, mês parcial marcado, "Ver como tabela"); "O que mais pesou" (5 descrições com contagem); botão "Ver lançamentos de {mês} no extrato". Sem valor no período: "Nenhuma despesa em {Mercado} no período". Id que não é da pessoa ou inválido: "Categoria não encontrada" ("Ela pode ter sido mesclada com outra, ou o link está incompleto.") com "Ver categorias". As abas e os chips de período mantêm o detalhe. O nome acessível das linhas do ranking termina em "do total. Ver o detalhe da categoria".
- Filtro de período **um só**, acima de tudo, vale para todas as visões.
- **`?mes=AAAA-MM`** nas visões por período (Visão geral, Categorias, Patrimônio): o mês onde a janela termina; `?periodo=` é o tamanho (padrão 12). Sem `mes`, vale o mês atual; um mês atual ou futuro vale como o atual; um valor malformado também. Chips e abas mantêm o `mes`. Fora do mês atual, abaixo dos chips, a nota "Até **outubro de 2026**" (com `periodo=1`: "Mostrando **outubro de 2026**") e o link "Voltar para hoje" (44 px). Os blocos do Início e o aviso Resumo mensal abrem o relatório no mês certo.
- **Sem registros**: Fluxo e Patrimônio, num mês (ou janela) que termina antes do primeiro registro, mostram "Sem registros em {mês de ano}" / "Seus registros começam em {mês de ano}." e o botão "Ir para {mês de ano}" (o mês do primeiro registro, mantendo o período), em vez de um saldo projetado para trás. Quando a janela do Patrimônio começa antes do primeiro registro, a série **começa nele** (com o ponto anterior, base da variação): o gráfico não mostra meses planos, o rótulo da variação conta só os meses mostrados ("em 3 meses") e abaixo do gráfico aparece "Seus registros começam em {mês de ano}." O mesmo vale para o bloco do Início.
- Menu "⋯": regime **Competência** (data da compra, padrão) ou **Caixa** (cartão entra na data de pagamento da fatura).
- Mês corrente sempre marcado como **parcial** (asterisco + nota) para não sugerir queda falsa.
- KPIs que são **somas** incluem o mês parcial (com o rótulo "inclui out parcial"); KPIs que são **razões** (taxa de poupança, médias mensais) usam só meses completos — senão o mês em andamento, com o salário já recebido e as despesas ainda por vir, infla o resultado.
- Exportar (`⇩`): sheet com CSV ou PDF + período.

### 6.13 Importar extrato

1. **Arquivo**: escolher conta + área de toque grande "Escolher arquivo OFX ou CSV" (no desktop, arrastar e soltar). Ajuda: "Onde baixo meu extrato?" (texto genérico, sem marcas).
2. **CSV**: mapeamento de colunas com prévia (data, descrição, valor, formato de data e separador decimal detectados automaticamente).
3. **Revisão**: lista com checkbox por linha; duplicados detectados vêm desmarcados com selo "Já existe"; categoria sugerida editável em linha; contadores no topo ("112 novos · 8 duplicados").
4. **Confirmar**: "Importar 112 lançamentos" → progresso → resumo com "Desfazer importação" por 24 h.

### 6.14 Ajustes

Listas agrupadas (raio 16, linhas de 52 px):

- **Perfil**: nome, e-mail, foto.
- **Novidades**: lista do que chegou ao app, por data (§6.16), com a contagem de não lidas na linha.
- **Segurança**: passkeys (listar com nome e data, criar neste aparelho, renomear, remover), senha (trocar), sessões ativas (aparelho e último uso; encerrar uma ou todas as outras), verificação em 2 etapas (selo "Em breve" até a F1). Ações sensíveis — mexer em passkeys ou senha, encerrar sessões, exportar ou apagar dados — pedem para entrar de novo quando a sessão não é recente.
- **Preferências**: tema (Escuro · Claro · Sistema; escuro por padrão, salvo na conta e aplicado em todos os aparelhos), Início ("Personalizar o Início", atrás da flag `inicio_personalizavel`, §6.3), início do mês financeiro, abrir em modo discreto, regime dos relatórios; dicas de uso ("Mostrar dicas nas telas" e "Rever dicas", §6.16). No índice de Ajustes, as linhas "Aparência", "Mês financeiro" e "Dicas de uso" mostram o valor atual à direita.
- **Organização**: categorias (editar, mesclar, reordenar), tags, contas e cartões e, com a flag `financas_compartilhadas`, **Compartilhado** ("2 grupos · 1 convite"; sem nenhum, "Divida despesas com outras pessoas"). O skeleton de Ajustes mantém a Organização na altura do padrão: a linha só existe com a flag.
  - **Categorias com subcategorias** (Ajustes › Categorias): a lista é uma árvore, cada subcategoria logo depois da mãe, com recuo e a legenda "em Mercado"; as arquivadas dizem "Despesa · em Mercado". A folha "Nova categoria" / "Editar categoria" tem, depois do Nome, o campo **"Subcategoria de"** (select nativo): primeira opção "Nenhuma (categoria principal)", depois as categorias principais ativas do mesmo tipo, menos ela mesma; trocar o Tipo (só ao criar) zera a mãe. **Um nível só**: uma categoria com subcategorias (ativas ou arquivadas) fica principal, com o campo desabilitado e a dica "Tem subcategorias, por isso fica como categoria principal."; uma subcategoria nunca tem filhas e tem sempre o tipo da mãe. O nome é único em cada nível ("Já existe uma subcategoria com esse nome em Mercado."; o mesmo nome sob mães diferentes vale). Uma categoria com orçamento neste mês ou nos próximos não vira subcategoria: "Esta categoria tem orçamento neste mês ou nos próximos. Apague o orçamento para colocá-la dentro de outra.".
  - **Arquivar a mãe** arquiva junto as subcategorias ativas, e a confirmação diz quantas: "Ela e as 2 subcategorias saem das listas de escolha e dos orçamentos. Os lançamentos antigos continuam com elas, e dá para restaurar quando quiser." (com uma: "Ela e a subcategoria Feira …"). Toasts: "Subcategoria Feira criada em Mercado."; "Categoria Mercado arquivada, com 2 subcategorias." com Desfazer; "Categoria Mercado restaurada, com 2 subcategorias." (botão Restaurar); restaurar uma subcategoria com a mãe arquivada traz a mãe: "Categorias Feira e Mercado restauradas.". O Desfazer restaura só as que saíram junto.
  - **Editar categoria**: no rodapé só "Salvar categoria"; abaixo do formulário, a seção **"Mais ações"** tem "Mesclar com outra" (ícone `Merge`) e "Arquivar categoria" (texto de perigo). As duas abrem um passo na mesma folha (título com o foco, "Cancelar" volta). A folha usa `flowFooter` (`SheetContent`): com texto grande ou tela baixa o rodapé deixa de ser fixo e a folha inteira rola, para os botões nunca ficarem sem alcance.
  - **Arquivar {Nome}?**: se a categoria (com as subcategorias ativas) tem lançamentos e existe destino, pergunta "Quer passar as despesas desta categoria para outra?" ("…as receitas…"; com filhas: "…as despesas dela e das subcategorias…"): "Não, deixar com ela" (padrão; mantém os lançamentos e o Desfazer) ou "Sim, escolher outra categoria", com o select "Passar para" (mesmo tipo, ativas, fora a própria e as arquivadas junto; subcategoria aparece como "Mercado › Feira"). O resumo, com `aria-live`, diz "32 despesas, inclusive as agendadas, vão para Restaurantes. Não dá para desfazer: se restaurar Mercado, ela volta vazia." ("1 despesa vai…") e, havendo orçamento daqui para a frente, "O orçamento de Mercado se soma ao de {principal do destino}.". Botão "Arquivar e passar despesas" ("…receitas"). Toast com mover, sem Desfazer: "Categoria Mercado arquivada, com 2 subcategorias. 32 despesas foram para Restaurantes."; sem mover, o de sempre com Desfazer, e o Desfazer agora responde "Categoria Mercado restaurada, com 2 subcategorias.".
  - **Mesclar {Nome}**: "Os lançamentos, as recorrências e o orçamento de {Nome} passam para a categoria escolhida, e {Nome} fica arquivada, vazia." (com filhas: "As 2 subcategorias passam para dentro dela."). Select "Mesclar com" (uma mãe só vai para categoria principal); sem opção: "Não há outra categoria de despesa para mesclar." e o botão desabilitado. Resumo "32 despesas vão para Mercado. Não dá para desfazer." (com 0: "Não há despesas para passar. {Nome} fica arquivada."). Botão "Mesclar categorias"; toast "Categoria Supermercado mesclada com Mercado.". Recusas com o motivo: destino arquivado, de outro tipo ou subcategoria (para uma mãe) e nome de subcategoria já usado no destino ("Mercado já tem uma subcategoria Feira. Renomeie uma das duas antes de mesclar.").
  - **Mudar a ordem**: botão ghost abaixo de Despesas e de Receitas (2 ou mais ativas), folha "Ordem das despesas" / "Ordem das receitas" com a árvore (filha recuada, "em Mercado") e "Subir {nome}" / "Descer {nome}" de 44 × 44 px; a mãe anda com as filhas e a filha só entre as irmãs; nas pontas o botão fica `aria-disabled` e o foco continua nele; uma região de status lê "Mercado na posição 2 de 16." / "Feira na posição 1 de 2 em Mercado.". As trocas ficam na folha até "Salvar ordem" ("Salvando…"); toast "Ordem das despesas salva." com Desfazer, que regrava a ordem anterior. A ordem vale nas listas de escolha, nos orçamentos, no extrato e na lista "Todas" da Nova transação; os 6 atalhos continuam pelos mais usados.
- **Notificações** (atrás da flag `notificacoes_push`; a linha no índice diz "Resumos e contas a vencer"): três seções.
  - **Neste aparelho**: o interruptor "Receber notificações" (pede a permissão no toque), "Enviar notificação de teste" e, só para administradores, "Enviar prévia dos avisos" ("Os avisos ligados, com os dados de hoje, só neste aparelho."; toast "Enviamos 3 prévias para este aparelho." ou "Nada para mostrar hoje nos avisos ligados."). Embaixo, a nota "Vale só para este aparelho. Ao sair da sua conta nele, as notificações dele são desligadas."; quando o aparelho não pode, a nota diz por quê (no iPhone fora da Tela de Início, "Compartilhar › Adicionar à Tela de Início"; bloqueadas, onde liberar; sem as chaves VAPID, o aviso de configuração só para administradores).
  - **Avisos**: um interruptor por aviso, com ícone e descrição — Resumo do dia ("Saldo, o que vence hoje e quanto dá para gastar."), Contas a vencer ("Pendentes e faturas, e as que venceram sem pagar."), Vencimento em dia não útil (ícone `calendar-x`, logo depois de Contas a vencer, **só com a flag `alerta_dia_nao_util`**; "No último dia útil antes, quando uma conta vence no fim de semana ou num feriado."), Próxima receita ("Nos 7 dias antes, com quanto dá para gastar por dia até lá."), Resumo semanal ("Toda segunda, como foi a semana.") e Resumo mensal ("No dia 1º, como foi o mês que fechou.", com o dia de início do mês financeiro). Padrões: Contas a vencer, Vencimento em dia não útil (quando visível), Resumo semanal e Resumo mensal ligados; Resumo do dia e Próxima receita desligados. Com Contas a vencer ligado, "Avisar com antecedência": controle segmentado No dia · 1 dia · 3 dias (padrão 1 dia; os rótulos quebram linha em vez de cortar). Nota embaixo: "Chegam uma vez por dia, entre 6h e 7h (horário de Brasília), em 1 aparelho."; sem aparelho, "… Nenhum aparelho recebe ainda: ligue “Receber notificações” acima."; tudo desligado, "Todos os avisos estão desligados." (conta só as linhas visíveis: sem a flag, o aviso escondido não conta). A lista tem 6 linhas com a flag e 5 sem ela; o skeleton da seção é sempre o de 6 (162 px, 133 px a partir de `sm`), porque a flag precisa da sessão e o fallback não espera por ela.
  - **Privacidade**: "Mostrar valores nas notificações" (desligado por padrão): "Ligado, saldos e valores aparecem na tela bloqueada. Desligado, só o essencial: “Aluguel vence amanhã”.". Desligado, nenhum texto traz R$ (percentuais e contagens podem aparecer).

  Cada toque salva na conta a escolha inteira e vale para todos os aparelhos da pessoa. A mudança aparece na hora; se não salvar, a tela volta ao que estava e o toast de erro traz **Tentar de novo**. Skeleton com as alturas das três seções. Não há horário configurável nem horário silencioso: o plano Hobby envia uma vez por dia (doc 01 §9). Os textos de cada aviso estão em §10.3; fatura fechando, orçamento 80%/100% e meta atingida ficam para depois (`docs/tarefas.md`). O ícone do app mostra o número de avisos não lidos, que zera ao abrir o app.
- **Dados**: importar (atrás da flag `importar_extrato`), exportar tudo (backup em ZIP), **apagar todos os dados** (zona de perigo no fim, `--danger`): o diálogo pede para digitar "apagar"; apaga os dados financeiros e os anexos, mantém o acesso (senha e passkeys) e volta ao onboarding.
- **Administração** (só administradores, antes de Sobre): Usuários ("3 pessoas · 1 convite pendente"), Flags ("Todas no padrão" ou "1 flag ajustada"), Atividade e Rotina diária ("Cron e avisos") — §6.17.
- **Sobre**: versão, "Instalar app".

### 6.15 Notificações (central)

Atrás da flag `central_notificacoes` (12/11/2026). Sheet no celular e diálogo de 560 px a partir de `md`, aberta pelo sino do Início (§4.2) e por "Notificações" na barra lateral (§4.5), com o título "Notificações". Lista agrupada em **Hoje**, **Esta semana** (os 6 dias locais antes de hoje) e **Antes** (`overline`, como o cabeçalho do dia no Extrato), do mais novo ao mais antigo; "Ver anteriores" no fim quando há mais.

- **Item**: círculo de 40 px com o ícone e a cor do tipo (tokens `primary-soft` e `cat-*`), título em `headline` (até 2 linhas, quebra em qualquer ponto), corpo em `callout` `--text-2` (até 3 linhas) e hora em `caption` `--text-3` ("06:12", "Ontem", "há 3 dias", "14/out"). Não lida: ponto `--primary` de 8 px **antes do título**, título em semibold e "Não lida:" só para leitor de tela. Ações em `Button sm`: a do tipo ("Ver contas", "Ver resumo", "Ver relatório") e "Marcar como pago", só no Contas a vencer de uma conta única que ainda está pendente.
- **Toque no corpo**: marca como lido, fecha a folha e abre o destino. **Dispensar**: X de 44 px sempre visível ("Dispensar") ou deslizar para a esquerda; toast "Notificação dispensada" com **Desfazer**. A linha dispensada fica no banco, fora da lista e da contagem.
- **Marcar todas como lidas**: botão `ghost sm` no **topo do corpo da folha**, alinhado à direita e só com não lidas (não no cabeçalho, como o plano previa); encolhe e quebra a 200% de texto. Marca só até o aviso mais novo listado.
- **Modo discreto**: o aviso com valores mostra o corpo "Valores ocultos. Toque para abrir." (mais curto que o "Valores ocultos no modo discreto. Toque para ver." do plano).
- **Estados**: carregando (3 linhas de skeleton de 76 px), vazio (`BellOff`, "Nada por aqui" / "Avisos e convites aparecem aqui.") e erro ("Não deu para carregar as notificações." com "Tentar de novo"). A contagem atualiza ao voltar ao app, sem tempo real.
- **Sino** (§4.2): primeiro botão do grupo da direita do cabeçalho do Início, com 44 px reservados enquanto a flag chega (nada se desloca); selo `--danger` de 16 px ("1" a "9", "9+") e nome "Notificações, 3 não lidas". Âncora `data-tip="sino"`.
- **Barra lateral** (§4.5): linha-botão "Notificações" (44 px), antes de Administração, com a contagem à direita.
- **Avisos de grupo** (flag `financas_compartilhadas`; ícone `users`): **Convite para dividir** ("Ana (ana@…) convidou você para o grupo Casa.") com as ações **Aceitar** (primary) e **Recusar** (ghost), que só existem enquanto o convite vale; "Bruno entrou no grupo Casa." e "Bruno saiu do grupo Casa." (**Ver grupo**); "Bruno recusou o convite para Casa."; "Ana tirou você do grupo Casa."; **Casa** · "Ana adicionou Mercado (R$ 300,00). Sua parte: R$ 150,00." (agregado por dia: "3 despesas (R$ 540,00)…", e "Ana mudou 1 despesa e tirou 1."); "Ana marcou um acerto de R$ 120,00 com você em Casa." (**Lançar no extrato** abre a Nova transação, receita para quem recebe e despesa para quem paga, e **Ver grupo**). **Caixinha** (ícones `piggy-bank` e `trophy`): "Bruno guardou R$ 500,00 na caixinha Viagem." (ou "…resgatou R$ 200,00 da caixinha…", "…guardou e resgatou…", agregado por dia) e "A caixinha Viagem chegou ao objetivo. Que tal a próxima?", ambos com **Ver caixinha**. Sem valores (modo discreto ou "Mostrar valores nas notificações" desligado) o texto não traz R$ ("Bruno guardou dinheiro na caixinha Viagem."). Aceitar mostra o toast "Você entrou no grupo Casa."; Recusar, "Convite recusado.". O aviso de um grupo que a pessoa deixou leva a `/compartilhado`, sem ações. Push: convite, entrada, remoção, acerto, despesa adicionada, aporte na caixinha e "chegou ao objetivo" (só para quem não agiu); recusa e saída ficam só no sino.
- **Ajustes › Notificações** (§6.14): com o sino ligado, a nota diz que os avisos chegam "no sino e em 1 aparelho"; sem aparelho, "no sino do app. Para receber também no celular, ligue “Receber notificações” acima."

### 6.16 Dicas e novidades

Balões curtos que apontam o que fazer, na primeira visita a cada tela, e avisos do que chegou ao app.

| Tipo | Para quem | Rótulo |
|---|---|---|
| **Primeiros passos** | todo mundo, na primeira vez que chega à tela | "Dica 1 de 3" com `lightbulb` |
| **Novidade** | só quem já usava o app **antes** da data dela (conta criada ou convite aceito antes; para quem chega depois, aquilo sempre existiu) | "Novidade" com `sparkles` |

```
┌────────────────────────────────────┐
│ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │  destaque suave (scrim a ~70%)
│ ░░ ┌──────────────────────────┐ ░░ │
│ ░░ │ 💡 DICA 1 DE 3            │ ░░ │  overline --primary
│ ░░ │ Registre em segundos     │ ░░ │  headline
│ ░░ │ Toque no + para lançar…  │ ░░ │  callout --text-2
│ ░░ │ Pular dicas    [Próxima] │ ░░ │  ghost sm · primary sm
│ ░░ └────────────▼─────────────┘ ░░ │  seta para o alvo
│ ░░░░░░░░░░░░ ╭─────╮ ░░░░░░░░░░░░░ │  recorte com anel --primary
│  Início Extrato │ + │ Planejar Rel.│
└────────────────────────────────────┘
```

- **Balão**: `--surface`, raio 20, `shadow-dialog`, largura `min(336px, 100vw − 24px)`, seta de 9 px que aponta o centro do alvo (o início dele, se for muito mais largo que o balão). Fica do lado com espaço (preferência por tela), dentro da área útil: nunca sob a tab bar nem sob o cabeçalho recolhido, a 12 px das bordas; acompanha o alvo na rolagem, no redimensionamento e na rotação.
- **Destaque**: o resto da tela escurece de leve; o alvo fica num recorte com anel `--primary` e um pulso único (sem pulso com movimento reduzido). Tocar no escuro dispensa a dica; tocar no alvo passa pelo recorte, faz o que o alvo faz e conta como vista.
- **Sequência**: no máximo 3 por tela, primeiros passos antes das novidades. "Próxima" leva à seguinte (o recorte desliza até ela); a última diz "Entendi". "Pular dicas" encerra a tela e o aviso oferece **"Não mostrar mais"**. Esc e toque fora valem como "Entendi".
- **Quando aparece**: com a página carregada (nenhum skeleton), depois de ~0,7 s de calma; nunca com folha, diálogo ou aviso na tela nem com alguém digitando. Dica cujo alvo não está visível é pulada em silêncio e continua não vista. No Início, só depois da primeira conta (antes disso, o "Comece por aqui" já guia).
- **A11y**: `role="dialog"` com título e texto ligados; o foco entra no balão (Tab fica nele) e volta ao sair; uma região `aria-live` anuncia "Dica 1 de 3".
- **Novidades** (Ajustes › Novidades): lista por data, um card por dia sob o `DayHeader` do extrato, com selo "Nova" até a visita, que as marca como lidas. Não lidas mostram um ponto `--primary` no avatar do Início e em Ajustes na barra lateral (nunca `--danger`: não é alerta) e a contagem na linha de Ajustes. Com as dicas desligadas, o ponto não aparece; a contagem na linha de Novidades continua.
- **Preferências**: "Mostrar dicas nas telas" liga e desliga os balões (e o ponto das novidades); "Rever dicas" mostra de novo os primeiros passos, a partir do Início (novidades continuam lidas).
- **Categorias mais organizadas** (`novidade-categorias-organizar`, 06/11/2026, sem flag): mesclar, mudar a ordem e passar os lançamentos ao arquivar; só em Ajustes › Novidades, com o link "Ver categorias".
- **Vencimento em dia não útil** (`novidade-dia-nao-util`, 12/11/2026, `when: { flag: "alerta_dia_nao_util" }`): "Quando uma conta vence no fim de semana ou num feriado, o Início, o Extrato e a fatura do cartão mostram para quando o pagamento costuma passar." Só em Ajustes › Novidades (sem âncora), com o link "Ver contas pendentes" (`/extrato?status=pendente`); ícone `sparkles`. O aviso por push fica fora do texto: `when` só aceita uma flag e quem não tem `notificacoes_push` não abre Notificações.
- **Sino** (`novidade-sino`, 12/11/2026, `when: { flag: "central_notificacoes" }`): "Toque no sino para ver os avisos e os convites, mesmo sem notificações no celular." Título "Notificações num lugar só". Só em Ajustes › Novidades (`routes: []`: o Início já tem as 3 dicas do limite, e o sino só guarda a âncora), com o link "Ver no Início" (`/inicio`); ícone `bell`.
- **Comparado ao mês passado** (`novidade-inicio-comparado-mes-passado`, 14/11/2026, `when: { flag: "inicio_personalizavel" }`): "Veja no Início se está gastando mais ou menos que no mês passado até o mesmo dia, e as categorias que mais mudaram." Só em Ajustes › Novidades (`routes: []`), com o link "Personalizar o Início" (`/ajustes/preferencias`); ícone `chart`.
- **Gasto por conta** (`novidade-gasto-por-dia-por-conta`, 12/11/2026, `when: { flag: "inicio_personalizavel" }`): "O bloco Quanto dá para gastar por dia mostra também quanto dá em cada conta, com a fatura do cartão na conta que paga." Título "Quanto dá para gastar, por conta". Só em Ajustes › Novidades (`routes: []`), com o link "Personalizar o Início" (`/ajustes/preferencias`); ícone `chart`.
- **Maior gasto da semana** (`novidade-inicio-maior-gasto-semana`, 13/11/2026, `when: { flag: "inicio_personalizavel" }`): "Traga para o Início os 3 maiores gastos dos últimos 7 dias, com atalho para o Extrato." Só em Ajustes › Novidades (`routes: []`), com o link "Personalizar o Início" (`/ajustes/preferencias`); ícone `chart`.
- **Parcelas a terminar** (`novidade-inicio-parcelas-a-terminar`, 13/11/2026, `when: { flag: "inicio_personalizavel" }`): "Veja no Início o que falta pagar das compras parceladas, quando cada uma acaba e quanto sai por mês." Só em Ajustes › Novidades (`routes: []`), com o link "Personalizar o Início" (`/ajustes/preferencias`); ícone `chart`.
- **Assinaturas do mês** (`novidade-inicio-assinaturas`, 14/11/2026, `when: { flag: "inicio_personalizavel" }`): "Veja no Início as despesas que se repetem todo mês, quanto somam, o próximo débito e quando uma ficou mais cara." Só em Ajustes › Novidades (`routes: []`), com o link "Personalizar o Início" (`/ajustes/preferencias`); ícone `chart`.
- **Conta de benefício** (`novidade-conta-beneficio`, 12/11/2026, sem flag): título "Conta de benefício", "Cadastre o vale-refeição ou o vale-alimentação como Benefício: o saldo fica fora do Saldo em contas e, por padrão, do patrimônio." Só em Ajustes › Novidades (sem âncora), com o link "Criar benefício" (`/contas/nova?tipo=beneficio`); ícone `utensils` (Lucide `UtensilsCrossed`).
- **Caixinha compartilhada** (`novidade-caixinha-compartilhada`, 12/11/2026, `when: { flag: "financas_compartilhadas" }`): título "Guardem dinheiro juntos", "Uma caixinha do grupo, com quanto cada um já guardou e quando vocês chegam no objetivo." Só em Ajustes › Novidades, com o link "Ver Compartilhado"; ícone `vault`.
- **Compartilhado** (`novidade-compartilhado`, 12/11/2026, `when: { flag: "financas_compartilhadas" }`): "Crie um grupo, convide pelo e-mail e veja quem deve quanto, com o acerto num toque." Título "Divida despesas com outra pessoa". Só em Ajustes › Novidades (sem âncora: a área não tem lugar fixo no celular), com o link "Ver Compartilhado"; ícone `users`.
- **Caixinhas** (`novidade-caixinhas`, 06/11/2026, sem flag): "Guarde dinheiro à parte numa caixinha: ela conta no patrimônio, mas fica fora do Saldo em contas e do que dá para gastar." Só em Ajustes › Novidades (sem âncora), com o link "Criar caixinha" (`/contas/nova?tipo=caixinha`); ícone `vault`.
- **Subcategorias** (`novidade-subcategorias`, 05/11/2026, sem flag): "Agora dá para criar subcategorias, como Mercado › Feira, em Ajustes › Categorias. No Extrato, filtrar a categoria traz as subcategorias junto." Só em Ajustes › Novidades (sem âncora), com o link "Ver categorias".
- **Registro e estado**: as dicas ficam em `src/lib/tips/registry.ts` (id estável, rotas, âncora `data-tip`, textos, data, ordem, condição: ter conta, ter passkey, papel, flag); o que cada pessoa viu fica na tabela `user_tips` (doc 01 §6.3) e acompanha a conta em qualquer aparelho. Dica ou novidade sobre algo atrás de uma flag ou só de administradores declara a flag ou o papel: o balão e o link nunca levam alguém a uma tela que ele não pode abrir (doc 01 §11.10).

### 6.17 Administração (`/admin`)

Só para administradores; quem não é vê a página 404. Chega-se por Ajustes › Administração (celular) ou pelo item "Administração" acima de Ajustes na barra lateral (desktop; ele fica numa lista própria, acima de Ajustes, para que a chegada dele, decidida no servidor, não desloque nada). Tela empilhada com voltar para Ajustes, título "Administração" e um segmented control **Usuários · Flags · Atividade · Rotina** (rotas, o polegar desliza entre elas; a 200% de texto as abas quebram de linha em vez de se sobrepor). Coluna de até 768 px no desktop. Princípio que aparece na própria tela: "Quem administra cuida dos acessos, dos convites e das flags, e nunca vê as finanças de outra pessoa."

**Usuários**

```
3 pessoas · 1 convite pendente
┌──────────────────────────────────────┐
│ ＋  Convidar pessoa                    │  primary, largura total no celular
└──────────────────────────────────────┘
PESSOAS
┌──────────────────────────────────────┐
│ (AN) Ana (você) [Admin]            › │
│      demo@meu-finan.local            │
│      [Ativo] acesso agora · criada em 17/set/25
├──────────────────────────────────────┤
│ (CM) Carla Mendes                  › │
│      carla@meu-finan.local           │
│      [Convite pendente] vale até seg, 19/out, 14:32
└──────────────────────────────────────┘
```

- Com texto grande, e-mails e nomes quebram em qualquer ponto e os selos descem para a linha de baixo, sem cortar.
- Status com selo e palavra, nunca só cor: **Ativo** (`primary`), **Convite pendente** (`transfer`), **Convite expirado** (`warning`), **Desativado** (`neutral`, avatar apagado). Papel: selo "Admin" com escudo.
- Toque abre a conta numa **sheet** (sobre a lista): nome, e-mail, selos, e um quadro com conta criada, último acesso ("há 2 dias · Android · Chrome"), sessões abertas, como entra ("Senha e 2 passkeys") e o link aberto ("Vale até…" + "Invalidar").
- **Ações** (linhas com ícone, título e uma linha explicando o efeito): Gerar novo convite / Gerar link de redefinição · Encerrar sessões · Tornar administrador / Remover administrador · Desativar acesso / Reativar acesso. Desativar e mudar o papel executam na hora com toast + "Desfazer"; uma ação que não se aplica fica apagada **com o motivo** ("Reative o acesso antes de gerar um link.").
- **Zona de perigo**: "Excluir conta" leva à confirmação "Excluir a conta de Bruno?", que explica o que some ("Apaga o acesso e todas as finanças de Bruno: contas, cartões, lançamentos, metas, orçamentos e importações.") e libera o botão `destructive` só quando o e-mail digitado confere.
- Na própria conta, as ações dão lugar a "Esta é a sua conta…" + "Abrir Segurança".
- Na conta do dono (`OWNER_EMAIL`, ou a do primeiro acesso sem a variável), vista por outro administrador, "Gerar link de redefinição" e "Excluir conta" ficam apagados com o motivo ("O dono redefine o próprio acesso em Ajustes › Segurança ou pela recuperação de emergência." e "A conta do dono do app não pode ser excluída."); desativar, remover administrador e encerrar sessões continuam disponíveis, porque a recuperação de emergência desfaz.
- **Convidar pessoa** (sheet): Nome, E-mail ("É com ele que a pessoa vai entrar."), Papel (segmented Usuário · Administrador, com a explicação de cada um) e "Criar convite". A sheet vira **"Convite pronto"**: o link inteiro (quebrado em linhas, selecionável), "Copiar link" (primary), "Compartilhar" (só onde existe `navigator.share`), "Concluir" e o aviso "Por segurança, o link não aparece de novo…". O mesmo vale para "Link de redefinição pronto".

**Flags**

- Um card por flag do registro: rótulo (`headline`), chave em mono, selo do valor efetivo para todos (Ligado/Desligado), descrição, padrão, área e data; **Para todos**: segmented Padrão · Ligado · Desligado, com a explicação ("Segue o padrão do código: ligado."); **Exceções por pessoa**: as pessoas com valor próprio e "Ajustar", que abre uma sheet com cada pessoa e o mesmo segmented.
- A mudança aparece na hora (otimista) com toast "Importar extrato desligado para todos." + "Desfazer"; o toast concorda com o rótulo (`grammar` da flag no registro: "Notificações ligadas para Bruno.", "Importar extrato desligado para todos."); vale na próxima tela que cada pessoa abrir.

**Atividade**

- A auditoria, da mais nova para a mais antiga, um card por dia sob o `DayHeader` do extrato ("Hoje · sáb, 17 out"). Cada linha: ícone num círculo (`--danger-soft` só para exclusão), frase ("Você desativou Bruno Lima", "Carla aceitou o convite", "Ana desligou Importar extrato para todos"), detalhe em `caption` e a hora.
- "Ver ações mais antigas" pagina; vazio: "Nenhuma ação ainda".

**Rotina** (`/admin/rotina`)

- Título "Rotina diária" e a frase "Todo dia entre 6h e 7h (Brasília) o app cria lançamentos recorrentes, atualiza índices, envia avisos e limpa o que foi apagado."
- **Aviso do cron**: cartão `--warning-soft` com ícone e palavra quando o cron não rodou há 26 h ou mais, nunca rodou, a última execução falhou ou a Vercel foi recusada (o texto diz o que conferir na Vercel); com tudo certo, só a linha "Última execução automática: hoje, 06:12.".
- **Configuração** (lista de linhas): "Segredo do cron (CRON_SECRET)" e "Chaves de notificação (VAPID)" com selo Definido/Definidas ou Não definido/Não definidas (palavra + ícone, nunca só cor, nunca o valor) e "Pessoas que recebem avisos" ("2 pessoas"; nenhuma: "Ninguém ainda. Ligue a flag em Flags e peça para inscreverem o aparelho em Ajustes › Notificações.").
- **Rodar agora**: botão primário, largura total no celular. Abre a folha "Rodar a rotina agora?" ("Pode levar até 4 minutos. Mantenha esta tela aberta.", Rodar · Cancelar; ao fechar, o foco volta ao botão). Rodando: "Rodando…" com spinner e `aria-busy`, mais "Rodando a rotina. Pode levar alguns minutos."; ao fim, toast "Rotina concluída.", "Rotina concluída com problemas." ou "A rotina falhou.", o foco volta ao botão e a execução nova entra na lista aberta. Recusas do servidor ("Já tem uma execução em andamento. Espere terminar.", "A rotina rodou há pouco. Espere N s para rodar de novo.") vêm em toast.
- **Últimas execuções** (14): cartão com uma linha por execução (`aria-expanded`): "sáb, 08/nov, 06:12", origem · duração e o selo Ok, Parcial, Falhou, Em andamento, Interrompida ou Recusada (segredo). Aberta, mostra cada passo (Lançamentos recorrentes, Faturas, Índices do Banco Central, Feriados (BrasilAPI), Saldos de fim de mês, Avisos por push, Limpeza de excluídos) com selo, duração, o motivo ou o resumo em português ("2 Contas a vencer enviadas") e, à parte, o "Detalhe técnico" do erro, que quebra de linha. Nunca `chave: valor` em inglês. Vazio: "Nenhuma execução ainda. A primeira roda sozinha entre 6h e 7h de Brasília, ou use Rodar agora."
- Skeleton com a altura de cada bloco; sem rolagem lateral a 200%.

**Estados**: skeletons com a forma de cada tela; erros das ações em toast com a mensagem do servidor ("É preciso manter pelo menos um administrador ativo.").

---


### 6.18 Compartilhado

Atrás da flag `financas_compartilhadas` (12/11/2026); sem ela as duas rotas respondem com a página 404. Toda página lê a sessão dentro de `<Suspense>` e tem `error.tsx` próprio. A privacidade e a fronteira de dados estão no doc 01 §11.11 (ADR-13).

**`/compartilhado`**: `PageHeader` "Compartilhado" com "Novo grupo" (com grupos; sem nenhum, o estado vazio traz "Criar grupo").
- **Convites para você**: card "{Ana} ({ana@…}) convidou você para o grupo {Casa}." com **Aceitar** (primary) e **Recusar** (ghost). Quem convida nunca vê o nome de quem ainda não aceitou, só o e-mail digitado.
- **Grupos**: linha de 72 px com pilha de até 3 avatares, o nome, "Você e Bruno" (e "· 1 convite") e a frase do saldo: "Bruno te deve R$ 120,00" (valor em `--income`), "Você deve R$ 80,00 para Bruno" (valor em `--expense`) ou "Tudo acertado" (`--text-3`). Vários devedores somam: "Você tem R$ 200,00 a receber".
- **Vazio**: `Users`, "Divida despesas com quem mora com você" / "Crie um grupo, convide a pessoa pelo e-mail e escolham como dividir." / **Criar grupo**.
- **Novo grupo** (folha): "Nome do grupo" (até 40 caracteres) e "E-mail de quem vai dividir", um campo por pessoa com "Adicionar outro e-mail" (até 5) e a nota neutra "Se houver alguém com esse e-mail no Meu Finan, a pessoa recebe o convite." Erros no campo ("Dê um nome ao grupo.", "Confira o e-mail."). O toast diz "Grupo criado. Convite enviado.".

**`/compartilhado/[grupo]`**: voltar "Compartilhado", título com o nome do grupo e, à direita, **Pessoas** (`Users`, 44 px) e **Adicionar despesas** (ícone `Plus` de 44 px abaixo de `sm`, 640 px; botão de texto `tonal sm` a partir dele).
- **Saldo** (card): a frase em `title-3` e **Marcar como acertado** quando há uma pessoa a acertar; com 3 pessoas ou mais, **Acertar contas** abre a lista de quem paga quem para zerar o grupo (máximo n − 1 pagamentos), cada um com "Marcar como acertado". Sozinha no grupo: "Convide alguém em Pessoas para começar a dividir."
- **Mês**: `MonthSwitcher` (`?mes=`) e o card "Total de novembro: R$ 1.240,00" com uma linha por pessoa ("Você · pagou R$ 900,00 · sua parte R$ 620,00") e a `SplitBar` (§9). Lista por dia (`DayHeader`): a despesa mostra a descrição, "Pago por Ana · sua parte R$ 150,00" e o total; o acerto, "Bruno acertou R$ 120,00 com você", em tom de transferência. Vazio do mês: `Receipt`, "Nenhuma despesa dividida em novembro" / "Adicione despesas do seu extrato ou registre uma nova." / **Adicionar despesas**.
- **Detalhe da despesa** (folha): total, data, "Pago por", forma de divisão ("Por cotas") e as partes ("Você · 2 cotas  R$ 20,00"), "Adicionada por Ana em 5/nov". Quem a criou a partir do extrato vê "No seu extrato: Conta Principal" e, se o lançamento mudou depois, a nota "Desatualizada: o lançamento agora é R$ 320,00." com **Atualizar**; para os outros nada disso aparece. **Editar divisão** e **Tirar do grupo** (toast com **Desfazer**). Despesa que inclui quem saiu fica só para leitura ("Esta despesa inclui quem saiu do grupo e não pode mais ser mudada.").
- **Editor de divisão**: `SegmentedControl` **Iguais · Valores · Percentual · Cotas**, o select "Quem pagou" e uma linha por pessoa — caixa de seleção (Iguais), campo de dinheiro "Parte de {nome}" (Valores), campo de % "Percentual de {nome}" (Percentual) ou "Menos/Mais uma cota para {nome}" de 1 a 9 (Cotas; dica "Ex.: 2 cotas para Ana e 1 para Bruno.") — com a parte de cada um ao vivo. Quando não fecha, a mensagem em `aria-live`: "Faltam R$ 12,00 para fechar o total.", "Passou R$ 3,00 do total.", "Os percentuais somam 90%. Precisam somar 100%." Nas partes iguais que deixam centavos, a nota "1 centavo fica com você." (maior resto). O servidor divide de novo ao salvar.
- **Adicionar despesas** (folha, abas "Do meu extrato" e "Nova"): *Do meu extrato* tem os chips "Este mês · Mês passado · Escolher" (De/Até), o select de categoria (com "Buscar categoria" acima de 8 opções), a divisão padrão do grupo ("Divisão: Iguais entre você, Bruno" com **Mudar**), a lista de despesas suas fora de qualquer grupo com caixa de seleção, "Selecionar todas (12)" e o rodapé **Adicionar 12 despesas** (até 100). *Nova*: Descrição, Valor, Data, "Quem pagou" e a divisão; depois de salvar, o toast oferece **Lançar no meu extrato** (abre a Nova transação preenchida).
- **Pessoas** (folha): cada pessoa com o estado — "Você · criou o grupo", "Participa", "Convite enviado · vale até 26/nov", "Convite expirado" (com **Convidar de novo**), "Recusou", "Conta excluída"; quem saiu não aparece na lista, e o histórico mostra "Bruno (saiu)". "Convidar pessoa" (e-mail, a mesma nota neutra) e **Enviar convite**. O dono tem **Tirar do grupo** (ou **Cancelar convite**). **Sair do grupo** (texto de perigo) abre o passo "Sair de {Casa}?": "Você deixa de ver as despesas deste grupo. Vocês ainda têm R$ 120,00 em aberto: o histórico fica para quem continua." (a frase do saldo só com saldo em aberto), com **Sair do grupo** e **Cancelar**; sair leva de volta a `/compartilhado`.
- **Marcar como acertado** (folha): "Bruno pagou para você" / "Você pagou para Bruno", Valor (a dívida inteira, com "Em aberto: R$ 120,00. Pode ser só uma parte."), Data, a caixa **Lançar no meu extrato** (abre a Nova transação: receita para quem recebe, despesa para quem paga) e o botão "Marcar R$ 120,00 como acertado"; toast "Acerto de R$ 120,00 registrado." com **Desfazer** (só quem registrou). Se o saldo mudou no meio do caminho: "O saldo mudou enquanto você acertava. Confira e tente de novo."
- **Estados e a11y**: skeleton com as alturas do conteúdo; alvos de 44 px; erros de campo ligados por `aria-describedby`; a frase do saldo passa pelo `Money`, então o modo discreto esconde o valor. Nada de cor fora dos tokens, nos dois temas.

Ficam para depois: dividir por renda e por item, regra automática ("toda despesa de Mercado entra") e a compra parcelada inteira (cada parcela entra como lançamento).

#### Caixinhas do grupo (tarefa 9)

Mesma flag e mesmas regras de página (sessão dentro de `<Suspense>`, `error.tsx`). O dinheiro continua nas contas de cada um: a caixinha do grupo mostra só o que cada pessoa disse que guardou (ADR-13, doc 01 §11.11).

- **Abas do grupo**: abaixo do título de `/compartilhado/[grupo]`, os `SegmentedLinks` **Despesas · Caixinhas** ("Seções do grupo").
- **`/compartilhado/[grupo]/caixinhas`**: título com o nome do grupo e **Nova caixinha** (ícone `Plus` de 44 px abaixo de `sm`; botão `tonal sm` a partir dele). Cards (`article`, título `h2` com o link esticado sobre o card): anel de 56 px (sem objetivo, o ícone da caixinha), "R$ 2.900 de R$ 8.000" (sem objetivo, "R$ 2.900 guardados") e a linha de projeção. Vazio: "Guardem dinheiro juntos" / "Uma viagem, uma reforma… cada um guarda a sua parte e vocês acompanham juntos." / **Criar caixinha**. Criar leva à tela da caixinha nova.
- **`/compartilhado/[grupo]/caixinhas/[caixinha]`**: voltar "Caixinhas", título com o nome e **Editar caixinha** (lápis, 44 px).
  - Card central: anel de 120 px (sem objetivo, o ícone), "R$ 2.900 guardados de R$ 8.000" (`h2`), a projeção no plural e a linha "Juntos: R$ 700/mês · prazo jun/2027" (ou "Ninguém definiu quanto guarda por mês").
  - Frases da projeção: "No ritmo de vocês, chegam lá em **ago/2027**." (com prazo, "…, dentro do prazo.") · "Para chegar em jun/2027, vocês precisam guardar **R$ 640/mês** (hoje: R$ 700)." (sem plano, "hoje: nada planejado") · "Chegam em **mar/2027**, 3 meses antes do prazo." · "Definam quanto cada um guarda por mês para ver quando chegam lá." · "Vocês chegaram ao objetivo! Que tal a próxima?" · prazo vencido: "O prazo de jun/2027 chegou. Ajustem o prazo ou o objetivo para seguir acompanhando." · sem objetivo: "Sem objetivo. Guardem quanto e quando quiserem."
  - Botões **Guardar**, **Resgatar** (desligado enquanto a pessoa não guardou nada) e **Mudar meu plano**.
  - **Quem guarda** (lista, `UserAvatar`): "Você" ou o nome, "· você chega em **mai/2027**" quando há plano e falta, e uma grade por pessoa: Guardou, Por mês ("sem plano"), Sua parte (ou "Parte"), Falta ("Parte completa" quando cobriu); com percentual, "(60%)" ao lado do nome. A criadora do grupo vê **Mudar partes** (só com objetivo). Quem saiu aparece abaixo: "Bruno guardou R$ 1.100,00; não conta mais no total."
  - **Histórico** por mês: "Ana guardou R$ 500,00" / "Você resgatou R$ 200,00", a data, "No seu extrato" quando houve transferência (só nas linhas da própria pessoa) e **Desfazer** nas linhas da própria pessoa. Vazio: "Ninguém guardou ainda" / "Quando alguém guardar ou resgatar, aparece aqui."
  - Caixinha arquivada: abre mesmo assim, sem botões de ação, com "Esta caixinha está arquivada. O histórico continua aqui." e **Desarquivar** (toast "Caixinha Viagem de volta.").
- **Nova caixinha / Editar caixinha** (folha): Nome (até 40; "Dê um nome à caixinha."), Ícone, Cor, interruptor **Definir objetivo** (começa desligado; "Sem objetivo, vocês acompanham quanto cada um já guardou."), **Quanto querem juntar** ("Informe quanto querem juntar.", dica "A parte de cada um é igual; quem criou o grupo pode mudar depois.") e **Definir prazo** (mês e ano; começa 12 meses adiante; "Escolha um mês depois deste."). Ao editar, **Arquivar caixinha** abre "Arquivar {nome}?" ("A caixinha sai da lista do grupo para todos. O que cada um guardou continua nas contas de cada um.") e o toast "Caixinha {nome} arquivada." tem **Desfazer**.
- **Guardar / Resgatar** (folha): Valor, Data (não pode ser depois de hoje) e, com ao menos uma caixinha própria e outra conta, o interruptor **Lançar no meu extrato** (ligado), com "Sai de" e "Vai para" (contas próprias, sem cartão; a última caixinha usada vem escolhida; em Resgatar os papéis se invertem). Sem caixinha própria, a nota "Crie uma caixinha sua para lançar no extrato." com **Criar caixinha** (`/contas/nova?tipo=caixinha`). Em Resgatar a dica diz "Você pode resgatar até R$ 1.800,00, o que você guardou." e o erro é o mesmo. Botão "Guardar R$ 500,00" / "Resgatar R$ 200,00"; toast "R$ 500,00 guardados em Viagem." (ou "…resgatados de…") com **Desfazer**.
- **Mudar meu plano** (folha): "Quanto você guarda por mês", com a dica "Para a sua parte chegar no prazo: R$ 640/mês." ou "Os outros veem o seu plano; é com ele que calculamos quando vocês chegam lá."; toast "Plano salvo." / "Plano tirado.".
- **Partes do objetivo** (folha, criadora do grupo): **Iguais** · **Percentual** ("Como dividir o objetivo"); em percentual, um campo por pessoa e "Os percentuais somam 100%." / "Os percentuais somam 90%. Precisam somar 100%."; toast "Partes salvas.". Quando alguém entra ou sai, as partes voltam a ser iguais.
- **Desfazer uma linha do histórico** (folha): "Desfazer este lançamento?" com "O lançamento sai do histórico da caixinha. Se foi feito junto com um lançamento no seu extrato, ele também é desfeito." e **Desfazer lançamento** / **Cancelar**; toast "Lançamento desfeito.". Recusado quando a pessoa já resgatou parte do que a linha guardou.
- **Estados e a11y**: alvos de 44 px; valores pelo `Money`/`Masked` (modo discreto); sem cor fora dos tokens; a 360 px e 200% nada rola para o lado.

## 7. Padrões de interação

### 7.1 Gestos

| Gesto | Onde | Resultado |
|---|---|---|
| Toque | tudo | ação principal do elemento |
| Pressionar e segurar (400 ms) | linha do extrato | modo de seleção |
| Pressionar e segurar | botão "+" | menu Despesa / Receita / Transferência |
| Deslizar linha ← | extrato, próximas contas | Excluir (com Desfazer) |
| Deslizar linha → | extrato | Pago/Pendente, Duplicar |
| Deslizar horizontal no período | Início, Extrato, Orçamentos | mês anterior/seguinte |
| Arrastar para baixo | sheets | fechar |
| Arrastar no gráfico | gráficos de linha/área | scrub com tooltip |
| Puxar para atualizar | listas, **somente no PWA instalado** | recarrega dados (no navegador, o gesto nativo já existe) |

Todo gesto tem **alternativa visível** (botão, menu "⋯" ou ação no detalhe) — gestos aceleram, não são obrigatórios.

### 7.2 Feedback

- **Otimista**: criar, editar, marcar pago, excluir aparecem na hora (`useOptimistic`); se o servidor falhar, a mudança é revertida com toast explicando e "Tentar de novo".
- **Desfazer**: toast de 5 s para exclusão, pagamento, mudança em lote, importação.
- **Vibração** (Android/Chrome): 8 ms em teclas, 12 ms ao salvar, padrão `[10, 40, 10]` em erro. iOS não suporta a Vibration API — o feedback visual basta.
- **Som**: nenhum.

### 7.3 Formulários

- Validação ao sair do campo e ao enviar; nunca enquanto digita (exceto o valor do teclado).
- Mensagens específicas: "Escolha uma conta" em vez de "Campo obrigatório".
- Ao enviar com erro: foco e rolagem até o primeiro campo inválido.
- Valores monetários sempre por MoneyInput (nunca `<input type="number">`).
- Teclado virtual: `inputMode="decimal"` para valores, `"search"` para busca, `"email"` para e-mail; `enterKeyHint` adequado ("next", "done", "search").

### 7.4 Teclado virtual e viewport

- `interactive-widget=resizes-content` (Android) e escuta de `visualViewport` (iOS) para manter rodapés de sheet visíveis acima do teclado.
- Campo focado rola para ficar 24 px acima do teclado.
- Alturas de tela cheia com `100dvh`, nunca `100vh`.

---

## 8. Estados: carregando, vazio, erro, offline

| Estado | Padrão |
|---|---|
| Primeiro carregamento | skeleton com a forma exata do conteúdo, por bloco (streaming) |
| Recarregando | conteúdo anterior a 60% + spinner discreto no cabeçalho — sem piscar |
| Vazio (sem dados ainda) | EmptyState com próximo passo claro |
| Vazio (filtro sem resultado) | "Nada encontrado com esses filtros" + botão "Limpar filtros" |
| Erro de bloco | card com ícone, "Não deu para carregar o orçamento" + "Tentar de novo"; o resto da tela segue funcionando |
| Erro de ação | toast com o motivo e ação para tentar de novo; formulário preserva o que foi digitado |
| Offline | faixa fina no topo "Você está offline — mostrando dados de 14/out, 09:12"; ações de escrita entram na fila (F3) com selo "Aguardando conexão" na linha |
| Mês em andamento | rótulo "parcial" em gráficos e comparações |
| Valores muito longos | descrições: 1 linha com reticências e, quando o contêiner fica abaixo de 16 rem (texto grande), **título em até 2 linhas** e o resto quebrado inteiro; **valores nunca são cortados nem abreviados**: o `Money` encolhe até 50% para caber (§5.4); o compacto ("R$ 1,2 mi") fica nos eixos e tiles |

Textos de vazio:

| Tela | Título | Texto | Ação |
|---|---|---|---|
| Extrato | Nenhum lançamento em outubro | Registre seu primeiro gasto — leva 5 segundos. | Adicionar despesa |
| Orçamentos | Planeje o mês | Defina quanto quer gastar por categoria e acompanhe o ritmo. | Usar sugestão |
| Metas | Qual é o próximo sonho? | Uma reserva, uma viagem, um carro… a gente calcula o caminho. | Criar meta |
| Relatórios | Ainda não há dados suficientes | Com alguns dias de registros, os gráficos aparecem aqui. | Adicionar lançamento |
| Busca | Nada com "xpto" | Tente outra palavra ou confira os filtros. | Limpar filtros |

---

## 9. Gráficos

### 9.1 Escolha da forma

| Pergunta | Forma | Não usar |
|---|---|---|
| Quanto tenho / gastei? | número herói ou stat tile | gráfico de uma barra só |
| Como evoluiu? | linha ou área (série única) | — |
| Receitas × despesas por mês | colunas agrupadas (2 séries) | eixo duplo |
| Onde gastei? | barras horizontais ranqueadas, **uma cor**, ícone da categoria como identidade | pizza com 12 fatias, cores por valor |
| Parte do todo simples (investido × juros) | barra 100% com 2 segmentos | rosca com valores próximos |
| Vou atingir o orçamento? | meter com marcador de ritmo | velocímetro |
| Gasto por dia | mapa de calor sequencial (1 tom) | arco-íris |
| Comparar cenários | até 3 linhas com rótulo no fim | mais de 3 séries |

### 9.2 Marcas

- Colunas/barras com espessura **≤ 24 px**, ponta arredondada 4 px, base reta; **2 px de vão** (cor da superfície) entre barras adjacentes e entre segmentos empilhados.
- Linhas de **2 px**, junções arredondadas; marcadores ≥ 8 px com anel de 2 px da superfície.
- Áreas: tom da série a ~12% de opacidade sob a linha.
- Grade: linhas horizontais **sólidas** de 1 px em `--chart-grid`, no máximo 4; sem grade vertical. Tracejado reservado a **projeção** e **alvo**.
- Eixo Y com valores compactos ("0", "4 mil", "8 mil"); no celular, eixo Y à direita ou rótulos dentro da área para ganhar largura.
- Texto nunca na cor da série: rótulos e valores em `--text`/`--text-2`/`--text-3`; a identidade vem do quadradinho/traço colorido ao lado.

### 9.3 Legenda e rótulos

- Duas séries ou mais → legenda sempre presente (acima do gráfico, com marcador colorido + nome).
- Rótulos diretos **seletivos**: o mês selecionado, o último ponto, o pico — nunca um número em cada ponto.
- Série única → sem legenda (o título do card diz o que é).

### 9.4 Interação no toque

- **Scrub**: arrastar o dedo sobre o gráfico move uma linha vertical e um tooltip fixo **acima** do gráfico (não sob o dedo). Soltar mantém a seleção até tocar fora.
- Colunas: toque seleciona o mês (coluna na cor da série, demais na cor de repouso `--chart-3-rest` / `--chart-2-rest`, §3.1, com contraste ≥ 3:1 nos dois temas; sem token de repouso, a opacidade cai a 40%) e mostra os valores no topo do card. A seleção também vai além da cor: o rótulo do mês fica em negrito e ganha um traço de 2 px (`--text`) embaixo.
- Áreas de toque ≥ 24 px de largura, mesmo para colunas finas.
- Teclado: setas percorrem os pontos; o tooltip acompanha o foco.
- Implementação recomendada do scrub: um `<input type="range">` transparente sobre a área do gráfico (`min=0`, `max=pontos−1`), com `aria-valuetext` descrevendo o ponto ("Ano 7: total R$ 149.697, investido R$ 94.000"). Ganha arrasto, toque, teclado e leitor de tela sem código extra — é o que o mockup do Simulador usa.

### 9.5 Acessibilidade de gráficos

- Todo gráfico tem **"Ver como tabela"** (mesmos dados, tabela acessível). Uma tabela com rolagem própria é uma região que recebe foco (`role="region"`, nome próprio), para o teclado também rolar.
- `role="img"` nomeado por um resumo ("Receitas superaram despesas em 11 de 12 meses; maior despesa em dezembro, R$ 8.940"). O resumo é texto ligado por `aria-labelledby`, não `aria-label`: no modo discreto, o CSS troca pela versão sem valores ("…maior despesa em dezembro, valor oculto"), como no `<Money>`. O `aria-valuetext` do percorrer e o nome das colunas seguem a mesma regra.
- Identidade nunca só por cor: legenda + rótulo direto; em impressão/alto contraste, hachura a 45°/135° (opt-in).
- Tema escuro usa os passos escuros da paleta (§3.3), não uma inversão automática.

### 9.6 Implementação

- Recharts (via shadcn Charts) carregado com `next/dynamic` e skeleton de mesma altura; o container inclui a faixa do eixo X (sem rolagem interna).
- Sparklines, anéis e meters em SVG próprio (leves, renderizáveis no servidor).
- Dados chegam agregados do servidor, em centavos; formatação só na borda.

---

## 10. Conteúdo: formatação e microcopy

### 10.1 Formatos

| Tipo | Formato | Exemplo |
|---|---|---|
| Moeda | `Intl.NumberFormat('pt-BR', {style:'currency', currency:'BRL'})` | R$ 1.234,56 |
| Despesa em lista | sinal U+2212 | −R$ 64,50 |
| Receita em lista | sinal + | +R$ 7.800,00 |
| Compacto (eixos, tiles estreitos) | `notation: 'compact'` | R$ 105,8 mil · R$ 1,2 mi |
| Percentual | 1 casa (0 se ≥ 100) | 30,9% · 102% |
| Taxa | 2 casas + base | 0,95% a.m. · 12,00% a.a. · 102% do CDI · IPCA + 6,00% |
| Data relativa | até 6 dias | Hoje · Ontem · Amanhã · em 3 dias · há 2 dias |
| Data curta | `dd/mmm` | 14/out |
| Data em cabeçalho | dia da semana abreviado | ter, 14 out |
| Data completa | | 14 de outubro de 2026 |
| Mês | | outubro de 2026 · out/26 |
| Período | | 5/out – 4/nov |
| Prazo | | 7 anos e 3 meses |

### 10.2 Voz

- **Você**, frases curtas, verbo no começo dos botões ("Salvar despesa", "Pagar fatura", "Criar meta").
- Sem jargão sem explicação: "IR regressivo" vem com dica "Quanto mais tempo investido, menor o imposto (22,5% → 15%)".
- Sem culpa: observar e sugerir, não repreender.
- Números com contexto: "R$ 53 por dia" é mais útil que "R$ 955 restantes" sozinho.

### 10.3 Exemplos

| Situação | Texto |
|---|---|
| Lançamento salvo | Despesa de R$ 64,50 salva · **Desfazer** |
| Excluído | Lançamento excluído · **Desfazer** |
| Erro de rede | Não conseguimos salvar. Verifique a conexão. · **Tentar de novo** |
| Orçamento 80% | Mercado chegou a 80% do orçamento, e ainda faltam 18 dias. |
| Orçamento estourado | Restaurantes passou R$ 10 do orçamento de outubro. |
| Conta vencendo | Aluguel vence amanhã · R$ 2.100,00 · **Marcar como pago** |
| Fatura fechando | A fatura do Cartão Principal fecha em 2 dias: R$ 1.380,42 até agora. |
| Meta atingida | Você atingiu a meta Reserva de emergência. Que tal a próxima? |
| Insight | Até hoje, você gastou 32% menos com Transporte do que a média dos últimos 3 meses. |
| Aviso do simulador | Simulação com taxa constante. Não é recomendação de investimento. |

**Avisos do cron** (doc 01 §9; título em negrito, depois o corpo). Datas relativas até 6 dias ("há 6 dias"); mais longe, a data curta ("venceu em 2/nov"). Com "Mostrar valores nas notificações" desligado, nenhum R$:

| Aviso | Com valores | Sem valores |
|---|---|---|
| Resumo do dia | **Resumo do dia** · Saldo em contas: R$ 4.230,15. Vence hoje: Internet (R$ 99,90). Dá para gastar R$ 53,05 hoje. Ontem saíram R$ 120,00. | **Resumo do dia** · Vence hoje: Internet. Gastos no ritmo do orçamento. Toque para ver o saldo. |
| Orçamento usado (Resumo do dia, Próxima receita) | O orçamento do mês já foi todo usado. | O orçamento do mês já foi todo usado. |
| Uma conta | **Aluguel vence amanhã** · R$ 2.100,00 · Conta Principal. Toque para ver e marcar como pago. | **Aluguel vence amanhã** · Sai da Conta Principal. Toque para ver e marcar como pago. |
| Uma fatura | **Fatura Nubank vence amanhã** · R$ 1.380,42 em aberto. | **Fatura Nubank vence amanhã** · Toque para ver a fatura. |
| Várias contas | **4 contas para pagar** · Hoje: Internet (R$ 99,90). Amanhã: Aluguel (R$ 2.100,00) e Luz (R$ 189,80). Venceu ontem: Fatura Nubank (R$ 1.380,42). | **4 contas para pagar** · Hoje: Internet. Amanhã: Aluguel e Luz. Venceu ontem: Fatura Nubank. (até 4 nomes; depois, "E mais 3 contas.") |
| Próxima receita | **Salário em 5 dias** · Faltam 5 dias para receber R$ 7.950,00 (sáb, 14 nov). Até lá, dá para gastar R$ 85,20 por dia. | **Salário em 5 dias** · Faltam 5 dias (sáb, 14 nov). Toque para ver quanto dá para gastar por dia até lá. |
| Véspera da receita | **Salário amanhã** · Falta 1 dia para receber R$ 7.950,00 (ter, 10 nov). Hoje, dá para gastar R$ 85,20. | **Salário amanhã** · Falta 1 dia (ter, 10 nov). Toque para ver quanto dá para gastar hoje. |
| Saldo previsto negativo | Até lá, o saldo previsto fica em −R$ 230,00. | Até lá, o saldo previsto fica negativo. |
| Resumo semanal | **Sua semana: 27/out – 2/nov** · Saíram R$ 1.245,30 (18% abaixo da sua média) e entraram R$ 7.950,00. Mais pesaram: Mercado, Restaurantes e Transporte. | **Sua semana: 27/out – 2/nov** · Despesas 18% abaixo da sua média. Mais pesaram: Mercado, Restaurantes e Transporte. |
| Resumo mensal | **Resumo de outubro** · Entraram R$ 7.950,00 e saíram R$ 6.120,40: sobraram R$ 1.829,60. Orçamentos: 5 cumpridos e 2 estourados (Restaurantes e Lazer). | **Resumo de outubro** · Você fechou outubro no azul. Orçamentos: 5 cumpridos e 2 estourados (Restaurantes e Lazer). |

**Vencimento em dia não útil** (12/11/2026; enviado no último dia útil antes; "Se preferir não esperar, pague hoje." só quando hoje é esse dia; sem valores, nenhum R$):

| Caso | Título | Com valores | Sem valores |
|---|---|---|---|
| Uma conta, fim de semana | **Aluguel vence no sábado (14/nov)** | R$ 2.100,00 · Conta Principal. Dia não útil: o pagamento costuma passar para seg, 16 nov. Se preferir não esperar, pague hoje. | Sai da Conta Principal. Dia não útil: o pagamento costuma passar para seg, 16 nov. Se preferir não esperar, pague hoje. |
| Uma conta, feriado | **Luz vence num feriado (20/nov)** | R$ 189,80 · Conta Principal. Consciência Negra: o pagamento costuma passar para seg, 23 nov. … | Sai da Conta Principal. Consciência Negra: … |
| 31/12 | **Luz vence em 31/dez, sem expediente bancário** | … Dia sem expediente bancário: … | … Dia sem expediente bancário: … |
| Vence hoje (criada tarde) | **Aluguel vence hoje, sábado** | sem "pague hoje" | idem |
| Uma fatura | **Fatura Nubank vence no sábado (14/nov)** | R$ 1.380,42 em aberto. Dia não útil: … | Dia não útil: … Toque para ver a fatura. |
| Várias | **3 contas vencem em dia não útil** | Sáb, 14 nov: Aluguel (R$ 2.100,00) e Luz (R$ 189,80). Sex, 20 nov (feriado): Internet (R$ 99,90). O pagamento costuma passar para o próximo dia útil. | Sáb, 14 nov: Aluguel e Luz. Sex, 20 nov (feriado): Internet. O pagamento costuma passar para o próximo dia útil. |

**Nota no Contas a vencer** (com a flag, conta não vencida que cai em dia não útil): uma conta, antes de "Toque para…": "Cai num sábado: o pagamento costuma passar para seg, 16 nov." (feriado: "Cai num feriado (Consciência Negra): …"; 31/12: "Cai num dia sem expediente bancário: …"); várias, frase final "Aluguel e Luz vencem em dia não útil." Até 4 nomes, depois "E mais N contas.". O toque abre o mesmo destino do Contas a vencer.

**No app** (flag `alerta_dia_nao_util`; datas "seg, 16 nov" na linha e por extenso, "segunda, 16 de novembro", no detalhe e para leitor de tela): "Dia não útil · passa para seg, 16 nov" · "Prazo até hoje" · "Prazo até amanhã" · "Prazo até seg, 16 nov". Sempre "costuma", nunca "sem multa".

O toque abre: Resumo do dia e Próxima receita, o Início; Contas a vencer e Vencimento em dia não útil, o Extrato com os pendentes do mês (ou o cartão, quando são só faturas dele); Resumo semanal, o Calendário do mês da semana; Resumo mensal, a Visão geral.

### 10.4 Glossário (usar sempre estes termos)

Receita · Despesa · Transferência · Lançamento · Extrato · Conta · Acesso (o login de uma pessoa: senha, passkeys e sessões) · Cartão de crédito · Fatura (aberta, fechada, paga, vencida) · Parcelado (2/6) · Recorrente · Agendado (pendente futuro) · Pago · Orçamento · Ritmo · Meta · Aporte · Rentabilidade · Patrimônio · Saldo previsto · Competência · Caixa · Caixinha (dinheiro guardado à parte: "Guardar" e "Resgatar", "Guardado em caixinhas") · Benefício (vale-refeição ou vale-alimentação, fora do Saldo em contas).

Compartilhado (a área) · Grupo (as pessoas que dividem, até 6) · Divisão (Iguais, Valores, Percentual, Cotas) · Parte (quanto cabe a cada um) · Acerto ("Marcar como acertado": quanto uma pessoa pagou à outra fora do app) · Cota (peso na divisão, de 1 a 9).

No glossário, Conta é a conta financeira. Para quem usa o app, prefira pessoa ou acesso ("3 pessoas", "Reativar acesso"); "conta" no sentido de login só onde o contexto não deixa dúvida ("Excluir conta", "Esta é a sua conta", "Conta criada", "Fica salvo na sua conta", "Este aparelho está conectado à conta…") e nunca no plural ("3 contas", "gerencia contas") nem na mesma frase que contas financeiras.

---

## 11. Acessibilidade

Meta: **WCAG 2.2 AA**.

- **Contraste**: tokens da §3.1 medidos (texto ≥ 4,5:1; UI ≥ 3:1). Nenhum texto em cor de série de gráfico.
- **Alvos**: ≥ 44 × 44 px (acima do mínimo de 24 px do critério 2.5.8).
- **Foco visível**: anel 2 px `--focus-ring` com afastamento 2 px, nunca removido; foco nunca escondido sob barras fixas (critério 2.4.11).
- **Teclado**: tudo operável; ordem de foco = ordem visual; sheets prendem o foco e devolvem ao gatilho.
- **Leitores de tela** (testar VoiceOver iOS e TalkBack): `lang="pt-BR"`; valores com rótulos completos ("Despesa de 64 reais e 50 centavos, Mercado, Conta principal, hoje"); mudanças de total anunciadas com `aria-live="polite"`; ícones decorativos com `aria-hidden`.
- **Cor nunca sozinha**: sinais +/−, ícones e rótulos em todos os estados.
- **Movimento**: `prefers-reduced-motion` respeitado (§3.8); nada pisca > 3×/s.
- **Texto**: suporta 200% de zoom sem perda; layout em `rem`; nada de `user-scalable=no`. Coberto por `e2e/texto-grande.spec.ts` (360 e 430 px, 100% e 200%: sem rolagem lateral, valor fora do cartão ou texto sob interruptor; axe a 200% nos dois temas).
- **Gestos**: todo gesto tem alternativa por botão (critério 2.5.7 — arrasto tem alternativa de toque simples).
- **Formulários**: rótulos visíveis, erros associados ao campo, sem limite de tempo.
- **Automação**: axe no Playwright em todas as telas; Lighthouse a11y ≥ 95.

---

## 12. PWA e particularidades do mobile web

### 12.1 Manifest

```ts
// src/app/manifest.ts
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Meu Finan',
    short_name: 'Meu Finan',
    description: 'Controle financeiro pessoal',
    lang: 'pt-BR',
    start_url: '/inicio?origem=pwa',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0B0D10', // splash e barra de status no padrão escuro
    theme_color: '#0B0D10',
    icons: [
      { src: '/icons/192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Nova despesa', url: '/inicio?novo=despesa', icons: [{ src: '/icons/sc-despesa.png', sizes: '96x96' }] },
      { name: 'Nova receita', url: '/inicio?novo=receita', icons: [{ src: '/icons/sc-receita.png', sizes: '96x96' }] },
      { name: 'Extrato', url: '/extrato', icons: [{ src: '/icons/sc-extrato.png', sizes: '96x96' }] },
    ],
    screenshots: [
      { src: '/screens/inicio.png', sizes: '1170x2532', type: 'image/png', form_factor: 'narrow' },
    ],
  };
}
```

### 12.2 Detalhes de plataforma

| Item | Implementação |
|---|---|
| Viewport | `width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content` (sem bloquear zoom) |
| Áreas seguras | `padding: env(safe-area-inset-*)` no topo (PWA), tab bar e rodapés de sheet |
| Alturas | `100dvh`/`100svh`; nunca `100vh` |
| Rolagem | `overscroll-behavior: contain` em sheets e listas internas |
| Toque | `-webkit-tap-highlight-color: transparent` + estados pressionados próprios; `touch-action: manipulation` em teclas |
| Seleção de texto | desligada em botões/teclas (`user-select: none`), ligada em valores do detalhe |
| iOS | `apple-touch-icon` 180 px; barra de status acompanha `theme-color`; Web Push só com o app instalado |
| Instalação | card "Instale o app" no Início a partir da 2ª visita (Android: `beforeinstallprompt`; iOS: instruções "Compartilhar → Adicionar à Tela de Início" com ícones); dispensável por 30 dias |
| Offline | Serwist: precache do shell; `stale-while-revalidate` para `GET /api/v1/*` recentes; página offline amigável |
| Fila offline (F3) | lançamentos criados offline vão para IndexedDB com o UUID já gerado e sincronizam ao reconectar (Background Sync no Chromium; ao voltar o foco nos demais) |
| Badge do ícone | `navigator.setAppBadge(n)` com contas vencendo hoje |
| Compartilhar | Web Share API (simulação, relatório em PDF) |
| Câmera | `<input type="file" accept="image/*" capture="environment">` para comprovantes; compressão no cliente para WebP ≤ 1600 px antes do upload |

---

## 13. Performance de front-end

- **Server Components por padrão**; ilhas de cliente pequenas (teclado, sheets, gráficos, filtros).
- **Pré-carregar** a sheet "Nova transação" no `requestIdleCallback` após o primeiro render — abrir precisa ser instantâneo.
- **Prefetch** das rotas da tab bar (`<Link prefetch>`).
- Gráficos com `next/dynamic` + skeleton de mesma altura.
- Listas longas: virtualização a partir de 200 linhas (TanStack Virtual) mantendo cabeçalhos fixos.
- Fonte variável única (Manrope), `display: swap`, pré-carregada pelo `next/font`.
- Ícones importados individualmente; sem bibliotecas de data/números pesadas (formatação com tabelas próprias e `Intl`).
- Animações apenas com `transform`/`opacity`; `will-change` só durante o gesto.
- Orçamento: JS inicial de `/inicio` ≤ 170 KB gz; INP ≤ 200 ms (teclado com handler síncrono e mínimo).

---

## 14. Checklist de qualidade por tela

Antes de considerar uma tela pronta:

- [ ] Funciona em **360 px** e **430 px** de largura, nos temas claro e escuro.
- [ ] Usa apenas tokens (nenhuma cor, raio ou espaçamento solto no código).
- [ ] Um único número herói; hierarquia tipográfica conforme §3.4; `tabular-nums` nas colunas.
- [ ] Ações primárias alcançáveis com o polegar; alvos ≥ 44 px.
- [ ] Estados: carregando (skeleton exato), vazio, erro de bloco, offline, modo discreto.
- [ ] Cor nunca é o único portador de significado.
- [ ] Contraste verificado; foco visível; leitor de tela lê valores por completo.
- [ ] `prefers-reduced-motion` respeitado.
- [ ] Textos revisados contra §10 (formatos, voz, glossário).
- [ ] Sem CLS: alturas reservadas para conteúdo assíncrono, fontes e gráficos.
- [ ] Testes e2e do fluxo principal em viewport de iPhone e Pixel + axe sem violações.
