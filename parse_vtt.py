import re
import json

vtt_file = "Claude Code - Full Tutorial for Beginners [ntDIxaeo3Wg].en-CA.vtt"

def parse_vtt(filepath):
    with open(filepath, "r", encoding="utf-8") as f:
        lines = f.readlines()

    cues = []
    current_time = None
    current_text = []

    time_pattern = re.compile(r"(\d{2}:\d{2}:\d{2}\.\d{3})\s+-->\s+(\d{2}:\d{2}:\d{2}\.\d{3})")

    for line in lines:
        line_str = line.strip()
        if not line_str:
            if current_time and current_text:
                text_clean = " ".join(current_text).strip()
                if text_clean:
                    start_str, end_str = current_time
                    # Formatar mm:ss
                    h, m, s = start_str.split(":")
                    s_sec = float(s)
                    total_sec = int(h) * 3600 + int(m) * 60 + int(s_sec)
                    mins = total_sec // 60
                    secs = total_sec % 60
                    timestamp = f"{mins:02d}:{secs:02d}"
                    cues.append({
                        "start_raw": start_str,
                        "end_raw": end_str,
                        "start_seconds": total_sec,
                        "timestamp": timestamp,
                        "text": text_clean
                    })
                current_time = None
                current_text = []
            continue

        match = time_pattern.search(line_str)
        if match:
            if current_time and current_text:
                text_clean = " ".join(current_text).strip()
                if text_clean:
                    start_str, end_str = current_time
                    h, m, s = start_str.split(":")
                    s_sec = float(s)
                    total_sec = int(h) * 3600 + int(m) * 60 + int(s_sec)
                    mins = total_sec // 60
                    secs = total_sec % 60
                    timestamp = f"{mins:02d}:{secs:02d}"
                    cues.append({
                        "start_raw": start_str,
                        "end_raw": end_str,
                        "start_seconds": total_sec,
                        "timestamp": timestamp,
                        "text": text_clean
                    })
                current_text = []
            current_time = (match.group(1), match.group(2))
        elif current_time:
            # Ignorar identificadores numéricos ou cabeçalhos
            if not line_str.startswith("WEBVTT") and not line_str.startswith("Kind:") and not line_str.startswith("Language:"):
                # Remover tags HTML caso existam tipo <c> </c>
                clean_line = re.sub(r"<[^>]+>", "", line_str)
                current_text.append(clean_line)

    if current_time and current_text:
        text_clean = " ".join(current_text).strip()
        if text_clean:
            start_str, end_str = current_time
            h, m, s = start_str.split(":")
            s_sec = float(s)
            total_sec = int(h) * 3600 + int(m) * 60 + int(s_sec)
            mins = total_sec // 60
            secs = total_sec % 60
            timestamp = f"{mins:02d}:{secs:02d}"
            cues.append({
                "start_raw": start_str,
                "end_raw": end_str,
                "start_seconds": total_sec,
                "timestamp": timestamp,
                "text": text_clean
            })

    return cues

cues = parse_vtt(vtt_file)
print(f"Total de segmentos extraídos: {len(cues)}")

# Salvar em JSON
with open("transcricao.json", "w", encoding="utf-8") as f:
    json.dump(cues, f, ensure_ascii=False, indent=2)

# Salvar com timestamps
with open("transcricao_com_timestamps.txt", "w", encoding="utf-8") as f:
    for c in cues:
        f.write(f"[{c['timestamp']}] {c['text']}\n")

# Salvar texto corrido (agrupando frases/parágrafos)
paragraphs = []
current_para = []
for i, c in enumerate(cues):
    current_para.append(c['text'])
    if c['text'].endswith(('.', '!', '?')) and len(" ".join(current_para)) > 200:
        paragraphs.append(" ".join(current_para))
        current_para = []

if current_para:
    paragraphs.append(" ".join(current_para))

with open("transcricao_completa.txt", "w", encoding="utf-8") as f:
    f.write("\n\n".join(paragraphs))

print("Arquivos gerados com sucesso:")
print(f"- transcricao.json")
print(f"- transcricao_com_timestamps.txt")
print(f"- transcricao_completa.txt ({len(paragraphs)} parágrafos)")
