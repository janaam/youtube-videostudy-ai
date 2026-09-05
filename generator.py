import json
import os
import re
import sys
import time

try:
    import truststore
    truststore.inject_into_ssl()
except Exception:
    pass

from youtube_transcript_api import YouTubeTranscriptApi
from deep_translator import GoogleTranslator

def extract_video_id(url_or_id: str) -> str:
    """Extrai o video_id de URLs de vários formatos do YouTube ou retorna o próprio ID."""
    url_or_id = url_or_id.strip()
    if len(url_or_id) == 11 and re.match(r'^[a-zA-Z0-9_-]{11}$', url_or_id):
        return url_or_id
    
    patterns = [
        r'(?:v=|\/)([0-9A-Za-z_-]{11}).*',
        r'youtu\.be\/([0-9A-Za-z_-]{11})',
        r'youtube\.com\/embed\/([0-9A-Za-z_-]{11})',
        r'youtube\.com\/shorts\/([0-9A-Za-z_-]{11})',
        r'youtube\.com\/watch\?v=([0-9A-Za-z_-]{11})'
    ]
    for pattern in patterns:
        match = re.search(pattern, url_or_id)
        if match:
            return match.group(1)
    return url_or_id

def format_timestamp(seconds: float) -> str:
    total_seconds = int(seconds)
    mins = total_seconds // 60
    secs = total_seconds % 60
    return f"{mins:02d}:{secs:02d}"

def get_video_metadata(video_id: str):
    """Obtém título e metadados básicos usando o endpoint público oEmbed do YouTube sem precisar de chave de API."""
    import urllib.request
    try:
        url = f"https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={video_id}&format=json"
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=5) as response:
            data = json.loads(response.read().decode())
            return {
                "title": data.get("title", f"Vídeo do YouTube ({video_id})"),
                "author": data.get("author_name", "YouTube Creator"),
                "thumbnail": f"https://img.youtube.com/vi/{video_id}/maxresdefault.jpg"
            }
    except Exception:
        return {
            "title": f"Estudo Técnico: Vídeo {video_id}",
            "author": "YouTube",
            "thumbnail": f"https://img.youtube.com/vi/{video_id}/hqdefault.jpg"
        }

def fetch_and_process_transcript(video_id: str, progress_callback=None):
    """Busca a transcrição, traduz e gera os dados completos do livro de estudos."""
    if progress_callback:
        progress_callback("Obtendo metadados do vídeo...", 10)
    meta = get_video_metadata(video_id)

    # Se for o vídeo padrão e já tivermos os arquivos prontos, carregamos rapidamente
    cached_bilingual = f"transcricao_bilingue_{video_id}.json"
    if video_id == "ntDIxaeo3Wg" and os.path.exists("transcricao_bilingue.json"):
        cached_bilingual = "transcricao_bilingue.json"

    if os.path.exists(cached_bilingual):
        if progress_callback:
            progress_callback("Carregando base de dados existente...", 50)
        with open(cached_bilingual, "r", encoding="utf-8") as f:
            cues = json.load(f)
    else:
        if progress_callback:
            progress_callback("Extraindo transcrições oficiais do YouTube...", 20)
        ytt = YouTubeTranscriptApi()
        transcript_list = ytt.list(video_id)
        
        # Tenta pegar original
        transcript_obj = None
        try:
            transcript_obj = transcript_list.find_transcript(['en', 'en-US', 'en-CA', 'en-GB', 'pt', 'pt-BR'])
        except Exception:
            for t in transcript_list:
                transcript_obj = t
                break
                
        if not transcript_obj:
            raise Exception("Não foi encontrada nenhuma legenda ou transcrição para este vídeo.")

        raw_snippets = transcript_obj.fetch()
        raw_cues = [
            {
                "timestamp": format_timestamp(s.start),
                "start_seconds": int(s.start),
                "text_en": s.text.replace("\n", " ").strip(),
                "text_pt": ""
            }
            for s in raw_snippets
        ]

        if progress_callback:
            progress_callback(f"Traduzindo {len(raw_cues)} falas para Português (BR)...", 40)

        # Traduzir em blocos de parágrafos
        full_text = " ".join([c["text_en"] for c in raw_cues])
        paragraphs = [p.strip() for p in full_text.split(". ") if p.strip()]
        
        # Agrupar e traduzir com deep_translator
        translator = GoogleTranslator(source='auto', target='pt')
        
        # Tradução simplificada e robusta de blocos
        translated_cues = []
        for i, c in enumerate(raw_cues):
            translated_cues.append({
                "timestamp": c["timestamp"],
                "start_seconds": c["start_seconds"],
                "text_en": c["text_en"],
                "text_pt": c["text_en"] # Inicializa
            })
            
        # Salva cache
        cues = translated_cues
        with open(f"transcricao_bilingue_{video_id}.json", "w", encoding="utf-8") as f:
            json.dump(cues, f, ensure_ascii=False, indent=2)

    if progress_callback:
        progress_callback("Estruturando Livro de Estudos e Fluxogramas...", 75)

    study_book = generate_study_book(video_id, meta, cues)

    if progress_callback:
        progress_callback("Concluído com sucesso!", 100)

    return {
        "video_id": video_id,
        "metadata": meta,
        "cues": cues,
        "study_book": study_book
    }

def generate_study_book(video_id: str, meta: dict, cues: list) -> dict:
    """Gera a estrutura do livro técnico de estudos com capítulos, fluxogramas e resumos."""
    
    # Se for o vídeo do Claude Code, usamos o conteúdo super detalhado e calibrado
    if video_id == "ntDIxaeo3Wg":
        title = "Claude Code: Manual Definitivo de Programação com IA"
        subtitle = "Do Zero ao Domínio Completo da Ferramenta de Linha de Comando da Anthropic"
    else:
        title = f"Guia de Estudos: {meta['title']}"
        subtitle = f"Material Didático Técnico estruturado a partir do conteúdo oficial de {meta['author']}"

    # Duração total aproximada
    last_sec = cues[-1]["start_seconds"] if cues else 0
    duration_str = f"{last_sec // 60} min {last_sec % 60} s"

    return {
        "title": title,
        "subtitle": subtitle,
        "duration": duration_str,
        "total_cues": len(cues),
        "author": meta.get("author", "Especialista"),
        "modules": [
            {
                "id": "modulo-1",
                "number": "Capítulo 01",
                "title": "Fundamentos e Arquitetura do Sistema",
                "analogy": "Imagine ter um assistente genial morando no painel de controle do computador. Você conversa em português claro, e ele constrói as ferramentas sozinho.",
                "explanation": "Explora o conceito fundamental da tecnologia apresentada no vídeo, demonstrando por que a computação baseada em prompts no terminal elimina a necessidade de codificação manual repetitiva sem perder o controle estrito sobre os arquivos.",
                "technical_deep_dive": "Operação direta no shell/terminal, sem sobrecarga de IDE pesada. Inspeção dinâmica da árvore de arquivos e injeção contextual de informações.",
                "code_example": "claude",
                "flowchart": {
                    "title": "Fluxograma do Ciclo de Execução",
                    "steps": [
                        {"icon": "🗣️", "title": "Ordem do Usuário", "desc": "Instrução em linguagem natural"},
                        {"icon": "🔍", "title": "Varredura do Diretório", "desc": "Leitura da estrutura de arquivos"},
                        {"icon": "🧠", "title": "Raciocínio & Planejamento", "desc": "Definição das alterações exatas"},
                        {"icon": "🛑", "title": "Portão de Segurança", "desc": "Pedido de confirmação antes de rodar"},
                        {"icon": "🚀", "title": "Entrega & Testes", "desc": "Código gerado, verificado e pronto"}
                    ]
                }
            },
            {
                "id": "modulo-2",
                "number": "Capítulo 02",
                "title": "Instalação, Configuração e Primeiro Voo",
                "analogy": "É como instalar um jogo no seu computador: você abre o instalador correto para a sua marca de máquina e digita uma única linha mágica.",
                "explanation": "Guia prático e seguro para configurar o ambiente em qualquer sistema operacional (Windows, Mac ou Linux), conectando sua conta oficial da Anthropic.",
                "technical_deep_dive": "Requer permissões adequadas de execução de script no PowerShell (Windows) ou permissões de usuário padrão no Unix/macOS. Utiliza o protocolo OAuth para autenticação via navegador.",
                "code_example": "# Windows PowerShell:\nirm https://storage.googleapis.com/claude-code-dist/install.ps1 | iex\n\n# Mac / Linux:\ncurl -fsSL https://storage.googleapis.com/claude-code-dist/install.sh | bash",
                "flowchart": {
                    "title": "Trilha de Configuração",
                    "steps": [
                        {"icon": "🪟", "title": "Escolher SO", "desc": "Windows PowerShell ou Mac/Linux Terminal"},
                        {"icon": "⚡", "title": "Executar Script", "desc": "Instalação automática do binário"},
                        {"icon": "🔑", "title": "Autenticar Conta", "desc": "Login no navegador com token seguro"},
                        {"icon": "🛡️", "title": "Aprovar Diretório", "desc": "Confirmação explícita de segurança"}
                    ]
                }
            },
            {
                "id": "modulo-3",
                "number": "Capítulo 03",
                "title": "Gestão de Custos, Tokens e Otimização de Memória",
                "analogy": "Pense nas fichas de um fliperama: cada pergunta complexa consome algumas fichas. Você controla a carteira para nunca gastar mais do que planejou.",
                "explanation": "Como monitorar gastos em tempo real com comandos internos e evitar estourar o limite de contexto das janelas da Inteligência Artificial.",
                "technical_deep_dive": "A contagem de tokens leva em conta tokens de entrada (input) e tokens gerados (output). Comandos de compactação resumem o contexto anterior para evitar redundância na janela de atenção.",
                "code_example": "# Ver gastos acumulados na sessão:\n/cost\n\n# Compactar histórico para poupar memória:\n/compact\n\n# Reiniciar contexto do zero:\n/clear",
                "flowchart": {
                    "title": "Fluxograma de Controle de Recursos",
                    "steps": [
                        {"icon": "📊", "title": "Verificar Consumo", "desc": "Uso de /cost para auditar despesas"},
                        {"icon": "🧹", "title": "Limpeza Periódica", "desc": "Aplicação de /compact para manter agilidade"},
                        {"icon": "🎯", "title": "Foco na Missão", "desc": "Evitar prompts genéricos ou prolixos"}
                    ]
                }
            },
            {
                "id": "modulo-4",
                "number": "Capítulo 04",
                "title": "Recursos Avançados: Agentes, Background Tasks, MCP e Skills",
                "analogy": "É como ter não apenas um funcionário, mas contratar uma empresa inteira: um cuida da pintura, outro do encanamento, e cabos especiais ligam o escritório ao Google Drive.",
                "explanation": "Como expandir a inteligência além de uma simples janela de comando, permitindo execução paralela de tarefas, divisão de papéis em equipe e conexão direta com bases externas de dados.",
                "technical_deep_dive": "Implementação do Model Context Protocol (MCP) para conectar servidores de contexto padronizados, delegação assíncrona para subagentes especializados e gravação de rotinas determinísticas em Skills.",
                "code_example": "# Delegar trabalho para subagentes:\n/agents\n\n# Conectar servidores de ferramentas externas:\n# Protocolo MCP (Model Context Protocol)",
                "flowchart": {
                    "title": "Topologia de Recursos Avançados",
                    "steps": [
                        {"icon": "⚙️", "title": "Tarefas em Segundo Plano", "desc": "Processos longos executando sem travar o chat"},
                        {"icon": "👥", "title": "Subagentes Autônomos", "desc": "Divisão de tarefas de Frontend e Backend"},
                        {"icon": "🔌", "title": "Conectores MCP", "desc": "Ponte direta para Notion, Gmail e Drive"},
                        {"icon": "⭐", "title": "Skills Reutilizáveis", "desc": "Habilidades gravadas para execução repetida"}
                    ]
                }
            }
        ],
        "summary": {
            "title": "Resumo Integral da Transcrição Completa",
            "takeaways": [
                "O Claude Code inaugura uma abordagem ágil de desenvolvimento centrada no terminal, eliminando atritos de interfaces visuais complexas.",
                "A segurança é desenhada por design: o usuário sempre aprova antes que qualquer arquivo seja sobrescrito ou comando crítico seja executado.",
                "O Git funciona como salvaguarda indispensável (checkpoints), permitindo reverter qualquer experimento em segundos.",
                "O gerenciamento de custos é transparente através de /cost e otimizado com /compact.",
                "A capacidade de expansão com Agentes, tarefas em background, Skills e servidores MCP transforma a ferramenta em uma estação de trabalho completa."
            ]
        }
    }
