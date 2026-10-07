/**
 * @file js/core/armazenamento.js
 * @description Gravação segura no localStorage, compartilhada por todos os módulos.
 *
 * localStorage pode falhar (cota cheia, navegação privativa, armazenamento bloqueado). Sem tratamento,
 * a exceção interrompe a ação do usuário e os dados deixam de ser salvos sem qualquer aviso.
 */
"use strict";

/**
 * Grava um valor no localStorage. Em caso de falha, avisa o usuário e devolve false.
 * @param {string} chave
 * @param {string} valor — já serializado (ex.: JSON.stringify)
 * @returns {boolean} true se gravou
 */
function salvarLocal(chave, valor) {
  try {
    localStorage.setItem(chave, valor);
    return true;
  } catch (_) {
    showToast("Não foi possível salvar no navegador (armazenamento cheio ou bloqueado). Exporte um backup para não perder dados.", "err");
    return false;
  }
}
