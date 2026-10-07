/**
 * @file js/modulos/horario/turmas.js
 * @description Módulo 3 — Horário de Aulas: busca de disciplinas e aba Turmas.
 *
 * Os arquivos de js/modulos/horario/ formam UM módulo dividido por responsabilidade e
 * compartilham escopo (tudo prefixado com m3/M3_). Não dependem dos Módulos 1 e 2.
 */
"use strict";

// ─── Renderização — busca de disciplinas (Turmas / Grade) ──

function m3RenderDisciplinaBrowser(containerId, buscaInputId, selecionadaId) {
  const cont = document.getElementById(containerId);
  if (!cont) return;
  const busca = (document.getElementById(buscaInputId)?.value || "").trim().toLowerCase();
  let lista = m3.db.disciplinas;
  lista = busca
    ? lista.filter((d) => d.nome.toLowerCase().includes(busca) || d.sigla.toLowerCase().includes(busca))
    : lista.filter((d) => !m3EhReofertaOuOptativa(d));

  const porGrupo = new Map();
  for (const d of lista) {
    const chave = d.optativa ? "Optativas" : String(d.semestreCurricular);
    if (!porGrupo.has(chave)) porGrupo.set(chave, []);
    porGrupo.get(chave).push(d);
  }
  const grupos = [...porGrupo.keys()].sort((a, b) => {
    if (a === "Optativas") return 1;
    if (b === "Optativas") return -1;
    return Number(a) - Number(b);
  });
  if (grupos.length === 0) { cont.innerHTML = '<p class="empty-state">Nenhuma disciplina encontrada.</p>'; return; }

  cont.innerHTML = grupos.map((g) => `
    <div class="m3-sidebar-group">
      <div class="m3-sidebar-group-title">${g === "Optativas" ? "Optativas" : `${escapeHTML(g)}º Semestre`}</div>
      ${porGrupo.get(g).map((d) => `
        <div class="m3-disc-item ${d.id === selecionadaId ? "selected" : ""}" data-id="${escapeHTML(d.id)}">
          ${escapeHTML(d.sigla)}
          ${m3EhReofertaOuOptativa(d) ? `<span class="m3-flag">${d.optativa ? "optativa" : "reoferta"}</span>` : ""}
        </div>`).join("")}
    </div>`).join("");
}

function m3RenderTurmasSidebar() {
  m3RenderDisciplinaBrowser("m3TurmasSidebarLista", "m3TurmasBusca", m3.turmasDisciplinaId);
}

function m3TurmaChipHtml(t) {
  return `<span class="turma-chip" data-turma-id="${escapeHTML(t.id)}">${escapeHTML(t.codigo)}<button class="m3-chip-remove m3-del-turma" data-id="${escapeHTML(t.id)}" title="Excluir turma">✕</button></span>`;
}

function m3RenderTurmasContent() {
  const cont = document.getElementById("m3TurmasContent");
  if (!cont) return;
  const disciplina = m3.db.disciplinas.find((d) => d.id === m3.turmasDisciplinaId);
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

  let html = `<div class="card"><h3 style="font-size:16px;margin-bottom:2px">${escapeHTML(disciplina.sigla)} — <span class="field-hint" style="font-size:13px">${escapeHTML(disciplina.nome)}</span></h3></div>`;

  if (disciplina.aulasTeoricasSemana > 0) {
    html += `<div class="card">
      <div class="card-title violet">Teóricas</div>
      <div style="margin-bottom:10px">${teoricas.length === 0 ? '<p class="empty-state">Nenhuma turma teórica ainda.</p>' : teoricas.map(m3TurmaChipHtml).join("")}</div>
      <div class="fields-row">
        <input type="text" id="m3NovoCodigoT" placeholder="Ex: T01" style="max-width:110px">
        <button class="btn btn-outline btn-sm m3-criar-turma" data-tipo="T">+ turma teórica</button>
      </div>
    </div>`;
  }
  if (disciplina.aulasPraticasSemana > 0) {
    html += `<div class="card">
      <div class="card-title violet">Práticas</div>
      <p class="field-hint" style="margin-bottom:10px">Se um código prático (ex: "P3") tiver várias unidades paralelas, crie-o de novo com o mesmo código: a numeração (P31, P32...) é automática.</p>
      ${[...gruposPraticos.entries()].map(([codigoBase, membros]) => `
        <div style="margin-bottom:8px">
          <div class="field-hint" style="margin-bottom:3px">Grupo ${escapeHTML(codigoBase)}</div>
          <div>${membros.slice().sort((a, b) => a.ordem - b.ordem).map(m3TurmaChipHtml).join("")}</div>
        </div>`).join("")}
      <div class="fields-row">
        <input type="text" id="m3NovoCodigoP" placeholder="Ex: P3" style="max-width:110px">
        <button class="btn btn-outline btn-sm m3-criar-turma" data-tipo="P">+ grupo prático</button>
      </div>
    </div>`;
  }
  if (disciplina.aulasTeoricasSemana === 0 && disciplina.aulasPraticasSemana === 0) {
    html += `<div class="card"><p class="empty-state">Esta disciplina não tem horas teóricas nem práticas cadastradas — ajuste isso na aba "Cadastro".</p></div>`;
  }

  cont.innerHTML = html;
}
