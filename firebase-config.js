// Werte aus der Firebase-Konsole:
// Projekteinstellungen → Allgemein → Meine Apps → Web-App → «Konfiguration».
// Diese Werte sind nicht geheim. Deine Daten schützen die Firestore-Regeln.
export const firebaseConfig = {
  apiKey: "AIzaSyAysEnU8FTL-GZlnltXOp574icsCIiw_KI",
  authDomain: "kodex-d04f5.firebaseapp.com",
  projectId: "kodex-d04f5",
  appId: "1:1090699860911:web:b1362afbcc110ec2166d5a"
};

// Adresse des Mentor-Bots (Cloudflare Worker). Leer = kein Mentor.
export const botUrl = "https://zauberkodex-bot.zauberkodex.workers.dev";

// Öffentlicher Schlüssel für Push-Nachrichten (Firebase: Projekteinstellungen → Cloud Messaging → Web-Push-Zertifikate).
// Leer = keine tägliche Erinnerung. Dieser Schlüssel ist nicht geheim.
export const vapidKey = "BHfOQiVgzbyYhQ59iAwzh-IRwE_7Hq8dgmvwNO1dShxDxRYe8LYhxMMWEMcEpn1smmzCHyttu2Z3mYWh30Eq7sY";
