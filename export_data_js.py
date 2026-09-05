import json
import os

bilingual_file = "transcricao_bilingue.json"
mono_file = "transcricao.json"
output_file = "data.js"

if os.path.exists(bilingual_file):
    with open(bilingual_file, "r", encoding="utf-8") as f:
        data = json.load(f)
    print(f"Exportando {len(data)} itens bilíngues para {output_file}...")
else:
    with open(mono_file, "r", encoding="utf-8") as f:
        raw_data = json.load(f)
    data = [
        {
            "timestamp": item["timestamp"],
            "start_seconds": item["start_seconds"],
            "text_en": item["text"],
            "text_pt": item["text"]
        }
        for item in raw_data
    ]
    print(f"Exportando {len(data)} itens originais para {output_file}...")

with open(output_file, "w", encoding="utf-8") as f:
    f.write("// Transcrição estruturada gerada automaticamente\n")
    f.write("window.TRANSCRIPT_DATA = ")
    json.dump(data, f, ensure_ascii=False, indent=2)
    f.write(";\n")

print(f"Arquivo {output_file} criado com sucesso!")
