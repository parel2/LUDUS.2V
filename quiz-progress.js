import {
  db,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
} from "./firebase-config.js";

// Draft progress is separate from `progress`: only a completed submission is
// placed in progress, so completed modules remain inaccessible for retakes.
const user = JSON.parse(sessionStorage.getItem("user") || "null");
const module = JSON.parse(sessionStorage.getItem("activeModule") || "null");
if (!user?.uid || !module?.id) return;

const draftKey = `quizDraft:${user.uid}:${module.id}`;
const draftRef = doc(db, "quiz_drafts", `${user.uid}_${module.id}`);
let draft = null;
let saveTimer = null;
let restoring = false;

function questionIndex() {
  const counter = document.querySelector(".quiz-counter");
  const match = counter?.textContent.match(/Soal\s+(\d+)/i);
  return match ? Math.max(0, Number(match[1]) - 1) : 0;
}

function readVisibleAnswer() {
  const radio = document.querySelector('input[name="opt"]:checked');
  if (radio) return Number(radio.value);
  const text = document.getElementById("isianInput") || document.getElementById("esaiInput");
  if (text) return text.value;
  const matches = {};
  document.querySelectorAll(".match-blank").forEach((el) => {
    const idx = el.dataset.blank;
    const value = el.textContent.trim();
    if (idx && value) matches[idx] = value;
  });
  return Object.keys(matches).length ? matches : null;
}

function saveDraft() {
  if (restoring || !document.querySelector(".question-card")) return;
  const index = questionIndex();
  const answer = readVisibleAnswer();
  draft = draft || { answers: [], currentIndex: index };
  draft.answers = Array.isArray(draft.answers) ? draft.answers : [];
  draft.answers[index] = answer;
  draft.currentIndex = index;
  draft.updatedAt = Date.now();
  localStorage.setItem(draftKey, JSON.stringify(draft));
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    setDoc(draftRef, { ...draft, uid: user.uid, moduleId: module.id }, { merge: true }).catch((err) => {
      console.warn("Draft belum tersinkron ke server:", err);
    });
  }, 250);
}

function fillVisibleAnswer(answer) {
  if (answer === null || answer === undefined) return;
  if (typeof answer === "number") {
    const radio = document.querySelector(`input[name="opt"][value="${answer}"]`);
    if (radio) { radio.click(); return; }
  }
  const text = document.getElementById("isianInput") || document.getElementById("esaiInput");
  if (text && typeof answer === "string") {
    text.value = answer;
    text.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

function restoreDraft() {
  if (!draft || !Array.isArray(draft.answers)) return;
  restoring = true;
  let target = Math.max(0, Number(draft.currentIndex) || 0);
  let guard = 0;
  while (questionIndex() < target && typeof window.nextQuestion === "function" && guard++ < 100) {
    fillVisibleAnswer(draft.answers[questionIndex()]);
    window.nextQuestion();
  }
  setTimeout(() => {
    fillVisibleAnswer(draft.answers[questionIndex()]);
    restoring = false;
  }, 0);
}

async function loadDraft() {
  try {
    const local = JSON.parse(localStorage.getItem(draftKey) || "null");
    if (local) draft = local;
    const remote = await getDoc(draftRef);
    if (remote.exists() && (!draft || remote.data().updatedAt > draft.updatedAt)) {
      draft = remote.data();
      localStorage.setItem(draftKey, JSON.stringify(draft));
    }
  } catch (err) { console.warn("Gagal memuat draft kuis:", err); }
  restoreDraft();
}

const observer = new MutationObserver(() => {
  if (document.querySelector(".question-card")) {
    document.querySelectorAll("input, textarea").forEach((el) => {
      if (!el.dataset.draftBound) {
        el.dataset.draftBound = "1";
        el.addEventListener("input", saveDraft);
        el.addEventListener("change", saveDraft);
      }
    });
  }
});
observer.observe(document.body, { childList: true, subtree: true });

const oldNext = window.nextQuestion;
if (typeof oldNext === "function") {
  window.nextQuestion = function () {
    saveDraft();
    oldNext();
    setTimeout(() => {
      if (!document.querySelector(".question-card")) {
        localStorage.removeItem(draftKey);
        deleteDoc(draftRef).catch(() => {});
      }
    }, 1000);
  };
}

window.addEventListener("beforeunload", saveDraft);
setTimeout(loadDraft, 300);
