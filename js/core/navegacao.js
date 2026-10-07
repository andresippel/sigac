/**
 * @file js/core/navegacao.js
 * @description Registro de módulos e navegação entre a tela inicial e os módulos.
 *
 * Cada módulo (js/modulos/*) se registra com SIGAC.registrarModulo({...}) informando
 * sua tela, seu card na home e seus badges do header. Este arquivo NÃO conhece o
 * conteúdo de nenhum módulo — por isso adicionar/alterar um módulo não exige mexer aqui.
 *
 * Contrato de um módulo:
 *   { id, tela, card, badges: string[], iniciar(): void, aoAbrir?(): void }
 */
"use strict";

/** Único objeto global do sistema além dos utilitários de js/core. */
const SIGAC = {
  /** @type {Record<string, {id:string, tela:string, card:string, badges:string[], iniciar:Function, aoAbrir?:Function}>} */
  modulos: {},

  /** Registra um módulo. Chamado pelo próprio arquivo do módulo ao ser carregado. */
  registrarModulo(def) {
    this.modulos[def.id] = def;
  },
};

/** Volta para a tela inicial, ocultando qualquer módulo aberto. */
function irHome() {
  document.getElementById("screenHome").style.display   = "";
  document.getElementById("headerHome").style.display   = "";
  document.getElementById("headerBadges").style.display = "none";
  Object.values(SIGAC.modulos).forEach((m) => {
    document.getElementById(m.tela).classList.remove("active");
  });
}

/**
 * Abre um módulo registrado, ocultando a tela inicial e os demais módulos.
 * @param {string} id — id usado no registro (ex: "aproveitamento", "novoppc", "horario")
 */
function abrirModulo(id) {
  document.getElementById("screenHome").style.display   = "none";
  document.getElementById("headerHome").style.display   = "none";
  document.getElementById("headerBadges").style.display = "flex";

  Object.values(SIGAC.modulos).forEach((m) => {
    const ativo = m.id === id;
    document.getElementById(m.tela).classList.toggle("active", ativo);
    m.badges.forEach((b) => {
      document.getElementById(b).style.display = ativo ? "flex" : "none";
    });
  });

  SIGAC.modulos[id]?.aoAbrir?.();
}
