import json
import time
import truststore

truststore.inject_into_ssl()

from deep_translator import GoogleTranslator

# Carregar transcricao_completa.txt
with open("transcricao_completa.txt", "r", encoding="utf-8") as f:
    full_content = f.read()

paragraphs = [p.strip() for p in full_content.split("\n\n") if p.strip()]
print(f"Total de parágrafos: {len(paragraphs)}")

# Agrupar parágrafos em blocos de no máximo 2500 caracteres
chunks = []
current_chunk = []
current_len = 0

for p in paragraphs:
    if current_len + len(p) + 20 > 2500 and current_chunk:
        chunks.append(current_chunk)
        current_chunk = [p]
        current_len = len(p)
    else:
        current_chunk.append(p)
        current_len += len(p) + 20

if current_chunk:
    chunks.append(current_chunk)

print(f"Agrupado em {len(chunks)} blocos de tradução.")

translator = GoogleTranslator(source='en', target='pt')
translated_paragraphs = []
SEPARATOR = "\n\n<<<BLOCO_DIVISOR>>>\n\n"

for i, chunk in enumerate(chunks):
    chunk_text = SEPARATOR.join(chunk)
    print(f"Traduzindo bloco {i+1}/{len(chunks)} ({len(chunk_text)} caracteres)...")
    success = False
    for attempt in range(3):
        try:
            res = translator.translate(chunk_text)
            # Dividir de volta pelos blocos
            parts = res.split("<<<BLOCO_DIVISOR>>>")
            # Limpar espaços e tags
            parts_clean = [pt.strip().replace("<<<", "").replace(">>>", "").strip() for pt in parts]
            
            if len(parts_clean) == len(chunk):
                translated_paragraphs.extend(parts_clean)
            else:
                print(f"Aviso no bloco {i+1}: esperava {len(chunk)} partes, obteve {len(parts_clean)}. Salvando como bloco.")
                translated_paragraphs.append(res.replace("<<<BLOCO_DIVISOR>>>", "\n\n"))
            success = True
            break
        except Exception as e:
            print(f"Tentativa {attempt+1} falhou no bloco {i+1}: {e}")
            time.sleep(1.5)
            
    if not success:
        print(f"Falha ao traduzir bloco {i+1}. Mantendo original.")
        translated_paragraphs.extend(chunk)
    time.sleep(0.8)

# Salvar texto corrido traduzido
with open("transcricao_pt_completa.txt", "w", encoding="utf-8") as f:
    f.write("\n\n".join(translated_paragraphs))

print(f"\nSucesso! Arquivo 'transcricao_pt_completa.txt' salvo com {len(translated_paragraphs)} parágrafos em Português.")
