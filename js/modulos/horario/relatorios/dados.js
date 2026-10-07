/**
 * @file js/modulos/horario/dados.js
 * @description Módulo 3 — Horário de Aulas: montagem dos dados dos relatórios (independente do formato de saída).
 *
 * Os arquivos de js/modulos/horario/ formam UM módulo dividido por responsabilidade e
 * compartilham escopo (tudo prefixado com m3/M3_). Não dependem dos Módulos 1 e 2.
 */
"use strict";

// ─── Relatórios — dados ──

const M3_LABEL_GRUPO_SALA = { teorica: "Salas Teóricas", pratica: "Clínicas e Laboratórios", outra: "Outras Salas" };
const M3_LABEL_TURNO = { manha: "Manhã", tarde: "Tarde", noite: "Noite" };

function m3NormalizarTipoSala(tipo) {
  const t = (tipo || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (t.includes("teor") || t.includes("anfi") || t.includes("audit")) return "teorica";
  if (t.includes("clin") || t.includes("lab") || t.includes("centr")) return "pratica";
  return "outra";
}

function m3HorasLabel(n) {
  return `${n} h`;
}

/** Carga horária prática semanal + códigos das turmas práticas já criadas, ex: "4 h (P1/P2/P3)". */
function m3PraticasLabel(periodoId, disciplina) {
  const codigos = m3.db.turmas
    .filter((t) => t.periodoLetivoId === periodoId && t.disciplinaId === disciplina.id && t.tipoBase === "P")
    .map((t) => t.codigo)
    .sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
  const horas = m3HorasLabel(disciplina.aulasPraticasSemana);
  return codigos.length > 0 ? `${horas} (${codigos.join("/")})` : horas;
}

function m3DisciplinasReofertaOuOptativas(periodo) {
  const paridade = periodo.tipoSemestre === "impar" ? 1 : 0;
  const disciplinaIdsComTurma = new Set(m3.db.turmas.filter((t) => t.periodoLetivoId === periodo.id).map((t) => t.disciplinaId));
  return m3.db.disciplinas
    .filter((d) => disciplinaIdsComTurma.has(d.id) && (d.optativa || d.semestreCurricular % 2 !== paridade))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

function m3MontarGradeParaDisciplinas(periodo, disciplinas, titulo) {
  const horarios = m3HorariosOrdenados(periodo.id);
  const disciplinaIds = new Set(disciplinas.map((d) => d.id));
  const turmas = m3.db.turmas.filter((t) => t.periodoLetivoId === periodo.id && disciplinaIds.has(t.disciplinaId));
  const turmaById = new Map(turmas.map((t) => [t.id, t]));
  const disciplinaById = new Map(disciplinas.map((d) => [d.id, d]));
  const celulas = new Map(); // key: horarioId|dia -> [{sigla, turmaCodigo, salaNome}]
  const aulas = m3.db.aulas.filter((a) => a.periodoLetivoId === periodo.id && turmaById.has(a.turmaId));
  for (const aula of aulas) {
    const turma = turmaById.get(aula.turmaId);
    if (!turma) continue;
    const disciplina = disciplinaById.get(turma.disciplinaId);
    if (!disciplina) continue;
    const idxInicio = horarios.findIndex((h) => h.id === aula.horarioId);
    if (idxInicio === -1) continue;
    for (let i = 0; i < aula.duracaoSlots && idxInicio + i < horarios.length; i++) {
      const horario = horarios[idxInicio + i];
      const key = `${horario.id}|${aula.diaSemana}`;
      const lista = celulas.get(key) || [];
      lista.push({ sigla: disciplina.sigla, turmaCodigo: turma.codigo, salaNome: m3NomesSalas(aula) });
      celulas.set(key, lista);
    }
  }
  return { titulo, horarios, disciplinas, celulas };
}

function m3MontarGradeSemestre(periodo, n) {
  const disciplinas = m3.db.disciplinas.filter((d) => !d.optativa && d.semestreCurricular === n).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  return m3MontarGradeParaDisciplinas(periodo, disciplinas, `${n}º Semestre`);
}

function m3MontarGradeReoferta(periodo) {
  return m3MontarGradeParaDisciplinas(periodo, m3DisciplinasReofertaOuOptativas(periodo), "Reoferta/Optativas");
}

function m3MontarEnsalamento(periodo) {
  const horarios = m3HorariosOrdenados(periodo.id);
  const turmaById = new Map(m3.db.turmas.filter((t) => t.periodoLetivoId === periodo.id).map((t) => [t.id, t]));
  const disciplinaById = new Map(m3.db.disciplinas.map((d) => [d.id, d]));
  const salas = m3.db.salas.map((s) => ({ id: s.id, nome: s.nome, tipo: m3NormalizarTipoSala(s.tipo) })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  const celulas = new Map(); // key: salaId|dia|turno -> [{sigla, turmaCodigo, horarioLabel}]
  for (const aula of m3.db.aulas.filter((a) => a.periodoLetivoId === periodo.id)) {
    const salaIds = [aula.salaId, aula.salaId2].filter(Boolean);
    if (salaIds.length === 0) continue;
    const idxInicio = horarios.findIndex((h) => h.id === aula.horarioId);
    if (idxInicio === -1) continue;
    const horario = horarios[idxInicio];
    const turma = turmaById.get(aula.turmaId);
    if (!turma) continue;
    const disciplina = disciplinaById.get(turma.disciplinaId);
    const horarioFim = horarios[idxInicio + aula.duracaoSlots - 1] || horario;
    for (const salaId of salaIds) {
      const key = `${salaId}|${aula.diaSemana}|${horario.turno}`;
      const lista = celulas.get(key) || [];
      lista.push({ sigla: disciplina ? disciplina.sigla : "?", turmaCodigo: turma.codigo, horarioLabel: `${horario.inicio}-${horarioFim.fim}` });
      celulas.set(key, lista);
    }
  }
  const turnos = ["manha", "tarde", "noite"].filter((t) => periodo.horarios.some((h) => h.turno === t));
  return { salas, turnos, celulas };
}

function m3MontarDistribuicaoProfessores(periodo) {
  const horarios = m3HorariosOrdenados(periodo.id);
  const turmasDoPeriodo = m3.db.turmas.filter((t) => t.periodoLetivoId === periodo.id);
  const aulasPorTurma = new Map();
  for (const aula of m3.db.aulas.filter((a) => a.periodoLetivoId === periodo.id)) {
    const lista = aulasPorTurma.get(aula.turmaId) || [];
    lista.push(aula);
    aulasPorTurma.set(aula.turmaId, lista);
  }
  const porDisciplina = new Map();
  for (const turma of turmasDoPeriodo) {
    const lista = porDisciplina.get(turma.disciplinaId) || [];
    lista.push(turma);
    porDisciplina.set(turma.disciplinaId, lista);
  }
  const resultado = [];
  for (const disciplina of m3.db.disciplinas) {
    const turmas = porDisciplina.get(disciplina.id);
    if (!turmas || turmas.length === 0) continue;
    resultado.push({
      disciplina,
      turmas: turmas.slice().sort((a, b) => a.codigo.localeCompare(b.codigo)).map((t) => ({
        codigo: t.codigo,
        aulas: (aulasPorTurma.get(t.id) || [])
          .map((a) => {
            const idxInicio = horarios.findIndex((h) => h.id === a.horarioId);
            if (idxInicio === -1) return null;
            const horarioFim = horarios[idxInicio + a.duracaoSlots - 1] || horarios[idxInicio];
            return {
              dia: a.diaSemana,
              horarioLabel: `${horarios[idxInicio].inicio}-${horarioFim.fim}`,
              sala: m3NomesSalas(a),
              professores: m3NomesProfessores(a)
            };
          })
          .filter(Boolean)
          .sort((a, b) => a.dia - b.dia || a.horarioLabel.localeCompare(b.horarioLabel))
      }))
    });
  }
  return resultado.sort((a, b) => a.disciplina.semestreCurricular - b.disciplina.semestreCurricular || a.disciplina.nome.localeCompare(b.disciplina.nome, "pt-BR"));
}

function m3MontarCargaHoraria(periodo) {
  const horarios = m3HorariosOrdenados(periodo.id);
  const disciplinaById = new Map(m3.db.disciplinas.map((d) => [d.id, d]));
  const turmaById = new Map(m3.db.turmas.filter((t) => t.periodoLetivoId === periodo.id).map((t) => [t.id, t]));
  const porProfessor = new Map();
  for (const aula of m3.db.aulas.filter((a) => a.periodoLetivoId === periodo.id)) {
    if (!aula.professorIds || aula.professorIds.length === 0) continue;
    const turma = turmaById.get(aula.turmaId);
    if (!turma) continue;
    const disciplina = disciplinaById.get(turma.disciplinaId);
    const idxInicio = horarios.findIndex((h) => h.id === aula.horarioId);
    if (idxInicio === -1) continue;
    const horarioFim = horarios[idxInicio + aula.duracaoSlots - 1] || horarios[idxInicio];
    const horarioLabel = `${horarios[idxInicio].inicio}-${horarioFim.fim}`;
    const sala = m3NomesSalas(aula);
    for (const professorId of aula.professorIds) {
      const professor = m3.db.professores.find((p) => p.id === professorId);
      if (!professor) continue;
      const entry = porProfessor.get(professorId) || { professorNome: professor.nome, totalSlotsSemana: 0, detalhe: [] };
      entry.totalSlotsSemana += aula.duracaoSlots;
      entry.detalhe.push({ disciplinaNome: disciplina ? disciplina.nome : "—", turmaCodigo: turma.codigo, dia: aula.diaSemana, horarioLabel, sala, slots: aula.duracaoSlots });
      porProfessor.set(professorId, entry);
    }
  }
  for (const entry of porProfessor.values()) {
    entry.detalhe.sort((a, b) => a.dia - b.dia || a.horarioLabel.localeCompare(b.horarioLabel));
  }
  return [...porProfessor.values()].sort((a, b) => a.professorNome.localeCompare(b.professorNome, "pt-BR"));
}

/** Garante que há um período ativo; senão avisa e retorna null. */
function m3ExigirPeriodo() {
  const periodo = m3.db.periodosLetivos.find((p) => p.id === m3.periodoAtualId);
  if (!periodo) {
    showFeedback("m3FeedbackRelatorios", "Selecione um período letivo ativo primeiro (aba \"Período Letivo\").", "error");
    return null;
  }
  return periodo;
}
