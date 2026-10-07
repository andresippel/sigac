/**
 * @file js/modulos/horario/init.js
 * @description Módulo 3 — Horário de Aulas: registro de eventos do módulo e registro na navegação.
 *
 * Os arquivos de js/modulos/horario/ formam UM módulo dividido por responsabilidade e
 * compartilham escopo (tudo prefixado com m3/M3_). Não dependem dos Módulos 1 e 2.
 */
"use strict";

/** Carrega o banco e registra todos os eventos do módulo. */
function m3Init() {
  m3Carregar();

  // ── M3: navegação por abas ─────────────────────────────────
  document.getElementById("m3Tabs")?.addEventListener("click", (e) => {
    const btn = e.target.closest(".m3-tab[data-m3tab]");
    if (!btn) return;
    document.querySelectorAll("#m3Tabs .m3-tab").forEach((b) => b.classList.toggle("active", b === btn));
    const alvo = M3_PANEL_POR_TAB[btn.dataset.m3tab];
    document.querySelectorAll(".m3-panel").forEach((p) => p.classList.toggle("active", p.id === alvo));
    if (btn.dataset.m3tab === "grade") { m3RenderGradeSemestreTabs(); m3RenderGradeSidebar(); m3RenderGradeGrid(); }
    if (btn.dataset.m3tab === "turmas") { m3RenderTurmasSidebar(); m3RenderTurmasContent(); }
    if (btn.dataset.m3tab === "ensalamento") m3RenderEnsalamento();
    if (btn.dataset.m3tab === "atribuir") { m3RenderAtribuirSidebar(); m3RenderAtribuirContent(); }
    if (btn.dataset.m3tab === "periodo") m3RenderPeriodos();
  });

  document.getElementById("m3SubTabs")?.addEventListener("click", (e) => {
    const btn = e.target.closest(".m3-tab[data-m3sub]");
    if (!btn) return;
    document.querySelectorAll("#m3SubTabs .m3-tab").forEach((b) => b.classList.toggle("active", b === btn));
    const alvo = M3_SUBPANEL_POR_TAB[btn.dataset.m3sub];
    document.querySelectorAll("#m3PanelCadastro .m3-subpanel").forEach((p) => p.classList.toggle("active", p.id === alvo));
  });

  // ── M3: Cadastro — adicionar disciplina/professor/sala ────
  document.getElementById("m3BtnAddDisciplina")?.addEventListener("click", () => {
    const nomeEl = document.getElementById("m3DiscNome");
    const nome = nomeEl.value.trim();
    if (!nome) return;
    m3.db.disciplinas.push({
      id: crypto.randomUUID(),
      nome,
      sigla: nome.slice(0, 8),
      semestreCurricular: Number(document.getElementById("m3DiscSemestre").value),
      chTotal: Number(document.getElementById("m3DiscCH").value) || 0,
      aulasTeoricasSemana: 0,
      aulasPraticasSemana: 0,
      optativa: document.getElementById("m3DiscOptativa").checked || undefined
    });
    m3Salvar();
    nomeEl.value = "";
    document.getElementById("m3DiscOptativa").checked = false;
    m3RenderDisciplinas();
    m3RenderGradeSidebar();
    showToast("Disciplina adicionada.", "ok");
    nomeEl.focus();
  });
  document.getElementById("m3DiscNome")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); document.getElementById("m3BtnAddDisciplina").click(); }
  });

  document.getElementById("m3BtnAddProfessor")?.addEventListener("click", () => {
    const nomeEl = document.getElementById("m3ProfNome");
    const nome = nomeEl.value.trim();
    if (!nome) return;
    m3.db.professores.push({ id: crypto.randomUUID(), nome, observacao: document.getElementById("m3ProfObs").value.trim() || undefined });
    m3Salvar();
    nomeEl.value = "";
    document.getElementById("m3ProfObs").value = "";
    m3RenderProfessores();
    showToast("Professor adicionado.", "ok");
    nomeEl.focus();
  });
  ["m3ProfNome", "m3ProfObs"].forEach((id) => document.getElementById(id)?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); document.getElementById("m3BtnAddProfessor").click(); }
  }));

  document.getElementById("m3BtnAddSala")?.addEventListener("click", () => {
    const nomeEl = document.getElementById("m3SalaNome");
    const nome = nomeEl.value.trim();
    if (!nome) return;
    m3.db.salas.push({ id: crypto.randomUUID(), nome, tipo: document.getElementById("m3SalaTipo").value.trim() || undefined });
    m3Salvar();
    nomeEl.value = "";
    document.getElementById("m3SalaTipo").value = "";
    m3RenderSalas();
    showToast("Sala adicionada.", "ok");
    nomeEl.focus();
  });
  ["m3SalaNome", "m3SalaTipo"].forEach((id) => document.getElementById(id)?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); document.getElementById("m3BtnAddSala").click(); }
  }));

  // ── M3: Cadastro — edição inline e exclusão (delegação) ───
  document.getElementById("m3PanelCadastro")?.addEventListener("change", (e) => {
    const el = e.target;
    if (!el.classList.contains("m3-edit") && !el.classList.contains("m3-edit-check")) return;
    const tr = el.closest("tr[data-id]");
    if (!tr) return;
    const colecao = el.dataset.colecao;
    const campo = el.dataset.campo;
    const id = tr.dataset.id;
    let valor;
    if (el.type === "checkbox") valor = el.checked || undefined;
    else if (el.type === "number") valor = el.value === "" ? undefined : Number(el.value);
    else valor = el.value;
    const item = m3.db[colecao].find((x) => x.id === id);
    if (!item) return;
    item[campo] = valor;
    m3Salvar();
    if (colecao === "disciplinas" && (campo === "semestreCurricular" || campo === "optativa" || campo === "nome" || campo === "sigla")) {
      m3RenderDisciplinas();
      m3RenderGradeSidebar();
      m3RenderGradeSemestreTabs();
    }
  });
  document.getElementById("m3PanelCadastro")?.addEventListener("click", (e) => {
    const btn = e.target.closest(".m3-del");
    if (!btn) return;
    m3ExcluirComCascata(btn.dataset.colecao, btn.closest("tr[data-id]").dataset.id);
  });

  // ── M3: Período Letivo ─────────────────────────────────────
  document.getElementById("m3BtnAddPeriodo")?.addEventListener("click", () => {
    const nomeEl = document.getElementById("m3PeriodoNome");
    const nome = nomeEl.value.trim();
    if (!nome) return;
    const periodo = { id: crypto.randomUUID(), nome, tipoSemestre: document.getElementById("m3PeriodoTipo").value, horarios: m3HorariosPadrao() };
    m3.db.periodosLetivos.push(periodo);
    if (!m3.periodoAtualId) m3DefinirPeriodoAtivo(periodo.id);
    m3Salvar();
    nomeEl.value = "";
    m3RenderPeriodos();
    m3AtualizarBadgePeriodo();
    m3RenderTurmasContent();
    showToast("Período criado.", "ok");
    nomeEl.focus();
  });
  document.getElementById("m3PeriodoNome")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); document.getElementById("m3BtnAddPeriodo").click(); }
  });
  document.getElementById("m3ListaPeriodos")?.addEventListener("click", (e) => {
    const del = e.target.closest(".m3-del-periodo");
    if (del) { m3ExcluirComCascata("periodosLetivos", del.dataset.id); m3RenderTurmasContent(); return; }
    const item = e.target.closest(".m3-disc-item[data-id]");
    if (!item) return;
    m3DefinirPeriodoAtivo(item.dataset.id);
    m3.gradeAbaChave = null;
    m3Salvar();
    m3RenderPeriodos();
    m3AtualizarBadgePeriodo();
    m3RenderTurmasContent();
    m3RenderGradeSemestreTabs();
    m3RenderGradeSidebar();
    m3RenderGradeGrid();
    m3RenderEnsalamento();
    m3RenderAtribuirContent();
    showToast(`Período ativo: ${item.querySelector("strong")?.textContent || ""}`, "ok");
  });

  // ── M3: Turmas ─────────────────────────────────────────────
  document.getElementById("m3TurmasBusca")?.addEventListener("input", m3RenderTurmasSidebar);
  document.getElementById("m3TurmasSidebarLista")?.addEventListener("click", (e) => {
    const item = e.target.closest(".m3-disc-item[data-id]");
    if (!item) return;
    m3.turmasDisciplinaId = item.dataset.id;
    m3RenderTurmasSidebar();
    m3RenderTurmasContent();
  });
  document.getElementById("m3TurmasContent")?.addEventListener("click", (e) => {
    const criar = e.target.closest(".m3-criar-turma");
    if (criar) {
      if (!m3.periodoAtualId) { showToast("Crie e selecione um período letivo primeiro.", "err"); return; }
      const tipo = criar.dataset.tipo;
      const inputId = tipo === "T" ? "m3NovoCodigoT" : "m3NovoCodigoP";
      const input = document.getElementById(inputId);
      const codigo = input.value.trim();
      if (!codigo) return;
      m3CriarTurmaBase(m3.periodoAtualId, m3.turmasDisciplinaId, tipo, codigo);
      m3RenderTurmasContent();
      m3RenderGradeSidebar();
      showToast("Turma criada.", "ok");
      return;
    }
    const del = e.target.closest(".m3-del-turma");
    if (del) { m3ExcluirComCascata("turmas", del.dataset.id); m3RenderGradeSidebar(); m3RenderGradeGrid(); }
  });
  ["m3NovoCodigoT", "m3NovoCodigoP"].forEach((id) => {
    document.getElementById("m3TurmasContent")?.addEventListener("keydown", (e) => {
      if (e.target.id !== id || e.key !== "Enter") return;
      e.preventDefault();
      const tipo = id === "m3NovoCodigoT" ? "T" : "P";
      document.querySelector(`.m3-criar-turma[data-tipo="${tipo}"]`)?.click();
    });
  });

  // ── M3: Ensalamento (interativo) ────────────────────────────
  document.getElementById("m3EnsalamentoWrap")?.addEventListener("click", (e) => {
    const chip = e.target.closest(".m3-ens-editar");
    if (chip) { m3AbrirModalAula({ modo: "editar", aulaId: chip.dataset.aulaId }); return; }
    const novaBtn = e.target.closest(".m3-ens-nova");
    if (novaBtn) {
      if (!m3.periodoAtualId) { showToast("Crie e selecione um período letivo primeiro.", "err"); return; }
      m3AbrirModalAula({ modo: "novaPorSala", salaId: novaBtn.dataset.salaId, diaSemana: Number(novaBtn.dataset.dia), turno: novaBtn.dataset.turno });
    }
  });

  // ── M3: Atribuir Professores ────────────────────────────────
  document.getElementById("m3AtribuirBusca")?.addEventListener("input", m3RenderAtribuirSidebar);
  document.getElementById("m3AtribuirSidebarLista")?.addEventListener("click", (e) => {
    const item = e.target.closest(".m3-disc-item[data-id]");
    if (!item) return;
    m3.atribuirDisciplinaId = item.dataset.id;
    m3RenderAtribuirSidebar();
    m3RenderAtribuirContent();
  });
  document.getElementById("m3AtribuirContent")?.addEventListener("click", (e) => {
    const addBtn = e.target.closest(".m3-atrib-add-prof");
    if (addBtn) {
      const select = addBtn.closest("td").querySelector(".m3-atrib-select-add");
      if (select.value) m3AdicionarProfessorAula(addBtn.dataset.aulaId, select.value);
      return;
    }
    const delBtn = e.target.closest(".m3-atrib-del-prof");
    if (delBtn) { m3RemoverProfessorAula(delBtn.dataset.aulaId, delBtn.dataset.professorId); return; }
    const aplicarBtn = e.target.closest(".m3-atrib-aplicar-turma");
    if (aplicarBtn) {
      const select = aplicarBtn.closest(".fields-row").querySelector(".m3-atrib-select-turma");
      if (select.value) m3AplicarProfessorATurma(aplicarBtn.dataset.turmaId, select.value);
      return;
    }
    const criarSubBtn = e.target.closest(".m3-sub-criar");
    if (criarSubBtn) { m3CriarSubgrupo(criarSubBtn.dataset.turmaId); return; }
    const delSubBtn = e.target.closest(".m3-sub-del");
    if (delSubBtn) { m3ExcluirSubgrupo(delSubBtn.dataset.subgrupoId); return; }
  });
  document.getElementById("m3AtribuirContent")?.addEventListener("change", (e) => {
    const sel = e.target.closest(".m3-sub-select-prof");
    if (sel) m3DefinirProfessorSubgrupo(sel.dataset.subgrupoId, sel.dataset.aulaId, sel.value || null);
  });

  // ── M3: Grade de Horários ──────────────────────────────────
  document.getElementById("m3GradeBusca")?.addEventListener("input", m3RenderGradeSidebar);
  document.getElementById("m3GradeSemestreTabs")?.addEventListener("click", (e) => {
    const btn = e.target.closest(".m3-tab[data-grade-aba]");
    if (!btn) return;
    m3.gradeAbaChave = btn.dataset.gradeAba;
    m3RenderGradeSemestreTabs();
    m3RenderGradeSidebar();
    m3RenderGradeGrid();
  });
  document.getElementById("m3GradeSidebarLista")?.addEventListener("dragstart", (e) => {
    const chip = e.target.closest(".turma-chip[data-turma-id]");
    if (!chip) return;
    e.dataTransfer.setData("text/plain", JSON.stringify({ tipo: "turma", turmaId: chip.dataset.turmaId }));
  });

  const m3GridWrap = document.getElementById("m3GradeGridWrap");
  m3GridWrap?.addEventListener("dragstart", (e) => {
    const chip = e.target.closest(".aula-chip[data-aula-id]");
    if (!chip) return;
    e.dataTransfer.setData("text/plain", JSON.stringify({ tipo: "aula", aulaId: chip.dataset.aulaId }));
  });
  m3GridWrap?.addEventListener("dragover", (e) => {
    const cell = e.target.closest(".dia-col");
    if (!cell) return;
    e.preventDefault();
    cell.classList.add("drop-hover");
  });
  m3GridWrap?.addEventListener("dragleave", (e) => {
    const cell = e.target.closest(".dia-col");
    if (cell) cell.classList.remove("drop-hover");
  });
  m3GridWrap?.addEventListener("drop", (e) => {
    const cell = e.target.closest(".dia-col");
    if (!cell) return;
    e.preventDefault();
    cell.classList.remove("drop-hover");
    let dados;
    try { dados = JSON.parse(e.dataTransfer.getData("text/plain")); } catch (_) { return; }
    const horarioId = cell.dataset.horarioId;
    const dia = Number(cell.dataset.dia);
    if (!m3.periodoAtualId) return;
    if (dados.tipo === "turma") m3AbrirModalAula({ modo: "nova", turmaId: dados.turmaId, diaSemana: dia, horarioId });
    else if (dados.tipo === "aula") m3MoverAula(dados.aulaId, dia, horarioId);
  });
  m3GridWrap?.addEventListener("click", (e) => {
    const chip = e.target.closest(".aula-chip[data-aula-id]");
    if (!chip) return;
    m3AbrirModalAula({ modo: "editar", aulaId: chip.dataset.aulaId });
  });

  // ── M3: Modal Nova/Editar aula ─────────────────────────────
  document.getElementById("m3ModalBtnSalvar")?.addEventListener("click", m3SalvarModalAula);
  document.getElementById("m3ModalBtnExcluir")?.addEventListener("click", () => {
    if (confirm("Excluir esta aula da grade?")) m3ExcluirAulaModal();
  });
  document.getElementById("m3ModalBtnCancelar")?.addEventListener("click", m3FecharModalAula);
  document.getElementById("m3ModalBtnDividir")?.addEventListener("click", m3DividirAulaModal);
  document.getElementById("m3ModalDuracaoParte1")?.addEventListener("input", m3AtualizarLabelParte2);
  document.getElementById("m3ModalAula")?.addEventListener("click", (e) => {
    if (e.target.id === "m3ModalAula") m3FecharModalAula();
  });
  document.getElementById("m3ModalBtnAddSala2")?.addEventListener("click", () => m3ToggleModalSala2(true));
  document.getElementById("m3ModalBtnRemoveSala2")?.addEventListener("click", () => m3ToggleModalSala2(false));
  document.getElementById("m3ModalSala")?.addEventListener("input", () => m3AtualizarHintSala("m3ModalSala", "m3ModalSalaHint"));
  document.getElementById("m3ModalSala2")?.addEventListener("input", () => m3AtualizarHintSala("m3ModalSala2", "m3ModalSala2Hint"));
  document.getElementById("m3ModalBtnAddProfessor")?.addEventListener("click", () => {
    const sel = document.getElementById("m3ModalProfessorAdd");
    if (!sel.value) return;
    m3.modalProfessorIds.push(sel.value);
    m3RenderModalProfessoresChips();
  });
  document.getElementById("m3ModalProfessoresChips")?.addEventListener("click", (e) => {
    const btn = e.target.closest(".m3-modal-del-prof");
    if (!btn) return;
    m3.modalProfessorIds = m3.modalProfessorIds.filter((pid) => pid !== btn.dataset.id);
    m3RenderModalProfessoresChips();
  });

  // ── M3: Relatórios ─────────────────────────────────────────
  document.getElementById("m3BtnPdfHorario")?.addEventListener("click", m3ExportarPdfHorario);
  document.getElementById("m3BtnPdfEnsalamento")?.addEventListener("click", m3ExportarPdfEnsalamento);
  document.getElementById("m3BtnDocxHorario")?.addEventListener("click", m3ExportarDocxHorario);
  document.getElementById("m3BtnDocxEnsalamento")?.addEventListener("click", m3ExportarDocxEnsalamento);
  document.getElementById("m3BtnXlsxDistribuicao")?.addEventListener("click", m3ExportarXlsxDistribuicao);
  document.getElementById("m3BtnXlsxCargaHoraria")?.addEventListener("click", m3ExportarXlsxCargaHoraria);

  // ── M3: Dados (backup) ─────────────────────────────────────
  document.getElementById("m3BtnExportarDados")?.addEventListener("click", m3ExportarBackup);
  document.getElementById("m3InputImportarDados")?.addEventListener("change", (e) => {
    if (e.target.files.length) m3ImportarBackup(e.target.files);
    e.target.value = "";
  });
  document.getElementById("m3BtnResetarDados")?.addEventListener("click", m3ResetarDados);
}

SIGAC.registrarModulo({
  id: "horario",
  tela: "screenHorario",
  card: "cardHorario",
  badges: ["badgePeriodo"],
  iniciar: m3Init,
  aoAbrir: m3RenderTudo,
});
