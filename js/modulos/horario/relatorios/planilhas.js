/**
 * @file js/modulos/horario/planilhas.js
 * @description Módulo 3 — Horário de Aulas: relatórios em planilha (.xlsx) via ExcelJS.
 *
 * Os arquivos de js/modulos/horario/ formam UM módulo dividido por responsabilidade e
 * compartilham escopo (tudo prefixado com m3/M3_). Não dependem dos Módulos 1 e 2.
 */
"use strict";

// ─── Relatórios — planilhas (.xlsx), via ExcelJS (mesma biblioteca do app desktop) ──

const M3_XLSX_HEADER_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDDDDDD" } };

function m3SemestreLabel(d) {
  return d.optativa ? "Optativa" : d.semestreCurricular;
}

function m3EstilizarCabecalhoXlsx(sheet) {
  sheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = M3_XLSX_HEADER_FILL;
  });
}

async function m3ExportarXlsxDistribuicao() {
  const periodo = m3ExigirPeriodo();
  if (!periodo) return;
  document.getElementById("m3FeedbackRelatorios").hidden = true;

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Distribuição de Professores");
  sheet.columns = [
    { header: "Semestre", key: "semestre", width: 10 },
    { header: "Disciplina", key: "disciplina", width: 45 },
    { header: "Turma", key: "turma", width: 10 },
    { header: "Professor", key: "professor", width: 30 },
    { header: "Dia", key: "dia", width: 12 },
    { header: "Horário", key: "horario", width: 14 },
    { header: "Sala", key: "sala", width: 20 }
  ];

  const distribuicao = m3MontarDistribuicaoProfessores(periodo);
  distribuicao.forEach((item) => {
    if (item.turmas.length === 0) { sheet.addRow({ semestre: m3SemestreLabel(item.disciplina), disciplina: item.disciplina.nome }); return; }
    item.turmas.forEach((turma) => {
      if (turma.aulas.length === 0) { sheet.addRow({ semestre: m3SemestreLabel(item.disciplina), disciplina: item.disciplina.nome, turma: turma.codigo, professor: "(sem horário na grade)" }); return; }
      turma.aulas.forEach((aula) => {
        sheet.addRow({
          semestre: m3SemestreLabel(item.disciplina), disciplina: item.disciplina.nome, turma: turma.codigo,
          professor: aula.professores.length > 0 ? aula.professores.join(", ") : "(sem professor)",
          dia: M3_LABEL_DIA[aula.dia], horario: aula.horarioLabel, sala: aula.sala
        });
      });
    });
  });
  m3EstilizarCabecalhoXlsx(sheet);

  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `Distribuicao-Professores-${periodo.nome.replace("/", "-")}.xlsx`);
  showToast("Planilha gerada.", "ok");
}

async function m3ExportarXlsxCargaHoraria() {
  const periodo = m3ExigirPeriodo();
  if (!periodo) return;
  document.getElementById("m3FeedbackRelatorios").hidden = true;

  const cargas = m3MontarCargaHoraria(periodo);
  if (cargas.length === 0) {
    showFeedback("m3FeedbackRelatorios", "Nenhum professor com aula atribuída neste período.", "error");
    return;
  }

  const workbook = new ExcelJS.Workbook();
  const resumo = workbook.addWorksheet("Carga Horária - Resumo");
  resumo.columns = [
    { header: "Professor", key: "professor", width: 35 },
    { header: "Horas-aula/semana", key: "horas", width: 20 }
  ];
  const detalhe = workbook.addWorksheet("Carga Horária - Detalhe");
  detalhe.columns = [
    { header: "Professor", key: "professor", width: 35 },
    { header: "Disciplina", key: "disciplina", width: 45 },
    { header: "Turma", key: "turma", width: 10 },
    { header: "Horas neste encontro", key: "horas", width: 20 },
    { header: "Dia", key: "dia", width: 12 },
    { header: "Horário", key: "horario", width: 14 },
    { header: "Sala", key: "sala", width: 20 }
  ];

  cargas.forEach((c) => {
    resumo.addRow({ professor: c.professorNome, horas: c.totalSlotsSemana });
    c.detalhe.forEach((d) => {
      detalhe.addRow({ professor: c.professorNome, disciplina: d.disciplinaNome, turma: d.turmaCodigo, horas: d.slots, dia: M3_LABEL_DIA[d.dia], horario: d.horarioLabel, sala: d.sala });
    });
  });
  m3EstilizarCabecalhoXlsx(resumo);
  m3EstilizarCabecalhoXlsx(detalhe);

  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `Carga-Horaria-Professores-${periodo.nome.replace("/", "-")}.xlsx`);
  showToast("Planilha gerada.", "ok");
}
