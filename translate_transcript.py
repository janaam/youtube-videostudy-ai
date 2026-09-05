import json
import time
import truststore

truststore.inject_into_ssl()

from deep_translator import GoogleTranslator

with open("transcricao.json", "r", encoding="utf-8") as f:
    cues = json.load(f)

print(f"Carregados {len(cues)} cues.")

translator = GoogleTranslator(source='en', target='pt')

# Vamos traduzir em lotes de 25 frases para ser rápido e eficiente
batch_size = 25
texts_en = [c['text'] for c in cues]
translated_texts = []

for i in range(0, len(texts_en), batch_size):
    batch = texts_en[i:i + batch_size]
    print(f"Traduzindo {i+1} a {min(i + batch_size, len(texts_en))} de {len(texts_en)}...")
    try:
        translated_batch = translator.translate_batch(batch)
        translated_texts.extend(translated_batch)
    except Exception as e:
        print(f"Erro no lote {i}: {e}. Tentando um por um...")
        for item in batch:
            try:
                t = translator.translate(item)
                translated_texts.append(t)
            except Exception as item_err:
                print(f"Falha ao traduzir item: {item_err}")
                translated_texts.append(item)
            time.sleep(0.1)
    time.sleep(0.2)

# Unir aos dados
bilingual = []
for i, c in enumerate(cues):
    pt_text = translated_texts[i] if i < len(translated_texts) else ""
    bilingual.append({
        "timestamp": c["timestamp"],
        "start_seconds": c["start_seconds"],
        "text_en": c["text"],
        "text_pt": pt_text
    })

with open("transcricao_bilingue.json", "w", encoding="utf-8") as f:
    json.dump(bilingual, f, ensure_ascii=False, indent=2)

with open("transcricao_pt_com_tempo.txt", "w", encoding="utf-8") as f:
    for item in bilingual:
        f.write(f"[{item['timestamp']}] {item['text_pt']}\n")

# Gerar texto corrido em português
paragraphs_pt = []
curr_para = []
for item in bilingual:
    curr_para.append(item["text_pt"])
    if item["text_pt"].endswith(('.', '!', '?')) and len(" ".join(curr_para)) > 200:
        paragraphs_pt.append(" ".join(curr_para))
        curr_para = []
if curr_para:
    paragraphs_pt.append(" ".join(curr_para))

with open("transcricao_pt_completa.txt", "w", encoding="utf-8") as f:
    f.write("\n\n".join(paragraphs_pt))

print("Tradução finalizada e arquivos salvos:")
print("- transcricao_bilingue.json")
print("- transcricao_pt_com_tempo.txt")
print("- transcricao_pt_completa.txt")
