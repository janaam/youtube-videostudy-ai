import json
import re

# Carregar cues originais
with open("transcricao.json", "r", encoding="utf-8") as f:
    cues = json.load(f)

# Carregar paragrafos traduzidos
with open("transcricao_pt_completa.txt", "r", encoding="utf-8") as f:
    translated_paras = [p.strip() for p in f.read().split("\n\n") if p.strip()]

# Reconstruir exatamente quais índices de cues pertencem a qual parágrafo
para_cues_map = []
current_cue_indices = []
current_para_text = []

for i, c in enumerate(cues):
    current_cue_indices.append(i)
    current_para_text.append(c['text'])
    if c['text'].endswith(('.', '!', '?')) and len(" ".join(current_para_text)) > 200:
        para_cues_map.append(current_cue_indices)
        current_cue_indices = []
        current_para_text = []

if current_cue_indices:
    para_cues_map.append(current_cue_indices)

print(f"Mapeados {len(para_cues_map)} blocos de cues para {len(translated_paras)} parágrafos traduzidos.")

# Para cada parágrafo traduzido, distribuir o texto entre os cues correspondentes
# Se houver N cues no bloco, podemos dividir as frases do parágrafo traduzido proporcionalmente
bilingual_cues = []

for block_idx, cue_indices in enumerate(para_cues_map):
    pt_para = translated_paras[block_idx] if block_idx < len(translated_paras) else ""
    
    if len(cue_indices) == 1:
        idx = cue_indices[0]
        c = cues[idx]
        bilingual_cues.append({
            "timestamp": c["timestamp"],
            "start_seconds": c["start_seconds"],
            "text_en": c["text"],
            "text_pt": pt_para
        })
    else:
        # Dividir o texto do parágrafo em sentenças
        # Expressão regular para dividir por pontuação
        sentences = re.split(r'(?<=[.!?])\s+', pt_para)
        
        # Se temos mais cues do que sentenças ou vice-versa, distribuímos proporcionalmente ao comprimento do texto em inglês
        en_lens = [len(cues[idx]['text']) for idx in cue_indices]
        total_en_len = sum(en_lens) or 1
        
        words = pt_para.split()
        total_words = len(words)
        
        word_cursor = 0
        for sub_i, idx in enumerate(cue_indices):
            c = cues[idx]
            proportion = en_lens[sub_i] / total_en_len
            n_words = max(1, round(proportion * total_words))
            
            if sub_i == len(cue_indices) - 1:
                # Último cue pega o resto
                allocated_words = words[word_cursor:]
            else:
                allocated_words = words[word_cursor:word_cursor + n_words]
                word_cursor += n_words
                
            pt_chunk = " ".join(allocated_words) if allocated_words else pt_para
            bilingual_cues.append({
                "timestamp": c["timestamp"],
                "start_seconds": c["start_seconds"],
                "text_en": c["text"],
                "text_pt": pt_chunk
            })

# Salvar transcricao_bilingue.json
with open("transcricao_bilingue.json", "w", encoding="utf-8") as f:
    json.dump(bilingual_cues, f, ensure_ascii=False, indent=2)

# Salvar transcricao_pt_com_tempo.txt
with open("transcricao_pt_com_tempo.txt", "w", encoding="utf-8") as f:
    for item in bilingual_cues:
        f.write(f"[{item['timestamp']}] {item['text_pt']}\n")

# Atualizar data.js
with open("data.js", "w", encoding="utf-8") as f:
    f.write("// Transcrição sincronizada bilíngue (EN & PT-BR)\n")
    f.write("window.TRANSCRIPT_DATA = ")
    json.dump(bilingual_cues, f, ensure_ascii=False, indent=2)
    f.write(";\n")

print(f"Sucesso! Gerados {len(bilingual_cues)} cues bilíngues sincronizados:")
print("- transcricao_bilingue.json")
print("- transcricao_pt_com_tempo.txt")
print("- data.js atualizado com sucesso!")
