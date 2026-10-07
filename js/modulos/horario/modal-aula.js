/**
 * @file js/modulos/horario/modal-aula.js
 * @description Módulo 3 — Horário de Aulas: modal de criar/editar aula (inclui dividir aula).
 *
 * Os arquivos de js/modulos/horario/ formam UM módulo dividido por responsabilidade e
 * compartilham escopo (tudo prefixado com m3/M3_). Não dependem dos Módulos 1 e 2.
 */
"use strict";

// ─── Modal — Nova/Editar aula ──

function m3PopularSelectsModal() {
  document.getElementById("m3SalasDatalist").innerHTML =
    m3.db.salas.slice().sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")).map((s) => `<option value="${escapeHTML(s.nome)}">`).join("");
  m3RenderModalProfessorSelect();
}

/** Resolve o texto digitado no campo de sala (combobox livre) contra o cadastro: nome exato -> salaId; senão -> salaExternaNome (fora do cadastro, apenas informativa). */
function m3ResolverSala(texto) {
  const trimmed = (texto || "").trim();
  if (!trimmed) return { salaId: undefined, salaExternaNome: undefined };
  const match = m3.db.salas.find((s) => s.nome.toLowerCase() === trimmed.toLowerCase());
  return match ? { salaId: match.id, salaExternaNome: undefined } : { salaId: undefined, salaExternaNome: trimmed };
}

/** Mostra/esconde a dica de "sala externa" conforme o texto digitado bate (ou não) com uma sala cadastrada. */
function m3AtualizarHintSala(inputId, hintId) {
  const texto = document.getElementById(inputId).value.trim();
  const hint = document.getElementById(hintId);
  hint.hidden = !texto || m3.db.salas.some((s) => s.nome.toLowerCase() === texto.toLowerCase());
}

/** Popula o <select> de turma (modo "novaPorSala", aberto a partir do Ensalamento), ordenado por sigla da disciplina. */
function m3PopularSelectTurmaModal(periodo) {
  const sel = document.getElementById("m3ModalTurma");
  const disciplinaById = new Map(m3.db.disciplinas.map((d) => [d.id, d]));
  const turmas = m3.db.turmas.filter((t) => t.periodoLetivoId === periodo.id).slice().sort((a, b) => {
    const da = disciplinaById.get(a.disciplinaId)?.sigla || "";
    const db_ = disciplinaById.get(b.disciplinaId)?.sigla || "";
    return da.localeCompare(db_, "pt-BR") || a.codigo.localeCompare(b.codigo, "pt-BR", { numeric: true });
  });
  sel.innerHTML = '<option value="">Selecione...</option>' +
    turmas.map((t) => `<option value="${escapeHTML(t.id)}">${escapeHTML(disciplinaById.get(t.disciplinaId)?.sigla || "?")} — ${escapeHTML(t.codigo)}</option>`).join("");
}

/** Popula o <select> de horário com os horários do turno informado (modo "novaPorSala"). */
function m3PopularSelectHorarioModal(periodo, turno) {
  const sel = document.getElementById("m3ModalHorario");
  const horarios = m3HorariosOrdenados(periodo.id).filter((h) => h.turno === turno);
  sel.innerHTML = '<option value="">Selecione...</option>' +
    horarios.map((h) => `<option value="${escapeHTML(h.id)}">${escapeHTML(h.inicio)}-${escapeHTML(h.fim)}</option>`).join("");
}

/** Repopula o <select> de "adicionar professor", excluindo quem já está na lista. */
function m3RenderModalProfessorSelect() {
  const sel = document.getElementById("m3ModalProfessorAdd");
  const disponiveis = m3.db.professores.filter((p) => !m3.modalProfessorIds.includes(p.id));
  sel.innerHTML = '<option value="">Selecione...</option>' +
    disponiveis.slice().sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")).map((p) => `<option value="${escapeHTML(p.id)}">${escapeHTML(p.nome)}</option>`).join("");
}

function m3RenderModalProfessoresChips() {
  const cont = document.getElementById("m3ModalProfessoresChips");
  const professorById = new Map(m3.db.professores.map((p) => [p.id, p]));
  if (m3.modalProfessorIds.length === 0) {
    cont.innerHTML = '<p class="empty-state" style="font-size:12px">Nenhum professor atribuído.</p>';
  } else {
    cont.innerHTML = m3.modalProfessorIds.map((pid) => `
      <span class="turma-chip" data-professor-id="${escapeHTML(pid)}">${escapeHTML(professorById.get(pid)?.nome || "?")}
        <button type="button" class="m3-chip-remove m3-modal-del-prof" data-id="${escapeHTML(pid)}" title="Remover">✕</button>
      </span>`).join("");
  }
  m3RenderModalProfessorSelect();
}

function m3ToggleModalSala2(mostrar) {
  document.getElementById("m3ModalGrupoSala2").hidden = !mostrar;
  document.getElementById("m3ModalBtnAddSala2").hidden = mostrar;
  if (!mostrar) {
    document.getElementById("m3ModalSala2").value = "";
    document.getElementById("m3ModalSala2Hint").hidden = true;
  }
}

function m3AbrirModalAula(ctx) {
  m3.modalContexto = ctx;
  const periodo = m3.db.periodosLetivos.find((p) => p.id === m3.periodoAtualId);
  document.getElementById("m3ModalErro").hidden = true;
  document.getElementById("m3ModalGrupoTurma").hidden = ctx.modo !== "novaPorSala";
  document.getElementById("m3ModalGrupoHorario").hidden = ctx.modo !== "novaPorSala";
  document.getElementById("m3ModalDividirBloco").hidden = true;
  document.getElementById("m3ModalErroDivisao").hidden = true;

  if (ctx.modo === "novaPorSala") {
    const sala = m3.db.salas.find((s) => s.id === ctx.salaId);
    document.getElementById("m3ModalTitulo").textContent = "Nova aula";
    document.getElementById("m3ModalContexto").textContent = `${sala ? sala.nome : ""} · ${M3_LABEL_DIA[ctx.diaSemana]} ${M3_LABEL_TURNO[ctx.turno]}`;
    m3.modalProfessorIds = [];
    m3PopularSelectsModal();
    m3PopularSelectTurmaModal(periodo);
    m3PopularSelectHorarioModal(periodo, ctx.turno);
    document.getElementById("m3ModalTurma").value = "";
    document.getElementById("m3ModalHorario").value = "";
    document.getElementById("m3ModalSala").value = sala ? sala.nome : "";
    m3AtualizarHintSala("m3ModalSala", "m3ModalSalaHint");
    m3ToggleModalSala2(false);
    document.getElementById("m3ModalDuracao").value = 1;
    document.getElementById("m3ModalBtnExcluir").hidden = true;
  } else if (ctx.modo === "nova") {
    const turma = m3.db.turmas.find((t) => t.id === ctx.turmaId);
    const disciplina = turma ? m3.db.disciplinas.find((d) => d.id === turma.disciplinaId) : null;
    const horario = periodo.horarios.find((h) => h.id === ctx.horarioId);
    document.getElementById("m3ModalTitulo").textContent = "Nova aula";
    document.getElementById("m3ModalContexto").textContent =
      `${disciplina ? disciplina.sigla : ""} — ${turma ? turma.codigo : ""} · ${M3_LABEL_DIA[ctx.diaSemana]} ${horario ? horario.inicio + "-" + horario.fim : ""}`;
    m3.modalProfessorIds = [];
    m3PopularSelectsModal();
    document.getElementById("m3ModalSala").value = "";
    m3AtualizarHintSala("m3ModalSala", "m3ModalSalaHint");
    m3ToggleModalSala2(false);
    const base = turma && disciplina ? (turma.tipoBase === "T" ? disciplina.aulasTeoricasSemana : disciplina.aulasPraticasSemana) : 1;
    document.getElementById("m3ModalDuracao").value = Math.max(1, Math.min(base || 1, 4));
    document.getElementById("m3ModalBtnExcluir").hidden = true;
  } else {
    const aula = m3.db.aulas.find((a) => a.id === ctx.aulaId);
    const turma = aula ? m3.db.turmas.find((t) => t.id === aula.turmaId) : null;
    const disciplina = turma ? m3.db.disciplinas.find((d) => d.id === turma.disciplinaId) : null;
    const horario = periodo.horarios.find((h) => h.id === aula.horarioId);
    document.getElementById("m3ModalTitulo").textContent = "Editar aula";
    document.getElementById("m3ModalContexto").textContent =
      `${disciplina ? disciplina.sigla : ""} — ${turma ? turma.codigo : ""} · ${M3_LABEL_DIA[aula.diaSemana]} ${horario ? horario.inicio + "-" + horario.fim : ""}`;
    m3.modalProfessorIds = [...(aula.professorIds || [])];
    m3PopularSelectsModal();
    const salaById = new Map(m3.db.salas.map((s) => [s.id, s]));
    document.getElementById("m3ModalSala").value = aula.salaId ? (salaById.get(aula.salaId)?.nome || "") : (aula.salaExternaNome || "");
    m3AtualizarHintSala("m3ModalSala", "m3ModalSalaHint");
    m3ToggleModalSala2(Boolean(aula.salaId2 || aula.salaExternaNome2));
    document.getElementById("m3ModalSala2").value = aula.salaId2 ? (salaById.get(aula.salaId2)?.nome || "") : (aula.salaExternaNome2 || "");
    m3AtualizarHintSala("m3ModalSala2", "m3ModalSala2Hint");
    document.getElementById("m3ModalDuracao").value = aula.duracaoSlots;
    document.getElementById("m3ModalBtnExcluir").hidden = false;

    const podeDividir = aula.duracaoSlots > 1;
    document.getElementById("m3ModalDividirBloco").hidden = !podeDividir;
    if (podeDividir) {
      const parte1El = document.getElementById("m3ModalDuracaoParte1");
      parte1El.max = aula.duracaoSlots - 1;
      parte1El.value = Math.max(1, Math.floor(aula.duracaoSlots / 2));
      m3AtualizarLabelParte2();
    }
  }
  m3RenderModalProfessoresChips();
  document.getElementById("m3ModalAula").hidden = false;
}

function m3FecharModalAula() {
  document.getElementById("m3ModalAula").hidden = true;
  m3.modalContexto = null;
  m3.modalProfessorIds = [];
}

function m3MostrarErroModal(msg) {
  const el = document.getElementById("m3ModalErro");
  el.textContent = msg;
  el.hidden = false;
}

function m3SalvarModalAula() {
  const ctx = m3.modalContexto;
  if (!ctx) return;
  const { salaId, salaExternaNome } = m3ResolverSala(document.getElementById("m3ModalSala").value);
  const sala2Texto = document.getElementById("m3ModalGrupoSala2").hidden ? "" : document.getElementById("m3ModalSala2").value;
  const { salaId: salaId2, salaExternaNome: salaExternaNome2 } = m3ResolverSala(sala2Texto);
  const professorIds = [...m3.modalProfessorIds];
  const duracaoSlots = Math.max(1, Math.min(4, Number(document.getElementById("m3ModalDuracao").value) || 1));

  if (ctx.modo === "novaPorSala") {
    const turmaId = document.getElementById("m3ModalTurma").value;
    const horarioId = document.getElementById("m3ModalHorario").value;
    if (!turmaId || !horarioId) { m3MostrarErroModal("Selecione a turma e o horário."); return; }
    const candidata = { periodoLetivoId: m3.periodoAtualId, turmaId, salaId, salaExternaNome, salaId2, salaExternaNome2, professorIds, diaSemana: ctx.diaSemana, horarioId, duracaoSlots };
    const conflitos = m3CheckConflitos(candidata);
    if (conflitos.length > 0) { m3MostrarErroModal(conflitos[0].mensagem); return; }
    m3.db.aulas.push({ ...candidata, id: crypto.randomUUID() });
  } else if (ctx.modo === "nova") {
    const candidata = { periodoLetivoId: m3.periodoAtualId, turmaId: ctx.turmaId, salaId, salaExternaNome, salaId2, salaExternaNome2, professorIds, diaSemana: ctx.diaSemana, horarioId: ctx.horarioId, duracaoSlots };
    const conflitos = m3CheckConflitos(candidata);
    if (conflitos.length > 0) { m3MostrarErroModal(conflitos[0].mensagem); return; }
    m3.db.aulas.push({ ...candidata, id: crypto.randomUUID() });
  } else {
    const aula = m3.db.aulas.find((a) => a.id === ctx.aulaId);
    const candidata = { ...aula, salaId, salaExternaNome, salaId2, salaExternaNome2, professorIds, duracaoSlots };
    const conflitos = m3CheckConflitos(candidata);
    if (conflitos.length > 0) { m3MostrarErroModal(conflitos[0].mensagem); return; }
    Object.assign(aula, { salaId, salaExternaNome, salaId2, salaExternaNome2, professorIds, duracaoSlots });
  }
  m3Salvar();
  m3FecharModalAula();
  m3RenderGradeGrid();
  m3RenderEnsalamento();
  showToast("Aula salva.", "ok");
}

function m3ExcluirAulaModal() {
  const ctx = m3.modalContexto;
  if (!ctx || ctx.modo !== "editar") return;
  m3.db.aulas = m3.db.aulas.filter((a) => a.id !== ctx.aulaId);
  m3RemoverAulaDosSubgrupos(ctx.aulaId);
  m3Salvar();
  m3FecharModalAula();
  m3RenderGradeGrid();
  m3RenderEnsalamento();
  m3RenderAtribuirContent();
  showToast("Aula excluída.", "ok");
}

/** Atualiza o texto "2ª parte fica com Xh" conforme a duração da 1ª parte digitada. */
function m3AtualizarLabelParte2() {
  const ctx = m3.modalContexto;
  if (!ctx || ctx.modo !== "editar") return;
  const aula = m3.db.aulas.find((a) => a.id === ctx.aulaId);
  if (!aula) return;
  const parte1 = Number(document.getElementById("m3ModalDuracaoParte1").value) || 1;
  document.getElementById("m3ModalDividirParte2Label").textContent = `2ª parte fica com ${Math.max(0, aula.duracaoSlots - parte1)} hora(s)`;
}

function m3MostrarErroDivisao(msg) {
  const el = document.getElementById("m3ModalErroDivisao");
  el.textContent = msg;
  el.hidden = false;
}

/** Divide um encontro de várias horas em dois blocos independentes (ex: 2h para um professor, 2h para outro). */
function m3DividirAulaModal() {
  const ctx = m3.modalContexto;
  if (!ctx || ctx.modo !== "editar") return;
  const aula = m3.db.aulas.find((a) => a.id === ctx.aulaId);
  if (!aula || aula.duracaoSlots <= 1) return;
  document.getElementById("m3ModalErroDivisao").hidden = true;

  const duracaoOriginal = aula.duracaoSlots;
  const parte1 = Math.max(1, Math.min(duracaoOriginal - 1, Number(document.getElementById("m3ModalDuracaoParte1").value) || 1));
  const horarios = m3HorariosOrdenados(aula.periodoLetivoId);
  const idxAtual = horarios.findIndex((h) => h.id === aula.horarioId);
  if (idxAtual < 0) { m3MostrarErroDivisao("O horário desta aula não existe mais no período. Edite a aula antes de dividir."); return; }
  const horarioSegundaParte = horarios[idxAtual + parte1];
  if (!horarioSegundaParte) { m3MostrarErroDivisao("Não há horário seguinte disponível para a segunda parte."); return; }

  const candidata1 = { ...aula, duracaoSlots: parte1 };
  const conflitos1 = m3CheckConflitos(candidata1);
  if (conflitos1.length > 0) { m3MostrarErroDivisao(conflitos1[0].mensagem); return; }

  // Aplica a 1ª parte já aqui — senão a checagem da 2ª parte compararia contra a aula original
  // "inteira" (ainda ocupando os mesmos horários da 2ª parte) e acusaria conflito falso consigo mesma.
  aula.duracaoSlots = parte1;

  const candidata2 = {
    periodoLetivoId: aula.periodoLetivoId, turmaId: aula.turmaId,
    salaId: aula.salaId, salaExternaNome: aula.salaExternaNome, salaId2: aula.salaId2, salaExternaNome2: aula.salaExternaNome2,
    diaSemana: aula.diaSemana, horarioId: horarioSegundaParte.id, duracaoSlots: duracaoOriginal - parte1, professorIds: []
  };
  const conflitos2 = m3CheckConflitos(candidata2);
  if (conflitos2.length > 0) {
    aula.duracaoSlots = duracaoOriginal;
    m3MostrarErroDivisao(`A primeira parte seria ajustada, mas a segunda não pode ser criada: ${conflitos2[0].mensagem}`);
    return;
  }

  m3.db.aulas.push({ ...candidata2, id: crypto.randomUUID() });
  m3Salvar();
  m3FecharModalAula();
  m3RenderGradeGrid();
  m3RenderEnsalamento();
  m3RenderAtribuirContent();
  showToast("Aula dividida em duas.", "ok");
}
