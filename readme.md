# Musikkvideouka

Et skrivebordsprogram med kontrollpanel på din skjerm og en egen publikumsvisning på storskjermen. Programmet fungerer lokalt uten nettforbindelse og uten at brukeren installerer Node.js, Python eller Excel.

## Start Electron lokalt fra terminalen

Appen startes fra kildekoden og åpnes i sitt eget Electron-vindu. Testmaskinen trenger Node.js og utviklingsavhengighetene. Den pakkede EXE-filen i `release/` brukes ikke.

Kjør fra prosjektmappen i PowerShell:

```powershell
npm.cmd install --include=dev
npm.cmd start
```

Installasjonskommandoen trengs første gang, eller hvis du tidligere installerte med `--omit=dev`. Etterpå holder det med `npm.cmd start` eller `npm.cmd run dev`. `npm.cmd` fungerer også når PowerShell nekter å kjøre `npm.ps1`. Ingen Python er nødvendig.

Velg publikumsskjerm i kontrollpanelet og klikk **Start publikumsvisning**. Publikum får et eget Electron-vindu. Prosjektfiler, bildekopier, automatisk lagring og angre/gjør om fungerer som i skrivebordsutgaven. Lukk kontrollpanelet for å avslutte programmet.

Electron bruker sin egen `electron.exe` som kjøremotor på Windows, også når appen startes fra terminalen. Dette er forskjellig fra å kjøre den pakkede appfilen. Hvis jobb-PC-en blokkerer selve Electron-kjøremotoren, må den tillates av IT før denne oppstartsmåten kan brukes.

## Valgfri nettlesertest

Nettlesermodusen er et eget alternativ:

```powershell
npm.cmd run start:browser
```

Åpne **http://127.0.0.1:3000** i Edge eller Chrome.

Klikk **Start publikumsvisning**, flytt det nye vinduet til den andre skjermen og velg **Fullskjerm** der. Du kan også åpne **http://127.0.0.1:3000/publikum** manuelt i et eget vindu. Nettleseren håndterer vinduer og fullskjerm; den automatiske skjermplasseringen fra skrivebordsappen gjelder ikke i denne testmodusen.

Arbeidskopier og sikkerhetskopier lagres automatisk i `.dev-data/` i prosjektmappen. Siste arbeidskopi åpnes ved omstart av serveren. **Åpne prosjekt** laster inn en egen arbeidskopi av en `.mvuka`-fil; originalfilen du velger, overskrives ikke. **Last ned prosjekt** gir en komplett fil med bilder, poeng og angrehistorikk som kan åpnes igjen eller flyttes. Nye prosjekter og importerte prosjektfiler får hver sin arbeidskopi. Mappen er utelatt fra Git.

Bildene velges og kopieres inn gjennom nettleseren. Excel-import virker, men bilder ved siden av Excel-arket må velges med bildeknappene etterpå. Nettleseren har ikke automatisk tilgang til disse filene.

La terminalen stå åpen mens du tester. Stopp med **Ctrl+C**. Hvis port 3000 er opptatt:

```powershell
npm.cmd run start:browser -- --port 3001
```

Testserveren er bare tilgjengelig fra denne maskinen. Det brukes ingen ekstern tjeneste.

## Bruke programmet

1. Start appen fra prosjektmappen med **npm.cmd start**. Pakkede EXE-filer brukes ikke under denne testingen.
2. Et nytt prosjekt har fem tomme grupper. Skriv gruppenavn, velg bilde med bildeikonet og skriv poengsummen i poengfeltet. **+** legger til flere grupper.
3. Prosjektnavnet kan redigeres øverst og brukes som den lille tittelen på publikumsskjermen. **File → Nytt prosjekt** ber om navn før prosjektet opprettes. **File → Lagre** lagrer en `.mvuka`-fil; deretter lagres endringer automatisk i denne filen.
4. Koble til projektoren, velg **Utvid** i maskinens skjerminnstillinger og velg publikumsskjermen i programmet. Nye skjermer dukker opp i listen så snart de kobles til, og en ekstern skjerm velges automatisk.
5. Klikk **Start publikumsvisning**. Med én skjerm åpnes et øvingsvindu; på en annen skjerm åpnes visningen i fullskjerm.
6. Skriv en poengsum eller et regnestykke i poengfeltet. **Enter**, Tab eller klikk utenfor feltet beregner og lagrer resultatet automatisk. Poengsummen vokser og blir gul først, holder seg stor og gul mens raden glir til sin nye plassering, og går deretter rolig tilbake til vanlig størrelse og farge.

Feltet **Endring** står til høyre for poengsummen og er tomt til du skriver noe. `5` eller `+5` legger til fem poeng, `-5` trekker fra fem, `*2` dobler summen og `/2` halverer den. Du kan også bruke parenteser og regnestykker: `2+3` legger til fem poeng. **Enter**, Tab eller klikk utenfor feltet beregner endringen én gang og tømmer feltet. Enter lar deg fortsette i samme felt. **↑** og **↓** lagrer feltet og går til samme kolonne i gruppen over eller under; innholdet er markert, så du kan skrive neste poengsum med en gang. **Escape** forkaster en uferdig endring.

Det opprinnelige feltet **Poeng** kan fortsatt redigeres direkte, og støtter **+**, **−**, **\***, **/** og parenteser med vanlig regnerekkefølge. Eksempler i dette feltet når poengsummen er 23:

| Det du skriver | Ny poengsum |
| -------------- | ----------- |
| `23-5`         | 18          |
| `+1`           | 24          |
| `-5`           | 18          |
| `30`           | 30          |
| `(23-5)*2`     | 36          |

Et regnestykke som starter med en operator, regnes fra gjeldende poengsum. Start med `=` for en absolutt verdi, for eksempel `=-5` for minus fem poeng. Ugyldige uttrykk markeres i feltet og endrer ikke poengene. **Escape** forkaster et uferdig uttrykk. Hver bekreftede beregning kan angres med Ctrl+Z. Gyldige uttrykk i begge feltene beregnes også før lagring, prosjektbytte eller avslutning; et ugyldig uttrykk må rettes eller forkastes først.

Poeng er heltall som standard. **File → Tillat desimalpoeng** tillater desimaltall, for eksempel `+0,5` eller `/2` når summen er oddetall. Både komma og punktum støttes. Resultater avrundes til maksimalt seks desimaler, og publikum ser norsk desimalkomma. Innstillingen følger prosjektet og angrehistorikken. Den kan slås av når alle poengsummer er heltall; eksisterende desimalpoeng rundes ikke automatisk bort.

Forhåndsvisningen er alltid synlig ved siden av gruppene. Dra den loddrette skillelinjen mellom listen og forhåndsvisningen for å endre bredden. Fordelingen huskes lokalt på maskinen. Dobbeltklikk linjen for å tilbakestille. Linjen kan også velges med Tab og flyttes med piltastene; Home/End går til minste/største listebredde. Grupperadene er kompakte, slik at flere lag er synlige samtidig.

Logoen fra `DESIGN/logo.svg` vises sammen med tittelen i publikumsvisningen, finalen og forhåndsvisningen. Skriv ønsket tekst, for eksempel «Musikkvideouka 2026», i prosjektnavnet øverst i kontrollpanelet. Logo og tekst sentreres som én enhet. Tittelen lagres automatisk i prosjektet og kan angres.

**Pause**, **Svart skjerm** og **Poengtavle** blir tilgjengelige når publikumsvisningen er startet. `F11` veksler fullskjerm i det aktive vinduet. **Visning → Animasjoner** slår bevegelse av eller på. Hvis en publikumsmonitor kobles fra, lukkes publikumsvisningen og kan startes igjen fra kontrollpanelet. Tomme gruppenavn vises ikke til publikum.

Når alle poeng er telt, velg **Ferdig** under forhåndsvisningen. Uferdige poengberegninger bekreftes først. Vinneren vises med stort bilde i midten, navn og poengsum, med animert innkomst, lys og konfetti. Andreplassen står til venstre med et mindre bilde og sølvkant, tredjeplassen til høyre med bronsekant. Ved delt plassering vises lagene på den plassen etter tur. To lag på førsteplass følges av tredjeplass. Mangler laget et bilde, vises en pokal. Finalen blir stående til du velger **Tilbake til poengtavlen** eller en annen visning. Animasjonsinnstillingen gjelder også finalen.

I publikumsvinduet kan du velge **Fullskjerm** øverst til høyre. Fullskjerm skjuler vindusrammen, toppmenyen og selve knappen. Trykk **Esc** eller **F11** for å gå tilbake til vinduet. Knappen vises ikke i forhåndsvisningen eller på svart skjerm.

## Prosjektfiler og lagring

`.mvuka` er en ZIP-basert prosjektpakke med et versjonert `project.json`-manifest og en `assets/`-mappe med innebygde bildekopier. Pakken inneholder navn, poeng, arrangementstittel, undertittel, animasjonsinnstilling og opptil 200 angre/gjør om-trinn. Den trenger ingen originalbilder eller filer ved siden av seg.

Bildene kopieres inn når de velges. Bilder større enn 1000 piksler på lengste side skaleres ned i kopien. Originalene endres ikke. Like bilder lagres bare én gang. Bilder som trengs for å angre en endring, blir også med i filen. PNG, JPEG/JFIF, WebP, GIF, AVIF, TIFF og SVG kan importeres. Stillbilder lagres som PNG, med riktig kamerarotasjon. SVG rasteriseres, og første side brukes fra flersidige TIFF-filer. Animerte GIF- og WebP-bilder beholder animasjon, tempo og looping. En PNG av første bilde følger med og vises når animasjoner er slått av eller systemet ber om redusert bevegelse. Både animasjonen og stillbildet lagres i prosjektfilen.

Bildevelgeren husker mappen til det sist valgte bildet på denne maskinen, også etter omstart og når du bytter prosjekt. Hvis mappen er slettet eller utilgjengelig, åpnes bildevelgeren på vanlig måte. Avbryt endrer ikke den lagrede mappen.

Hver prosjektendring lagres automatisk. Programmet skriver en midlertidig fil, synkroniserer den til disk og erstatter deretter prosjektfilen. Forrige versjon beholdes som `.mvuka.bak`. Programmet har i tillegg en gjenopprettingsfil i sin lokale brukerdatamappe og åpner den siste økten ved oppstart. Før prosjektet har fått et filnavn, står det **Lagret lokalt**. Velg **Lagre prosjekt** for å få en fil som kan flyttes eller deles.

Ved lagringsfeil vises en tydelig feilmelding. Bruk **Lagre som** til en skrivbar mappe. Du får en advarsel hvis programmet lukkes og lagringen feiler. En `.bak`-fil kan åpnes via **Åpne prosjekt**, men må lagres som en ny prosjektfil.

Maksimalt 48 grupper, 12 MB per valgt bilde og 256 MB per prosjekt. Poeng er mellom −999999 og 999999, med valgfri støtte for desimaler. Publikumstavlen viser én liste med rader over hele bredden. Førsteplassen er omtrent 24 % høyere enn de andre. De tre øverste har gull-, sølv- og bronseramme med langsomt animerte metallgradienter. Rammer og størrelse følger den nye plasseringen når poengene endres. Rekkefølgen er stabil ved poenglikhet. Bakgrunnen animeres rolig i en loop. Radhøyde, bilder, tekst og mellomrom tilpasses automatisk antall synlige grupper. Fra omtrent fem grupper fyller listen den tilgjengelige høyden. Ved færre grupper begrenses radstørrelsen, slik at det blir luft under listen. Kontroller lesbarheten fra bakerste rad ved mange grupper.

## Angre og gjør om

| Snarvei               | Handling                    |
| --------------------- | --------------------------- |
| Ctrl+Z                | Angre siste prosjektendring |
| Ctrl+Y / Ctrl+Shift+Z | Gjør om                     |
| Ctrl+S                | Lagre / velg prosjektfil    |
| Ctrl+Shift+S          | Lagre som                   |
| Ctrl+O                | Åpne prosjekt               |
| Ctrl+N                | Nytt prosjekt               |
| Enter i poengfelt     | Beregn og lagre poeng       |
| ↑ / ↓ i poengfelt     | Lagre og gå til gruppen over eller under |

På Mac brukes Cmd i stedet for Ctrl. Når du redigerer navn, gjelder vanlig tekstangring i feltet. I et uferdig poengfelt forkaster Ctrl+Z uttrykket. Etter bekreftelse angrer Ctrl+Z prosjektendringen. En sammenhengende navneredigering eller én poengberegning blir ett angretrinn. Knappene for angre/gjør om virker på prosjektet. Angrehistorikken følger med når prosjektet åpnes på nytt.

## Excel-import

Velg **File → Last ned Excel-mal** for å lagre en ferdig `.xlsx`-mal med kolonnene **Navn**, **Bilde** og **Poeng**, fem tomme grupperader og en kort veiledning. Fyll ut malen, lagre den og velg **File → Importer fra Excel**.

Velg en `.xlsx`-fil. Første rad på første ark skal ha **Navn**, og kan også ha **Poeng** og **Bilde**. Import erstatter gruppene og kan angres. Relative bildestier innenfor Excel-filens mappe kopieres inn i prosjektet. Nettadresser og bilder utenfor denne mappen importeres ikke automatisk; programmet oppgir antallet manglende bilder, som kan legges til med bildeknappen. Excel brukes til import; arbeidsformatet er `.mvuka`.

## Utvikling og bygging

Bare utviklingsmaskinen trenger Node.js (22.12 eller nyere anbefales).

```powershell
npm install
npm start
npm test
npm run test:app
npm run dist
```

`npm start` / `npm run dev` / `npm run start:desktop` starter Electron fra kildekoden. `npm run start:browser` starter den valgfrie nettlesertesten. `npm run test:app` er den automatiske Electron-testen og kjøres på en maskin som tillater Electron. `npm test` kjører modell- og servertester i Node uten Electron. Utvikling av skrivebordsutgaven og bygging krever `npm install --include=dev` med utviklingsavhengigheter.

EXE-testing er satt til side foreløpig. `npm run dist` kan senere bygge en portabel Windows-EXE i `release/`. `npm run pack` bygger en utpakket app. `npm run dist:installer` bygger en valgfri Windows-installasjon med filtilknytning. Kjør `npm run dist:mac` på Mac for DMG. Mac-pakken må bygges og testes på Mac; kodesignering/notarisering krever egne sertifikater. Windows-byggene er usignerte når signeringssertifikat ikke er konfigurert.

Byggmiljøet i denne økten avviste kjøring av den midlertidige NSIS-avinstallereren med `spawn EPERM`. Den separate installasjonspakken er derfor ikke verifisert her. Det portable bygget trenger ikke denne byggoperasjonen. Automatiske app-tester starter den faktiske Electron-appen med skjulte testvinduer, isolert brukerdata og skjermbilder i `test-results/`; de inkluderer en omstart og en simulert lagringsfeil.

Logoen er `DESIGN/logo.svg`. `npm run icons` kopierer SVG-logoen til `public/brand/` og lager gjennomsiktige, lyse appikoner i `assets/icon.png`, `assets/icon.ico` og `public/brand/icon.png`. Visuell retning er dokumentert i `assets/design.md`.

## Teknisk oppsett

- Electron med to isolerte, sandkassede vinduer og en begrenset preload-bro. Publikumsvinduet har lesetilgang, mens prosjektendringer bare godtas fra kontrollpanelet.
- Felles prosjektmodell, sekvensiell endringskø og automatisk lagring. Skrivebordsappen har ingen webserver. Nettlesertesten bruker en lokal Node-server og Server-Sent Events for oppdateringer. Ingen CDN-avhengighet.
- Publikumsvisning i et skalert 1600 × 900 lerret. Eksisterende rader flyttes med Web Animations API. En pågående poenganimasjon fullføres før siste ventende poengsum vises, slik at raske oppdateringer ikke lager en lang kø. Alle poengendringer lagres som før. Statusmeldinger om lagring starter aldri animasjonen på nytt.
- Rolige CSS-animerte bakgrunnslys. **Myke animasjoner** og operativsystemets innstilling for redusert bevegelse støttes.
- Testene dekker prosjektfiler med bilder, gjenåpning, vedvarende undo/redo, sletting med gjenoppretting av bilder, ugyldige filer, bildeintegritet, poengvalidering, historikkgrenser og atomisk lagring med sikkerhetskopi.

Før et arrangement bør den bygde appen prøves på maskinen og projektoren som faktisk skal brukes: oppstart uten nett, prosjektflytting, poenggiving, angre/gjør om, kabel frakoblet/tilkoblet, pause/svart skjerm og gjenåpning etter avslutning.
