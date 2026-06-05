# Report: Analisi Competitiva vs Golee e Strategia Go-To-Market
*Data: 27 maggio 2026*

---

## Cos'è Golee e cosa fa

Golee è una piattaforma italiana di gestione sportiva (principalmente calcio, ma si sta espandendo) con:
- App native iOS/Android (non solo web responsive)
- Gestione iscrizioni, pagamenti **online** (il genitore paga direttamente nell'app)
- Comunicazioni push native
- Documenti digitali con firma elettronica
- Integrazioni con FIGC/federazioni
- Supporto clienti dedicato, SLA, uptime garantito
- Anni di uso reale con migliaia di società, bug già scoperti e corretti

---

## Dove la nostra app è più debole — onestà brutale

### 1. Non è un'app, è un sito web mobile-friendly
Golee ha app su App Store e Play Store. I genitori si fidano di più di un'app che si scarica. Il nostro è un PWA/web app: funziona, ma psicologicamente è percepito come "meno serio" da chi non è tecnico. Questo è un **ostacolo commerciale reale**.

### 2. I pagamenti sono solo tracciati, non riscossi
Golee permette ai genitori di pagare le quote direttamente nell'app con carta/bonifico. Noi tracciamo se qualcuno ha pagato ma il pagamento avviene fuori. Per una segreteria, questo è **metà del lavoro**. Manca Stripe o simile.

### 3. Siamo una persona sola
Se lo sviluppatore si ammala, va in vacanza, o ha altri impegni, l'app è ferma. Nessun club pagante accetterà questo rischio. Golee ha un team. Questo è probabilmente il **limite più grande per la commercializzazione**.

### 4. Nessuna conformità legale documentata
- Nessuna Privacy Policy formale (GDPR in Italia è obbligatorio)
- Nessun DPA (Data Processing Agreement) tra sviluppatore e società clienti
- I dati di **minori** (giocatori under 18) richiedono consensi specifici
- Nessuna certificazione ISO o SOC2

Se una società chiede "dove sono i nostri dati, chi li gestisce, cosa succede se li vuoi cancellare?", oggi non c'è una risposta formale. **Per vendere a terzi questo è bloccante.**

### 5. Nessun onboarding autonomo
Oggi per aggiungere una società serve intervento manuale del super_admin. Non esiste un flusso di registrazione self-service per una nuova società. Non si può scalare.

### 6. Nessun test automatico, nessuna CI/CD
Ogni nuova feature può rompere qualcosa. Con più società, un bug può colpire tutti contemporaneamente.

### 7. Backup e disaster recovery
Supabase free tier: nessun backup automatico. Un problema al DB può far perdere tutti i dati di tutte le società. Questo è **inaccettabile per uso commerciale**.

---

## Dove potremmo avere vantaggio

### 1. Niche basketball in Italia
Golee è nato per il calcio. Il basket ha esigenze diverse: FIP (non FIGC), referto gara diverso, struttura campionati diversa. Abbiamo già l'import FIP. Questo è un vantaggio **reale e concreto** che Golee probabilmente ignora.

### 2. Prezzo
Golee costa indicativamente €50-150/mese per società. Potremmo offrire €20-40/mese. Per piccole ASD con budget ristretto, il prezzo conta.

### 3. Flessibilità e velocità
Se una società chiede una feature, può essere aggiunta in una settimana. Golee ha roadmap rigide con centinaia di clienti.

### 4. Rapporto diretto
Nessuna ticketing, nessun call center. La segreteria chiama e si risolve. Per piccoli club questo vale molto.

---

## Possiamo fargli competizione?

**Risposta onesta: no, a breve termine, non sul mercato generale.**

Ma possiamo occupare una nicchia: **piccole ASD di basket in Italia**, dove Golee è mal posizionato. Quella nicchia esiste ed è reale.

Quante ASD di basket ci sono in Italia? Probabilmente 2.000-4.000 attive. Se ne serviamo 50 a €30/mese → **€1.500/mese passivi**. Non è reddito principale ma è un business sostenibile per una persona sola.

---

## Piano realistico — prossimi passi

### Fase 0 — Ora (stagione finita, 3-4 mesi)
Priorità assolute prima di aprire a terzi:

1. **Passa Supabase Pro** (€25/mese) → backup automatici, non si possono perdere i dati
2. **Scrivi una Privacy Policy minima** (iubenda.com, €29/anno) e mettila nel footer
3. **Aggiungi il flusso di registrazione self-service** per nuove società
4. **Reminder automatici** per rate scadute — anche solo email automatica, senza Stripe

### Fase 1 — Prossima stagione (nostra società)
- Usare l'app intensamente per la nostra ASD, **gratis**
- Tenere un documento con tutti i bug e le richieste che emergono dall'uso reale
- Scopriremo cose che non immaginiamo (la segreteria fa cose in modi non previsti)
- **Non è ancora pronta per essere venduta** — questa stagione serve a questo

### Fase 2 — Fine stagione (tra 10-12 mesi)
- Se l'app ha retto un'intera stagione con dati reali: avvicinare 2-3 ASD di basket della zona
- **Offrirgliele gratis per un anno** in cambio di feedback dettagliato
- Non vendere ancora: serve social proof ("usiamo questa app da un anno senza problemi")

### Fase 3 — Anno successivo
- Con 3-4 società che la usano attivamente, c'è base per vendere
- Prezzo: €25-40/mese per società piccola, €50-80 per grandi
- Marketing: gruppo Facebook ASD basket italiane, contatti allenatori FIP, word of mouth

---

## Cosa manca prima di poter vendere — lista tecnica

| Feature | Priorità | Difficoltà |
|---------|----------|------------|
| Registrazione self-service nuova società | 🔴 Bloccante | Media |
| Backup Supabase Pro | 🔴 Bloccante | Bassa (€25/mese) |
| Privacy Policy + GDPR base | 🔴 Bloccante | Bassa |
| Reminder email automatici rate scadute | 🟡 Alta | Media |
| Pagamento quote online (Stripe) | 🟡 Alta | Alta |
| Documentazione utente (guide per ogni ruolo) | 🟡 Alta | Media |
| Native app (anche solo wrapper) | 🟠 Media | Alta |
| Test automatici | 🟠 Media | Alta |

---

## Conclusione

**Usa la tua società quest'anno. Non vendere ancora.**

Non perché l'app sia brutta — anzi, per quanto costruita, è già buona. Ma perché venderla ora significa assumersi responsabilità (dati, GDPR, uptime) che oggi non si possono garantire. Un solo problema su un club che paga può danneggiare la reputazione in un settore dove tutti si conoscono.

**Obiettivo realistico**: tra 18 mesi avere 3-5 ASD di basket italiane che pagano €30/mese. Non è diventare ricchi, ma è un side-business sostenibile in una nicchia dove Golee è debole.
