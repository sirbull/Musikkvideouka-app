// A small arithmetic parser: no eval, functions, identifiers or executable input.
function normalisePoints(value, allowDecimals = false) {
  if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > 999999)
    throw new Error("Poeng må være et tall mellom −999999 og 999999.");
  const rounded = allowDecimals ? Math.round(value * 1_000_000) / 1_000_000 : Math.round(value);
  if (!allowDecimals && Math.abs(value - rounded) > Number.EPSILON * Math.max(1, Math.abs(value)) * 8)
    throw new Error("Resultatet må være et helt antall poeng. Velg File → Tillat desimalpoeng for å bruke desimaler.");
  return Object.is(rounded, -0) ? 0 : rounded;
}

function calculateScore(expression, currentPoints, { allowDecimals = false, adjustment = false } = {}) {
  if (typeof expression !== "string" || expression.length > 120)
    throw new Error("Regnestykket kan ha maksimalt 120 tegn.");
  let source = expression
    .trim()
    .replace(/−/g, "-")
    .replace(/×/g, "*")
    .replace(/÷/g, "/");
  if (!source) throw new Error("Skriv inn en poengsum eller et regnestykke.");
  if (!Number.isFinite(currentPoints) || (!allowDecimals && !Number.isSafeInteger(currentPoints)))
    throw new Error("Den gjeldende poengsummen er ugyldig.");
  const base = currentPoints.toFixed(6);
  if (source.startsWith("=")) source = source.slice(1).trim();
  else if (/^[+\-*/]/.test(source)) source = `(${base})${source}`;
  else if (adjustment) source = `(${base})+(${source})`;
  let position = 0,
    depth = 0;
  const invalid = () => {
    throw new Error(
      "Ugyldig regnestykke. Bruk tall, +, −, * , / og parenteser.",
    );
  };
  const skip = () => {
    while (/\s/.test(source[position] || "") && position < source.length)
      position++;
  };
  const checked = (value) => {
    if (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER)
      throw new Error("Tallet i regnestykket er for stort.");
    return value;
  };
  function primary() {
    skip();
    if (source[position] === "(") {
      if (++depth > 24)
        throw new Error("Regnestykket har for mange parenteser.");
      position++;
      const value = sum();
      skip();
      if (source[position++] !== ")") invalid();
      depth--;
      return value;
    }
    const number = source.slice(position).match(/^(?:\d+(?:[.,]\d*)?|[.,]\d+)/);
    if (!number) invalid();
    position += number[0].length;
    return checked(Number(number[0].replace(",", ".")));
  }
  function unary() {
    skip();
    if (source[position] === "+" || source[position] === "-") {
      const sign = source[position++] === "-" ? -1 : 1;
      return sign * unary();
    }
    return primary();
  }
  function product() {
    let value = unary();
    skip();
    while (source[position] === "*" || source[position] === "/") {
      const operator = source[position++],
        right = unary();
      if (operator === "/" && right === 0)
        throw new Error("Du kan ikke dele på null.");
      value = checked(operator === "*" ? value * right : value / right);
      skip();
    }
    return value;
  }
  function sum() {
    let value = product();
    skip();
    while (source[position] === "+" || source[position] === "-") {
      const operator = source[position++],
        right = product();
      value = checked(operator === "+" ? value + right : value - right);
      skip();
    }
    return value;
  }
  const result = sum();
  skip();
  if (position !== source.length) invalid();
  return normalisePoints(result, allowDecimals);
}

module.exports = { calculateScore, normalisePoints };
