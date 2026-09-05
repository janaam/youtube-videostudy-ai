import re

vtt_path = "Claude Code - Full Tutorial for Beginners [ntDIxaeo3Wg].en-CA.vtt"
srt_path = "transcricao.srt"

with open(vtt_path, "r", encoding="utf-8") as f:
    lines = f.readlines()

srt_entries = []
index = 1
time_pattern = re.compile(r"(\d{2}:\d{2}:\d{2})\.(\d{3})\s+-->\s+(\d{2}:\d{2}:\d{2})\.(\d{3})")

current_times = None
current_text = []

for line in lines:
    line_clean = line.strip()
    if not line_clean:
        if current_times and current_text:
            text_str = "\n".join(current_text)
            srt_entries.append(f"{index}\n{current_times}\n{text_str}\n")
            index += 1
            current_times = None
            current_text = []
        continue
    
    match = time_pattern.search(line_clean)
    if match:
        if current_times and current_text:
            text_str = "\n".join(current_text)
            srt_entries.append(f"{index}\n{current_times}\n{text_str}\n")
            index += 1
            current_text = []
        # No SRT, milissegundos usam vírgula: 00:00:00,083 --> 00:00:02,300
        current_times = f"{match.group(1)},{match.group(2)} --> {match.group(3)},{match.group(4)}"
    elif current_times:
        if not line_clean.startswith("WEBVTT") and not line_clean.startswith("Kind:") and not line_clean.startswith("Language:"):
            clean_text = re.sub(r"<[^>]+>", "", line_clean)
            if clean_text:
                current_text.append(clean_text)

if current_times and current_text:
    text_str = "\n".join(current_text)
    srt_entries.append(f"{index}\n{current_times}\n{text_str}\n")

with open(srt_path, "w", encoding="utf-8") as f:
    f.write("\n".join(srt_entries))

print(f"Salvo arquivo {srt_path} com {len(srt_entries)} legendas SRT.")
