"""
FastAPI minima — scheduling + parsing PDF FIP.
Avvia con: uvicorn api:app --reload --port 8000
"""

from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware

from logic import genera_orario_settimanale, estrai_partite_da_pdf

app = FastAPI(title="Oderzo Basket API", version="1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/scheduling")
async def scheduling(vincoli: dict):
    """Genera orario settimanale ottimale dalla logica CP in logic.py."""
    try:
        result = genera_orario_settimanale(vincoli)
        return {"success": True, **result}
    except Exception as e:
        return {"success": False, "error": str(e), "assegnazioni": [], "avvisi": []}


@app.post("/api/fip/estrai")
async def estrai_fip(
    pdf: UploadFile = File(...),
    societa: str = Form(default="Oderzo"),
):
    """Estrae partite da un PDF FIP (formato A o B)."""
    try:
        pdf_bytes = await pdf.read()
        partite, errore, doa_estratte = estrai_partite_da_pdf(pdf_bytes, societa)
        return {
            "success": errore is None,
            "partite": partite,
            "errore": errore,
            "doa_estratte": doa_estratte,
        }
    except Exception as e:
        return {"success": False, "partite": [], "errore": str(e), "doa_estratte": []}
