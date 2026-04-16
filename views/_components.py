"""
Componenti UI riutilizzabili condivisi tra le view.
"""
import streamlit as st
from logic import trova_slot_liberi

# ── Emoji e colori per flag allenamento ───────────────────────────────────────
FLAG_EMOJIS = {
    "normale":       "",
    "importante":    "⭐",
    "annullato":     "❌",
    "da_confermare": "⚠️",
}

# ── Colori bordo per tipo palestra ────────────────────────────────────────────
PALESTRA_TIPO_COLORS = {
    "Principale": "#4CAF50",   # verde
    "Secondaria": "#FF9800",   # arancione
    "Esterna":    "#9E9E9E",   # grigio
}


def get_palestra_tipo_color(tipo: str) -> str:
    """Ritorna il colore del bordo per il tipo di palestra."""
    return PALESTRA_TIPO_COLORS.get(str(tipo), "#4CAF50")


# ── Palette colori per squadra ────────────────────────────────────────────────
_TEAM_PALETTE = [
    "#1565C0",  # blue
    "#2E7D32",  # green
    "#6A1B9A",  # deep purple
    "#C62828",  # dark red
    "#E65100",  # deep orange
    "#00695C",  # teal
    "#4527A0",  # indigo
    "#AD1457",  # pink
    "#0277BD",  # light blue
    "#558B2F",  # olive green
]


def get_team_color(team: str) -> str:
    """Restituisce un colore esadecimale stabile e unico per il nome squadra."""
    idx = sum(ord(c) for c in str(team)) % len(_TEAM_PALETTE)
    return _TEAM_PALETTE[idx]


def render_sposta_allenamenti(conflitti, durata_totale, orario_fisso,
                               df_squadre, df_allenatori, df_palestre,
                               key_prefix=""):
    """
    Per ogni conflitto mostra un selectbox con gli slot alternativi liberi.

    Returns
    -------
    ha_bloccanti : bool
        True se almeno un conflitto è una partita già esistente (non spostabile).
    scelte : dict
        {nome_squadra: (scelta_str, slot_list, opzioni_list)}
    """
    scelte = {}
    ha_bloccanti = False

    for conflitto in conflitti:
        nome = conflitto["squadra"]
        tipo = conflitto.get("tipo", "Allenamento fisso")
        with st.container(border=True):
            if tipo == "Partita in Casa":
                st.error(
                    f"🔴 **{nome}** — {conflitto['ora_inizio']}–{conflitto['ora_fine']}  \n"
                    "❌ C'è già una partita. Scegli una data diversa."
                )
                ha_bloccanti = True
            else:
                st.markdown(
                    f"🟡 **{nome}** — {conflitto['ora_inizio']}–{conflitto['ora_fine']}"
                    + (f" &nbsp;·&nbsp; *{tipo}*" if tipo else "")
                )
                slot = trova_slot_liberi(
                    nome, durata_totale, orario_fisso, df_squadre, df_allenatori, df_palestre
                )
                if not slot:
                    st.warning(f"Nessuno slot alternativo trovato per {nome}.")
                    scelte[nome] = ("__nessuno__", [], [])
                else:
                    opzioni = ["— Seleziona slot —"] + [
                        f"{s['giorno'].capitalize()} {s['ora_inizio']}-{s['ora_fine']}"
                        f" @ {s['palestra']} — {s['allenatori']}"
                        for s in slot[:5]
                    ]
                    scelta = st.selectbox(
                        f"Nuovo slot per **{nome}**:",
                        opzioni,
                        key=f"{key_prefix}scelta_{nome}",
                    )
                    scelte[nome] = (scelta, slot[:5], opzioni)

    return ha_bloccanti, scelte


def build_spostamento_dicts(data_partita, scelte):
    """
    Come build_spostamento_rows ma ritorna list[dict] per scrivi_eventi_batch.

    Parameters
    ----------
    data_partita : str   es. "2026-04-12"
    scelte       : dict  output di render_sposta_allenamenti

    Returns
    -------
    list[dict]  — dicts pronti per scrivi_eventi_batch("calendario", ...)
    """
    rows = []
    for nome, (scelta, slot_list, opzioni) in scelte.items():
        if scelta in ("__nessuno__", "— Seleziona slot —"):
            continue
        try:
            i = opzioni.index(scelta) - 1
        except ValueError:
            continue
        if 0 <= i < len(slot_list):
            s = slot_list[i]
            rows.append({
                "data":       data_partita,
                "giorno":     s["giorno"],
                "squadra":    nome,
                "tipo":       "Allenamento spostato",
                "avversario": "",
                "ora_inizio": s["ora_inizio"],
                "ora_fine":   s["ora_fine"],
                "casa_fuori": "Casa",
                "palestra":   s["palestra"],
            })
    return rows


def build_spostamento_rows(data_partita, scelte):
    """
    Costruisce le righe da appendere al foglio per ogni allenamento spostato.

    Parameters
    ----------
    data_partita : str   es. "2026-04-12"
    scelte       : dict  output di render_sposta_allenamenti

    Returns
    -------
    list[list]  — righe pronte per scrivi_righe_batch
    """
    rows = []
    for nome, (scelta, slot_list, opzioni) in scelte.items():
        if scelta in ("__nessuno__", "— Seleziona slot —"):
            continue
        try:
            i = opzioni.index(scelta) - 1
        except ValueError:
            continue
        if 0 <= i < len(slot_list):
            s = slot_list[i]
            rows.append([
                data_partita, s["giorno"], nome, "Allenamento spostato",
                "", s["ora_inizio"], s["ora_fine"], "Casa", s["palestra"],
            ])
    return rows
