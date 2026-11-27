import { profile } from "../src/log.mjs";
import { personaPrompt, experiencePrompt, mannerNow } from "./prompt.mjs";
import { plain } from "../src/archive.mjs";
import { writeExport, importFrom, backupNow, listBackups, listPeople, usage, reclaim, forgetCopies, listSaved, reveal, pick, resetAll } from "./files.mjs";
import { checkSettings, TUNABLES, DEFAULTS } from "./tunables.mjs";

export function operations(host) {
  const catalog = async () => {
    const providers = host.ctx.llm.listProviders();
    const results = await Promise.allSettled(
      providers.map((p) => host.ctx.llm.listModels(p.id)),
    );
    const models = [],
      errors = [];
    results.forEach((result, i) => {
      const provider = providers[i];
      if (result.status === "fulfilled")
        for (const m of result.value)
          models.push({
            provider: provider.id,
            id: m.id,
            label: m.name + " — " + provider.name,
          });
      else errors.push(provider.name);
    });
    return { models, modelErrors: errors };
  };
  const carried = (projectId) => {
    // How each item's uses have gone so far, and from which outcomes: derived, never stored.
    const recall = host.core.recallState();
    // Which standing asks are in front of every reply in this project: only so many fit, and the list must not promise it of one that did not.
    // Nothing is in front where memory is off, where this project is left out, or where conversations are private unless one is switched on.
    const off = host.config.enabled === false || host.core.projectOff(projectId) || host.core.quietByDefault();
    const front = new Set(off ? [] : host.core.standingAsks({ here: projectId }).map(a => a.id));
    const items = host.core.items({ closed: true }).filter(i => i.projectId === projectId)
      .map(i => ({ ...i, grounds: host.core.grounds(i), ...recall.get(i.id), ...(i.standing ? { inFront: front.has(i.id), ...(off ? { frontOff: true } : {}) } : {}) }));
    const trace = host.log.db.prepare(`SELECT a.data FROM attention a
      JOIN (SELECT id, data FROM events WHERE erased=0 UNION ALL SELECT id, data FROM received) e
        ON e.id=a.request
      WHERE a.owner=? AND json_extract(a.data,'$.scene') IS NOT NULL
        AND json_extract(e.data,'$.scope.projectId')=?
        AND json_extract(e.data,'$.sessionId') NOT IN (SELECT value FROM json_each(?))
      ORDER BY a.rowid DESC LIMIT 1`).get(host.core.owner, projectId, JSON.stringify(host.log.state("excluded-sessions", [])));
    const delivery = trace && JSON.parse(trace.data);
    // A round about a private matter said in another project is named, not shown, as a private memory from elsewhere is.
    const roundShown = p => { const from = host.log.event(p.events?.[0])?.scope?.projectId ?? null;
      return p.sensitive && from !== projectId ? { ...p, private: true, said: "", replied: "" } : { ...p, said: p.said ? p.said + (p.cutSaid ? " …" : "") : p.said }; };
    // A reply here can use what was learned somewhere else: in another project, or in the conversation with Asteme itself.
    // Those memories are not in this project's list, and they exist: they are named with the reply, so that it does not call them gone.
    const here = new Set(items.map(i => i.id)), named = delivery ? [...(delivery.delivered ?? []), ...(delivery.decisions ?? []), ...(delivery.heldBack?.suppressed ?? [])].map(x => x.id).concat(delivery.undecided ?? [], delivery.inFront ?? []).filter(id => id && !here.has(id)) : [];
    const elsewhere = named.length ? host.core.items({ closed: true }).filter(i => named.includes(i.id)).map(i => ({ id: i.id, text: i.sensitive?.length ? "" : i.text, private: !!i.sensitive?.length, projectId: i.projectId, where: host.log.state(`project-label:${i.projectId}`, null) ?? (i.projectId === "asteme" ? "Asteme" : null) })) : [];
    return {
      state: { items, sources: [...new Set(items.flatMap(i => i.evidence.map(e => e.id)))] },
      delivery: delivery ? { request: delivery.request, session: host.log.event(delivery.request)?.scope?.projectId === "asteme" ? null : host.log.event(delivery.request)?.sessionId ?? null,
        sessionPrivate: host.log.state(`private:${host.core.owner}:${host.log.event(delivery.request)?.sessionId}`, false) === true, asked: (host.log.event(delivery.request)?.content ?? "").slice(0, 400),
        scene: delivery.scene, decisions: delivery.decisions, delivered: delivery.delivered, heldBack: delivery.heldBack,
        // Rounds of earlier conversation the reply was given, as they were said: what the user said, and what was answered then.
        passages: (delivery.passages ?? []).map(p => ({ ...roundShown(p) })).map(p => ({ id: p.id, at: p.at, use: p.use, private: p.private, said: p.said, replied: p.replied && (p.replied.length > 700 ? `${p.replied.slice(0, 700)} …` : p.replied), relevance: p.relevance, anchor: p.anchor, by: p.by, confidence: p.confidence })),
        inFront: delivery.inFront ?? [], undecided: delivery.undecided, askedTwice: delivery.askedTwice, admittedBy: delivery.admittedBy, private: delivery.private,
        // What is already known about how this reply's memories did, the user's own verdicts included.
        outcomes: host.core.feedback().filter(f => f.request === delivery.request).map(f => ({ item: f.item, kind: f.kind, by: f.by ?? "model", reason: f.reason })),
        elsewhere, text: delivery.text, error: delivery.error, at: delivery.at } : null,
    };
  };
  // Consolidation state: what the program considers promotable now, and what it already
  // promoted, with the reason it kept. Read-only apart from the remove action.
  const learning = () => {
    const report = host.log.state("consolidate-last", null);
    return {
      habits: host.core.habitSummary().filter(h => h.active),
      history: host.core.habitSummary().filter(h => !h.active),
      candidates: host.core.promotable().map(c => ({
        id: c.item.id, text: c.item.text, basis: c.basis,
        helped: c.helped.length, corrections: c.corrections.length,
      })),
      demotions: host.core.demotable().map(d => ({ key: d.key, text: d.text, basis: d.basis })),
      outcomes: {
        pending: host.core.outcomeCandidates().length,
        last: host.log.state("outcome-last", null),
      },
      last: report && { at: report.at, applied: report.applied, rejected: report.rejected, skipped: report.skipped ?? [], response: report.response ?? null },
      // The last sleep cycle and what is queued for the next one, with reasons.
      sleep: {
        last: host.core.lastSleep(),
        queued: host.core.jobs().map(j => ({ type: j.type, target: j.target, priority: j.priority, reasons: j.reasons ?? [] })),
        episodes: host.core.episodes().sort((a, b) => b.salience - a.salience).slice(0, 12)
          .map(e => ({ id: e.id, at: e.at, scene: e.scene, salience: e.salience, replays: e.replays, signals: e.signals.map(s => s.kind) })),
      },
    };
  };
  const snapshot = async (projectId) => {
    // A project is listed while something is kept for it: a memory, or a
    // conversation from the last thirty days. A folder that no longer exists
    // is still listed for as long as what was learned in it is kept; one with
    // nothing learned and nothing recent drops out of the list (nothing is
    // deleted, and it returns when it is used again).
    // A conversation with no project (a host that does not say) is not a project of its own in the list.
    const everyProject = [...new Set(host.log.sessions(host.identity).map((s) => s.scope.projectId))].filter(Boolean);
    const remembered = new Set(host.core.items().map(i => i.projectId));
    const recent = new Set(host.log.db.prepare("SELECT DISTINCT scope FROM events WHERE coalesce(json_extract(data,'$.occurredAt'), json_extract(data,'$.observedAt')) > ?")
      .all(host.log.now() - 30 * 86400000).map(r => JSON.parse(r.scope).projectId));
    const projects = everyProject.filter(id => id === projectId || remembered.has(id) || recent.has(id));
    projects.sort((a,b) => String(host.log.state(`project-label:${a}`, a)).localeCompare(String(host.log.state(`project-label:${b}`, b))));
    projectId = projects.includes(projectId) ? projectId : (projects.find(id => host.log.state(`project-label:${id}`) === "default-workspace") ?? projects[0] ?? "");
    const core = profile(host.log, host.identity);
    return {
      projectId,
      projects: projects.map((id) => ({
        id,
        label: host.log.state(`project-label:${id}`, id),
      })),
      memory: carried(projectId),
      profile: core,
      // The purpose and values in force: the user's own, or the defaults.
      charter: (({ purpose, values, charterIsDefault }) => ({ purpose, values, isDefault: charterIsDefault }))(host.core.charter()),
      learning: learning(),
      // What is waiting for the user, within this project.
      review: (() => {
        const mine = new Set(host.core.items({ closed: true }).filter(i => i.projectId === projectId).map(i => i.id)), r = host.core.review();
        return { unsure: r.unsure.filter(id => mine.has(id)), stale: r.stale.filter(id => mine.has(id)), disputes: r.disputes.filter(d => mine.has(d.a) && mine.has(d.b)) };
      })(),
      // Why background work is or is not running, in counts.
      diagnosis: host.core.diagnose(host.log.now(), { delay: host.config.outcomeDelayMs ?? 60000 }),
      prompt: [personaPrompt(core, host.config.enabled === false || host.core.projectOff(projectId) || host.core.quietByDefault() ? [] : host.core.standingAsks({ here: projectId })), experiencePrompt].join("\n\n"),
      settings: host.settings(),
      usage: host.log.usage(host.identity),
      ...(await catalog()),
      pending: host.log.pending(host.identity, host.stage).length,
      // Where copies are kept, and whether a judge is answering beside the model.
      keeping: host.directory ? { memories: host.core.items().length, copies: (await listBackups(host)).length + (await listSaved(host)).length, directory: host.directory, backups: (await listBackups(host)).slice(0, 8), saved: (await listSaved(host)).slice(0, 6), last: host.log.state("backup-last", null), every: host.config.backupEveryHours ?? 24, usage: await usage(host) } : null,
      judge: host.judge ? { model: host.judge.model, mode: host.config.judgeMode, ...host.core.shadowAgreement() } : null,
      judgeKeySet: !!host.judgeKey?.(),
      canTidy: typeof host.tidyNow === "function", canTalk: typeof host.openBrain === "function", wall: host.core.walled(projectId), projectOff: host.core.projectOff(projectId), quietDefault: host.core.quietByDefault(),
      selfcheck: { running: host.checking ? { done: host.checking.done, total: host.checking.total } : null, last: host.log.state("selfcheck", null) },
      limits: Object.fromEntries(Object.entries(TUNABLES).filter(([, r]) => r.type === "number").map(([k, r]) => [k, { min: r.min, max: r.max, default: DEFAULTS[k] }])),
      notice: host.notice,
      error: host.lastError,
    };
  };
  return async (action, p = {}) => {
    if (action === "settings") {
      // judgeKey travels apart from the rest: it is stored under a private
      // name, and an empty string removes it.
      const { judgeKey, ...rest } = p.patch ?? {};
      if (judgeKey !== undefined && (typeof judgeKey !== "string" || judgeKey.length > 500)) throw new Error("Invalid setting");
      p = { ...p, patch: checkSettings(rest) };
      const next = { ...host.config, ...p.patch };
      if (!!next.learningProvider !== !!next.learningModel)
        throw new Error("Set both provider and model, or leave both blank");
      if (
        next.learningModel &&
        (next.learningProvider !== host.config.learningProvider ||
          next.learningModel !== host.config.learningModel)
      ) {
        const available = await host.ctx.llm.listModels(next.learningProvider);
        if (!available.some((m) => m.id === next.learningModel))
          throw new Error("Choose a model available in DSH");
      }
      Object.assign(host.config, p.patch);
      host.log.save("settings", { ...host.log.state("settings", {}), ...p.patch });
      if (judgeKey !== undefined) host.log.save("secret:judgeKey", judgeKey.trim());
      if (judgeKey !== undefined || ["judgeUrl", "judgeModel"].some(k => k in p.patch)) host.setupJudge();
      host.breaker.failures = 0; host.breaker.until = 0;
      host.retryAt = 0;
      host.retries.clear();
      if (!host.config.enabled) host.background?.abort();
      host.notice = "";
      host.run(host.drain());
    } else if (action === "profile") profile(host.log, host.identity, p.patch);
    else if (action === "habit") {
      if (typeof p.key !== "string") throw new Error("Unknown habit");
      if (p.restore === true) host.core.restoreHabit(p.key);
      else host.core.forgetHabit(p.key);
    }
    else if (action === "feedback") {
      // The user's own verdict on one memory in one reply.
      if (p.undo === true) host.core.userOutcomeUndo(p.request, p.item);
      else host.core.userOutcome(p.request, p.item, p.kind, p.note);
    }
    else if (action === "dispute") host.core.userSettle(p.a, p.b, p.keep);
    else if (action === "reclaim") { if (p.trim) await backupNow(host, "before-cleanup"); return reclaim(host, { trim: p.trim === true }); }
    else if (action === "selfcheck") host.selfcheck();
    else if (action === "wall") host.core.setWall(p.projectId, p.on === true);
    else if (action === "projectOff") host.core.setProjectOff(p.projectId, p.on === true);
    else if (action === "privateDefault") host.core.setQuietByDefault(p.on === true);
    else if (action === "private") { if (p.session === "thread") throw new Error("The conversation with Asteme is its memory and cannot be set aside"); host.core.setQuiet(p.session, p.on === true); }
    else if (action === "people") return listPeople(host);
    else if (action === "export") return writeExport(host, p.kind, { locale: p.locale, to: p.to });
    else if (action === "judgeTest") {
      // One small question, to show that the key, address and model work.
      if (!host.judge) throw new Error("No judge is set up");
      const started = Date.now();
      const answers = await host.judge({ message: "Good morning" }, { ok: { type: "choice", instructions: "Is the message a greeting?", criteria: { yes: "It is a greeting", no: "It is not a greeting" } } });
      return { ok: !!answers?.ok?.probabilities, ms: Date.now() - started, model: host.judge.model };
    }
    else if (action === "import") return importFrom(host, { path: p.path, content: p.content, backup: p.backup });
    else if (action === "reveal") return reveal(host, p.path);
    else if (action === "tidy") host.tidyNow?.();
    // What Asteme has said that the user has not had in front of them: the mark beside its name in DSH's side bar. Asking is not touching anything.
    else if (action === "unseen") return plain(host.brain?.mind.unseen?.() ?? { n: 0, at: null });
    else if (action === "brain") { if (typeof host.openBrain !== "function") throw new Error("Not available here"); return plain({ url: (await host.openBrain()).url }); }
    else if (action === "session") {
      // Asked by the control in the composer, which knows the host's id of the
      // conversation and nothing else.
      const known = host.sessions.get(p.session), id = known?.sessionId ?? p.session;
      if (typeof id !== "string" || !id) throw new Error("A conversation is required");
      // A session Asteme handed work to is not Asteme: it remembers nothing and has no way of speaking, so it has no switch.
      if ((host.log.state("brain:hands", []) ?? []).includes(id)) return { enabled: false, hand: true };
      if (typeof p.remember === "boolean") host.core.setQuiet(id, !p.remember);
      // The way of speaking for now, picked in the composer: the same one the conversation with Asteme shows.
      if (typeof p.manner === "string") { const text = p.manner.trim().slice(0, 300); host.log.save("brain:manner", text ? { text, until: null, at: host.log.now() } : null); }
      const projectId = known?.scope?.projectId;
      return { enabled: host.config.enabled !== false, remembered: !host.core.quiet(id, projectId), projectOff: host.core.projectOff(projectId),
        manner: mannerNow(host.log), manners: host.log.state("brain:manners", []) ?? [] };
    }
    else if (action === "pick") return pick(host, p.kind);
    else if (action === "reset") {
      if (p.confirm !== "erase everything") throw new Error("A reset has to be confirmed");
      await resetAll(host);
      // The conversation with Asteme runs on the same store: what it still had in its head (work handed out, times it set, files it was given) goes with it.
      try { host.brain?.mind.wiped?.(); } catch { /* it starts clean the next time it is opened */ }
    }
    else if (action === "backup") { await backupNow(host, "manual"); }
    else if (action === "why") {
      const why = host.core.why(p.item);
      if (!why) throw new Error("Unknown memory");
      return why;
    }
    else if (action === "explain") {
      const told = host.core.explain(p.request);
      if (!told) throw new Error("Unknown request");
      return told;
    }
    else if (action === "memory") {
      host.log.transaction(() => {
        const item = host.core.items({ closed: true }).find(i => i.id === p.item && i.projectId === p.projectId);
        if (!item || item.revision !== p.revision) throw new Error("Memory changed. Refresh and try again.");
        if (p.operation === "forget") host.log.erase([...new Set(item.evidence.map(e => e.id))]);
        else if (p.operation === "delete") host.core.deletePaused(item);
        else if (p.operation === "confirm") host.core.userConfirm(item.id, item.revision);
        else if (p.operation === "retire") host.core.userRetire(item.id, item.revision, p.note);
        else if (p.operation === "reopen") host.core.userReopen(item.id, item.revision);
        else if (p.operation === "confine" || p.operation === "release") host.core.userConfine(item.id, item.revision, p.operation === "confine");
        else if (p.operation === "pause" || p.operation === "resume") {
          host.core.write({ ...item, paused: p.operation === "pause", revision: item.revision + 1 }, "User " + p.operation);
          // What was drawn from it is looked at again during sleep.
          host.core.propagate(item.id, p.operation === "pause" ? "was paused by the user" : "was resumed by the user");
        } else throw new Error("Unknown memory operation");
      });
      // Forgetting is not finished while a copy made earlier still holds
      // what was forgotten.
      if (p.operation === "forget" && host.directory) await forgetCopies(host);
    }
    else if (action === "sources") {
      const { state } = carried(p.projectId);
      const ids = p.item ? state.items.find(i => i.id === p.item)?.evidence.map(e => e.id) ?? [] : state.sources;
      return {
        events: ids
          .map((id) => host.log.event(id))
          .filter((e) => e && !e.erased),
      };
    } else if (action !== "snapshot") throw new Error("Unknown action");
    // The conversation with Asteme is another window onto the same store: when something was changed here, it is told to look again.
    if (action !== "snapshot") { try { host.brain?.mind.touched?.(); } catch { /* nobody is looking */ } }
    return snapshot(p.projectId);
  };
}

export function registerSettings(ctx, host) {
  const request = operations(host);
  ctx.inject(["connection"], (child) => {
    for (const action of ["snapshot", "settings", "profile", "habit", "sources", "memory", "why", "explain", "feedback", "dispute", "export", "import", "backup", "judgeTest", "wall", "people", "reclaim", "selfcheck", "reveal", "pick", "reset", "projectOff", "private", "privateDefault", "session", "tidy", "brain", "unseen"])
      child.effect(
        () =>
          child.connection.fetch.register({
            path: `/api/asteme.${action}`,
            methods: ["POST"],
            requestBody: "buffered",
            fetch: async (req) => {
              let message;
              try {
                message = await req.json();
              } catch {
                return new Response("Invalid JSON", { status: 400 });
              }
              if (
                message.type !== "client-request" ||
                message.method !== `asteme.${action}` ||
                typeof message.rpcId !== "string"
              )
                return new Response("Invalid request", { status: 400 });
              let result;
              try {
                result = {
                  ok: true,
                  value: plain(await request(action, message.payload)),
                };
              } catch (e) {
                result = {
                  ok: false,
                  // The host's client reads a failure only when it has all three of these; without `details` it reports its own
                  // "invalid server-response" in place of what went wrong.
                  error: { code: typeof e?.code === "string" && e.code.startsWith("asteme/") ? e.code : "asteme/INVALID_INPUT", message: String(e?.message ?? e), details: {} },
                };
              }
              return Response.json(
                { type: "server-response", rpcId: message.rpcId, result },
                { headers: { "cache-control": "no-store" } },
              );
            },
          }),
        `asteme.settings:${action}`,
      );
  });
  ctx.inject(["settings"], (child) =>
    child.effect(
      () => child.settings.configure({ auto: false }, ctx.fiber),
      "asteme.settings-presentation",
    ),
  );
}

