/**
 * @file js/modulos/horario/cadastro.js
 * @description Módulo 3 — Horário de Aulas: renderização das abas Cadastro (disciplinas, professores, salas) e Período Letivo.
 *
 * Os arquivos de js/modulos/horario/ formam UM módulo dividido por responsabilidade e
 * compartilham escopo (tudo prefixado com m3/M3_). Não dependem dos Módulos 1 e 2.
 */
"use strict";

// ─── Renderização — Cadastro ──

function m3RenderDisciplinas() {
  const cont = document.getElementById("m3TabelaDisciplinas");
  if (!cont) return;
  const porGrupo = new Map();
  for (const d of m3.db.disciplinas) {
    const chave = d.optativa ? "Optativas" : String(d.semestreCurricular);
    if (!porGrupo.has(chave)) porGrupo.set(chave, []);
    porGrupo.get(chave).push(d);
  }
  const grupos = [...porGrupo.keys()].sort((a, b) => {
    if (a === "Optativas") return 1;
    if (b === "Optativas") return -1;
    return Number(a) - Number(b);
  });
  if (grupos.length === 0) { cont.innerHTML = '<p class="empty-state">Nenhuma disciplina cadastrada ainda.</p>'; return; }

  cont.innerHTML = grupos.map((g) => {
    const lista = porGrupo.get(g).slice().sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    const titulo = g === "Optativas" ? "Optativas" : `${g}º Semestre`;
    const linhas = lista.map((d) => `
      <tr data-id="${escapeHTML(d.id)}">
        <td><input type="text" class="m3-edit" data-colecao="disciplinas" data-campo="sigla" value="${escapeHTML(d.sigla)}" style="width:80px"></td>
        <td><input type="text" class="m3-edit" data-colecao="disciplinas" data-campo="nome" value="${escapeHTML(d.nome)}"></td>
        <td class="col-narrow"><input type="number" class="m3-edit" data-colecao="disciplinas" data-campo="numEstudantes" value="${escapeHTML(d.numEstudantes ?? "")}" min="0"></td>
        <td class="col-narrow"><input type="number" class="m3-edit" data-colecao="disciplinas" data-campo="chTotal" value="${escapeHTML(d.chTotal)}" min="0"></td>
        <td class="col-narrow"><input type="number" class="m3-edit" data-colecao="disciplinas" data-campo="aulasTeoricasSemana" value="${escapeHTML(d.aulasTeoricasSemana)}" min="0"></td>
        <td class="col-narrow"><input type="number" class="m3-edit" data-colecao="disciplinas" data-campo="aulasPraticasSemana" value="${escapeHTML(d.aulasPraticasSemana)}" min="0"></td>
        <td class="col-icon"><input type="checkbox" class="m3-edit-check" data-colecao="disciplinas" data-campo="optativa" ${d.optativa ? "checked" : ""}></td>
        <td class="col-icon"><button class="btn-icon m3-del" data-colecao="disciplinas" title="Excluir disciplina">✕</button></td>
      </tr>`).join("");
    return `<div style="margin-bottom:20px">
      <div class="card-title violet" style="margin-bottom:8px;font-size:11.5px">${escapeHTML(titulo)}</div>
      <table class="data-table"><thead><tr>
        <th>Sigla</th><th>Nome</th><th>Nº est.</th><th>CH total</th><th>Teór./sem</th><th>Prát./sem</th><th>Optativa</th><th></th>
      </tr></thead><tbody>${linhas}</tbody></table>
    </div>`;
  }).join("");
}

function m3RenderProfessores() {
  const tbody = document.getElementById("m3TabelaProfessores");
  if (!tbody) return;
  if (m3.db.professores.length === 0) { tbody.innerHTML = '<tr><td colspan="3" class="empty-state">Nenhum professor cadastrado.</td></tr>'; return; }
  tbody.innerHTML = m3.db.professores.slice().sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")).map((p) => `
    <tr data-id="${escapeHTML(p.id)}">
      <td><input type="text" class="m3-edit" data-colecao="professores" data-campo="nome" value="${escapeHTML(p.nome)}"></td>
      <td><input type="text" class="m3-edit" data-colecao="professores" data-campo="observacao" value="${escapeHTML(p.observacao || "")}"></td>
      <td class="col-icon"><button class="btn-icon m3-del" data-colecao="professores" title="Excluir professor">✕</button></td>
    </tr>`).join("");
}

function m3RenderSalas() {
  const tbody = document.getElementById("m3TabelaSalas");
  if (!tbody) return;
  if (m3.db.salas.length === 0) { tbody.innerHTML = '<tr><td colspan="3" class="empty-state">Nenhuma sala cadastrada.</td></tr>'; return; }
  tbody.innerHTML = m3.db.salas.slice().sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")).map((s) => `
    <tr data-id="${escapeHTML(s.id)}">
      <td><input type="text" class="m3-edit" data-colecao="salas" data-campo="nome" value="${escapeHTML(s.nome)}"></td>
      <td><input type="text" class="m3-edit" data-colecao="salas" data-campo="tipo" value="${escapeHTML(s.tipo || "")}"></td>
      <td class="col-icon"><button class="btn-icon m3-del" data-colecao="salas" title="Excluir sala">✕</button></td>
    </tr>`).join("");
}

// ─── Renderização — Período Letivo ──

function m3RenderPeriodos() {
  const cont = document.getElementById("m3ListaPeriodos");
  if (!cont) return;
  if (m3.db.periodosLetivos.length === 0) { cont.innerHTML = '<p class="empty-state">Nenhum período cadastrado ainda.</p>'; return; }
  cont.innerHTML = m3.db.periodosLetivos.map((p) => {
    const ativo = p.id === m3.periodoAtualId;
    return `
    <div class="m3-disc-item ${ativo ? "selected" : ""}" data-id="${escapeHTML(p.id)}" style="justify-content:space-between;padding:10px 12px;border:1px solid var(--gray-200);border-radius:8px;margin-bottom:6px">
      <span><strong>${escapeHTML(p.nome)}</strong>
        <span class="field-hint">— ${p.tipoSemestre === "impar" ? "semestres ímpares" : "semestres pares"}${ativo ? " · ativo" : ""}</span>
      </span>
      <button class="btn-icon m3-del-periodo" data-id="${escapeHTML(p.id)}" title="Excluir período">✕</button>
    </div>`;
  }).join("");
}

function m3AtualizarBadgePeriodo() {
  const periodo = m3.db.periodosLetivos.find((p) => p.id === m3.periodoAtualId);
  setBadge("badgePeriodo", "badgePeriodoNome", periodo ? periodo.nome : "Nenhum período", periodo ? "ok" : "idle");
}
