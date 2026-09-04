import { doc, getDoc, setDoc, onSnapshot, deleteField } from 'firebase/firestore';
import { db } from '../firebase';

// Rx reads and writes the same document the finance app uses:
//
//     users/{uid}/data/app
//
// That is deliberate, and it is why splitting Rx into its own repository cost
// no data. Every dose, session and note logged before the split is already in
// that document, the Cloud Function reminders already read it, and both apps
// write with `{ merge: true }` against disjoint field names — Rx only ever
// touches the `crash*` keys, `notifPrefs` and `settings`.
//
// If the two are ever pointed at different Firebase projects, this is the file
// to change, and a migration will be needed. Until then, sharing costs nothing
// and keeps one login and one source of truth.
function userDocRef(uid) {
  return doc(db, 'users', uid, 'data', 'app');
}

export async function loadUserData(uid) {
  const snap = await getDoc(userDocRef(uid));
  return snap.exists() ? snap.data() : null;
}

export async function saveUserData(uid, data) {
  await setDoc(userDocRef(uid), data, { merge: true });
}

export function subscribeUserData(uid, callback) {
  return onSnapshot(userDocRef(uid), (snap) => {
    if (snap.exists()) callback(snap.data());
  });
}

export async function saveFCMToken(uid, token) {
  await setDoc(userDocRef(uid), { fcmToken: token || deleteField() }, { merge: true });
}
