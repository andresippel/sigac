/**
 * @file js/modulos/horario/grade.js
 * @description Módulo 3 — Horário de Aulas: aba Grade de Horários (grade semanal, arrastar e soltar).
 *
 * Os arquivos de js/modulos/horario/ formam UM módulo dividido por responsabilidade e
 * compartilham escopo (tudo prefixado com m3/M3_). Não dependem dos Módulos 1 e 2.
 */
"use strict";

// ─── Renderização — Grade de Horários ──

function m3SemestresDoPeriodo(periodo) {
  const paridade = periodo.tipoSemestre === "impar" ? 1 : 0;
  const set = new Set();
  m3.db.disciplinas.forEach((d) => { if (!d.optativa && d.semestreCurricular % 2 === paridade) set.add(d.semestreCurricular); });
  return [...set].sort((a, b) => a - b);
}

function m3AbasGrade(periodo) {
  const abas = m3SemestresDoPeriodo(periodo).map((n) => ({
    chave: `sem-${n}`,
    label: `${n}º Semestre`,
    disciplinaIds: new Set(m3.db.disciplinas.filter((d) => !d.optativa && d.semestreCurricular === n).map((d) => d.id))
  }));
  const disciplinaIdsComTurma = new Set(m3.db.turmas.filter((t) => t.periodoLetivoId === periodo.id).map((t) => t.disciplinaId));
  const paridade = periodo.tipoSemestre === "impar" ? 1 : 0;
  const reofertaIds = new Set(
    m3.db.disciplinas.filter((d) => (d.optativa || d.semestreCurricular % 2 !== paridade) && disciplinaIdsComTurma.has(d.id)).map((d) => d.id)
  );
  if (reofertaIds.size > 0) abas.push({ chave: "reoferta", label: "Reoferta/Optativas", disciplinaIds: reofertaIds });
  return abas;
}

function m3RenderGradeSemestreTabs() {
  const cont = document.getElementById("m3GradeSemestreTabs");
  if (!cont) return;
  const periodo = m3.db.periodosLetivos.find((p) => p.id === m3.periodoAtualId);
  if (!periodo) { cont.innerHTML = ""; return; }
  const abas = m3AbasGrade(periodo);
  if (!m3.gradeAbaChave || !abas.some((a) => a.chave === m3.gradeAbaChave)) m3.gradeAbaChave = abas[0]?.chave || null;
  cont.innerHTML = abas.map((a) => `<button class="m3-tab ${a.chave === m3.gradeAbaChave ? "active" : ""}" data-grade-aba="${escapeHTML(a.chave)}">${escapeHTML(a.label)}</button>`).join("");
}

function m3RenderGradeSidebar() {
  const cont = document.getElementById("m3GradeSidebarLista");
  if (!cont) return;
  const periodo = m3.db.periodosLetivos.find((p) => p.id === m3.periodoAtualId);
  if (!periodo) { cont.innerHTML = '<p class="empty-state">Crie um período letivo primeiro.</p>'; return; }
  const abas = m3AbasGrade(periodo);
  const aba = abas.find((a) => a.chave === m3.gradeAbaChave) || abas[0];
  if (!aba) { cont.innerHTML = '<p class="empty-state">Nenhuma disciplina cadastrada para este período.</p>'; return; }
  const disciplinas = m3.db.disciplinas.filter((d) => aba.disciplinaIds.has(d.id)).sort((a, b) => a.sigla.localeCompare(b.sigla, "pt-BR"));
  if (disciplinas.length === 0) { cont.innerHTML = '<p class="empty-state">Nenhuma disciplina neste grupo.</p>'; return; }
  cont.innerHTML = disciplinas.map((d) => {
    const turmas = m3.db.turmas.filter((t) => t.periodoLetivoId === periodo.id && t.disciplinaId === d.id).sort((a, b) => a.codigo.localeCompare(b.codigo, "pt-BR", { numeric: true }));
    return `<div style="margin-bottom:10px">
      <div class="field-hint" style="font-weight:600;color:var(--gray-700);margin-bottom:3px">${escapeHTML(d.sigla)}</div>
      ${turmas.length === 0
        ? '<p class="empty-state" style="font-size:11.5px">Nenhuma turma criada.</p>'
        : `<div>${turmas.map((t) => `<span class="turma-chip" draggable="true" data-turma-id="${escapeHTML(t.id)}">${escapeHTML(t.codigo)}</span>`).join("")}</div>`}
    </div>`;
  }).join("");
}

/** Nome da(s) sala(s) da aula, combinando a 2ª quando houver (ex: "Lab 3 + Clínica 2"). */
function m3NomesSalas(a) {
  const salaById = new Map(m3.db.salas.map((s) => [s.id, s]));
  const nomes = [
    a.salaId ? salaById.get(a.salaId)?.nome : a.salaExternaNome,
    a.salaId2 ? salaById.get(a.salaId2)?.nome : a.salaExternaNome2
  ].filter(Boolean);
  return nomes.length > 0 ? nomes.join(" + ") : "—";
}

/** Nomes dos professores da aula, em ordem, separados por vírgula. */
function m3NomesProfessores(a) {
  const professorById = new Map(m3.db.professores.map((p) => [p.id, p]));
  return (a.professorIds || []).map((pid) => professorById.get(pid)?.nome).filter(Boolean);
}

function m3AulasNaCelula(aulas, horarios, horarioId, dia) {
  return aulas.filter((a) => {
    if (a.diaSemana !== dia) return false;
    const idxInicio = horarios.findIndex((h) => h.id === a.horarioId);
    const idxAqui = horarios.findIndex((h) => h.id === horarioId);
    return idxAqui >= idxInicio && idxAqui < idxInicio + a.duracaoSlots;
  });
}

function m3RenderGradeGrid() {
  const wrap = document.getElementById("m3GradeGridWrap");
  if (!wrap) return;
  const periodo = m3.db.periodosLetivos.find((p) => p.id === m3.periodoAtualId);
  if (!periodo) { wrap.innerHTML = '<p class="empty-state">Crie e selecione um período letivo primeiro.</p>'; return; }
  const abas = m3AbasGrade(periodo);
  const aba = abas.find((a) => a.chave === m3.gradeAbaChave) || abas[0];
  if (!aba) { wrap.innerHTML = '<p class="empty-state">Nenhuma disciplina cadastrada para este período.</p>'; return; }

  const turmas = m3.db.turmas.filter((t) => t.periodoLetivoId === periodo.id && aba.disciplinaIds.has(t.disciplinaId));
  const turmaIds = new Set(turmas.map((t) => t.id));
  const turmaById = new Map(turmas.map((t) => [t.id, t]));
  const disciplinaById = new Map(m3.db.disciplinas.map((d) => [d.id, d]));
  const aulas = m3.db.aulas.filter((a) => a.periodoLetivoId === periodo.id && turmaIds.has(a.turmaId));
  const horarios = [...periodo.horarios].sort((a, b) => (a.inicio < b.inicio ? -1 : a.inicio > b.inicio ? 1 : 0));

  let html = '<table class="schedule-table"><thead><tr><th>Horário</th>';
  M3_DIAS.forEach((d) => { html += `<th>${M3_LABEL_DIA[d]}</th>`; });
  html += "</tr></thead><tbody>";
  let ultimoTurno = null;
  horarios.forEach((h) => {
    if (ultimoTurno && ultimoTurno !== h.turno) html += `<tr class="turno-sep"><td colspan="${M3_DIAS.length + 1}"></td></tr>`;
    ultimoTurno = h.turno;
    html += `<tr><td class="horario-col">${escapeHTML(h.inicio)}-${escapeHTML(h.fim)}</td>`;
    M3_DIAS.forEach((dia) => {
      const lista = m3AulasNaCelula(aulas, horarios, h.id, dia);
      html += `<td class="dia-col" data-horario-id="${escapeHTML(h.id)}" data-dia="${escapeHTML(dia)}">`;
      lista.forEach((a) => {
        const turma = turmaById.get(a.turmaId);
        const disciplina = turma ? disciplinaById.get(turma.disciplinaId) : null;
        if (a.horarioId === h.id) {
          const profs = m3NomesProfessores(a).join(", ");
          html += `<div class="aula-chip" draggable="true" data-aula-id="${escapeHTML(a.id)}">
            <span class="sigla">${escapeHTML(disciplina ? disciplina.sigla : "?")}</span> ${escapeHTML(turma ? turma.codigo : "")}<br>
            ${escapeHTML(m3NomesSalas(a))}${profs ? " · " + escapeHTML(profs) : ""}
          </div>`;
        } else {
          html += `<div class="aula-chip aula-chip-continuacao">
            <span class="sigla">${escapeHTML(disciplina ? disciplina.sigla : "?")}</span> ${escapeHTML(turma ? turma.codigo : "")}
          </div>`;
        }
      });
      html += "</td>";
    });
    html += "</tr>";
  });
  html += "</tbody></table>";
  wrap.innerHTML = html;
}

function m3MoverAula(aulaId, dia, horarioId) {
  const aula = m3.db.aulas.find((a) => a.id === aulaId);
  if (!aula) return;
  const candidata = { ...aula, diaSemana: dia, horarioId };
  const conflitos = m3CheckConflitos(candidata);
  if (conflitos.length > 0) { showToast(conflitos[0].mensagem, "err"); return; }
  aula.diaSemana = dia;
  aula.horarioId = horarioId;
  m3Salvar();
  m3RenderGradeGrid();
  m3RenderEnsalamento();
  showToast("Aula movida.", "ok");
}
