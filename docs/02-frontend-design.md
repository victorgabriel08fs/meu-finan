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
- Contas: ícone por tipo (`landmark` corrente, `piggy-bank` poupança, `wallet` dinheiro, `trending-up` investimento, `credit-card` cartão). **Sem logos de bancos** (marcas registradas): usar monograma com a cor escolhida pelo usuário.
- Ícone sozinho como botão sempre tem `aria-label`.

### 3.10 Breakpoints e camadas

| Breakpoint | Largura | Layout |
|---|---|---|
| base | 0–639 | celular: 1 coluna, tab bar inferior (desenhar em 390, validar em 360) |
| `sm` | ≥ 640 | celular grande/paisagem: tiles em 2–3 colunas |
| `md` | ≥ 768 | tablet: **nav rail** lateral de 80 px; sheets viram diálogos centrados de 560 px |
| `lg` | ≥ 1024 | **sidebar** de 248 px com rótulos; conteúdo em 2 colunas |
| `xl` | ≥ 1280 | dashboard em 3 colunas; largura máxima do conteúdo 1200 px |

`z-index`: cabeçalhos fixos 10 · tab bar 20 · botão "+" 30 · menus 40 · sheet/diálogo 50 · toast 60 · tooltip 70.

### 3.11 Implementação (Tailwind CSS v4)

O Tailwind v4 entra pelo loader `@tailwindcss/turbopack`, configurado no `next.config.ts` (sem PostCSS). Tema controlado por `next-themes` (`attribute="data-theme"`, `enableSystem`), que resolve o tema antes da hidratação (sem flash).

```css
/* src/app/globals.css */
@import "tailwindcss";

@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *));

:root {
  color-scheme: light;
  --bg: #F4F5F7;  --surface: #FFFFFF;  --surface-2: #EEF0F3;  --surface-3: #E5E8EC;
  --border: #E3E6EA;  --border-strong: #8A919E;
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
  --border: #262B33;  --border-strong: #6B7484;
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

`<meta name="theme-color">` por esquema (barra do navegador e do PWA acompanham o tema):

```tsx
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F4F5F7' },
    { media: '(prefers-color-scheme: dark)', color: '#0B0D10' },
  ],
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
| Onboarding | `/onboarding` | 4 passos, logo depois do primeiro acesso |
| Sem sessão | `/entrar` · `/primeiro-acesso` · `/recuperar` | login · configuração única do acesso do dono · recuperação de emergência (§6.1) |

O app tem um único usuário, o dono: não há landing pública nem "Criar conta". `/` leva ao Início, e todas as rotas fora das três acima exigem sessão, verificada no servidor (doc 01 §11).

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

- 5 posições de mesma largura. Ícone 24 px + rótulo `micro` sempre visível.
- Ativo: ícone e rótulo em `--primary`, pílula `--primary-soft` de 56 × 30 px atrás do ícone, que **desliza** entre abas (spring de seleção, `layoutId`).
- Inativo: `--text-3`. Badge numérico (`--danger`, 16 px) para contas vencendo hoje, no ícone de Início.
- Centro: botão **+** 52 × 52 px, raio 18, `--primary`, ícone `plus` 26 px em `--on-primary`, sombra do botão. Toque = abre "Nova transação" no tipo **Despesa**. Pressionar e segurar = menu rápido com Despesa / Receita / Transferência.
- A tab bar **não se esconde** ao rolar (previsibilidade); fundo translúcido com blur.
- Tocar na aba já ativa rola ao topo; tocar de novo volta à raiz da aba.

**TopBar**

- Início: avatar (iniciais sobre `--primary-soft`, 36 px), saudação `title-3` + data `caption`; à direita, botões de 44 px: modo discreto (`eye`/`eye-off`) e notificações (`bell` com ponto).
- Demais abas: **título grande** (`title-1`) que, após 40 px de rolagem, colapsa num título centralizado `headline` numa barra de 52 px com hairline.
- Telas empilhadas: voltar (`chevron-left` + rótulo da tela anterior em telas largas), título, até 2 ações.

### 4.3 Período ativo

- `MonthSwitcher`: `‹  outubro de 2026  ›`, botões de seta de 44 px. Tocar no texto abre uma sheet com grade 3 × 4 de meses e seletor de ano.
- Deslizar horizontalmente sobre o cabeçalho de período troca o mês (com a mesma animação das setas).
- Fora do mês atual aparece o chip **"Voltar para hoje"**.
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
| Navegação | tab bar inferior | nav rail 80 px à esquerda, "+" no topo do rail | sidebar 248 px com rótulos e botão "Nova transação" |
| Início | 1 coluna | 2 colunas (herói ocupa 2) | 3 colunas: [herói + tiles] [orçamento + próximas contas] [contas + metas] |
| Extrato | lista | lista + filtros em barra | lista à esquerda, detalhe fixo à direita (master–detail) |
| Sheets | inferior | diálogo centrado 560 px | diálogo; detalhe em painel lateral |
| Simulador | entradas e resultado empilhados | 2 colunas | entradas 360 px à esquerda, resultado e gráfico à direita |
| Relatórios | 1 gráfico por linha | 2 por linha | grade de 12 colunas |

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

Tamanhos: `lg` 52 px (rodapé de sheet, largura total), `md` 44 px, `sm` 36 px (só dentro de linhas, com área de toque estendida a 44). Raio `--r-md`, rótulo `headline`. Estados: pressionado (`scale .97`, escurece 6%), carregando (spinner no lugar do ícone, largura fixa, `aria-busy`), desabilitado (opacidade 40% + motivo explicado próximo — nunca desabilitar sem dizer por quê).

### 5.2 IconButton

44 × 44 px, ícone 20–24 px, raio cheio; fundo transparente, pressionado `--surface-2`. `aria-label` obrigatório. Badge opcional (ponto 8 px ou número).

### 5.3 Card e seções

- Card: `--surface`, raio 20, padding 16 (herói 20), elevação 1.
- Cabeçalho de card: título `headline` à esquerda; ação `ghost` à direita ("Ver tudo", 44 px de altura).
- Cabeçalho de seção (fora de card): `overline` em `--text-3`, 28 px acima, 12 px abaixo.
- Card inteiro tocável quando leva a um detalhe: chevron à direita no cabeçalho; feedback de pressão no card todo.

### 5.4 Money

Props: `value` (centavos), `variant` (`display` \| `title` \| `headline` \| `callout` \| `caption`), `sign` (`auto` \| `always` \| `never`), `tone` (`auto` \| `neutral` \| `income` \| `transfer`), `animate`. Regras da §3.4. Aplica `tabular-nums` nas variantes de lista. Respeita o modo discreto. Leitor de tela: "Despesa de 64 reais e 50 centavos" (via `aria-label` gerado).

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

- Subtítulo: `Categoria · Conta`; extras como selos: parcela `2/6` (badge `--surface-2`, raio 6), `↻` recorrente, clipe se tem anexo.
- **Pendente**: ícone com contorno tracejado, valor em `--text-2`, selo "Agendado · 15/out" ou "Vence amanhã" (âmbar quando ≤ 3 dias).
- **Transferência**: ícone `arrow-left-right` em `--transfer-soft`, título "Para Reserva", valor sem sinal em `--text-2`.
- **Gestos**: deslizar para a esquerda revela **Excluir** (80 px, `--danger`); deslizar até o fim executa com toast "Desfazer". Para a direita revela **Pago/Pendente** (alterna) e **Duplicar**. Ações também no menu de contexto (pressionar e segurar no desktop / botão "⋯" acessível por teclado).
- Toque abre o detalhe. Pressionar e segurar (400 ms) entra em **modo de seleção** (checkbox 24 px aparece à esquerda com animação).

### 5.8 DayHeader

Cabeçalho fixo ao rolar (40 px, fundo `--bg` 92% + blur): "Hoje · terça, 14 out" à esquerda (`caption` 700), total do dia à direita (`caption` tabular, `−R$ 87,40`).

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

Trilho `--surface-2` 40 px, raio 12; "polegar" `--surface` com sombra leve que desliza (spring de seleção). Rótulo `callout` 600. 2–4 opções. Teclado: setas trocam, `role="tablist"` ou `radiogroup` conforme o uso.

### 5.14 Sheet

Raio superior 28; alça; snap points `[0.5, 0.92]` para escolhas, altura total para formulários. Conteúdo rola dentro (`overscroll-behavior: contain`). Rodapé fixo com ação primária acima do `safe-area`. Foco preso dentro e devolvido ao gatilho ao fechar. Ajusta-se ao teclado via `visualViewport` (iOS) e `interactive-widget=resizes-content` (Android).

### 5.15 Toast

Sonner, posição inferior acima da tab bar (`bottom: 64px + safe-area + 12px`), largura total − 32 px, raio 14, `--text` como fundo e `--surface` como texto (alto contraste nos dois temas). Ação à direita ("Desfazer") em `--primary` claro/escuro adequado. Duração 5 s (com ação) / 3 s (sem). Arrastar para baixo dispensa. `aria-live="polite"`.

### 5.16 EmptyState

Ícone de linha 48 px em círculo `--surface-2` 88 px, título `title-3`, texto `body` `--text-2` (máx. 2 linhas), CTA `primary` ou `tonal`. Sem ilustrações infantis.

### 5.17 Skeleton

Blocos `--surface-2` com o **formato exato** do conteúdo final (mesmas alturas → zero CLS). Brilho diagonal de 1,2 s (desligado com movimento reduzido). Ao **recarregar** dados já exibidos, nunca voltar ao skeleton: manter o conteúdo a 60% de opacidade com spinner discreto.

### 5.18 Inputs de formulário

Campo 52 px, raio 14, fundo `--surface`, borda 1 px `--border-strong`; foco: borda 2 px `--primary` + anel. Rótulo **sempre visível** acima (`callout` 600), nunca só placeholder. Erro: borda `--danger`, ícone + mensagem `caption` abaixo, anunciada (`aria-describedby` + `aria-invalid`). `enterKeyHint`, `autocomplete` e `inputMode` corretos em todos.

### 5.19 DatePicker

Sheet com atalhos ("Hoje", "Ontem", "Anteontem", "Início do mês") + calendário mensal (células 44 px, hoje com anel, selecionado preenchido `--primary`, dias com lançamentos com ponto). Semana começa no domingo (padrão brasileiro).

### 5.20 InsightCard

Card com ícone `lightbulb` em `--primary-soft`, texto `body` com o número em destaque (`headline`), ação `ghost` ("Ver Restaurantes") e botão fechar (dispensa e não repete por 30 dias).

---

## 6. Telas

Convenções desta seção: wireframes em 390 px; valores de exemplo iguais aos dos mockups (usuária fictícia Ana, hoje = terça, 14/out/2026).

### 6.1 Entrar, primeiro acesso e recuperação

O app tem um único usuário, o dono: **não existe "Criar conta"**. Estas são as únicas telas sem sessão (doc 01 §11). Layout mínimo: logo pequeno, título `title-1` e um card centrado, sem tab bar. Erros sempre genéricos — nunca revelar se um e-mail existe nem qual campo estava errado. Colar e gerenciadores de senha sempre permitidos (WCAG 2.2, critério 3.3.8).

**Entrar** (`/entrar`)

- **Passkey primeiro**: botão primário **"Entrar com passkey"** (Face ID/biometria) quando o aparelho suporta; campo de e-mail com `autocomplete="username webauthn"` — a autenticação condicional oferece a passkey já no foco do campo.
- **Senha como alternativa**: "Usar senha" (`ghost`) revela o campo de senha (`autocomplete="current-password"`, botão mostrar/ocultar). Erro: "E-mail ou senha incorretos".
- Muitas tentativas: mensagem inline com o tempo de espera devolvido pelo servidor ("Muitas tentativas. Tente de novo em 40 s.").
- Depois de entrar, volta para a tela de `?voltar=` (só caminhos internos) ou para o Início.
- Sem "Continuar com Google", sem link por e-mail e sem atalho para a recuperação — ela só existe quando o dono a liga.

**Primeiro acesso** (`/primeiro-acesso`) — usado uma única vez

- Só abre enquanto não existe usuário e com `SETUP_TOKEN` e `OWNER_EMAIL` configurados; caso contrário, 404 sem pistas.
- Campos: código de configuração, nome, e-mail, senha (`autocomplete="new-password"`, botão mostrar/ocultar, indicador "12+ caracteres" que ganha um ✓ quando atingido).
- Botão primário "Criar acesso". Erro genérico: "Não foi possível criar o acesso. Confira o código e o e-mail."
- Em seguida: "Criar uma passkey neste aparelho?" com explicação de uma linha ("Entre com Face ID ou digital, sem digitar a senha.") — "Criar passkey" (`primary`) e "Agora não" (`ghost`). Depois, onboarding (§6.2).

**Recuperação de emergência** (`/recuperar`)

- Existe só enquanto o `RECOVERY_TOKEN` está configurado na Vercel (doc 01 §11.4); sem ele, 404.
- Campos: e-mail, código de recuperação, nova senha (12+ caracteres) e o switch "Remover também as passkeys" (desligado; apoio: "Use se perdeu um aparelho.").
- Botão primário "Redefinir acesso". Sucesso: "Acesso redefinido. Todas as sessões foram encerradas." + botão "Entrar", com o lembrete em `--warning-soft`: "Agora remova o código de recuperação da Vercel."

### 6.2 Onboarding (4 passos, < 1 minuto)

Indicador de progresso (4 pontos) no topo; "Pular" no canto.

1. **Boas-vindas** — título "Seu dinheiro, claro como deveria ser", 3 benefícios em linhas com ícone, botão "Começar".
2. **Sua primeira conta** — nome pré-preenchido "Conta principal", chips de tipo (Corrente, Poupança, Dinheiro), **saldo atual** com MoneyInput. Texto de apoio: "Não precisa ser exato — você ajusta depois."
3. **Categorias** — grade de chips com as categorias padrão, todas ligadas; tocar desliga. "Você pode criar e editar depois."
4. **Seu mês** — "Seu mês financeiro começa no dia": chips 1 · 5 · 10 · 15 · 20 · Outro. Apoio: "Use o dia em que costuma receber o salário."

Ao concluir: Início com **3 dicas contextuais** sequenciais (balão apontando): botão "+", previsão do mês, olho do modo discreto. Cada dica some ao tocar fora; nunca reaparece. As regras dos balões e das novidades estão na §6.16.

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
| Saldo em contas | soma das contas com "incluir no patrimônio" (exceto cartões); chip com variação do mês; **previsto para o fim do período** = saldo + receitas pendentes − despesas pendentes − faturas a vencer no período. O "(i)" abre sheet com a conta detalhada | `/contas` |
| Receitas / Despesas | efetivados no período; linha de apoio com pendentes | extrato filtrado por tipo |
| Orçamento | meter empilhado (gasto + agendado) com marcador de ritmo; "pode gastar por dia" já desconta contas agendadas; até 3 categorias priorizadas por gravidade (estourou > acima do ritmo > no ritmo) | `/planejar/orcamentos` |
| Próximas contas | pendentes dos próximos 7 dias + faturas; botão `tonal sm` "Pagar" marca como pago (toast com Desfazer); vencidas no topo com selo `--danger` "Venceu ontem" | detalhe do lançamento / fatura |
| Contas | carrossel `scroll-snap` de cards 156 × 112 px (ícone, nome, saldo); último card tracejado "+ Adicionar conta"; o card seguinte aparece cortado para sugerir rolagem | `/contas/[id]` |
| Metas | até 2 metas com anel 44 px, % e status | `/planejar/metas/[id]` |
| Insight | no máximo 1 por vez; dispensável | relatório relacionado |

Estados: primeira vez (sem lançamentos) → cards substituídos por um checklist "Comece por aqui" (Adicionar 1º gasto · Criar orçamento · Instalar o app). Carregando → skeleton por bloco (streaming independente). Modo discreto → todos os valores `R$ ••••`.

### 6.4 Extrato

**Objetivo**: encontrar e conferir lançamentos rapidamente.

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
- **Filtros** (`⚙`): sheet com seções Período, Contas (multi), Categorias (multi, com subcategorias), Tipo, Status, Tags, Valor (mín./máx.). Rodapé: "Limpar" e "Ver 42 lançamentos" (contagem ao vivo).
- **Resumo** reflete exatamente o filtro aplicado.
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
| Categoria | 6 mais usadas para o tipo, ordenadas por frequência dos últimos 90 dias, + chip "Todas" (sheet com grade 4 colunas, busca e subcategorias). Se uma regra aprendida casar com a descrição, a categoria vem selecionada com o selo "sugerida" |
| Data | "Hoje" por padrão; "Ontem"; ícone de calendário abre DatePicker. Data futura → status vira **Agendado** automaticamente (com aviso discreto) |
| Conta | última usada; ao escolher cartão de crédito, aparece "Entra na fatura de novembro" (calculado pelo fechamento) |
| Pago | switch, ligado para datas ≤ hoje |
| Mais opções | **Parcelar**: stepper 2–72 com prévia "6x de R$ 99,98" (e "1ª parcela R$ 100,00" se houver sobra de centavos). **Repetir**: Nunca · Toda semana · Todo mês · Todo ano · Personalizado; término: nunca / data / após N vezes. **Tags**, **Nota**, **Anexo** (câmera ou galeria, miniatura com remover) |
| Salvar | rótulo acompanha o tipo ("Salvar despesa" / "Salvar receita" / "Transferir"). Desabilitado só com valor 0 e com o motivo visível ("Digite um valor"). Ao salvar: fecha, toast "Despesa de R$ 64,50 salva · Desfazer", vibração curta, linha aparece no extrato com realce |
| Continuar adicionando | caixa "Adicionar outra em seguida" (lembrada): mantém a sheet, limpa valor e descrição, mantém data e conta |
| Fechar | arrastar, `✕` ou voltar. Se houver conteúdo, guarda **rascunho** por 10 min; ao reabrir: "Rascunho restaurado · Limpar". Sem diálogo de confirmação |
| Desktop | diálogo de 480 px, sem teclado na tela; `Enter` salva; `Tab` percorre na ordem visual |

### 6.6 Detalhe e edição do lançamento

- Topo: ícone da categoria 56 px, valor `display`, descrição `title-3`, status como selo.
- Lista agrupada (estilo ajustes) com linhas editáveis: Categoria, Conta, Data, Status, Tags, Nota, Anexo (miniatura que abre em tela cheia com zoom por pinça).
- **Parcelado**: bloco "Parcela 2 de 6 · total R$ 599,88" com linha do tempo horizontal das 6 parcelas (pagas preenchidas, futuras vazadas) e ação "Antecipar parcelas".
- **Recorrente**: "Repete todo mês no dia 16" + "Editar recorrência". Ao salvar mudanças, sheet de escopo: **Só este** · **Este e os próximos** · **Todos**.
- Ações no rodapé: Duplicar (`secondary`), Excluir (`ghost` em `--danger`, com Desfazer).

### 6.7 Contas

- Herói: **Patrimônio líquido** (`display`) = soma de todas as contas incluídas, cartões como passivo.
- Grupos: **Disponível** (corrente, dinheiro) · **Investimentos** (com rendimento configurado: "102% do CDI") · **Cartões de crédito** (fatura atual + limite disponível) · **Arquivadas** (recolhido). Cada grupo com subtotal.
- Reordenar por arrastar (alça à direita, modo "Editar").
- **Detalhe da conta**: saldo `display`, gráfico de área de 6 meses (série única), ações em linha (Transferir · Ajustar saldo · Editar), extrato da conta. "Ajustar saldo" pede o saldo real e cria um lançamento de ajuste com a diferença, explicando: "Vamos registrar −R$ 12,40 como ajuste."

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
- Limite disponível considera **parcelas futuras** (texto de apoio: "R$ 399,92 comprometidos em parcelas futuras").
- **Pagar fatura** (sheet): valor sugerido = saldo em aberto (editável para pagamento parcial), conta de origem (padrão do cartão), data. Gera transferência conta → cartão.
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
| **Patrimônio** | patrimônio líquido mês a mês; ativos × passivos em gráficos separados (pequenos múltiplos) | área de série única |
| **Calendário** | gasto por dia em mapa de calor (escala sequencial de um tom); toque no dia → lançamentos | heatmap mensal |

- Filtro de período **um só**, acima de tudo, vale para todas as visões.
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
- **Preferências**: tema (Sistema · Claro · Escuro), início do mês financeiro, abrir em modo discreto, regime dos relatórios; dicas de uso ("Mostrar dicas nas telas" e "Rever dicas", §6.16).
- **Organização**: categorias (editar, mesclar, reordenar), tags, contas e cartões.
- **Notificações**: contas a vencer (com antecedência), fatura fechando, orçamento 80%/100%, metas, resumo semanal por e-mail (fase posterior); horário silencioso.
- **Dados**: importar, exportar tudo (backup em ZIP), **apagar todos os dados** (zona de perigo no fim, `--danger`): o diálogo pede para digitar "apagar"; apaga os dados financeiros e os anexos, mantém o acesso (senha e passkeys) e volta ao onboarding.
- **Sobre**: versão, "Instalar app".

### 6.15 Notificações (central)

Sheet aberta pelo sino: lista agrupada (Hoje / Esta semana), cada item com ícone, texto curto e ação direta ("Marcar como pago", "Ver orçamento"). Deslizar dispensa. "Marcar todas como lidas".

### 6.16 Dicas e novidades

Balões curtos que apontam o que fazer, na primeira visita a cada tela, e avisos do que chegou ao app.

| Tipo | Para quem | Rótulo |
|---|---|---|
| **Primeiros passos** | todo mundo, na primeira vez que chega à tela | "Dica 1 de 3" com `lightbulb` |
| **Novidade** | só contas criadas **antes** da data dela (para quem é nova, aquilo sempre existiu) | "Novidade" com `sparkles` |

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
- **Novidades** (Ajustes › Novidades): lista por data, com selo "Nova" até a visita, que as marca como lidas. Não lidas mostram um ponto `--primary` no avatar do Início e em Ajustes na barra lateral (nunca `--danger`: não é alerta) e a contagem na linha de Ajustes.
- **Preferências**: "Mostrar dicas nas telas" liga e desliga os balões; "Rever dicas" mostra de novo os primeiros passos, a partir do Início (novidades continuam lidas).
- **Registro e estado**: as dicas ficam em `src/lib/tips/registry.ts` (id estável, rotas, âncora `data-tip`, textos, data, ordem, condição); o que cada pessoa viu fica na tabela `user_tips` (doc 01 §6.3) e acompanha a conta em qualquer aparelho.

---

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
| Valores muito longos | descrições: 1 linha com reticências; **valores nunca são cortados** — abaixo de 360 px usam formato compacto ("R$ 1,2 mi") com o valor completo no `aria-label` e no detalhe |

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
- Colunas: toque seleciona o mês (coluna em opacidade cheia, demais a 40%) e mostra os valores no topo do card.
- Áreas de toque ≥ 24 px de largura, mesmo para colunas finas.
- Teclado: setas percorrem os pontos; o tooltip acompanha o foco.
- Implementação recomendada do scrub: um `<input type="range">` transparente sobre a área do gráfico (`min=0`, `max=pontos−1`), com `aria-valuetext` descrevendo o ponto ("Ano 7: total R$ 149.697, investido R$ 94.000"). Ganha arrasto, toque, teclado e leitor de tela sem código extra — é o que o mockup do Simulador usa.

### 9.5 Acessibilidade de gráficos

- Todo gráfico tem **"Ver como tabela"** (mesmos dados, tabela acessível).
- `role="img"` + `aria-label` com resumo ("Receitas superaram despesas em 11 de 12 meses; maior despesa em dezembro, R$ 8.940").
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

### 10.4 Glossário (usar sempre estes termos)

Receita · Despesa · Transferência · Lançamento · Extrato · Conta · Cartão de crédito · Fatura (aberta, fechada, paga, vencida) · Parcelado (2/6) · Recorrente · Agendado (pendente futuro) · Pago · Orçamento · Ritmo · Meta · Aporte · Rentabilidade · Patrimônio · Saldo previsto · Competência · Caixa.

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
- **Texto**: suporta 200% de zoom sem perda; layout em `rem`; nada de `user-scalable=no`.
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
    background_color: '#F4F5F7',
    theme_color: '#F4F5F7',
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
