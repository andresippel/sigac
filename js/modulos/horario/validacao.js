/**
 * @file js/modulos/horario/validacao.js
 * @description Módulo 3 — Horário de Aulas: validação e saneamento do banco de dados.
 *
 * Todo dado que entra no módulo vindo de fora (importação de backup, localStorage) passa por
 * m3SanitizarBanco(): só campos conhecidos são mantidos, com tipo e formato conferidos. Assim um
 * arquivo malformado ou malicioso não consegue quebrar a tela nem injetar HTML (ids precisam ter
 * formato seguro, números precisam ser números, enums ficam restritos aos valores válidos).
 *
 * Os arquivos de js/modulos/horario/ formam UM módulo dividido por responsabilidade e
 * compartilham escopo (tudo prefixado com m3/M3_). Não dependem dos Módulos 1 e 2.
 */
"use strict";

const M3_ID_VALIDO     = /^[A-Za-z0-9_.:-]{1,80}$/;
const M3_HORA_VALIDA   = /^\d{1,2}:\d{2}$/;
const M3_CHAVES_PROIBIDAS = new Set(["__proto__", "constructor", "prototype"]);

/**
 * Valida um banco do Módulo 3 e devolve uma cópia limpa (objetos novos, só campos conhecidos).
 * Registros inválidos ou órfãos (que apontam para algo que não existe) são descartados e contados.
 * @param {any} bruto — objeto lido de JSON
 * @returns {{db: object, descartados: number}}
 */
function m3SanitizarBanco(bruto) {
  let descartados = 0;
  const origem = bruto && typeof bruto === "object" ? bruto : {};

  const ehObjeto = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
  const id       = (x) => (typeof x === "string" && M3_ID_VALIDO.test(x) && !M3_CHAVES_PROIBIDAS.has(x) ? x : null);
  const texto    = (x, max = 300) => (typeof x === "string" || typeof x === "number" ? String(x).slice(0, max) : "");
  const textoOpc = (x, max = 300) => { const t = texto(x, max).trim(); return t ? t : undefined; };
  const numero   = (x, min, max, padrao) => {
    const n = typeof x === "string" && x.trim() !== "" ? Number(x) : x;
    return typeof n === "number" && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : padrao;
  };
  const inteiro  = (x, min, max, padrao) => { const n = numero(x, min, max, undefined); return n === undefined ? padrao : Math.round(n); };

  /** Converte uma lista bruta em lista limpa, sem ids repetidos, contando o que foi descartado. */
  const lista = (itens, construir) => {
    const vistos = new Set();
    const saida  = [];
    (Array.isArray(itens) ? itens : []).forEach((item) => {
      const limpo = ehObjeto(item) ? construir(item) : null;
      if (!limpo || vistos.has(limpo.id)) { descartados++; return; }
      vistos.add(limpo.id);
      saida.push(limpo);
    });
    return saida;
  };

  const disciplinas = lista(origem.disciplinas, (d) => {
    if (!id(d.id)) return null;
    return {
      id: d.id,
      nome: texto(d.nome),
      sigla: texto(d.sigla, 40),
      semestreCurricular: inteiro(d.semestreCurricular, 1, 20, 1),
      chTotal: numero(d.chTotal, 0, 5000, 0),
      numEstudantes: numero(d.numEstudantes, 0, 5000, undefined),
      aulasTeoricasSemana: numero(d.aulasTeoricasSemana, 0, 100, 0),
      aulasPraticasSemana: numero(d.aulasPraticasSemana, 0, 100, 0),
      optativa: d.optativa === true ? true : undefined,
    };
  });

  const professores = lista(origem.professores, (p) => id(p.id)
    ? { id: p.id, nome: texto(p.nome), observacao: textoOpc(p.observacao) }
    : null);

  const salas = lista(origem.salas, (s) => id(s.id)
    ? { id: s.id, nome: texto(s.nome), tipo: textoOpc(s.tipo, 60) }
    : null);

  const TURNOS = new Set(["manha", "tarde", "noite"]);
  const periodosLetivos = lista(origem.periodosLetivos, (p) => {
    if (!id(p.id)) return null;
    const horarios = lista(p.horarios, (h) => (id(h.id) && TURNOS.has(h.turno) && M3_HORA_VALIDA.test(h.inicio) && M3_HORA_VALIDA.test(h.fim))
      ? { id: h.id, inicio: h.inicio, fim: h.fim, turno: h.turno }
      : null);
    return { id: p.id, nome: texto(p.nome, 60), tipoSemestre: p.tipoSemestre === "par" ? "par" : "impar", horarios };
  });

  const periodoIds    = new Set(periodosLetivos.map((p) => p.id));
  const disciplinaIds = new Set(disciplinas.map((d) => d.id));
  const turmas = lista(origem.turmas, (t) => {
    if (!id(t.id) || !periodoIds.has(t.periodoLetivoId) || !disciplinaIds.has(t.disciplinaId)) return null;
    const codigo = texto(t.codigo, 40);
    return {
      id: t.id,
      periodoLetivoId: t.periodoLetivoId,
      disciplinaId: t.disciplinaId,
      codigo,
      tipoBase: t.tipoBase === "P" ? "P" : "T",
      codigoBase: texto(t.codigoBase ?? codigo, 40),
      ordem: inteiro(t.ordem, 1, 999, 1),
    };
  });

  const turmaIds     = new Set(turmas.map((t) => t.id));
  const professorIds = new Set(professores.map((p) => p.id));
  const salaIds      = new Set(salas.map((s) => s.id));
  const horarioIdsPorPeriodo = new Map(periodosLetivos.map((p) => [p.id, new Set(p.horarios.map((h) => h.id))]));

  const aulas = lista(origem.aulas, (a) => {
    if (!id(a.id) || !turmaIds.has(a.turmaId) || !periodoIds.has(a.periodoLetivoId)) return null;
    if (!horarioIdsPorPeriodo.get(a.periodoLetivoId).has(a.horarioId)) return null;
    const dia = inteiro(a.diaSemana, 2, 6, null);
    if (dia === null) return null;
    return {
      id: a.id,
      periodoLetivoId: a.periodoLetivoId,
      turmaId: a.turmaId,
      salaId: salaIds.has(a.salaId) ? a.salaId : undefined,
      salaExternaNome: textoOpc(a.salaExternaNome),
      salaId2: salaIds.has(a.salaId2) ? a.salaId2 : undefined,
      salaExternaNome2: textoOpc(a.salaExternaNome2),
      professorIds: [...new Set((Array.isArray(a.professorIds) ? a.professorIds : []).filter((pid) => professorIds.has(pid)))],
      diaSemana: dia,
      horarioId: a.horarioId,
      duracaoSlots: inteiro(a.duracaoSlots, 1, 12, 1),
    };
  });

  const aulaIds = new Set(aulas.map((a) => a.id));
  const subgrupos = lista(origem.subgrupos, (s) => {
    if (!id(s.id) || !turmaIds.has(s.turmaId)) return null;
    const professorPorAula = {};
    if (ehObjeto(s.professorPorAula)) {
      Object.keys(s.professorPorAula).forEach((aulaId) => {
        const pid = s.professorPorAula[aulaId];
        if (!M3_CHAVES_PROIBIDAS.has(aulaId) && aulaIds.has(aulaId) && professorIds.has(pid)) professorPorAula[aulaId] = pid;
      });
    }
    return { id: s.id, turmaId: s.turmaId, ordem: inteiro(s.ordem, 1, 999, 1), professorPorAula };
  });

  return { db: { disciplinas, professores, salas, periodosLetivos, turmas, aulas, subgrupos }, descartados };
}
