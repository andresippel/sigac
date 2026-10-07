/**
 * @file js/core/main.js
 * @description Ponto de entrada. Carregado por ÚLTIMO (depois de todos os módulos).
 * Inicia cada módulo de forma isolada: se um módulo falhar ao iniciar, os demais continuam funcionando.
 * Nenhum onclick= existe no HTML — todos os eventos são registrados nos arquivos dos módulos.
 */
"use strict";

document.addEventListener("DOMContentLoaded", () => {

  Object.values(SIGAC.modulos).forEach((m) => {
    try {
      m.iniciar();
    } catch (err) {
      console.error(`Falha ao iniciar o módulo "${m.id}":`, err);
    }
    document.getElementById(m.card)?.addEventListener("click", () => abrirModulo(m.id));
  });

  document.querySelectorAll(".home-card").forEach((card) => {
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); card.click(); }
    });
  });

  document.querySelectorAll(".module-back").forEach((btn) => {
    btn.addEventListener("click", irHome);
  });

  document.getElementById("brandLink")
    ?.addEventListener("click", irHome);
});
