export function logStep(scope, message, meta = {}) {
  const payload = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
  console.log(`[${scope}] ${message}${payload}`);
}
