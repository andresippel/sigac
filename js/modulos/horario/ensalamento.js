/**
 * @file js/modulos/horario/ensalamento.js
 * @description Módulo 3 — Horário de Aulas: aba Ensalamento (grade por sala).
 *
 * Os arquivos de js/modulos/horario/ formam UM módulo dividido por responsabilidade e
 * compartilham escopo (tudo prefixado com m3/M3_). Não dependem dos Módulos 1 e 2.
 */
"use strict";

// ─── Renderização — Ensalamento (interativo, por sala) ──

function m3RenderEnsalamento() {
  const wrap = document.getElementById("m3EnsalamentoWrap");
  if (!wrap) return;
  const periodo = m3.db.periodosLetivos.find((p) => p.id === m3.periodoAtualId);
  if (!periodo) { wrap.innerHTML = '<p class="empty-state">Crie e selecione um período letivo primeiro.</p>'; return; }
  if (m3.db.salas.length === 0) { wrap.innerHTML = '<p class="empty-state">Cadastre salas na aba "Cadastro" para usar o ensalamento.</p>'; return; }

  const turnosPresentes = ["manha", "tarde", "noite"].filter((t) => periodo.horarios.some((h) => h.turno === t));
  const horarioById = new Map(periodo.horarios.map((h) => [h.id, h]));
  const turmaById = new Map(m3.db.turmas.filter((t) => t.periodoLetivoId === periodo.id).map((t) => [t.id, t]));
  const disciplinaById = new Map(m3.db.disciplinas.map((d) => [d.id, d]));
  const aulasDoPeriodo = m3.db.aulas.filter((a) => a.periodoLetivoId === periodo.id);

  const aulasNaCelula = (salaId, dia, turno) => aulasDoPeriodo.filter((a) => {
    if (a.salaId !== salaId && a.salaId2 !== salaId) return false;
    if (a.diaSemana !== dia) return false;
    return horarioById.get(a.horarioId)?.turno === turno;
  });

  const grupos = ["teorica", "pratica", "outra"]
    .map((tipo) => ({ tipo, salas: m3.db.salas.filter((s) => m3NormalizarTipoSala(s.tipo) === tipo).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")) }))
    .filter((g) => g.salas.length > 0);

  wrap.innerHTML = grupos.map((grupo) => {
    let table = `<table class="schedule-table"><thead><tr><th rowspan="2">Sala</th>`;
    M3_DIAS.forEach((dia) => { table += `<th colspan="${escapeHTML(turnosPresentes.length)}">${M3_LABEL_DIA[dia]}</th>`; });
    table += `</tr><tr>`;
    M3_DIAS.forEach(() => { turnosPresentes.forEach((turno) => { table += `<th>${M3_LABEL_TURNO[turno]}</th>`; }); });
    table += `</tr></thead><tbody>`;
    grupo.salas.forEach((sala) => {
      table += `<tr><td class="horario-col">${escapeHTML(sala.nome)}</td>`;
      M3_DIAS.forEach((dia) => {
        turnosPresentes.forEach((turno) => {
          const lista = aulasNaCelula(sala.id, dia, turno);
          table += `<td class="dia-col" data-sala-id="${escapeHTML(sala.id)}" data-dia="${escapeHTML(dia)}" data-turno="${escapeHTML(turno)}">`;
          lista.forEach((a) => {
            const turma = turmaById.get(a.turmaId);
            const disciplina = turma ? disciplinaById.get(turma.disciplinaId) : null;
            table += `<div class="aula-chip m3-ens-editar" data-aula-id="${escapeHTML(a.id)}">
              <span class="sigla">${escapeHTML(disciplina ? disciplina.sigla : "?")}</span> ${escapeHTML(turma ? turma.codigo : "")}<br>
              ${escapeHTML(m3RangeHorarioAula(periodo, a))}
            </div>`;
          });
          table += `<button type="button" class="btn-icon m3-ens-nova" data-sala-id="${escapeHTML(sala.id)}" data-dia="${escapeHTML(dia)}" data-turno="${escapeHTML(turno)}" style="font-size:10px;padding:2px 6px;width:auto;height:auto">+ aula</button>`;
          table += "</td>";
        });
      });
      table += "</tr>";
    });
    table += "</tbody></table>";
    return `<div style="margin-bottom:28px"><h3 style="margin-bottom:10px">${M3_LABEL_GRUPO_SALA[grupo.tipo]}</h3><div style="overflow:auto">${table}</div></div>`;
  }).join("");
}
