/**
 * @file js/modulos/horario/pdf.js
 * @description Módulo 3 — Horário de Aulas: relatórios em PDF (Horário e Ensalamento), com motor de tabela próprio.
 *
 * Os arquivos de js/modulos/horario/ formam UM módulo dividido por responsabilidade e
 * compartilham escopo (tudo prefixado com m3/M3_). Não dependem dos Módulos 1 e 2.
 */
"use strict";

// ─── Relatórios — PDF: motor de desenho de baixo nível, portado 1:1 do app desktop (pdfTable.ts / exportPdf.ts) ──

const M3_PDF_MARGEM = 28;

function m3HexRgb(hex) {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** Quebra o texto na largura dada e retorna a altura ocupada, sem desenhar. */
function m3AlturaTexto(doc, texto, largura, fontSize, bold = false) {
  doc.setFont("helvetica", bold ? "bold" : "normal");
  doc.setFontSize(fontSize);
  const linhas = doc.splitTextToSize(String(texto ?? " ") || " ", Math.max(largura, 1));
  return linhas.length * fontSize * 1.15;
}

/** Desenha texto com quebra automática, ancorado no topo (como pdfkit). Retorna a altura usada. */
function m3DesenharTexto(doc, texto, x, y, largura, { fontSize, align = "left", bold = false, color = [0, 0, 0] }) {
  doc.setFont("helvetica", bold ? "bold" : "normal");
  doc.setFontSize(fontSize);
  doc.setTextColor(color[0], color[1], color[2]);
  const linhas = texto ? doc.splitTextToSize(String(texto), Math.max(largura, 1)) : [];
  const lineHeight = fontSize * 1.15;
  linhas.forEach((linha, i) => {
    const tx = align === "center" ? x + largura / 2 : x;
    doc.text(linha, tx, y + i * lineHeight, { align: align === "center" ? "center" : "left", baseline: "top" });
  });
  doc.setTextColor(0, 0, 0);
  return linhas.length * lineHeight;
}

const M3_PDF_HEADER_FILL = m3HexRgb("#dddddd");
const M3_PDF_SUBHEADER_FILL = m3HexRgb("#eeeeee");
const M3_PDF_ZEBRA_FILL = m3HexRgb("#f7f7f7");
const M3_PDF_LOCAL_COLOR = m3HexRgb("#555555");
const M3_PDF_LINHA_FINA = m3HexRgb("#bbbbbb");
const M3_PDF_LARGURA_LINHA_FINA = 0.35;
const M3_PDF_LARGURA_LINHA_GROSSA = 1.1;

/**
 * Grade semanal com 3 subcolunas por dia (Disciplina | Turma | Local), com hierarquia de linhas
 * grossas (entre horários/dias) e finas (entre aulas simultâneas no mesmo horário) — porte 1:1
 * do motor `processarGradeGrid` usado no app desktop. `desenhar=false` só mede a altura total.
 */
function m3ProcessarGradeGridPdf(doc, x, y, opts, desenhar) {
  const padding = Math.max(1.5, opts.fontSize * 0.3);
  const fontSize = opts.fontSize;
  const headerFontSize = opts.headerFontSize ?? fontSize + 0.5;
  const [wDisc, wTurma, wLocal] = opts.colWidthsSub;
  const larguraDia = wDisc + wTurma + wLocal;
  const larguraTotal = opts.colWidthHorario + larguraDia * opts.dias.length;
  const pageBottomLimit = doc.internal.pageSize.getHeight() - M3_PDF_MARGEM;
  const fronteirasVerticaisX = [x, x + opts.colWidthHorario, ...opts.dias.map((_d, i) => x + opts.colWidthHorario + (i + 1) * larguraDia)];

  const alturaHeader1 = m3AlturaTexto(doc, "X", 40, headerFontSize, true) + padding * 2;
  const alturaHeader2 = alturaHeader1;

  function desenharCabecalhoGrade(curY) {
    if (!desenhar) return;
    doc.setDrawColor(...M3_PDF_LINHA_FINA);
    doc.setLineWidth(M3_PDF_LARGURA_LINHA_FINA);
    doc.setFillColor(...M3_PDF_HEADER_FILL);
    doc.rect(x, curY, larguraTotal, alturaHeader1 + alturaHeader2, "F");
    doc.rect(x, curY, opts.colWidthHorario, alturaHeader1 + alturaHeader2, "S");
    m3DesenharTexto(doc, "Horários", x + padding, curY + (alturaHeader1 + alturaHeader2) / 2 - headerFontSize / 2, opts.colWidthHorario - padding * 2, { fontSize: headerFontSize, align: "center", bold: true });

    let curX = x + opts.colWidthHorario;
    for (const dia of opts.dias) {
      doc.setFillColor(...M3_PDF_HEADER_FILL);
      doc.rect(curX, curY, larguraDia, alturaHeader1, "S");
      m3DesenharTexto(doc, dia.label, curX, curY + padding, larguraDia, { fontSize: headerFontSize, align: "center", bold: true });

      const subCols = [["Disciplina", wDisc], ["T", wTurma], ["Local", wLocal]];
      let subX = curX;
      subCols.forEach(([label, w]) => {
        doc.setFillColor(...M3_PDF_SUBHEADER_FILL);
        doc.rect(subX, curY + alturaHeader1, w, alturaHeader2, "F");
        doc.setDrawColor(...M3_PDF_LINHA_FINA);
        doc.setLineWidth(M3_PDF_LARGURA_LINHA_FINA);
        doc.rect(subX, curY + alturaHeader1, w, alturaHeader2, "S");
        m3DesenharTexto(doc, label, subX + padding, curY + alturaHeader1 + padding, w - padding * 2, { fontSize: headerFontSize - 0.5, align: "center", bold: true });
        subX += w;
      });
      curX += larguraDia;
    }
  }

  function desenharBordasGrossas(segY0, segY1, horizontais) {
    if (!desenhar) return;
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(M3_PDF_LARGURA_LINHA_GROSSA);
    for (const fy of horizontais) doc.line(x, fy, x + larguraTotal, fy);
    for (const fx of fronteirasVerticaisX) doc.line(fx, segY0, fx, segY1);
    doc.setLineWidth(1);
  }

  let curY = y;
  let segStartY = y;
  let horizontaisSegmento = [y];
  desenharCabecalhoGrade(curY);
  curY += alturaHeader1 + alturaHeader2;
  horizontaisSegmento.push(curY);

  let ultimoTurno = null;
  let zebra = false;
  for (const horario of opts.horarios) {
    let alturaSep = ultimoTurno && ultimoTurno !== horario.turno ? fontSize + padding * 2 : 0;
    ultimoTurno = horario.turno;

    const entradasPorDia = opts.dias.map((dia) => opts.celulas(horario.id, dia.chave));
    const maxConcorrentes = Math.max(1, ...entradasPorDia.map((e) => e.length));

    doc.setFontSize(fontSize);
    const alturasSubLinha = [];
    for (let k = 0; k < maxConcorrentes; k++) {
      let maxH = fontSize + padding * 2;
      entradasPorDia.forEach((entradas) => {
        const entrada = entradas[k];
        if (!entrada) return;
        const hDisc = m3AlturaTexto(doc, entrada.disciplina || " ", wDisc - padding * 2, fontSize, true);
        const hTurma = m3AlturaTexto(doc, entrada.turma || " ", wTurma - padding * 2, fontSize, false);
        const hLocal = m3AlturaTexto(doc, entrada.local || " ", wLocal - padding * 2, fontSize, false);
        const h = Math.max(hDisc, hTurma, hLocal) + padding * 2;
        if (h > maxH) maxH = h;
      });
      alturasSubLinha.push(maxH);
    }
    const alturaLinha = alturasSubLinha.reduce((a, b) => a + b, 0);

    // Rede de segurança: se nem essa linha (mais um eventual separador de turno) coube no que resta
    // da página — mesmo já na menor fonte candidata — quebra a página em vez de cortar o conteúdo,
    // repetindo o cabeçalho da grade no topo da nova página.
    if (desenhar && curY + alturaSep + alturaLinha > pageBottomLimit) {
      desenharBordasGrossas(segStartY, curY, horizontaisSegmento);
      doc.addPage();
      curY = M3_PDF_MARGEM;
      segStartY = curY;
      horizontaisSegmento = [curY];
      desenharCabecalhoGrade(curY);
      curY += alturaHeader1 + alturaHeader2;
      horizontaisSegmento.push(curY);
      alturaSep = 0;
    }

    if (alturaSep > 0) {
      if (desenhar) {
        doc.setDrawColor(...M3_PDF_LINHA_FINA);
        doc.setLineWidth(M3_PDF_LARGURA_LINHA_FINA);
        doc.rect(x, curY, larguraTotal, alturaSep, "S");
      }
      curY += alturaSep;
      horizontaisSegmento.push(curY);
    }

    if (desenhar) {
      if (zebra) {
        doc.setFillColor(...M3_PDF_ZEBRA_FILL);
        doc.rect(x, curY, larguraTotal, alturaLinha, "F");
      }
      doc.setDrawColor(...M3_PDF_LINHA_FINA);
      doc.setLineWidth(M3_PDF_LARGURA_LINHA_FINA);
      doc.rect(x, curY, opts.colWidthHorario, alturaLinha, "S");
      m3DesenharTexto(doc, horario.label, x + padding, curY + alturaLinha / 2 - fontSize / 2, opts.colWidthHorario - padding * 2, { fontSize, align: "center", bold: true });

      let curX = x + opts.colWidthHorario;
      opts.dias.forEach((_dia, di) => {
        const entradas = entradasPorDia[di];
        let subY = curY;
        for (let k = 0; k < maxConcorrentes; k++) {
          const h = alturasSubLinha[k];
          const entrada = entradas[k];
          const celulas = [
            [wDisc, entrada?.disciplina ?? "", true, [0, 0, 0], "left"],
            [wTurma, entrada?.turma ?? "", false, [0, 0, 0], "center"],
            [wLocal, entrada?.local ?? "", false, M3_PDF_LOCAL_COLOR, "left"]
          ];
          let subX = curX;
          celulas.forEach(([w, text, bold, cor, align]) => {
            doc.setDrawColor(...M3_PDF_LINHA_FINA);
            doc.setLineWidth(M3_PDF_LARGURA_LINHA_FINA);
            doc.rect(subX, subY, w, h, "S");
            if (text) m3DesenharTexto(doc, text, subX + padding, subY + padding, w - padding * 2, { fontSize, align, bold, color: cor });
            subX += w;
          });
          subY += h;
        }
        curX += larguraDia;
      });
    }
    curY += alturaLinha;
    horizontaisSegmento.push(curY);
    zebra = !zebra;
  }

  desenharBordasGrossas(segStartY, curY, horizontaisSegmento);

  return curY;
}

function m3MedirAlturaGradeGridPdf(doc, opts) { return m3ProcessarGradeGridPdf(doc, 0, 0, opts, false); }
function m3DesenharGradeGridPdf(doc, x, y, opts) { return m3ProcessarGradeGridPdf(doc, x, y, opts, true); }

/** Tabela simples com altura de linha variável e paginação automática — porte 1:1 de `drawTable`. */
function m3ProcessarTabelaPdf(doc, x, y, opts, desenhar) {
  const padding = opts.cellPadding ?? 4;
  const fontSize = opts.fontSize ?? 7;
  let curY = y;

  const alturaLinha = (cells, styles) => {
    let max = 0;
    cells.forEach((text, i) => {
      const style = styles?.[i];
      const fs = style?.fontSize ?? fontSize;
      const w = opts.colWidths[i] - padding * 2;
      const h = m3AlturaTexto(doc, text || " ", w, fs, !!style?.bold);
      if (h > max) max = h;
    });
    return max + padding * 2;
  };

  const desenharLinha = (cells, rowY, altura, styles) => {
    let curX = x;
    cells.forEach((text, i) => {
      const style = styles?.[i];
      const w = opts.colWidths[i];
      if (style?.fillColor) {
        doc.setFillColor(...m3HexRgb(style.fillColor));
        doc.rect(curX, rowY, w, altura, "F");
      }
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.5);
      doc.rect(curX, rowY, w, altura, "S");
      if (text) m3DesenharTexto(doc, text, curX + padding, rowY + padding, w - padding * 2, { fontSize: style?.fontSize ?? fontSize, align: style?.align ?? "left", bold: !!style?.bold });
      curX += w;
    });
  };

  if (opts.header) {
    const headerStyles = opts.header.map(() => opts.headerStyle ?? { bold: true, fillColor: "#dddddd" });
    const h = alturaLinha(opts.header, headerStyles);
    if (desenhar) desenharLinha(opts.header, curY, h, headerStyles);
    curY += h;
  }

  opts.rows.forEach((row, rowIdx) => {
    const styles = opts.cellStyles?.[rowIdx];
    const h = alturaLinha(row, styles);
    if (desenhar) {
      const pageHeight = doc.internal.pageSize.getHeight();
      if (curY + h > pageHeight - M3_PDF_MARGEM) {
        doc.addPage();
        curY = M3_PDF_MARGEM;
      }
      desenharLinha(row, curY, h, styles);
    }
    curY += h;
  });

  return curY;
}
function m3MeasureTableHeightPdf(doc, opts) { return m3ProcessarTabelaPdf(doc, 0, 0, opts, false); }
function m3DrawTablePdf(doc, x, y, opts) { return m3ProcessarTabelaPdf(doc, x, y, opts, true); }

/** Bloco de cabeçalho institucional (3 linhas) — porte 1:1 de `desenharCabecalho`. Retorna o Y final. */
function m3DesenharCabecalhoPdf(doc, periodoNome, titulo) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const contentWidth = pageWidth - 2 * M3_PDF_MARGEM;
  let y = M3_PDF_MARGEM;
  y += m3DesenharTexto(doc, "Fundação Universidade Federal de Mato Grosso do Sul", M3_PDF_MARGEM, y, contentWidth, { fontSize: 11, align: "center", bold: true });
  y += m3DesenharTexto(doc, "Faculdade de Odontologia", M3_PDF_MARGEM, y, contentWidth, { fontSize: 10, align: "center" });
  y += m3DesenharTexto(doc, `CURSO DE ODONTOLOGIA – ${titulo} ${periodoNome}`, M3_PDF_MARGEM, y, contentWidth, { fontSize: 10, align: "center", bold: true });
  return y + 6;
}

// ─── Relatórios — PDF ──

function m3ExportarPdfHorario() {
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

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const usableWidth = pageWidth - 2 * M3_PDF_MARGEM;
  const alturaDisponivel = pageHeight - 2 * M3_PDF_MARGEM;
  const ALTURA_CABECALHO_TITULO = 76;
  const dias = M3_DIAS.map((d) => ({ chave: String(d), label: M3_LABEL_DIA[d] }));
  const horarioColWidth = 46;
  const larguraPorDia = (usableWidth - horarioColWidth) / M3_DIAS.length;
  const colWidthsSub = [larguraPorDia * 0.28, larguraPorDia * 0.12, larguraPorDia * 0.6];
  const resumoHeader = ["Sigla", "Disciplina", "Nº est.", "CH Total", "CH/sem.", "Teóricas", "Práticas"];
  const larguraFixa = 50 + 55 + 60 + 55 + 55 + 85;

  grades.forEach((grade, idx) => {
    if (idx > 0) doc.addPage();

    const horariosGrid = grade.horarios.map((h) => ({ id: h.id, label: `${h.inicio}-${h.fim}`, turno: h.turno }));
    const celulasGrid = (horarioId, diaChave) => (grade.celulas.get(`${horarioId}|${diaChave}`) || []).map((c) => ({ disciplina: c.sigla, turma: c.turmaCodigo, local: c.salaNome }));
    const resumoColWidths = [50, usableWidth - larguraFixa, 55, 60, 55, 55, 85];

    const resumoRows = grade.disciplinas.map((d) => [
      d.sigla, d.nome, d.numEstudantes ? String(d.numEstudantes) : "-",
      `${d.chTotal}h`, m3HorasLabel(d.aulasTeoricasSemana + d.aulasPraticasSemana), m3HorasLabel(d.aulasTeoricasSemana), m3PraticasLabel(periodo.id, d)
    ]);
    const totalRow = [
      "", "Total", "",
      `${grade.disciplinas.reduce((s, d) => s + d.chTotal, 0)}h`,
      m3HorasLabel(grade.disciplinas.reduce((s, d) => s + d.aulasTeoricasSemana + d.aulasPraticasSemana, 0)),
      m3HorasLabel(grade.disciplinas.reduce((s, d) => s + d.aulasTeoricasSemana, 0)),
      m3HorasLabel(grade.disciplinas.reduce((s, d) => s + d.aulasPraticasSemana, 0))
    ];
    const resumoLinhas = [...resumoRows, totalRow];
    const resumoEstilos = [...resumoRows.map(() => undefined), totalRow.map(() => ({ bold: true, fillColor: "#f2f2f2" }))];

    const candidatosFonte = [7, 6.5, 6, 5.5, 5];
    let fonte = candidatosFonte[candidatosFonte.length - 1];
    for (const candidata of candidatosFonte) {
      const gridOpts = { horarios: horariosGrid, dias, celulas: celulasGrid, colWidthHorario: horarioColWidth, colWidthsSub, fontSize: candidata };
      const alturaGrid = m3MedirAlturaGradeGridPdf(doc, gridOpts);
      const alturaResumo = m3MeasureTableHeightPdf(doc, { header: resumoHeader, rows: resumoLinhas, colWidths: resumoColWidths, fontSize: candidata + 1 });
      if (ALTURA_CABECALHO_TITULO + alturaGrid + 10 + alturaResumo <= alturaDisponivel) { fonte = candidata; break; }
    }

    let y = m3DesenharCabecalhoPdf(doc, periodo.nome, "Horário");
    y += m3DesenharTexto(doc, grade.titulo.toUpperCase(), M3_PDF_MARGEM, y, usableWidth, { fontSize: 13, align: "center", bold: true });
    y += 6;

    const yAfterGrid = m3DesenharGradeGridPdf(doc, M3_PDF_MARGEM, y, { horarios: horariosGrid, dias, celulas: celulasGrid, colWidthHorario: horarioColWidth, colWidthsSub, fontSize: fonte });
    y = yAfterGrid + 10;

    m3DrawTablePdf(doc, M3_PDF_MARGEM, y, {
      header: resumoHeader,
      headerStyle: { bold: true, fillColor: "#eeeeee", align: "center", fontSize: fonte + 1 },
      rows: resumoLinhas, cellStyles: resumoEstilos, colWidths: resumoColWidths, fontSize: fonte + 1
    });
  });

  doc.save(`Horario-${periodo.nome.replace("/", "-")}.pdf`);
  showToast("PDF gerado.", "ok");
}

function m3ExportarPdfEnsalamento() {
  const periodo = m3ExigirPeriodo();
  if (!periodo) return;
  document.getElementById("m3FeedbackRelatorios").hidden = true;

  const ens = m3MontarEnsalamento(periodo);
  const grupos = ["teorica", "pratica", "outra"].map((tipo) => ({ tipo, salas: ens.salas.filter((s) => s.tipo === tipo) })).filter((g) => g.salas.length > 0);
  if (grupos.length === 0) {
    showFeedback("m3FeedbackRelatorios", "Nenhuma sala cadastrada para gerar o ensalamento.", "error");
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const usableWidth = pageWidth - 2 * M3_PDF_MARGEM;
  const salaColWidth = 90;
  const colunas = M3_DIAS.length * ens.turnos.length;
  const colWidth = (usableWidth - salaColWidth) / colunas;
  const colWidths = [salaColWidth, ...Array(colunas).fill(colWidth)];
  const header = ["Sala", ...M3_DIAS.flatMap((d) => ens.turnos.map((t) => `${M3_LABEL_DIA[d]}\n${M3_LABEL_TURNO[t]}`))];

  grupos.forEach((grupo, idx) => {
    if (idx > 0) doc.addPage();
    let y = m3DesenharCabecalhoPdf(doc, periodo.nome, "Ensalamento");
    y += m3DesenharTexto(doc, M3_LABEL_GRUPO_SALA[grupo.tipo].toUpperCase(), M3_PDF_MARGEM, y, usableWidth, { fontSize: 13, align: "center", bold: true });
    y += 6;

    const rows = grupo.salas.map((sala) => {
      const row = [sala.nome];
      M3_DIAS.forEach((dia) => {
        ens.turnos.forEach((turno) => {
          const chips = ens.celulas.get(`${sala.id}|${dia}|${turno}`) || [];
          row.push(chips.map((c) => `${c.sigla} ${c.turmaCodigo}\n${c.horarioLabel}`).join("\n"));
        });
      });
      return row;
    });

    m3DrawTablePdf(doc, M3_PDF_MARGEM, y, {
      header, headerStyle: { bold: true, fillColor: "#dddddd", align: "center", fontSize: 6.5 },
      rows, colWidths, fontSize: 6.5, cellPadding: 2.5
    });
  });

  doc.save(`Ensalamento-${periodo.nome.replace("/", "-")}.pdf`);
  showToast("PDF gerado.", "ok");
}
