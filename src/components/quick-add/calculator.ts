/**
 * Calculator-style amount entry of the quick-add keypad (doc 02 §5.5), as pure
 * functions over an expression string such as "120+35,5". Operands are typed
 * in reais with a decimal comma; every result is integer cents.
 *
 * Rules: "35" = R$ 35,00; "," starts the cents (at most 2 digits); at most 9
 * integer digits; leading zeros collapse; an operator after an operator
 * replaces it; "=" resolves the expression and refuses results ≤ 0.
 */

export const OPERATORS = ["+", "−"] as const;
export type Operator = (typeof OPERATORS)[number];

export type DigitKey =
  | "0"
  | "1"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "00";

export type CalcKey = DigitKey | "," | Operator | "=" | "back" | "clear";

export const MAX_INTEGER_DIGITS = 9;
export const MAX_DECIMAL_DIGITS = 2;
/** Same ceiling as the server schema (R$ 999.999.999,99). */
export const MAX_AMOUNT_CENTS = 99_999_999_999;

export type CalcError = "not-positive" | "too-large";

export type PressResult = {
  expression: string;
  /** Set only when "=" cannot resolve to a valid amount. */
  error: CalcError | null;
};

const MINUS = "−";

export function isOperator(char: string | undefined): char is Operator {
  return char === "+" || char === MINUS;
}

/** The operand being typed: everything after the last operator. */
export function currentOperand(expression: string): string {
  for (let index = expression.length - 1; index >= 0; index -= 1) {
    if (isOperator(expression[index])) return expression.slice(index + 1);
  }
  return expression;
}

export function hasOperator(expression: string): boolean {
  return [...expression].some((char) => isOperator(char));
}

function appendDigits(expression: string, key: DigitKey): string {
  const operand = currentOperand(expression);
  const head = expression.slice(0, expression.length - operand.length);
  const comma = operand.indexOf(",");

  if (comma >= 0) {
    const decimals = operand.length - comma - 1;
    if (decimals + key.length > MAX_DECIMAL_DIGITS) return expression;
    return expression + key;
  }

  // Leading zeros collapse: "0" + "5" = "5", "" + "00" = "0".
  const integer = `${operand}${key}`.replace(/^0+(?=\d)/, "");
  if (integer.length > MAX_INTEGER_DIGITS) return expression;
  return head + integer;
}

function appendComma(expression: string): string {
  const operand = currentOperand(expression);
  if (operand.includes(",")) return expression;
  return expression + (operand === "" ? "0," : ",");
}

function appendOperator(expression: string, operator: Operator): string {
  if (expression === "") return expression;
  const last = expression.at(-1);
  // "12," + "+" = "12+"; "12+" + "−" = "12−".
  const trimmed =
    isOperator(last) || last === "," ? expression.slice(0, -1) : expression;
  if (trimmed === "") return expression;
  return trimmed + operator;
}

/** Applies one key. Keys that do not fit the rules leave the expression as is. */
export function press(expression: string, key: CalcKey): PressResult {
  switch (key) {
    case "clear":
      return { expression: "", error: null };
    case "back":
      return { expression: expression.slice(0, -1), error: null };
    case ",":
      return { expression: appendComma(expression), error: null };
    case "+":
    case "−":
      return { expression: appendOperator(expression, key), error: null };
    case "=":
      return resolve(expression);
    default:
      return { expression: appendDigits(expression, key), error: null };
  }
}

/** "=": the expression becomes its result, which must be a valid amount. */
export function resolve(expression: string): PressResult {
  const cents = evaluate(expression);
  if (cents === null) return { expression, error: null };
  const error = validateAmount(cents);
  if (error) return { expression, error };
  return { expression: centsToExpression(cents), error: null };
}

export function validateAmount(cents: number): CalcError | null {
  if (cents <= 0) return "not-positive";
  if (cents > MAX_AMOUNT_CENTS) return "too-large";
  return null;
}

/** "1234,5" → 123450. An empty operand is zero. */
export function operandToCents(operand: string): number {
  const [integer = "", decimals = ""] = operand.split(",");
  const reais = integer === "" ? 0 : Number(integer);
  const cents = Number(decimals.padEnd(MAX_DECIMAL_DIGITS, "0").slice(0, 2));
  return reais * 100 + cents;
}

/**
 * Value of the expression in cents (may be negative), ignoring a trailing
 * operator or comma; `null` when nothing was typed.
 */
export function evaluate(expression: string): number | null {
  if (expression === "") return null;
  let total = 0;
  let operator: Operator = "+";
  let operand = "";
  for (const char of expression) {
    if (isOperator(char)) {
      total += (operator === "+" ? 1 : -1) * operandToCents(operand);
      operator = char;
      operand = "";
    } else {
      operand += char;
    }
  }
  return total + (operator === "+" ? 1 : -1) * operandToCents(operand);
}

/** 3500 → "35", 6450 → "64,50", 5 → "0,05" (the inverse of operandToCents). */
export function centsToExpression(cents: number): string {
  const magnitude = Math.abs(Math.trunc(cents));
  const reais = Math.floor(magnitude / 100);
  const rest = magnitude % 100;
  return rest === 0
    ? String(reais)
    : `${reais},${String(rest).padStart(2, "0")}`;
}

/** Thousands groups on a typed operand: "1234,5" → "1.234,5". */
export function formatOperand(operand: string): string {
  const [integer = "", ...decimals] = operand.split(",");
  const grouped = (integer === "" ? "0" : integer).replace(
    /\B(?=(\d{3})+(?!\d))/g,
    ".",
  );
  return decimals.length > 0 ? `${grouped},${decimals.join("")}` : grouped;
}

/** Cents as the display number without the symbol: 15550 → "155,50", −3000 → "−30,00". */
export function formatCents(cents: number): string {
  const sign = cents < 0 ? MINUS : "";
  const magnitude = Math.abs(cents);
  const reais = Math.floor(magnitude / 100);
  const rest = String(magnitude % 100).padStart(2, "0");
  return `${sign}${formatOperand(String(reais))},${rest}`;
}

/**
 * The big number on the display: the typed operand while there is no
 * operation ("64,5"), the running result once there is one ("155,50"), and
 * "0,00" before anything is typed.
 */
export function displayValue(expression: string): string {
  if (expression === "") return "0,00";
  if (!hasOperator(expression)) return formatOperand(expression);
  return formatCents(evaluate(expression) ?? 0);
}

/** The line above the display when there is an operation: "120 + 35,50". */
export function expressionLine(expression: string): string {
  if (!hasOperator(expression)) return "";
  let line = "";
  let operand = "";
  for (const char of expression) {
    if (isOperator(char)) {
      line += `${formatOperand(operand)} ${char} `;
      operand = "";
    } else {
      operand += char;
    }
  }
  return (operand === "" ? line : line + formatOperand(operand)).trimEnd();
}

/** Physical keyboard → keypad key (`Enter` and `Escape` are handled elsewhere). */
export function keyFromKeyboard(key: string): CalcKey | null {
  if (/^[0-9]$/.test(key)) return key as DigitKey;
  switch (key) {
    case ",":
    case ".":
      return ",";
    case "+":
      return "+";
    case "-":
    case "−":
      return "−";
    case "=":
      return "=";
    case "Backspace":
      return "back";
    case "Delete":
      return "clear";
    default:
      return null;
  }
}
