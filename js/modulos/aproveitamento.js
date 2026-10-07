/**
 * @file js/modulos/aproveitamento.js
 * @description Módulo 1 — Aproveitamento de Estudos (PPC atual).
 *
 * Todo o código fica dentro de uma IIFE: nada daqui é visível para os outros módulos,
 * e este módulo só usa o que está em js/core (utils, ui). Para alterar o Módulo 1,
 * edite apenas este arquivo.
 */
"use strict";

(function () {

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
    enquadramentoNumero:       1,
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
    validarGradeCurricular(grade);
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
    m1.enquadramentoNumero = calcularEnquadramentoNumero(chEstudante, m1.dadosDoCurso.semestres).numero;

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
    if (box && m1.dadosDoCurso) box.innerHTML = m1GerarHTML();
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

    // ── Planejamento por semestre (pré-requisitos + enquadramento) ──
    const semStr = resolverSemestreBase(document.getElementById("m1Semestre")?.value);
    const plano = planejarEstudos({
      semestres:             m1.dadosDoCurso.semestres,
      concluidas:            new Set(m1.disciplinasAprovadas),
      emCurso:               new Set(m1.disciplinasMatriculadas.map((d) => norm(d.nome))),
      semestreEnquadramento: m1.enquadramentoNumero,
      semestreBase:          semStr,
      respeitarParidade:     document.getElementById("m1Paridade")?.checked ?? true,
    });
    const { linhasT1, linhasT2, grandTotal } = gerarTabelasPlano({
      matriculadas: m1.disciplinasMatriculadas,
      plano,
      semestreBase: semStr,
    });

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
  <p class="Texto_Justificado">Carga horária a cursar: ${Number(reqExt)} horas</p>
  <p>&nbsp;</p>

  <p class="Item_Nivel1" style="font-weight:bold;">5. INTEGRALIZAÇÃO CURRICULAR:</p>
  <p class="Texto_Justificado">Aproveitadas/dispensadas: ${totalAprov} horas</p>
  <p class="Texto_Justificado">A cursar: ${totalACursar} horas</p>
  <p class="Texto_Justificado">Total do plano de estudos: ${grandTotal} horas</p>
  <p>&nbsp;</p><p>&nbsp;</p><p>&nbsp;</p>`;
  }

  /** Tenta carregar e aplicar o JSON de grade do Módulo 1. */
  function m1CarregarGrade(grade) {
    m1.dadosDoCurso = grade;
    setBadge("badgeGrade1", "badgeGrade1Nome", grade.curso, "ok");
    m1AtualizarInterface();
    m1MostrarSituacaoPrerequisitos(grade);
  }

  /**
   * Informa se a grade tem pré-requisitos e aponta nomes que não existem na grade.
   * @param {object} grade
   * @param {string} [prefixoHtml] — mensagem anterior (ex.: "grade importada") exibida junto
   */
  function m1MostrarSituacaoPrerequisitos(grade, prefixoHtml = "") {
    const avisos = avisosPrerequisitos(grade);
    const sep = prefixoHtml ? "<br>" : "";
    if (avisos.length > 0) {
      const lista = avisos.slice(0, 8).map((a) => `• ${escapeHTML(a)}`).join("<br>");
      const resto = avisos.length > 8 ? `<br>… e mais ${avisos.length - 8}.` : "";
      showFeedback("m1FeedbackGrade",
        `${prefixoHtml}${sep}⚠️ Problemas nos pré-requisitos desta grade:<br>${lista}${resto}`, "error");
    } else if (!gradeTemPrerequisitos(grade)) {
      showFeedback("m1FeedbackGrade",
        `${prefixoHtml}${sep}ⓘ Esta grade não tem pré-requisitos (campo "prerequisitos" nas disciplinas do JSON). ` +
        `O plano considerará apenas o enquadramento do aluno.`, prefixoHtml ? "success" : "info");
    } else if (prefixoHtml) {
      showFeedback("m1FeedbackGrade", `${prefixoHtml}${sep}✅ Pré-requisitos carregados.`, "success");
    }
  }

  /** Lê dados persistidos (localStorage) e, se ausentes, busca a grade padrão. */
  function carregarDados() {
    // ── Módulo 1 ──
    try {
      const salvo = localStorage.getItem("gradeCurso_v4");
      if (salvo) { const g = JSON.parse(salvo); m1ValidarGrade(g); m1CarregarGrade(g); }
    } catch (_) { localStorage.removeItem("gradeCurso_v4"); }

    if (!m1.dadosDoCurso) {
      fetch("dados_curso.json")
        .then((r) => r.json())
        .then((grade) => {
          m1ValidarGrade(grade);
          salvarLocal("gradeCurso_v4", JSON.stringify(grade));
          m1CarregarGrade(grade);
        })
        .catch(() => {}); // falha silenciosa — usuário pode importar manualmente
    }
  }

  /** Carrega dados e registra todos os eventos do módulo. */
  function iniciar() {
    carregarDados();

    // ── M1: drag-and-drop e inputs ───────────────────────────
    configurarDragAndDrop("m1DropHistorico", "m1InputHistorico", m1ProcessarHistorico);
    configurarDragAndDrop("m1DropImportar",  "m1InputImportar",  async (files) => {
      try {
        const grade = await lerJSON(files[0]);
        m1ValidarGrade(grade);
        salvarLocal("gradeCurso_v4", JSON.stringify(grade));
        m1CarregarGrade(grade);
        m1MostrarSituacaoPrerequisitos(grade, `✅ Grade "${escapeHTML(grade.curso)}" importada.`);
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

    vincularSemestreBase("m1Semestre", m1AtualizarPreview);
    vincularParidade("m1Paridade", m1AtualizarPreview);

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
  }

  SIGAC.registrarModulo({
    id: "aproveitamento",
    tela: "screenAproveitamento",
    card: "cardAproveitamento",
    badges: ["badgeGrade1"],
    iniciar,
  });

})();
