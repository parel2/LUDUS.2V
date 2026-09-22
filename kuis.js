import {
  db,
  setDoc,
  updateDoc,
  doc,
  arrayUnion,
  collection,
  query,
  where,
  onSnapshot,
} from "./firebase-config.js";
import { normalizeQuestion } from "./module-normalize.js";
import { waitForWriteSync } from "./sync-helpers.js";

const user = JSON.parse(sessionStorage.getItem("user") || "null");
const activeModule = JSON.parse(sessionStorage.getItem("activeModule") || "null");

if (!user || user.role !== "siswa" || !activeModule) {
  window.location.href = "siswa.html";
}

const draftKey = `quizDraft:${user.uid}:${activeModule.id}`;

let quizState = {
  currentIndex: 0,
  answers: [],
};

function saveDraft() {
  try {
    const payload = {
      moduleId: activeModule.id,
      currentIndex: quizState.currentIndex,
      answers: quizState.answers,
      updatedAt: Date.now(),
    };
    localStorage.setItem(draftKey, JSON.stringify(payload));
  } catch (err) {
    console.warn("Gagal menyimpan draft kuis:", err);
  }
}

function clearDraft() {
  localStorage.removeItem(draftKey);
}

function loadDraft() {
  try {
    const raw = localStorage.getItem(draftKey);
    if (!raw) return null;

    const draft = JSON.parse(raw);

    if (
      !draft ||
      !Array.isArray(draft.answers) ||
      draft.answers.length !== soalList.length
    ) {
      return null;
    }

    return draft;
  } catch (err) {
    console.warn("Draft tidak valid:", err);
    return null;
  }
}

function hasAnyAnswer(answers) {
  return answers.some((answer) => {
    if (answer === null || answer === undefined) return false;
    if (typeof answer === "string") return answer.trim() !== "";
    if (typeof answer === "object") return Object.keys(answer).length > 0;
    return true;
  });
}

window.goBack = function () {
  saveDraft();
  window.location.href = "siswa.html";
};

window.addEventListener("beforeunload", saveDraft);
window.addEventListener("pagehide", saveDraft);

document.getElementById("quizTitle").textContent = "📖 " + (activeModule.judul || "Soal");

const rawSoalList = activeModule.soal || [];
const soalList = rawSoalList.map((s, i) => normalizeQuestion(s, i)).filter(Boolean);

const content = document.getElementById("quizContent");

const savedProgress = JSON.parse(sessionStorage.getItem("activeProgress") || "null");
const existingProgress =
  savedProgress ||
  (user.progress || []).find((p) => p.moduleId === activeModule.id);

if (existingProgress && ["selesai", "menunggu_dinilai"].includes(existingProgress.status)) {
  showReviewMode(existingProgress);
} else {
  startQuiz();
}

function showReviewMode(progress) {
  renderReview(progress, []);

  const essayQuery = query(
    collection(db, "esai_jawaban"),
    where("uidSiswa", "==", user.uid)
  );

  onSnapshot(
    essayQuery,
    (snap) => {
      const essayAnswers = [];
      snap.forEach((d) => {
        const essay = { id: d.id, ...d.data() };
        if (essay.moduleId === activeModule.id) essayAnswers.push(essay);
      });
      renderReview(progress, essayAnswers);
    },
    (error) => {
      console.error("Failed to load review essays:", error);
    }
  );
}

function renderReview(progress, essayAnswers) {
  const totalQuestions = soalList.length;
  const autoCorrect = Number(progress.correctCount) || 0;
  const pendingCount = Number(progress.pendingCount) || 0;
  const finalScore = Number(progress.score) || 0;
  const hasPending = progress.status === "menunggu_dinilai" || pendingCount > 0;

  let detailHtml = '<div class="result-detail">';

  const savedAnswers = Array.isArray(progress.answerSnapshot) ? progress.answerSnapshot : [];

  soalList.forEach((soal, i) => {
    const savedAnswer = savedAnswers[i];
    const grade = gradeQuestion(soal, savedAnswer);
    let cls = grade.pending ? "pending" : grade.correct ? "correct" : "wrong";
    let answerText = "";
    let explanation = "";

    if (grade.type === "pg") {
      const letters = ["A", "B", "C", "D", "E"];
      const answerLabel =
        savedAnswer === null || savedAnswer === undefined
          ? "Tidak dijawab"
          : `${letters[savedAnswer] || (savedAnswer + 1)}. ${soal.opsi[savedAnswer] || ""}`;
      const correctIdx = soal.jawaban;
      answerText = `Jawaban kamu: ${escapeHtml(answerLabel)} | Jawaban benar: ${letters[correctIdx] || (correctIdx + 1)}. ${escapeHtml(soal.opsi[correctIdx] || "")}`;
      explanation = grade.correct ? "Jawaban kamu benar." : "Jawaban kamu belum tepat.";
    } else if (grade.type === "isian") {
      answerText = `Jawaban kamu: ${escapeHtml(savedAnswer || "(kosong)") } | Jawaban benar: ${escapeHtml(soal.jawaban || "")}`;
      explanation = grade.correct ? "Jawaban kamu benar." : "Periksa kembali jawaban yang benar.";
    } else if (grade.type === "isian_kompleks") {
      const essay = essayAnswers.find((e) => e.soalId === "soal_" + i);
      if (essay) {
        if (essay.status === "dinilai") {
          cls = "correct";
          answerText = `Nilai guru: ${essay.nilai} | Jawaban kamu: ${essay.jawabanSiswa || ""}`;
          explanation = essay.catatanGuru || `Dinilai oleh ${essay.dinilaiOlehNama || "Guru"}.`;
        } else {
          cls = "pending";
          answerText = `Jawaban kamu: ${essay.jawabanSiswa || ""} | Status: Menunggu dinilai guru`;
          explanation = "Guru belum memberikan nilai untuk jawaban ini.";
        }
      } else {
        cls = "pending";
        answerText = `Jawaban kamu: ${savedAnswer || "(kosong)"} | Menunggu dinilai guru`;
        explanation = "Jawaban esai kamu sedang menunggu penilaian guru.";
      }
    } else if (grade.type === "sambung") {
      const correctMap = soal.jawaban || {};
      const answerMap = savedAnswer || {};
      const correctParts = Object.keys(correctMap).map((k) => correctMap[k]).join(", ");
      const answerParts = Object.keys(answerMap).map((k) => answerMap[k]).join(", ");
      answerText = `Jawaban kamu: ${answerParts || "(kosong)"} | Jawaban benar: ${correctParts}`;
      explanation = grade.correct ? "Semua pasangan jawaban benar." : "Ada pasangan jawaban yang belum tepat.";
    }

    detailHtml += `<div class="result-item ${cls}">
      <div class="q">Soal ${i + 1}: ${escapeHtml((soal.pertanyaan || "").slice(0, 100))}${(soal.pertanyaan || "").length > 100 ? "..." : ""}</div>
      <div class="a">${escapeHtml(answerText)}</div>
      ${explanation ? `<div class="a" style="font-size:0.85rem; color:var(--text-muted); margin-top:4px;">${escapeHtml(explanation)}</div>` : ""}
    </div>`;
  });

  detailHtml += "</div>";

  content.innerHTML = `
    <div class="card result-card">
      <h2>Evaluasi Modul</h2>
      <p style="color:var(--text-muted); font-size:0.95rem;">${escapeHtml(activeModule.judul || "")}</p>
      <div class="result-score">${finalScore}</div>
      <p style="color:var(--text-muted); font-size:1rem;">Benar ${autoCorrect} dari ${totalQuestions - pendingCount} soal yang dinilai otomatis</p>
      ${hasPending ? `<p style="color:#92400e; margin-top:8px;">${pendingCount} soal menunggu dinilai guru</p>` : ""}
      <p style="margin-top:12px; color:var(--secondary-dark); font-weight:600;">Kamu sudah menyelesaikan modul ini. Berikut adalah hasil evaluasi dan pembahasan.</p>
      ${detailHtml}
      <button class="btn-primary btn-big" style="margin-top:24px;" onclick="goBack()">Kembali ke Dashboard</button>
    </div>
  `;
}

function startQuiz() {
  const savedDraft = loadDraft();

  let currentIndex = savedDraft
    ? Math.min(
        Math.max(Number(savedDraft.currentIndex) || 0, 0),
        Math.max(soalList.length - 1, 0)
      )
    : 0;

  let answers = savedDraft?.answers || new Array(soalList.length).fill(null);

  if (savedDraft && hasAnyAnswer(answers)) {
    const resume = confirm(
      "Ditemukan jawaban yang tersimpan. Lanjutkan dari pengerjaan terakhir?"
    );

    if (!resume) {
      currentIndex = 0;
      answers = new Array(soalList.length).fill(null);
      clearDraft();
    }
  }

  quizState.currentIndex = currentIndex;
  quizState.answers = answers;

  renderQuestion();

  function renderQuestion() {
    if (currentIndex >= soalList.length) {
      renderResults();
      return;
    }

    const soal = soalList[currentIndex];
    const progress = (currentIndex / Math.max(soalList.length, 1)) * 100;

    let body = "";

    if (soal.tipe === "pg") {
      const opts = soal.opsi || [];
      const letters = ["A", "B", "C", "D", "E"];
      body = `<div class="options">` +
        opts.map((opt, i) => `
          <label class="option ${answers[currentIndex] === i ? "selected" : ""}" data-idx="${i}">
            <span class="letter">${letters[i] || (i + 1)}</span>
            <span>${escapeHtml(opt)}</span>
            <input type="radio" name="opt" value="${i}" ${answers[currentIndex] === i ? "checked" : ""}>
          </label>
        `).join("") +
        `</div>`;
    } else if (soal.tipe === "isian") {
      body = `<input type="text" id="isianInput" placeholder="Tulis jawabanmu di sini" value="${answers[currentIndex] ? escapeHtml(answers[currentIndex]) : ""}">`;
    } else if (soal.tipe === "isian_kompleks") {
      body = `<textarea id="esaiInput" placeholder="Tulis jawaban panjangmu di sini...">${answers[currentIndex] ? escapeHtml(answers[currentIndex]) : ""}</textarea>`;
    } else if (soal.tipe === "sambung") {
      body = renderMatchQuestion(soal);
    }

    content.innerHTML = `
      <div class="quiz-header">
        <div class="quiz-progress"><div class="quiz-progress-bar" style="width:${progress}%"></div></div>
        <span class="quiz-counter">Soal ${currentIndex + 1} dari ${soalList.length}</span>
      </div>
      <div class="question-card">
        <div class="question-number">Soal ${currentIndex + 1}</div>
        <div class="question-text">${escapeHtml(soal.pertanyaan || "")}</div>
        ${body}
      </div>
      <div class="quiz-nav">
        ${currentIndex > 0 ? '<button class="btn-outline" onclick="prevQuestion()">Sebelumnya</button>' : '<span></span>'}
        <button class="btn-primary" onclick="nextQuestion()">${currentIndex === soalList.length - 1 ? "Selesai" : "Berikutnya"}</button>
      </div>
    `;

    if (soal.tipe === "pg") {
      document.querySelectorAll(".option").forEach((el) => {
        el.addEventListener("click", () => {
          const idx = parseInt(el.dataset.idx);
          answers[currentIndex] = idx;
          quizState.currentIndex = currentIndex;
          quizState.answers = answers;
          saveDraft();

          document.querySelectorAll(".option").forEach((o) => o.classList.remove("selected"));
          el.classList.add("selected");
        });
      });
    } else if (soal.tipe === "isian") {
      const input = document.getElementById("isianInput");
      input.addEventListener("input", () => {
        answers[currentIndex] = input.value;
        quizState.currentIndex = currentIndex;
        quizState.answers = answers;
        saveDraft();
      });
    } else if (soal.tipe === "isian_kompleks") {
      const input = document.getElementById("esaiInput");
      input.addEventListener("input", () => {
        answers[currentIndex] = input.value;
        quizState.currentIndex = currentIndex;
        quizState.answers = answers;
        saveDraft();
      });
    }
  }

  function renderMatchQuestion(soal) {
    const blanks = soal.kalimat || [];
    const bank = soal.bank || soal.pilihan_kata || [];
    const currentAns = answers[currentIndex] || {};

    let html = '<div style="margin-bottom:16px;">';
    blanks.forEach((b, i) => {
      html += `
        <div style="margin-bottom:12px; font-size:1.1rem;">
          ${escapeHtml(b)}
          <span
            class="match-blank ${currentAns[i] ? "" : "empty"}"
            data-blank="${i}"
            onclick="removeMatch(${i})"
          >
            ${currentAns[i] ? escapeHtml(currentAns[i]) : "____"}
          </span>
        </div>
      `;
    });

    html += "</div>";
    html += '<div class="match-bank">';

    bank.forEach((w) => {
      const used = Object.values(currentAns).includes(w);
      html += `
        <span
          class="match-word ${used ? "used" : ""}"
          data-word="${escapeHtml(w)}"
          onclick="selectWord('${escapeHtml(w).replace(/'/g, "\\'")}')"
        >
          ${escapeHtml(w)}
        </span>
      `;
    });

    html += "</div>";
    return html;
  }

  let selectedBlank = null;

  window.selectWord = function (word) {
    const currentAns = answers[currentIndex] || {};
    Object.keys(currentAns).forEach((k) => {
      if (currentAns[k] === word) delete currentAns[k];
    });

    if (selectedBlank !== null) {
      currentAns[selectedBlank] = word;
      answers[currentIndex] = currentAns;
      selectedBlank = null;
    } else {
      const blanks = soalList[currentIndex].kalimat || [];
      for (let i = 0; i < blanks.length; i++) {
        if (!currentAns[i]) {
          currentAns[i] = word;
          answers[currentIndex] = currentAns;
          break;
        }
      }
    }

    quizState.currentIndex = currentIndex;
    quizState.answers = answers;
    saveDraft();
    renderQuestion();
  };

  window.removeMatch = function (blankIdx) {
    const currentAns = answers[currentIndex] || {};
    delete currentAns[blankIdx];
    answers[currentIndex] = currentAns;
    selectedBlank = blankIdx;

    quizState.currentIndex = currentIndex;
    quizState.answers = answers;
    saveDraft();
    renderQuestion();
  };

  window.prevQuestion = function () {
    quizState.currentIndex = currentIndex;
    quizState.answers = answers;
    saveDraft();

    if (currentIndex > 0) {
      currentIndex--;
      renderQuestion();
    }
  };

  window.nextQuestion = function () {
    quizState.currentIndex = currentIndex;
    quizState.answers = answers;
    saveDraft();

    if (currentIndex < soalList.length - 1) {
      currentIndex++;
      renderQuestion();
    } else {
      renderResults();
    }
  };

  function normalizeAnswer(str) {
    return String(str || "").trim().toLowerCase().replace(/\s+/g, " ");
  }

  function gradeQuestion(soal, answer) {
    if (soal.tipe === "pg") {
      return { correct: answer === soal.jawaban, type: "pg", pending: false };
    }
    if (soal.tipe === "isian") {
      const correct = normalizeAnswer(soal.jawaban);
      const given = normalizeAnswer(answer);
      return { correct: given === correct && given !== "", type: "isian", pending: false };
    }
    if (soal.tipe === "isian_kompleks") {
      return { correct: null, type: "isian_kompleks", pending: true };
    }
    if (soal.tipe === "sambung") {
      const correctMap = soal.jawaban || {};
      const ansMap = answer || {};
      let allCorrect = true;
      for (let i = 0; i < (soal.kalimat || []).length; i++) {
        if (normalizeAnswer(ansMap[i]) !== normalizeAnswer(correctMap[i])) {
          allCorrect = false;
          break;
        }
      }
      return { correct: allCorrect, type: "sambung", pending: false };
    }
    return { correct: false, type: "unknown", pending: false };
  }

  async function renderResults() {
    const results = soalList.map((s, i) => ({
      soal: s,
      answer: answers[i],
      grade: gradeQuestion(s, answers[i]),
    }));

    const graded = results.filter((r) => !r.grade.pending);
    const correctCount = graded.filter((r) => r.grade.correct).length;
    const pendingCount = results.filter((r) => r.grade.pending).length;
    const score = graded.length > 0 ? Math.round((correctCount / graded.length) * 100) : 0;

    content.innerHTML = `
      <div class="card result-card">
        <h2>Menyimpan hasil...</h2>
        <p style="color:var(--text-muted);">Mohon tunggu, jangan tutup halaman ini.</p>
      </div>
    `;

    for (let i = 0; i < soalList.length; i++) {
      if (soalList[i].tipe === "isian_kompleks" && answers[i] && String(answers[i]).trim()) {
        const esaiId = "esai_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 6);
        try {
          const esaiRef = doc(db, "esai_jawaban", esaiId);
          await setDoc(esaiRef, {
            uidSiswa: user.uid,
            namaSiswa: user.namaDisplay || user.nama,
            kelas: String(user.kelas),
            moduleId: activeModule.id,
            moduleTitle: activeModule.judul,
            soalId: "soal_" + i,
            pertanyaan: soalList[i].pertanyaan,
            jawabanSiswa: answers[i],
            status: "menunggu_dinilai",
            nilai: null,
            dinilaiOleh: null,
            dinilaiOlehNama: null,
            submittedAt: Date.now(),
            reviewedAt: null,
          });
          await waitForWriteSync(esaiRef, 10000);
        } catch (err) {
          console.error("Failed to save essay answer:", err);
        }
      }
    }

    let syncConfirmed = false;
    try {
      const progressEntry = {
        moduleId: activeModule.id,
        moduleTitle: activeModule.judul,
        score: score,
        correctCount: correctCount,
        totalGraded: graded.length,
        pendingCount: pendingCount,
        totalQuestions: soalList.length,
        status: pendingCount > 0 ? "menunggu_dinilai" : "selesai",
        completedAt: Date.now(),
        answerSnapshot: answers,
      };

      const userRef = doc(db, "users", user.uid);
      await updateDoc(userRef, {
        progress: arrayUnion(progressEntry),
        seenModules: arrayUnion(activeModule.id),
      });
      await waitForWriteSync(userRef, 10000);
      syncConfirmed = true;
      clearDraft();
    } catch (err) {
      console.error("Failed to save progress:", err);
      // jangan hapus draft kalau proses simpan gagal
    }

    let detailHtml = '<div class="result-detail">';
    results.forEach((r, i) => {
      const cls = r.grade.pending ? "pending" : r.grade.correct ? "correct" : "wrong";
      let answerText = "";

      if (r.grade.type === "pg") {
        const letters = ["A", "B", "C", "D", "E"];
        answerText =
          r.answer !== null && r.answer !== undefined
            ? `Jawaban: ${letters[r.answer] || (r.answer + 1)}`
            : "Tidak dijawab";

        if (!r.grade.correct) {
          answerText += ` | Benar: ${letters[r.soal.jawaban] || (r.soal.jawaban + 1)}`;
        }
      } else if (r.grade.type === "isian") {
        answerText = `Jawaban: ${r.answer || "(kosong)"} | Benar: ${r.soal.jawaban}`;
      } else if (r.grade.type === "isian_kompleks") {
        answerText = "Menunggu dinilai guru";
      } else if (r.grade.type === "sambung") {
        const ansMap = r.answer || {};
        answerText = r.grade.correct ? "Benar" : "Ada yang salah";
        const parts = Object.keys(ansMap).map((k) => ansMap[k]).join(", ");
        answerText += parts ? ` (${parts})` : "";
      }

      detailHtml += `
        <div class="result-item ${cls}">
          <div class="q">
            Soal ${i + 1}: ${escapeHtml((r.soal.pertanyaan || "").slice(0, 80))}
            ${(r.soal.pertanyaan || "").length > 80 ? "..." : ""}
          </div>
          <div class="a">${escapeHtml(answerText)}</div>
        </div>
      `;
    });

    detailHtml += "</div>";

    content.innerHTML = `
      <div class="card result-card">
        <h2>Hasil Pengerjaan</h2>
        ${!syncConfirmed ? `
          <div style="background:var(--accent-light); color:#92400e; padding:12px 16px; border-radius:var(--radius); margin-bottom:16px; text-align:left; font-size:0.9rem;">
            ⚠️ Koneksi lemah/terputus — hasil ini <strong>belum terkonfirmasi tersimpan ke server</strong>.
            Jangan hapus data browser atau uninstall aplikasi di perangkat ini sampai kamu online lagi
            dan membuka ulang halaman ini untuk memastikan hasilnya sudah tersimpan.
          </div>
        ` : ""}
        <div class="result-score">${score}</div>
        <p style="color:var(--text-muted); font-size:1rem;">Benar ${correctCount} dari ${graded.length} soal yang dinilai otomatis</p>
        ${pendingCount > 0 ? `<p style="color:#92400e; margin-top:8px;">${pendingCount} soal menunggu dinilai guru</p>` : ""}
        ${detailHtml}
        <button class="btn-primary btn-big" style="margin-top:24px;" onclick="goBack()">Kembali ke Dashboard</button>
      </div>
    `;
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = String(str);
  return div.innerHTML;
}
