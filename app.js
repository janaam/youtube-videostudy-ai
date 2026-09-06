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

// Configurações de Tradução Simultânea de Áudio & Vozes Neurais (NotebookLM)
let audioDubActive = false;
let isVideoMuted = false;
let ptVoice = null;
let availablePtVoices = [];
let currentVoiceRate = 1.1; // 1.1x para acompanhar a fala natural
let lastSpokenCueIndex = -1;
let lastSpokenConsolidatedIdx = -1;
let lastReportedTime = 0;
let consolidatedCues = [];
let isSpeakingAudio = false;
let isWaitingForAudioToEnd = false;
let selectedVoiceOption = "neural_francisca"; // Padrão: A Moça do NotebookLM

// ==========================================================================
// 1. INICIALIZAÇÃO DA APLICAÇÃO
// ==========================================================================
document.addEventListener("DOMContentLoaded", () => {
  initVoiceSelector();
  setupEventListeners();
  loadInitialData();
  setupYouTubeIframe();
});

// Agrupador Inteligente: Une micro-fragmentos de 1-2s em orações completas com sentido
function consolidateCues(rawCues) {
  if (!rawCues || rawCues.length === 0) return [];

  const list = [];
  let current = null;

  for (let i = 0; i < rawCues.length; i++) {
    const cue = rawCues[i];
    const textPt = (cue.text_pt || "").trim();
    const textEn = (cue.text_en || "").trim();
    if (!textPt && !textEn) continue;

    if (!current) {
      current = {
        start_seconds: cue.start_seconds,
        timestamp: cue.timestamp,
        text_pt: textPt,
        text_en: textEn,
        originalIndices: [i]
      };
      continue;
    }

    const lastCharPt = current.text_pt.slice(-1);
    const lastCharEn = current.text_en.slice(-1);
    const endsWithPunct = [".", "!", "?", ":"].includes(lastCharPt) || [".", "!", "?", ":"].includes(lastCharEn);
    const durationSoFar = cue.start_seconds - current.start_seconds;
    const gap = cue.start_seconds - (rawCues[i - 1] ? rawCues[i - 1].start_seconds : current.start_seconds);

    // Fecha a frase se houver pontuação forte ou duração acumulada suficiente (>= 5s) ou pausa longa
    if ((endsWithPunct || durationSoFar >= 7.0 || gap > 2.5) && durationSoFar >= 2.0) {
      current.end_seconds = cue.start_seconds;
      list.push(current);
      current = {
        start_seconds: cue.start_seconds,
        timestamp: cue.timestamp,
        text_pt: textPt,
        text_en: textEn,
        originalIndices: [i]
      };
    } else {
      current.text_pt += " " + textPt;
      current.text_en += " " + textEn;
      current.originalIndices.push(i);
    }
  }

  if (current) {
    current.end_seconds = current.start_seconds + 6;
    list.push(current);
  }

  return list;
}

// Inicializar Seletor de Vozes com Destaque para Moça e Moço do NotebookLM
function initVoiceSelector() {
  const select = document.getElementById("voiceSelect");
  if (!select) return;

  function renderVoiceOptions() {
    select.innerHTML = `
      <option value="neural_francisca">🌟 [Moça] Francisca Neural (NotebookLM)</option>
      <option value="neural_antonio">🌟 [Moço] Antonio Neural (NotebookLM)</option>
    `;

    if ('speechSynthesis' in window) {
      const allVoices = window.speechSynthesis.getVoices();
      if (allVoices && allVoices.length > 0) {
        availablePtVoices = allVoices.filter(v => v.lang && (v.lang.startsWith('pt') || v.lang.includes('pt-BR') || v.lang.includes('pt_BR')));
        
        ptVoice = availablePtVoices.find(v => (v.lang === 'pt-BR' || v.lang === 'pt_BR') && (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Francisca') || v.name.includes('Maria') || v.name.includes('Daniel'))) ||
                  availablePtVoices[0] || allVoices[0];

        if (availablePtVoices.length > 0) {
          const group = document.createElement("optgroup");
          group.label = "Vozes do Navegador / Windows";
          availablePtVoices.forEach(v => {
            const opt = document.createElement("option");
            opt.value = `browser_${v.name}`;
            opt.textContent = `🎙️ ${v.name.replace(/Microsoft |Google /g, '')} (${v.lang})`;
            group.appendChild(opt);
          });
          select.appendChild(group);
        }
      }
    }

    select.value = selectedVoiceOption;
  }

  renderVoiceOptions();

  if ('speechSynthesis' in window && window.speechSynthesis.onvoiceschanged !== undefined) {
    window.speechSynthesis.onvoiceschanged = renderVoiceOptions;
  }

  select.onchange = (e) => {
    selectedVoiceOption = e.target.value;
    testVoice();
  };
}

// Carregar Dados Iniciais (Vídeo Padrão Claude Code)
function loadInitialData() {
  // Se temos o data.js carregado localmente
  if (window.TRANSCRIPT_DATA && window.TRANSCRIPT_DATA.length > 0) {
    transcriptData = window.TRANSCRIPT_DATA;
    consolidatedCues = consolidateCues(transcriptData);
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
            consolidatedCues = consolidateCues(transcriptData);
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

  // Botão de Tradução Simultânea de Áudio (Dublagem no Topo)
  const audioToggleBtn = document.getElementById("audioTranslateToggleBtn");
  if (audioToggleBtn) audioToggleBtn.addEventListener("click", toggleAudioDubbing);

  // Botão de Dublagem Abaixo do Player
  const bottomDubBtn = document.getElementById("activateDubbingBottomBtn");
  if (bottomDubBtn) bottomDubBtn.addEventListener("click", toggleAudioDubbing);

  // Botão de Testar Voz PT
  const testVoiceBtn = document.getElementById("testVoiceBtn");
  if (testVoiceBtn) testVoiceBtn.addEventListener("click", testVoice);

  // Botão de Alternar Mudo do YouTube
  const quickMuteBtn = document.getElementById("quickMuteToggleBtn");
  if (quickMuteBtn) {
    quickMuteBtn.addEventListener("click", () => {
      if (isVideoMuted) {
        unmuteYouTubeVideo();
      } else {
        muteYouTubeVideo();
      }
    });
  }

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
  lastSpokenCueIndex = -1;

  // Atualiza Iframe do YouTube com origin seguro e sem conflitos
  const iframe = document.getElementById("youtubeIframe");
  if (iframe) {
    iframe.src = getYouTubeEmbedUrl(currentVideoId);
  }

  // Se a dublagem estiver ativa, garante que o novo vídeo comece mutado
  if (audioDubActive) {
    setTimeout(muteYouTubeVideo, 1000);
  }

  renderAll();
}

// Retorna URL de embed do YouTube com origin dinâmico
function getYouTubeEmbedUrl(videoId) {
  let origin = '';
  try {
    if (window.location && window.location.origin && window.location.origin.startsWith('http')) {
      origin = `&origin=${encodeURIComponent(window.location.origin)}`;
    }
  } catch (e) {}
  return `https://www.youtube-nocookie.com/embed/${videoId}?enablejsapi=1${origin}&rel=0&playsinline=1`;
}

// ==========================================================================
// 3. TRADUÇÃO SIMULTÂNEA DE ÁUDIO (DUBLAGEM COM SPEECH SYNTHESIS & VÍDEO MUTADO)
// ==========================================================================
function toggleAudioDubbing() {
  audioDubActive = !audioDubActive;
  updateDubbingInterface();

  if (audioDubActive) {
    // 1. MUTA O VÍDEO DO YOUTUBE COMPLETAMENTE (0% VOLUME)
    muteYouTubeVideo();

    // 2. Feedback audível imediato (desbloqueia áudio no navegador com clique do usuário)
    speakText("Dublagem ativada. O vídeo em inglês foi mutado e você ouvirá em português.");

    // 3. Atualiza o banner visual
    updateLiveDubbingBanner("🎙️ Dublagem Ativa", "Vídeo em inglês mutado. Sincronizando fala em Português...", false);

    isWaitingForAudioToEnd = false;

    if (!consolidatedCues || consolidatedCues.length === 0) {
      consolidatedCues = consolidateCues(transcriptData);
    }

    const select = document.getElementById("voiceSelect");
    const val = select ? select.value : selectedVoiceOption;
    let greeting = "Dublagem ativada com voz em português. O vídeo original em inglês foi mutado.";
    if (val === "neural_francisca") {
      greeting = "Dublagem ativada com a voz da moça do NotebookLM. O vídeo em inglês foi mutado e você me ouvirá em português.";
    } else if (val === "neural_antonio") {
      greeting = "Dublagem ativada com a voz do moço do NotebookLM. O vídeo em inglês foi mutado e você me ouvirá em português.";
    }

    updateLiveDubbingBanner("🎙️ Dublagem Ativa", "Vídeo em inglês mutado. Sincronizando fala sem cortes em Português...", false);

    startPlaybackSync();
    sendYouTubeCommand('playVideo');

    // Fala introdução e já sincroniza com o ponto atual do vídeo
    speakUnified(greeting, -1, () => {
      if (player && typeof player.getCurrentTime === 'function') {
        syncPlaybackWithTime(player.getCurrentTime());
      }
    });
  } else {
    // Desmuta o vídeo do YouTube (restaura volume original)
    unmuteYouTubeVideo();
    isSpeakingAudio = false;
    isWaitingForAudioToEnd = false;

    const neuralAudio = document.getElementById("neuralAudioPlayer");
    if (neuralAudio) {
      neuralAudio.pause();
      neuralAudio.currentTime = 0;
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }

    updateLiveDubbingBanner("Dublagem Desativada", "Som original em inglês restaurado.", false);
  }
}

// Atualiza o estado visual de todos os botões e badges de dublagem
function updateDubbingInterface() {
  const topBtn = document.getElementById("audioTranslateToggleBtn");
  const topText = document.getElementById("audioTranslateBtnText");
  const bottomBtn = document.getElementById("activateDubbingBottomBtn");
  const badge = document.getElementById("audioStatusBadge");

  if (audioDubActive) {
    if (topBtn) topBtn.classList.add("active");
    if (topText) topText.textContent = "Dublagem Ativa (Vídeo Mutado)";
    if (bottomBtn) {
      bottomBtn.classList.add("active");
      bottomBtn.innerHTML = "<span>🎙️</span> Dublagem Ativa (Vídeo Mutado)";
    }
    if (badge) {
      badge.className = "audio-status-badge active";
      badge.textContent = "🎙️ Vídeo Mutado • Dublagem PT-BR Ativa";
    }
  } else {
    if (topBtn) topBtn.classList.remove("active");
    if (topText) topText.textContent = "Tradução Simultânea em Áudio (PT-BR)";
    if (bottomBtn) {
      bottomBtn.classList.remove("active");
      bottomBtn.innerHTML = "<span>🎙️</span> Ativar Dublagem (Muta Vídeo)";
    }
    if (badge) {
      badge.className = "audio-status-badge inactive";
      badge.textContent = "🎙️ Áudio Original em Inglês";
    }
  }
}

// Mutar completamente o YouTube (volume 0 e comando mute)
function muteYouTubeVideo() {
  isVideoMuted = true;
  sendYouTubeCommand('mute');
  sendYouTubeCommand('setVolume', [0]);

  const btn = document.getElementById("quickMuteToggleBtn");
  const icon = document.getElementById("quickMuteIcon");
  const label = document.getElementById("quickMuteLabel");
  if (btn) {
    btn.classList.add("muted");
    if (icon) icon.textContent = "🔇";
    if (label) label.textContent = "Vídeo Mutado";
  }
}

// Desmutar o YouTube (volume 100 e unMute)
function unmuteYouTubeVideo() {
  isVideoMuted = false;
  sendYouTubeCommand('unMute');
  sendYouTubeCommand('setVolume', [100]);

  const btn = document.getElementById("quickMuteToggleBtn");
  const icon = document.getElementById("quickMuteIcon");
  const label = document.getElementById("quickMuteLabel");
  if (btn) {
    btn.classList.remove("muted");
    if (icon) icon.textContent = "🔊";
    if (label) label.textContent = "Som Original";
  }
}

// Testar a voz em português instantaneamente (Moça ou Moço do NotebookLM ou local)
function testVoice() {
  const select = document.getElementById("voiceSelect");
  const chosen = select ? select.value : selectedVoiceOption;

  let sample = "";
  if (chosen === "neural_francisca") {
    sample = "Olá! Eu sou a Francisca, a voz da moça do NotebookLM. Traduzirei e falarei o vídeo em português com pronúncia de estúdio e sem cortar nenhuma frase!";
  } else if (chosen === "neural_antonio") {
    sample = "Olá! Eu sou o Antonio, a voz do moço do NotebookLM. Acompanharei o vídeo em português com total clareza e ritmo perfeito!";
  } else {
    sample = "Olá! Esta é a voz nativa do sistema em português brasileiro, sincronizada perfeitamente com o vídeo.";
  }

  updateLiveDubbingBanner("🎙️ Testando Voz", `"${sample}"`, true);
  speakUnified(sample, -1);
}

// Atualizar banner de texto falado ao vivo
function updateLiveDubbingBanner(status, text, isSpeaking = false) {
  const badge = document.getElementById("liveDubbingBadge");
  const badgeText = document.getElementById("liveDubbingBadgeText");
  const content = document.getElementById("liveDubbingText");

  if (badge) {
    if (isSpeaking) {
      badge.classList.add("speaking");
    } else {
      badge.classList.remove("speaking");
    }
  }
  if (badgeText) badgeText.textContent = status;
  if (content) content.textContent = text;
}

// Sistema Central de Síntese de Áudio: Suporta Vozes Neurais de Estúdio e Web Speech Fallback
function speakUnified(text, cueIndex, onEndCallback) {
  if (!text || !text.trim()) return;

  const cleanText = text.trim();
  const select = document.getElementById("voiceSelect");
  const chosenVoice = select ? select.value : selectedVoiceOption;

  // Cancela áudio neural anterior se estiver em execução
  const neuralAudio = document.getElementById("neuralAudioPlayer");
  if (neuralAudio) {
    neuralAudio.pause();
    neuralAudio.currentTime = 0;
  }

  // Cancela síntese de voz nativa
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    if (window.speechSynthesis.paused) window.speechSynthesis.resume();
  }

  isSpeakingAudio = true;

  // Se for uma das vozes neurais do NotebookLM (Francisca ou Antonio)
  if (chosenVoice === "neural_francisca" || chosenVoice === "neural_antonio") {
    const voiceParam = chosenVoice === "neural_francisca" ? "pt-BR-FranciscaNeural" : "pt-BR-AntonioNeural";
    const voiceLabel = chosenVoice === "neural_francisca" ? "🌟 Moça (Francisca)" : "🌟 Moço (Antonio)";

    const labelPrefix = cueIndex >= 0 ? `🎙️ ${voiceLabel} [Trecho #${cueIndex + 1}]:` : `🎙️ ${voiceLabel}:`;
    updateLiveDubbingBanner(labelPrefix, `"${cleanText}"`, true);

    if (neuralAudio) {
      neuralAudio.src = `/api/tts?text=${encodeURIComponent(cleanText)}&voice=${voiceParam}`;
      neuralAudio.playbackRate = currentVoiceRate;

      neuralAudio.onended = () => {
        isSpeakingAudio = false;
        updateLiveDubbingBanner("🎙️ Dublagem Sincronizada", `Último trecho falado: "${cleanText}"`, false);
        
        // Se o YouTube estava pausado esperando o término da frase, despausa imediatamente!
        if (isWaitingForAudioToEnd) {
          isWaitingForAudioToEnd = false;
          sendYouTubeCommand('playVideo');
        }
        if (onEndCallback) onEndCallback();
      };

      neuralAudio.onerror = (err) => {
        console.warn("API de áudio neural indisponível, usando voz local do navegador:", err);
        isSpeakingAudio = false;
        speakWebSpeech(cleanText, cueIndex, onEndCallback);
      };

      neuralAudio.play().catch(e => {
        console.warn("Autoplay bloqueado pelo navegador, alternando para síntese local:", e);
        speakWebSpeech(cleanText, cueIndex, onEndCallback);
      });
    } else {
      speakWebSpeech(cleanText, cueIndex, onEndCallback);
    }
  } else {
    // Voz selecionada do navegador / Windows
    speakWebSpeech(cleanText, cueIndex, onEndCallback);
  }
}

// Síntese de voz com a Web Speech API do navegador
function speakWebSpeech(text, cueIndex, onEndCallback) {
  if (!('speechSynthesis' in window) || !text) return;

  window.speechSynthesis.cancel();
  if (window.speechSynthesis.paused) window.speechSynthesis.resume();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'pt-BR';
  if (ptVoice) utterance.voice = ptVoice;
  utterance.rate = currentVoiceRate;
  utterance.pitch = 1.0;

  utterance.onstart = () => {
    isSpeakingAudio = true;
    const labelPrefix = cueIndex >= 0 ? `🎙️ Voz Local [Trecho #${cueIndex + 1}]:` : `🎙️ Voz Local:`;
    updateLiveDubbingBanner(labelPrefix, `"${text}"`, true);
  };

  utterance.onend = () => {
    isSpeakingAudio = false;
    updateLiveDubbingBanner("🎙️ Dublagem Sincronizada", `Último trecho: "${text}"`, false);
    
    // Se o YouTube estava aguardando término da oração, despausa
    if (isWaitingForAudioToEnd) {
      isWaitingForAudioToEnd = false;
      sendYouTubeCommand('playVideo');
    }
    if (onEndCallback) onEndCallback();
  };

  utterance.onerror = (e) => {
    console.warn("SpeechSynthesis erro:", e);
    isSpeakingAudio = false;
    if (isWaitingForAudioToEnd) {
      isWaitingForAudioToEnd = false;
      sendYouTubeCommand('playVideo');
    }
  };

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
// 5. YOUTUBE IFRAME API, POSTMESSAGE & CONTROLE DE SINCRONIZAÇÃO
// ==========================================================================
function setupYouTubeIframe() {
  const iframe = document.getElementById("youtubeIframe");
  if (iframe && (!iframe.src || iframe.src.includes("origin=https://www.youtube.com"))) {
    iframe.src = getYouTubeEmbedUrl(currentVideoId);
  }

  if (window.YT && window.YT.Player) {
    initYTPlayer();
  } else {
    const tag = document.createElement('script');
    tag.src = "https://www.youtube.com/iframe_api";
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
  }
}

function onYouTubeIframeAPIReady() {
  initYTPlayer();
}

function initYTPlayer() {
  try {
    player = new YT.Player('youtubeIframe', {
      events: {
        'onReady': onPlayerReady,
        'onStateChange': onPlayerStateChange
      }
    });
  } catch (err) {
    console.warn("Aviso ao conectar YT.Player:", err);
  }
}

function onPlayerReady(event) {
  playerReady = true;
  try {
    const duration = player.getDuration();
    if (duration > 0) {
      document.getElementById("playerTotalTime").textContent = formatSeconds(duration);
    }
  } catch (e) {}

  if (audioDubActive) {
    muteYouTubeVideo();
  }
  startPlaybackSync();
}

function onPlayerStateChange(event) {
  if (event.data === YT.PlayerState.PLAYING) {
    if (audioDubActive) {
      muteYouTubeVideo();
    }
    startPlaybackSync();
  } else if (event.data === YT.PlayerState.PAUSED) {
    if (audioDubActive && 'speechSynthesis' in window) {
      window.speechSynthesis.pause();
    }
  }
}

// Enviar comandos tanto pelo objeto do player quanto via postMessage direto
function sendYouTubeCommand(func, args = []) {
  if (player && typeof player[func] === 'function') {
    try {
      player[func](...args);
    } catch (e) {
      console.warn("player[func] err:", e);
    }
  }

  const iframe = document.getElementById("youtubeIframe");
  if (iframe && iframe.contentWindow) {
    try {
      iframe.contentWindow.postMessage(JSON.stringify({
        event: 'command',
        func: func,
        args: args
      }), '*');
    } catch (e) {
      console.warn("postMessage err:", e);
    }
  }
}

function startPlaybackSync() {
  if (syncTimer) clearInterval(syncTimer);
  syncTimer = setInterval(syncPlaybackLoop, 200);
}

function stopPlaybackSync() {
  if (syncTimer) clearInterval(syncTimer);
}

function syncPlaybackLoop() {
  if (!player || typeof player.getCurrentTime !== 'function') return;

  try {
    const currentSeconds = player.getCurrentTime();
    if (typeof currentSeconds === 'number' && !isNaN(currentSeconds)) {
      syncPlaybackWithTime(currentSeconds);
    }
  } catch (e) {}
}

// Sincronização centralizada do tempo de reprodução com a transcrição (Orquestrador Sem Cortes)
function syncPlaybackWithTime(currentSeconds) {
  lastReportedTime = currentSeconds;
  const timeDisplay = document.getElementById("playerCurrentTime");
  if (timeDisplay) timeDisplay.textContent = formatSeconds(currentSeconds);

  if (!transcriptData || transcriptData.length === 0) return;

  // 1. Destaque visual na lista lateral de falas individuais
  let rawActiveIdx = -1;
  for (let i = 0; i < transcriptData.length; i++) {
    const start = transcriptData[i].start_seconds;
    const nextStart = transcriptData[i + 1] ? transcriptData[i + 1].start_seconds : start + 6;
    if (currentSeconds >= start && currentSeconds < nextStart) {
      rawActiveIdx = i;
      break;
    }
  }

  if (rawActiveIdx !== -1 && rawActiveIdx !== currentActiveCueIndex) {
    setActiveCue(rawActiveIdx);
  }

  // 2. Localização da oração completa no bloco consolidado
  if (!consolidatedCues || consolidatedCues.length === 0) {
    consolidatedCues = consolidateCues(transcriptData);
  }

  let activeConsolidatedIdx = -1;
  for (let j = 0; j < consolidatedCues.length; j++) {
    const start = consolidatedCues[j].start_seconds;
    const nextStart = consolidatedCues[j + 1] ? consolidatedCues[j + 1].start_seconds : (consolidatedCues[j].end_seconds || start + 8);
    if (currentSeconds >= start && currentSeconds < nextStart) {
      activeConsolidatedIdx = j;
      break;
    }
  }

  // 3. Execução da Dublagem Sincronizada (Sem Cortar Frases)
  if (audioDubActive) {
    // Mantém YouTube sempre sem áudio em inglês
    sendYouTubeCommand('mute');
    sendYouTubeCommand('setVolume', [0]);

    const smartSyncWait = document.getElementById("smartSyncWait")?.checked;

    // Se o vídeo já chegou na próxima oração MAS a voz ainda está finalizando a frase anterior:
    if (isSpeakingAudio && activeConsolidatedIdx > lastSpokenConsolidatedIdx && smartSyncWait) {
      // O vídeo do YouTube está mais rápido que a voz! Pausa o vídeo suavemente até a voz terminar
      if (!isWaitingForAudioToEnd) {
        isWaitingForAudioToEnd = true;
        sendYouTubeCommand('pauseVideo');
        updateLiveDubbingBanner("⏳ Concluindo fala...", "Aguardando término da oração para não cortar nenhuma palavra!", true);
      }
      return; // Aguarda o onended para avançar
    }

    // Se mudou de frase e não está pausado esperando
    if (activeConsolidatedIdx !== -1 && activeConsolidatedIdx !== lastSpokenConsolidatedIdx && !isWaitingForAudioToEnd) {
      lastSpokenConsolidatedIdx = activeConsolidatedIdx;
      const c = consolidatedCues[activeConsolidatedIdx];
      const textToSpeak = c.text_pt || c.text_en;
      speakUnified(textToSpeak, activeConsolidatedIdx);
    }
  }
}

// Ouvinte Universal para eventos nativos do YouTube Iframe (postMessage)
window.addEventListener("message", (event) => {
  try {
    let data = event.data;
    if (typeof data === "string") {
      try { data = JSON.parse(data); } catch (e) { return; }
    }
    if (!data) return;

    if (data.event === "onReady") {
      playerReady = true;
      if (audioDubActive) muteYouTubeVideo();
    }

    if (data.event === "infoDelivery" && data.info) {
      if (typeof data.info.currentTime === "number") {
        syncPlaybackWithTime(data.info.currentTime);
      }
      if (typeof data.info.duration === "number" && data.info.duration > 0) {
        const total = document.getElementById("playerTotalTime");
        if (total) total.textContent = formatSeconds(data.info.duration);
      }
      if (typeof data.info.playerState === "number") {
        if (data.info.playerState === 1) { // PLAYING
          if (audioDubActive) muteYouTubeVideo();
          startPlaybackSync();
        } else if (data.info.playerState === 2) { // PAUSED
          // Se não estiver aguardando áudio terminar, pausa o áudio
          if (!isWaitingForAudioToEnd) {
            const neuralAudio = document.getElementById("neuralAudioPlayer");
            if (neuralAudio && !neuralAudio.paused) neuralAudio.pause();
            if (audioDubActive && 'speechSynthesis' in window) {
              window.speechSynthesis.pause();
            }
          }
        }
      }
    }
  } catch (e) {}
});

function setActiveCue(index) {
  currentActiveCueIndex = index;
  document.querySelectorAll(".cue-row").forEach(r => r.classList.remove("active"));

  const el = document.getElementById(`cue-row-${index}`);
  if (el) {
    el.classList.add("active");
    if (document.getElementById("syncAutoScroll") && document.getElementById("syncAutoScroll").checked) {
      const container = document.getElementById("cuesScrollArea");
      if (container) {
        const offset = el.offsetTop - container.offsetTop - (container.clientHeight / 3);
        container.scrollTo({ top: Math.max(0, offset), behavior: "smooth" });
      }
    }
  }
}

function seekToSeconds(seconds) {
  isSpeakingAudio = false;
  isWaitingForAudioToEnd = false;

  const neuralAudio = document.getElementById("neuralAudioPlayer");
  if (neuralAudio) {
    neuralAudio.pause();
    neuralAudio.currentTime = 0;
  }
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }

  sendYouTubeCommand('seekTo', [seconds, true]);
  sendYouTubeCommand('playVideo');
  lastSpokenCueIndex = -1;
  lastSpokenConsolidatedIdx = -1;
  syncPlaybackWithTime(seconds);
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
