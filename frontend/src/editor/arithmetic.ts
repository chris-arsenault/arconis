/**
 * Numbers as people type them into a field: a plain value, or `+ - * /` arithmetic such as
 * `200+40` or `*2`, where a leading operator applies to the field's current value.
 */

type Operator = "+" | "-" | "*" | "/";
type Token = number | Operator;
const TOKEN = /^(?:(\d*\.?\d+)|([+\-*/]))/;

/** Numbers and operators in order, or null when anything else appears. */
function tokenize(text: string): Token[] | null {
  const tokens: Token[] = [];
  let rest = text.replaceAll(" ", "");
  while (rest) {
    const match = TOKEN.exec(rest);
    if (!match) return null;
    tokens.push(match[1] ? Number(match[1]) : (match[2] as Operator));
    rest = rest.slice(match[0].length);
  }
  return tokens;
}

/** Whether tokens alternate number, operator, number, starting and ending on a number. */
function wellFormed(tokens: Token[]) {
  return (
    tokens.length % 2 === 1 &&
    tokens.every((token, index) => (typeof token === "number") === (index % 2 === 0))
  );
}

/** Products first, then the sum of the signed products. */
function sumOfProducts(tokens: Token[]) {
  const terms: number[] = [];
  let sign = 1;
  let product = tokens[0] as number;
  for (let index = 1; index < tokens.length; index += 2) {
    const operator = tokens[index] as Operator;
    const value = tokens[index + 1] as number;
    if (operator === "*") product *= value;
    else if (operator === "/") product /= value;
    else {
      terms.push(sign * product);
      sign = operator === "-" ? -1 : 1;
      product = value;
    }
  }
  terms.push(sign * product);
  return terms.reduce((total, term) => total + term, 0);
}

/** The value typed, or null when the text is not a number or a sum of products. */
export function evaluateNumber(text: string, current: number): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const relative = "+-*/".includes(trimmed[0]);
  const tokens = tokenize(relative ? `${current}${trimmed}` : trimmed);
  if (!tokens || !wellFormed(tokens)) return null;
  const result = sumOfProducts(tokens);
  return Number.isFinite(result) ? result : null;
}
