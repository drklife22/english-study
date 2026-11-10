// Firebase(Google 로그인 + Firestore)로 기기 간 동기화. 설정이 비어 있으면 로컬 저장만 한다.
import { firebaseConfig } from '../firebase-config.js';
import { getState, replaceState, merge, onChange } from './store.js';

const V = '10.12.2';
const base = `https://www.gstatic.com/firebasejs/${V}`;
let fb = null;          // { auth, db, mods }
let user = null;
let pushTimer = null;
let applyingRemote = false;
const statusListeners = new Set();

export const isConfigured = () => !!(firebaseConfig && firebaseConfig.apiKey);
export const currentUser = () => user;
export const onStatus = fn => { statusListeners.add(fn); fn(status()); };
let lastError = '';
let syncing = false;
function status() {
  return { configured: isConfigured(), user, syncing, error: lastError };
}
const emit = () => statusListeners.forEach(fn => fn(status()));

export async function initSync() {
  if (!isConfigured()) return;
  try {
    const [app, auth, fs] = await Promise.all([
      import(`${base}/firebase-app.js`),
      import(`${base}/firebase-auth.js`),
      import(`${base}/firebase-firestore.js`),
    ]);
    const a = app.initializeApp(firebaseConfig);
    fb = { auth: auth.getAuth(a), db: fs.getFirestore(a), authM: auth, fsM: fs };
    try { await auth.getRedirectResult(fb.auth); } catch (e) { /* noop */ }
    auth.onAuthStateChanged(fb.auth, async u => {
      user = u ? { uid: u.uid, name: u.displayName, email: u.email } : null;
      emit();
      if (u) await pull();
    });
    onChange(() => { if (user && !applyingRemote) schedulePush(); });
  } catch (e) {
    lastError = 'Firebase를 불러오지 못했어요: ' + e.message;
    emit();
  }
}

export async function signIn() {
  if (!fb) return;
  const { authM, auth } = fb;
  const provider = new authM.GoogleAuthProvider();
  try {
    await authM.signInWithPopup(auth, provider);
  } catch (e) {
    if (/popup/i.test(e.code || '')) await authM.signInWithRedirect(auth, provider);
    else { lastError = e.message; emit(); }
  }
}

export async function signOut() {
  if (fb) await fb.authM.signOut(fb.auth);
}

const docRef = () => fb.fsM.doc(fb.db, 'users', user.uid);

async function pull() {
  syncing = true; emit();
  try {
    const snap = await fb.fsM.getDoc(docRef());
    if (snap.exists()) {
      const remote = JSON.parse(snap.data().blob || '{}');
      applyingRemote = true;
      replaceState(merge(getState(), remote));
      applyingRemote = false;
    }
    await push();
    lastError = '';
  } catch (e) {
    lastError = '동기화 실패: ' + e.message;
  }
  syncing = false; emit();
}

function schedulePush() {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(push, 1500);
}

async function push() {
  if (!user) return;
  try {
    await fb.fsM.setDoc(docRef(), { blob: JSON.stringify(getState()), at: Date.now() });
    lastError = '';
  } catch (e) {
    lastError = '저장 실패: ' + e.message;
  }
  emit();
}

export const syncNow = () => (user ? pull() : Promise.resolve());
