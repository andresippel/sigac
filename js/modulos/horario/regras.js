/**
 * @file js/modulos/horario/regras.js
 * @description Módulo 3 — Horário de Aulas: regras de negócio: agrupamento/numeração de turmas, conflitos e exclusão em cascata.
 *
 * Os arquivos de js/modulos/horario/ formam UM módulo dividido por responsabilidade e
 * compartilham escopo (tudo prefixado com m3/M3_). Não dependem dos Módulos 1 e 2.
 */
"use strict";

// ─── Turmas: agrupamento e numeração automática (P31/P32...) ──

function m3GrupoTurmas(periodoId, disciplinaId, tipoBase, codigoBase) {
  return m3.db.turmas
    .filter((t) => t.periodoLetivoId === periodoId && t.disciplinaId === disciplinaId && t.tipoBase === tipoBase && t.codigoBase === codigoBase)
    .sort((a, b) => a.ordem - b.ordem);
}

function m3RenumerarGrupo(periodoId, disciplinaId, tipoBase, codigoBase) {
  if (tipoBase !== "P") return;
  const membros = m3GrupoTurmas(periodoId, disciplinaId, tipoBase, codigoBase);
  membros.forEach((t, i) => {
    t.ordem = i + 1;
    t.codigo = membros.length > 1 ? `${codigoBase}${i + 1}` : codigoBase;
  });
}

function m3CriarTurmaBase(periodoId, disciplinaId, tipoBase, codigoBase) {
  const ordem = m3GrupoTurmas(periodoId, disciplinaId, tipoBase, codigoBase).length + 1;
  const turma = { id: crypto.randomUUID(), periodoLetivoId: periodoId, disciplinaId, tipoBase, codigoBase, ordem, codigo: codigoBase };
  m3.db.turmas.push(turma);
  m3RenumerarGrupo(periodoId, disciplinaId, tipoBase, codigoBase);
  m3Salvar();
  return turma;
}

// ─── Validação de conflitos (sala / professor / turma / turno) ──

function m3HorariosOrdenados(periodoId) {
  const periodo = m3.db.periodosLetivos.find((p) => p.id === periodoId);
  if (!periodo) return [];
  return [...periodo.horarios].sort((a, b) => (a.inicio < b.inicio ? -1 : a.inicio > b.inicio ? 1 : 0));
}

function m3SlotsSeSobrepoem(aInicio, aDur, bInicio, bDur) {
  return aInicio < bInicio + bDur && bInicio < aInicio + aDur;
}

function m3DuracaoCruzaTurno(periodoId, horarioId, duracaoSlots) {
  const horarios = m3HorariosOrdenados(periodoId);
  const idx = horarios.findIndex((h) => h.id === horarioId);
  if (idx === -1) return false;
  const turno = horarios[idx].turno;
  for (let i = 0; i < duracaoSlots; i++) {
    const h = horarios[idx + i];
    if (!h || h.turno !== turno) return true;
  }
  return false;
}

/**
 * Verifica conflitos de uma aula candidata (nova ou editada) contra as demais aulas do período.
 * @param {object} candidata — { id?, periodoLetivoId, turmaId, salaId?, salaId2?, professorIds?, diaSemana, horarioId, duracaoSlots }
 * @returns {{tipo:string, mensagem:string}[]}
 */
function m3CheckConflitos(candidata) {
  const conflitos = [];
  if (m3DuracaoCruzaTurno(candidata.periodoLetivoId, candidata.horarioId, candidata.duracaoSlots)) {
    conflitos.push({ tipo: "turno", mensagem: "A duração ultrapassa o intervalo do turno (ex: atravessa o almoço). Reduza a duração." });
  }
  const horarioIds = m3HorariosOrdenados(candidata.periodoLetivoId).map((h) => h.id);
  const idxCand = horarioIds.indexOf(candidata.horarioId);
  const salasCandidata = [candidata.salaId, candidata.salaId2].filter(Boolean);
  const profsCandidata = candidata.professorIds || [];
  for (const aula of m3.db.aulas) {
    if (aula.id === candidata.id) continue;
    if (aula.periodoLetivoId !== candidata.periodoLetivoId) continue;
    if (aula.diaSemana !== candidata.diaSemana) continue;
    const idxAula = horarioIds.indexOf(aula.horarioId);
    if (idxAula < 0 || idxCand < 0) continue;
    if (!m3SlotsSeSobrepoem(idxCand, candidata.duracaoSlots, idxAula, aula.duracaoSlots)) continue;
    const salasAula = [aula.salaId, aula.salaId2].filter(Boolean);
    if (salasCandidata.some((s) => salasAula.includes(s))) {
      conflitos.push({ tipo: "sala", mensagem: "A sala já está ocupada nesse horário." });
    }
    const profsAula = aula.professorIds || [];
    if (profsCandidata.some((p) => profsAula.includes(p))) {
      conflitos.push({ tipo: "professor", mensagem: "O professor já tem outra aula nesse horário." });
    }
    if (aula.turmaId === candidata.turmaId) {
      conflitos.push({ tipo: "turma", mensagem: "Essa turma já tem uma aula marcada nesse horário." });
    }
  }
  return conflitos;
}

// ─── Exclusão em cascata ──

function m3ExcluirComCascata(colecao, id) {
  const nomes = { disciplinas: "esta disciplina", professores: "este professor", salas: "esta sala", periodosLetivos: "este período", turmas: "esta turma" };
  if (!confirm(`Excluir ${nomes[colecao] || "este item"}? Isso também remove o que depende dele na grade.`)) return;

  if (colecao === "disciplinas") {
    const turmaIds = m3.db.turmas.filter((t) => t.disciplinaId === id).map((t) => t.id);
    m3.db.aulas = m3.db.aulas.filter((a) => !turmaIds.includes(a.turmaId));
    m3.db.turmas = m3.db.turmas.filter((t) => t.disciplinaId !== id);
    m3.db.disciplinas = m3.db.disciplinas.filter((d) => d.id !== id);
    turmaIds.forEach((tid) => m3RemoverTurmaDosSubgrupos(tid));
    if (m3.turmasDisciplinaId === id) m3.turmasDisciplinaId = null;
  } else if (colecao === "professores") {
    m3.db.aulas.forEach((a) => { a.professorIds = (a.professorIds || []).filter((pid) => pid !== id); });
    m3.db.professores = m3.db.professores.filter((p) => p.id !== id);
    m3RemoverProfessorDosSubgrupos(id);
  } else if (colecao === "salas") {
    m3.db.aulas.forEach((a) => {
      if (a.salaId === id) a.salaId = undefined;
      if (a.salaId2 === id) a.salaId2 = undefined;
    });
    m3.db.salas = m3.db.salas.filter((s) => s.id !== id);
  } else if (colecao === "periodosLetivos") {
    const turmaIds = m3.db.turmas.filter((t) => t.periodoLetivoId === id).map((t) => t.id);
    m3.db.aulas = m3.db.aulas.filter((a) => !turmaIds.includes(a.turmaId));
    m3.db.turmas = m3.db.turmas.filter((t) => t.periodoLetivoId !== id);
    m3.db.periodosLetivos = m3.db.periodosLetivos.filter((p) => p.id !== id);
    turmaIds.forEach((tid) => m3RemoverTurmaDosSubgrupos(tid));
    if (m3.periodoAtualId === id) m3DefinirPeriodoAtivo(m3.db.periodosLetivos[0]?.id || null);
  } else if (colecao === "turmas") {
    const turma = m3.db.turmas.find((t) => t.id === id);
    m3.db.aulas = m3.db.aulas.filter((a) => a.turmaId !== id);
    m3.db.turmas = m3.db.turmas.filter((t) => t.id !== id);
    m3RemoverTurmaDosSubgrupos(id);
    if (turma) m3RenumerarGrupo(turma.periodoLetivoId, turma.disciplinaId, turma.tipoBase, turma.codigoBase);
  }
  m3Salvar();
  m3RenderTudo();
  showToast("Excluído.", "ok");
}
