// Standalone preview of the panel: the real components and styles, a mock
// backend, and switches for theme, width and scenario. Not shipped in the plugin.
import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { AstemePage } from "../page.jsx";
import { AstemePageModel } from "../model.mjs";
import { translate } from "../copy.mjs";
import tokens from "../tokens.css";
import stylesheet from "../styles.css";
import { createBackend, scenarios } from "./mock.mjs";

const THEMES = {
  light: { background: "#ffffff", color: "#252525", colorScheme: "light" },
  dark: { background: "#1e1e1e", color: "#ededed", colorScheme: "dark" },
};
const WIDTHS = [360, 480, 720];

const fromHash = () => Object.fromEntries(new URLSearchParams(location.hash.slice(1)));

function Preview() {
  const initial = useMemo(fromHash, []);
  const [scenario, setScenario] = useState(scenarios[initial.scenario] ? initial.scenario : "engine");
  const [theme, setTheme] = useState(THEMES[initial.theme] ? initial.theme : "light");
  const [width, setWidth] = useState(Number(initial.width) || 480);
  const [failNext, setFailNext] = useState(false);
  const [language, setLanguage] = useState(["en", "ja", "zh"].includes(initial.lang) ? initial.lang : "en");
  const t = useMemo(() => translate(language), [language]);
  const { backend, model } = useMemo(() => {
    const backend = createBackend(scenario, { onFailed: () => setFailNext(false) });
    return { backend, model: new AstemePageModel(backend.request) };
  }, [scenario]);
  useEffect(() => { backend.failNextAction(failNext); }, [backend, failNext]);
  useEffect(() => { document.body.style.background = theme === "dark" ? "#111" : "#e9e9e9"; }, [theme]);

  const pick = (label, value, onChange, options) => (
    <label>
      {label}{" "}
      <select value={value} onChange={e => onChange(e.target.value)}>
        {options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}
      </select>
    </label>
  );
  return (
    <>
      <div className="pv-bar" style={{ color: theme === "dark" ? "#ddd" : "#222" }}>
        {pick("Scenario", scenario, value => { setScenario(value); setFailNext(false); }, Object.entries(scenarios).map(([k, v]) => [k, v.label]))}
        {pick("Language", language, setLanguage, [["en", "English"], ["ja", "\u65e5\u672c\u8a9e"], ["zh", "\u4e2d\u6587"]])}
        {pick("Theme", theme, setTheme, [["light", "Light"], ["dark", "Dark"]])}
        {pick("Width", width, value => setWidth(Number(value)), WIDTHS.map(w => [w, w + " px"]))}
        <label><input type="checkbox" checked={failNext} onChange={e => setFailNext(e.target.checked)} /> Fail the next action</label>
      </div>
      <div className="pv-frame" style={{ width, ...THEMES[theme] }}>
        <AstemePage key={scenario + language} model={model} t={t} />
      </div>
    </>
  );
}

const style = document.createElement("style");
style.textContent = tokens + "\n" + stylesheet;
document.head.append(style);
createRoot(document.getElementById("root")).render(<Preview />);
