import json
import os
import sys
import truststore

truststore.inject_into_ssl()

from youtube_transcript_api import YouTubeTranscriptApi

video_id = "ntDIxaeo3Wg"

def format_timestamp(seconds: float) -> str:
    total_seconds = int(seconds)
    hours = total_seconds // 3600
    minutes = (total_seconds % 3600) // 60
    secs = total_seconds % 60
    if hours > 0:
        return f"[{hours:02d}:{minutes:02d}:{secs:02d}]"
    return f"[{minutes:02d}:{secs:02d}]"

try:
    print(f"Obtendo transcrições para o vídeo {video_id}...")
    ytt = YouTubeTranscriptApi()
    transcript_list = ytt.list(video_id)
    
    # 1. Obter a transcrição original em inglês
    en_transcript_obj = transcript_list.find_transcript(['en-CA', 'en'])
    print(f"Baixando transcrição original: {en_transcript_obj.language} ({en_transcript_obj.language_code})")
    en_snippets = en_transcript_obj.fetch()
    
    # Converter para lista de dicionários
    en_data = [
        {"text": s.text.replace("\n", " ").strip(), "start": s.start, "duration": s.duration}
        for s in en_snippets
    ]

    # 2. Obter a tradução para Português (pt)
    print("Baixando versão traduzida para Português...")
    pt_transcript_obj = en_transcript_obj.translate('pt')
    pt_snippets = pt_transcript_obj.fetch()
    pt_data = [
        {"text": s.text.replace("\n", " ").strip(), "start": s.start, "duration": s.duration}
        for s in pt_snippets
    ]

    # 3. Salvar arquivos em Inglês
    with open("transcricao_en.txt", "w", encoding="utf-8") as f:
        f.write(" ".join([item["text"] for item in en_data]))
        
    with open("transcricao_en_com_tempo.txt", "w", encoding="utf-8") as f:
        for item in en_data:
            f.write(f"{format_timestamp(item['start'])} {item['text']}\n")

    # 4. Salvar arquivos em Português
    with open("transcricao_pt.txt", "w", encoding="utf-8") as f:
        f.write(" ".join([item["text"] for item in pt_data]))

    with open("transcricao_pt_com_tempo.txt", "w", encoding="utf-8") as f:
        for item in pt_data:
            f.write(f"{format_timestamp(item['start'])} {item['text']}\n")

    # 5. Salvar JSON completo com ambas as línguas combinadas por índice
    combined = []
    for i in range(len(en_data)):
        combined.append({
            "start": en_data[i]["start"],
            "duration": en_data[i]["duration"],
            "timestamp": format_timestamp(en_data[i]["start"]),
            "text_en": en_data[i]["text"],
            "text_pt": pt_data[i]["text"] if i < len(pt_data) else ""
        })

    with open("transcricao_completa.json", "w", encoding="utf-8") as f:
        json.dump(combined, f, ensure_ascii=False, indent=2)

    print("\nArquivos gerados com sucesso:")
    print("- transcricao_en.txt (Inglês original em texto contínuo)")
    print("- transcricao_en_com_tempo.txt (Inglês com marcações de tempo)")
    print("- transcricao_pt.txt (Português em texto contínuo)")
    print("- transcricao_pt_com_tempo.txt (Português com marcações de tempo)")
    print("- transcricao_completa.json (Dados completos sincronizados)")

except Exception as e:
    print(f"Erro ao processar transcrição: {e}")
    sys.exit(1)
