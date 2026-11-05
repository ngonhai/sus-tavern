// firebase-config.js  (same Firebase project as Boardwalk Night; Sus Tavern rooms live under rooms/sus_<CODE>)
//
// 1. Go to https://console.firebase.google.com -> Add project (free, no card needed).
// 2. In the project, click "Build > Realtime Database" -> Create Database -> start in TEST MODE
//    (we tighten the rules below in step 4).
// 3. Click the gear icon > Project settings > scroll to "Your apps" > click the web icon (</>)
//    to register a web app. Copy the config object it gives you and paste the values below.
// 4. In Realtime Database > Rules, paste this (lets any client read/write only inside /rooms
//    and /roomChats, which is fine for a small private game with friends):
//
//   {
//     "rules": {
//       "rooms": {
//         "$roomId": {
//           ".read": true,
//           ".write": true
//         }
//       },
//       "roomChats": {
//         "$roomId": {
//           ".read": true,
//           ".write": true
//         }
//       }
//     }
//   }
//
// 4b. HIDDEN CARDS (recommended): enable Build > Authentication > Sign-in method > Anonymous, then in Realtime Database > Rules
//    ADD the "secure" block from database.rules.json (keep your other nodes). Without both steps rooms still work, but every
//    player's browser receives every hand, so a technical player can read them in the developer tools.
//   (roomChats is a separate path from rooms on purpose — see chatRef() in game.js.
//   If you set up Rules before the chat feature existed, re-publish with this block
//   added or chat will silently fail with a permission error.)
// 5. Fill in the values below with YOUR project's config (safe to be public in client code -
//    these are not secret keys, access is controlled by the Database Rules above).

const firebaseConfig = {
  apiKey: "AIzaSyBAEDxZzGgut5knt7qnNkLa1fesubt6hKE",
  authDomain: "sus-tavern.firebaseapp.com",
  databaseURL: "https://sus-tavern-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "sus-tavern",
  storageBucket: "sus-tavern.firebasestorage.app",
  messagingSenderId: "175436402424",
  appId: "1:175436402424:web:3fb6315e8f25d60049b50d"
};

// Guarded so the game still works OFFLINE (vs bots / hot-seat) if Firebase can't load.
let db = null;
try {
  firebase.initializeApp(firebaseConfig);
  db = firebase.database();
} catch (e) {
  console.warn('Firebase unavailable - online rooms disabled, offline mode still works.', e);
}
// Anonymous sign-in: the database rules use the uid to keep each player's cards private (see database.rules.json).
let auth = null;
try { auth = firebase.auth(); } catch (e) { console.warn('Firebase auth unavailable - rooms are not cheat-proof.', e); }
