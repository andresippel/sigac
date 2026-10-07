/**
 * @file js/core/ui.js
 * @description Componentes de interface compartilhados: toast, feedback inline, badges e drag-and-drop de arquivos.
 * Mudanças aqui afetam TODOS os módulos — mexa com cuidado.
 */
"use strict";

/** @type {number|null} */
let _toastTimer = null;

/**
 * Exibe uma notificação temporária no canto inferior direito.
 * @param {string} msg
 * @param {"ok"|"err"|""} tipo
 */
function showToast(msg, tipo = "") {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.className   = "toast" + (tipo ? ` toast-${tipo}` : "");
  el.hidden      = false;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { el.hidden = true; }, 4500);
}

/**
 * Exibe uma mensagem de feedback inline dentro de um elemento existente.
 * @param {string} idElemento
 * @param {string} msg        — pode conter HTML seguro (não dados do usuário)
 * @param {"success"|"error"|"info"} tipo
 */
function showFeedback(idElemento, msg, tipo) {
  const el = document.getElementById(idElemento);
  if (!el) return;
  el.innerHTML  = msg;
  el.className  = `feedback-bar ${tipo}`;
  el.hidden     = false;
}

/**
 * Atualiza o visual de um badge no header.
 * @param {string} idBadge
 * @param {string} idNome
 * @param {string} texto
 * @param {"ok"|"idle"} status
 */
function setBadge(idBadge, idNome, texto, status) {
  const badge = document.getElementById(idBadge);
  const nome  = document.getElementById(idNome);
  if (badge) badge.className    = `badge badge-${status}`;
  if (nome)  nome.textContent   = texto;
}

/**
 * Configura uma área de drag-and-drop conectada a um <input type="file">.
 * @param {string}   idZona
 * @param {string}   idInput
 * @param {Function} onFiles — callback chamado com o FileList
 */
function configurarDragAndDrop(idZona, idInput, onFiles) {
  const zona  = document.getElementById(idZona);
  const input = document.getElementById(idInput);
  if (!zona || !input) return;

  zona.addEventListener("dragover", (e) => {
    e.preventDefault();
    zona.classList.add("dragover");
  });
  ["dragleave", "dragend"].forEach((tipo) =>
    zona.addEventListener(tipo, () => zona.classList.remove("dragover"))
  );
  zona.addEventListener("drop", (e) => {
    e.preventDefault();
    zona.classList.remove("dragover");
    if (e.dataTransfer.files.length) onFiles(e.dataTransfer.files);
  });
  input.addEventListener("change", (e) => {
    if (e.target.files.length) onFiles(e.target.files);
    e.target.value = ""; // permite re-selecionar o mesmo arquivo
  });
  // Acessibilidade: permite ativar via teclado
  zona.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      input.click();
    }
  });
}
