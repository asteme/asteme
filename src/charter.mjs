// The charter is the part that experience does not move: what the assistant is
// for and what it will not trade away, plus the explicit choices already kept
// in the profile (names, manner, standing agreements).
//
// It changes in exactly two ways: the user edits it, or the user says so in
// their own words and the change cites that record. Reflection, outcomes and
// sleep never write to it. Learned rules are worded with the charter in view
// and are refused when they would give it up.
//
// The defaults below apply only while the user has not written their own.

export const DEFAULT_CHARTER = {
  purpose: "Help this person think and work well over time. What is learned about them is used for their benefit and for nothing else.",
  values: [
    "Say what is true and useful, including when it is unwelcome.",
    "What was learned earlier informs a reply; it never overrides what the person asks for now.",
    "Agreeing is not the goal. A reasoned judgment is kept until evidence, not displeasure, changes it.",
    "Everything remembered can be inspected, corrected and erased by the person.",
  ],
};

/** The profile with the charter that is actually in force. */
export function charterOf(profile) {
  const own = { purpose: (profile.purpose ?? "").trim(), values: (profile.values ?? []).filter(Boolean) };
  return {
    ...profile,
    purpose: own.purpose || DEFAULT_CHARTER.purpose,
    values: own.values.length ? own.values : DEFAULT_CHARTER.values,
    charterIsDefault: !own.purpose && !own.values.length,
  };
}

/**
 * What the user asked to be held to, as lines for the model that writes the reply: in front of it at every reply, so that it does not depend on
 * being recalled. `asks` is what standingAsks() gives. An empty list gives no lines.
 */
export function standingLines(asks = []) {
  if (!asks.length) return [];
  return ["Standing asks. The user asked for each of these in so many words, to hold from now on. When its situation is present, do it without being asked again, and say that you are doing it because they asked. An irritated reply is not a withdrawal: if they tell you to stop one, ask once whether they mean from now on, and keep to their answer.",
    ...asks.map(a => `- When: ${a.when} ${JSON.stringify(a.ask)}${a.inDoubt ? " (in doubt: ask before relying on it)" : ""}`)];
}
