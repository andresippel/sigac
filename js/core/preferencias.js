/**
 * @file js/core/preferencias.js
 * @description Preferências do usuário guardadas no navegador (localStorage).
 *
 * Por ora: o "semestre base" (semestre letivo em curso, ex.: "2026/2"). Ele é único para o sistema —
 * ao alterar o campo em um módulo, os campos dos outros módulos acompanham. Os módulos não se
 * conhecem: a sincronização acontece por um evento do documento.
 */
"use strict";

const SEMESTRE_BASE_CHAVE  = "sigac_semestre_base_v1";
const SEMESTRE_BASE_EVENTO = "sigac:semestre-base";

/** Aceita "2026/2", "2026.2", "2026-2" (com ou sem espaços ao redor do separador). */
function semestreBaseValido(texto) {
  return /^\d{4}\s*[\/.\-]\s*[12]$/.test(String(texto).trim());
}

/** Semestre letivo "natural" para hoje: de janeiro a junho → ano/1; de julho a dezembro → ano/2. */
function semestreBasePadrao() {
  const hoje = new Date();
  return `${hoje.getFullYear()}/${hoje.getMonth() < 6 ? 1 : 2}`;
}

/** @returns {string} o último semestre base salvo, ou o padrão para a data de hoje. */
function lerSemestreBase() {
  try {
    const salvo = localStorage.getItem(SEMESTRE_BASE_CHAVE);
    if (salvo && semestreBaseValido(salvo)) return salvo;
  } catch (_) { /* localStorage indisponível: usa o padrão */ }
  return semestreBasePadrao();
}

/**
 * Semestre base a usar de fato: o texto digitado, se tiver formato válido; senão o último valor salvo
 * (ou o padrão de hoje). Evita rótulos de período errados quando o campo está vazio ou mal digitado.
 * @param {string} [texto]
 * @returns {string}
 */
function resolverSemestreBase(texto) {
  const t = String(texto ?? "").trim();
  return semestreBaseValido(t) ? t : lerSemestreBase();
}

/** Marca o campo como inválido (borda vermelha + dica) quando há texto fora do formato "AAAA/1" ou "AAAA/2". */
function marcarSemestreBaseInvalido(el) {
  const invalido = el.value.trim() !== "" && !semestreBaseValido(el.value);
  el.toggleAttribute("aria-invalid", invalido);
  el.title = invalido ? `Formato inválido: usando ${lerSemestreBase()}. Digite no formato 2026/2.` : "";
}

/**
 * Liga um <input> ao semestre base salvo: preenche com o último valor usado, salva a cada
 * alteração válida e acompanha mudanças feitas em campos de outros módulos.
 * @param {string}   idInput
 * @param {Function} [aoMudar] — chamada depois de qualquer mudança (ex.: atualizar a prévia)
 */
function vincularSemestreBase(idInput, aoMudar) {
  const el = document.getElementById(idInput);
  if (!el) return;
  el.value = lerSemestreBase();

  el.addEventListener("input", () => {
    const valor = el.value.trim();
    marcarSemestreBaseInvalido(el);
    if (semestreBaseValido(valor)) {
      try { localStorage.setItem(SEMESTRE_BASE_CHAVE, valor); } catch (_) { /* sem persistência */ }
      document.dispatchEvent(new CustomEvent(SEMESTRE_BASE_EVENTO, { detail: { origem: idInput, valor } }));
    }
    aoMudar?.();
  });

  document.addEventListener(SEMESTRE_BASE_EVENTO, (e) => {
    if (e.detail.origem === idInput || el.value.trim() === e.detail.valor) return;
    el.value = e.detail.valor;
    marcarSemestreBaseInvalido(el);
    aoMudar?.();
  });
}

// ─── Oferta por semestre letivo (ímpar/par) ──────────────────────────────

const PARIDADE_CHAVE  = "sigac_respeitar_paridade_v1";
const PARIDADE_EVENTO = "sigac:paridade";

/** @returns {boolean} se o plano deve respeitar a oferta ímpar/par (padrão: sim). */
function lerRespeitarParidade() {
  try { return localStorage.getItem(PARIDADE_CHAVE) !== "0"; } catch (_) { return true; }
}

/**
 * Liga um <input type="checkbox"> à preferência "respeitar oferta ímpar/par", sincronizada
 * entre os módulos do mesmo modo que o semestre base.
 * @param {string}   idCheckbox
 * @param {Function} [aoMudar]
 */
function vincularParidade(idCheckbox, aoMudar) {
  const el = document.getElementById(idCheckbox);
  if (!el) return;
  el.checked = lerRespeitarParidade();

  el.addEventListener("change", () => {
    try { localStorage.setItem(PARIDADE_CHAVE, el.checked ? "1" : "0"); } catch (_) { /* sem persistência */ }
    document.dispatchEvent(new CustomEvent(PARIDADE_EVENTO, { detail: { origem: idCheckbox, valor: el.checked } }));
    aoMudar?.();
  });

  document.addEventListener(PARIDADE_EVENTO, (e) => {
    if (e.detail.origem === idCheckbox || el.checked === e.detail.valor) return;
    el.checked = e.detail.valor;
    aoMudar?.();
  });
}
