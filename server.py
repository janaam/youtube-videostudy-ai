import json
import os
import sys
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from generator import extract_video_id, fetch_and_process_transcript, get_video_metadata

app = FastAPI(title="VideoStudy AI API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class VideoRequest(BaseModel):
    url: str

@app.post("/api/process-video")
def process_video_endpoint(req: VideoRequest):
    video_id = extract_video_id(req.url)
    if not video_id:
        raise HTTPException(status_code=400, detail="URL ou ID do YouTube inválido.")
    
    try:
        data = fetch_and_process_transcript(video_id)
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/default-video")
def default_video_endpoint():
    try:
        return fetch_and_process_transcript("ntDIxaeo3Wg")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/tts")
async def tts_endpoint(text: str, voice: str = "pt-BR-FranciscaNeural"):
    """Gera áudio neural de altíssima qualidade (Moça Francisca e Moço Antonio do NotebookLM)."""
    if not text or not text.strip():
        raise HTTPException(status_code=400, detail="Texto não informado.")
    try:
        import edge_tts
        from fastapi.responses import StreamingResponse
        communicate = edge_tts.Communicate(text.strip(), voice)
        async def audio_stream():
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    yield chunk["data"]
        return StreamingResponse(audio_stream(), media_type="audio/mpeg")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao sintetizar áudio: {str(e)}")

# Servir arquivos estáticos do frontend
app.mount("/", StaticFiles(directory=".", html=True), name="static")

if __name__ == "__main__":
    if sys.stdout.encoding != 'utf-8':
        try:
            sys.stdout.reconfigure(encoding='utf-8')
        except Exception:
            pass
    print("\n" + "="*60)
    print("VideoStudy AI Server Iniciado!")
    print("Acesse no navegador: http://localhost:8000")
    print("="*60 + "\n")
    uvicorn.run(app, host="0.0.0.0", port=8000)
