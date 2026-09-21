import {
  db,
  collection,
  query,
  where,
  onSnapshot,
  doc,
  getDoc,
  updateDoc,
  setDoc,
  deleteDoc,
  writeBatch,
  getDocs,
} from "./firebase-config.js";
import { normalizeTitle, isRemedial, stripRemedialPrefix } from "./module-normalize.js";
import { hashPassword, normalizeName, generateUid } from "./auth-helpers.js";

const user = JSON.parse(sessionStorage.getItem("user") || "null");
if (!user || user.role !== "guru") {
  window.location.href = "index.html";
}

window.logout = function () {
  sessionStorage.removeItem("user");
  window.location.href = "index.html";
};

document.getElementById("userName").textContent = user.namaDisplay || user.nama;

// ============ DATE FORMAT HELPERS ============
const DAYS = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

function formatDateTime(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  const day = DAYS[d.getDay()];
  const date = d.getDate();
  const month = MONTHS_SHORT[d.getMonth()];
  const year = d.getFullYear();
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${day}, ${date} ${month} ${year}, ${h}:${m}`;
}

// Tab navigation
window.switchTab = function (tab) {
  document.querySelectorAll(".nav-tab").forEach((t) => t.classList.remove("active"));
  document.querySelector(`.nav-tab[data-tab="${tab}"]`).classList.add("active");
  document.querySelectorAll(".tab-content").forEach((c) => c.classList.remove("active"));
  document.getElementById("tab" + tab.charAt(0).toUpperCase() + tab.slice(1)).classList.add("active");
};

// ============ TAB: SISWA ============
const classTabsEl = document.getElementById("classTabs");
const studentListEl = document.getElementById("studentList");

const classes = ["3", "4", "5", "6"];
let activeClass = "3";
let allStudents = [];
let allModules = [];

function renderTabs() {
  classTabsEl.innerHTML = classes.map((c) => {
    const count = allStudents.filter((s) => String(s.kelas) === c).length;
    return `<button class="class-tab ${c === activeClass ? "active" : ""}" onclick="selectClass('${c}')">Kelas ${c} <span class="count">${count}</span></button>`;
  }).join("");
}

window.selectClass = function (c) {
  activeClass = c;
  renderTabs();
  renderStudents();
};

// ============ TAMBAH SISWA (oleh guru) ============
window.toggleAddStudentForm = function () {
  const card = document.getElementById("addStudentCard");
  const isHidden = card.style.display === "none" || !card.style.display;
  card.style.display = isHidden ? "block" : "none";
  if (isHidden) {
    document.getElementById("newSiswaNama").value = "";
    document.getElementById("newSiswaPassword").value = "";
    document.getElementById("addStudentMsg").style.display = "none";
  }
};

function showAddStudentError(msg) {
  const el = document.getElementById("addStudentMsg");
  el.textContent = msg;
  el.classList.add("show");
  el.style.display = "block";
}

window.submitNewStudent = async function () {
  const namaInput = document.getElementById("newSiswaNama");
  const kelasInput = document.getElementById("newSiswaKelas");
  const passwordInput = document.getElementById("newSiswaPassword");
  const msgEl = document.getElementById("addStudentMsg");

  msgEl.style.display = "none";
  msgEl.classList.remove("show");

  const nama = namaInput.value.trim();
  const kelas = kelasInput.value;
  const password = passwordInput.value;

  if (!nama || !password) {
    showAddStudentError("Isi nama dan password siswa terlebih dahulu.");
    return;
  }
  if (password.length < 4) {
    showAddStudentError("Password minimal 4 karakter.");
    return;
  }

  const normNama = normalizeName(nama);

  try {
    // Cek duplikat: nama + kelas yang sama sudah terdaftar
    const dupSnap = await getDocs(
      query(
        collection(db, "users"),
        where("nama", "==", normNama),
        where("kelas", "==", kelas),
        where("role", "==", "siswa")
      )
    );
    if (!dupSnap.empty) {
      showAddStudentError("Siswa dengan nama ini sudah terdaftar di kelas tersebut.");
      return;
    }

    const newUid = generateUid();
    const newProfile = {
      uid: newUid,
      nama: normNama,
      namaDisplay: nama,
      passwordHash: hashPassword(password),
      kelas: kelas,
      role: "siswa",
      createdAt: Date.now(),
      createdBy: user.uid,
    };
    await setDoc(doc(db, "users", newUid), newProfile);

    window.toggleAddStudentForm();
    activeClass = kelas;
  } catch (err) {
    console.error("Gagal menambahkan siswa:", err);
    showAddStudentError("Gagal menyimpan siswa: " + err.message);
  }
};

// ============ HAPUS SISWA ============
window.deleteStudent = async function (studentId, studentName, event) {
  if (event) event.stopPropagation();

  const ok = confirm(`Hapus siswa "${studentName}"? Seluruh data nilai siswa ini juga akan terhapus. Aksi ini tidak bisa dibatalkan.`);
  if (!ok) return;

  try {
    await deleteDoc(doc(db, "users", studentId));
    if (detailStudentId === studentId) {
      detailStudentId = null;
    }
  } catch (err) {
    console.error("Gagal menghapus siswa:", err);
    alert("Gagal menghapus siswa: " + err.message);
  }
};

onSnapshot(query(collection(db, "users"), where("role", "==", "siswa")), (snap) => {
  allStudents = [];
  snap.forEach((d) => allStudents.push({ id: d.id, ...d.data() }));
  renderTabs();
  renderStudents();
});

onSnapshot(collection(db, "modules"), (snap) => {
  allModules = [];
  snap.forEach((d) => allModules.push({ id: d.id, ...d.data() }));
  renderStudents();
});

let detailStudentId = null;

function renderStudents() {
  const students = allStudents.filter((s) => String(s.kelas) === activeClass);

  if (students.length === 0) {
    studentListEl.innerHTML =
      '<div class="empty-state"><div class="icon">👥</div>Belum ada siswa terdaftar di kelas ini.</div>';
    return;
  }

  if (detailStudentId) {
    renderStudentDetail(detailStudentId);
    return;
  }

  studentListEl.innerHTML = students.map((s) => {
    const progress = s.progress || [];
    const summary = computeGradeSummary(progress);
    const moduleStatusHtml = renderModuleStatus(progress);

    const finalAvgLabel = summary.groupAverages.length > 0
      ? `<span class="s-mod-chip done" style="font-size:0.85rem; font-weight:700;">Nilai Akhir: ${summary.finalAverage}</span>`
      : "";

    const lastProgress = progress.length > 0 ? progress[progress.length - 1] : null;
    const completedLabel = lastProgress?.completedAt
      ? `<div class="s-meta" style="margin-top:4px;">Diselesaikan: ${formatDateTime(lastProgress.completedAt)}</div>`
      : "";

    return `
      <div class="student-row" style="cursor:pointer; display:flex; justify-content:space-between; align-items:center;" onclick="openStudentDetail('${s.id}')">
        <div style="flex:1;">
          <div class="s-name">${escapeHtml(s.namaDisplay || s.nama)}</div>
          <div class="s-meta">Kelas ${s.kelas}</div>
          <div class="s-modules">${moduleStatusHtml}</div>
          ${finalAvgLabel}
          ${completedLabel}
        </div>
        <button class="btn-danger" style="width:auto; padding:8px 14px; font-size:0.85rem;" onclick="deleteStudent('${s.id}', '${escapeHtml(s.namaDisplay || s.nama).replace(/'/g, "\\'")}', event)">Hapus</button>
        <span style="color:var(--primary); font-size:1.5rem; font-weight:700; margin-left:8px;">›</span>
      </div>
    `;
  }).join("");
}

window.openStudentDetail = function (studentId) {
  detailStudentId = studentId;
  renderStudentDetail(studentId);
};

window.closeStudentDetail = function () {
  detailStudentId = null;
  renderStudents();
};

function renderStudentDetail(studentId) {
  const s = allStudents.find((x) => x.id === studentId);
  if (!s) {
    detailStudentId = null;
    renderStudents();
    return;
  }

  const progress = s.progress || [];
  const summary = computeGradeSummary(progress);

  if (allModules.length === 0) {
    studentListEl.innerHTML = `
      <div class="card">
        <button class="btn-outline" style="margin-bottom:16px; width:auto; display:inline-block;" onclick="closeStudentDetail()">Kembali</button>
        <p>Belum ada modul.</p>
      </div>`;
    return;
  }

  const classModules = allModules.filter((m) => String(m.kelas) === String(s.kelas));

  // Group modules by normalized title
  const titleGroups = {};
  classModules.forEach((mod) => {
    const norm = normalizeTitle(mod.judul);
    if (!titleGroups[norm]) titleGroups[norm] = [];
    titleGroups[norm].push(mod);
  });

  let detailHtml = '';
  Object.keys(titleGroups).forEach((normTitle) => {
    const groupMods = titleGroups[normTitle];
    const groupIds = groupMods.map((m) => m.id);
    const groupProgress = progress.filter((p) => groupIds.includes(p.moduleId));
    const displayTitle = groupMods[0].judul;
    const groupIsRemedial = groupMods.every((m) => isRemedial(m.judul));

    detailHtml += `<div style="margin-bottom:20px;">
      <div style="font-weight:700; font-size:1.05rem; margin-bottom:8px; color:var(--primary-dark);">${escapeHtml(displayTitle)}${groupIsRemedial ? ' <span style="font-size:0.75rem; color:var(--accent); background:var(--accent-light); padding:2px 8px; border-radius:8px;">Remidi</span>' : ''}</div>`;

    if (groupProgress.length === 0) {
      if (!groupIsRemedial) {
        detailHtml += `<div class="s-mod-chip">Belum dikerjakan</div>`;
      } else {
        detailHtml += `<div class="s-mod-chip" style="opacity:0.6;">Remidi (opsional)</div>`;
      }
    } else {
      groupMods.forEach((mod) => {
        const p = groupProgress.find((pg) => pg.moduleId === mod.id);
        if (!p) {
          if (!isRemedial(mod.judul)) {
            detailHtml += `<div style="margin-bottom:6px;"><span class="s-mod-chip">${escapeHtml(mod.judul)} — Belum dikerjakan</span></div>`;
          } else {
            detailHtml += `<div style="margin-bottom:6px;"><span class="s-mod-chip" style="opacity:0.6;">${escapeHtml(mod.judul)} — Remidi (opsional)</span></div>`;
          }
        } else {
          const hasPending = p.status === "menunggu_dinilai";
          const cls = hasPending ? "pending" : "done";
          const label = hasPending ? "Menunggu dinilai" : `Nilai: ${p.score || 0}`;
          const timeLabel = p.completedAt ? ` — ${formatDateTime(p.completedAt)}` : "";
          detailHtml += `<div style="margin-bottom:6px;"><span class="s-mod-chip ${cls}">${escapeHtml(mod.judul)} — ${label}${timeLabel}</span></div>`;
        }
      });

      const allDone = groupProgress.every((p) => p.status !== "menunggu_dinilai");
      if (allDone && groupProgress.length > 0) {
        const totalScore = groupProgress.reduce((sum, p) => sum + (p.score || 0), 0);
        const avgScore = Math.round(totalScore / groupProgress.length);
        detailHtml += `<div style="margin-top:8px;"><span class="s-mod-chip done" style="font-weight:700;">Rata-rata ${escapeHtml(displayTitle)}: ${avgScore}</span></div>`;
      }
    }

    detailHtml += `</div>`;
  });

  // Final average
  const finalAvgHtml = summary.groupAverages.length > 0
    ? `<div style="margin-top:24px; padding-top:20px; border-top:2px solid var(--border);">
        <div style="font-size:1.2rem; font-weight:800; color:var(--primary-dark);">NILAI AKHIR = ${summary.finalAverage}</div>
        <div style="font-size:0.85rem; color:var(--text-muted); margin-top:4px;">Rata-rata dari ${summary.groupAverages.length} modul</div>
      </div>`
    : "";

  studentListEl.innerHTML = `
    <div class="card" style="max-width:700px;">
      <button class="btn-outline" style="margin-bottom:16px; width:auto; display:inline-block;" onclick="closeStudentDetail()">Kembali ke Daftar Siswa</button>
      <div style="margin-bottom:20px; display:flex; justify-content:space-between; align-items:flex-start;">
        <div>
          <div class="s-name" style="font-size:1.3rem;">${escapeHtml(s.namaDisplay || s.nama)}</div>
          <div class="s-meta">Kelas ${s.kelas}</div>
        </div>
        <button class="btn-danger" style="width:auto; padding:8px 14px; font-size:0.85rem;" onclick="deleteStudent('${s.id}', '${escapeHtml(s.namaDisplay || s.nama).replace(/'/g, "\\'")}')">Hapus Siswa</button>
      </div>
      ${detailHtml}
      ${finalAvgHtml}
    </div>
  `;
}

function computeGradeSummary(progress) {
  if (allModules.length === 0 || progress.length === 0) {
    return { groupAverages: [], finalAverage: null };
  }

  const classModules = allModules.filter((m) => String(m.kelas) === activeClass);
  const titleGroups = {};
  classModules.forEach((mod) => {
    const norm = normalizeTitle(mod.judul);
    if (!titleGroups[norm]) titleGroups[norm] = [];
    titleGroups[norm].push(mod);
  });

  const groupAverages = [];
  Object.keys(titleGroups).forEach((normTitle) => {
    const groupMods = titleGroups[normTitle];
    const groupIds = groupMods.map((m) => m.id);
    const groupProgress = progress.filter((p) => groupIds.includes(p.moduleId));

    if (groupProgress.length > 0) {
      const allDone = groupProgress.every((p) => p.status !== "menunggu_dinilai");
      if (allDone) {
        const totalScore = groupProgress.reduce((sum, p) => sum + (p.score || 0), 0);
        groupAverages.push(Math.round(totalScore / groupProgress.length));
      }
    }
  });

  const finalAverage = groupAverages.length > 0
    ? Math.round(groupAverages.reduce((sum, a) => sum + a, 0) / groupAverages.length)
    : null;

  return { groupAverages, finalAverage };
}

function renderModuleStatus(progress) {
  if (allModules.length === 0) return "";
  const classModules = allModules.filter((m) => String(m.kelas) === activeClass);
  if (classModules.length === 0) return "";

  // Group modules by normalized title
  const titleGroups = {};
  classModules.forEach((mod) => {
    const norm = normalizeTitle(mod.judul);
    if (!titleGroups[norm]) titleGroups[norm] = [];
    titleGroups[norm].push(mod);
  });

  return Object.keys(titleGroups).map((normTitle) => {
    const groupMods = titleGroups[normTitle];
    const groupIds = groupMods.map((m) => m.id);
    const groupProgress = progress.filter((p) => groupIds.includes(p.moduleId));

    const displayTitle = stripRemedialPrefix(groupMods[0].judul);
    const groupIsRemedial = groupMods.every((m) => isRemedial(m.judul));
    let chipClass = "";
    let label = "Belum dikerjakan";

    if (groupProgress.length > 0) {
      const hasPending = groupProgress.some((p) => p.status === "menunggu_dinilai");
      if (hasPending) {
        chipClass = "pending";
        label = "Menunggu dinilai";
      } else {
        const totalScore = groupProgress.reduce((sum, p) => sum + (p.score || 0), 0);
        const avgScore = Math.round(totalScore / groupProgress.length);
        chipClass = "done";
        label = `${displayTitle} — Nilai: ${avgScore}`;
      }
    } else {
      if (groupIsRemedial) {
        label = `${displayTitle} — Remidi (opsional)`;
      } else {
        label = `${displayTitle} — Belum dikerjakan`;
      }
    }

    return `<span class="s-mod-chip ${chipClass}">${escapeHtml(label)}</span>`;
  }).join("");
}

// ============ TAB: ESAI ============
let allEsai = [];

onSnapshot(collection(db, "esai_jawaban"), (snap) => {
  allEsai = [];
  snap.forEach((d) => allEsai.push({ id: d.id, ...d.data() }));
  renderEsai();

  // Repair progress records created before essay grading sync was added.
  allEsai
    .filter((essay) => essay.status === "dinilai")
    .forEach((essay) => {
      syncStudentModuleProgress(essay.id, essay.nilai).catch((err) => {
        console.error("Failed to sync existing essay grade:", err);
      });
    });
});

function renderEsai() {
  const pending = allEsai.filter((e) => e.status === "menunggu_dinilai");
  const esaiListEl = document.getElementById("esaiList");

  if (pending.length === 0) {
    esaiListEl.innerHTML =
      '<div class="empty-state"><div class="icon">✅</div>Tidak ada jawaban esai yang menunggu dinilai.</div>';
    return;
  }

  esaiListEl.innerHTML = pending.map((e) => `
    <div class="student-row" style="cursor:pointer;" onclick="openEsaiDetail('${e.id}')">
      <div style="flex:1;">
        <div class="s-name">${escapeHtml(e.namaSiswa || "")} <span style="font-weight:400; color:var(--text-muted); font-size:0.85rem;">— Kelas ${e.kelas}</span></div>
        <div class="s-meta">${escapeHtml(e.moduleTitle || "")}</div>
        <div style="margin-top:4px; font-size:0.82rem; color:var(--text-muted);">Dikumpulkan: ${formatDateTime(e.submittedAt)}</div>
        <div style="margin-top:8px; font-size:0.9rem; color:var(--text);">${escapeHtml((e.pertanyaan || "").slice(0, 100))}${(e.pertanyaan || "").length > 100 ? "..." : ""}</div>
        <div style="margin-top:6px; font-size:0.88rem; color:var(--text-muted); font-style:italic;">${escapeHtml((e.jawabanSiswa || "").slice(0, 120))}${(e.jawabanSiswa || "").length > 120 ? "..." : ""}</div>
      </div>
      <span class="status-badge pending">Menunggu</span>
    </div>
  `).join("");
}

window.openEsaiDetail = function (esaiId) {
  const e = allEsai.find((x) => x.id === esaiId);
  if (!e) return;

  const esaiListEl = document.getElementById("esaiList");
  esaiListEl.innerHTML = `
    <div class="card" style="max-width:700px;">
      <button class="btn-outline" style="margin-bottom:16px; width:auto; display:inline-block;" onclick="renderEsai()">Kembali</button>
      <div style="margin-bottom:16px;">
        <div class="s-name" style="font-size:1.2rem;">${escapeHtml(e.namaSiswa || "")}</div>
        <div class="s-meta">Kelas ${e.kelas} — ${escapeHtml(e.moduleTitle || "")}</div>
        <div class="s-meta" style="margin-top:4px;">Dikumpulkan: ${formatDateTime(e.submittedAt)}</div>
      </div>
      <div class="form-group">
        <label>Pertanyaan</label>
        <div style="padding:14px 16px; background:var(--bg); border-radius:var(--radius);">${escapeHtml(e.pertanyaan || "")}</div>
      </div>
      <div class="form-group">
        <label>Jawaban Siswa</label>
        <div style="padding:14px 16px; background:var(--bg); border-radius:var(--radius); white-space:pre-wrap; line-height:1.7;">${escapeHtml(e.jawabanSiswa || "")}</div>
      </div>
      <div class="form-group">
        <label for="esaiNilai">Nilai (0-100)</label>
        <input type="number" id="esaiNilai" min="0" max="100" placeholder="Masukkan nilai">
      </div>
      <div style="display:flex; gap:12px;">
        <button class="btn-secondary" onclick="submitEsaiNilai('${e.id}')">Setujui & Simpan Nilai</button>
      </div>
    </div>
  `;
};

window.submitEsaiNilai = async function (esaiId) {
  const nilaiInput = document.getElementById("esaiNilai");
  const nilai = parseInt(nilaiInput.value);

  if (isNaN(nilai) || nilai < 0 || nilai > 100) {
    alert("Masukkan nilai antara 0 dan 100.");
    return;
  }

  try {
    await updateDoc(doc(db, "esai_jawaban", esaiId), {
      status: "dinilai",
      nilai: nilai,
      dinilaiOleh: user.uid,
      dinilaiOlehNama: user.namaDisplay || user.nama,
      reviewedAt: Date.now(),
    });
    await syncStudentModuleProgress(esaiId, nilai);
    renderEsai();
  } catch (err) {
    console.error("Failed to submit grade:", err);
    alert("Gagal menyimpan nilai. Coba lagi.");
  }
};

async function syncStudentModuleProgress(esaiId, currentNilai) {
  const essay = allEsai.find((item) => item.id === esaiId);
  if (!essay || !essay.uidSiswa || !essay.moduleId) return;

  const studentRef = doc(db, "users", essay.uidSiswa);
  const studentSnap = await getDoc(studentRef);
  if (!studentSnap.exists()) return;

  const student = studentSnap.data();
  const moduleEssays = allEsai
    .filter((item) => item.uidSiswa === essay.uidSiswa && item.moduleId === essay.moduleId)
    .map((item) => item.id === esaiId ? { ...item, status: "dinilai", nilai: currentNilai } : item);
  const pendingCount = moduleEssays.filter((item) => item.status !== "dinilai").length;
  const essayPoints = moduleEssays
    .filter((item) => item.status === "dinilai")
    .reduce((sum, item) => sum + ((Number(item.nilai) || 0) / 100), 0);

  const progress = Array.isArray(student.progress) ? student.progress : [];
  const updatedProgress = progress.map((entry) => {
    if (entry.moduleId !== essay.moduleId) return entry;
    const totalQuestions = Number(entry.totalQuestions) || 0;
    const autoCorrect = Number(entry.correctCount) || 0;
    const score = totalQuestions > 0
      ? Math.round(((autoCorrect + essayPoints) / totalQuestions) * 100)
      : Number(entry.score) || 0;

    return {
      ...entry,
      score,
      pendingCount,
      status: pendingCount > 0 ? "menunggu_dinilai" : "selesai",
      completedAt: pendingCount > 0 ? entry.completedAt : Date.now(),
    };
  });

  await updateDoc(studentRef, { progress: updatedProgress });
}

// ============ TAB: PROMPT GENERATOR ============
window.updatePromptTotal = function () {
  const pg = parseInt(document.getElementById("promptPG").value) || 0;
  const isian = parseInt(document.getElementById("promptIsian").value) || 0;
  const esai = parseInt(document.getElementById("promptEsai").value) || 0;
  const sambung = parseInt(document.getElementById("promptSambung").value) || 0;
  document.getElementById("promptTotalDisplay").textContent = pg + isian + esai + sambung;
};

window.generatePrompt = function () {
  const kelas = document.getElementById("promptKelas").value;
  const judul = document.getElementById("promptJudul").value.trim();
  const level = document.getElementById("promptLevel").value;
  const materi = document.getElementById("promptMateri").value.trim();

  const jumlahPG = Math.max(0, parseInt(document.getElementById("promptPG").value) || 0);
  const jumlahIsian = Math.max(0, parseInt(document.getElementById("promptIsian").value) || 0);
  const jumlahEsai = Math.max(0, parseInt(document.getElementById("promptEsai").value) || 0);
  const jumlahSambung = Math.max(0, parseInt(document.getElementById("promptSambung").value) || 0);
  const jumlahNum = jumlahPG + jumlahIsian + jumlahEsai + jumlahSambung;

  if (!judul) {
    alert("Isi judul modul terlebih dahulu.");
    return;
  }
  if (!materi) {
    alert("Tempelkan materi ajar terlebih dahulu.");
    return;
  }
  if (jumlahNum < 1) {
    alert("Isi jumlah soal minimal 1 di salah satu tipe soal.");
    return;
  }

  const rincianList = [];
  if (jumlahPG > 0) rincianList.push(`   - Pilihan ganda (Objektif): tepat ${jumlahPG} soal. 5 pilihan jawaban (A-E), tentukan jawaban benar.`);
  if (jumlahIsian > 0) rincianList.push(`   - Isian: tepat ${jumlahIsian} soal. Siswa mengetik jawaban singkat, tentukan jawaban benar.`);
  if (jumlahEsai > 0) rincianList.push(`   - Isian kompleks/esai: tepat ${jumlahEsai} soal. Siswa mengetik jawaban panjang, tidak perlu jawaban benar (akan dinilai manual guru).`);
  if (jumlahSambung > 0) rincianList.push(`   - Sambung (Menjodohkan): tepat ${jumlahSambung} soal. Kalimat rumpang yang harus diisi dari bank kata yang disediakan.`);
  const rincian = rincianList.join("\n");

  const prompt = `Kamu adalah pembuat soal untuk siswa Sekolah Dasar. Buatkan total ${jumlahNum} soal latihan berdasarkan materi di bawah ini.

MATA PELAJARAN: ${judul}
KELAS: ${kelas}
LEVEL KESULITAN: ${level} (dari 1-6, semakin tinggi semakin sulit)

MATERI:
"""
${materi}
"""

INSTRUKSI:
1. Buat soal dengan jumlah PERSIS sesuai rincian tipe berikut (jangan ditambah atau dikurangi):
${rincian}
2. Sesuaikan tingkat kesulitan dengan level ${level}.
3. Gunakan bahasa Indonesia yang jelas dan mudah dipahami siswa SD kelas ${kelas}.
4. Pastikan soal relevan dengan materi yang diberikan.

OUTPUT DALAM FORMAT JSON PERSIS SEPERTI CONTOH BERIKUT (jangan tambahkan teks di luar JSON):

{
  "judul": "${judul}",
  "kelas": ${kelas},
  "level": ${level},
  "soal": [
    { "tipe": "pilihan_ganda", "pertanyaan": "...", "pilihan": ["A","B","C","D","E"], "jawaban_benar": "A" },
    { "tipe": "isian", "pertanyaan": "...", "jawaban_benar": "..." },
    { "tipe": "isian_kompleks", "pertanyaan": "..." },
    { "tipe": "sambung", "kalimat": ["Bagian 1", "Bagian 2", "Bagian 3"], "pilihan_kata": ["kata1","kata2","kata3","kata4"], "jawaban": ["kata1","kata2","kata3"] }
  ]
}

Untuk tipe "sambung": field "kalimat" berisi bagian-bagian kalimat yang dipisah, field "pilihan_kata" berisi bank kata (termasuk kata-kata pengecoh), dan field "jawaban" berisi kata-kata yang benar sesuai urutan bagian kosong.

Untuk tipe "pilihan_ganda": field "pilihan" berisi 5 opsi, dan "jawaban_benar" berisi TEKS dari opsi yang benar (bukan huruf A-E).

Untuk tipe "isian": "jawaban_benar" berisi jawaban singkat yang benar.

Untuk tipe "isian_kompleks": tidak perlu field jawaban (akan dinilai manual oleh guru).

Pastikan total ${jumlahNum} soal dan output hanya JSON saja, tanpa penjelasan tambahan.`;

  document.getElementById("promptOutput").value = prompt;
  document.getElementById("promptResult").style.display = "block";
};

window.copyPrompt = function () {
  const output = document.getElementById("promptOutput");
  output.select();
  document.execCommand("copy");
  alert("Prompt berhasil disalin!");
};

// ============ TAB: DROP SOAL ============
let validatedJson = null;

window.validateJson = function () {
  const raw = document.getElementById("dropJson").value.trim();
  const msgEl = document.getElementById("dropMsg");
  const successEl = document.getElementById("dropSuccess");
  const applyBtn = document.getElementById("applyBtn");

  msgEl.classList.remove("show");
  msgEl.style.display = "none";
  successEl.style.display = "none";
  applyBtn.disabled = true;
  applyBtn.style.opacity = "0.5";
  applyBtn.style.pointerEvents = "none";
  validatedJson = null;

  if (!raw) {
    showDropError("Tempelkan JSON terlebih dahulu.");
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    showDropError("JSON tidak valid: " + err.message);
    return;
  }

  // Validate top-level fields
  if (!parsed.judul || typeof parsed.judul !== "string") {
    showDropError("Field 'judul' wajib ada dan berupa teks.");
    return;
  }

  const kelasNum = parseInt(parsed.kelas);
  if (isNaN(kelasNum) || kelasNum < 3 || kelasNum > 6) {
    showDropError("Field 'kelas' harus berupa angka 3, 4, 5, atau 6.");
    return;
  }

  if (!Array.isArray(parsed.soal) || parsed.soal.length === 0) {
    showDropError("Field 'soal' wajib ada dan berupa array yang tidak kosong.");
    return;
  }

  const validTipes = ["pilihan_ganda", "isian", "isian_kompleks", "sambung"];

  for (let i = 0; i < parsed.soal.length; i++) {
    const s = parsed.soal[i];
    const prefix = `Soal ${i + 1}: `;

    if (!s.tipe || !validTipes.includes(s.tipe)) {
      showDropError(`${prefix}tipe tidak valid. Harus salah satu dari: ${validTipes.join(", ")}`);
      return;
    }

    if (!s.pertanyaan && s.tipe !== "sambung") {
      showDropError(`${prefix}field 'pertanyaan' wajib ada.`);
      return;
    }

    if (s.tipe === "pilihan_ganda") {
      if (!Array.isArray(s.pilihan) || s.pilihan.length < 2) {
        showDropError(`${prefix}tipe pilihan_ganda harus punya field 'pilihan' berupa array minimal 2 opsi.`);
        return;
      }
      if (!s.jawaban_benar || typeof s.jawaban_benar !== "string") {
        showDropError(`${prefix}tipe pilihan_ganda harus punya field 'jawaban_benar' berupa teks.`);
        return;
      }
      if (!s.pilihan.includes(s.jawaban_benar)) {
        showDropError(`${prefix}jawaban_benar "${s.jawaban_benar}" tidak ditemukan dalam pilihan.`);
        return;
      }
    }

    if (s.tipe === "isian") {
      if (!s.jawaban_benar || typeof s.jawaban_benar !== "string") {
        showDropError(`${prefix}tipe isian harus punya field 'jawaban_benar' berupa teks.`);
        return;
      }
    }

    if (s.tipe === "isian_kompleks") {
      if (!s.pertanyaan || typeof s.pertanyaan !== "string") {
        showDropError(`${prefix}tipe isian_kompleks harus punya field 'pertanyaan'.`);
        return;
      }
    }

    if (s.tipe === "sambung") {
      if (!Array.isArray(s.kalimat) || s.kalimat.length === 0) {
        showDropError(`${prefix}tipe sambung harus punya field 'kalimat' berupa array tidak kosong.`);
        return;
      }
      if (!Array.isArray(s.pilihan_kata) || s.pilihan_kata.length === 0) {
        showDropError(`${prefix}tipe sambung harus punya field 'pilihan_kata' berupa array tidak kosong.`);
        return;
      }
      if (!Array.isArray(s.jawaban) || s.jawaban.length === 0) {
        showDropError(`${prefix}tipe sambung harus punya field 'jawaban' berupa array tidak kosong.`);
        return;
      }
      // Check that all answers exist in the word bank
      for (let j = 0; j < s.jawaban.length; j++) {
        if (!s.pilihan_kata.includes(s.jawaban[j])) {
          showDropError(`${prefix}jawaban "${s.jawaban[j]}" tidak ditemukan dalam pilihan_kata.`);
          return;
        }
      }
    }
  }

  // Valid!
  validatedJson = parsed;
  successEl.textContent = `Validasi berhasil! ${parsed.soal.length} soal siap diterapkan untuk Kelas ${kelasNum}.`;
  successEl.style.display = "block";
  applyBtn.disabled = false;
  applyBtn.style.opacity = "1";
  applyBtn.style.pointerEvents = "auto";
};

function showDropError(msg) {
  const msgEl = document.getElementById("dropMsg");
  msgEl.textContent = msg;
  msgEl.classList.add("show");
  msgEl.style.display = "block";
}

window.applyJson = async function () {
  if (!validatedJson) return;

  try {
    const modId = "mod_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 6);
    await setDoc(doc(db, "modules", modId), validatedJson);

    document.getElementById("dropSuccess").textContent = "Modul berhasil disimpan!";
    document.getElementById("dropSuccess").style.display = "block";
    document.getElementById("dropMsg").style.display = "none";
    document.getElementById("dropJson").value = "";
    document.getElementById("applyBtn").disabled = true;
    document.getElementById("applyBtn").style.opacity = "0.5";
    document.getElementById("applyBtn").style.pointerEvents = "none";
    validatedJson = null;
  } catch (err) {
    console.error("Failed to apply module:", err);
    showDropError("Gagal menyimpan modul: " + err.message);
  }
};

// ============ TAB: PENGATURAN (RESET TOTAL) ============
window.checkResetCode = function () {
  const code = document.getElementById("resetCode").value;
  const confirmEl = document.getElementById("resetConfirm");

  if (code !== "kata") {
    alert("Kode akses salah.");
    confirmEl.style.display = "none";
    return;
  }

  confirmEl.style.display = "block";
};

window.executeReset = async function () {
  const confirmText = document.getElementById("resetConfirmInput").value;

  if (confirmText !== "HAPUS") {
    alert('Ketik "HAPUS" untuk konfirmasi.');
    return;
  }

  try {
    // Delete all documents in users, modules, esai_jawaban
    const collectionsToDelete = ["users", "modules", "esai_jawaban"];

    for (const colName of collectionsToDelete) {
      const snap = await getDocs(collection(db, colName));
      const docs = [];
      snap.forEach((d) => docs.push(d));

      // Batch delete (max 500 per batch)
      for (let i = 0; i < docs.length; i += 450) {
        const batch = writeBatch(db);
        const chunk = docs.slice(i, i + 450);
        chunk.forEach((d) => batch.delete(doc(db, colName, d.id)));
        await batch.commit();
      }
    }

    // Clear local storage
    sessionStorage.clear();
    localStorage.clear();

    alert("Semua data berhasil dihapus.");
    window.location.href = "index.html";
  } catch (err) {
    console.error("Reset failed:", err);
    alert("Gagal menghapus data: " + err.message);
  }
};

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = String(str);
  return div.innerHTML;
}
