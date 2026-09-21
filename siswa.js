import {
  db,
  collection,
  query,
  where,
  onSnapshot,
  doc,
  updateDoc,
  arrayUnion,
} from "./firebase-config.js";
import { normalizeModule, isRemedial } from "./module-normalize.js";

const user = JSON.parse(sessionStorage.getItem("user") || "null");
if (!user || user.role !== "siswa") {
  window.location.href = "index.html";
}

window.logout = function () {
  sessionStorage.removeItem("user");
  window.location.href = "index.html";
};

document.getElementById("userName").textContent = user.namaDisplay || user.nama;
document.getElementById("userKelas").textContent = "Kelas " + user.kelas;

// ============ LIVE CLOCK ============
const DAYS = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

function updateClock() {
  const now = new Date();
  const day = DAYS[now.getDay()];
  const date = now.getDate();
  const month = MONTHS[now.getMonth()];
  const year = now.getFullYear();
  const h = String(now.getHours()).padStart(2, "0");
  const m = String(now.getMinutes()).padStart(2, "0");
  const el = document.getElementById("liveClock");
  if (el) el.textContent = `${day}, ${date} ${month} ${year} — ${h}:${m}`;
}
updateClock();
setInterval(updateClock, 1000);

const grid = document.getElementById("moduleGrid");

let allModules = [];
let userProgress = user.progress || [];
let seenModules = user.seenModules || [];
let essayResults = [];

// Read all modules because older documents may store kelas as either text or number.
onSnapshot(collection(db, "modules"), (snap) => {
  allModules = [];
  snap.forEach((d) => {
    const data = d.data();
    if (String(data.kelas) === String(user.kelas)) {
      allModules.push({ id: d.id, ...data });
    }
  });
  renderModules();
});

// Listen to user's own profile for progress/seenModules updates
onSnapshot(doc(db, "users", user.uid), (snap) => {
  if (snap.exists()) {
    const data = snap.data();
    userProgress = data.progress || [];
    seenModules = data.seenModules || [];
    sessionStorage.setItem("user", JSON.stringify({ ...user, ...data }));
    renderModules();
    renderEssayResults();
  }
});

// Listen to essay answers for this student (realtime grading updates)
onSnapshot(
  query(collection(db, "esai_jawaban"), where("uidSiswa", "==", user.uid)),
  (snap) => {
    essayResults = [];
    snap.forEach((d) => {
      essayResults.push({ id: d.id, ...d.data() });
    });
    renderEssayResults();
  }
);

function renderModules() {
  if (allModules.length === 0) {
    grid.innerHTML =
      '<div class="empty-state"><div class="icon">📭</div>Belum ada modul untuk kelas kamu.</div>';
    return;
  }

  grid.innerHTML = "";
  allModules.forEach((mod) => {
    // Each card represents one exact module document, even when titles match.
    const moduleProgress = [...userProgress].reverse().find(
      (p) => p.moduleId === mod.id
    );
    const moduleScore = moduleProgress ? Number(moduleProgress.score) || 0 : null;
    const hasPending = moduleProgress?.status === "menunggu_dinilai";

    // Red dot if not seen
    const isNew = !seenModules.includes(mod.id);

    const soalCount = Array.isArray(mod.soal) ? mod.soal.length : 0;
    const remedialBadge = isRemedial(mod.judul)
      ? '<span class="status-badge" style="background:var(--accent-light); color:#92400e;">Remidi (opsional)</span>'
      : "";
    const card = document.createElement("div");
    card.className = "module-card";

    let statusHtml = "";
    if (moduleProgress) {
      if (hasPending) {
        statusHtml = '<span class="status-badge pending">Menunggu dinilai</span>';
      } else {
        statusHtml = `<span class="status-badge done">Nilai: ${moduleScore}</span>`;
      }
    }

    card.innerHTML = `
      ${isNew ? '<span class="red-dot"></span>' : ''}
      <div class="module-icon">📖</div>
      <div class="module-title">${escapeHtml(mod.judul || "Tanpa Judul")}</div>
      <div class="module-meta">${soalCount} soal</div>
      ${remedialBadge}
      ${statusHtml}
    `;
    card.onclick = () => openModule(mod);
    grid.appendChild(card);
  });
}

function openModule(mod) {
  const normalized = normalizeModule(mod);
  const moduleProgress = [...userProgress].reverse().find(
    (p) => p.moduleId === mod.id
  );
  sessionStorage.setItem("activeModule", JSON.stringify(normalized));
  if (moduleProgress) {
    sessionStorage.setItem("activeProgress", JSON.stringify(moduleProgress));
  } else {
    sessionStorage.removeItem("activeProgress");
  }

  // Mark as seen
  if (!seenModules.includes(mod.id)) {
    updateDoc(doc(db, "users", user.uid), {
      seenModules: arrayUnion(mod.id),
    }).catch((err) => console.error("Failed to mark seen:", err));
  }

  window.location.href = "kuis.html";
}

function renderEssayResults() {
  const graded = essayResults.filter((e) => e.status === "dinilai");
  if (graded.length === 0) return;

  let essaySection = document.getElementById("essayResults");
  if (!essaySection) {
    essaySection = document.createElement("div");
    essaySection.id = "essayResults";
    essaySection.style.marginTop = "24px";
    grid.parentNode.appendChild(essaySection);
  }

  essaySection.innerHTML = `
    <h3 class="page-title" style="font-size:1.2rem;">Nilai Esai Kamu</h3>
    <div class="student-list">
      ${graded.map((e) => `
        <div class="student-row" style="cursor:pointer; display:flex; justify-content:space-between; align-items:center;" onclick="reviewEssay('${e.id}')">
          <div>
            <div class="s-name">${escapeHtml(e.moduleTitle || "")}</div>
            <div class="s-meta">${escapeHtml((e.pertanyaan || "").slice(0, 60))}${(e.pertanyaan || "").length > 60 ? "..." : ""}</div>
          </div>
          <span class="s-mod-chip done">Nilai: ${e.nilai}</span>
        </div>
      `).join("")}
    </div>
  `;
}

window.reviewEssay = function (esaiId) {
  const e = essayResults.find((x) => x.id === esaiId);
  if (!e) return;

  const essaySection = document.getElementById("essayResults");
  essaySection.innerHTML = `
    <h3 class="page-title" style="font-size:1.2rem;">Nilai Esai Kamu</h3>
    <div class="card" style="max-width:700px;">
      <button class="btn-outline" style="margin-bottom:16px; width:auto; display:inline-block;" onclick="renderEssayResults()">Kembali</button>
      <div style="margin-bottom:16px;">
        <div class="s-name" style="font-size:1.2rem;">${escapeHtml(e.moduleTitle || "")}</div>
        <div class="s-meta">Nilai: ${e.nilai} — Dinilai oleh ${escapeHtml(e.dinilaiOlehNama || "Guru")}</div>
      </div>
      <div class="form-group">
        <label>Pertanyaan</label>
        <div style="padding:14px 16px; background:var(--bg); border-radius:var(--radius);">${escapeHtml(e.pertanyaan || "")}</div>
      </div>
      <div class="form-group">
        <label>Jawaban Kamu</label>
        <div style="padding:14px 16px; background:var(--bg); border-radius:var(--radius); white-space:pre-wrap; line-height:1.7;">${escapeHtml(e.jawabanSiswa || "")}</div>
      </div>
      <div class="form-group">
        <label>Nilai dari Guru</label>
        <div style="padding:14px 16px; background:var(--secondary-light); border-radius:var(--radius); font-size:1.5rem; font-weight:800; color:var(--secondary-dark); text-align:center;">${e.nilai}</div>
      </div>
    </div>
  `;
};

// Expose renderEssayResults so the back button works
window.renderEssayResults = renderEssayResults;

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = String(str);
  return div.innerHTML;
}
