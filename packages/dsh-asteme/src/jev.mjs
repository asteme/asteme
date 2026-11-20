// A judge port over HTTP for decision models that take a state and typed
// questions and return a probability per option (TypeSafe's Jev is the one
// this was written against; anything with the same request and answer shape
// works by changing the url and model).
//
// Using it sends the present message, a little of the recent exchange and the
// candidate memories to that service. It is off unless a key is configured.
export function jevJudge({ key, url = "https://api.typesafe.ai/v1/systemone", model = "jev-1.13.0", timeoutMs = 8000, fetch = globalThis.fetch } = {}) {
  if (!key) throw Error("A judge needs an API key");
  const judge = async (state, questions) => {
    const response = await fetch(url, { method: "POST", signal: AbortSignal.timeout(timeoutMs),
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ model, state, questions }) });
    if (!response.ok) throw Error(`The judge answered ${response.status}`);
    const value = await response.json();
    if (!value?.answers || typeof value.answers !== "object") throw Error("The judge returned no answers");
    return value.answers;
  };
  judge.model = model;
  return judge;
}
