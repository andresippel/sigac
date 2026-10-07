/**
 * @file js/core/plano.js
 * @description Planejamento automático do plano de estudos, compartilhado pelo Módulo 1
 * (Aproveitamento) e pelo Módulo 2 (Mudança de Grade). Mudanças aqui afetam os DOIS módulos.
 *
 * Regras:
 *   - Oferta regular: disciplinas de semestre ímpar são cursadas em períodos X/1 e as de semestre
 *     par em períodos X/2 (pode ser desligado — opção "Respeitar oferta ímpar/par").
 *   - Uma disciplina só entra no plano se TODOS os seus pré-requisitos já foram cumpridos
 *     (aprovados/cobertos) ou serão cumpridos em um período ANTERIOR do plano.
 *   - O aluno não cursa disciplina de semestre acima do seu enquadramento. O teto sobe um
 *     semestre a cada período do plano (aluno enquadrado no 3º semestre: 3º no período atual,
 *     4º no seguinte, e assim por diante).
 *   - Período atual: as disciplinas em que o aluno JÁ ESTÁ matriculado; se não houver nenhuma,
 *     as disciplinas que ele está APTO a cursar (pré-requisitos cumpridos e dentro do teto).
 *
 * Formato do JSON da grade (campo `prerequisitos` é opcional):
 *   { "nome": "Anatomia II", "ch": 90, "prerequisitos": ["Anatomia I"] }
 * Os nomes dos pré-requisitos devem ser iguais aos nomes das disciplinas da mesma grade
 * (acentos e maiúsculas são ignorados).
 */
"use strict";

/** Limite de segurança para o número de períodos simulados. */
const PLANO_MAX_PERIODOS = 40;

/**
 * Gera os rótulos dos períodos letivos a partir do semestre base ("2026/2").
 * @param {string} semestreBase
 * @returns {{atual: string, semestreAtual: number, rotulo: (n: number) => string, semestreDoPeriodo: (n: number) => number}}
 *   `rotulo(n)`: período n posições depois do base (n=0 é o próprio base). Semestre letivo é 1 ou 2.
 */
function criarGeradorPeriodos(semestreBase) {
  const partes = String(semestreBase).split(/[\/.\-]/);
  const ano0 = parseInt(partes[0], 10) || new Date().getFullYear();
  const sem0 = parseInt(partes[1], 10) === 2 ? 2 : 1;
  const indice = (n) => ano0 * 2 + (sem0 - 1) + n;
  const rotulo = (n) => `${Math.floor(indice(n) / 2)}/${(indice(n) % 2) + 1}`;
  return {
    atual: rotulo(0),
    semestreAtual: sem0,
    rotulo,
    semestreDoPeriodo: (n) => (indice(n) % 2) + 1,
  };
}

/**
 * @typedef {{nome: string, ch: number, semestre: number}} DisciplinaPlano
 * @typedef {{
 *   usandoMatriculadas: boolean,
 *   aptasAtual: DisciplinaPlano[],
 *   futuros: Array<{deslocamento: number, disciplinas: DisciplinaPlano[]}>,
 *   naoAlocadas: DisciplinaPlano[]
 * }} PlanoEstudos
 */

/**
 * Monta o plano de estudos período a período.
 * @param {object}      p
 * @param {Array}       p.semestres              — `semestres` da grade (com `prerequisitos` opcional)
 * @param {Set<string>} p.concluidas             — nomes (norm) já aprovados/cobertos na grade
 * @param {Set<string>} [p.emCurso]              — nomes (norm), na grade, das disciplinas em que está matriculado
 * @param {number}      p.semestreEnquadramento  — semestre (base 1) do enquadramento
 * @param {string}      p.semestreBase           — período em curso ("2026/2")
 * @param {boolean}     [p.respeitarParidade=true] — disciplinas de semestre ímpar só em períodos X/1 e as de
 *   semestre par só em períodos X/2 (oferta regular do curso)
 * @returns {PlanoEstudos} `futuros[i].deslocamento` = quantos períodos depois do base (1 = próximo).
 */
function planejarEstudos({ semestres, concluidas, emCurso = new Set(), semestreEnquadramento, semestreBase, respeitarParidade = true }) {
  const todas = [];
  semestres.forEach((s, i) => (s.disciplinas || []).forEach((d) => todas.push({
    nome: d.nome,
    ch: d.ch,
    semestre: s.numero ?? i + 1,
    chave: norm(d.nome),
    prereqs: Array.isArray(d.prerequisitos) ? d.prerequisitos.map(norm) : [],
  })));

  const periodos   = criarGeradorPeriodos(semestreBase);
  const conhecidas = new Set(todas.map((d) => d.chave));
  const feitas     = new Set(concluidas);
  const limite     = Math.max(0, ...todas.map((d) => d.semestre));
  let pendentes    = todas.filter((d) => !feitas.has(d.chave));

  // Pré-requisito que não existe na grade não pode ser cumprido pelo plano: não bloqueia.
  const liberada = (d, teto, deslocamento) =>
    d.semestre <= teto &&
    (!respeitarParidade || d.semestre % 2 === periodos.semestreDoPeriodo(deslocamento) % 2) &&
    d.prereqs.every((p) => feitas.has(p) || !conhecidas.has(p));

  const cumprir = (lista) => {
    const sair = new Set(lista);
    lista.forEach((d) => feitas.add(d.chave));
    pendentes = pendentes.filter((d) => !sair.has(d));
  };

  const publico = (d) => ({ nome: d.nome, ch: d.ch, semestre: d.semestre });
  const tetoDoPeriodo = (deslocamento) =>
    Math.min(Math.max(semestreEnquadramento || 1, 1) + deslocamento, limite || 1);

  // Período atual (deslocamento 0): matrículas do histórico, ou o que o aluno está apto a cursar.
  const usandoMatriculadas = emCurso.size > 0;
  const atual = usandoMatriculadas
    ? pendentes.filter((d) => emCurso.has(d.chave))
    : pendentes.filter((d) => liberada(d, tetoDoPeriodo(0), 0));
  cumprir(atual);

  // Períodos seguintes. Períodos sem nenhuma disciplina liberada (ex.: só sobraram disciplinas do
  // outro semestre letivo) são pulados, mas o rótulo do período continua avançando.
  const futuros = [];
  let semProgresso = 0;
  for (let k = 1; pendentes.length > 0 && k <= PLANO_MAX_PERIODOS; k++) {
    const aptas = pendentes.filter((d) => liberada(d, tetoDoPeriodo(k), k));
    if (aptas.length > 0) {
      futuros.push({ deslocamento: k, disciplinas: aptas.map(publico) });
      cumprir(aptas);
      semProgresso = 0;
    } else if (tetoDoPeriodo(k) >= limite && ++semProgresso >= 2) {
      break; // teto no máximo e já tentou os dois semestres letivos: o que sobrou está bloqueado
    }
  }

  return {
    usandoMatriculadas,
    aptasAtual: usandoMatriculadas ? [] : atual.map(publico),
    futuros,
    naoAlocadas: pendentes.map(publico),
  };
}

/**
 * Gera as linhas HTML das tabelas 1 (semestre atual) e 2 (semestres futuros) do plano.
 * @param {object}   p
 * @param {Array<{nome:string}>} p.matriculadas — matrículas do histórico (têm prioridade na tabela 1)
 * @param {PlanoEstudos} p.plano
 * @param {string}   p.semestreBase
 * @returns {{linhasT1: string, linhasT2: string, grandTotal: number}}
 */
function gerarTabelasPlano({ matriculadas, plano, semestreBase }) {
  const nomesAtuais = matriculadas.length > 0
    ? matriculadas.map((d) => d.nome)
    : plano.aptasAtual.map((d) => d.nome);

  const linhaNome = (nome) => `<tr>
          <td><p class="Tabela_Texto_Alinhado_Esquerda">${escapeHTML(nome)}</p></td>
          <td><p class="Tabela_Texto_Centralizado">&nbsp;</p></td>
        </tr>`;
  const linhasT1 = nomesAtuais.length > 0
    ? nomesAtuais.map(linhaNome).join("")
    : Array(4).fill(`<tr><td>&nbsp;</td><td>&nbsp;</td></tr>`).join("");

  const periodos = criarGeradorPeriodos(semestreBase);
  let linhasT2   = "";
  let grandTotal = 0;

  const cabecalhoGrupo = (texto) => `<tr>
        <td style="width:60%;"><p class="Tabela_Texto_Alinhado_Esquerda"><strong>${escapeHTML(texto)}</strong></p></td>
        <td>&nbsp;</td><td>&nbsp;</td>
      </tr>`;
  const linhaDisciplina = (d, periodo) => `<tr>
          <td><p class="Tabela_Texto_Alinhado_Esquerda">${escapeHTML(d.nome)}</p></td>
          <td><p class="Tabela_Texto_Centralizado">${escapeHTML(periodo)}</p></td>
          <td><p class="Tabela_Texto_Centralizado">${Number(d.ch)}</p></td>
        </tr>`;
  const rodapeGrupo = (total) => `<tr>
        <td><p class="Tabela_Texto_Alinhado_Esquerda"><strong>TOTAL</strong></p></td>
        <td>&nbsp;</td>
        <td><p class="Tabela_Texto_Centralizado"><strong>${total}</strong></p></td>
      </tr>
      <tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>`;

  plano.futuros.forEach(({ deslocamento, disciplinas }) => {
    const periodo = periodos.rotulo(deslocamento);
    let totalBloco = 0;
    linhasT2 += cabecalhoGrupo(`Semestre letivo ${periodo}`);
    disciplinas.forEach((d) => {
      totalBloco += d.ch;
      grandTotal += d.ch;
      linhasT2 += linhaDisciplina(d, periodo);
    });
    linhasT2 += rodapeGrupo(totalBloco);
  });

  if (plano.naoAlocadas.length > 0) {
    linhasT2 += cabecalhoGrupo("Sem período definido — verificar pré-requisitos");
    plano.naoAlocadas.forEach((d) => { linhasT2 += linhaDisciplina(d, "—"); });
    linhasT2 += `<tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>`;
  }

  linhasT2 += `<tr>
      <td>&nbsp;</td>
      <td><p class="Tabela_Texto_Centralizado"><strong>TOTAL DO PLANO</strong></p></td>
      <td><p class="Tabela_Texto_Centralizado"><strong>${grandTotal}</strong></p></td>
    </tr>`;

  return { linhasT1, linhasT2, grandTotal };
}

/**
 * Valida o JSON de uma grade curricular (usado pelos Módulos 1 e 2, na importação e ao ler do
 * localStorage). Lança Error com mensagem em português se algo estiver fora do formato.
 * Garante tipos seguros: nomes são textos e cargas horárias são números finitos.
 * @param {any} grade
 */
function validarGradeCurricular(grade) {
  const falha = (msg) => { throw new Error(msg); };
  const numeroOk = (v) => typeof v === "number" && Number.isFinite(v) && v >= 0;

  if (!grade || typeof grade !== "object" || Array.isArray(grade)) {
    falha('O JSON deve ser um objeto com os campos "curso" e "semestres".');
  }
  if (typeof grade.curso !== "string" || !grade.curso.trim()) falha('O campo "curso" deve ser um texto preenchido.');
  if (!Array.isArray(grade.semestres) || grade.semestres.length === 0) falha('O campo "semestres" deve ser uma lista preenchida.');
  ["ch_total_curso", "ch_optativas_exigidas", "ch_extensao_exigida"].forEach((campo) => {
    if (grade[campo] !== undefined && !numeroOk(grade[campo])) falha(`O campo "${campo}" deve ser um número.`);
  });

  grade.semestres.forEach((s, i) => {
    const rotulo = `Semestre ${i + 1}`;
    if (!s || typeof s !== "object" || !Array.isArray(s.disciplinas)) falha(`${rotulo}: deve ter uma lista "disciplinas".`);
    if (s.numero !== undefined && !(Number.isInteger(s.numero) && s.numero > 0)) falha(`${rotulo}: "numero" deve ser um inteiro positivo.`);
    s.disciplinas.forEach((d, j) => {
      const onde = `${rotulo}, disciplina ${j + 1}`;
      if (!d || typeof d !== "object") falha(`${onde}: formato inválido.`);
      if (typeof d.nome !== "string" || !d.nome.trim()) falha(`${onde}: "nome" deve ser um texto preenchido.`);
      if (!numeroOk(d.ch)) falha(`${onde}: "ch" deve ser um número (carga horária).`);
      if (d.prerequisitos !== undefined && !(Array.isArray(d.prerequisitos) && d.prerequisitos.every((p) => typeof p === "string"))) {
        falha(`${onde}: "prerequisitos" deve ser uma lista de nomes (textos).`);
      }
    });
  });
}

/** @returns {boolean} true se ao menos uma disciplina da grade declara pré-requisitos. */
function gradeTemPrerequisitos(grade) {
  return grade.semestres.some((s) =>
    (s.disciplinas || []).some((d) => Array.isArray(d.prerequisitos) && d.prerequisitos.length > 0));
}

/**
 * Confere os pré-requisitos declarados na grade.
 * @returns {string[]} avisos em texto puro (escape antes de exibir como HTML)
 */
function avisosPrerequisitos(grade) {
  const nomes  = new Set();
  grade.semestres.forEach((s) => (s.disciplinas || []).forEach((d) => nomes.add(norm(d.nome))));
  const avisos = [];
  grade.semestres.forEach((s) => (s.disciplinas || []).forEach((d) => {
    if (d.prerequisitos === undefined) return;
    if (!Array.isArray(d.prerequisitos)) {
      avisos.push(`"${d.nome}": "prerequisitos" deve ser uma lista de nomes.`);
      return;
    }
    d.prerequisitos.forEach((p) => {
      if (norm(p) === norm(d.nome)) avisos.push(`"${d.nome}" não pode ser pré-requisito dela mesma.`);
      else if (!nomes.has(norm(p))) avisos.push(`"${d.nome}": pré-requisito "${p}" não existe nesta grade.`);
    });
  }));
  return avisos;
}
