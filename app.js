/**
 * @file app.js
 * @description Sistema de Planos de Estudos — FAODO/UFMS
 *
 * Organização:
 *   1. Utils        — funções puras reutilizáveis (sem efeitos colaterais de DOM)
 *   2. UI           — navegação, toast, feedback, drag-and-drop
 *   3. Módulo 1     — Aproveitamento de Estudos (PPC atual)
 *   4. Módulo 2     — Transição de Grade (Novo PPC, lote)
 *   5. Persistência — localStorage + fetch de JSON padrão
 *   6. Init         — único ponto de entrada, registra todos os eventos
 *
 * Padrões aplicados:
 *   - "use strict" em todo o arquivo
 *   - Sem funções globais expostas no window (zero onclick= no HTML)
 *   - escapeHTML aplicado em todos os dados vindos do usuário/planilha
 *   - setTimeout(0) entre arquivos do lote para não travar a main thread
 *   - Separação clara entre lógica de negócio e manipulação de DOM
 *   - JSDoc nos contratos públicos das funções principais
 *   - Nenhuma variável "vaza" para o escopo global
 */

"use strict";

// ═══════════════════════════════════════════════════════════════
// 1. UTILS — funções puras, sem DOM
// ═══════════════════════════════════════════════════════════════

/**
 * Normaliza uma string para comparação: remove acentos,
 * converte para maiúsculas e elimina espaços nas extremidades.
 * @param {string} s
 * @returns {string}
 */
function norm(s) {
  return s
    ? String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim()
    : "";
}

/**
 * Escapa caracteres HTML especiais para prevenir injeção de código (XSS).
 * Deve ser usado em TODOS os dados que vêm de fora (planilha, nome de arquivo).
 * @param {string} str
 * @returns {string}
 */
function escapeHTML(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Lê um File como texto e faz parse de JSON.
 * @param {File} file
 * @returns {Promise<object>}
 */
function lerJSON(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = (e) => {
      try { resolve(JSON.parse(e.target.result)); }
      catch (err) { reject(new Error("JSON inválido: " + err.message)); }
    };
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    reader.readAsText(file);
  });
}

/**
 * Gera um Blob no formato Word (.doc) a partir de um fragmento HTML.
 * @param {string} htmlFragmento
 * @returns {Blob}
 */
function gerarWordBlob(htmlFragmento) {
  const wrapper = `<html
    xmlns:o="urn:schemas-microsoft-com:office:office"
    xmlns:w="urn:schemas-microsoft-com:office:word"
    xmlns="http://www.w3.org/TR/REC-html40">
    <head><meta charset="utf-8"><title>Plano de Estudos</title></head>
    <body>${htmlFragmento}</body>
  </html>`;
  return new Blob(["\ufeff", wrapper], { type: "application/msword" });
}

/**
 * Dispara o download de um Blob com o nome informado.
 * @param {Blob} blob
 * @param {string} nomeArquivo
 */
function downloadBlob(blob, nomeArquivo) {
  const url  = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href     = url;
  link.download = nomeArquivo;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Retorna uma Promise que resolve após `ms` milissegundos.
 * Usada para dar "respiro" à main thread entre processamentos pesados.
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calcula o enquadramento semestral conforme IN Prograd nº 40/2019.
 * Retorna o número do semestre (base-1) em que o aluno se enquadra.
 * @param {number} chEstudante — carga horária obrigatória do aluno
 * @param {Array}  semestres   — array de semestres da grade
 * @returns {string}
 */
function calcularEnquadramento(chEstudante, semestres) {
  let chAcumulada = 0;
  for (let i = 0; i < semestres.length; i++) {
    chAcumulada += semestres[i].disciplinas.reduce((soma, d) => soma + d.ch, 0);
    if (chAcumulada > chEstudante) {
      const diferenca = chAcumulada - chEstudante;
      return diferenca <= 136
        ? `${Math.min(i + 2, semestres.length)}º semestre`
        : `${i + 1}º semestre`;
    }
  }
  return "Último semestre / Formando";
}

// ═══════════════════════════════════════════════════════════════
// 2. UI — navegação, notificações, drag-and-drop
// ═══════════════════════════════════════════════════════════════

/** @type {number|null} */
let _toastTimer = null;

/**
 * Exibe uma notificação temporária no canto inferior direito.
 * @param {string} msg
 * @param {"ok"|"err"|""} tipo
 */
function showToast(msg, tipo = "") {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.className   = "toast" + (tipo ? ` toast-${tipo}` : "");
  el.hidden      = false;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { el.hidden = true; }, 4500);
}

/**
 * Exibe uma mensagem de feedback inline dentro de um elemento existente.
 * @param {string} idElemento
 * @param {string} msg        — pode conter HTML seguro (não dados do usuário)
 * @param {"success"|"error"|"info"} tipo
 */
function showFeedback(idElemento, msg, tipo) {
  const el = document.getElementById(idElemento);
  if (!el) return;
  el.innerHTML  = msg;
  el.className  = `feedback-bar ${tipo}`;
  el.hidden     = false;
}

/**
 * Atualiza o visual de um badge no header.
 * @param {string} idBadge
 * @param {string} idNome
 * @param {string} texto
 * @param {"ok"|"idle"} status
 */
function setBadge(idBadge, idNome, texto, status) {
  const badge = document.getElementById(idBadge);
  const nome  = document.getElementById(idNome);
  if (badge) badge.className    = `badge badge-${status}`;
  if (nome)  nome.textContent   = texto;
}

/**
 * Configura uma área de drag-and-drop conectada a um <input type="file">.
 * @param {string}   idZona
 * @param {string}   idInput
 * @param {Function} onFiles — callback chamado com o FileList
 */
function configurarDragAndDrop(idZona, idInput, onFiles) {
  const zona  = document.getElementById(idZona);
  const input = document.getElementById(idInput);
  if (!zona || !input) return;

  zona.addEventListener("dragover", (e) => {
    e.preventDefault();
    zona.classList.add("dragover");
  });
  ["dragleave", "dragend"].forEach((tipo) =>
    zona.addEventListener(tipo, () => zona.classList.remove("dragover"))
  );
  zona.addEventListener("drop", (e) => {
    e.preventDefault();
    zona.classList.remove("dragover");
    if (e.dataTransfer.files.length) onFiles(e.dataTransfer.files);
  });
  input.addEventListener("change", (e) => {
    if (e.target.files.length) onFiles(e.target.files);
    e.target.value = ""; // permite re-selecionar o mesmo arquivo
  });
  // Acessibilidade: permite ativar via teclado
  zona.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      input.click();
    }
  });
}

// ─── Navegação entre telas ────────────────────────────────────

/**
 * Volta para a tela inicial, ocultando qualquer módulo aberto.
 */
function irHome() {
  document.getElementById("screenHome").style.display          = "";
  document.getElementById("headerHome").style.display          = "";
  document.getElementById("headerBadges").style.display        = "none";
  document.getElementById("screenAproveitamento").classList.remove("active");
  document.getElementById("screenNovoPPC").classList.remove("active");
}

/**
 * Abre um dos módulos do sistema, ocultando a tela inicial.
 * @param {"aproveitamento"|"novoppc"} modulo
 */
function abrirModulo(modulo) {
  document.getElementById("screenHome").style.display   = "none";
  document.getElementById("headerHome").style.display   = "none";
  document.getElementById("headerBadges").style.display = "flex";
  document.getElementById("screenAproveitamento").classList.remove("active");
  document.getElementById("screenNovoPPC").classList.remove("active");

  const isAprov = modulo === "aproveitamento";
  document.getElementById("screenAproveitamento").classList.toggle("active",  isAprov);
  document.getElementById("screenNovoPPC").classList.toggle("active",         !isAprov);
  document.getElementById("badgeGrade1").style.display  = isAprov ? "flex"  : "none";
  document.getElementById("badgeGrade2").style.display  = isAprov ? "none"  : "flex";
  document.getElementById("badgeEq").style.display      = isAprov ? "none"  : "flex";
}

// ═══════════════════════════════════════════════════════════════
// 3. MÓDULO 1 — Aproveitamento de Estudos (PPC atual)
// ═══════════════════════════════════════════════════════════════

/**
 * Estado privado do Módulo 1.
 * Não é acessado por nenhuma função do Módulo 2.
 */
const m1 = {
  dadosDoCurso:              null,
  disciplinasAprovadasExcel: /** @type {string[]} */ ([]),
  disciplinasAprovadas:      /** @type {string[]} */ ([]),
  disciplinasMatriculadas:   /** @type {Array<{nome:string,ch:number}>} */ ([]),
  chOptCursada:              0,
  chNfcCursada:              0,
  chTotalCursada:            0,
  chAproveitamentosExcel:    0,
  chAproveitadaManual:       0,
  ultimoEnquadramento:       "",
  nomeArquivoOriginal:       "",
};

/** Avança/retrocede o stepper visual do Módulo 1. */
function m1SetStep(n) {
  [1, 2, 3].forEach((i) => {
    const el = document.getElementById(`m1step${i}`);
    if (!el) return;
    el.classList.toggle("done",   i < n);
    el.classList.toggle("active", i === n);
    if (i >= n) el.classList.remove("done");
    if (i !== n) el.classList.remove("active");
  });
}

/** Valida estrutura mínima de um JSON de grade curricular. */
function m1ValidarGrade(grade) {
  if (!grade?.curso || !Array.isArray(grade.semestres) || grade.semestres.length === 0) {
    throw new Error('O JSON deve ter os campos "curso" e "semestres" preenchidos.');
  }
}

/** Atualiza o badge do header e re-renderiza a lista de aproveitamento. */
function m1AtualizarInterface() {
  if (m1.dadosDoCurso) {
    setBadge("badgeGrade1", "badgeGrade1Nome", m1.dadosDoCurso.curso, "ok");
  }
  m1RenderizarAproveitamento();
}

/**
 * Renderiza a lista de checkboxes de aproveitamento manual.
 * Usa DOM API ao invés de innerHTML para evitar XSS com dados da grade.
 */
function m1RenderizarAproveitamento() {
  const container = document.getElementById("m1ListaAproveitamento");
  if (!container || !m1.dadosDoCurso) return;

  // Limpa o container de forma segura
  container.replaceChildren();

  let alguma = false;

  m1.dadosDoCurso.semestres.forEach((sem) => {
    const pendentes = sem.disciplinas.filter(
      (d) => !m1.disciplinasAprovadasExcel.includes(norm(d.nome))
    );
    if (!pendentes.length) return;

    alguma = true;

    const grupo = document.createElement("div");
    grupo.className   = "semester-group";
    grupo.textContent = `${sem.numero}º Semestre`;
    container.appendChild(grupo);

    pendentes.forEach((d) => {
      const idCheck = `m1chk_${norm(d.nome).replace(/[^A-Z0-9]/g, "_")}`;

      const label = document.createElement("label");
      label.className  = "checkbox-item";
      label.htmlFor    = idCheck;

      const checkbox = document.createElement("input");
      checkbox.type      = "checkbox";
      checkbox.id        = idCheck;
      checkbox.className = "m1chk-aprov";
      checkbox.value     = d.nome;
      checkbox.dataset.ch = String(d.ch);

      const span = document.createElement("span");
      span.textContent = ` ${d.nome} `;

      const ch = document.createElement("span");
      ch.style.color      = "var(--gray-500)";
      ch.style.marginLeft = "4px";
      ch.textContent      = `(${d.ch}h)`;

      label.appendChild(checkbox);
      label.appendChild(span);
      label.appendChild(ch);
      container.appendChild(label);
    });
  });

  if (!alguma) {
    const p = document.createElement("p");
    p.className   = "empty-state";
    p.textContent = "Todas as disciplinas já constam no histórico.";
    container.appendChild(p);
  }
}

/**
 * Lê e processa uma planilha de histórico acadêmico (Módulo 1).
 * @param {FileList} files
 */
function m1ProcessarHistorico(files) {
  const file = files[0];
  if (!file) return;

  m1.nomeArquivoOriginal = file.name.replace(/\.[^/.]+$/, "").trim();
  const nomeLimpo = m1.nomeArquivoOriginal
    .replace(/^(hist[oó]rico\s*escolar|hist[oó]rico)[_\-\s]*/i, "")
    .trim();

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const wb = XLSX.read(new Uint8Array(e.target.result), { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json(ws, { header: 1 });

      const nomeDaPlanilha = raw[0]?.[0] ? String(raw[0][0]).trim() : "";
      const rgaDaPlanilha  = raw[1]?.[0] ? String(raw[1][0]).trim() : "";

      // Preenche o campo de identificação (dados não vão para HTML, apenas para input)
      const elInfo = document.getElementById("m1AlunoInfo");
      if (elInfo) {
        if (nomeLimpo.length > 5 && !/^pasta\s*\d*$/i.test(nomeLimpo)) {
          elInfo.value = nomeLimpo;
        } else if (rgaDaPlanilha && nomeDaPlanilha) {
          elInfo.value = `${rgaDaPlanilha} - ${nomeDaPlanilha}`;
        } else if (nomeDaPlanilha) {
          elInfo.value = nomeDaPlanilha;
        } else if (rgaDaPlanilha) {
          elInfo.value = rgaDaPlanilha;
        }
      }

      const linhas = XLSX.utils.sheet_to_json(ws, { range: 2 });
      let chOBR = 0, chOPT = 0, chNFC = 0, chAproveitadas = 0;
      m1.disciplinasAprovadasExcel = [];
      m1.disciplinasMatriculadas   = [];

      linhas.forEach((linha) => {
        const nomeDisciplina = linha["Nome da Disciplina/CCND"];
        const tipo           = linha["Tipo"];
        const situacao       = linha["Situação"];
        const chStr          = linha["C.H."];

        if (!nomeDisciplina || !tipo || !situacao || chStr === undefined) return;

        const ch = parseFloat(chStr);
        if (isNaN(ch)) return;

        const tipoNorm = norm(tipo);
        const sitNorm  = norm(situacao);

        if (sitNorm === "MATRICULADO" || sitNorm.startsWith("MAT")) {
          m1.disciplinasMatriculadas.push({ nome: String(nomeDisciplina).trim(), ch });
        }

        const eAprovado =
          sitNorm === "APROVADO"       ||
          sitNorm.startsWith("APR")    ||
          sitNorm.includes("DISPENSA") ||
          sitNorm.includes("EQUIVALENCIA");

        if (!eAprovado) return;

        if (tipoNorm === "OBR" || tipoNorm.startsWith("OBR")) {
          chOBR += ch;
          m1.disciplinasAprovadasExcel.push(norm(nomeDisciplina));
          if (sitNorm.includes("ANALISE DE CURRICULO")) chAproveitadas += ch;
        } else if (tipoNorm === "OPT" || tipoNorm.startsWith("OPT")) {
          chOPT += ch;
        } else if (tipoNorm === "NFC" || tipoNorm.startsWith("NFC")) {
          chNFC += ch;
        }
      });

      m1.chOptCursada           = chOPT;
      m1.chNfcCursada           = chNFC;
      m1.chAproveitamentosExcel = chAproveitadas;

      document.getElementById("m1CargaHoraria").value = chOBR;
      m1RenderizarAproveitamento();
      m1Calcular();
      m1SetStep(2);
      showFeedback(
        "m1FeedbackHistorico",
        `✅ Obrigatórias: ${chOBR}h | Optativas: ${chOPT}h | NFC: ${chNFC}h | Matrículas ativas: ${m1.disciplinasMatriculadas.length}`,
        "success"
      );
    } catch (err) {
      showFeedback("m1FeedbackHistorico", `❌ Erro ao processar: ${escapeHTML(err.message)}`, "error");
    }
  };
  reader.readAsArrayBuffer(file);
}

/** Executa o cálculo de enquadramento e atualiza o resultado na tela. */
function m1Calcular() {
  if (!m1.dadosDoCurso) return;

  const chBase = parseInt(document.getElementById("m1CargaHoraria").value, 10) || 0;

  let chCheckboxes = 0;
  const aprovChk   = [];
  document.querySelectorAll(".m1chk-aprov:checked").forEach((chk) => {
    chCheckboxes += parseInt(chk.dataset.ch, 10) || 0;
    aprovChk.push(norm(chk.value));
  });

  m1.chAproveitadaManual  = chCheckboxes;
  m1.disciplinasAprovadas = [...m1.disciplinasAprovadasExcel, ...aprovChk];

  const chEstudante     = chBase + chCheckboxes;
  m1.chTotalCursada     = chEstudante + m1.chOptCursada + m1.chNfcCursada;
  m1.ultimoEnquadramento = calcularEnquadramento(chEstudante, m1.dadosDoCurso.semestres);

  document.getElementById("m1ResultadoSemestre").textContent = m1.ultimoEnquadramento;
  document.getElementById("m1ResultadoCH").textContent       = `CH analisada: ${chEstudante}h`;
  document.getElementById("m1ResultadoBlock").hidden         = false;
  document.getElementById("m1SecPlano").hidden               = false;
  m1SetStep(3);
  m1AtualizarPreview();
}

/** Atualiza a caixa de prévia do documento. */
function m1AtualizarPreview() {
  const box = document.getElementById("m1PreviewPlano");
  if (box) box.innerHTML = m1GerarHTML();
}

/**
 * Gera o fragmento HTML do plano de estudos (Módulo 1).
 * Todos os dados do usuário/planilha são sanitizados com escapeHTML.
 * @returns {string}
 */
function m1GerarHTML() {
  const infoStr = document.getElementById("m1AlunoInfo")?.value.trim() || "";
  let nome = "Não informado";
  let rga  = "Não informado";

  if (infoStr) {
    const separador = infoStr.indexOf(" - ");
    if (separador !== -1) {
      rga  = infoStr.substring(0, separador).trim();
      nome = infoStr.substring(separador + 3).trim();
    } else {
      nome = infoStr;
    }
  }

  // Sanitiza antes de injetar no HTML
  const nomeSeguro = escapeHTML(nome);
  const rgaSeguro  = escapeHTML(rga);
  const enq        = escapeHTML(m1.ultimoEnquadramento || "Não calculado");

  // Cálculo dos períodos letivos futuros
  const semStr = document.getElementById("m1Semestre")?.value.trim() || "2026/1";
  const partes = semStr.split(/[\/.\-]/);
  let ano = parseInt(partes[0], 10) || new Date().getFullYear();
  let sem = parseInt(partes[1], 10) || 1;
  const proximoPeriodo = () => {
    sem++;
    if (sem > 2) { sem = 1; ano++; }
    return `${ano}/${sem}`;
  };

  // ── Tabela 1: semestre atual ──────────────────────────────
  let linhasT1 = "";
  if (m1.disciplinasMatriculadas.length > 0) {
    linhasT1 = m1.disciplinasMatriculadas
      .map((d) => `<tr>
        <td><p class="Tabela_Texto_Alinhado_Esquerda">${escapeHTML(d.nome)}</p></td>
        <td><p class="Tabela_Texto_Centralizado">&nbsp;</p></td>
      </tr>`)
      .join("");
  } else {
    linhasT1 = Array(4).fill(`<tr><td>&nbsp;</td><td>&nbsp;</td></tr>`).join("");
  }

  // ── Tabela 2: semestres futuros ───────────────────────────
  let linhasT2 = "";
  let grandTotal = 0;

  m1.dadosDoCurso.semestres.forEach((semestre) => {
    const pendentes = semestre.disciplinas.filter(
      (d) => !m1.disciplinasAprovadas.includes(norm(d.nome))
    );
    if (!pendentes.length) return;

    const periodo = proximoPeriodo();
    let totalBloco = 0;

    linhasT2 += `<tr>
      <td style="width:60%;"><p class="Tabela_Texto_Alinhado_Esquerda">
        <strong>${escapeHTML(String(semestre.numero))}° semestre</strong>
      </p></td>
      <td>&nbsp;</td><td>&nbsp;</td>
    </tr>`;

    pendentes.forEach((d) => {
      totalBloco += d.ch;
      grandTotal += d.ch;
      linhasT2 += `<tr>
        <td><p class="Tabela_Texto_Alinhado_Esquerda">${escapeHTML(d.nome)}</p></td>
        <td><p class="Tabela_Texto_Centralizado">${escapeHTML(periodo)}</p></td>
        <td><p class="Tabela_Texto_Centralizado">${d.ch}</p></td>
      </tr>`;
    });

    linhasT2 += `<tr>
      <td><p class="Tabela_Texto_Alinhado_Esquerda"><strong>TOTAL</strong></p></td>
      <td>&nbsp;</td>
      <td><p class="Tabela_Texto_Centralizado"><strong>${totalBloco}</strong></p></td>
    </tr>
    <tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>`;
  });

  linhasT2 += `<tr>
    <td>&nbsp;</td>
    <td><p class="Tabela_Texto_Centralizado"><strong>TOTAL DO PLANO</strong></p></td>
    <td><p class="Tabela_Texto_Centralizado"><strong>${grandTotal}</strong></p></td>
  </tr>`;

  // ── Cálculo dos itens 3, 4 e 5 ───────────────────────────
  const reqOpt    = m1.dadosDoCurso.ch_optativas_exigidas ?? 60;
  const reqExt    = m1.dadosDoCurso.ch_extensao_exigida   ?? 409;
  const reqTotal  = m1.dadosDoCurso.ch_total_curso        ?? 4090;
  const optACursar   = Math.max(0, reqOpt   - m1.chOptCursada);
  const totalACursar = Math.max(0, reqTotal - m1.chTotalCursada);
  const totalAprov   = (m1.chAproveitamentosExcel || 0) + (m1.chAproveitadaManual || 0);

  return `
<p class="Item_Nivel1" style="font-weight:bold;">Identificação do Acadêmico:</p>
<p class="Texto_Justificado">Nome: ${nomeSeguro}</p>
<p class="Texto_Justificado">RGA na UFMS: ${rgaSeguro}</p>
<p class="Texto_Justificado">Enquadramento: ${enq}</p>
<p>&nbsp;</p>

<p class="Item_Nivel1" style="font-weight:bold;">1. Plano de estudos — Semestre atual:</p>
<table style="border-collapse:collapse;margin:0 auto;width:85%;" border="1" cellpadding="5">
  <thead><tr>
    <th style="background:#ccc;"><p class="Tabela_Texto_Centralizado">Disciplinas a serem cursadas no semestre atual</p></th>
    <th style="background:#ccc;"><p class="Tabela_Texto_Centralizado">Indicação da turma prática</p></th>
  </tr></thead>
  <tbody>${linhasT1}</tbody>
</table>
<p>&nbsp;</p>

<p class="Item_Nivel1" style="font-weight:bold;">2. Plano de estudos — Semestres futuros:</p>
<table style="border-collapse:collapse;margin:0 auto;width:85%;" border="1" cellpadding="5">
  <thead><tr>
    <th style="background:#ccc;width:60%;"><p class="Tabela_Texto_Centralizado">Disciplinas a serem cursadas em semestres posteriores</p></th>
    <th style="background:#ccc;width:20%;"><p class="Tabela_Texto_Centralizado">Indicação do Semestre</p></th>
    <th style="background:#ccc;width:20%;"><p class="Tabela_Texto_Centralizado">Carga horária</p></th>
  </tr></thead>
  <tbody>${linhasT2}</tbody>
</table>
<p>&nbsp;</p>

<p class="Item_Nivel1" style="font-weight:bold;">3. CARGA HORÁRIA DE DISCIPLINAS OPTATIVAS NECESSÁRIAS:</p>
<p class="Texto_Justificado">Carga horária optativa cursada: ${m1.chOptCursada} horas</p>
<p class="Texto_Justificado">Carga horária optativa a cursar: ${optACursar} horas</p>
<p>&nbsp;</p>

<p class="Item_Nivel1" style="font-weight:bold;">4. CARGA HORÁRIA EM ATIVIDADES DE EXTENSÃO NECESSÁRIAS:</p>
<p class="Texto_Justificado">Carga horária cursada: 0 horas</p>
<p class="Texto_Justificado">Carga horária a cursar: ${reqExt} horas</p>
<p>&nbsp;</p>

<p class="Item_Nivel1" style="font-weight:bold;">5. INTEGRALIZAÇÃO CURRICULAR:</p>
<p class="Texto_Justificado">Aproveitadas/dispensadas: ${totalAprov} horas</p>
<p class="Texto_Justificado">A cursar: ${totalACursar} horas</p>
<p class="Texto_Justificado">Total do plano de estudos: ${grandTotal} horas</p>
<p>&nbsp;</p><p>&nbsp;</p><p>&nbsp;</p>`;
}

// ═══════════════════════════════════════════════════════════════
// 4. MÓDULO 2 — Transição de Grade / Novo PPC (lote)
// ═══════════════════════════════════════════════════════════════

/**
 * Estado privado do Módulo 2.
 * Completamente isolado do estado do Módulo 1.
 */
const m2 = {
  gradeNova:    /** @type {object|null} */ (null),
  equivalencias: /** @type {Map<string,string[]>|null} */ (null),
  arquivos:     /** @type {Array<{file:File,status:string,resultado:object|null,nomeDownload:string}>} */ ([]),
  selecionado:  /** @type {number|null} */ (null),
};

/** Valida estrutura mínima de um JSON de grade. */
function m2ValidarGrade(grade) {
  if (!grade?.curso || !Array.isArray(grade.semestres) || grade.semestres.length === 0) {
    throw new Error('"curso" ou "semestres" ausentes ou inválidos.');
  }
}

/** Valida estrutura mínima de um JSON de equivalências. */
function m2ValidarEquivalencias(eq) {
  if (!eq || !Array.isArray(eq.equivalencias)) {
    throw new Error('O arquivo deve ter um campo "equivalencias" do tipo array.');
  }
}

/**
 * Constrói um Map normalizado a partir do JSON de equivalências.
 * Chave: disciplina antiga normalizada → Valor: array de disciplinas novas normalizadas.
 * @param {object} eq
 * @returns {Map<string, string[]>}
 */
function m2ConstruirMapaEquivalencias(eq) {
  const mapa = new Map();
  eq.equivalencias.forEach((regra) => {
    if (!regra.antiga) return;
    const chave   = norm(regra.antiga);
    const novas   = (regra.novas || []).map((n) => norm(n));
    if (mapa.has(chave)) {
      const existentes = mapa.get(chave);
      novas.forEach((n) => { if (!existentes.includes(n)) existentes.push(n); });
    } else {
      mapa.set(chave, novas);
    }
  });
  return mapa;
}

/** Verifica se ambos os arquivos de configuração foram carregados. */
function m2VerificarConfigCompleta() {
  if (m2.gradeNova && m2.equivalencias) {
    showFeedback("m2FeedbackConfig", "✅ Configuração completa. Pode processar os históricos.", "success");
    document.getElementById("m2BtnProcessar").disabled = false;
  }
}

/**
 * Carrega e valida o JSON da grade nova.
 * @param {FileList} files
 */
async function m2CarregarGrade(files) {
  try {
    const grade = await lerJSON(files[0]);
    m2ValidarGrade(grade);
    m2.gradeNova = grade;
    localStorage.setItem("gradeNova_v1", JSON.stringify(grade));
    setBadge("badgeGrade2", "badgeGrade2Nome", grade.curso, "ok");
    const dropLabel = document.getElementById("m2DropGradeLabel");
    document.getElementById("m2DropGrade").classList.add("loaded");
    if (dropLabel) dropLabel.textContent = `✓ ${grade.curso}`;
    m2VerificarConfigCompleta();
    showToast(`Grade nova carregada: ${grade.curso}`, "ok");
  } catch (err) {
    showToast(`Erro na grade: ${err.message}`, "err");
  }
}

/**
 * Carrega e valida o JSON de equivalências.
 * @param {FileList} files
 */
async function m2CarregarEquivalencias(files) {
  try {
    const eq = await lerJSON(files[0]);
    m2ValidarEquivalencias(eq);
    m2.equivalencias = m2ConstruirMapaEquivalencias(eq);
    localStorage.setItem("equivalencias_v1", JSON.stringify(eq));
    setBadge("badgeEq", "badgeEqNome", `${eq.equivalencias.length} regras`, "ok");
    const dropLabel = document.getElementById("m2DropEqLabel");
    document.getElementById("m2DropEq").classList.add("loaded");
    if (dropLabel) dropLabel.textContent = `✓ ${eq.equivalencias.length} equivalências`;
    m2VerificarConfigCompleta();
    showToast(`${eq.equivalencias.length} equivalências carregadas`, "ok");
  } catch (err) {
    showToast(`Erro nas equivalências: ${err.message}`, "err");
  }
}

/**
 * Adiciona arquivos à fila de processamento em lote.
 * Ignora arquivos com nomes duplicados.
 * @param {FileList} files
 */
function m2AdicionarArquivos(files) {
  Array.from(files).forEach((f) => {
    const jáExiste = m2.arquivos.some((a) => a.file.name === f.name);
    if (!jáExiste) {
      m2.arquivos.push({
        file:          f,
        status:        "pending",
        resultado:     null,
        nomeDownload:  f.name.replace(/\.[^/.]+$/, ""),
      });
    }
  });
  m2RenderizarListaArquivos();
  if (m2.arquivos.length > 0 && m2.gradeNova && m2.equivalencias) {
    document.getElementById("m2BtnProcessar").disabled = false;
  }
}

/**
 * Renderiza a lista de arquivos na fila.
 * Usa DOM API (sem onclick no HTML) — eventos delegados no init.
 */
function m2RenderizarListaArquivos() {
  const container = document.getElementById("m2FileList");
  if (!m2.arquivos.length) {
    container.style.display = "none";
    return;
  }
  container.style.display = "flex";

  // Limpa de forma segura
  container.replaceChildren();

  m2.arquivos.forEach((item, indice) => {
    const div = document.createElement("div");
    div.className       = "file-item";
    div.dataset.index   = String(indice);

    if (item.status === "ok") {
      div.style.cursor = "pointer";
      div.title        = "Clique para ver a prévia";
    }

    const icone = document.createElement("span");
    icone.textContent = "📄";

    const nomeEl = document.createElement("span");
    nomeEl.className   = "file-name";
    nomeEl.textContent = item.file.name; // textContent é seguro

    const statusEl = document.createElement("span");
    const statusMap = {
      ok:      { cls: "status-ok",      txt: "✓ Pronto"    },
      err:     { cls: "status-err",     txt: "✗ Erro"      },
      pending: { cls: "status-pending", txt: "Aguardando"  },
    };
    const s = statusMap[item.status] || statusMap.pending;
    statusEl.className   = `file-status ${s.cls}`;
    statusEl.textContent = s.txt;

    div.appendChild(icone);
    div.appendChild(nomeEl);
    div.appendChild(statusEl);
    container.appendChild(div);
  });
}

/**
 * Processa um único arquivo Excel e retorna os dados do aluno.
 * @param {File} file
 * @returns {Promise<object>}
 */
function m2ProcessarExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target.result), { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json(ws, { header: 1 });

        const nomeDaPlanilha = raw[0]?.[0] ? String(raw[0][0]).trim() : "";
        const rgaDaPlanilha  = raw[1]?.[0] ? String(raw[1][0]).trim() : "";

        const nomeArquivo = file.name.replace(/\.[^/.]+$/, "").trim();
        const nomeLimpo   = nomeArquivo
          .replace(/^(hist[oó]rico\s*escolar|hist[oó]rico)[_\-\s]*/i, "")
          .trim();

        let nome = "Não informado";
        let rga  = "Não informado";

        if (nomeLimpo.length > 5 && !/^pasta\s*\d*$/i.test(nomeLimpo)) {
          const sep = nomeLimpo.indexOf(" - ");
          if (sep !== -1) {
            rga  = nomeLimpo.substring(0, sep).trim();
            nome = nomeLimpo.substring(sep + 3).trim();
          } else {
            nome = nomeLimpo;
          }
        } else if (rgaDaPlanilha && nomeDaPlanilha) {
          rga  = rgaDaPlanilha;
          nome = nomeDaPlanilha;
        } else if (nomeDaPlanilha) {
          nome = nomeDaPlanilha;
        }

        const linhas = XLSX.utils.sheet_to_json(ws, { range: 2 });
        let chOPT = 0, chNFC = 0;
        const cursadasAntigas = new Set();
        const matriculadas    = [];

        linhas.forEach((linha) => {
          const nomeDisciplina = linha["Nome da Disciplina/CCND"];
          const tipo           = linha["Tipo"];
          const situacao       = linha["Situação"];
          const chStr          = linha["C.H."];

          if (!nomeDisciplina || !tipo || !situacao || chStr === undefined) return;

          const ch = parseFloat(chStr);
          if (isNaN(ch)) return;

          const tipoNorm = norm(tipo);
          const sitNorm  = norm(situacao);

          if (sitNorm === "MATRICULADO" || sitNorm.startsWith("MAT")) {
            matriculadas.push({ nome: String(nomeDisciplina).trim(), ch });
          }

          const eAprovado =
            sitNorm === "APROVADO"       ||
            sitNorm.startsWith("APR")    ||
            sitNorm.includes("DISPENSA") ||
            sitNorm.includes("EQUIVALENCIA");

          if (!eAprovado) return;

          if (tipoNorm === "OBR" || tipoNorm.startsWith("OBR")) {
            cursadasAntigas.add(norm(nomeDisciplina));
          } else if (tipoNorm === "OPT" || tipoNorm.startsWith("OPT")) {
            chOPT += ch;
          } else if (tipoNorm === "NFC" || tipoNorm.startsWith("NFC")) {
            chNFC += ch;
          }
        });

        // Aplica tabela de equivalências
        const disciplinasNovCobertas = new Set();
        cursadasAntigas.forEach((antigaNorm) => {
          const equivalentes = m2.equivalencias.get(antigaNorm);
          if (equivalentes) equivalentes.forEach((n) => disciplinasNovCobertas.add(n));
        });

        // Calcula CH coberta na grade nova
        let chAnalisada = 0;
        m2.gradeNova.semestres.forEach((s) =>
          s.disciplinas.forEach((d) => {
            if (disciplinasNovCobertas.has(norm(d.nome))) chAnalisada += d.ch;
          })
        );

        const enquadramento = calcularEnquadramento(chAnalisada, m2.gradeNova.semestres);

        resolve({
          nome,
          rga,
          nomeArquivo,
          matriculadas,
          disciplinasNovCobertas,
          enquadramento,
          chAnalisada,
          chOPT,
          chNFC,
        });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error(`Falha ao ler "${file.name}".`));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Gera o fragmento HTML do plano de estudos (Módulo 2).
 * Todos os dados externos são sanitizados com escapeHTML.
 * @param {object} resultado
 * @param {string} semestreBase
 * @returns {string}
 */
function m2GerarHTML(resultado, semestreBase) {
  const { nome, rga, enquadramento, matriculadas, disciplinasNovCobertas, chAnalisada, chOPT, chNFC } = resultado;

  const nomeSeguro = escapeHTML(nome);
  const rgaSeguro  = escapeHTML(rga);
  const enqSeguro  = escapeHTML(enquadramento);

  const partes = semestreBase.split(/[\/.\-]/);
  let ano = parseInt(partes[0], 10) || new Date().getFullYear();
  let sem = parseInt(partes[1], 10) || 1;
  const proximoPeriodo = () => {
    sem++;
    if (sem > 2) { sem = 1; ano++; }
    return `${ano}/${sem}`;
  };

  // ── Tabela 1 ──────────────────────────────────────────────
  let linhasT1 = "";
  if (matriculadas.length > 0) {
    linhasT1 = matriculadas
      .map((d) => `<tr>
        <td><p class="Tabela_Texto_Alinhado_Esquerda">${escapeHTML(d.nome)}</p></td>
        <td>&nbsp;</td>
      </tr>`)
      .join("");
  } else {
    linhasT1 = Array(4).fill(`<tr><td>&nbsp;</td><td>&nbsp;</td></tr>`).join("");
  }

  // ── Tabela 2 ──────────────────────────────────────────────
  let linhasT2 = "";
  let grandTotal = 0;

  m2.gradeNova.semestres.forEach((semestre) => {
    const pendentes = semestre.disciplinas.filter(
      (d) => !disciplinasNovCobertas.has(norm(d.nome))
    );
    if (!pendentes.length) return;

    const periodo  = proximoPeriodo();
    let totalBloco = 0;

    linhasT2 += `<tr>
      <td style="width:60%;"><p class="Tabela_Texto_Alinhado_Esquerda">
        <strong>${escapeHTML(String(semestre.numero))}° semestre</strong>
      </p></td>
      <td>&nbsp;</td><td>&nbsp;</td>
    </tr>`;

    pendentes.forEach((d) => {
      totalBloco += d.ch;
      grandTotal += d.ch;
      linhasT2 += `<tr>
        <td><p class="Tabela_Texto_Alinhado_Esquerda">${escapeHTML(d.nome)}</p></td>
        <td><p class="Tabela_Texto_Centralizado">${escapeHTML(periodo)}</p></td>
        <td><p class="Tabela_Texto_Centralizado">${d.ch}</p></td>
      </tr>`;
    });

    linhasT2 += `<tr>
      <td><p class="Tabela_Texto_Alinhado_Esquerda"><strong>TOTAL</strong></p></td>
      <td>&nbsp;</td>
      <td><p class="Tabela_Texto_Centralizado"><strong>${totalBloco}</strong></p></td>
    </tr>
    <tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>`;
  });

  linhasT2 += `<tr>
    <td>&nbsp;</td>
    <td><p class="Tabela_Texto_Centralizado"><strong>TOTAL DO PLANO</strong></p></td>
    <td><p class="Tabela_Texto_Centralizado"><strong>${grandTotal}</strong></p></td>
  </tr>`;

  // ── Itens 3, 4, 5 ─────────────────────────────────────────
  const g           = m2.gradeNova;
  const reqOpt      = g.ch_optativas_exigidas ?? 90;
  const reqExt      = g.ch_extensao_exigida   ?? 435;
  const reqTotal    = g.ch_total_curso        ?? 4045;
  const optACursar  = Math.max(0, reqOpt   - chOPT);
  const totalACursar = Math.max(0, reqTotal - (chAnalisada + chOPT + chNFC));

  return `
<p class="Item_Nivel1" style="font-weight:bold;">Identificação do Acadêmico:</p>
<p class="Texto_Justificado">Nome: ${nomeSeguro}</p>
<p class="Texto_Justificado">RGA na UFMS: ${rgaSeguro}</p>
<p class="Texto_Justificado">Enquadramento (Novo PPC): ${enqSeguro}</p>
<p>&nbsp;</p>

<p class="Item_Nivel1" style="font-weight:bold;">1. Plano de estudos — Semestre atual:</p>
<table style="border-collapse:collapse;margin:0 auto;width:85%;" border="1" cellpadding="5">
  <thead><tr>
    <th style="background:#ccc;"><p class="Tabela_Texto_Centralizado">Disciplinas a serem cursadas no semestre atual</p></th>
    <th style="background:#ccc;"><p class="Tabela_Texto_Centralizado">Indicação da turma prática</p></th>
  </tr></thead>
  <tbody>${linhasT1}</tbody>
</table>
<p>&nbsp;</p>

<p class="Item_Nivel1" style="font-weight:bold;">2. Plano de estudos — Semestres futuros (Novo PPC):</p>
<table style="border-collapse:collapse;margin:0 auto;width:85%;" border="1" cellpadding="5">
  <thead><tr>
    <th style="background:#ccc;width:60%;"><p class="Tabela_Texto_Centralizado">Disciplinas a serem cursadas em semestres posteriores</p></th>
    <th style="background:#ccc;width:20%;"><p class="Tabela_Texto_Centralizado">Indicação do Semestre</p></th>
    <th style="background:#ccc;width:20%;"><p class="Tabela_Texto_Centralizado">Carga horária</p></th>
  </tr></thead>
  <tbody>${linhasT2}</tbody>
</table>
<p>&nbsp;</p>

<p class="Item_Nivel1" style="font-weight:bold;">3. CARGA HORÁRIA DE DISCIPLINAS OPTATIVAS NECESSÁRIAS:</p>
<p class="Texto_Justificado">Carga horária optativa cursada: ${chOPT} horas</p>
<p class="Texto_Justificado">Carga horária optativa a cursar: ${optACursar} horas</p>
<p>&nbsp;</p>

<p class="Item_Nivel1" style="font-weight:bold;">4. CARGA HORÁRIA EM ATIVIDADES DE EXTENSÃO NECESSÁRIAS:</p>
<p class="Texto_Justificado">Carga horária cursada: 0 horas</p>
<p class="Texto_Justificado">Carga horária a cursar: ${reqExt} horas</p>
<p>&nbsp;</p>

<p class="Item_Nivel1" style="font-weight:bold;">5. INTEGRALIZAÇÃO CURRICULAR:</p>
<p class="Texto_Justificado">Total a cursar: ${totalACursar} horas</p>
<p class="Texto_Justificado">Total do plano de estudos: ${grandTotal} horas</p>
<p>&nbsp;</p><p>&nbsp;</p><p>&nbsp;</p>`;
}

/**
 * Processa todos os arquivos da fila em sequência.
 * Usa sleep(0) entre cada arquivo para não congelar a main thread,
 * permitindo que a barra de progresso atualize suavemente.
 */
async function m2ExecutarLote() {
  if (!m2.gradeNova || !m2.equivalencias) {
    showToast("Configure grade e equivalências primeiro.", "err");
    return;
  }

  const btnProcessar   = document.getElementById("m2BtnProcessar");
  const progressBar    = document.getElementById("m2ProgressBar");
  const progressWrap   = document.getElementById("m2ProgressWrap");
  const semestreBase   = document.getElementById("m2Semestre").value.trim() || "2026/1";

  btnProcessar.disabled          = true;
  progressWrap.style.display     = "block";

  let totalOk = 0, totalErro = 0;

  for (let i = 0; i < m2.arquivos.length; i++) {
    const item = m2.arquivos[i];
    try {
      const resultado    = await m2ProcessarExcel(item.file);
      resultado.htmlPlano = m2GerarHTML(resultado, semestreBase);
      item.resultado     = resultado;
      item.status        = "ok";
      totalOk++;
    } catch (_err) {
      item.status = "err";
      totalErro++;
    }

    // Atualiza progresso e re-renderiza lista
    progressBar.style.width = `${((i + 1) / m2.arquivos.length) * 100}%`;
    m2RenderizarListaArquivos();

    // Cede o controle ao navegador por 1 frame (barra de progresso flui suavemente)
    await sleep(0);
  }

  btnProcessar.disabled = false;
  if (totalOk > 0) document.getElementById("m2BtnZip").disabled = false;

  showFeedback(
    "m2FeedbackLote",
    `✅ ${totalOk} plano(s) gerado(s)${totalErro > 0 ? ` · ⚠️ ${totalErro} com erro` : ""}.` +
    (totalOk > 0 ? " Clique em um nome da lista para ver a prévia." : ""),
    totalOk > 0 ? "success" : "error"
  );
  showToast(`${totalOk} plano(s) prontos!`, "ok");
}

/** Gera e baixa o ZIP com todos os documentos Word gerados. */
async function m2BaixarZip() {
  const zip = new JSZip();

  m2.arquivos
    .filter((a) => a.status === "ok")
    .forEach((a) => {
      zip.file(
        `${a.nomeDownload}.doc`,
        "\ufeff" + `<html xmlns:o="urn:schemas-microsoft-com:office:office"
          xmlns:w="urn:schemas-microsoft-com:office:word"
          xmlns="http://www.w3.org/TR/REC-html40">
          <head><meta charset="utf-8"></head>
          <body>${a.resultado.htmlPlano}</body>
        </html>`
      );
    });

  const blob = await zip.generateAsync({ type: "blob" });
  downloadBlob(blob, "Planos_NovoPPC.zip");
  showToast("ZIP baixado com sucesso!", "ok");
}

/**
 * Exibe a prévia do plano de um aluno específico da lista.
 * @param {number} indice
 */
function m2SelecionarAluno(indice) {
  const item = m2.arquivos[indice];
  if (!item || item.status !== "ok") return;

  m2.selecionado = indice;
  const r = item.resultado;

  document.getElementById("m2ResultadoSemestre").textContent = r.enquadramento;
  document.getElementById("m2ResultadoCH").textContent       = `CH analisada: ${r.chAnalisada}h`;
  document.getElementById("m2PreviewBox").innerHTML          = r.htmlPlano;
  document.getElementById("m2SecIndividual").style.display   = "block";
  document.getElementById("m2SecVazio").style.display        = "none";
  document.getElementById("m2SecIndividual").scrollIntoView({ behavior: "smooth", block: "start" });
}

// ═══════════════════════════════════════════════════════════════
// 5. PERSISTÊNCIA — localStorage e fetch dos JSONs padrão
// ═══════════════════════════════════════════════════════════════

/** Tenta carregar e aplicar o JSON de grade do Módulo 1. */
function m1CarregarGrade(grade) {
  m1.dadosDoCurso = grade;
  setBadge("badgeGrade1", "badgeGrade1Nome", grade.curso, "ok");
  m1AtualizarInterface();
}

/** Tenta carregar e aplicar o JSON de grade nova do Módulo 2. */
function m2AplicarGrade(grade) {
  m2.gradeNova = grade;
  setBadge("badgeGrade2", "badgeGrade2Nome", grade.curso, "ok");
  const dropLabel = document.getElementById("m2DropGradeLabel");
  document.getElementById("m2DropGrade").classList.add("loaded");
  if (dropLabel) dropLabel.textContent = `✓ ${grade.curso}`;
}

/** Tenta carregar e aplicar o JSON de equivalências do Módulo 2. */
function m2AplicarEquivalencias(eq) {
  m2.equivalencias = m2ConstruirMapaEquivalencias(eq);
  setBadge("badgeEq", "badgeEqNome", `${eq.equivalencias.length} regras`, "ok");
  const dropLabel = document.getElementById("m2DropEqLabel");
  document.getElementById("m2DropEq").classList.add("loaded");
  if (dropLabel) dropLabel.textContent = `✓ ${eq.equivalencias.length} equivalências`;
}

/** Lê dados persistidos no localStorage e, se ausentes, faz fetch dos arquivos padrão. */
function carregarDadosPersistidos() {
  // ── Módulo 1 ──
  try {
    const salvo = localStorage.getItem("gradeCurso_v4");
    if (salvo) { m1CarregarGrade(JSON.parse(salvo)); }
  } catch (_) { localStorage.removeItem("gradeCurso_v4"); }

  if (!m1.dadosDoCurso) {
    fetch("dados_curso.json")
      .then((r) => r.json())
      .then((grade) => {
        localStorage.setItem("gradeCurso_v4", JSON.stringify(grade));
        m1CarregarGrade(grade);
      })
      .catch(() => {}); // falha silenciosa — usuário pode importar manualmente
  }

  // ── Módulo 2: grade nova ──
  try {
    const salvo = localStorage.getItem("gradeNova_v1");
    if (salvo) { const g = JSON.parse(salvo); m2ValidarGrade(g); m2AplicarGrade(g); }
  } catch (_) { localStorage.removeItem("gradeNova_v1"); }

  if (!m2.gradeNova) {
    fetch("grade_nova.json")
      .then((r) => r.json())
      .then((grade) => {
        m2ValidarGrade(grade);
        localStorage.setItem("gradeNova_v1", JSON.stringify(grade));
        m2AplicarGrade(grade);
        m2VerificarConfigCompleta();
      })
      .catch(() => {});
  }

  // ── Módulo 2: equivalências ──
  try {
    const salvo = localStorage.getItem("equivalencias_v1");
    if (salvo) { const eq = JSON.parse(salvo); m2ValidarEquivalencias(eq); m2AplicarEquivalencias(eq); }
  } catch (_) { localStorage.removeItem("equivalencias_v1"); }

  if (!m2.equivalencias) {
    fetch("equivalencias.json")
      .then((r) => r.json())
      .then((eq) => {
        m2ValidarEquivalencias(eq);
        localStorage.setItem("equivalencias_v1", JSON.stringify(eq));
        m2AplicarEquivalencias(eq);
        m2VerificarConfigCompleta();
      })
      .catch(() => {});
  }

  m2VerificarConfigCompleta();
}

// ═══════════════════════════════════════════════════════════════
// 6. INIT — único ponto de entrada, registra todos os eventos
//    Nenhum onclick= existe no HTML. Tudo é feito aqui.
// ═══════════════════════════════════════════════════════════════

document.addEventListener("DOMContentLoaded", () => {

  carregarDadosPersistidos();

  // ── Navegação: home-cards (teclado + clique) ──────────────
  document.getElementById("cardAproveitamento")
    ?.addEventListener("click", () => abrirModulo("aproveitamento"));
  document.getElementById("cardNovoPPC")
    ?.addEventListener("click", () => abrirModulo("novoppc"));

  document.querySelectorAll(".home-card").forEach((card) => {
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); card.click(); }
    });
  });

  document.querySelectorAll(".module-back").forEach((btn) => {
    btn.addEventListener("click", irHome);
  });

  document.getElementById("brandLink")
    ?.addEventListener("click", irHome);

  // ── M1: drag-and-drop e inputs ───────────────────────────
  configurarDragAndDrop("m1DropHistorico", "m1InputHistorico", m1ProcessarHistorico);
  configurarDragAndDrop("m1DropImportar",  "m1InputImportar",  async (files) => {
    try {
      const grade = await lerJSON(files[0]);
      m1ValidarGrade(grade);
      localStorage.setItem("gradeCurso_v4", JSON.stringify(grade));
      m1CarregarGrade(grade);
      showFeedback("m1FeedbackGrade", `✅ Grade "${escapeHTML(grade.curso)}" importada.`, "success");
      showToast(`Grade importada: ${grade.curso}`, "ok");
    } catch (err) {
      showFeedback("m1FeedbackGrade", `❌ ${escapeHTML(err.message)}`, "error");
    }
  });

  // ── M1: botões e campos ───────────────────────────────────
  document.getElementById("m1BtnCalcular")
    ?.addEventListener("click", m1Calcular);

  document.getElementById("m1CargaHoraria")
    ?.addEventListener("input", () => {
      if (!document.getElementById("m1ResultadoBlock").hidden) m1Calcular();
    });

  document.getElementById("m1ListaAproveitamento")
    ?.addEventListener("change", (e) => {
      if (e.target.classList.contains("m1chk-aprov")) m1Calcular();
    });

  document.getElementById("m1AlunoInfo")
    ?.addEventListener("input", m1AtualizarPreview);

  document.getElementById("m1Semestre")
    ?.addEventListener("input", m1AtualizarPreview);

  document.getElementById("m1BtnCopiarSEI")
    ?.addEventListener("click", () => {
      navigator.clipboard.writeText(m1GerarHTML())
        .then(() => showToast("Código copiado! Cole no SEI via '< >'", "ok"))
        .catch(() => showToast("Erro ao copiar automaticamente.", "err"));
    });

  document.getElementById("m1BtnBaixarWord")
    ?.addEventListener("click", () => {
      const nome = m1.nomeArquivoOriginal
        || document.getElementById("m1AlunoInfo").value.trim().replace(/[<>:"/\\|?*]+/g, "_")
        || "Plano_de_Estudos";
      downloadBlob(gerarWordBlob(m1GerarHTML()), `${nome}.doc`);
    });

  document.getElementById("m1BtnExportar")
    ?.addEventListener("click", () => {
      if (!m1.dadosDoCurso) { showToast("Nenhuma grade carregada.", "err"); return; }
      const nomeCurso = m1.dadosDoCurso.curso.replace(/\s+/g, "_");
      downloadBlob(
        new Blob([JSON.stringify(m1.dadosDoCurso, null, 2)], { type: "application/json" }),
        `grade_${nomeCurso}.json`
      );
    });

  // ── M2: drag-and-drop e inputs ───────────────────────────
  configurarDragAndDrop("m2DropGrade", "m2InputGrade", m2CarregarGrade);
  configurarDragAndDrop("m2DropEq",    "m2InputEq",    m2CarregarEquivalencias);
  configurarDragAndDrop("m2DropBatch", "m2InputBatch", m2AdicionarArquivos);

  // ── M2: lista de arquivos (delegação de eventos) ──────────
  // Em vez de onclick= gerado dinamicamente, usa delegação de evento no container
  document.getElementById("m2FileList")
    ?.addEventListener("click", (e) => {
      const item = e.target.closest(".file-item[data-index]");
      if (!item) return;
      const indice = parseInt(item.dataset.index, 10);
      m2SelecionarAluno(indice);
    });

  // ── M2: botões principais ─────────────────────────────────
  document.getElementById("m2BtnProcessar")
    ?.addEventListener("click", m2ExecutarLote);

  document.getElementById("m2BtnZip")
    ?.addEventListener("click", m2BaixarZip);

  document.getElementById("m2BtnLimpar")
    ?.addEventListener("click", () => {
      m2.arquivos    = [];
      m2.selecionado = null;
      m2RenderizarListaArquivos();
      document.getElementById("m2BtnZip").disabled            = true;
      document.getElementById("m2ProgressWrap").style.display = "none";
      document.getElementById("m2ProgressBar").style.width    = "0%";
      document.getElementById("m2FeedbackLote").hidden        = true;
      document.getElementById("m2SecIndividual").style.display = "none";
      document.getElementById("m2SecVazio").style.display      = "block";
      document.getElementById("m2InputBatch").value           = ""; // permite re-upload do mesmo lote
    });

  document.getElementById("m2BtnCopiarSEI")
    ?.addEventListener("click", () => {
      if (m2.selecionado === null) return;
      navigator.clipboard
        .writeText(m2.arquivos[m2.selecionado].resultado.htmlPlano)
        .then(() => showToast("Código copiado!", "ok"))
        .catch(() => showToast("Erro ao copiar.", "err"));
    });

  document.getElementById("m2BtnBaixarWord")
    ?.addEventListener("click", () => {
      if (m2.selecionado === null) return;
      const item = m2.arquivos[m2.selecionado];
      downloadBlob(gerarWordBlob(item.resultado.htmlPlano), `${item.nomeDownload}.doc`);
    });

  document.getElementById("m2BtnExportGrade")
    ?.addEventListener("click", () => {
      const salvo = localStorage.getItem("gradeNova_v1");
      if (!salvo) { showToast("Nenhuma grade nova carregada.", "err"); return; }
      downloadBlob(new Blob([salvo], { type: "application/json" }), "grade_nova.json");
    });

  document.getElementById("m2BtnExportEq")
    ?.addEventListener("click", () => {
      const salvo = localStorage.getItem("equivalencias_v1");
      if (!salvo) { showToast("Nenhuma equivalência carregada.", "err"); return; }
      downloadBlob(new Blob([salvo], { type: "application/json" }), "equivalencias.json");
    });

}); // fim DOMContentLoaded