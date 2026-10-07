/**
 * @file js/modulos/horario/estado.js
 * @description Módulo 3 — Horário de Aulas: estado em memória, persistência (localStorage) e re-renderização geral.
 *
 * Os arquivos de js/modulos/horario/ formam UM módulo dividido por responsabilidade e
 * compartilham escopo (tudo prefixado com m3/M3_). Não dependem dos Módulos 1 e 2.
 */
"use strict";

/** Estado privado do Módulo 3. Nada aqui é acessado pelos Módulos 1/2. */
const m3 = {
  db: null,               // { disciplinas, professores, salas, periodosLetivos, turmas, aulas }
  periodoAtualId: null,
  turmasDisciplinaId: null,
  gradeAbaChave: null,
  atribuirDisciplinaId: null,
  modalContexto: null,    // { modo: "nova", turmaId, diaSemana, horarioId } | { modo: "editar", aulaId }
  modalProfessorIds: []   // lista de trabalho dos professores atribuídos no modal aberto no momento
};

const M3_DIAS = [2, 3, 4, 5, 6];
const M3_LABEL_DIA = { 2: "2ª", 3: "3ª", 4: "4ª", 5: "5ª", 6: "6ª" };
const M3_PANEL_POR_TAB = { cadastro: "m3PanelCadastro", periodo: "m3PanelPeriodo", turmas: "m3PanelTurmas", grade: "m3PanelGrade", ensalamento: "m3PanelEnsalamento", atribuir: "m3PanelAtribuir", relatorios: "m3PanelRelatorios", dados: "m3PanelDados" };
const M3_SUBPANEL_POR_TAB = { disciplinas: "m3SubDisciplinas", professores: "m3SubProfessores", salas: "m3SubSalas" };

/** @returns {object} Banco vazio do Módulo 3. */
function m3EmptyDb() {
  return { disciplinas: [], professores: [], salas: [], periodosLetivos: [], turmas: [], aulas: [], subgrupos: [] };
}

/**
 * Migra aulas/estrutura de versões antigas do banco: a primeira versão deste módulo guardava um
 * único `professorId` por aula; agora usa `professorIds` (array), igual ao app desktop — o que
 * também deixa o import de um backup gerado pelo app desktop 100% compatível. Também garante que
 * `subgrupos` exista (adicionado depois da v1).
 */
function m3MigrarAulas(db) {
  for (const a of Array.isArray(db.aulas) ? db.aulas : []) {
    if (!a || typeof a !== "object") continue;
    if (!Array.isArray(a.professorIds)) {
      a.professorIds = a.professorId ? [a.professorId] : [];
    }
    delete a.professorId;
  }
  if (!Array.isArray(db.subgrupos)) db.subgrupos = [];
}

/** Gera os horários padrão (manhã/tarde/noite) de um novo período letivo. */
function m3HorariosPadrao() {
  const manha = [["07:15","08:15"],["08:15","09:15"],["09:25","10:25"],["10:25","11:25"],["11:25","12:25"]];
  const tarde = [["13:15","14:15"],["14:15","15:15"],["15:15","16:15"],["16:15","17:15"],["17:15","18:15"]];
  const noite = [["18:15","19:15"],["19:15","20:15"]];
  const build = (slots, turno) => slots.map(([inicio, fim]) => ({ id: crypto.randomUUID(), inicio, fim, turno }));
  return [...build(manha, "manha"), ...build(tarde, "tarde"), ...build(noite, "noite")];
}

/** Uma disciplina é reoferta (semestre de paridade oposta à do período) ou optativa. */
function m3EhReofertaOuOptativa(disciplina) {
  const periodo = m3.db.periodosLetivos.find((p) => p.id === m3.periodoAtualId);
  if (!periodo) return false;
  if (disciplina.optativa) return true;
  const paridade = periodo.tipoSemestre === "impar" ? 1 : 0;
  return disciplina.semestreCurricular % 2 !== paridade;
}

// ─── Persistência (localStorage) ──

const M3_CHAVE_DB      = "horario_db_v1";
const M3_CHAVE_PERIODO = "sigac_horario_periodo_ativo_v1";

/** Salva o banco do Módulo 3 no localStorage (avisa o usuário se não conseguir). */
function m3Salvar() {
  salvarLocal(M3_CHAVE_DB, JSON.stringify(m3.db));
}

/** Define (e lembra para os próximos acessos) o período letivo ativo. */
function m3DefinirPeriodoAtivo(id) {
  m3.periodoAtualId = id || null;
  if (id) salvarLocal(M3_CHAVE_PERIODO, id);
  else { try { localStorage.removeItem(M3_CHAVE_PERIODO); } catch (_) { /* sem persistência */ } }
}

/** Escolhe o período ativo: o último usado, se ainda existir; senão o primeiro. */
function m3RestaurarPeriodoAtivo() {
  let salvo = null;
  try { salvo = localStorage.getItem(M3_CHAVE_PERIODO); } catch (_) { /* sem persistência */ }
  const existe = m3.db.periodosLetivos.some((p) => p.id === salvo);
  m3.periodoAtualId = existe ? salvo : (m3.db.periodosLetivos[0]?.id || null);
}

/**
 * Carrega o banco do Módulo 3 do localStorage (ou cria um vazio). Os dados passam pelo saneamento:
 * se algo estiver corrompido, o que é inválido é descartado em vez de quebrar o módulo.
 */
function m3Carregar() {
  let bruto = null;
  try {
    const salvo = localStorage.getItem(M3_CHAVE_DB);
    bruto = salvo ? JSON.parse(salvo) : null;
  } catch (_) {
    bruto = null;
  }
  if (bruto && typeof bruto === "object") m3MigrarAulas(bruto);
  const { db, descartados } = m3SanitizarBanco(bruto);
  m3.db = db;
  m3RestaurarPeriodoAtivo();
  if (descartados > 0) {
    m3Salvar();
    showToast(`${descartados} registro(s) inválido(s) do Horário foram descartados ao carregar.`, "err");
  }
}

// ─── Re-renderiza tudo (chamado ao entrar no módulo ou após qualquer mutação) ──

function m3RenderTudo() {
  if (!m3.db) return;
  m3RenderDisciplinas();
  m3RenderProfessores();
  m3RenderSalas();
  m3RenderPeriodos();
  m3AtualizarBadgePeriodo();
  m3RenderTurmasSidebar();
  m3RenderTurmasContent();
  m3RenderGradeSemestreTabs();
  m3RenderGradeSidebar();
  m3RenderGradeGrid();
  m3RenderEnsalamento();
  m3RenderAtribuirSidebar();
  m3RenderAtribuirContent();
}

// ═══════════════════════════════════════════════════════════════
