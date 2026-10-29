// Gleicht den Fortschritt zwischen Laptop und Handy über Firebase ab.
// Ohne eingetragene Firebase-Werte bleibt alles wie bisher: Der Kodex speichert nur im Browser.
import { firebaseConfig } from "./firebase-config.js";

const QUELLE = "https://www.gstatic.com/firebasejs/10.12.2/";
const kodex = window.__kodex;
const knopf = document.getElementById("sync-knopf");
const konfiguriert = !!(firebaseConfig && firebaseConfig.apiKey && firebaseConfig.projectId);
const stand = { phase: "aus", text: "", zuletzt: null };
let fb = null, nutzer = null, beenden = null, zeit = null, zuletzt = "", bereich = null;

const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const sortiert = v => Array.isArray(v) ? v.map(sortiert)
  : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sortiert(v[k])])) : v;
const alsText = z => JSON.stringify(sortiert(z));

/* Zwei Spielstände zusammenführen: Der mit mehr EP ist die Basis,
   was nur im anderen steht (gelöste Lektionen, Abzeichen, Projekte …), kommt dazu. */
export function zusammenfuehren(a, b) {
  const [basis, andere] = (b.ep || 0) > (a.ep || 0) ? [b, a] : [a, b];
  const z = JSON.parse(JSON.stringify(basis));
  z.erledigt = z.erledigt || {};
  for (const [id, e] of Object.entries(andere.erledigt || {})) {
    if (!z.erledigt[id]) { z.erledigt[id] = e; z.ep = (z.ep || 0) + (e.ep || 0); }
  }
  for (const k of ["tagesErledigt", "abzeichen", "kapitelDatum", "code", "hinweise", "loesung", "versuche", "verlauf", "vorschauSpeicher", "ausruestung", "kapitelWahl"]) {
    z[k] = Object.assign({}, andere[k] || {}, z[k] || {});
  }
  z.tage = [...new Set([...(z.tage || []), ...(andere.tage || [])])].sort();
  z.stats = z.stats || {};
  for (const [k, v] of Object.entries(andere.stats || {})) if (typeof v === "number") z.stats[k] = Math.max(z.stats[k] || 0, v);
  z.wdh = z.wdh || {};
  for (const [id, e] of Object.entries(andere.wdh || {})) {
    if (!z.wdh[id] || (e.faellig || "") > (z.wdh[id].faellig || "")) z.wdh[id] = e;
  }
  const projekte = ((z.werkstatt && z.werkstatt.projekte) || []).slice();
  for (const p of (andere.werkstatt && andere.werkstatt.projekte) || []) if (!projekte.some(x => x.id === p.id)) projekte.push(p);
  z.werkstatt = Object.assign({ aktiv: null }, z.werkstatt, { projekte });
  return z;
}

function meldung(e) {
  const code = (e && e.code) || "";
  const texte = {
    "auth/invalid-credential": "E-Mail oder Passwort stimmt nicht.",
    "auth/wrong-password": "E-Mail oder Passwort stimmt nicht.",
    "auth/user-not-found": "Zu dieser E-Mail gibt es kein Konto.",
    "auth/invalid-email": "Diese E-Mail-Adresse ist ungültig.",
    "auth/missing-password": "Gib ein Passwort ein.",
    "auth/too-many-requests": "Zu viele Versuche. Warte ein paar Minuten.",
    "auth/network-request-failed": "Keine Internetverbindung.",
    "auth/operation-not-allowed": "Die Anmeldung mit E-Mail ist in Firebase noch nicht eingeschaltet.",
    "permission-denied": "Firebase verweigert den Zugriff. Stimmen die Firestore-Regeln?",
    "unavailable": "Keine Verbindung zu Firebase. Der Abgleich läuft weiter, sobald du online bist."
  };
  return texte[code] || "Fehler: " + (code || (e && e.message) || e);
}

function zeige(phase, text) {
  stand.phase = phase;
  stand.text = text || "";
  if (knopf) {
    knopf.dataset.stand = phase;
    knopf.title = phase === "ok" ? "Synchronisiert" + (stand.zuletzt ? " um " + stand.zuletzt.toLocaleTimeString("de-CH") : "")
      : phase === "fehler" ? "Abgleich gestört: " + stand.text : phase === "laeuft" ? stand.text || "Gleiche ab …" : "Nicht angemeldet";
  }
  if (bereich && document.body.contains(bereich)) ui(bereich);
}

function schreiben(sofort) {
  if (!nutzer || !fb) return;
  clearTimeout(zeit);
  zeit = setTimeout(async () => {
    const text = alsText(kodex.zustandHolen());
    if (text === zuletzt) return;
    zuletzt = text;
    zeige("laeuft", "Speichere …");
    try {
      await fb.F.setDoc(fb.F.doc(fb.db, "kodex", nutzer.uid), { zustand: text, geaendert: fb.F.serverTimestamp() });
      stand.zuletzt = new Date();
      zeige("ok");
    } catch (e) {
      zuletzt = "";
      zeige("fehler", meldung(e));
    }
  }, sofort ? 0 : 2000);
}

function verbinden(user) {
  const { db, F } = fb;
  zeige("laeuft", "Gleiche ab …");
  beenden = F.onSnapshot(F.doc(db, "kodex", user.uid), snap => {
    if (snap.metadata.hasPendingWrites) return;
    const d = snap.data();
    if (!d || !d.zustand) { schreiben(true); return; }
    if (d.zustand === zuletzt) { stand.zuletzt = new Date(); zeige("ok"); return; }
    let fern;
    try { fern = JSON.parse(d.zustand); } catch (e) { zeige("fehler", "Der Spielstand in der Cloud ist beschädigt."); return; }
    const lokal = kodex.zustandHolen();
    const neu = zusammenfuehren(lokal, fern);
    const neuText = alsText(neu);
    if (neuText !== alsText(lokal)) kodex.zustandSetzen(neu);
    if (neuText === d.zustand) { zuletzt = neuText; stand.zuletzt = new Date(); zeige("ok"); }
    else schreiben(true);
  }, e => zeige("fehler", meldung(e)));
}

async function laden() {
  const [app, auth, fs] = await Promise.all(["firebase-app.js", "firebase-auth.js", "firebase-firestore.js"].map(d => import(QUELLE + d)));
  const a = app.initializeApp(firebaseConfig);
  let db;
  try { db = fs.initializeFirestore(a, { localCache: fs.persistentLocalCache() }); }
  catch (e) { db = fs.getFirestore(a); }
  return { auth: auth.getAuth(a), A: auth, db, F: fs };
}

/* Der Bereich «Synchronisieren» in den Einstellungen */
function ui(el) {
  if (!el) return;
  bereich = el;
  el.hidden = false;
  const kopf = "<h3>Synchronisieren</h3>";
  if (!konfiguriert) {
    el.innerHTML = kopf + '<p class="klein">Noch nicht eingerichtet. Trage die Firebase-Werte in firebase-config.js ein, wie in der Anleitung beschrieben.</p>';
    return;
  }
  if (!fb) {
    el.innerHTML = kopf + '<p class="klein">' + esc(stand.phase === "fehler" ? stand.text : "Verbinde mit Firebase …") + "</p>";
    return;
  }
  if (nutzer) {
    const info = stand.phase === "fehler" ? '<span class="melde-nein">' + esc(stand.text) + "</span>"
      : stand.phase === "ok" ? "Alles abgeglichen" + (stand.zuletzt ? ", zuletzt um " + esc(stand.zuletzt.toLocaleTimeString("de-CH")) : "") + "."
      : esc(stand.text || "Gleiche ab …");
    el.innerHTML = kopf + '<p class="klein">Angemeldet als <b id="sync-name"></b>. ' + info + "</p>" +
      '<div class="fenster-zeile" style="justify-content:flex-start"><button class="knopf" type="button" id="sync-jetzt">Jetzt abgleichen</button>' +
      '<button class="knopf still" type="button" id="sync-ab">Abmelden</button></div>';
    el.querySelector("#sync-name").textContent = nutzer.email || "";
    el.querySelector("#sync-jetzt").addEventListener("click", () => { zuletzt = ""; schreiben(true); });
    el.querySelector("#sync-ab").addEventListener("click", () => fb.A.signOut(fb.auth));
    return;
  }
  el.innerHTML = kopf + '<p class="klein">Melde dich auf Laptop und Handy mit demselben Konto an. Dann ist dein Fortschritt überall gleich. Konten vergibt der Besitzer des Kodex.</p>' +
    '<label class="feld"><span>E-Mail</span><input type="email" id="sync-mail" autocomplete="username"></label>' +
    '<label class="feld"><span>Passwort</span><input type="password" id="sync-pw" autocomplete="current-password"></label>' +
    '<p class="klein melde-nein" id="sync-meldung">' + (stand.phase === "fehler" ? esc(stand.text) : "") + "</p>" +
    '<div class="fenster-zeile" style="justify-content:flex-start"><button class="knopf haupt" type="button" id="sync-an">Anmelden</button>' +
    '<button class="knopf still" type="button" id="sync-vergessen">Passwort vergessen</button></div>';
  const mail = () => el.querySelector("#sync-mail").value.trim();
  const pw = () => el.querySelector("#sync-pw").value;
  const melde = t => { el.querySelector("#sync-meldung").textContent = t; };
  const versuche = async fn => { melde(""); try { await fn(); } catch (e) { melde(meldung(e)); } };
  el.querySelector("#sync-an").addEventListener("click", () => versuche(() => fb.A.signInWithEmailAndPassword(fb.auth, mail(), pw())));
  el.querySelector("#sync-vergessen").addEventListener("click", () => versuche(async () => {
    await fb.A.sendPasswordResetEmail(fb.auth, mail());
    melde("Wir haben dir eine E-Mail zum Zurücksetzen geschickt.");
  }));
}

window.__kodexSyncUi = ui;
window.__kodexNachSpeichern = () => schreiben(false);
if (knopf) knopf.addEventListener("click", () => document.getElementById("menue").click());

if (konfiguriert && kodex) {
  if (knopf) knopf.hidden = false;
  zeige("laeuft", "Verbinde …");
  laden().then(f => {
    fb = f;
    f.A.onAuthStateChanged(f.auth, u => {
      if (beenden) { beenden(); beenden = null; }
      nutzer = u;
      zuletzt = "";
      if (u) verbinden(u); else zeige("aus", "Nicht angemeldet");
    });
  }).catch(() => zeige("fehler", "Firebase konnte nicht geladen werden. Bist du online?"));
  addEventListener("online", () => schreiben(true));
}
