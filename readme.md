
## Musikkvideouka – Poengsystem

Et brukervennlig poeng- og visningssystem for Musikkvideouka. Systemet gjør det enkelt å holde oversikt over grupper/artister, poeng og bilder – med live oppdatering mellom admin og publikum. Alt styres via en Excel-fil og et enkelt webgrensesnitt.

**Hovedfunksjoner:**
- Live poengvisning for publikum
- Adminpanel for poeng, bilder og grupper
- Excel-import/eksport (XLSX)
- Støtte for bilder (PNG/JPG/GIF) fra `public/bilder`
- Negativ poengsum støttes (skriv f.eks. `-7` for å trekke fra poeng)

## Kom i gang

### 1. Last ned prosjektet
Last ned eller klon denne mappen til din datamaskin.

### 2. Start systemet (anbefalt)
- **Windows:** Dobbeltklikk på `WINDOWS-start-alt.bat`
- **Mac:** Dobbeltklikk på `MacOS-start-alt.command`
  - Første gang på Mac må du gi filen kjøre-tillatelse:
    ```
    chmod +x MacOS-start-alt.command
    ```
- Følg instruksjonene i `START-HER.html` for videre oppsett og bruk.

### 3. Åpne veiledningen
Åpne `START-HER.html` i nettleseren for oppdatert brukerveiledning, tips og feilsøking.

## Funksjoner
- **Adminpanel:** Legg inn, rediger og oppdater grupper, poeng og bilder. Støtter både positive og negative poengsummer (f.eks. `-7` for å trekke fra 7 poeng).
- **Publikumsside:** Viser poeng og bilder live på storskjerm. Oppdateres automatisk.
- **Excel-integrasjon:** Bruker en enkel `.xlsx`-fil for å holde orden på grupper og poeng. Importen filtrerer ut tomme rader automatisk.
- **Bildehåndtering:** Legg bilder i `public/bilder` og referer til dem i Excel-filen (f.eks. `/bilder/gruppe1.jpg`).
- **Backup:** Last ned oppdatert Excel-fil fra adminpanelet når som helst.
- **Automatisk synkronisering:** Endringer i admin vises umiddelbart for publikum.

## Krav
- **Node.js** må være installert ([last ned her](https://nodejs.org)).
  - Du kan sjekke om Node.js er installert med `node -v` i terminalen.
- Ingen internett-tilkobling kreves etter installasjon.


## Manuell oppstart (avansert)
Hvis du ønsker å starte systemet manuelt:
```sh
npm install
node server.js
```
Åpne deretter [http://localhost:3000](http://localhost:3000) (publikum) og [http://localhost:3000/admin](http://localhost:3000/admin) (admin) i nettleseren.

## Excel-mal og import
- Bruk medfølgende `Musikkvideouka.xlsx` som utgangspunkt.
- Kolonner: **Navn**, **Bilde** (sti, f.eks. `/bilder/gruppe1.jpg`), **Poeng**.
- Tomme rader i Excel ignoreres automatisk ved import.
- Bilder må ligge i `public/bilder`-mappen for å vises.

## Negativ poengsum
Du kan trekke fra poeng ved å skrive et negativt tall i poengfeltet i adminpanelet (f.eks. `-5`). Trykk Enter eller Oppdater for å lagre.

## Feilsøking
- **Publikumssiden er tom?** Sjekk at Excel-filen er lastet opp i admin og trykk Oppdater.
- **Endringer vises ikke?** Trykk Oppdater på nytt etter endringer i poeng/bilder.
- **Backup:** Trykk Last ned i admin for å lagre backup av Excel-filen.
- **Alt låser seg?** Steng terminalen og start på nytt.
- **Får du ikke startet serveren?** Sjekk at Node.js er installert og at du står i riktig mappe.
- **Mac:** Kjør `chmod +x MacOS-start-alt.command` hvis du får tilgangsfeil.

## Struktur
```
/musikkvideouka
├── START-HER.html         # Hovedveiledning
├── server.js              # Node.js-server
├── Musikkvideouka.xlsx    # Excel-mal
├── public/
│   ├── publikum.html      # Publikumsside
│   ├── publikum.js        # JS for publikum
│   ├── publikumstyle.css  # CSS for publikum
│   ├── admin.html         # Adminpanel
│   ├── admin.js           # JS for admin
│   └── adminstyle.css     # CSS for admin
├── WINDOWS-start-alt.bat   # Start alt på Windows
├── MacOS-start-alt.command # Start alt på Mac
├── package.json            # Avhengigheter
```

## Kom i gang

### 1. Last ned prosjektet
Last ned eller klon denne mappen til din datamaskin.

### 2. Start systemet (anbefalt)
- **Windows:** Dobbeltklikk på `WINDOWS-start-alt.bat`
- **Mac:** Dobbeltklikk på `MacOS-start-alt.command`
  - Første gang på Mac må du gi filen kjøre-tillatelse:
    ```
    chmod +x MacOS-start-alt.command
    ```
- Følg instruksjonene i `START-HER.html`.

### 3. Åpne veiledningen
Åpne `START-HER.html` i nettleseren for videre instruksjoner og lenker til admin- og publikumsside.

## Funksjoner
- **Adminpanel:** Legg inn, rediger og oppdater grupper, poeng og bilder.
- **Publikumsside:** Viser poeng og bilder live på storskjerm.
- **Excel-integrasjon:** Bruker en enkel `.xlsx`-fil for å holde orden på grupper og poeng.
- **Automatisk synkronisering:** Endringer i admin vises umiddelbart for publikum.

## Krav
- **Node.js** må være installert ([last ned her](https://nodejs.org)).
- Ingen internett-tilkobling kreves etter installasjon.


## Manuell oppstart (avansert)
Hvis du ønsker å starte systemet manuelt:
```sh
npm install
node server.js
```
Åpne deretter [http://localhost:3000](http://localhost:3000) (publikum) og [http://localhost:3000/admin](http://localhost:3000/admin) (admin) i nettleseren.

## Feilsøking
- Får du ikke startet filene på Mac? Kjør `chmod +x MacOS-start-alt.command` i Terminal.
- Får du advarsel på Windows? Høyreklikk på `.bat`-filen, velg "Egenskaper" og huk av for "Opphev blokkering".
- Publikumssiden er tom? Sørg for at Excel-filen er valgt i admin og at du har trykket "Oppdater".

## Struktur
```
├── START-HER.html         # Hovedveiledning
├── server.js              # Node.js-server
├── Musikkvideouka.xlsx    # Excel-mal
├── public/
│   ├── publikum.html      # Publikumsside
│   ├── admin.html         # Adminpanel
│   └── ...
├── WINDOWS-start-alt.bat  # Start alt på Windows
├── MacOS-start-alt.command# Start alt på Mac
├── package.json           # Avhengigheter
```

---
