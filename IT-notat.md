# Musikkvideouka – underlag for utrulling

Dette er et generelt underlag til den som administrerer maskinene, for å godkjenne og
rulle ut appen i et miljø med kjørekontroll (WDAC / AppLocker).

## Hva appen er

Musikkvideouka er en poengtavle og publikumsvisning til bruk på arrangement.
Kontrollpanelet kjører på operatørens skjerm, og en publikumsvisning vises på storskjerm/projektor.
Appen er bygget som en Electron-app.

## Sikkerhetsprofil

- **Ingen nettverkstrafikk.** Appen kobler seg ikke til internett, laster ingen ressurser fra nett
  og starter ingen lokal nettverkstjeneste i skrivebordsutgaven.
- **Ingen automatisk oppdatering.**
- **Ingen registerendringer** utover det NSIS-installeren selv gjør (avinstallasjonsoppføring,
  filtilknytning for `.mvuka`).
- **Ingen kjøring av eksterne kommandoer/skript.**
- Electron-vinduene kjører med `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`,
  blokkert navigasjon og avslag på alle tilgangsforespørsler (kamera, mikrofon osv.).
- Leser og skriver kun lokale prosjektfiler (`.mvuka`), bildefiler brukeren selv velger, og
  valgfri Excel-import (`.xlsx`).

## Komponenter

- Electron 45.x (kjøremotor)
- `sharp` (bildebehandling, inneholder `libvips`-DLL-er)
- `read-excel-file` (Excel-import)

## Forhold til kjørekontroll (WDAC / AppLocker)

Appens medfølgende filer (`electron.exe`, `ffmpeg.dll`, `libvips-*.dll`, `sharp-win32-*.node`)
er usignerte så lenge det ikke er konfigurert et signeringssertifikat, og oppfyller da ikke
kravet til utgiversignatur. Står policyen i revisjonsmodus, kjører appen og avviket logges bare;
settes den til håndheving, stopper usignert kode.

## Mulige måter å klarere appen på

1. **Publisher-regel på signatur.** Appen signeres med et code signing-sertifikat, og det legges
   inn en regel på utgiveren. Dekker også fremtidige versjoner. (Gi gjerne beskjed om det finnes
   krav til utsteder/sertifikattype, eller et sertifikat som skal brukes.)
2. **Filhash- eller managed-installer-regel.** Det gjeldende bygget klareres på hash, eller sentral
   utrulling regnes som klarert installasjon. Krever ikke sertifikat, men hash-regelen må oppdateres
   ved hver nye versjon.

## Pakketekniske detaljer

- Installer: NSIS, **per-maskin** (installerer til `Program Files` for alle brukere).
- Stille installasjon: `"Musikkvideouka Setup <versjon>.exe" /S`
- Stille avinstallasjon: `"%ProgramFiles%\Musikkvideouka\Uninstall Musikkvideouka.exe" /S`
- Bygges med `npm run dist:installer`.
