# Visuell retning

Den eksisterende mørkeblå publikumsvisningen videreføres med en tydeligere typografisk struktur, rolige lysflater og mer konsekvent avstand mellom elementene. Cyan markerer hovedhandlinger. Varmt gult markerer nye poeng og førsteplassen. Kontrollpanelet bruker samme palett med mindre visuell bevegelse.

Kontrollpanelet består av en redigerbar prosjekttittel, en enkel gruppeliste og fast forhåndsvisning. Prosjektvalgene ligger i den synlige File-menyen. Nye prosjekter har fem tomme grupper. Publikumsvisningen bruker den opprinnelige blå gradienten, bilder og poeng, og en liten prosjekttittel. Radene fyller hele bredden i én liste. Førsteplassen er litt høyere, med gullramme; andre og tredje har sølv- og bronseramme. Tre ulike metallgradienter beveger seg langsomt rundt radene, med maskering slik at glansen bare ligger i kantlinjen. Bakgrunnens fargeflater beveger seg rolig i sømløse looper.

Referanse: `origin/main` / `a59b343` og medaljestilene fra `1742de4`. Main hadde `.vinner`, `.solv` og `.bronse`, med større førsteplass, men også to kolonner. Oppsettet er nå endret til full bredde etter brukerens beskrivelse; kraftig pulserende glow er erstattet med rolig metallglans. Både metallglans og bakgrunn følger innstillingen for redusert bevegelse.

Appen bruker nå brukerens logo fra `DESIGN/logo.svg`. SVG-originalen bevares som levert. I det mørke grensesnittet vises den i hvitt, med den redigerbare prosjekttittelen ved siden av. Logo og tekst sentreres samlet i publikumsvisningen og finalen. Pauseskjermen bruker samme kombinasjon. `npm run icons` kopierer logoen til `public/brand/logo.svg` og lager hvite vindus- og appikoner på gjennomsiktig bakgrunn.
