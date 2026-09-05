// ==========================================================================
// VideoStudy AI — Core Frontend Logic
// Livros Técnicos, Player Sincronizado e Tradução Simultânea em Áudio (PT-BR)
// ==========================================================================

let currentVideoId = "ntDIxaeo3Wg";
let player = null;
let playerReady = false;
let currentActiveCueIndex = -1;
let currentLanguage = "pt"; // 'pt', 'en', 'bilingual'
let transcriptData = [];
let currentStudyBook = null;
let syncTimer = null;

// Configurações de Tradução Simultânea de Áudio (SpeechSynthesis)
let audioDubActive = false;
let ptVoice = null;
let currentVoiceRate = 1.1; // 1.1x para acompanhar a fala natural
let lastSpokenCueIndex = -1;

// ==========================================================================
// 1. INICIALIZAÇÃO DA APLICAÇÃO
// ==========================================================================
document.addEventListener("DOMContentLoaded", () => {
  initSpeechSynthesis();
  setupEventListeners();
  loadInitialData();
  setupYouTubeIframe();
});

// Inicializar Sintetizador de Voz em Português
function initSpeechSynthesis() {
  if (!('speechSynthesis' in window)) {
    console.warn("Seu navegador não suporta a Web Speech API.");
    return;
  }

  function pickPtVoice() {
    const voices = window.speechSynthesis.getVoices();
    // Prioridade para vozes naturais em pt-BR
    ptVoice = voices.find(v => v.lang === 'pt-BR' && (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Francisca'))) ||
              voices.find(v => v.lang === 'pt-BR' || v.lang === 'pt_BR') ||
              voices.find(v => v.lang.startsWith('pt'));
  }

  pickPtVoice();
  if (window.speechSynthesis.onvoiceschanged !== undefined) {
    window.speechSynthesis.onvoiceschanged = pickPtVoice;
  }
}

// Carregar Dados Iniciais (Vídeo Padrão Claude Code)
function loadInitialData() {
  // Se temos o data.js carregado localmente
  if (window.TRANSCRIPT_DATA && window.TRANSCRIPT_DATA.length > 0) {
    transcriptData = window.TRANSCRIPT_DATA;
    currentStudyBook = buildDefaultClaudeBook();
    renderAll();
  } else {
    // Tenta obter da API
    fetch('/api/default-video')
      .then(res => res.json())
      .then(data => {
        applyProcessedData(data);
      })
      .catch(() => {
        // Fallback para arquivo JSON
        fetch('transcricao_bilingue.json')
          .then(res => res.json())
          .then(cues => {
            transcriptData = cues;
            currentStudyBook = buildDefaultClaudeBook();
            renderAll();
          });
      });
  }
}

// ==========================================================================
// 2. PROCESSAMENTO DE NOVAS URLs DO YOUTUBE
// ==========================================================================
function setupEventListeners() {
  // Botão Gerar Livro & Guia
  const processBtn = document.getElementById("processVideoBtn");
  const urlInput = document.getElementById("videoUrlInput");

  processBtn.addEventListener("click", () => {
    handleProcessUrl(urlInput.value);
  });

  urlInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      handleProcessUrl(urlInput.value);
    }
  });

  // Botão de Tradução Simultânea de Áudio (Dublagem)
  const audioToggleBtn = document.getElementById("audioTranslateToggleBtn");
  audioToggleBtn.addEventListener("click", toggleAudioDubbing);

  // Seletor de Velocidade da Voz
  const speedBtn = document.querySelector(".voice-speed-pill");
  const speeds = [1.0, 1.1, 1.25, 1.35];
  speedBtn.addEventListener("click", () => {
    let nextIdx = (speeds.indexOf(currentVoiceRate) + 1) % speeds.length;
    currentVoiceRate = speeds[nextIdx];
    document.getElementById("speedDisplay").textContent = `${currentVoiceRate}x`;
  });

  // Abas de Navegação (Livro, Player, Fluxogramas)
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-pane").forEach(p => p.classList.remove("active"));

      btn.classList.add("active");
      const targetId = btn.dataset.tab;
      const targetPane = document.getElementById(targetId);
      if (targetPane) targetPane.classList.add("active");
    });
  });

  // Alternador de Idioma da Transcrição
  document.querySelectorAll(".lang-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".lang-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentLanguage = btn.dataset.lang;
      renderTranscriptList();
    });
  });

  // Busca na Transcrição
  const searchInput = document.getElementById("transcriptSearchInput");
  searchInput.addEventListener("input", (e) => {
    renderTranscriptList(e.target.value);
  });

  // Dropdown de Exportação
  const exportBtn = document.getElementById("exportMenuBtn");
  const exportDropdown = document.getElementById("exportDropdown");
  exportBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    exportDropdown.classList.toggle("show");
  });
  document.addEventListener("click", () => exportDropdown.classList.remove("show"));
}

function loadExample(url) {
  document.getElementById("videoUrlInput").value = url;
  handleProcessUrl(url);
}

// Processar a URL fornecida pelo usuário
async function handleProcessUrl(url) {
  if (!url || !url.trim()) return;

  const banner = document.getElementById("progressBanner");
  const fill = document.getElementById("progressBarFill");
  const title = document.getElementById("progressStepTitle");
  const sub = document.getElementById("progressStepSubtitle");

  banner.classList.remove("hidden");
  fill.style.width = "20%";
  title.textContent = "Conectando ao YouTube...";
  sub.textContent = "Validando link e extraindo metadados oficiais...";

  try {
    fill.style.width = "50%";
    title.textContent = "Processando Transcrições e Traduzindo...";
    sub.textContent = "Convertendo legendas para Português (BR) e sincronizando tempo...";

    // Tenta enviar para a API local ou Vercel
    const response = await fetch('/api/process-video', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: url.trim() })
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.detail || "Erro no processamento do vídeo");
    }

    fill.style.width = "85%";
    title.textContent = "Construindo Livro de Estudos e Fluxogramas...";
    sub.textContent = "Gerando capítulos didáticos, analogias e resumos conceituais...";

    const data = await response.json();
    
    fill.style.width = "100%";
    title.textContent = "Pronto!";
    sub.textContent = "Material didático compilado e player preparado.";

    setTimeout(() => {
      banner.classList.add("hidden");
      applyProcessedData(data);
    }, 600);

  } catch (error) {
    console.warn("API de backend não disponível ou erro no endpoint:", error.message);
    
    // Fallback inteligente: se for o vídeo padrão, carrega local
    if (url.includes("ntDIxaeo3Wg")) {
      fill.style.width = "100%";
      setTimeout(() => {
        banner.classList.add("hidden");
        loadInitialData();
      }, 500);
      return;
    }

    fill.style.width = "100%";
    title.textContent = "Aviso do Processamento";
    sub.textContent = `Atenção: ${error.message}. (Dica: inicie 'python server.py' para processamento de novas URLs em tempo real).`;
    setTimeout(() => banner.classList.add("hidden"), 5000);
  }
}

function applyProcessedData(data) {
  currentVideoId = data.video_id;
  transcriptData = data.cues || [];
  currentStudyBook = data.study_book;

  // Atualiza Iframe do YouTube
  const iframe = document.getElementById("youtubeIframe");
  if (iframe) {
    iframe.src = `https://www.youtube-nocookie.com/embed/${currentVideoId}?enablejsapi=1&origin=https://www.youtube.com`;
  }

  renderAll();
}

// ==========================================================================
// 3. TRADUÇÃO SIMULTÂNEA DE ÁUDIO (DUBLAGEM COM SPEECH SYNTHESIS)
// ==========================================================================
function toggleAudioDubbing() {
  audioDubActive = !audioDubActive;
  const btn = document.getElementById("audioTranslateToggleBtn");
  const btnText = document.getElementById("audioTranslateBtnText");
  const badge = document.getElementById("audioStatusBadge");

  if (audioDubActive) {
    btn.classList.add("active");
    btnText.textContent = "Dublagem Ativa (PT-BR)";
    badge.className = "audio-status-badge active";
    badge.textContent = "🎙️ Dublagem em Português Ativa";

    // Fala uma mensagem rápida de ativação
    speakText("Tradução simultânea ativada.");

    // Se o player estiver tocando, ajusta o volume do original
    if (player && typeof player.setVolume === 'function') {
      player.setVolume(20); // Deixa o original baixinho em segundo plano
    }
  } else {
    btn.classList.remove("active");
    btnText.textContent = "Tradução Simultânea em Áudio (PT-BR)";
    badge.className = "audio-status-badge inactive";
    badge.textContent = "🎙️ Áudio Original em Inglês";

    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }

    if (player && typeof player.setVolume === 'function') {
      player.setVolume(100);
    }
  }
}

function speakText(text) {
  if (!('speechSynthesis' in window) || !text) return;

  window.speechSynthesis.cancel(); // Para falas anteriores
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'pt-BR';
  if (ptVoice) utterance.voice = ptVoice;
  utterance.rate = currentVoiceRate;
  utterance.pitch = 1.0;
  window.speechSynthesis.speak(utterance);
}

// ==========================================================================
// 4. RENDERIZAÇÃO GERAL (LIVRO, FLUXOGRAMAS, TRANSCRIÇÃO)
// ==========================================================================
function renderAll() {
  renderStudyBook();
  renderTranscriptList();
  renderQuickChapters();
  renderFlowchartsGallery();
}

// Renderiza a Aba 1: Livro de Estudos
function renderStudyBook() {
  if (!currentStudyBook) return;

  const nav = document.getElementById("bookNav");
  const content = document.getElementById("bookContent");
  const badge = document.getElementById("bookModuleCountBadge");

  badge.textContent = `${currentStudyBook.modules.length} Capítulos`;
  nav.innerHTML = "";

  let html = `
    <div class="book-hero">
      <h2>${currentStudyBook.title}</h2>
      <p>${currentStudyBook.subtitle}</p>
    </div>
  `;

  currentStudyBook.modules.forEach((mod, idx) => {
    // Adiciona ao índice da barra lateral
    const link = document.createElement("a");
    link.href = `#${mod.id}`;
    link.className = `nav-module-link ${idx === 0 ? 'active' : ''}`;
    link.innerHTML = `<span>📖</span> ${mod.number}: ${mod.title}`;
    nav.appendChild(link);

    // Constrói o HTML do Capítulo
    html += `
      <section id="${mod.id}" class="module-card">
        <span class="module-badge">${mod.number}</span>
        <h3 class="module-title">${mod.title}</h3>

        <!-- Analogia Didática (Fácil para qualquer idade) -->
        <div class="analogy-callout">
          <div class="analogy-icon">💡</div>
          <div class="analogy-text">
            <h4>Como entender em 1 minuto:</h4>
            <p>${mod.analogy}</p>
          </div>
        </div>

        <!-- Explicação Aprofundada -->
        <div class="deep-dive-block">
          <p>${mod.explanation}</p>
        </div>

        <!-- Detalhes Técnicos Sem Omissões -->
        <div class="deep-dive-block">
          <p><strong>Detalhes Técnicos:</strong> ${mod.technical_deep_dive}</p>
        </div>

        <!-- Exemplo de Código Prático com Botão de Copiar -->
        ${mod.code_example ? `
          <div class="code-box">
            <button class="btn-copy-code" onclick="copyCode(this)">Copiar</button>
            <pre><code>${mod.code_example}</code></pre>
          </div>
        ` : ''}

        <!-- Fluxograma Visual Integrado ao Capítulo -->
        ${mod.flowchart ? `
          <div class="module-flowchart-box">
            <div class="flowchart-header">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><line x1="10" y1="6.5" x2="14" y2="6.5"/></svg>
              ${mod.flowchart.title}
            </div>
            <div class="horizontal-flow">
              ${mod.flowchart.steps.map((step, sIdx) => `
                <div class="h-node">
                  <div class="h-node-icon">${step.icon}</div>
                  <div class="h-node-title">${step.title}</div>
                  <div class="h-node-desc">${step.desc}</div>
                </div>
                ${sIdx < mod.flowchart.steps.length - 1 ? '<div class="h-arrow">➔</div>' : ''}
              `).join('')}
            </div>
          </div>
        ` : ''}
      </section>
    `;
  });

  // Resumo Geral da Transcrição Completa no final
  if (currentStudyBook.summary) {
    html += `
      <section class="final-summary-card">
        <h3>📋 ${currentStudyBook.summary.title}</h3>
        <div class="summary-bullets">
          ${currentStudyBook.summary.takeaways.map(item => `
            <div class="summary-bullet">
              <span>${item}</span>
            </div>
          `).join('')}
        </div>
      </section>
    `;
  }

  content.innerHTML = html;
}

// Renderiza a Aba 2: Lista da Transcrição
function renderTranscriptList(searchQuery = "") {
  const container = document.getElementById("cuesScrollArea");
  const badge = document.getElementById("transcriptSearchBadge");
  if (!container || !transcriptData) return;

  const query = searchQuery.trim().toLowerCase();
  container.innerHTML = "";
  let matches = 0;

  transcriptData.forEach((cue, index) => {
    const textEn = cue.text_en || cue.text || "";
    const textPt = cue.text_pt || textEn;

    let mainText = currentLanguage === 'en' ? textEn : textPt;
    let secText = currentLanguage === 'bilingual' ? textEn : "";

    if (query) {
      const matchPt = textPt.toLowerCase().includes(query);
      const matchEn = textEn.toLowerCase().includes(query);
      if (!matchPt && !matchEn) return;
      matches++;
    }

    const row = document.createElement("div");
    row.className = `cue-row ${index === currentActiveCueIndex ? 'active' : ''}`;
    row.id = `cue-row-${index}`;
    row.dataset.seconds = cue.start_seconds;

    row.innerHTML = `
      <button class="cue-timestamp-btn" title="Pular vídeo">${cue.timestamp}</button>
      <div class="cue-text-body">
        <div>${mainText}</div>
        ${secText ? `<span class="cue-secondary-text">${secText}</span>` : ''}
      </div>
    `;

    row.addEventListener("click", () => {
      seekToSeconds(cue.start_seconds);
      setActiveCue(index);
    });

    container.appendChild(row);
  });

  if (query) {
    badge.textContent = `${matches} achados`;
    badge.classList.remove("hidden");
  } else {
    badge.classList.add("hidden");
  }
}

// Renderiza Capítulos Rápidos no Player
function renderQuickChapters() {
  const container = document.getElementById("quickChaptersList");
  if (!container || !transcriptData || transcriptData.length === 0) return;

  // Seleciona ~8 pontos uniformes ou usa capítulos detectados
  const step = Math.max(1, Math.floor(transcriptData.length / 8));
  container.innerHTML = "";

  for (let i = 0; i < transcriptData.length; i += step) {
    const cue = transcriptData[i];
    const text = cue.text_pt || cue.text_en || "";
    const cleanTitle = text.slice(0, 38) + "...";

    const btn = document.createElement("button");
    btn.className = "quick-chap-btn";
    btn.innerHTML = `
      <span class="quick-chap-time">${cue.timestamp}</span>
      <span>${cleanTitle}</span>
    `;
    btn.addEventListener("click", () => {
      seekToSeconds(cue.start_seconds);
      setActiveCue(i);
    });
    container.appendChild(btn);
  }
}

// Renderiza a Aba 3: Galeria de Fluxogramas
function renderFlowchartsGallery() {
  const gallery = document.getElementById("flowchartsGallery");
  if (!gallery || !currentStudyBook) return;

  gallery.innerHTML = `
    <div class="section-header" style="padding: 2rem 2rem 0;">
      <span class="section-tag">Visualização Expandida</span>
      <h2>Todos os Fluxogramas do Projeto</h2>
      <p class="section-subtitle">Processos completos diagramados para consulta rápida.</p>
    </div>
  `;

  currentStudyBook.modules.forEach(mod => {
    if (!mod.flowchart) return;
    const card = document.createElement("div");
    card.className = "module-card";
    card.style.margin = "1.5rem 2rem";
    card.innerHTML = `
      <span class="module-badge">${mod.number}</span>
      <h3 class="module-title">${mod.flowchart.title}</h3>
      <div class="module-flowchart-box" style="margin-top: 1rem;">
        <div class="horizontal-flow">
          ${mod.flowchart.steps.map((step, sIdx) => `
            <div class="h-node">
              <div class="h-node-icon">${step.icon}</div>
              <div class="h-node-title">${step.title}</div>
              <div class="h-node-desc">${step.desc}</div>
            </div>
            ${sIdx < mod.flowchart.steps.length - 1 ? '<div class="h-arrow">➔</div>' : ''}
          `).join('')}
        </div>
      </div>
    `;
    gallery.appendChild(card);
  });
}

// ==========================================================================
// 5. YOUTUBE IFRAME API & CONTROLE DE SINCRONIZAÇÃO
// ==========================================================================
function setupYouTubeIframe() {
  const tag = document.createElement('script');
  tag.src = "https://www.youtube.com/iframe_api";
  const firstScriptTag = document.getElementsByTagName('script')[0];
  firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
}

function onYouTubeIframeAPIReady() {
  player = new YT.Player('youtubeIframe', {
    events: {
      'onReady': onPlayerReady,
      'onStateChange': onPlayerStateChange
    }
  });
}

function onPlayerReady(event) {
  playerReady = true;
  const duration = player.getDuration();
  document.getElementById("playerTotalTime").textContent = formatSeconds(duration);
  startPlaybackSync();
}

function onPlayerStateChange(event) {
  if (event.data === YT.PlayerState.PLAYING) {
    startPlaybackSync();
  } else {
    stopPlaybackSync();
    if (audioDubActive && 'speechSynthesis' in window) {
      window.speechSynthesis.pause();
    }
  }
}

function startPlaybackSync() {
  if (syncTimer) clearInterval(syncTimer);
  syncTimer = setInterval(syncPlaybackLoop, 250);
}

function stopPlaybackSync() {
  if (syncTimer) clearInterval(syncTimer);
}

function syncPlaybackLoop() {
  if (!player || typeof player.getCurrentTime !== 'function') return;

  const currentSeconds = player.getCurrentTime();
  document.getElementById("playerCurrentTime").textContent = formatSeconds(currentSeconds);

  if (!transcriptData || transcriptData.length === 0) return;

  // Acha o cue atual
  let activeIdx = -1;
  for (let i = 0; i < transcriptData.length; i++) {
    const start = transcriptData[i].start_seconds;
    const nextStart = transcriptData[i + 1] ? transcriptData[i + 1].start_seconds : start + 10;
    if (currentSeconds >= start && currentSeconds < nextStart) {
      activeIdx = i;
      break;
    }
  }

  if (activeIdx !== -1 && activeIdx !== currentActiveCueIndex) {
    setActiveCue(activeIdx);

    // TRADUÇÃO SIMULTÂNEA DE ÁUDIO ATIVA!
    if (audioDubActive && activeIdx !== lastSpokenCueIndex) {
      lastSpokenCueIndex = activeIdx;
      const textToSpeak = transcriptData[activeIdx].text_pt || transcriptData[activeIdx].text_en;
      speakText(textToSpeak);
    }
  }
}

function setActiveCue(index) {
  currentActiveCueIndex = index;
  document.querySelectorAll(".cue-row").forEach(r => r.classList.remove("active"));

  const el = document.getElementById(`cue-row-${index}`);
  if (el) {
    el.classList.add("active");
    if (document.getElementById("syncAutoScroll").checked) {
      const container = document.getElementById("cuesScrollArea");
      const offset = el.offsetTop - container.offsetTop - (container.clientHeight / 3);
      container.scrollTo({ top: Math.max(0, offset), behavior: "smooth" });
    }
  }
}

function seekToSeconds(seconds) {
  if (player && typeof player.seekTo === 'function') {
    player.seekTo(seconds, true);
    player.playVideo();
  }
}

function formatSeconds(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
}

// ==========================================================================
// 6. EXPORTAÇÕES E UTILITÁRIOS
// ==========================================================================
function copyCode(btn) {
  const code = btn.parentElement.querySelector("code").innerText;
  navigator.clipboard.writeText(code).then(() => {
    btn.innerText = "Copiado!";
    setTimeout(() => btn.innerText = "Copiar", 2000);
  });
}

function downloadTranscriptTxt(withTime) {
  let content = "";
  transcriptData.forEach(c => {
    const text = currentLanguage === 'en' ? c.text_en : (c.text_pt || c.text_en);
    content += withTime ? `[${c.timestamp}] ${text}\n` : `${text} `;
  });
  triggerDownload(content, `transcricao_${currentVideoId}.txt`, "text/plain");
}

function downloadSrt() {
  let srt = "";
  transcriptData.forEach((c, idx) => {
    const startSec = c.start_seconds;
    const endSec = transcriptData[idx + 1] ? transcriptData[idx + 1].start_seconds : startSec + 4;
    const text = c.text_pt || c.text_en;
    srt += `${idx + 1}\n${formatSrtTime(startSec)} --> ${formatSrtTime(endSec)}\n${text}\n\n`;
  });
  triggerDownload(srt, `legendas_${currentVideoId}.srt`, "text/plain");
}

function formatSrtTime(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')},000`;
}

function downloadStandaloneGuide() {
  const htmlContent = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>${currentStudyBook ? currentStudyBook.title : 'Livro de Estudos'}</title>
  <style>
    body { font-family: sans-serif; background: #010307; color: #f8fafc; padding: 2rem; max-width: 900px; margin: 0 auto; line-height: 1.6; }
    h1, h2, h3 { color: #38bdf8; }
    .card { background: #08122c; border: 1px solid #1e3a8a; padding: 1.5rem; border-radius: 12px; margin-bottom: 2rem; }
    pre { background: #000; padding: 1rem; border-radius: 6px; color: #7dd3fc; overflow-x: auto; }
  </style>
</head>
<body>
  <h1>${currentStudyBook ? currentStudyBook.title : 'Guia de Estudos'}</h1>
  <p>${currentStudyBook ? currentStudyBook.subtitle : ''}</p>
  <hr style="border-color:#1e3a8a; margin: 2rem 0;">
  ${document.getElementById("bookContent").innerHTML}
</body>
</html>`;
  triggerDownload(htmlContent, `livro_estudos_${currentVideoId}.html`, "text/html");
}

function triggerDownload(text, filename, type) {
  const blob = new Blob([text], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

// Construtor do Livro Padrão do Claude Code caso offline
function buildDefaultClaudeBook() {
  return {
    title: "Claude Code: Livro de Estudos e Manual Completo",
    subtitle: "Aprenda a Programar no Terminal com Inteligência Artificial sem Complicações",
    modules: [
      {
        id: "cap-1",
        number: "Capítulo 01",
        title: "O Que é Claude Code (A Filosofia do Agente no Terminal)",
        analogy: "Imagine ter um engenheiro de software experiente sentado ao seu lado. Em vez de você apertar dezenas de botões em um aplicativo pesado, você fala o que deseja em uma conversa direta no terminal e ele cria o código na hora.",
        explanation: "O Claude Code é a solução da Anthropic que executa diretamente na linha de comando. Ele lê os arquivos locais, entende o contexto do seu projeto e gera código pronto para produção através de prompts simples.",
        technical_deep_dive: "Opera diretamente no shell, sem sobrecarga de IDE pesada. Utiliza o protocolo OAuth para autenticação e gera modificações atômicas com verificação de integridade.",
        code_example: "claude",
        flowchart: {
          title: "Ciclo de Raciocínio e Ação do Claude Code",
          steps: [
            { icon: "🗣️", title: "Instrução", desc: "Você pede o que criar" },
            { icon: "🔍", title: "Leitura", desc: "Varredura dos arquivos" },
            { icon: "🧠", title: "Planejamento", desc: "Criação do plano de ação" },
            { icon: "🛑", title: "Permissão", desc: "Pede sua aprovação" },
            { icon: "🚀", title: "Execução", desc: "Código gerado e testado" }
          ]
        }
      },
      {
        id: "cap-2",
        number: "Capítulo 02",
        title: "Instalação e Segurança (Windows, Mac e Linux)",
        analogy: "É como ligar o motor de um carro novo: você executa uma única chave de comando e o sistema configura todos os componentes essenciais com segurança.",
        explanation: "No Windows, a instalação é realizada pelo PowerShell oficial. No Mac e Linux, usa-se o comando curl. A segurança é reforçada pelo 'Trust Folder', exigindo sua confirmação de confiança.",
        technical_deep_dive: "Utiliza PowerShell ExecutionPolicy ou Bash. Conecta-se via token HTTPS seguro e cria um ambiente de trabalho isolado no diretório atual.",
        code_example: "# Windows PowerShell:\nirm https://storage.googleapis.com/claude-code-dist/install.ps1 | iex\n\n# Mac / Linux:\ncurl -fsSL https://storage.googleapis.com/claude-code-dist/install.sh | bash",
        flowchart: {
          title: "Passo a Passo de Instalação",
          steps: [
            { icon: "🪟", title: "Abrir Terminal", desc: "PowerShell ou Terminal" },
            { icon: "⚡", title: "Rodar Script", desc: "Comando de instalação" },
            { icon: "🔑", title: "Login Seguro", desc: "Autenticação no navegador" },
            { icon: "🛡️", title: "Aprovar Pasta", desc: "Confirmação de segurança" }
          ]
        }
      },
      {
        id: "cap-3",
        number: "Capítulo 03",
        title: "Controle de Custos e Memória (/cost e /compact)",
        analogy: "Pense em fichas de videogame: cada comando elaborado gasta algumas fichas. Você tem um visor que mostra exatamente quantas fichas restam.",
        explanation: "Para não gastar créditos à toa, comandos especiais permitem verificar o custo em tempo real e limpar o excesso de conversa da memória.",
        technical_deep_dive: "O comando /cost calcula o consumo cumulativo de tokens de entrada e saída. O /compact sumariza a janela de atenção, reduzindo o custo dos próximos turnos.",
        code_example: "# Ver quanto gastou na sessão:\n/cost\n\n# Resumir histórico e economizar memória:\n/compact\n\n# Reiniciar contexto:\n/clear",
        flowchart: {
          title: "Gestão Inteligente de Fichas e Memória",
          steps: [
            { icon: "📊", title: "Auditar /cost", desc: "Acompanhar gastos" },
            { icon: "🧹", title: "Comprimir /compact", desc: "Resumir contexto" },
            { icon: "🎯", title: "Foco no Alvo", desc: "Prompts objetivos" }
          ]
        }
      },
      {
        id: "cap-4",
        number: "Capítulo 04",
        title: "Poderes Supremos: Subagentes, Tasks em Background, MCP e Skills",
        analogy: "É como transformar um único ajudante em uma equipe com vários departamentos e fios que conectam seu escritório ao Google Drive e Notion.",
        explanation: "O Claude Code pode rodar tarefas demoradas sem travar a tela, delegar funções a outros robôs especializados e se conectar a aplicativos externos através de servidores MCP.",
        technical_deep_dive: "O protocolo MCP (Model Context Protocol) padroniza chamadas de contexto entre LLMs e fontes de dados corporativas. As Skills criam rotinas reutilizáveis.",
        code_example: "# Criar equipe de subagentes:\n/agents\n\n# Conectar serviços externos:\n# Model Context Protocol (MCP)",
        flowchart: {
          title: "Ecossistema Completo do Claude Code",
          steps: [
            { icon: "⚙️", title: "Tarefas em Background", desc: "Sem travar a tela" },
            { icon: "👥", title: "Subagentes /agents", desc: "Divisão de trabalho" },
            { icon: "🔌", title: "Servidores MCP", desc: "Ponte com Drive e Notion" },
            { icon: "⭐", title: "Skills", desc: "Poderes reutilizáveis" }
          ]
        }
      }
    ],
    summary: {
      title: "Resumo Geral de Toda a Transcrição do Vídeo",
      takeaways: [
        "O Claude Code inaugura uma abordagem ágil de desenvolvimento centrada no terminal, eliminando atritos de interfaces pesadas.",
        "A segurança é desenhada por design: o usuário sempre aprova antes que qualquer arquivo seja modificado ou comando executado.",
        "O Git funciona como salvaguarda indispensável (checkpoints), permitindo reverter qualquer experimento em segundos.",
        "O gerenciamento de custos é transparente através de /cost e otimizado com /compact.",
        "A capacidade de expansão com Agentes, tarefas em background, Skills e servidores MCP transforma a ferramenta em um livro de estudos vivo."
      ]
    }
  };
}
