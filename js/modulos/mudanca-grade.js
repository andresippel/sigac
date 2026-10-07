/**
 * @file js/modulos/mudanca-grade.js
 * @description Módulo 2 — Mudança de Grade / Novo PPC (processamento em lote).
 *
 * Todo o código fica dentro de uma IIFE: nada daqui é visível para os outros módulos,
 * e este módulo só usa o que está em js/core (utils, ui). Para alterar o Módulo 2,
 * edite apenas este arquivo.
 */
"use strict";

(function () {

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

  /** Valida o JSON da grade nova (mesmas regras do Módulo 1, via js/core/plano.js). */
  function m2ValidarGrade(grade) {
    validarGradeCurricular(grade);
  }

  /** Valida o JSON de equivalências: lista de { antiga: texto, novas: [textos] }. */
  function m2ValidarEquivalencias(eq) {
    if (!eq || !Array.isArray(eq.equivalencias)) {
      throw new Error('O arquivo deve ter um campo "equivalencias" do tipo array.');
    }
    eq.equivalencias.forEach((regra, i) => {
      if (!regra || typeof regra !== "object" || typeof regra.antiga !== "string" || !regra.antiga.trim()) {
        throw new Error(`Equivalência ${i + 1}: "antiga" deve ser um texto preenchido.`);
      }
      if (regra.novas !== undefined && !(Array.isArray(regra.novas) && regra.novas.every((n) => typeof n === "string"))) {
        throw new Error(`Equivalência ${i + 1}: "novas" deve ser uma lista de textos.`);
      }
    });
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
      let msg = "✅ Configuração completa. Pode processar os históricos.";
      let tipo = "success";
      const avisos = avisosPrerequisitos(m2.gradeNova);
      if (avisos.length > 0) {
        const lista = avisos.slice(0, 6).map((a) => `• ${escapeHTML(a)}`).join("<br>");
        const resto = avisos.length > 6 ? `<br>… e mais ${avisos.length - 6}.` : "";
        msg += `<br>⚠️ Problemas nos pré-requisitos da grade nova:<br>${lista}${resto}`;
        tipo = "error";
      } else if (!gradeTemPrerequisitos(m2.gradeNova)) {
        msg += `<br>ⓘ A grade nova não tem pré-requisitos (campo "prerequisitos" nas disciplinas do JSON): ` +
               `os planos considerarão apenas o enquadramento do aluno.`;
      }
      showFeedback("m2FeedbackConfig", msg, tipo);
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
      salvarLocal("gradeNova_v1", JSON.stringify(grade));
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
      salvarLocal("equivalencias_v1", JSON.stringify(eq));
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

          const enquadramento       = calcularEnquadramento(chAnalisada, m2.gradeNova.semestres);
          const enquadramentoNumero = calcularEnquadramentoNumero(chAnalisada, m2.gradeNova.semestres).numero;

          // Matrículas atuais (grade antiga) traduzidas para a grade nova pela tabela de equivalências:
          // o aluno já está cursando essas disciplinas, então não entram de novo nos semestres futuros.
          const nomesGradeNova = new Set();
          m2.gradeNova.semestres.forEach((s) => s.disciplinas.forEach((d) => nomesGradeNova.add(norm(d.nome))));
          const emCursoNovas = new Set();
          matriculadas.forEach((m) => {
            const chave = norm(m.nome);
            (m2.equivalencias.get(chave) || (nomesGradeNova.has(chave) ? [chave] : []))
              .forEach((n) => emCursoNovas.add(n));
          });

          resolve({
            nome,
            rga,
            nomeArquivo,
            matriculadas,
            disciplinasNovCobertas,
            emCursoNovas,
            enquadramento,
            enquadramentoNumero,
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
    const { nome, rga, enquadramento, enquadramentoNumero, matriculadas, disciplinasNovCobertas, emCursoNovas, chAnalisada, chOPT, chNFC } = resultado;

    const nomeSeguro = escapeHTML(nome);
    const rgaSeguro  = escapeHTML(rga);
    const enqSeguro  = escapeHTML(enquadramento);

    // ── Planejamento por semestre (pré-requisitos + enquadramento) ──
    const plano = planejarEstudos({
      semestres:             m2.gradeNova.semestres,
      concluidas:            disciplinasNovCobertas,
      emCurso:               emCursoNovas,
      semestreEnquadramento: enquadramentoNumero,
      semestreBase,
      respeitarParidade:     document.getElementById("m2Paridade")?.checked ?? true,
    });
    const { linhasT1, linhasT2, grandTotal } = gerarTabelasPlano({ matriculadas, plano, semestreBase });

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
  <p class="Texto_Justificado">Carga horária a cursar: ${Number(reqExt)} horas</p>
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
    const semestreBase   = resolverSemestreBase(document.getElementById("m2Semestre").value);

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

  /** Lê dados persistidos (localStorage) e, se ausentes, busca grade nova e equivalências padrão. */
  function carregarDados() {
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
          salvarLocal("gradeNova_v1", JSON.stringify(grade));
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
          salvarLocal("equivalencias_v1", JSON.stringify(eq));
          m2AplicarEquivalencias(eq);
          m2VerificarConfigCompleta();
        })
        .catch(() => {});
    }

    m2VerificarConfigCompleta();
  }

  /** Carrega dados e registra todos os eventos do módulo. */
  function iniciar() {
    carregarDados();
    vincularSemestreBase("m2Semestre");
    vincularParidade("m2Paridade");

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
  }

  SIGAC.registrarModulo({
    id: "novoppc",
    tela: "screenNovoPPC",
    card: "cardNovoPPC",
    badges: ["badgeGrade2", "badgeEq"],
    iniciar,
  });

})();
