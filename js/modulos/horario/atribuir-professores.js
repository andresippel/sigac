/**
 * @file js/modulos/horario/atribuir-professores.js
 * @description Módulo 3 — Horário de Aulas: aba Atribuir Professores e Subgrupos de alunos.
 *
 * Os arquivos de js/modulos/horario/ formam UM módulo dividido por responsabilidade e
 * compartilham escopo (tudo prefixado com m3/M3_). Não dependem dos Módulos 1 e 2.
 */
"use strict";

// ─── Atribuir Professores (etapa própria, além do modal da Grade) ──

function m3RenderAtribuirSidebar() {
  m3RenderDisciplinaBrowser("m3AtribuirSidebarLista", "m3AtribuirBusca", m3.atribuirDisciplinaId);
}

/** Ex: "07:00-08:40" para a aula, considerando sua duração em slots. */
function m3RangeHorarioAula(periodo, aula) {
  const horarios = m3HorariosOrdenados(periodo.id);
  const idx = horarios.findIndex((h) => h.id === aula.horarioId);
  if (idx === -1) return "";
  const fim = horarios[idx + aula.duracaoSlots - 1] || horarios[idx];
  return `${horarios[idx].inicio}-${fim.fim}`;
}

function m3TurmaSessoesHtml(periodo, turma) {
  const aulasDaTurma = m3.db.aulas
    .filter((a) => a.turmaId === turma.id)
    .sort((a, b) => a.diaSemana - b.diaSemana || a.horarioId.localeCompare(b.horarioId));
  const professorById = new Map(m3.db.professores.map((p) => [p.id, p]));

  let html = `<div style="margin-bottom:16px"><div style="font-weight:600;font-size:13px;margin-bottom:4px">${escapeHTML(turma.codigo)}</div>`;

  if (aulasDaTurma.length === 0) {
    html += `<p class="empty-state" style="font-size:12px;margin-bottom:6px">Ainda sem horário na Grade — coloque essa turma na etapa "Grade de Horários" primeiro.</p></div>`;
    return html;
  }

  html += `<table class="data-table" style="margin-bottom:6px"><thead><tr>
    <th style="width:60px">Dia</th><th style="width:100px">Horário</th><th>Professor(es)</th><th style="width:210px"></th>
  </tr></thead><tbody>`;
  aulasDaTurma.forEach((aula) => {
    const chips = (aula.professorIds || []).map((pid) => `
      <span class="turma-chip" data-professor-id="${escapeHTML(pid)}">${escapeHTML(professorById.get(pid)?.nome || "?")}
        <button type="button" class="m3-chip-remove m3-atrib-del-prof" data-aula-id="${escapeHTML(aula.id)}" data-professor-id="${escapeHTML(pid)}" title="Remover professor deste encontro">✕</button>
      </span>`).join("");
    const disponiveis = m3.db.professores.filter((p) => !(aula.professorIds || []).includes(p.id)).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    html += `<tr data-aula-id="${escapeHTML(aula.id)}">
      <td>${M3_LABEL_DIA[aula.diaSemana]}</td>
      <td>${escapeHTML(m3RangeHorarioAula(periodo, aula))}</td>
      <td>${chips || '<span class="empty-state" style="font-size:12px">sem professor</span>'}</td>
      <td>
        <div class="fields-row" style="margin-bottom:0">
          <select class="m3-atrib-select-add" style="max-width:150px">
            <option value="">Adicionar...</option>
            ${disponiveis.map((p) => `<option value="${escapeHTML(p.id)}">${escapeHTML(p.nome)}</option>`).join("")}
          </select>
          <button class="btn btn-outline btn-sm m3-atrib-add-prof" data-aula-id="${escapeHTML(aula.id)}">+</button>
        </div>
      </td>
    </tr>`;
  });
  html += "</tbody></table>";

  if (aulasDaTurma.length > 1) {
    html += `<div class="fields-row" style="margin-bottom:0">
      <label class="field-inline" style="font-size:12.5px">Aplicar a todos os encontros desta turma:
        <select class="m3-atrib-select-turma" data-turma-id="${escapeHTML(turma.id)}" style="max-width:170px">
          <option value="">Selecione...</option>
          ${m3.db.professores.slice().sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")).map((p) => `<option value="${escapeHTML(p.id)}">${escapeHTML(p.nome)}</option>`).join("")}
        </select>
      </label>
      <button class="btn btn-outline btn-sm m3-atrib-aplicar-turma" data-turma-id="${escapeHTML(turma.id)}">Aplicar</button>
    </div>`;
  }

  if (aulasDaTurma.some((a) => (a.professorIds || []).length > 1)) {
    html += m3SubgruposHtml(turma, aulasDaTurma, professorById);
  }

  html += "</div>";
  return html;
}

/** Seção "Subgrupos de alunos" — controle interno para dividir a turma entre os professores do mesmo encontro. */
function m3SubgruposHtml(turma, aulasDaTurma, professorById) {
  const subgrupos = m3SubgruposDaTurma(turma.id);
  let html = `<div style="margin-top:10px">
    <div style="font-size:12px;margin-bottom:4px"><strong>Subgrupos de alunos</strong> <span class="field-hint">— controle interno, não aparece na Grade de Horários</span></div>`;

  if (subgrupos.length === 0) {
    html += `<p class="empty-state" style="font-size:12px;margin-bottom:6px">Nenhum subgrupo criado ainda. Cada clique em "+ subgrupo" já vem com uma sugestão de professor por encontro (na ordem em que foram adicionados); ajuste célula a célula se precisar.</p>`;
  } else {
    html += `<table class="data-table" style="margin-bottom:6px"><thead><tr>
      <th style="width:90px">Subgrupo</th>
      ${aulasDaTurma.map((a) => `<th>${M3_LABEL_DIA[a.diaSemana]} ${escapeHTML(m3RangeHorarioAula(m3.db.periodosLetivos.find((p) => p.id === turma.periodoLetivoId), a))}</th>`).join("")}
      <th style="width:40px"></th>
    </tr></thead><tbody>`;
    subgrupos.forEach((sg) => {
      html += `<tr data-subgrupo-id="${escapeHTML(sg.id)}">
        <td style="font-weight:600">${escapeHTML(turma.codigo)}${escapeHTML(sg.ordem)}</td>
        ${aulasDaTurma.map((a) => `
          <td>
            <select class="m3-sub-select-prof" data-subgrupo-id="${escapeHTML(sg.id)}" data-aula-id="${escapeHTML(a.id)}" style="max-width:150px">
              <option value="">—</option>
              ${(a.professorIds || []).map((pid) => `<option value="${escapeHTML(pid)}" ${sg.professorPorAula[a.id] === pid ? "selected" : ""}>${escapeHTML(professorById.get(pid)?.nome || "?")}</option>`).join("")}
            </select>
          </td>`).join("")}
        <td><button type="button" class="btn-icon m3-sub-del" data-subgrupo-id="${escapeHTML(sg.id)}" title="Excluir subgrupo">✕</button></td>
      </tr>`;
    });
    html += "</tbody></table>";
  }
  html += `<button type="button" class="btn btn-outline btn-sm m3-sub-criar" data-turma-id="${escapeHTML(turma.id)}">+ subgrupo</button></div>`;
  return html;
}

function m3RenderAtribuirContent() {
  const cont = document.getElementById("m3AtribuirContent");
  if (!cont) return;
  const disciplina = m3.db.disciplinas.find((d) => d.id === m3.atribuirDisciplinaId);
  if (!disciplina) { cont.innerHTML = '<div class="card"><p class="empty-state">Selecione uma disciplina na lista ao lado.</p></div>'; return; }
  const periodo = m3.db.periodosLetivos.find((p) => p.id === m3.periodoAtualId);
  if (!periodo) { cont.innerHTML = '<div class="card"><p class="empty-state">Crie e selecione um período letivo primeiro (aba "Período Letivo").</p></div>'; return; }

  const turmasDaDisciplina = m3.db.turmas.filter((t) => t.periodoLetivoId === periodo.id && t.disciplinaId === disciplina.id);
  const teoricas = turmasDaDisciplina.filter((t) => t.tipoBase === "T");
  const gruposPraticos = new Map();
  turmasDaDisciplina.filter((t) => t.tipoBase === "P").forEach((t) => {
    if (!gruposPraticos.has(t.codigoBase)) gruposPraticos.set(t.codigoBase, []);
    gruposPraticos.get(t.codigoBase).push(t);
  });

  if (teoricas.length === 0 && gruposPraticos.size === 0) {
    cont.innerHTML = '<div class="card"><p class="empty-state">Nenhuma turma criada ainda — crie as turmas dessa disciplina primeiro, na etapa "Turmas".</p></div>';
    return;
  }

  let html = `<div class="card"><h3 style="font-size:16px;margin-bottom:2px">${escapeHTML(disciplina.sigla)} — <span class="field-hint" style="font-size:13px">${escapeHTML(disciplina.nome)}</span></h3></div>`;

  if (teoricas.length > 0) {
    html += `<div class="card"><div class="card-title violet">Teóricas</div>${teoricas.map((t) => m3TurmaSessoesHtml(periodo, t)).join("")}</div>`;
  }
  if (gruposPraticos.size > 0) {
    html += `<div class="card"><div class="card-title violet">Práticas</div>${[...gruposPraticos.entries()].map(([codigoBase, membros]) => `
      <div style="margin-bottom:10px">
        <div class="field-hint" style="margin-bottom:3px">Grupo ${escapeHTML(codigoBase)}</div>
        ${membros.slice().sort((a, b) => a.ordem - b.ordem).map((t) => m3TurmaSessoesHtml(periodo, t)).join("")}
      </div>`).join("")}</div>`;
  }

  cont.innerHTML = html;
}

function m3AdicionarProfessorAula(aulaId, profId) {
  const aula = m3.db.aulas.find((a) => a.id === aulaId);
  if (!aula || !profId) return;
  const candidata = { ...aula, professorIds: [...(aula.professorIds || []), profId] };
  const conflitos = m3CheckConflitos(candidata).filter((c) => c.tipo === "professor");
  if (conflitos.length > 0) { showToast(conflitos[0].mensagem, "err"); return; }
  aula.professorIds = candidata.professorIds;
  m3Salvar();
  m3RenderAtribuirContent();
  m3RenderGradeGrid();
  showToast("Professor atribuído.", "ok");
}

function m3RemoverProfessorAula(aulaId, profId) {
  const aula = m3.db.aulas.find((a) => a.id === aulaId);
  if (!aula) return;
  aula.professorIds = (aula.professorIds || []).filter((p) => p !== profId);
  m3RemoverProfessorDeAulaNosSubgrupos(aulaId, profId);
  m3Salvar();
  m3RenderAtribuirContent();
  m3RenderGradeGrid();
}

function m3AplicarProfessorATurma(turmaId, profId) {
  if (!profId) return;
  const aulasDaTurma = m3.db.aulas.filter((a) => a.turmaId === turmaId);
  let sucesso = 0;
  const falhas = [];
  aulasDaTurma.forEach((aula) => {
    if ((aula.professorIds || []).includes(profId)) { sucesso++; return; }
    const candidata = { ...aula, professorIds: [...(aula.professorIds || []), profId] };
    const conflitos = m3CheckConflitos(candidata).filter((c) => c.tipo === "professor");
    if (conflitos.length > 0) { falhas.push(conflitos[0]); return; }
    aula.professorIds = candidata.professorIds;
    sucesso++;
  });
  m3Salvar();
  m3RenderAtribuirContent();
  m3RenderGradeGrid();
  if (falhas.length === 0) showToast(`Professor atribuído a ${sucesso} encontro(s).`, "ok");
  else showToast(`Atribuído a ${sucesso} encontro(s); conflito em ${falhas.length} — ${falhas[0].mensagem}`, "err");
}

// ─── Subgrupos de alunos (dividir a turma entre os professores do mesmo encontro) ──

function m3SubgruposDaTurma(turmaId) {
  return m3.db.subgrupos.filter((s) => s.turmaId === turmaId).sort((a, b) => a.ordem - b.ordem);
}

function m3RenumerarSubgrupos(turmaId) {
  m3SubgruposDaTurma(turmaId).forEach((s, i) => { s.ordem = i + 1; });
}

function m3RemoverTurmaDosSubgrupos(turmaId) {
  m3.db.subgrupos = m3.db.subgrupos.filter((s) => s.turmaId !== turmaId);
}

function m3RemoverAulaDosSubgrupos(aulaId) {
  m3.db.subgrupos.forEach((sg) => { delete sg.professorPorAula[aulaId]; });
}

function m3RemoverProfessorDeAulaNosSubgrupos(aulaId, professorId) {
  m3.db.subgrupos.forEach((sg) => { if (sg.professorPorAula[aulaId] === professorId) delete sg.professorPorAula[aulaId]; });
}

function m3RemoverProfessorDosSubgrupos(professorId) {
  m3.db.subgrupos.forEach((sg) => {
    Object.keys(sg.professorPorAula).forEach((aulaId) => {
      if (sg.professorPorAula[aulaId] === professorId) delete sg.professorPorAula[aulaId];
    });
  });
}

/** Cria um novo subgrupo, sugerindo o Nº professor de cada encontro (mesma posição em que foram adicionados à aula). */
function m3CriarSubgrupo(turmaId) {
  const ordem = m3SubgruposDaTurma(turmaId).length + 1;
  const professorPorAula = {};
  m3.db.aulas.filter((a) => a.turmaId === turmaId).forEach((a) => {
    const pid = (a.professorIds || [])[ordem - 1];
    if (pid) professorPorAula[a.id] = pid;
  });
  m3.db.subgrupos.push({ id: crypto.randomUUID(), turmaId, ordem, professorPorAula });
  m3Salvar();
  m3RenderAtribuirContent();
}

function m3DefinirProfessorSubgrupo(subgrupoId, aulaId, professorId) {
  const sg = m3.db.subgrupos.find((s) => s.id === subgrupoId);
  if (!sg) return;
  if (professorId) sg.professorPorAula[aulaId] = professorId;
  else delete sg.professorPorAula[aulaId];
  m3Salvar();
  m3RenderAtribuirContent();
}

function m3ExcluirSubgrupo(subgrupoId) {
  const sg = m3.db.subgrupos.find((s) => s.id === subgrupoId);
  if (!sg) return;
  m3.db.subgrupos = m3.db.subgrupos.filter((s) => s.id !== subgrupoId);
  m3RenumerarSubgrupos(sg.turmaId);
  m3Salvar();
  m3RenderAtribuirContent();
}
