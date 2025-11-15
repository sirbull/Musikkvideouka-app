# Musikkvideouka – Poengsystem

Dette er et brukervennlig poeng- og visningssystem for Musikkvideouka, laget for å være enkelt å sette opp for både lærere og elever.
Applikasjonen er inspirert av hvordan poenggivning blir gjort i større musikkonkurranser og viser ulike artister i en liste hvor artisten med mest poeng vises øverst.
Admin kan samtidig legge inn poengsummer i eget vindu, og publikums-siden oppdateres live.

Gruppenavn, bilde og poengsum hentes fra en XLSX-fil som kan forhåndsgenereres. Det ligger en fil klar i mappen som man kan bruke som utgangspunkt.
Når man åpner admin-delen, velger man XLSX-filen som skal åpnes og lastes inn. Deretter kan man, om ønskelig, legge til nye artister, navn og endre poengsummer.
Det er mulighet for å ta sikkerhetskopi av oppsettet nederst på admin-delen.

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
node start-helper.js
npm run dev
```

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
