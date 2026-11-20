// Where one arrives when Asteme is opened from the side bar: the conversation,
// unless this device was told otherwise. A choice about this screen, kept with
// this screen and nowhere else.
const ARRIVE = "asteme.arrive";
export const arriveAt = () => { try { return localStorage.getItem(ARRIVE) === "review" ? "review" : "talk"; } catch { return "talk"; } };
export const setArriveAt = (where) => { try { localStorage.setItem(ARRIVE, where === "review" ? "review" : "talk"); } catch { /* a screen that keeps nothing arrives at the conversation */ } };
