/**
 * @file js/core/utils.js
 * @description Utilitários puros compartilhados por todos os módulos (sem DOM, sem estado).
 * Carregado primeiro. Mudanças aqui afetam TODOS os módulos — mexa com cuidado.
 */
"use strict";

/**
 * Normaliza uma string para comparação: remove acentos,
 * converte para maiúsculas e elimina espaços nas extremidades.
 * @param {string} s
 * @returns {string}
 */
function norm(s) {
  return s
    ? String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim()
    : "";
}

/**
 * Escapa caracteres HTML especiais para prevenir injeção de código (XSS).
 * Deve ser usado em TODOS os dados que vêm de fora (planilha, nome de arquivo).
 * @param {string} str
 * @returns {string}
 */
function escapeHTML(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Lê um File como texto e faz parse de JSON.
 * @param {File} file
 * @returns {Promise<object>}
 */
function lerJSON(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = (e) => {
      try { resolve(JSON.parse(e.target.result)); }
      catch (err) { reject(new Error("JSON inválido: " + err.message)); }
    };
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    reader.readAsText(file);
  });
}

/**
 * Gera um Blob no formato Word (.doc) a partir de um fragmento HTML.
 * @param {string} htmlFragmento
 * @returns {Blob}
 */
function gerarWordBlob(htmlFragmento) {
  const wrapper = `<html
    xmlns:o="urn:schemas-microsoft-com:office:office"
    xmlns:w="urn:schemas-microsoft-com:office:word"
    xmlns="http://www.w3.org/TR/REC-html40">
    <head><meta charset="utf-8"><title>Plano de Estudos</title></head>
    <body>${htmlFragmento}</body>
  </html>`;
  return new Blob(["\ufeff", wrapper], { type: "application/msword" });
}

/**
 * Dispara o download de um Blob com o nome informado.
 * @param {Blob} blob
 * @param {string} nomeArquivo
 */
function downloadBlob(blob, nomeArquivo) {
  const url  = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href     = url;
  link.download = nomeArquivo;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Retorna uma Promise que resolve após `ms` milissegundos.
 * Usada para dar "respiro" à main thread entre processamentos pesados.
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calcula o enquadramento semestral conforme IN Prograd nº 40/2019.
 * @param {number} chEstudante — carga horária obrigatória do aluno
 * @param {Array}  semestres   — array de semestres da grade
 * @returns {{numero: number, formando: boolean}} semestre (base 1) em que o aluno se enquadra.
 *   Para formando, `numero` é o último semestre da grade.
 */
function calcularEnquadramentoNumero(chEstudante, semestres) {
  let chAcumulada = 0;
  for (let i = 0; i < semestres.length; i++) {
    chAcumulada += semestres[i].disciplinas.reduce((soma, d) => soma + d.ch, 0);
    if (chAcumulada > chEstudante) {
      const diferenca = chAcumulada - chEstudante;
      const numero = diferenca <= 136 ? Math.min(i + 2, semestres.length) : i + 1;
      return { numero, formando: false };
    }
  }
  return { numero: semestres.length, formando: true };
}

/**
 * Mesmo cálculo de {@link calcularEnquadramentoNumero}, em texto para exibição.
 * @param {number} chEstudante
 * @param {Array}  semestres
 * @returns {string}
 */
function calcularEnquadramento(chEstudante, semestres) {
  const { numero, formando } = calcularEnquadramentoNumero(chEstudante, semestres);
  return formando ? "Último semestre / Formando" : `${numero}º semestre`;
}
