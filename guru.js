// LUDUS — Versi 2.1 (pembahasan + peninjauan guru)
import {
  db,
  collection,
  query,
  where,
  onSnapshot,
  doc,
  getDoc,
  getDocs,
  getDocsFromServer,
  updateDoc,
  setDoc,
  deleteDoc,
  writeBatch,
} from "./firebase-config.js";
import {
  normalizeTitle,
  isRemedial,
  stripRemedialPrefix,
  normalizeQuestion,
  blankQuestion,
  validateSoalForPublish,
  countMissingPembahasan,
  countByTipe,
  TIPE_LABEL,
} from "./module-normalize.js";
import { hashPassword, normalizeName, generateUid } from "./auth-helpers.js";
import { waitForWriteSync, waitForDeleteSync, isOnline } from "./sync-helpers.js";

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
  el.style.background = "";
  el.style.color = "";
}

function showAddStudentPending(msg) {
  const el = document.getElementById("addStudentMsg");
  if (!msg) {
    el.style.display = "none";
    return;
  }
  el.textContent = msg;
  el.classList.add("show");
  el.style.display = "block";
  el.style.background = "var(--accent-light)";
  el.style.color = "#92400e";
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

    const saveBtn = document.getElementById("btnSubmitNewStudent");
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = "Menyimpan...";
    }
    showAddStudentPending("Menyimpan ke server, mohon tunggu... Jangan tutup halaman ini.");

    await setDoc(doc(db, "users", newUid), newProfile);

    await waitForWriteSync(doc(db, "users", newUid));

    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = "Simpan Siswa";
    }
    showAddStudentPending("");
    window.toggleAddStudentForm();
    activeClass = kelas;
  } catch (err) {
    const saveBtn = document.getElementById("btnSubmitNewStudent");
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = "Simpan Siswa";
    }
    if (err && err.message === "TIMEOUT") {
      showAddStudentError(
        "Belum ada konfirmasi dari server setelah 15 detik — kemungkinan koneksi internet lemah/terputus. " +
        "Data MUNGKIN belum benar-benar tersimpan. JANGAN tutup halaman ini, tunggu koneksi kembali, lalu coba periksa apakah siswa sudah muncul di daftar sebelum menambahkan ulang (supaya tidak dobel)."
      );
      return;
    }
    console.error("Gagal menambahkan siswa:", err);
    showAddStudentError("Gagal menyimpan siswa: " + err.message);
  }
};

// ============ HAPUS SISWA ============
window.deleteStudent = async function (studentId, studentName, event) {
  if (event) event.stopPropagation();

  const ok = confirm(`Hapus siswa "${studentName}"? Seluruh data nilai siswa ini juga akan terhapus. Aksi ini tidak bisa dibatalkan.`);
  if (!ok) return;

  if (!isOnline()) {
    alert("Kamu sedang offline. Sambungkan ke internet dulu sebelum menghapus siswa, supaya perubahan benar-benar sampai ke server.");
    return;
  }

  try {
    const studentRef = doc(db, "users", studentId);
    await deleteDoc(studentRef);
    await waitForDeleteSync(studentRef);

    const esaiSnap = await getDocs(
      query(collection(db, "esai_jawaban"), where("uidSiswa", "==", studentId))
    );
    const esaiIds = [];
    esaiSnap.forEach((d) => esaiIds.push(d.id));
    for (const esaiId of esaiIds) {
      const esaiRef = doc(db, "esai_jawaban", esaiId);
      await deleteDoc(esaiRef);
      await waitForDeleteSync(esaiRef);
    }

    if (detailStudentId === studentId) {
      detailStudentId = null;
    }
  } catch (err) {
    if (err && err.isTimeout) {
      alert(
        `Belum ada konfirmasi dari server dalam 15 detik untuk penghapusan "${studentName}". ` +
        `Kemungkinan koneksi lemah/terputus — periksa lagi apakah siswa ini masih muncul di daftar sebelum mencoba menghapus ulang.`
      );
      return;
    }
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

  const titleGroups = {};
  classModules.forEach((mod) => {
    const norm = normalizeTitle(mod.judul);
    if (!titleGroups[norm]) titleGroups[norm] = [];
    titleGroups[norm].push(mod);
  });

  let detailHtml = "";
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
      ${e.pembahasan ? `<div class="form-group">
        <label>Panduan Jawaban (pembahasan dari modul)</label>
        <div style="padding:14px 16px; background:var(--success-light); border-radius:var(--radius); white-space:pre-wrap; line-height:1.7;">${escapeHtml(e.pembahasan)}</div>
      </div>` : ""}
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

  if (!isOnline()) {
    alert("Kamu sedang offline. Sambungkan ke internet dulu sebelum menyimpan nilai, supaya nilai benar-benar sampai ke server dan tidak hilang.");
    return;
  }

  const btn = document.querySelector(`button[onclick="submitEsaiNilai('${esaiId}')"]`);
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Menyimpan ke server...";
  }

  try {
    const esaiRef = doc(db, "esai_jawaban", esaiId);
    await updateDoc(esaiRef, {
      status: "dinilai",
      nilai: nilai,
      dinilaiOleh: user.uid,
      dinilaiOlehNama: user.namaDisplay || user.nama,
      reviewedAt: Date.now(),
    });
    await waitForWriteSync(esaiRef);
    await syncStudentModuleProgress(esaiId, nilai);
    renderEsai();
  } catch (err) {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Setujui & Simpan Nilai";
    }
    if (err && err.isTimeout) {
      alert(
        "Belum ada konfirmasi dari server dalam 15 detik. Kemungkinan koneksi lemah/terputus — " +
        "JANGAN tutup halaman ini, tunggu koneksi kembali, lalu periksa lagi apakah nilai sudah tersimpan sebelum mencoba ulang."
      );
      return;
    }
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
  await waitForWriteSync(studentRef);
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

  const targetCounts = {
    pilihan_ganda: jumlahPG,
    isian: jumlahIsian,
    isian_kompleks: jumlahEsai,
    sambung: jumlahSambung,
  };

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
  if (jumlahPG > 0) rincianList.push(`   - Pilihan ganda (Objektif): tepat ${jumlahPG} soal. 5 pilihan jawaban, tentukan jawaban benar.`);
  if (jumlahIsian > 0) rincianList.push(`   - Isian: tepat ${jumlahIsian} soal. Siswa mengetik jawaban singkat, tentukan jawaban benar.`);
  if (jumlahEsai > 0) rincianList.push(`   - Isian kompleks/esai: tepat ${jumlahEsai} soal. Siswa mengetik jawaban panjang, tidak perlu jawaban benar (akan dinilai manual guru), tetapi tetap beri pembahasan berupa contoh jawaban ideal.`);
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

INSTRUKSI WAJIB:
1. Buat jumlah soal PERSIS sesuai rincian berikut:
${rincian}
2. Jika jumlah suatu tipe adalah 0, tipe tersebut DILARANG muncul dalam output.
3. Jangan mengganti kekurangan satu tipe dengan menambah tipe lain.
4. Jumlah pilihan ganda harus tepat ${jumlahPG}.
5. Jumlah isian harus tepat ${jumlahIsian}.
6. Jumlah esai/isian kompleks harus tepat ${jumlahEsai}.
7. Jumlah sambung/menjodohkan harus tepat ${jumlahSambung}.
8. Total seluruh soal harus tepat ${jumlahNum}.
9. Sebelum mengeluarkan JSON, hitung ulang jumlah tiap tipe. Jika jumlahnya tidak sesuai, perbaiki terlebih dahulu.
10. Jangan membuat soal tambahan sebagai contoh.
11. Jangan membuat soal dari tipe yang jumlahnya 0.
12. Sesuaikan tingkat kesulitan dengan level ${level}.
13. Gunakan bahasa Indonesia yang jelas dan mudah dipahami siswa SD kelas ${kelas}.
14. Pastikan semua soal relevan dengan materi yang diberikan.
15. SETIAP soal WAJIB punya field "pembahasan" (lihat aturan pembahasan di bawah).

OUTPUT DALAM FORMAT JSON PERSIS SEPERTI CONTOH BERIKUT (jangan tambahkan teks di luar JSON):

{
  "judul": "${judul}",
  "kelas": ${kelas},
  "level": ${level},
  "soal": [
    { "tipe": "pilihan_ganda", "pertanyaan": "...", "pilihan": ["isi opsi 1","isi opsi 2","isi opsi 3","isi opsi 4","isi opsi 5"], "jawaban_benar": "isi opsi yang benar", "pembahasan": "..." },
    { "tipe": "isian", "pertanyaan": "...", "jawaban_benar": "...", "pembahasan": "..." },
    { "tipe": "isian_kompleks", "pertanyaan": "...", "pembahasan": "..." },
    { "tipe": "sambung", "kalimat": ["Bagian 1", "Bagian 2", "Bagian 3"], "pilihan_kata": ["kata1","kata2","kata3","kata4"], "jawaban": ["kata1","kata2","kata3"], "pembahasan": "..." }
  ]
}

Untuk tipe "pilihan_ganda": field "pilihan" berisi 5 opsi (isi jawabannya saja, TANPA awalan huruf seperti "A." atau "B)"), semua opsi harus berbeda, dan "jawaban_benar" berisi TEKS dari opsi yang benar (sama persis dengan salah satu isi "pilihan", bukan huruf A-E).

Untuk tipe "isian": "jawaban_benar" berisi jawaban singkat yang benar.

Untuk tipe "isian_kompleks": tidak perlu field jawaban (akan dinilai manual oleh guru).

Untuk tipe "sambung": setiap elemen "kalimat" adalah potongan teks yang DIIKUTI oleh SATU kotak kosong. Jumlah elemen "jawaban" harus sama dengan jumlah elemen "kalimat", dan urutannya sesuai kotak kosong tersebut. "pilihan_kata" adalah bank kata (termasuk beberapa kata pengecoh, semua kata berbeda) dan setiap isi "jawaban" harus ada di "pilihan_kata".

ATURAN PEMBAHASAN (field "pembahasan"):
- Isi dengan 2-4 kalimat sederhana yang menjelaskan MENGAPA jawaban yang benar itu benar, berdasarkan materi di atas.
- Untuk pilihan ganda: sebutkan isi jawaban yang benar (JANGAN menyebut huruf A/B/C/D/E) lalu beri alasannya; boleh menambahkan singkat mengapa pilihan lain kurang tepat.
- Untuk isian dan sambung: jelaskan alasan jawaban yang benar.
- Untuk esai: tuliskan contoh jawaban ideal beserta poin-poin pentingnya.
- Pembahasan harus tetap benar dibaca siswa yang menjawab BENAR maupun SALAH.

Pastikan total ${jumlahNum} soal dan output hanya JSON saja, tanpa penjelasan tambahan.`;

  sessionStorage.setItem("promptTargetCounts", JSON.stringify(targetCounts));
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
// Alur: tempel JSON -> Validasi -> Terapkan  => modul masuk ke koleksi "modul_draft"
//       (BELUM terlihat siswa)  => pilih  [Periksa] atau [Gunakan]
//       Periksa  : guru meninjau/mengubah soal (tersimpan otomatis), lalu Terapkan
//       Gunakan  : langsung dipakai siswa tanpa diperiksa
//       Setelah diterapkan modul TERKUNCI (status "diterapkan") dan tidak bisa diubah lagi.
const LETTERS = ["A", "B", "C", "D", "E"];
let validatedJson = null;
let draftModules = [];
let editor = null;

function escAttr(str) {
  return escapeHtml(str).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function friendlyError(err) {
  if (err && err.code === "permission-denied") {
    return "Ditolak oleh database (permission-denied). Pastikan firestore.rules versi terbaru sudah dipublikasikan di Firebase Console (ada koleksi baru 'modul_draft').";
  }
  return (err && err.message) || String(err);
}

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

  const targetCountsRaw = sessionStorage.getItem("promptTargetCounts");
  if (!targetCountsRaw) {
    showDropError(
      "Buat prompt baru terlebih dahulu sebelum menempelkan JSON, agar jumlah setiap tipe soal dapat divalidasi."
    );
    return;
  }

  let targetCounts;
  try {
    targetCounts = JSON.parse(targetCountsRaw);
  } catch (err) {
    showDropError("Target jumlah soal tidak valid. Buat prompt baru terlebih dahulu.");
    return;
  }

  const actualCounts = {
    pilihan_ganda: 0,
    isian: 0,
    isian_kompleks: 0,
    sambung: 0,
  };

  const validTipes = ["pilihan_ganda", "isian", "isian_kompleks", "sambung"];
  let missingPembahasan = 0;

  for (let i = 0; i < parsed.soal.length; i++) {
    const s = parsed.soal[i];
    const prefix = `Soal ${i + 1}: `;

    if (!s || typeof s !== "object") {
      showDropError(`${prefix}isi soal tidak valid.`);
      return;
    }

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
      if (new Set(s.pilihan.map((p) => String(p).trim().toLowerCase())).size !== s.pilihan.length) {
        showDropError(`${prefix}ada dua pilihan jawaban yang sama persis.`);
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
      if (s.jawaban.length !== s.kalimat.length) {
        showDropError(`${prefix}jumlah 'jawaban' (${s.jawaban.length}) harus sama dengan jumlah 'kalimat' (${s.kalimat.length}).`);
        return;
      }
      for (let j = 0; j < s.jawaban.length; j++) {
        if (!s.pilihan_kata.includes(s.jawaban[j])) {
          showDropError(`${prefix}jawaban "${s.jawaban[j]}" tidak ditemukan dalam pilihan_kata.`);
          return;
        }
      }
    }

    if (s.tipe !== "isian_kompleks") {
      const pemb = s.pembahasan ?? s.penjelasan ?? s.alasan ?? "";
      if (!String(pemb).trim()) missingPembahasan++;
    }

    if (Object.prototype.hasOwnProperty.call(actualCounts, s.tipe)) {
      actualCounts[s.tipe]++;
    }
  }

  const typeLabels = {
    pilihan_ganda: "pilihan ganda",
    isian: "isian",
    isian_kompleks: "esai",
    sambung: "sambung",
  };

  for (const tipe of Object.keys(targetCounts)) {
    const expected = Number(targetCounts[tipe]) || 0;
    const actual = actualCounts[tipe];

    if (actual !== expected) {
      showDropError(
        `Jumlah ${typeLabels[tipe]} tidak sesuai. Diminta ${expected}, tetapi ditemukan ${actual}.`
      );
      return;
    }

    if (expected === 0 && actual > 0) {
      showDropError(
        `Tipe ${typeLabels[tipe]} dipilih 0, tetapi masih ditemukan ${actual} soal.`
      );
      return;
    }
  }

  const expectedTotal = Object.values(targetCounts).reduce(
    (sum, count) => sum + (Number(count) || 0),
    0
  );

  if (parsed.soal.length !== expectedTotal) {
    showDropError(
      `Total soal tidak sesuai. Diminta ${expectedTotal}, tetapi ditemukan ${parsed.soal.length}.`
    );
    return;
  }

  validatedJson = parsed;
  let okMsg = `Validasi berhasil! ${parsed.soal.length} soal siap diterapkan untuk Kelas ${kelasNum}.`;
  if (missingPembahasan > 0) {
    okMsg += ` ⚠ ${missingPembahasan} soal belum punya "pembahasan" — bisa dilengkapi lewat tombol Periksa setelah diterapkan.`;
  }
  successEl.textContent = okMsg;
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

// "Terapkan" (tahap 1): simpan sebagai DRAFT. Belum terlihat siswa.
window.applyJson = async function () {
  if (!validatedJson) return;

  if (!isOnline()) {
    alert("Kamu sedang offline. Sambungkan ke internet dulu sebelum menerapkan soal, supaya modul benar-benar sampai ke server.");
    return;
  }

  const applyBtn = document.getElementById("applyBtn");
  applyBtn.disabled = true;
  applyBtn.style.pointerEvents = "none";
  applyBtn.textContent = "Menyimpan ke server...";

  try {
    const modId = "mod_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 6);
    const draftRef = doc(db, "modul_draft", modId);
    const soal = validatedJson.soal.map((s, i) => normalizeQuestion(s, i)).filter(Boolean);
    const now = Date.now();

    await setDoc(draftRef, {
      judul: validatedJson.judul.trim(),
      kelas: parseInt(validatedJson.kelas),
      level: Number(validatedJson.level) || 1,
      soal,
      status: "draft",
      edited: false,
      createdAt: now,
      updatedAt: now,
      createdBy: user.uid,
    });
    await waitForWriteSync(draftRef);

    sessionStorage.removeItem("promptTargetCounts");

    document.getElementById("dropSuccess").textContent =
      "Modul tersimpan sebagai draft (belum terlihat siswa). Lihat di bagian \"Modul Menunggu Peninjauan\" di bawah, lalu pilih Periksa atau Gunakan.";
    document.getElementById("dropSuccess").style.display = "block";
    document.getElementById("dropMsg").style.display = "none";
    document.getElementById("dropJson").value = "";
    applyBtn.textContent = "Terapkan";
    applyBtn.disabled = true;
    applyBtn.style.opacity = "0.5";
    applyBtn.style.pointerEvents = "none";
    validatedJson = null;
  } catch (err) {
    applyBtn.disabled = false;
    applyBtn.style.pointerEvents = "auto";
    applyBtn.textContent = "Terapkan";
    if (err && err.isTimeout) {
      showDropError(
        "Belum ada konfirmasi dari server dalam 15 detik. Kemungkinan koneksi lemah/terputus — " +
        "JANGAN tutup halaman ini, tunggu koneksi kembali, lalu periksa apakah modul sudah muncul di daftar sebelum menekan Terapkan lagi (supaya tidak dobel)."
      );
      return;
    }
    console.error("Failed to apply module:", err);
    showDropError("Gagal menyimpan modul: " + friendlyError(err));
  }
};

// ---------- Daftar modul draft ----------
onSnapshot(
  collection(db, "modul_draft"),
  (snap) => {
    draftModules = [];
    snap.forEach((d) => draftModules.push({ id: d.id, ...d.data() }));
    draftModules.sort(
      (a, b) =>
        (a.status === "draft" ? 0 : 1) - (b.status === "draft" ? 0 : 1) ||
        (b.createdAt || 0) - (a.createdAt || 0)
    );
    renderDraftList();
  },
  (err) => {
    console.error("Gagal memuat modul draft:", err);
    const el = document.getElementById("draftList");
    if (el) el.innerHTML = `<div class="error-msg show" style="display:block; grid-column:1/-1;">Gagal memuat daftar modul: ${escapeHtml(friendlyError(err))}</div>`;
  }
);

function renderDraftList() {
  const el = document.getElementById("draftList");
  if (!el) return;

  if (draftModules.length === 0) {
    el.innerHTML = '<div class="empty-state" style="grid-column:1/-1; padding:30px 20px;"><div class="icon">🗂️</div>Belum ada modul. Tempel JSON soal di atas, lalu Validasi dan Terapkan.</div>';
    return;
  }

  el.innerHTML = draftModules.map((m) => {
    const locked = m.status !== "draft";
    const soal = Array.isArray(m.soal) ? m.soal : [];
    const c = countByTipe(soal);
    const detail = [
      c.pg ? `PG ${c.pg}` : "",
      c.isian ? `Isian ${c.isian}` : "",
      c.isian_kompleks ? `Esai ${c.isian_kompleks}` : "",
      c.sambung ? `Jodoh ${c.sambung}` : "",
    ].filter(Boolean).join(" · ");

    const badge = locked
      ? '<span class="status-badge done">Sudah diterapkan</span>'
      : m.edited
        ? '<span class="status-badge pending">Draft · sudah diperiksa/diubah</span>'
        : '<span class="status-badge pending">Draft · belum diperiksa</span>';

    const buttons = locked
      ? `<div class="draft-actions"><button class="btn-outline" onclick="openDraftEditor('${m.id}')">Lihat</button></div>
         <div class="module-meta">🔒 Terkunci — dipakai siswa, tidak bisa diubah lagi</div>`
      : `<div class="draft-actions">
           <button class="btn-outline" onclick="openDraftEditor('${m.id}')">Periksa</button>
           <button class="btn-primary" onclick="quickApplyDraft('${m.id}')">Gunakan</button>
         </div>`;

    return `<div class="module-card draft-card ${locked ? "locked" : ""}">
      <div class="module-icon">${locked ? "🔒" : "📝"}</div>
      <div class="module-title">${escapeHtml(m.judul || "Tanpa Judul")}</div>
      <div class="module-meta">Kelas ${escapeHtml(m.kelas)} · ${soal.length} soal</div>
      <div class="module-meta">${detail}</div>
      ${badge}
      ${buttons}
    </div>`;
  }).join("");
}

function showDraftNotice(msg) {
  const el = document.getElementById("draftNotice");
  if (!el) return;
  el.innerHTML = `<div class="draft-notice">${escapeHtml(msg)}</div>`;
  setTimeout(() => { if (el.firstChild) el.innerHTML = ""; }, 9000);
}

// ---------- Terapkan modul ke siswa (mengunci modul) ----------
function sanitizeSoal(soalList) {
  const t = (v) => String(v == null ? "" : v).trim();
  return soalList.map((s) => {
    const out = { tipe: s.tipe, pertanyaan: t(s.pertanyaan), pembahasan: t(s.pembahasan) };
    if (s.tipe === "pg") {
      out.opsi = (s.opsi || []).map(t);
      out.jawaban = s.jawaban;
    } else if (s.tipe === "isian") {
      out.jawaban = t(s.jawaban);
    } else if (s.tipe === "sambung") {
      out.kalimat = (s.kalimat || []).map(t);
      out.bank = (s.bank || []).map(t);
      out.jawaban = {};
      Object.keys(s.jawaban || {}).forEach((k) => { out.jawaban[k] = t(s.jawaban[k]); });
    }
    return out;
  });
}

async function publishDraft(mod) {
  const modRef = doc(db, "modules", mod.id);
  const draftRef = doc(db, "modul_draft", mod.id);
  const soal = sanitizeSoal(mod.soal);
  const judul = String(mod.judul).trim();
  const kelas = parseInt(mod.kelas);
  const now = Date.now();

  // Satu batch = atomik: modul untuk siswa dibuat + draft dikunci sekaligus.
  const batch = writeBatch(db);
  batch.set(modRef, {
    judul,
    kelas,
    level: Number(mod.level) || 1,
    soal,
    createdAt: now,
    createdBy: user.uid,
    dariDraft: mod.id,
  });
  batch.update(draftRef, {
    judul,
    kelas,
    soal,
    status: "diterapkan",
    appliedAt: now,
    appliedBy: user.uid,
  });
  await batch.commit();
  await waitForWriteSync(modRef);
}

async function confirmAndPublish(mod) {
  const missing = countMissingPembahasan(mod.soal);
  let msg =
    `Terapkan modul "${mod.judul}" untuk Kelas ${mod.kelas}?\n\n` +
    `Setelah diterapkan:\n` +
    `• Modul langsung bisa dikerjakan siswa Kelas ${mod.kelas}\n` +
    `• Modul TERKUNCI dan tidak bisa diubah lagi`;
  if (missing > 0) msg += `\n\n⚠ ${missing} soal belum punya pembahasan.`;
  if (!confirm(msg)) return false;

  if (!isOnline()) {
    alert("Kamu sedang offline. Sambungkan ke internet dulu sebelum menerapkan modul.");
    return false;
  }

  try {
    await publishDraft(mod);
    showDraftNotice(`Modul "${mod.judul}" sudah diterapkan dan terkunci. Siswa Kelas ${mod.kelas} sekarang bisa mengerjakannya.`);
    return true;
  } catch (err) {
    if (err && err.isTimeout) {
      alert(
        "Belum ada konfirmasi dari server dalam 15 detik. Kemungkinan koneksi lemah/terputus — " +
        "periksa dulu di daftar modul apakah statusnya sudah \"Sudah diterapkan\" sebelum mencoba lagi."
      );
      return false;
    }
    console.error("Gagal menerapkan modul:", err);
    alert("Gagal menerapkan modul: " + friendlyError(err));
    return false;
  }
}

// Tombol "Gunakan" di kartu: langsung diterapkan tanpa masuk mode periksa.
window.quickApplyDraft = async function (id) {
  const d = draftModules.find((x) => x.id === id);
  if (!d || d.status !== "draft") return;
  const soal = (d.soal || []).map((s, i) => normalizeQuestion(s, i)).filter(Boolean);
  const errors = validateSoalForPublish(soal);
  if (errors.length > 0) {
    alert(
      "Modul ini belum bisa langsung digunakan karena ada bagian yang kurang:\n\n• " +
      errors.slice(0, 5).map((e) => e.msg).join("\n• ") +
      (errors.length > 5 ? `\n• ...dan ${errors.length - 5} lainnya` : "") +
      "\n\nKlik Periksa untuk memperbaikinya."
    );
    return;
  }
  await confirmAndPublish({ id, judul: d.judul, kelas: d.kelas, level: d.level, soal });
};

// ---------- Mode PERIKSA (editor modul) ----------
const dropEditorEl = document.getElementById("dropEditor");
dropEditorEl.addEventListener("input", edOnInput);
dropEditorEl.addEventListener("change", edOnInput);
dropEditorEl.addEventListener("click", edOnClick);

window.addEventListener("beforeunload", (e) => {
  if (editor && editor.dirty) {
    e.preventDefault();
    e.returnValue = "";
  }
});

window.openDraftEditor = function (id) {
  const d = draftModules.find((x) => x.id === id);
  if (!d) return;
  const locked = d.status !== "draft";

  editor = {
    id,
    readOnly: locked,
    level: d.level || 1,
    data: {
      judul: d.judul || "",
      kelas: String(d.kelas),
      soal: (d.soal || []).map((s, i) => normalizeQuestion(s, i)).filter(Boolean),
    },
    saveTimer: null,
    chain: Promise.resolve(true),
    dirty: false,
  };

  document.getElementById("dropMain").style.display = "none";
  dropEditorEl.style.display = "block";
  dropEditorEl.innerHTML = editorShellHtml(editor);
  edRenderQuestions();
  window.scrollTo(0, 0);
};

function editorShellHtml(ed) {
  const ro = ed.readOnly;
  return `
    <div class="ed-topbar">
      <button class="btn-outline" onclick="closeDraftEditor()">← Kembali</button>
      <span id="edSaveState" class="ed-save">${ro ? "🔒 Hanya bisa dilihat" : "✔ Tersimpan otomatis"}</span>
    </div>
    <div class="ed-banner ${ro ? "locked" : ""}">
      ${ro
        ? "🔒 Modul ini sudah diterapkan dan terkunci. Isinya hanya bisa dilihat, tidak bisa diubah lagi."
        : "✏️ Mode periksa — tampilan sama seperti yang dilihat siswa, ditambah kunci jawaban. Semua perubahan tersimpan otomatis. Kalau sudah pas, klik <strong>Terapkan</strong> di bagian bawah. Setelah diterapkan modul terkunci dan tidak bisa diubah lagi."}
    </div>
    <div id="edErrors" class="error-msg" style="display:none;"></div>
    <div class="card ed-head">
      <div class="form-group">
        <label for="edJudul">Judul Modul</label>
        <input type="text" id="edJudul" value="${escAttr(ed.data.judul)}" ${ro ? "disabled" : ""}>
      </div>
      <div class="form-group" style="margin-bottom:0;">
        <label for="edKelas">Kelas</label>
        <select id="edKelas" ${ro ? "disabled" : ""}>
          ${["3", "4", "5", "6"].map((k) => `<option value="${k}" ${ed.data.kelas === k ? "selected" : ""}>Kelas ${k}</option>`).join("")}
        </select>
      </div>
    </div>
    <div id="edQuestions"></div>
    ${ro ? "" : `
    <div class="card ed-add">
      <label for="edAddType">Tambah soal sendiri</label>
      <div class="ed-add-row">
        <select id="edAddType">
          <option value="pg">Pilihan Ganda</option>
          <option value="isian">Isian</option>
          <option value="isian_kompleks">Esai</option>
          <option value="sambung">Menjodohkan (Sambung)</option>
        </select>
        <button class="btn-secondary" data-act="addQ" style="white-space:nowrap;">+ Tambah Soal</button>
      </div>
    </div>
    <button class="btn-primary btn-big" onclick="edPublish()">Terapkan — Pakai untuk Siswa</button>`}
  `;
}

function edQuestionHtml(q, i, total, ro) {
  const dis = ro ? "disabled" : "";
  const di = `data-i="${i}"`;
  let body = "";

  if (q.tipe === "pg") {
    body = `<div class="ed-label">Pilihan jawaban <span class="ed-help">(klik huruf untuk menandai jawaban yang benar)</span></div><div class="ed-options">` +
      (q.opsi || []).map((o, k) => {
        const correct = q.jawaban === k;
        return `<div class="ed-opt ${correct ? "is-correct" : ""}">
          <button type="button" class="ed-letter ${correct ? "on" : ""}" data-act="correct" ${di} data-k="${k}" title="Tandai sebagai jawaban benar" ${dis}>${LETTERS[k] || k + 1}</button>
          <input type="text" class="ed-input" data-f="opsi" ${di} data-k="${k}" value="${escAttr(o)}" placeholder="Isi pilihan ${LETTERS[k] || k + 1}" ${dis}>
          ${correct ? '<span class="ed-ok">✔ Benar</span>' : ""}
          ${!ro && q.opsi.length > 2 ? `<button type="button" class="ed-mini" data-act="delOpt" ${di} data-k="${k}" title="Hapus pilihan ini">✕</button>` : ""}
        </div>`;
      }).join("") + `</div>` +
      (!ro && q.opsi.length < 5 ? `<button type="button" class="ed-link" data-act="addOpt" ${di}>+ Tambah pilihan</button>` : "");
  } else if (q.tipe === "isian") {
    body = `<div class="ed-label">Kunci jawaban <span class="ed-help">(huruf besar/kecil dianggap sama)</span></div>
      <input type="text" class="ed-input ed-key" data-f="jawaban" ${di} value="${escAttr(q.jawaban)}" placeholder="Jawaban yang benar" ${dis}>`;
  } else if (q.tipe === "sambung") {
    body = `<div class="ed-label">Kalimat <span class="ed-help">(tiap baris = teks + 1 kotak kosong setelahnya; pilih kata yang benar untuk kotak itu)</span></div>` +
      (q.kalimat || []).map((part, k) => `<div class="ed-row">
        <input type="text" class="ed-input" data-f="kalimat" ${di} data-k="${k}" value="${escAttr(part)}" placeholder="Teks bagian ${k + 1}" ${dis}>
        <span class="match-blank ed-blank">____</span>
        <select class="ed-input ed-sel ed-key" data-f="ans" ${di} data-k="${k}" ${dis}>${ansOptionsHtml(q, k)}</select>
        ${!ro && q.kalimat.length > 1 ? `<button type="button" class="ed-mini" data-act="delPart" ${di} data-k="${k}" title="Hapus baris ini">✕</button>` : ""}
      </div>`).join("") +
      (!ro ? `<button type="button" class="ed-link" data-act="addPart" ${di}>+ Tambah baris kalimat</button>` : "") +
      `<div class="ed-label" style="margin-top:14px;">Bank kata <span class="ed-help">(termasuk kata pengecoh)</span></div>
      <div class="ed-bank">` +
      (q.bank || []).map((w, k) => `<span class="ed-chip">
        <input type="text" data-f="bank" ${di} data-k="${k}" value="${escAttr(w)}" placeholder="kata" ${dis}>
        ${!ro ? `<button type="button" class="ed-mini" data-act="delWord" ${di} data-k="${k}" title="Hapus kata ini">✕</button>` : ""}
      </span>`).join("") + `</div>` +
      (!ro ? `<button type="button" class="ed-link" data-act="addWord" ${di}>+ Tambah kata</button>` : "");
  } else if (q.tipe === "isian_kompleks") {
    body = `<div class="ed-note">Soal esai dinilai manual oleh guru. Isi pembahasan di bawah sebagai contoh jawaban ideal — tampil ke siswa setelah jawabannya dinilai.</div>`;
  }

  const tools = ro ? "" : `<div class="ed-tools">
      <button type="button" class="ed-mini" data-act="up" ${di} ${i === 0 ? "disabled" : ""} title="Naikkan">↑</button>
      <button type="button" class="ed-mini" data-act="down" ${di} ${i === total - 1 ? "disabled" : ""} title="Turunkan">↓</button>
      <button type="button" class="ed-mini danger" data-act="delQ" ${di} title="Hapus soal ini">🗑</button>
    </div>`;

  return `<div class="question-card ed-card" data-qi="${i}">
    <div class="ed-qhead">
      <div class="question-number">Soal ${i + 1} · ${TIPE_LABEL[q.tipe] || ""}</div>
      ${tools}
    </div>
    <div class="ed-label">Pertanyaan</div>
    <textarea class="ed-input ed-q" data-f="pertanyaan" ${di} ${dis}>${escapeHtml(q.pertanyaan || "")}</textarea>
    ${body}
    <div class="ed-label" style="margin-top:16px;">💡 Pembahasan <span class="ed-help">(dilihat siswa setelah menjawab)</span></div>
    <textarea class="ed-input ed-pemb" data-f="pembahasan" ${di} placeholder="Jelaskan mengapa jawaban yang benar itu benar..." ${dis}>${escapeHtml(q.pembahasan || "")}</textarea>
  </div>`;
}

function ansOptionsHtml(q, k) {
  const current = (q.jawaban || {})[k];
  return '<option value="">— pilih jawaban benar —</option>' +
    (q.bank || []).map((w) => {
      if (!String(w).trim()) return "";
      return `<option value="${escAttr(w)}" ${current === w ? "selected" : ""}>${escapeHtml(w)}</option>`;
    }).join("");
}

function edRenderQuestions() {
  if (!editor) return;
  const host = document.getElementById("edQuestions");
  const y = window.scrollY;
  const soal = editor.data.soal;
  host.innerHTML = soal.length === 0
    ? '<div class="empty-state" style="padding:30px;"><div class="icon">📝</div>Belum ada soal. Tambahkan soal di bawah.</div>'
    : soal.map((q, i) => edQuestionHtml(q, i, soal.length, editor.readOnly)).join("");
  window.scrollTo(0, y);
}

function edSyncSelects(i) {
  const card = document.querySelector(`.ed-card[data-qi="${i}"]`);
  if (!card || !editor) return;
  const q = editor.data.soal[i];
  card.querySelectorAll('select[data-f="ans"]').forEach((sel) => {
    sel.innerHTML = ansOptionsHtml(q, Number(sel.dataset.k));
  });
}

function edOnInput(e) {
  const t = e.target;
  if (!editor || editor.readOnly) return;

  if (t.id === "edJudul") { editor.data.judul = t.value; edQueueSave(); return; }
  if (t.id === "edKelas") { editor.data.kelas = t.value; edQueueSave(); return; }

  const f = t.dataset && t.dataset.f;
  if (!f) return;
  const i = Number(t.dataset.i);
  const k = Number(t.dataset.k);
  const q = editor.data.soal[i];
  if (!q) return;

  switch (f) {
    case "pertanyaan":
    case "pembahasan":
      q[f] = t.value;
      break;
    case "jawaban":
      q.jawaban = t.value;
      break;
    case "opsi":
      q.opsi[k] = t.value;
      break;
    case "kalimat":
      q.kalimat[k] = t.value;
      break;
    case "bank": {
      const old = q.bank[k];
      q.bank[k] = t.value;
      // jawaban yang memakai kata ini ikut berubah
      Object.keys(q.jawaban).forEach((key) => {
        if (q.jawaban[key] === old) q.jawaban[key] = t.value;
      });
      edSyncSelects(i);
      break;
    }
    case "ans":
      if (t.value === "") delete q.jawaban[k];
      else q.jawaban[k] = t.value;
      break;
    default:
      return;
  }
  edQueueSave();
}

function edOnClick(e) {
  const b = e.target.closest("[data-act]");
  if (!b || !editor || editor.readOnly || b.disabled) return;
  const act = b.dataset.act;
  const i = Number(b.dataset.i);
  const k = Number(b.dataset.k);
  const soal = editor.data.soal;
  const q = soal[i];

  if (act === "addQ") {
    soal.push(blankQuestion(document.getElementById("edAddType").value));
    edRenderQuestions();
    edQueueSave();
    const cards = document.querySelectorAll(".ed-card");
    if (cards.length) cards[cards.length - 1].scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  if (!q) return;

  switch (act) {
    case "correct": q.jawaban = k; break;
    case "addOpt": if (q.opsi.length < 5) q.opsi.push(""); break;
    case "delOpt":
      if (q.opsi.length > 2) {
        q.opsi.splice(k, 1);
        if (q.jawaban === k) q.jawaban = 0;
        else if (q.jawaban > k) q.jawaban--;
      }
      break;
    case "addPart": q.kalimat.push(""); break;
    case "delPart":
      if (q.kalimat.length > 1) {
        q.kalimat.splice(k, 1);
        const next = {};
        Object.keys(q.jawaban).forEach((key) => {
          const j = Number(key);
          if (j === k) return;
          next[j > k ? j - 1 : j] = q.jawaban[key];
        });
        q.jawaban = next;
      }
      break;
    case "addWord": q.bank.push(""); break;
    case "delWord": {
      const w = q.bank[k];
      q.bank.splice(k, 1);
      Object.keys(q.jawaban).forEach((key) => {
        if (q.jawaban[key] === w) delete q.jawaban[key];
      });
      break;
    }
    case "up":
      if (i > 0) [soal[i - 1], soal[i]] = [soal[i], soal[i - 1]];
      break;
    case "down":
      if (i < soal.length - 1) [soal[i + 1], soal[i]] = [soal[i], soal[i + 1]];
      break;
    case "delQ":
      if (!confirm(`Hapus Soal ${i + 1}? Soal ini akan dibuang dari modul.`)) return;
      soal.splice(i, 1);
      break;
    default:
      return;
  }
  edRenderQuestions();
  edQueueSave();
}

// ---------- Simpan otomatis ----------
function setSaveState(ed, kind, err) {
  if (editor !== ed) return;
  const el = document.getElementById("edSaveState");
  if (!el) return;
  el.className = "ed-save " + kind;
  if (kind === "pending") el.textContent = "⏳ Menyimpan...";
  else if (kind === "saved") {
    const d = new Date();
    el.textContent = `✔ Tersimpan otomatis ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
  } else if (kind === "timeout") {
    el.innerHTML = '⚠ Belum terkonfirmasi server — jangan tutup halaman. <button type="button" class="ed-link" onclick="edRetrySave()">Coba lagi</button>';
  } else {
    el.innerHTML = `⚠ Gagal menyimpan: ${escapeHtml(friendlyError(err))} <button type="button" class="ed-link" onclick="edRetrySave()">Coba lagi</button>`;
  }
}

function edQueueSave() {
  const ed = editor;
  if (!ed || ed.readOnly) return;
  ed.dirty = true;
  setSaveState(ed, "pending");
  clearTimeout(ed.saveTimer);
  ed.saveTimer = setTimeout(() => { edFlush(ed); }, 700);
}

// Menyimpan semua perubahan; beberapa pemanggilan dijalankan berurutan (tidak tumpang tindih).
function edFlush(ed) {
  ed = ed || editor;
  if (!ed || ed.readOnly) return Promise.resolve(true);
  clearTimeout(ed.saveTimer);
  ed.chain = ed.chain.then(() => edSaveOnce(ed));
  return ed.chain;
}

async function edSaveOnce(ed) {
  if (!ed.dirty) return true;
  ed.dirty = false;
  const snapshot = {
    judul: ed.data.judul,
    kelas: parseInt(ed.data.kelas),
    soal: JSON.parse(JSON.stringify(ed.data.soal)),
    edited: true,
    updatedAt: Date.now(),
  };
  try {
    const ref = doc(db, "modul_draft", ed.id);
    await updateDoc(ref, snapshot);
    await waitForWriteSync(ref, 15000);
    if (!ed.dirty) setSaveState(ed, "saved");
    return true;
  } catch (err) {
    ed.dirty = true;
    console.error("Gagal menyimpan draft:", err);
    setSaveState(ed, err && err.isTimeout ? "timeout" : "error", err);
    return false;
  }
}

window.edRetrySave = function () {
  if (!editor) return;
  editor.dirty = true;
  setSaveState(editor, "pending");
  edFlush(editor);
};

window.closeDraftEditor = async function () {
  const ed = editor;
  if (!ed) return;
  if (!ed.readOnly) {
    const ok = await edFlush(ed);
    if (!ok && !confirm("Perubahan terakhir belum terkonfirmasi tersimpan di server. Tetap keluar dari mode periksa?")) {
      return;
    }
  }
  leaveEditor(ed);
};

function leaveEditor(ed) {
  clearTimeout(ed.saveTimer);
  editor = null;
  dropEditorEl.style.display = "none";
  dropEditorEl.innerHTML = "";
  document.getElementById("dropMain").style.display = "";
  renderDraftList();
  window.scrollTo(0, 0);
}

// Tombol "Terapkan" di dalam mode periksa.
window.edPublish = async function () {
  const ed = editor;
  if (!ed || ed.readOnly) return;

  const saved = await edFlush(ed);
  if (!saved) {
    alert("Perubahan terakhir belum tersimpan ke server. Tunggu sampai tulisan \"Tersimpan otomatis\" muncul, lalu klik Terapkan lagi.");
    return;
  }

  const errors = validateSoalForPublish(ed.data.soal);
  if (!String(ed.data.judul).trim()) errors.unshift({ index: -1, msg: "Judul modul masih kosong." });

  const errEl = document.getElementById("edErrors");
  if (errors.length > 0) {
    errEl.innerHTML = "<strong>Belum bisa diterapkan, perbaiki dulu:</strong><br>• " +
      errors.map((e) => escapeHtml(e.msg)).join("<br>• ");
    errEl.classList.add("show");
    errEl.style.display = "block";
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }
  errEl.style.display = "none";

  const done = await confirmAndPublish({
    id: ed.id,
    judul: ed.data.judul,
    kelas: ed.data.kelas,
    level: ed.level,
    soal: ed.data.soal,
  });
  if (done) leaveEditor(ed);
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

  if (!isOnline()) {
    alert("Kamu sedang offline. Sambungkan ke internet dulu sebelum Reset Total, supaya penghapusan benar-benar tuntas di server (bukan cuma di perangkat ini).");
    return;
  }

  try {
    const collectionsToDelete = ["users", "modules", "modul_draft", "esai_jawaban"];

    for (const colName of collectionsToDelete) {
      const snap = await getDocs(collection(db, colName));
      const docs = [];
      snap.forEach((d) => docs.push(d));

      for (let i = 0; i < docs.length; i += 450) {
        const batch = writeBatch(db);
        const chunk = docs.slice(i, i + 450);
        chunk.forEach((d) => batch.delete(doc(db, colName, d.id)));
        await batch.commit();
      }
    }

    for (const colName of collectionsToDelete) {
      const verifySnap = await getDocsFromServer(collection(db, colName));
      if (!verifySnap.empty) {
        throw new Error(
          `Verifikasi gagal: koleksi "${colName}" masih berisi ${verifySnap.size} data di server. ` +
          `Kemungkinan koneksi terputus di tengah proses. Jangan tutup halaman, pastikan online, lalu coba Reset Total lagi.`
        );
      }
    }

    sessionStorage.clear();
    localStorage.clear();

    alert("Semua data berhasil dihapus dan sudah terverifikasi kosong di server.");
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
