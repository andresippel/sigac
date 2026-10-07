/**
 * @file js/modulos/horario/word.js
 * @description Módulo 3 — Horário de Aulas: relatórios em Word (.docx) via biblioteca docx.
 *
 * Os arquivos de js/modulos/horario/ formam UM módulo dividido por responsabilidade e
 * compartilham escopo (tudo prefixado com m3/M3_). Não dependem dos Módulos 1 e 2.
 */
"use strict";

// ─── Relatórios — Word (.docx), via a mesma lib "docx" do app desktop ──

const M3_DOCX_BORDA = { style: "single", size: 2, color: "CCCCCC" };
const M3_DOCX_BORDAS_CELULA = { top: M3_DOCX_BORDA, bottom: M3_DOCX_BORDA, left: M3_DOCX_BORDA, right: M3_DOCX_BORDA };

function m3DocxCelula(texto, opts = {}) {
  const linhas = texto.length > 0 ? texto.split("\n") : [""];
  return new docx.TableCell({
    width: opts.widthPct !== undefined ? { size: opts.widthPct, type: docx.WidthType.PERCENTAGE } : undefined,
    verticalAlign: docx.VerticalAlign.CENTER,
    shading: opts.fill ? { fill: opts.fill } : undefined,
    borders: M3_DOCX_BORDAS_CELULA,
    margins: { top: 40, bottom: 40, left: 60, right: 60 },
    children: linhas.map((linha) => new docx.Paragraph({
      alignment: opts.align ?? docx.AlignmentType.LEFT,
      children: [new docx.TextRun({ text: linha, bold: opts.bold, size: 16 })]
    }))
  });
}

function m3DocxTabela(header, rows, colWidthsPct) {
  const headerRow = new docx.TableRow({
    tableHeader: true,
    children: header.map((h, i) => m3DocxCelula(h, { bold: true, fill: "DDDDDD", align: docx.AlignmentType.CENTER, widthPct: colWidthsPct[i] }))
  });
  const bodyRows = rows.map((row) => new docx.TableRow({ children: row.map((v, i) => m3DocxCelula(v, { widthPct: colWidthsPct[i] })) }));
  return new docx.Table({ width: { size: 100, type: docx.WidthType.PERCENTAGE }, rows: [headerRow, ...bodyRows] });
}

function m3DocxCabecalho(periodoNome, titulo) {
  return [
    new docx.Paragraph({ alignment: docx.AlignmentType.CENTER, children: [new docx.TextRun({ text: "Fundação Universidade Federal de Mato Grosso do Sul", bold: true, size: 22 })] }),
    new docx.Paragraph({ alignment: docx.AlignmentType.CENTER, children: [new docx.TextRun({ text: "Faculdade de Odontologia", size: 20 })] }),
    new docx.Paragraph({ alignment: docx.AlignmentType.CENTER, spacing: { after: 200 }, children: [new docx.TextRun({ text: `CURSO DE ODONTOLOGIA – ${titulo} ${periodoNome}`, bold: true, size: 20 })] })
  ];
}

async function m3ExportarDocxHorario() {
  const periodo = m3ExigirPeriodo();
  if (!periodo) return;
  document.getElementById("m3FeedbackRelatorios").hidden = true;

  const semestres = m3SemestresDoPeriodo(periodo);
  const grades = semestres.map((n) => m3MontarGradeSemestre(periodo, n));
  if (m3DisciplinasReofertaOuOptativas(periodo).length > 0) grades.push(m3MontarGradeReoferta(periodo));
  if (grades.every((g) => g.disciplinas.length === 0)) {
    showFeedback("m3FeedbackRelatorios", "Nenhuma disciplina cadastrada para gerar o horário.", "error");
    return;
  }

  const sections = grades.map((grade) => {
    const children = [...m3DocxCabecalho(periodo.nome, "Horário")];
    children.push(new docx.Paragraph({ alignment: docx.AlignmentType.CENTER, spacing: { after: 200 }, children: [new docx.TextRun({ text: grade.titulo.toUpperCase(), bold: true, size: 26 })] }));

    const gradeHeader = ["Horários", ...M3_DIAS.map((d) => M3_LABEL_DIA[d])];
    const gradeColWidths = [10, ...M3_DIAS.map(() => 90 / M3_DIAS.length)];
    const gradeRows = [];
    let lastTurno = null;
    for (const horario of grade.horarios) {
      if (lastTurno && lastTurno !== horario.turno) gradeRows.push(gradeHeader.map(() => ""));
      lastTurno = horario.turno;
      const row = [`${horario.inicio}-${horario.fim}`];
      M3_DIAS.forEach((dia) => {
        const chips = grade.celulas.get(`${horario.id}|${dia}`) || [];
        row.push(chips.map((c) => `${c.sigla} - ${c.turmaCodigo} - ${c.salaNome}`).join("\n"));
      });
      gradeRows.push(row);
    }
    children.push(m3DocxTabela(gradeHeader, gradeRows, gradeColWidths));
    children.push(new docx.Paragraph({ spacing: { before: 200 }, children: [] }));

    const resumoHeader = ["Sigla", "Disciplina", "Nº est.", "CH Total", "CH/sem.", "Teóricas", "Práticas"];
    const resumoColWidths = [8, 34, 8, 10, 10, 10, 12];
    const resumoRows = grade.disciplinas.map((d) => [
      d.sigla, d.nome, d.numEstudantes ? String(d.numEstudantes) : "-",
      `${d.chTotal}h`, m3HorasLabel(d.aulasTeoricasSemana + d.aulasPraticasSemana), m3HorasLabel(d.aulasTeoricasSemana), m3PraticasLabel(periodo.id, d)
    ]);
    children.push(m3DocxTabela(resumoHeader, resumoRows, resumoColWidths));

    return { properties: { page: { size: { orientation: docx.PageOrientation.LANDSCAPE } } }, children };
  });

  const doc = new docx.Document({ sections });
  const blob = await docx.Packer.toBlob(doc);
  downloadBlob(blob, `Horario-${periodo.nome.replace("/", "-")}.docx`);
  showToast("Documento Word gerado.", "ok");
}

async function m3ExportarDocxEnsalamento() {
  const periodo = m3ExigirPeriodo();
  if (!periodo) return;
  document.getElementById("m3FeedbackRelatorios").hidden = true;

  const ens = m3MontarEnsalamento(periodo);
  const grupos = ["teorica", "pratica", "outra"].map((tipo) => ({ tipo, salas: ens.salas.filter((s) => s.tipo === tipo) })).filter((g) => g.salas.length > 0);
  if (grupos.length === 0) {
    showFeedback("m3FeedbackRelatorios", "Nenhuma sala cadastrada para gerar o ensalamento.", "error");
    return;
  }

  const colunas = M3_DIAS.length * ens.turnos.length;
  const header = ["Sala", ...M3_DIAS.flatMap((d) => ens.turnos.map((t) => `${M3_LABEL_DIA[d]} ${M3_LABEL_TURNO[t]}`))];
  const colWidths = [12, ...Array(colunas).fill((100 - 12) / colunas)];

  const sections = grupos.map((grupo) => {
    const children = [...m3DocxCabecalho(periodo.nome, "Ensalamento")];
    children.push(new docx.Paragraph({ alignment: docx.AlignmentType.CENTER, spacing: { after: 200 }, children: [new docx.TextRun({ text: M3_LABEL_GRUPO_SALA[grupo.tipo].toUpperCase(), bold: true, size: 26 })] }));

    const rows = grupo.salas.map((sala) => {
      const row = [sala.nome];
      M3_DIAS.forEach((dia) => {
        ens.turnos.forEach((turno) => {
          const chips = ens.celulas.get(`${sala.id}|${dia}|${turno}`) || [];
          row.push(chips.map((c) => `${c.sigla} ${c.turmaCodigo} (${c.horarioLabel})`).join("\n"));
        });
      });
      return row;
    });
    children.push(m3DocxTabela(header, rows, colWidths));

    return { properties: { page: { size: { orientation: docx.PageOrientation.LANDSCAPE } } }, children };
  });

  const doc = new docx.Document({ sections });
  const blob = await docx.Packer.toBlob(doc);
  downloadBlob(blob, `Ensalamento-${periodo.nome.replace("/", "-")}.docx`);
  showToast("Documento Word gerado.", "ok");
}
