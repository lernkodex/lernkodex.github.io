// Liest alle angemeldeten Geräte (push/{uid}) und schickt allen eine Erinnerung,
// deren Spielstand (kodex/{uid}) für heute noch keinen Lerntag enthält.
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";

const konto = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!konto) {
  console.log("Kein FIREBASE_SERVICE_ACCOUNT gesetzt, es wird nichts verschickt.");
  process.exit(0);
}
initializeApp({ credential: cert(JSON.parse(konto)) });
const db = getFirestore();
const nachrichten = getMessaging();

// Heutiges Datum in der Schweiz, im Format JJJJ-MM-TT wie im Spielstand
const heute = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Zurich" }).format(new Date());
const tagDavor = d => { const t = new Date(d + "T12:00:00Z"); t.setUTCDate(t.getUTCDate() - 1); return t.toISOString().slice(0, 10); };

function serieBisGestern(tage) {
  const menge = new Set(tage);
  let n = 0, d = tagDavor(heute);
  while (menge.has(d)) { n++; d = tagDavor(d); }
  return n;
}

const geraete = await db.collection("push").get();
let geschickt = 0, uebersprungen = 0, entfernt = 0;
for (const doc of geraete.docs) {
  const { token } = doc.data();
  if (!token) continue;
  let tage = [];
  try {
    const stand = await db.collection("kodex").doc(doc.id).get();
    const zustand = stand.exists ? JSON.parse(stand.data().zustand || "{}") : {};
    tage = Array.isArray(zustand.tage) ? zustand.tage : [];
  } catch (e) { tage = []; }
  if (tage.includes(heute)) { uebersprungen++; continue; }
  const serie = serieBisGestern(tage);
  const daten = serie > 0
    ? { titel: "Deine Serie wartet", text: `${serie} ${serie === 1 ? "Tag" : "Tage"} in Folge. Eine kurze Lektion hält sie am Leben.` }
    : { titel: "Orlan wartet auf dich", text: "Wie wäre es mit einer kurzen Lektion? Schon fünf Minuten helfen." };
  try {
    await nachrichten.send({ token, data: { ...daten, link: "./" }, webpush: { headers: { Urgency: "normal", TTL: "14400" } } });
    geschickt++;
  } catch (e) {
    // Abgemeldete oder ungültige Geräte aufräumen
    if (["messaging/registration-token-not-registered", "messaging/invalid-registration-token"].includes(e.code)) {
      await doc.ref.delete();
      entfernt++;
    } else console.log("Fehler beim Schicken:", e.code || e.message);
  }
}
console.log(`Heute ${heute}: ${geschickt} Erinnerungen geschickt, ${uebersprungen} hatten schon gelernt, ${entfernt} alte Geräte entfernt.`);
