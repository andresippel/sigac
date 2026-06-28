// ══════════════════════════════════════════════════
// NAVEGAÇÃO
// ══════════════════════════════════════════════════

function irHome() {
  // Reexibe a tela inicial e oculta os módulos
  document.getElementById("screenHome").style.display = "";
  document.getElementById("screenAproveitamento").classList.remove("active");
  document.getElementById("screenNovoPPC").classList.remove("active");
  document.getElementById("headerBadges").style.display = "none";
  document.getElementById("headerHome").style.display = "";
}

function abrirModulo(modulo) {
  // Esconde a tela inicial completamente
  document.getElementById("screenHome").style.display = "none";
  document.getElementById("headerHome").style.display = "none";
  document.getElementById("headerBadges").style.display = "flex";

  document.getElementById("screenAproveitamento").classList.remove("active");
  document.getElementById("screenNovoPPC").classList.remove("active");

  if (modulo === "aproveitamento") {
    document.getElementById("screenAproveitamento").classList.add("active");
    document.getElementById("badgeGrade1").style.display = "flex";
    document.getElementById("badgeGrade2").style.display = "none";
    document.getElementById("badgeEq").style.display = "none";
  } else {
    document.getElementById("screenNovoPPC").classList.add("active");
    document.getElementById("badgeGrade1").style.display = "none";
    document.getElementById("badgeGrade2").style.display = "flex";
    document.getElementById("badgeEq").style.display = "flex";
  }
}

// Teclado nas home-cards
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".home-card").forEach(c => {
    c.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); c.click(); }
    });
  });
});

// ══════════════════════════════════════════════════
// UTILITÁRIOS COMPARTILHADOS
// ══════════════════════════════════════════════════

function norm(s) {
  return s
    ? String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim()
    : "";
}

function escapeHTML(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

let _toastTimer;
function showToast(msg, tipo = "") {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.className = "toast" + (tipo ? " toast-" + tipo : "");
  el.hidden = false;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.hidden = true, 4500);
}

function showFeedback(id, msg, tipo) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = msg;
  el.className = "feedback-bar " + tipo;
  el.hidden = false;
}

function configurarDD(idZona, idInput, onFiles) {
  const zona  = document.getElementById(idZona);
  const input = document.getElementById(idInput);
  if (!zona || !input) return;

  zona.addEventListener("dragover",  e => { e.preventDefault(); zona.classList.add("dragover"); });
  ["dragleave", "dragend"].forEach(t => zona.addEventListener(t, () => zona.classList.remove("dragover")));
  zona.addEventListener("drop", e => {
    e.preventDefault();
    zona.classList.remove("dragover");
    if (e.dataTransfer.files.length) onFiles(e.dataTransfer.files);
  });
  input.addEventListener("change", e => {
    if (e.target.files.length) onFiles(e.target.files);
    e.target.value = "";
  });
  zona.addEventListener("keydown", e => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); }
  });
}

function lerJSON(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload  = e => { try { res(JSON.parse(e.target.result)); } catch (err) { rej(err); } };
    r.onerror = rej;
    r.readAsText(file);
  });
}

function gerarWordBlob(html) {
  return new Blob(
    ["\ufeff", `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>Plano de Estudos</title></head><body>${html}</body></html>`],
    { type: "application/msword" }
  );
}

function downloadBlob(blob, nome) {
  const url  = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nome;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ══════════════════════════════════════════════════
// MÓDULO 1 — APROVEITAMENTO DE ESTUDOS
// ══════════════════════════════════════════════════

const m1 = {
  dadosDoCurso:              null,
  disciplinasAprovadasExcel: [],
  disciplinasAprovadas:      [],
  disciplinasMatriculadas:   [],
  chOptCursada:              0,
  chNfcCursada:              0,
  chTotalCursada:            0,
  chAproveitamentosExcel:    0,
  chAproveitadaManual:       0,
  ultimoEnquadramento:       "",
  nomeArquivoOriginal:       "",
};

function m1SetStep(n) {
  [1, 2, 3].forEach(i => {
    const el = document.getElementById("m1step" + i);
    if (!el) return;
    el.classList.remove("active", "done");
    if (i < n) el.classList.add("done");
    if (i === n) el.classList.add("active");
  });
}

function m1ValidarGrade(g) {
  if (!g?.curso || !Array.isArray(g.semestres) || !g.semestres.length)
    throw new Error('"curso" ou "semestres" ausentes.');
}

function m1AtualizarInterface() {
  if (m1.dadosDoCurso) {
    document.getElementById("badgeGrade1").className = "badge badge-ok";
    document.getElementById("badgeGrade1Nome").textContent = m1.dadosDoCurso.curso;
  }
  m1RenderizarAproveitamento();
}

function m1RenderizarAproveitamento() {
  const container = document.getElementById("m1ListaAproveitamento");
  if (!container || !m1.dadosDoCurso) return;

  let html = "", alguma = false;
  m1.dadosDoCurso.semestres.forEach(sem => {
    const pend = sem.disciplinas.filter(d =>
      !m1.disciplinasAprovadasExcel.includes(norm(d.nome))
    );
    if (!pend.length) return;
    alguma = true;
    html += `<div class="semester-group">${sem.numero}º Semestre</div>`;
    pend.forEach(d => {
      const id = `m1chk_${norm(d.nome).replace(/[^A-Z0-9]/g, "_")}`;
      html += `<label class="checkbox-item" for="${id}">
        <input type="checkbox" id="${id}" class="m1chk-aprov" value="${d.nome}" data-ch="${d.ch}">
        ${d.nome} <span style="color:var(--gray-500);margin-left:4px">(${d.ch}h)</span>
      </label>`;
    });
  });
  container.innerHTML = alguma
    ? html
    : `<p class="empty-state">Todas as disciplinas já constam no histórico.</p>`;
}

function m1ProcessarHistorico(files) {
  const file = files[0];
  if (!file) return;

  m1.nomeArquivoOriginal = file.name.replace(/\.[^/.]+$/, "").trim();
  const nomeLimpo = m1.nomeArquivoOriginal
    .replace(/^(hist[oó]rico\s*escolar|hist[oó]rico)[_\-\s]*/i, "")
    .trim();

  const reader = new FileReader();
  reader.onload = e => {
    try {
      const wb = XLSX.read(new Uint8Array(e.target.result), { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json(ws, { header: 1 });

      const nomePlan = raw[0]?.[0] ? String(raw[0][0]).trim() : "";
      const rgaPlan  = raw[1]?.[0] ? String(raw[1][0]).trim() : "";

      const elInfo = document.getElementById("m1AlunoInfo");
      if (elInfo) {
        if (nomeLimpo.length > 5 && !/^pasta\s*\d*$/i.test(nomeLimpo))
          elInfo.value = nomeLimpo;
        else if (rgaPlan && nomePlan) elInfo.value = `${rgaPlan} - ${nomePlan}`;
        else if (nomePlan) elInfo.value = nomePlan;
        else if (rgaPlan)  elInfo.value = rgaPlan;
      }

      const linhas = XLSX.utils.sheet_to_json(ws, { range: 2 });
      let chOBR = 0, chOPT = 0, chNFC = 0, chAprov = 0;
      m1.disciplinasAprovadasExcel = [];
      m1.disciplinasMatriculadas   = [];

      linhas.forEach(l => {
        const nd = l["Nome da Disciplina/CCND"], tipo = l["Tipo"],
              sit = l["Situação"], chStr = l["C.H."];
        if (!nd || !tipo || !sit || chStr === undefined) return;
        const ch = parseFloat(chStr);
        if (isNaN(ch)) return;
        const tN = norm(tipo), sN = norm(sit);

        if (sN === "MATRICULADO" || sN.startsWith("MAT"))
          m1.disciplinasMatriculadas.push({ nome: String(nd).trim(), ch });

        const eAprov = sN === "APROVADO" || sN.startsWith("APR") ||
                       sN.includes("DISPENSA") || sN.includes("EQUIVALENCIA");
        if (!eAprov) return;

        if (tN === "OBR" || tN.startsWith("OBR")) {
          chOBR += ch;
          m1.disciplinasAprovadasExcel.push(norm(nd));
          if (sN.includes("ANALISE DE CURRICULO")) chAprov += ch;
        } else if (tN === "OPT" || tN.startsWith("OPT")) {
          chOPT += ch;
        } else if (tN === "NFC" || tN.startsWith("NFC")) {
          chNFC += ch;
        }
      });

      m1.chOptCursada           = chOPT;
      m1.chNfcCursada           = chNFC;
      m1.chAproveitamentosExcel = chAprov;

      document.getElementById("m1CargaHoraria").value = chOBR;
      m1RenderizarAproveitamento();
      m1Calcular();
      m1SetStep(2);
      showFeedback(
        "m1FeedbackHistorico",
        `✅ Obrigatórias: ${chOBR}h | Optativas: ${chOPT}h | NFC: ${chNFC}h | Matrículas: ${m1.disciplinasMatriculadas.length}`,
        "success"
      );
    } catch (err) {
      showFeedback("m1FeedbackHistorico", "❌ Erro: " + err.message, "error");
    }
  };
  reader.readAsArrayBuffer(file);
}

function m1Calcular() {
  if (!m1.dadosDoCurso) return;

  const chBase = parseInt(document.getElementById("m1CargaHoraria").value) || 0;
  let chChk = 0;
  const aprovChk = [];
  document.querySelectorAll(".m1chk-aprov:checked").forEach(c => {
    chChk += parseInt(c.dataset.ch) || 0;
    aprovChk.push(norm(c.value));
  });

  m1.chAproveitadaManual  = chChk;
  m1.disciplinasAprovadas = [...m1.disciplinasAprovadasExcel, ...aprovChk];
  const chEst = chBase + chChk;
  m1.chTotalCursada = chEst + m1.chOptCursada + m1.chNfcCursada;

  const sems = m1.dadosDoCurso.semestres;
  let acum = 0, enq = null;
  for (let i = 0; i < sems.length; i++) {
    acum += sems[i].disciplinas.reduce((s, d) => s + d.ch, 0);
    if (acum > chEst) {
      const diff = acum - chEst;
      enq = diff <= 136
        ? `${Math.min(i + 2, sems.length)}º semestre`
        : `${i + 1}º semestre`;
      break;
    }
  }
  if (!enq) enq = "Último semestre / Formando";
  m1.ultimoEnquadramento = enq;

  document.getElementById("m1ResultadoSemestre").textContent = enq;
  document.getElementById("m1ResultadoCH").textContent = `CH analisada: ${chEst}h`;
  document.getElementById("m1ResultadoBlock").hidden = false;
  document.getElementById("m1SecPlano").hidden = false;
  m1SetStep(3);
  m1AtualizarPreview();
}

function m1AtualizarPreview() {
  const box = document.getElementById("m1PreviewPlano");
  if (box) box.innerHTML = m1GerarHTML();
}

function m1GerarHTML() {
  const infoStr = document.getElementById("m1AlunoInfo")?.value.trim() || "";
  let nome = "Não informado", rga = "Não informado";
  if (infoStr) {
    const s = infoStr.indexOf(" - ");
    if (s !== -1) { rga = infoStr.substring(0, s).trim(); nome = infoStr.substring(s + 3).trim(); }
    else nome = infoStr;
  }

  // Higienizando as variáveis contra injeção de HTML
  nome = escapeHTML(nome);
  rga = escapeHTML(rga);

  const enq    = m1.ultimoEnquadramento || "Não calculado";
  const semStr = document.getElementById("m1Semestre")?.value.trim() || "2026/1";
  const p = semStr.split(/[\/.\-]/);
  let ano = parseInt(p[0]) || new Date().getFullYear(), sem = parseInt(p[1]) || 1;
  function prox() { sem++; if (sem > 2) { sem = 1; ano++; } return `${ano}/${sem}`; }

  // Tabela 1 — semestre atual
  let t1 = `<table style="border-collapse:collapse;margin:0 auto;width:85%;" border="1" cellpadding="5">
  <thead><tr>
    <th style="background:#ccc;"><p class="Tabela_Texto_Centralizado">Disciplinas a serem cursadas no semestre atual</p></th>
    <th style="background:#ccc;"><p class="Tabela_Texto_Centralizado">Indicação da turma prática</p></th>
  </tr></thead><tbody>`;
  if (m1.disciplinasMatriculadas.length)
    m1.disciplinasMatriculadas.forEach(d => { t1 += `<tr><td><p class="Tabela_Texto_Alinhado_Esquerda">${d.nome}</p></td><td>&nbsp;</td></tr>`; });
  else for (let i = 0; i < 4; i++) t1 += `<tr><td>&nbsp;</td><td>&nbsp;</td></tr>`;
  t1 += `</tbody></table>`;

  // Tabela 2 — semestres futuros
  let t2 = `<table style="border-collapse:collapse;margin:0 auto;width:85%;" border="1" cellpadding="5">
  <thead><tr>
    <th style="background:#ccc;width:60%;"><p class="Tabela_Texto_Centralizado">Disciplinas a serem cursadas em semestres posteriores</p></th>
    <th style="background:#ccc;width:20%;"><p class="Tabela_Texto_Centralizado">Indicação do Semestre</p></th>
    <th style="background:#ccc;width:20%;"><p class="Tabela_Texto_Centralizado">Carga horária</p></th>
  </tr></thead><tbody>`;
  let grand = 0;
  m1.dadosDoCurso.semestres.forEach(s => {
    const pend = s.disciplinas.filter(d => !m1.disciplinasAprovadas.includes(norm(d.nome)));
    if (!pend.length) return;
    const per = prox();
    t2 += `<tr><td style="width:60%;"><p class="Tabela_Texto_Alinhado_Esquerda"><strong>${s.numero}° semestre</strong></p></td><td>&nbsp;</td><td>&nbsp;</td></tr>`;
    let tot = 0;
    pend.forEach(d => {
      tot += d.ch; grand += d.ch;
      t2 += `<tr><td><p class="Tabela_Texto_Alinhado_Esquerda">${d.nome}</p></td><td><p class="Tabela_Texto_Centralizado">${per}</p></td><td><p class="Tabela_Texto_Centralizado">${d.ch}</p></td></tr>`;
    });
    t2 += `<tr><td><strong>TOTAL</strong></td><td>&nbsp;</td><td><p class="Tabela_Texto_Centralizado"><strong>${tot}</strong></p></td></tr><tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>`;
  });
  t2 += `<tr><td>&nbsp;</td><td><p class="Tabela_Texto_Centralizado"><strong>TOTAL DO PLANO</strong></p></td><td><p class="Tabela_Texto_Centralizado"><strong>${grand}</strong></p></td></tr></tbody></table>`;

  const reqOpt = m1.dadosDoCurso.ch_optativas_exigidas ?? 60;
  const reqExt = m1.dadosDoCurso.ch_extensao_exigida   ?? 409;
  const reqTot = m1.dadosDoCurso.ch_total_curso         ?? 4090;
  const optAC  = Math.max(0, reqOpt - m1.chOptCursada);
  const aCursar = Math.max(0, reqTot - m1.chTotalCursada);
  const totAprov = (m1.chAproveitamentosExcel || 0) + (m1.chAproveitadaManual || 0);

  return `
<p class="Item_Nivel1" style="font-weight:bold;">Identificação do Acadêmico:</p>
<p class="Texto_Justificado">Nome: ${nome}</p>
<p class="Texto_Justificado">RGA na UFMS: ${rga}</p>
<p class="Texto_Justificado">Enquadramento: ${enq}</p>
<p>&nbsp;</p>
<p class="Item_Nivel1" style="font-weight:bold;">1. Plano de estudos — Semestre atual:</p>
${t1}
<p>&nbsp;</p>
<p class="Item_Nivel1" style="font-weight:bold;">2. Plano de estudos — Semestres futuros:</p>
${t2}
<p>&nbsp;</p>
<p class="Item_Nivel1" style="font-weight:bold;">3. CARGA HORÁRIA DE DISCIPLINAS OPTATIVAS NECESSÁRIAS:</p>
<p class="Texto_Justificado">Cursadas: ${m1.chOptCursada}h | A cursar: ${optAC}h</p>
<p>&nbsp;</p>
<p class="Item_Nivel1" style="font-weight:bold;">4. CARGA HORÁRIA EM ATIVIDADES DE EXTENSÃO NECESSÁRIAS:</p>
<p class="Texto_Justificado">Cursadas: 0h | A cursar: ${reqExt}h</p>
<p>&nbsp;</p>
<p class="Item_Nivel1" style="font-weight:bold;">5. INTEGRALIZAÇÃO CURRICULAR:</p>
<p class="Texto_Justificado">Aproveitadas/dispensadas: ${totAprov}h | A cursar: ${aCursar}h | Total do plano: ${grand}h</p>
<p>&nbsp;</p><p>&nbsp;</p><p>&nbsp;</p>`;
}

// ══════════════════════════════════════════════════
// MÓDULO 2 — NOVO PPC / LOTE
// ══════════════════════════════════════════════════

const m2 = {
  gradeNova:    null,
  equivalencias: null,
  arquivos:     [],
  selecionado:  null,
};

function m2ValidarGrade(g) {
  if (!g?.curso || !Array.isArray(g.semestres) || !g.semestres.length)
    throw new Error('"curso" ou "semestres" ausentes.');
}
function m2ValidarEq(eq) {
  if (!eq || !Array.isArray(eq.equivalencias))
    throw new Error('"equivalencias" ausente.');
}
function m2MapaEq(eq) {
  const mapa = new Map();
  eq.equivalencias.forEach(e => {
    if (!e.antiga) return;
    const k  = norm(e.antiga);
    const ns = (e.novas || []).map(n => norm(n));
    if (mapa.has(k)) { const ex = mapa.get(k); ns.forEach(n => { if (!ex.includes(n)) ex.push(n); }); }
    else mapa.set(k, ns);
  });
  return mapa;
}

function m2VerificarConfig() {
  if (m2.gradeNova && m2.equivalencias) {
    showFeedback("m2FeedbackConfig", "✅ Configuração completa. Pode processar os históricos.", "success");
    document.getElementById("m2BtnProcessar").disabled = false;
  }
}

async function m2CarregarGrade(files) {
  try {
    const g = await lerJSON(files[0]);
    m2ValidarGrade(g);
    m2.gradeNova = g;
    localStorage.setItem("gradeNova_v1", JSON.stringify(g));
    document.getElementById("badgeGrade2").className = "badge badge-ok";
    document.getElementById("badgeGrade2Nome").textContent = g.curso;
    document.getElementById("m2DropGrade").classList.add("loaded");
    document.getElementById("m2DropGradeLabel").textContent = "✓ " + g.curso;
    m2VerificarConfig();
    showToast("Grade nova: " + g.curso, "ok");
  } catch (err) { showToast("Erro na grade: " + err.message, "err"); }
}

async function m2CarregarEq(files) {
  try {
    const eq = await lerJSON(files[0]);
    m2ValidarEq(eq);
    m2.equivalencias = m2MapaEq(eq);
    localStorage.setItem("equivalencias_v1", JSON.stringify(eq));
    document.getElementById("badgeEq").className = "badge badge-ok";
    document.getElementById("badgeEqNome").textContent = eq.equivalencias.length + " regras";
    document.getElementById("m2DropEq").classList.add("loaded");
    document.getElementById("m2DropEqLabel").textContent = "✓ " + eq.equivalencias.length + " equivalências";
    m2VerificarConfig();
    showToast(eq.equivalencias.length + " equivalências carregadas", "ok");
  } catch (err) { showToast("Erro nas equivalências: " + err.message, "err"); }
}

function m2AdicionarArquivos(files) {
  Array.from(files).forEach(f => {
    if (!m2.arquivos.some(a => a.file.name === f.name))
      m2.arquivos.push({ file: f, status: "pending", resultado: null, nomeDownload: f.name.replace(/\.[^/.]+$/, "") });
  });
  m2RenderizarLista();
  if (m2.arquivos.length && m2.gradeNova && m2.equivalencias)
    document.getElementById("m2BtnProcessar").disabled = false;
}

function m2RenderizarLista() {
  const c = document.getElementById("m2FileList");
  if (!m2.arquivos.length) { c.style.display = "none"; return; }
  c.style.display = "flex";
  c.innerHTML = m2.arquivos.map((a, i) => {
    const cls = a.status === "ok" ? "status-ok" : a.status === "err" ? "status-err" : "status-pending";
    const txt = a.status === "ok" ? "✓ Pronto"   : a.status === "err" ? "✗ Erro"   : "Aguardando";
    const clk = a.status === "ok" ? `m2Selecionar(${i})` : "";
    return `<div class="file-item" onclick="${clk}" title="${a.status === "ok" ? "Ver prévia" : ""}">
      <span>📄</span>
      <span class="file-name">${a.file.name}</span>
      <span class="file-status ${cls}">${txt}</span>
    </div>`;
  }).join("");
}

function m2ProcessarExcel(file) {
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target.result), { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json(ws, { header: 1 });
        const nomePlan = raw[0]?.[0] ? String(raw[0][0]).trim() : "";
        const rgaPlan  = raw[1]?.[0] ? String(raw[1][0]).trim() : "";

        const nomeArq  = file.name.replace(/\.[^/.]+$/, "").trim();
        const nomeLimpo = nomeArq.replace(/^(hist[oó]rico\s*escolar|hist[oó]rico)[_\-\s]*/i, "").trim();
        let nome = "Não informado", rga = "Não informado";
        if (nomeLimpo.length > 5 && !/^pasta\s*\d*$/i.test(nomeLimpo)) {
          const s = nomeLimpo.indexOf(" - ");
          if (s !== -1) { rga = nomeLimpo.substring(0, s).trim(); nome = nomeLimpo.substring(s + 3).trim(); }
          else nome = nomeLimpo;
        } else if (rgaPlan && nomePlan) { rga = rgaPlan; nome = nomePlan; }
        else if (nomePlan) nome = nomePlan;

        const linhas = XLSX.utils.sheet_to_json(ws, { range: 2 });
        let chOPT = 0, chNFC = 0;
        const cursadas = new Set(), matric = [];

        linhas.forEach(l => {
          const nd = l["Nome da Disciplina/CCND"], tipo = l["Tipo"],
                sit = l["Situação"], chStr = l["C.H."];
          if (!nd || !tipo || !sit || chStr === undefined) return;
          const ch = parseFloat(chStr);
          if (isNaN(ch)) return;
          const tN = norm(tipo), sN = norm(sit);

          if (sN === "MATRICULADO" || sN.startsWith("MAT"))
            matric.push({ nome: String(nd).trim(), ch });

          const eA = sN === "APROVADO" || sN.startsWith("APR") ||
                     sN.includes("DISPENSA") || sN.includes("EQUIVALENCIA");
          if (!eA) return;
          if (tN === "OBR" || tN.startsWith("OBR")) cursadas.add(norm(nd));
          else if (tN === "OPT" || tN.startsWith("OPT")) chOPT += ch;
          else if (tN === "NFC" || tN.startsWith("NFC")) chNFC += ch;
        });

        // Equivalências → disciplinas novas cobertas
        const cobertas = new Set();
        cursadas.forEach(antiga => {
          const eq = m2.equivalencias.get(antiga);
          if (eq) eq.forEach(n => cobertas.add(n));
        });

        // CH coberta na grade nova
        let chAcum = 0;
        m2.gradeNova.semestres.forEach(s =>
          s.disciplinas.forEach(d => { if (cobertas.has(norm(d.nome))) chAcum += d.ch; })
        );

        // Enquadramento IN 40/2019 sobre a grade nova
        let acum2 = 0, enq = null;
        for (let i = 0; i < m2.gradeNova.semestres.length; i++) {
          acum2 += m2.gradeNova.semestres[i].disciplinas.reduce((s, d) => s + d.ch, 0);
          if (acum2 > chAcum) {
            const diff = acum2 - chAcum;
            enq = diff <= 136
              ? `${Math.min(i + 2, m2.gradeNova.semestres.length)}º semestre`
              : `${i + 1}º semestre`;
            break;
          }
        }
        if (!enq) enq = "Último semestre / Formando";

        res({ nome, rga, nomeArquivo: nomeArq, matriculadas: matric, cobertas, enquadramento: enq, chAnalisada: chAcum, chOPT, chNFC });
      } catch (err) { rej(err); }
    };
    reader.onerror = rej;
    reader.readAsArrayBuffer(file);
  });
}

function m2GerarHTML(r, semestreBase) {
  const { enquadramento, matriculadas, cobertas, chAnalisada, chOPT, chNFC } = r;
  
  // Higienizando os dados que vieram do processamento da planilha
  const nome = escapeHTML(r.nome);
  const rga = escapeHTML(r.rga);
  
  const p = semestreBase.split(/[\/.\-]/);
  let ano = parseInt(p[0]) || new Date().getFullYear(), sem = parseInt(p[1]) || 1;
  function prox() { sem++; if (sem > 2) { sem = 1; ano++; } return `${ano}/${sem}`; }

  let t1 = `<table style="border-collapse:collapse;margin:0 auto;width:85%;" border="1" cellpadding="5">
  <thead><tr>
    <th style="background:#ccc;"><p class="Tabela_Texto_Centralizado">Disciplinas a serem cursadas no semestre atual</p></th>
    <th style="background:#ccc;"><p class="Tabela_Texto_Centralizado">Indicação da turma prática</p></th>
  </tr></thead><tbody>`;
  if (matriculadas.length)
    matriculadas.forEach(d => { t1 += `<tr><td><p class="Tabela_Texto_Alinhado_Esquerda">${d.nome}</p></td><td>&nbsp;</td></tr>`; });
  else for (let i = 0; i < 4; i++) t1 += `<tr><td>&nbsp;</td><td>&nbsp;</td></tr>`;
  t1 += `</tbody></table>`;

  let t2 = `<table style="border-collapse:collapse;margin:0 auto;width:85%;" border="1" cellpadding="5">
  <thead><tr>
    <th style="background:#ccc;width:60%;"><p class="Tabela_Texto_Centralizado">Disciplinas a serem cursadas em semestres posteriores</p></th>
    <th style="background:#ccc;width:20%;"><p class="Tabela_Texto_Centralizado">Indicação do Semestre</p></th>
    <th style="background:#ccc;width:20%;"><p class="Tabela_Texto_Centralizado">Carga horária</p></th>
  </tr></thead><tbody>`;
  let grand = 0;
  m2.gradeNova.semestres.forEach(s => {
    const pend = s.disciplinas.filter(d => !cobertas.has(norm(d.nome)));
    if (!pend.length) return;
    const per = prox();
    t2 += `<tr><td style="width:60%;"><p class="Tabela_Texto_Alinhado_Esquerda"><strong>${s.numero}° semestre</strong></p></td><td>&nbsp;</td><td>&nbsp;</td></tr>`;
    let tot = 0;
    pend.forEach(d => {
      tot += d.ch; grand += d.ch;
      t2 += `<tr><td><p class="Tabela_Texto_Alinhado_Esquerda">${d.nome}</p></td><td><p class="Tabela_Texto_Centralizado">${per}</p></td><td><p class="Tabela_Texto_Centralizado">${d.ch}</p></td></tr>`;
    });
    t2 += `<tr><td><strong>TOTAL</strong></td><td>&nbsp;</td><td><p class="Tabela_Texto_Centralizado"><strong>${tot}</strong></p></td></tr><tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>`;
  });
  t2 += `<tr><td>&nbsp;</td><td><p class="Tabela_Texto_Centralizado"><strong>TOTAL DO PLANO</strong></p></td><td><p class="Tabela_Texto_Centralizado"><strong>${grand}</strong></p></td></tr></tbody></table>`;

  const g      = m2.gradeNova;
  const reqOpt = g.ch_optativas_exigidas ?? 90;
  const reqExt = g.ch_extensao_exigida   ?? 435;
  const reqTot = g.ch_total_curso        ?? 4045;
  const optAC  = Math.max(0, reqOpt - chOPT);
  const aCursar = Math.max(0, reqTot - (chAnalisada + chOPT + chNFC));

  return `
<p class="Item_Nivel1" style="font-weight:bold;">Identificação do Acadêmico:</p>
<p class="Texto_Justificado">Nome: ${nome}</p>
<p class="Texto_Justificado">RGA na UFMS: ${rga}</p>
<p class="Texto_Justificado">Enquadramento (Novo PPC): ${enquadramento}</p>
<p>&nbsp;</p>
<p class="Item_Nivel1" style="font-weight:bold;">1. Plano de estudos — Semestre atual:</p>
${t1}
<p>&nbsp;</p>
<p class="Item_Nivel1" style="font-weight:bold;">2. Plano de estudos — Semestres futuros (Novo PPC):</p>
${t2}
<p>&nbsp;</p>
<p class="Item_Nivel1" style="font-weight:bold;">3. CARGA HORÁRIA DE DISCIPLINAS OPTATIVAS NECESSÁRIAS:</p>
<p class="Texto_Justificado">Cursadas: ${chOPT}h | A cursar: ${optAC}h</p>
<p>&nbsp;</p>
<p class="Item_Nivel1" style="font-weight:bold;">4. CARGA HORÁRIA EM ATIVIDADES DE EXTENSÃO NECESSÁRIAS:</p>
<p class="Texto_Justificado">Cursadas: 0h | A cursar: ${reqExt}h</p>
<p>&nbsp;</p>
<p class="Item_Nivel1" style="font-weight:bold;">5. INTEGRALIZAÇÃO CURRICULAR:</p>
<p class="Texto_Justificado">Total a cursar: ${aCursar}h | Total do plano de estudos: ${grand}h</p>
<p>&nbsp;</p><p>&nbsp;</p><p>&nbsp;</p>`;
}

async function m2ExecutarLote() {
  if (!m2.gradeNova || !m2.equivalencias) { showToast("Configure grade e equivalências primeiro.", "err"); return; }
  const btn = document.getElementById("m2BtnProcessar");
  const pb  = document.getElementById("m2ProgressBar");
  btn.disabled = true;
  document.getElementById("m2ProgressWrap").style.display = "block";
  const semBase = document.getElementById("m2Semestre").value.trim() || "2026/1";
  let ok = 0, err = 0;

  for (let i = 0; i < m2.arquivos.length; i++) {
    const item = m2.arquivos[i];
    try {
      const r = await m2ProcessarExcel(item.file);
      r.htmlPlano    = m2GerarHTML(r, semBase);
      item.resultado = r;
      item.status    = "ok";
      ok++;
    } catch (e) { item.status = "err"; err++; }
    pb.style.width = ((i + 1) / m2.arquivos.length * 100) + "%";
    m2RenderizarLista();
    
    // Pequeno respiro artificial de 30ms para o navegador atualizar visualmente a barra
    await new Promise(resolve => setTimeout(resolve, 30));
  }

  btn.disabled = false;
  if (ok > 0) document.getElementById("m2BtnZip").disabled = false;
  showFeedback(
    "m2FeedbackLote",
    `✅ ${ok} plano(s) gerado(s)${err > 0 ? ` · ⚠️ ${err} com erro` : ""}.${ok > 0 ? " Clique em um nome para prévia." : ""}`,
    ok > 0 ? "success" : "error"
  );
  showToast(`${ok} plano(s) prontos!`, "ok");
}

async function m2BaixarZip() {
  const zip = new JSZip();
  m2.arquivos.filter(a => a.status === "ok").forEach(a => {
    zip.file(
      a.nomeDownload + ".doc",
      "\ufeff" + `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'></head><body>${a.resultado.htmlPlano}</body></html>`
    );
  });
  const blob = await zip.generateAsync({ type: "blob" });
  downloadBlob(blob, "Planos_NovoPPC.zip");
  showToast("ZIP baixado!", "ok");
}

function m2Selecionar(i) {
  const item = m2.arquivos[i];
  if (!item || item.status !== "ok") return;
  m2.selecionado = i;
  const r = item.resultado;
  document.getElementById("m2ResultadoSemestre").textContent = r.enquadramento;
  document.getElementById("m2ResultadoCH").textContent = `CH analisada: ${r.chAnalisada}h`;
  document.getElementById("m2PreviewBox").innerHTML = r.htmlPlano;
  document.getElementById("m2SecIndividual").style.display = "block";
  document.getElementById("m2SecVazio").style.display = "none";
  document.getElementById("m2SecIndividual").scrollIntoView({ behavior: "smooth", block: "start" });
}

// ══════════════════════════════════════════════════
// PERSISTÊNCIA — carrega JSONs salvos ao iniciar
// ══════════════════════════════════════════════════

function carregarPersistidos() {
  // Módulo 1
  try {
    const s = localStorage.getItem("gradeCurso_v4");
    if (s) { m1.dadosDoCurso = JSON.parse(s); m1AtualizarInterface(); }
  } catch (_) { localStorage.removeItem("gradeCurso_v4"); }

  if (!m1.dadosDoCurso) {
    fetch("dados_curso.json")
      .then(r => r.json())
      .then(g => { m1.dadosDoCurso = g; localStorage.setItem("gradeCurso_v4", JSON.stringify(g)); m1AtualizarInterface(); })
      .catch(() => {});
  }

  // Módulo 2 — grade nova
  try {
    const s = localStorage.getItem("gradeNova_v1");
    if (s) {
      const g = JSON.parse(s); m2ValidarGrade(g); m2.gradeNova = g;
      document.getElementById("badgeGrade2").className = "badge badge-ok";
      document.getElementById("badgeGrade2Nome").textContent = g.curso;
      document.getElementById("m2DropGrade").classList.add("loaded");
      document.getElementById("m2DropGradeLabel").textContent = "✓ " + g.curso;
    }
  } catch (_) { localStorage.removeItem("gradeNova_v1"); }

  if (!m2.gradeNova) {
    fetch("grade_nova.json")
      .then(r => r.json())
      .then(g => { m2ValidarGrade(g); m2.gradeNova = g; localStorage.setItem("gradeNova_v1", JSON.stringify(g)); document.getElementById("badgeGrade2").className = "badge badge-ok"; document.getElementById("badgeGrade2Nome").textContent = g.curso; document.getElementById("m2DropGrade").classList.add("loaded"); document.getElementById("m2DropGradeLabel").textContent = "✓ " + g.curso; m2VerificarConfig(); })
      .catch(() => {});
  }

  // Módulo 2 — equivalências
  try {
    const s = localStorage.getItem("equivalencias_v1");
    if (s) {
      const eq = JSON.parse(s); m2ValidarEq(eq); m2.equivalencias = m2MapaEq(eq);
      document.getElementById("badgeEq").className = "badge badge-ok";
      document.getElementById("badgeEqNome").textContent = eq.equivalencias.length + " regras";
      document.getElementById("m2DropEq").classList.add("loaded");
      document.getElementById("m2DropEqLabel").textContent = "✓ " + eq.equivalencias.length + " equivalências";
    }
  } catch (_) { localStorage.removeItem("equivalencias_v1"); }

  if (!m2.equivalencias) {
    fetch("equivalencias.json")
      .then(r => r.json())
      .then(eq => { m2ValidarEq(eq); m2.equivalencias = m2MapaEq(eq); localStorage.setItem("equivalencias_v1", JSON.stringify(eq)); document.getElementById("badgeEq").className = "badge badge-ok"; document.getElementById("badgeEqNome").textContent = eq.equivalencias.length + " regras"; document.getElementById("m2DropEq").classList.add("loaded"); document.getElementById("m2DropEqLabel").textContent = "✓ " + eq.equivalencias.length + " equivalências"; m2VerificarConfig(); })
      .catch(() => {});
  }

  m2VerificarConfig();
}

// ══════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════

document.addEventListener("DOMContentLoaded", () => {
  carregarPersistidos();

  // ── M1 eventos ──
  configurarDD("m1DropHistorico", "m1InputHistorico", m1ProcessarHistorico);
  configurarDD("m1DropImportar",  "m1InputImportar",  async files => {
    try {
      const g = await lerJSON(files[0]);
      m1ValidarGrade(g);
      m1.dadosDoCurso = g;
      localStorage.setItem("gradeCurso_v4", JSON.stringify(g));
      m1AtualizarInterface();
      showFeedback("m1FeedbackGrade", `✅ Grade "${g.curso}" importada.`, "success");
      showToast("Grade importada: " + g.curso, "ok");
    } catch (err) { showFeedback("m1FeedbackGrade", "❌ " + err.message, "error"); }
  });

  document.getElementById("m1BtnCalcular").addEventListener("click", m1Calcular);
  document.getElementById("m1CargaHoraria").addEventListener("input", () => {
    if (!document.getElementById("m1ResultadoBlock").hidden) m1Calcular();
  });
  document.getElementById("m1ListaAproveitamento").addEventListener("change", e => {
    if (e.target.classList.contains("m1chk-aprov")) m1Calcular();
  });
  document.getElementById("m1AlunoInfo").addEventListener("input", m1AtualizarPreview);
  document.getElementById("m1Semestre").addEventListener("input",    m1AtualizarPreview);

  document.getElementById("m1BtnCopiarSEI").addEventListener("click", () => {
    navigator.clipboard.writeText(m1GerarHTML())
      .then(() => showToast("Código copiado! Cole no SEI via '< >'", "ok"))
      .catch(() => showToast("Erro ao copiar.", "err"));
  });
  document.getElementById("m1BtnBaixarWord").addEventListener("click", () => {
    const nome = m1.nomeArquivoOriginal ||
      (document.getElementById("m1AlunoInfo").value.trim().replace(/[<>:"/\\|?*]+/g, "_")) ||
      "Plano_de_Estudos";
    downloadBlob(gerarWordBlob(m1GerarHTML()), nome + ".doc");
  });
  document.getElementById("m1BtnExportar").addEventListener("click", () => {
    if (!m1.dadosDoCurso) { showToast("Nenhuma grade carregada.", "err"); return; }
    downloadBlob(
      new Blob([JSON.stringify(m1.dadosDoCurso, null, 2)], { type: "application/json" }),
      `grade_${m1.dadosDoCurso.curso.replace(/\s+/g, "_")}.json`
    );
  });

  // ── M2 eventos ──
  configurarDD("m2DropGrade", "m2InputGrade", m2CarregarGrade);
  configurarDD("m2DropEq",    "m2InputEq",    m2CarregarEq);
  configurarDD("m2DropBatch", "m2InputBatch", m2AdicionarArquivos);

  document.getElementById("m2BtnProcessar").addEventListener("click", m2ExecutarLote);
  document.getElementById("m2BtnZip").addEventListener("click", m2BaixarZip);
  document.getElementById("m2BtnLimpar").addEventListener("click", () => {
    m2.arquivos = []; m2.selecionado = null; m2RenderizarLista();
    document.getElementById("m2BtnZip").disabled = true;
    document.getElementById("m2ProgressWrap").style.display = "none";
    document.getElementById("m2ProgressBar").style.width = "0%";
    document.getElementById("m2FeedbackLote").hidden = true;
    document.getElementById("m2SecIndividual").style.display = "none";
    document.getElementById("m2SecVazio").style.display = "block";
    
    // Limpa o input de arquivos para permitir subir o mesmo arquivo/lote novamente
    document.getElementById("m2InputBatch").value = "";
  });
  document.getElementById("m2BtnCopiarSEI").addEventListener("click", () => {
    if (m2.selecionado === null) return;
    navigator.clipboard.writeText(m2.arquivos[m2.selecionado].resultado.htmlPlano)
      .then(() => showToast("Código copiado!", "ok"))
      .catch(() => showToast("Erro ao copiar.", "err"));
  });
  document.getElementById("m2BtnBaixarWord").addEventListener("click", () => {
    if (m2.selecionado === null) return;
    const a = m2.arquivos[m2.selecionado];
    downloadBlob(gerarWordBlob(a.resultado.htmlPlano), a.nomeDownload + ".doc");
  });
  document.getElementById("m2BtnExportGrade").addEventListener("click", () => {
    const s = localStorage.getItem("gradeNova_v1");
    if (!s) { showToast("Nenhuma grade nova carregada.", "err"); return; }
    downloadBlob(new Blob([s], { type: "application/json" }), "grade_nova.json");
  });
  document.getElementById("m2BtnExportEq").addEventListener("click", () => {
    const s = localStorage.getItem("equivalencias_v1");
    if (!s) { showToast("Nenhuma equivalência carregada.", "err"); return; }
    downloadBlob(new Blob([s], { type: "application/json" }), "equivalencias.json");
  });
});