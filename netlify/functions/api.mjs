import { getStore } from "@netlify/blobs";

// Les routes /api/* utilisées par index.html
export const config = {
  path: ["/api/day", "/api/mood", "/api/react"],
};

const MOOD_IDS = ["top", "good", "zen", "coffee", "stressed", "sick"];
const REACTIONS = ["❤️", "🙌", "☕", "💪", "🤗"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const fail = (message, status = 400) => json({ error: message }, status);
const same = (a, b) => String(a || "").toLowerCase() === String(b || "").toLowerCase();
const cleanName = (n) => String(n || "").trim().slice(0, 30);

async function readDay(store, date) {
  const data = await store.get(`day-${date}`, { type: "json" });
  return Array.isArray(data) ? data : [];
}

const writeDay = (store, date, entries) => store.setJSON(`day-${date}`, entries);

export default async (req) => {
  const url = new URL(req.url);
  const route = url.pathname.replace(/\/+$/, "");
  const store = getStore("mood-tracker");

  try {
    // GET /api/day?date=YYYY-MM-DD
    if (route === "/api/day") {
      if (req.method !== "GET") return fail("Méthode non autorisée", 405);
      const date = url.searchParams.get("date") || "";
      if (!DATE_RE.test(date)) return fail("Date invalide");
      return json({ entries: await readDay(store, date) });
    }

    // Les autres routes reçoivent un corps JSON
    let body = {};
    if (req.method !== "DELETE" || req.headers.get("content-length") !== "0") {
      try { body = await req.json(); } catch { return fail("Corps de requête invalide"); }
    }
    const date = String(body.date || "");
    if (!DATE_RE.test(date)) return fail("Date invalide");

    // PUT /api/mood  |  DELETE /api/mood
    if (route === "/api/mood") {
      const userName = cleanName(body.userName);
      if (!userName) return fail("Prénom manquant");
      const entries = await readDay(store, date);
      const idx = entries.findIndex((e) => same(e.userName, userName));

      if (req.method === "PUT") {
        if (!MOOD_IDS.includes(body.moodId)) return fail("Humeur invalide");
        const comment = String(body.comment || "").trim().slice(0, 280);
        const entry = {
          userName: idx >= 0 ? entries[idx].userName : userName,
          moodId: body.moodId,
          comment,
          updatedAt: new Date().toISOString(),
          reactions: idx >= 0 ? entries[idx].reactions || {} : {},
        };
        if (idx >= 0) entries[idx] = entry;
        else entries.push(entry);
        await writeDay(store, date, entries);
        return json({ ok: true, entry });
      }

      if (req.method === "DELETE") {
        if (idx >= 0) entries.splice(idx, 1);
        await writeDay(store, date, entries);
        return json({ ok: true });
      }

      return fail("Méthode non autorisée", 405);
    }

    // POST /api/react
    if (route === "/api/react") {
      if (req.method !== "POST") return fail("Méthode non autorisée", 405);
      const reactor = cleanName(body.reactor);
      if (!reactor) return fail("Prénom manquant");
      if (body.emoji !== null && !REACTIONS.includes(body.emoji)) return fail("Réaction invalide");

      const entries = await readDay(store, date);
      const target = entries.find((e) => same(e.userName, body.owner));
      if (!target) return fail("Humeur introuvable", 404);

      target.reactions = target.reactions || {};
      for (const k of Object.keys(target.reactions)) {
        if (same(k, reactor)) delete target.reactions[k];
      }
      if (body.emoji) target.reactions[reactor] = body.emoji;

      await writeDay(store, date, entries);
      return json({ ok: true });
    }

    return fail("Route inconnue", 404);
  } catch (err) {
    console.error(err);
    return fail("Erreur serveur", 500);
  }
};
