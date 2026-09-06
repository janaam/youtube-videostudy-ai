# 📘 Guia de Uso Completo: VideoStudy AI & Vercel Global

Este guia documenta todas as instruções de uso da plataforma **VideoStudy AI**, além do funcionamento e comandos da **Vercel CLI** e do plugin **`vercel-plugin`** configurados no seu sistema para serem utilizados em qualquer projeto.

---

## 📑 Sumário
1. [Sobre o VideoStudy AI](#1-sobre-o-videostudy-ai)
2. [Como Usar a Tradução Simultânea em Áudio (Dublagem PT-BR com Vídeo Mutado)](#2-como-usar-a-tradução-simultânea-em-áudio-dublagem-pt-br-com-vídeo-mutado)
3. [Como Gerar Livros de Estudos de Qualquer Vídeo do YouTube](#3-como-gerar-livros-de-estudos-de-qualquer-vídeo-do-youtube)
4. [Vercel CLI: Comandos Globais para Qualquer Projeto](#4-vercel-cli-comandos-globais-para-qualquer-projeto)
5. [Vercel Plugin Oficial para Agentes de Código (Instalação e Uso Global)](#5-vercel-plugin-oficial-para-agentes-de-código-instalação-e-uso-global)
6. [Como Fazer Novos Deploys no GitHub e Vercel](#6-como-fazer-novos-deploys-no-github-e-vercel)

---

## 1. Sobre o VideoStudy AI

O **VideoStudy AI** transforma qualquer vídeo do YouTube em um **Livro Técnico de Estudos** completo com:
- **Linguagem Simples e Acessível**: analogias claras que qualquer pessoa de 12 anos entende, sem jargões desnecessários;
- **Profundidade Técnica**: sem omitir conceitos importantes da tecnologia;
- **Fluxogramas de Processo**: diagramas visuais passo a passo para cada capítulo;
- **Transcrição Sincronizada Bilíngue**: falas em Português e Inglês com timestamps clicáveis;
- **Dublagem em Tempo Real com Vídeo Mutado**: escute qualquer vídeo em inglês dublado em português brasileiro, silenciando o áudio original.

---

## 2. Como Usar a Tradução Simultânea em Áudio (Dublagem PT-BR com Vídeo Mutado)

Ao assistir a vídeos técnicos em inglês, a ferramenta traduz e fala o áudio em português em tempo real:

1. Acesse a aba **`🎥 Player & Transcrição Sincronizada`**;
2. Clique no botão **`🎙️ Tradução Simultânea em Áudio (PT-BR)`** (localizado no topo ou no botão rápido abaixo do player);
3. **O vídeo do YouTube é 100% mutado automaticamente** (volume zerado), eliminando o áudio em inglês;
4. O navegador começa a falar **apenas a voz em Português do Brasil**, sincronizada trecho a trecho com o que o apresentador está explicando;
5. **Banner ao Vivo**: uma barra logo abaixo do player exibe o trecho exato que a IA está falando no momento;
6. **Controles Adicionais**:
   - **`[ 🎙️ Testar Voz PT ]`**: clique para testar o som do sintetizador instantaneamente no seu navegador;
   - **`[ 🔇 Original Mutado / 🔊 Som Original ]`**: botão rápido para alternar o mudo do YouTube manualmente a qualquer momento;
   - **`[ 1.1x ]`**: alterne a velocidade da voz (`1.0x`, `1.1x`, `1.25x`, `1.35x`) para acompanhar o ritmo do apresentador;
   - **Seletor de Vozes**: escolha entre as vozes em português instaladas no seu Windows (Google, Microsoft Maria, Francisca, etc.).

---

## 3. Como Gerar Livros de Estudos de Qualquer Vídeo do YouTube

1. Na barra superior da aplicação, cole o link de qualquer vídeo do YouTube:
   - Exemplo: `https://www.youtube.com/watch?v=SEU_VIDEO` ou `https://youtu.be/SEU_VIDEO`
2. Clique no botão **`✨ Gerar Livro & Guia`**;
3. A aplicação executará o ciclo completo:
   - Extração da legenda oficial/gerada do YouTube;
   - Tradução e refinamento semântico para Português do Brasil;
   - Criação dos módulos didáticos com analogias e aprofundamento técnico sem omissões;
   - Geração dos 4 fluxogramas conceituais horizontais;
   - Compilação do Resumo Geral de toda a transcrição;
4. No botão **`Exportar`**, você pode baixar:
   - **Livro Técnico (HTML Offline)** para ler e estudar onde quiser;
   - **Transcrição (.txt)** com ou sem timestamps;
   - **Legendas (.srt)** prontas para usar.

---

## 4. Vercel CLI: Comandos Globais para Qualquer Projeto

A ferramenta oficial da Vercel (`v59.11.7`) está instalada globalmente no seu computador. Você pode abrir o PowerShell ou CMD em qualquer pasta de projeto e usar:

| Comando | O que faz |
| :--- | :--- |
| `vercel` | Faz o deploy de pré-visualização (Preview) da pasta atual |
| `vercel --prod` | Publica a versão atual diretamente em **Produção** |
| `vercel link` | Conecta a pasta local a um projeto existente na Vercel |
| `vercel env pull` | Baixa as variáveis de ambiente do projeto para um arquivo `.env` local |
| `vercel logs` | Exibe os logs de execução e erros em tempo real |
| `vercel dev` | Inicia um servidor de desenvolvimento idêntico ao ambiente da nuvem |

---

## 5. Vercel Plugin Oficial para Agentes de Código (Instalação e Uso Global)

Para transformar qualquer agente de código (Claude Code, Cursor, Codex ou Antigravity) em um especialista Vercel:

### Como Instalar em Qualquer Projeto ou Terminal:
Basta rodar o comando:
```bash
npx plugins add vercel/vercel-plugin
```

### Onde ele está instalado no seu computador:
O plugin foi configurado no escopo global de usuário:
- **Antigravity / Gemini CLI**: `C:\Users\javila\.gemini\config\plugins\vercel-plugin`
- **Claude Code**: `C:\Users\javila\.claude\plugins\vercel-plugin`
- **Cursor**: `C:\Users\javila\.cursor\plugins\vercel-plugin`

### Recursos Inclusos no Plugin:
- **35 Skills Especializadas**:
  - `nextjs`: App Router, Server Actions, Server Components e Cache;
  - `deployments-cicd`: Diagnóstico e automação de builds e previews;
  - `vercel-functions`: Configuração de Serverless Functions (Node.js e Python);
  - `ai-sdk`: Desenvolvimento de recursos de IA, chat, streaming e agentes;
  - `cdn-caching`: Otimização de ISR, cache hit rates e performance;
- **Agentes Especialistas**:
  - `ai-architect`: Arquiteto de soluções com Inteligência Artificial;
  - `deployment-expert`: Resolução de falhas de build e deploy;
  - `performance-optimizer`: Otimização de Core Web Vitals e carregamento rápido;
- **Servidor MCP**: Integração direta para gerenciar deployments e consultar métricas.

---

## 6. Como Fazer Novos Deploys no GitHub e Vercel

Sempre que fizer alterações no seu código, siga os 4 passos no terminal:

```bash
# 1. Verifique as alterações locais
git status

# 2. Adicione todos os arquivos modificados
git add .

# 3. Crie o commit com uma mensagem descritiva
git commit -m "feat: mutar video youtube e sincronizar voz pt-br na dublagem"

# 4. Envie para o GitHub (o deploy na Vercel ocorre automaticamente em segundos!)
git push origin main
```

- **Repositório GitHub**: `https://github.com/janaam/youtube-videostudy-ai`
- **Aplicação Online na Vercel**: `https://youtube-videostudy-ai-three.vercel.app/`

---

*Documento mantido e sincronizado no projeto VideoStudy AI.*
