/**
 * @file js/modulos/horario/backup.js
 * @description Módulo 3 — Horário de Aulas: aba Dados: exportar, importar e apagar backup.
 *
 * Os arquivos de js/modulos/horario/ formam UM módulo dividido por responsabilidade e
 * compartilham escopo (tudo prefixado com m3/M3_). Não dependem dos Módulos 1 e 2.
 */
"use strict";

// ─── Backup (exportar / importar / apagar tudo) ──

function m3ExportarBackup() {
  downloadBlob(
    new Blob([JSON.stringify(m3.db, null, 2)], { type: "application/json" }),
    `backup-horario-sigac-${new Date().toISOString().slice(0, 10)}.json`
  );
}

async function m3ImportarBackup(files) {
  try {
    const dados = await lerJSON(files[0]);
    const chaves = ["disciplinas", "professores", "salas", "periodosLetivos", "turmas", "aulas"];
    if (!dados || typeof dados !== "object" || !chaves.every((k) => Array.isArray(dados[k]))) {
      throw new Error("Arquivo não parece ser um backup válido do Horário de Aulas.");
    }
    m3MigrarAulas(dados);
    const { db, descartados } = m3SanitizarBanco(dados);
    m3.db = db;
    m3DefinirPeriodoAtivo(m3.db.periodosLetivos[0]?.id || null);
    m3.turmasDisciplinaId = null;
    m3.atribuirDisciplinaId = null;
    m3.gradeAbaChave = null;
    m3Salvar();
    m3RenderTudo();
    const aviso = descartados > 0 ? ` ${descartados} registro(s) inválido(s) ou incompletos foram ignorados.` : "";
    showFeedback("m3FeedbackDados", `✅ Backup importado com sucesso.${aviso}`, descartados > 0 ? "info" : "success");
    showToast("Backup importado.", "ok");
  } catch (err) {
    showFeedback("m3FeedbackDados", `❌ ${escapeHTML(err.message)}`, "error");
  }
}

function m3ResetarDados() {
  if (!confirm('Isso apaga TODOS os dados do Horário de Aulas deste navegador (disciplinas, professores, salas, períodos, turmas e a grade). Não pode ser desfeito. Continuar?')) return;
  m3.db = m3EmptyDb();
  m3DefinirPeriodoAtivo(null);
  m3.turmasDisciplinaId = null;
  m3.atribuirDisciplinaId = null;
  m3.gradeAbaChave = null;
  m3Salvar();
  m3RenderTudo();
  showToast("Dados apagados.", "ok");
}
