# 03 · Motor financeiro — Meu Finan

> Fórmulas e algoritmos de `src/lib/finance/`. Tudo aqui é **puro** (sem I/O, sem data/hora implícita, sem fuso): recebe dados, devolve dados. Roda igual no navegador (simulador instantâneo) e no servidor (metas, relatórios, cron). O código de referência abaixo foi executado contra todos os casos da §13.

**Sumário**

1. [Convenções](#1-convenções)
2. [Taxas e conversões](#2-taxas-e-conversões)
3. [Juros compostos: valor futuro](#3-juros-compostos-valor-futuro)
4. [Simulação mês a mês](#4-simulação-mês-a-mês)
5. [Imposto de renda regressivo](#5-imposto-de-renda-regressivo)
6. [Inflação e valores reais](#6-inflação-e-valores-reais)
7. [Cálculos reversos](#7-cálculos-reversos)
8. [Metas](#8-metas)
9. [Cartão de crédito: fatura e parcelas](#9-cartão-de-crédito-fatura-e-parcelas)
10. [Recorrência e período financeiro](#10-recorrência-e-período-financeiro)
11. [Orçamento: ritmo e "pode gastar por dia"](#11-orçamento-ritmo-e-pode-gastar-por-dia)
12. [Previsões e indicadores](#12-previsões-e-indicadores)
13. [Testes](#13-testes)

---

## 1. Convenções

| Tema | Regra |
|---|---|
| Dinheiro persistido | inteiro em **centavos** (`number` inteiro no TS, `bigint` no banco) |
| Dinheiro projetado | `number` em reais, sem arredondar durante o cálculo; arredonda **só na exibição** (2 casas, meio para cima) |
| Taxas | decimais: `0.01` = 1%. Sufixos no nome: `monthly`, `annual`, `daily` |
| Período de simulação | **mês**. Taxas anuais são convertidas por equivalência composta, nunca divididas por 12 |
| Datas | `LocalDate { year, month (1–12), day }` sem hora e sem fuso; o "hoje" é sempre parâmetro |
| Meses curtos | dia inexistente vira o último dia do mês (31 → 30/28/29) |

Utilitários de data:

```ts
export type LocalDate = { year: number; month: number; day: number };
export type YearMonth = { year: number; month: number };

export const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
export const atDay = (y: number, m: number, day: number): LocalDate =>
  ({ year: y, month: m, day: Math.min(day, daysInMonth(y, m)) });

export function addMonths(d: YearMonth, n: number): YearMonth {
  const idx = d.year * 12 + (d.month - 1) + n;
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
}

const toUTC = (d: LocalDate) => Date.UTC(d.year, d.month - 1, d.day);
export const compare = (a: LocalDate, b: LocalDate) => Math.sign(toUTC(a) - toUTC(b));
export const daysBetween = (a: LocalDate, b: LocalDate) => Math.round((toUTC(b) - toUTC(a)) / 86_400_000);
export function addDays(d: LocalDate, n: number): LocalDate {
  const t = new Date(toUTC(d) + n * 86_400_000);
  return { year: t.getUTCFullYear(), month: t.getUTCMonth() + 1, day: t.getUTCDate() };
}
```

---

## 2. Taxas e conversões

### 2.1 Fórmulas

| Conversão | Fórmula |
|---|---|
| anual → mensal | $i_m = (1 + i_a)^{1/12} - 1$ |
| mensal → anual | $i_a = (1 + i_m)^{12} - 1$ |
| anual → diária útil (CDI) | $i_d = (1 + i_a)^{1/252} - 1$ |
| **% do CDI** | aplica-se à taxa **diária**: $i_a^{p} = (1 + p \cdot i_d)^{252} - 1$ |
| IPCA + spread | $i_a = (1 + \pi)(1 + s) - 1$ |
| taxa real (Fisher) | $r = \dfrac{1 + i}{1 + \pi} - 1$ |
| poupança | Selic meta > 8,5% a.a. → 0,5% a.m. + TR; senão → 70% da Selic (mensalizada) + TR |

> **Atenção ao % do CDI**: 102% de um CDI de 13,65% a.a. **não** é 13,923% a.a. (`1,02 × 13,65%`). O percentual multiplica a taxa diária, e o resultado composto é **13,9411% a.a.** A diferença cresce com o prazo — mostrar o valor certo é um diferencial de confiança.

### 2.2 Código

```ts
export type RateInput =
  | { kind: 'monthly'; value: number }
  | { kind: 'annual'; value: number }
  | { kind: 'cdi'; pct: number; cdiAnnual: number }       // pct 1.02 = 102% do CDI
  | { kind: 'ipca'; spread: number; ipcaAnnual: number };  // IPCA + spread

export const annualToMonthly = (a: number) => Math.pow(1 + a, 1 / 12) - 1;
export const monthlyToAnnual = (m: number) => Math.pow(1 + m, 12) - 1;
export const realRate = (nominal: number, inflation: number) => (1 + nominal) / (1 + inflation) - 1;

export function toMonthlyRate(r: RateInput): number {
  switch (r.kind) {
    case 'monthly': return r.value;
    case 'annual': return annualToMonthly(r.value);
    case 'cdi': {
      const daily = Math.pow(1 + r.cdiAnnual, 1 / 252) - 1;
      return annualToMonthly(Math.pow(1 + daily * r.pct, 252) - 1);
    }
    case 'ipca': return annualToMonthly((1 + r.ipcaAnnual) * (1 + r.spread) - 1);
  }
}

export function savingsMonthlyRate(selicAnnual: number, trMonthly = 0) {
  return (selicAnnual > 0.085 ? 0.005 : annualToMonthly(0.7 * selicAnnual)) + trMonthly;
}
```

### 2.3 De onde vêm os índices

| Índice | Fonte (cron diário → `market_rates`) | Uso |
|---|---|---|
| CDI | SGS 4389 (CDI anualizado, base 252) | "% do CDI" no simulador, metas, contas de investimento |
| Selic meta | SGS 432 | regra da poupança, cenário de comparação |
| IPCA | SGS 433 (mensal) → acumulado 12 meses | inflação padrão do simulador, "IPCA +" |

O valor usado é sempre exibido com fonte e data ("CDI 13,65% a.a. · BCB, 13/out") e pode ser editado pelo usuário — a projeção é dele.

---

## 3. Juros compostos: valor futuro

Com valor inicial $PV$, aporte mensal $PMT$, taxa mensal $i$ e $n$ meses:

$$
FV = PV\,(1+i)^n \;+\; PMT \cdot \frac{(1+i)^n - 1}{i} \cdot (1 + i\,t)
$$

onde $t = 1$ se o aporte é no **início** do mês e $t = 0$ se no **fim** (padrão). Para $i = 0$: $FV = PV + PMT \cdot n$.

```ts
export function futureValue(pv: number, pmt: number, i: number, n: number, timing: 'start' | 'end' = 'end') {
  if (i === 0) return pv + pmt * n;
  const f = Math.pow(1 + i, n);
  return pv * f + pmt * ((f - 1) / i) * (timing === 'start' ? 1 + i : 1);
}
```

A fórmula fechada serve para metas e como **oráculo de teste**; o simulador usa a versão mês a mês (§4), que suporta IR, inflação e reajuste do aporte.

---

## 4. Simulação mês a mês

Por que um laço em vez da fórmula: precisamos da **série** (gráfico), do **ponto de virada** (mês em que os juros do mês superam o aporte), de **aportes que crescem** todo ano e do **IR por lote** de aporte. Com até 600 meses, o laço custa microssegundos — cabe em cada movimento de slider.

```ts
export type SimulationInput = {
  initial: number;                    // R$
  monthly: number;                    // aporte mensal (R$)
  months: number;                     // 0..600
  rate: RateInput;
  timing?: 'start' | 'end';           // padrão 'end'
  contributionGrowthAnnual?: number;  // 0.05 → aporte sobe 5% a cada 12 meses
  inflationAnnual?: number;           // para valores reais
  tax?: 'none' | 'regressive' | 'exempt';
};

export type SimulationPoint = {
  month: number; invested: number; balance: number;
  interest: number; interestThisMonth: number; realBalance: number;
};

export type SimulationResult = {
  monthlyRate: number;
  series: SimulationPoint[];          // month 0..n
  crossoverMonth: number | null;      // 1º mês com juros do mês ≥ aporte do mês
  final: { invested: number; gross: number; interest: number; tax: number; net: number; netReal: number };
};

export function simulate(input: SimulationInput): SimulationResult {
  const i = toMonthlyRate(input.rate);
  const n = input.months;
  const timing = input.timing ?? 'end';
  const growth = input.contributionGrowthAnnual ?? 0;
  const inflationMonthly = input.inflationAnnual ? annualToMonthly(input.inflationAnnual) : 0;

  const lots: { month: number; amount: number }[] = [];   // cada aporte e quando entrou
  let balance = input.initial;
  let invested = input.initial;
  if (input.initial > 0) lots.push({ month: 0, amount: input.initial });

  const series: SimulationPoint[] = [
    { month: 0, invested, balance, interest: 0, interestThisMonth: 0, realBalance: balance },
  ];
  let crossoverMonth: number | null = null;

  for (let m = 1; m <= n; m++) {
    const pmt = input.monthly * Math.pow(1 + growth, Math.floor((m - 1) / 12));
    if (timing === 'start' && pmt > 0) { balance += pmt; invested += pmt; lots.push({ month: m - 1, amount: pmt }); }
    const interestThisMonth = balance * i;
    balance += interestThisMonth;
    if (timing === 'end' && pmt > 0) { balance += pmt; invested += pmt; lots.push({ month: m, amount: pmt }); }
    if (crossoverMonth === null && pmt > 0 && interestThisMonth >= pmt) crossoverMonth = m;
    series.push({
      month: m, invested, balance, interest: balance - invested, interestThisMonth,
      realBalance: balance / Math.pow(1 + inflationMonthly, m),
    });
  }

  let tax = 0;
  if (input.tax === 'regressive') {
    for (const lot of lots) {
      const held = n - lot.month;                                   // meses aplicados até o resgate
      const gain = lot.amount * (Math.pow(1 + i, held) - 1);
      tax += gain * incomeTaxRate(monthsToDays(held));
    }
  }
  const net = balance - tax;
  return {
    monthlyRate: i,
    series,
    crossoverMonth,
    final: {
      invested, gross: balance, interest: balance - invested, tax, net,
      netReal: net / Math.pow(1 + inflationMonthly, n),
    },
  };
}
```

Saídas usadas pela interface (doc 02 §6.11):

| Campo | Rótulo na tela |
|---|---|
| `final.gross` | "Em 10 anos você terá" (herói) |
| `final.net` | chip "Líquido de IR" |
| `final.netReal` | chip "Em valores de hoje" |
| `final.invested` / `final.interest` | barra "Investido × Juros" |
| `series` (amostrada por ano no celular) | gráfico de área empilhada |
| `crossoverMonth` | insight "A partir do 6º ano, os juros do mês passam a render mais que o aporte" |
| `netReal × realRate mensal` | "Renda mensal estimada sem consumir o capital (valores de hoje)" |

---

## 5. Imposto de renda regressivo

Tabela da renda fixa (CDB, Tesouro, debêntures não incentivadas), sobre o **rendimento**, pelo prazo de cada aplicação:

| Prazo | Alíquota |
|---|---|
| até 180 dias | 22,5% |
| 181 a 360 dias | 20% |
| 361 a 720 dias | 17,5% |
| acima de 720 dias | 15% |

Como cada aporte mensal é uma aplicação com prazo próprio, o imposto é calculado **por lote**: o aporte do mês $k$ fica aplicado $n - k$ meses até o resgate, rende $a_k[(1+i)^{n-k} - 1]$ e paga a alíquota do seu prazo. Meses viram dias por $365{,}25/12$ — 12 meses = 365 dias (17,5%), não 360 (20%).

```ts
const IR_TABLE: ReadonlyArray<readonly [number, number]> = [[180, 0.225], [360, 0.2], [720, 0.175], [Infinity, 0.15]];
export const incomeTaxRate = (days: number) => IR_TABLE.find(([max]) => days <= max)![1];
export const monthsToDays = (months: number) => Math.round((months * 365.25) / 12);
```

Fora do escopo (avisado na tela): IOF (resgates < 30 dias), come-cotas de fundos (maio/novembro), isenção de IR para ações. `tax: 'exempt'` cobre LCI/LCA e poupança.

---

## 6. Inflação e valores reais

- Valor real no mês $m$: $V^{real}_m = V_m / (1 + \pi_m)^m$, com $\pi_m$ = inflação mensal equivalente.
- Mostrado como "em valores de hoje": quanto aquele dinheiro futuro compraria hoje.
- Renda passiva estimada (sem consumir o capital): $V^{real}_n \times r_m$, com $r_m$ = taxa real mensal (Fisher).
- Inflação padrão: IPCA acumulado em 12 meses (editável); pode usar expectativa do Focus quando disponível.

---

## 7. Cálculos reversos

### 7.1 Fórmulas fechadas (sem IR e sem reajuste)

| Pergunta | Fórmula |
|---|---|
| Quanto aportar por mês? | $PMT = \dfrac{(FV - PV(1+i)^n)\,i}{\big((1+i)^n - 1\big)(1 + i\,t)}$ |
| Em quantos meses? | $n = \dfrac{\ln\big((FV\,i + PMT')/(PV\,i + PMT')\big)}{\ln(1+i)}$, com $PMT' = PMT(1 + i\,t)$; arredonda para cima |

```ts
export function requiredPayment(fv: number, pv: number, i: number, n: number, timing: 'start' | 'end' = 'end') {
  if (n <= 0) return Infinity;
  if (i === 0) return Math.max(0, (fv - pv) / n);
  const f = Math.pow(1 + i, n);
  return Math.max(0, ((fv - pv * f) * i) / ((f - 1) * (timing === 'start' ? 1 + i : 1)));
}

export function periodsToReach(fv: number, pv: number, pmt: number, i: number, timing: 'start' | 'end' = 'end'): number | null {
  if (pv >= fv) return 0;
  const p = pmt * (timing === 'start' ? 1 + i : 1);
  if (i === 0) return p > 0 ? (fv - pv) / p : null;
  const num = fv * i + p;
  const den = pv * i + p;
  if (num <= 0 || den <= 0) return null;   // inatingível
  return Math.log(num / den) / Math.log(1 + i);
}
```

### 7.2 Solvers genéricos (com IR, inflação e reajuste)

Os modos "Quanto investir" e "Em quanto tempo" do simulador precisam respeitar IR e inflação, que não têm forma fechada. Como o resultado é **monotônico** no aporte e no prazo (o líquido de cada lote cresce com o tempo, porque o ganho cresce e a alíquota cai), usamos bisseção sobre `simulate`:

```ts
type Measure = 'gross' | 'net' | 'netReal';

export function solveMonthly(target: number, base: Omit<SimulationInput, 'monthly'>, measure: Measure = 'net'): number | null {
  const reach = (pmt: number) => simulate({ ...base, monthly: pmt }).final[measure];
  if (reach(0) >= target) return 0;
  let lo = 0;
  let hi = Math.max(target, 1);
  for (let k = 0; reach(hi) < target; k++) {
    if (k > 40) return null;
    hi *= 2;
  }
  for (let k = 0; k < 60; k++) {
    const mid = (lo + hi) / 2;
    if (reach(mid) >= target) hi = mid;
    else lo = mid;
  }
  return Math.ceil(hi * 100) / 100;   // arredonda para cima ao centavo: garante atingir
}

export function solveMonths(target: number, base: Omit<SimulationInput, 'months'>, measure: Measure = 'net', maxMonths = 600): number | null {
  const reach = (n: number) => simulate({ ...base, months: n }).final[measure];
  if (reach(0) >= target) return 0;
  if (reach(maxMonths) < target) return null;   // "não chega em 50 anos"
  let lo = 0;
  let hi = maxMonths;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (reach(mid) >= target) hi = mid;
    else lo = mid;
  }
  return hi;
}
```

Custo: ~60 simulações de até 600 meses → < 5 ms no celular. Se a taxa real for negativa, `netReal` pode cair com o tempo — nesse caso a UI informa "Com essa taxa, o dinheiro perde para a inflação" e resolve sobre o valor bruto.

---

## 8. Metas

Entradas: guardado hoje, alvo, aporte mensal planejado, taxa mensal esperada (CDI/prefixado/IPCA+ ou 0), prazo opcional. A projeção começa no mês seguinte ao atual.

```ts
export type GoalStatus = 'achieved' | 'ahead' | 'on_track' | 'behind' | 'no_plan';

export function projectGoal(g: {
  currentCents: number; targetCents: number; monthlyCents: number; monthlyRate: number;
  today: YearMonth; targetMonth?: YearMonth;
}) {
  if (g.currentCents >= g.targetCents) return { status: 'achieved' as GoalStatus, eta: null, requiredMonthlyCents: 0 };
  const n = periodsToReach(g.targetCents, g.currentCents, g.monthlyCents, g.monthlyRate);
  const eta = n === null ? null : addMonths(g.today, Math.ceil(n));
  let status: GoalStatus = eta ? 'on_track' : 'no_plan';
  let requiredMonthlyCents: number | null = null;
  if (g.targetMonth) {
    const monthsLeft = (g.targetMonth.year - g.today.year) * 12 + (g.targetMonth.month - g.today.month);
    requiredMonthlyCents = Math.ceil(requiredPayment(g.targetCents, g.currentCents, g.monthlyRate, monthsLeft) / 100) * 100;
    if (!eta) status = 'behind';
    else {
      const slack = (g.targetMonth.year - eta.year) * 12 + (g.targetMonth.month - eta.month);
      status = slack < 0 ? 'behind' : slack >= 2 ? 'ahead' : 'on_track';
    }
  }
  return { status, eta, requiredMonthlyCents };
}
```

| Status | Texto na tela |
|---|---|
| `on_track` | "No ritmo atual, você chega lá em ago/2027." |
| `ahead` | "Chega em ago/2029, 4 meses antes do prazo." |
| `behind` | "Para chegar em dez/2027, aporte R$ 931/mês (hoje: R$ 800)." |
| `no_plan` | "Defina um aporte mensal para ver quando você chega lá." |
| `achieved` | "Meta atingida!" |

O aporte necessário é arredondado **para cima ao real inteiro** (R$ 930,22 → R$ 931): mais fácil de lembrar e garante o prazo. Metas projetam valor **bruto** (antes de IR), indicado com "valores brutos" na tela de detalhe.

---

## 9. Cartão de crédito: fatura e parcelas

### 9.1 Em qual fatura cai uma compra

Regras:

1. O fechamento do mês é `closingDay` ajustado ao tamanho do mês.
2. Compra **no dia do fechamento ou depois** vai para a fatura seguinte — por isso o "melhor dia de compra" é o próprio dia do fechamento. (Alguns emissores usam o dia seguinte; se necessário, expor como configuração do cartão.)
3. Vencimento no mesmo mês do fechamento se `dueDay > closingDay`; senão, no mês seguinte.
4. A fatura é identificada pelo **mês do vencimento** (`reference_month`).

```ts
export type CardCycle = { closingDay: number; dueDay: number };

export function invoiceFor(purchase: LocalDate, card: CardCycle) {
  let closing = atDay(purchase.year, purchase.month, card.closingDay);
  if (compare(purchase, closing) >= 0) {
    const n = addMonths(purchase, 1);
    closing = atDay(n.year, n.month, card.closingDay);
  }
  const dueYM = card.dueDay > card.closingDay ? closing : addMonths(closing, 1);
  const due = atDay(dueYM.year, dueYM.month, card.dueDay);
  return { closingDate: closing, dueDate: due, referenceMonth: { year: due.year, month: due.month } };
}
```

### 9.2 Parcelamento

- Divisão em centavos: parcela base = ⌊total / n⌋; a **sobra vai para a 1ª parcela** (como nos extratos dos bancos). A soma sempre fecha com o total.
- Parcela $k$: data = compra + $(k-1)$ meses, **sempre a partir do dia original** (31/jan → 28/fev → 31/mar, sem "escorregar"); fatura = fatura da 1ª parcela + $(k-1)$ meses (consecutivas).
- Em relatórios por competência, cada parcela conta no mês da sua data — uma compra de 6x não pesa inteira no mês da compra.
- Limite comprometido = fatura atual em aberto + parcelas futuras.

```ts
export function splitInstallments(totalCents: number, count: number): number[] {
  const base = Math.floor(totalCents / count);
  const remainder = totalCents - base * count;
  return Array.from({ length: count }, (_, k) => (k === 0 ? base + remainder : base));
}

export function installmentSchedule(purchase: LocalDate, totalCents: number, count: number, card?: CardCycle) {
  const amounts = splitInstallments(totalCents, count);
  const first = card ? invoiceFor(purchase, card).referenceMonth : null;
  return amounts.map((amountCents, k) => {
    const ym = addMonths(purchase, k);
    return {
      number: k + 1,
      amountCents,
      occurredOn: atDay(ym.year, ym.month, purchase.day),
      invoiceMonth: first ? addMonths(first, k) : null,
    };
  });
}
```

### 9.3 Estado da fatura (derivado)

| Estado | Condição (com `hoje`) |
|---|---|
| Aberta | `hoje < closing_date` |
| Fechada | `closing_date ≤ hoje ≤ due_date` e pago < total |
| Paga | pagamentos (transferências com `invoice_id`) ≥ total |
| Vencida | `hoje > due_date` e pago < total |

Total = − Σ `amount_cents` das compras/estornos da fatura; pago = Σ pagamentos vinculados. Pagamento parcial deixa saldo em aberto visível na fatura (o rotativo/juros do emissor ficam fora do escopo; o usuário lança encargos como despesa da categoria "Impostos e taxas").

---

## 10. Recorrência e período financeiro

### 10.1 Ocorrências

```ts
export type Recurrence = {
  freq: 'daily' | 'weekly' | 'monthly' | 'yearly';
  interval: number; start: LocalDate; end?: LocalDate; byMonthDay?: number;
};

export function occurrencesBetween(r: Recurrence, from: LocalDate, to: LocalDate): LocalDate[] {
  const out: LocalDate[] = [];
  for (let k = 0; k < 10_000; k++) {
    let d: LocalDate;
    if (r.freq === 'daily') d = addDays(r.start, k * r.interval);
    else if (r.freq === 'weekly') d = addDays(r.start, 7 * k * r.interval);
    else {
      const step = r.freq === 'monthly' ? k * r.interval : 12 * k * r.interval;
      const ym = addMonths(r.start, step);
      d = atDay(ym.year, ym.month, r.byMonthDay ?? r.start.day);
    }
    if (compare(d, to) > 0 || (r.end && compare(d, r.end) > 0)) break;
    if (compare(d, from) >= 0) out.push(d);
  }
  return out;
}
```

- Cada ocorrência é calculada **a partir da regra**, não da anterior: "todo dia 31" vira 28/fev e volta a 31/mar; 29/fev anual vira 28/fev em anos não bissextos.
- Materialização: o cron cria lançamentos `pending` até hoje + 60 dias e avança `generated_until`. Índice único (`recurrence_id`, `occurred_on`) garante idempotência.
- Edição com escopo:
  - **Só este**: altera a linha (ela continua ligada à regra).
  - **Este e os próximos**: encerra a regra em `data − 1`, cria regra nova a partir de `data` e regenera os pendentes futuros.
  - **Todos**: altera a regra e os pendentes futuros; lançamentos já pagos não mudam.

### 10.2 Mês financeiro

Com dia de início $s \in [1, 28]$ (limitado a 28 para todo mês ter esse dia), o período que contém a data $d$ começa em $s$ do mês de $d$ se `d.day ≥ s`, senão em $s$ do mês anterior; termina na véspera do próximo início. O rótulo é o mês do início ("outubro" = 5/out – 4/nov).

```ts
export function periodContaining(date: LocalDate, startDay: number) {
  const startYM = date.day >= startDay ? date : addMonths(date, -1);
  const start = atDay(startYM.year, startYM.month, startDay);
  const next = addMonths(start, 1);
  const end = addDays(atDay(next.year, next.month, startDay), -1);
  return { start, end, label: { year: start.year, month: start.month } };
}
```

No SQL, agrupa-se por `date_trunc('month', occurred_on - (s - 1))` (doc 01 §6.5).

---

## 11. Orçamento: ritmo e "pode gastar por dia"

Definições para um período de $D$ dias, hoje sendo o dia $E$ (inclusive):

| Grandeza | Fórmula |
|---|---|
| Fração decorrida (marcador "hoje") | $E / D$ |
| Gasto esperado até hoje | $B \cdot E / D$ |
| Disponível | $B - \text{gasto} - \text{agendado}$ |
| Pode gastar por dia | $\max(0, \text{disponível}) / (D - E + 1)$ — inclui hoje |
| Projeção de fim de período (a partir do 5º dia) | $\text{gasto}/E \cdot D + \text{agendado}$ |

Estados (sempre exibidos com ícone + rótulo):

| Estado | Condição |
|---|---|
| `over` — Estourou | gasto > orçamento |
| `scheduled` — Agendado | gasto = 0 e há agendado (contas fixas, ex.: aluguel) |
| `ahead` — Acima do ritmo | gasto > 110% do esperado **e** gasto ≥ 25% do orçamento (evita alarme no início do mês) |
| `on_track` — No ritmo | demais casos |

```ts
export type BudgetStatus = 'on_track' | 'ahead' | 'over' | 'scheduled';

export function budgetPace(a: {
  budgetCents: number; spentCents: number; scheduledCents: number;
  period: { start: LocalDate; end: LocalDate }; today: LocalDate;
}) {
  const totalDays = daysBetween(a.period.start, a.period.end) + 1;
  const elapsedDays = Math.min(totalDays, Math.max(0, daysBetween(a.period.start, a.today) + 1));
  const remainingDays = totalDays - elapsedDays + 1;
  const elapsedRatio = elapsedDays / totalDays;
  const expectedCents = a.budgetCents * elapsedRatio;
  const availableCents = a.budgetCents - a.spentCents - a.scheduledCents;
  const perDayCents = remainingDays > 0 ? Math.max(0, Math.floor(availableCents / remainingDays)) : 0;
  let status: BudgetStatus = 'on_track';
  if (a.spentCents > a.budgetCents) status = 'over';
  else if (a.spentCents === 0 && a.scheduledCents > 0) status = 'scheduled';
  else if (a.spentCents > expectedCents * 1.1 && a.spentCents >= a.budgetCents * 0.25) status = 'ahead';
  const projectedCents = elapsedDays >= 5 ? Math.round((a.spentCents / elapsedDays) * totalDays) + a.scheduledCents : null;
  return { totalDays, elapsedDays, remainingDays, elapsedRatio, expectedCents, availableCents, perDayCents, status, projectedCents };
}
```

Exemplo (mockups): orçamento R$ 4.500, gasto R$ 1.445, aluguel agendado R$ 2.100, 14/out de 31 dias → disponível R$ 955, **R$ 53,05 por dia** nos 18 dias restantes, marcador em 45%.

"Gasto" de uma categoria = − Σ despesas efetivadas da categoria (e subcategorias) no período, incluindo compras no cartão pela data da compra; estornos reduzem o gasto. "Agendado" = despesas pendentes da categoria com data dentro do período.

Rollover (opcional por orçamento): sobra (ou excesso) do mês anterior soma ao orçamento do mês atual.

---

## 12. Previsões e indicadores

| Indicador | Definição |
|---|---|
| **Saldo em contas** | Σ saldos efetivados das contas com `include_in_net_worth`, exceto cartões |
| **Saldo previsto (fim do período)** | saldo em contas + receitas pendentes − despesas pendentes (com data ≤ fim do período, **fora de cartões**) − saldo em aberto das faturas com vencimento ≤ fim do período. Compras pendentes no cartão já estão dentro da fatura — não contar duas vezes |
| **Patrimônio líquido** | Σ saldos de todas as contas incluídas (cartões entram negativos) |
| **Taxa de poupança** | (receitas − despesas) / receitas no período, sem transferências; **só meses completos** quando o período inclui o mês corrente (no mockup: 26,8% de nov/25 a set/26) |
| **Fluxo de caixa diário** | saldo acumulado dia a dia: realizado até hoje; projeção com os pendentes conhecidos até o fim do período |
| **Variação de categoria** | gasto no período ÷ média dos 3 períodos anteriores **no mesmo ponto do período** (dias 1..E) − 1 |

Exemplo (mockups, 14/out): saldo R$ 27.670,15 − aluguel R$ 2.100,00 − internet R$ 119,90 − fatura R$ 1.380,42 + freelance R$ 650,00 = **previsto R$ 24.719,83**.

Regras de insight (no máximo 1 por vez no Início; cada uma com `dedupe_key` mensal):

| Regra | Condição | Texto |
|---|---|---|
| Categoria abaixo da média | variação ≤ −20% e diferença ≥ R$ 50 | "Até hoje, você gastou 32% menos com Transporte do que a média dos últimos 3 meses." |
| Categoria acima da média | variação ≥ +25% e diferença ≥ R$ 80 | "Restaurantes está 40% acima do seu normal para esta altura do mês." |
| Assinaturas | Σ recorrentes da categoria Assinaturas | "Suas assinaturas somam R$ 164,80 por mês." |
| Fatura crescendo | fatura atual ≥ 120% da média das 3 anteriores | "A fatura do Cartão Principal está 22% maior que o normal." |
| Meta perto | progresso ≥ 90% | "Faltam R$ 1.200 para a meta Viagem ao Japão." |

---

## 13. Testes

Ferramentas: Vitest 5 + fast-check 4. Cobertura mínima de 95% em `lib/finance`.

### 13.1 Casos de referência (todos verificados com o código acima)

| Caso | Entrada | Esperado |
|---|---|---|
| Valor futuro simples | PV 1.000 · 1% a.m. · 12 meses | **1.126,83** |
| Aportes no fim | PMT 100 · 1% a.m. · 12 meses | **1.268,25** |
| Aportes no início | PMT 100 · 1% a.m. · 12 meses | **1.280,93** |
| Conversão | 12% a.a. → a.m. | **0,948879%** |
| % do CDI | 102% de CDI 13,65% a.a. | **13,9411% a.a.** |
| Simulação padrão | 10.000 + 1.000/mês · 12% a.a. · 120 meses · IR regressivo · IPCA 4,5% | bruto **252.988,52** · IR **18.538,31** · líquido **234.450,21** · em valores de hoje **150.968,98** · virada no **mês 65** |
| Aporte necessário | alvo 25.000 · PV 9.500 · 100% do CDI (13,65%) · 14 meses | **930,22** (fórmula = solver) |
| Prazo | alvo 30.000 · PV 18.600 · PMT 1.000 · 102% do CDI | 9,06 → **10 meses** (fórmula = solver) |
| Aporte com IR | alvo líquido 100.000 · 60 meses · 12% a.a. · IR regressivo | **1.295,34** |
| Parcelas | R$ 100,00 em 3x | **[33,34; 33,33; 33,33]** |
| Fatura (fecha 17, vence 25) | compra 14/out/26 · 17/out/26 · 31/out/26 · 20/dez/26 | vence 25/out · 25/nov · 25/nov · 25/jan/27 |
| Fatura (fecha 28, vence 5) | compra 10/out/26 · 28/out/26 | vence 05/nov · 05/dez |
| Fatura (fecha 31, vence 10) | compra 15/fev/26 · 28/fev/26 | fecha 28/fev, vence 10/mar · fecha 31/mar, vence 10/abr |
| Parcelas em fim de mês | 31/jan/27 em 3x (fecha 17) | datas 31/jan · 28/fev · 31/mar; faturas fev · mar · abr |
| Recorrência mensal dia 31 | jan–abr/26 | 31/jan · 28/fev · 31/mar · 30/abr |
| Recorrência anual 29/fev | 2024–2028 | 29/fev/24 · 28/fev/25 · 28/fev/26 · 28/fev/27 · 29/fev/28 |
| Recorrência quinzenal | início 02/out/26, janela 10/out–15/nov | 16/out · 30/out · 13/nov |
| Mês financeiro (início dia 5) | 04/out/26 | 05/set/26 – 04/out/26 |
| Orçamento | 4.500 · gasto 1.445 · agendado 2.100 · 14/out | **R$ 53,05/dia**, 18 dias restantes |
| Estados de orçamento | Mercado 640/900 · Restaurantes 410/400 · Transporte 180/450 · Moradia 0+2.100/2.100 | acima do ritmo · estourou · no ritmo · agendado |
| Metas | Reserva 18.600→30.000, 1.000/mês, 102% CDI · Japão 9.500→25.000 até dez/27, 800/mês, 100% CDI · Carro 4.200→40.000 até dez/29, 900/mês, IPCA+6% (IPCA 4,5%) | ago/2027 no ritmo · fev/2028 atrasada, precisa **R$ 931/mês** · ago/2029 adiantada |

### 13.2 Propriedades (fast-check)

- `simulate` sem IR/reajuste == `futureValue` (erro < 10⁻⁶) para quaisquer PV, PMT ≥ 0, taxa ∈ [0, 5% a.m.], n ∈ [0, 600].
- `simulate(...requiredPayment(...))` atinge o alvo; `periodsToReach` é o menor inteiro que atinge.
- `final.net` é não decrescente em `months` e em `monthly`; `final.tax ≥ 0`; `net ≥ invested`.
- `Σ splitInstallments(total, n) === total` e todas as parcelas diferem em no máximo `n − 1` centavos da base.
- `invoiceFor`: o vencimento é sempre posterior ao fechamento; faturas de compras em datas crescentes nunca retrocedem.
- `occurrencesBetween`: datas estritamente crescentes; nenhuma fora de `[from, to]` ou depois de `end`.
- `periodContaining(d).start ≤ d ≤ end`, e períodos consecutivos não se sobrepõem nem deixam buraco.
