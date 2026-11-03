# Visuell retning

Den eksisterende mørkeblå publikumsvisningen videreføres med en tydeligere typografisk struktur, rolige lysflater og mer konsekvent avstand mellom elementene. Cyan markerer hovedhandlinger. Varmt gult markerer nye poeng og førsteplassen. Kontrollpanelet bruker samme palett med mindre visuell bevegelse.

Kontrollpanelet består av en redigerbar prosjekttittel, en enkel gruppeliste og fast forhåndsvisning. Prosjektvalgene ligger i den synlige File-menyen. Nye prosjekter har fem tomme grupper. Publikumsvisningen bruker den opprinnelige blå gradienten, bilder og poeng, og en liten prosjekttittel. Radene fyller hele bredden i én liste. Førsteplassen er litt høyere, med gullramme; andre og tredje har sølv- og bronseramme. Tre ulike metallgradienter beveger seg langsomt rundt radene, med maskering slik at glansen bare ligger i kantlinjen. Bakgrunnens fargeflater beveger seg rolig i sømløse looper.

Referanse: `origin/main` / `a59b343` og medaljestilene fra `1742de4`. Main hadde `.vinner`, `.solv` og `.bronse`, med større førsteplass, men også to kolonner. Oppsettet er nå endret til full bredde etter brukerens beskrivelse; kraftig pulserende glow er erstattet med rolig metallglans. Både metallglans og bakgrunn følger innstillingen for redusert bevegelse.

Appikonet kombinerer tre stigende stolper fra en equalizer/poengpall med et avspillingssymbol. Ikonet ble laget med den innebygde imagegen-funksjonen. Originalen er `icon-source.png`; installasjonsikon, vindusikon og grensesnittvariant lages av `npm run icons`.

Genereringsprompt:

> Use case: logo-brand. Asset type: production desktop app icon for Musikkvideouka, a Norwegian music-video competition live scoreboard. Primary request: a polished, memorable app icon combining three rising rounded equalizer/podium bars with a small play triangle cutout in the tallest bar. Bold simple silhouette legible at 32px. Composition: a single centered icon filling a square canvas with a dark midnight navy rounded-square tile, generous clean inset margin, no mockup and no surrounding scenery. Palette: rich midnight navy #081427 tile, luminous electric blue and cyan bars, one subtle warm golden highlight on the tallest bar; fits a professional dark-blue live show scoreboard. Style: precise minimal geometric premium software icon, gentle dimensional lighting, crisp edges, restrained soft glow, no busy texture. No text, letters, numbers, watermark, musical-note clipart, or thin details. Deliver one square icon.

Korrigering av gjennomsiktighet ble utført med innebygd imagegen (`transparent_background: true`). Den hvite bakgrunnen utenfor de avrundede hjørnene er fjernet. Den mørke ikonflaten beholdes. Originalen med hvit bakgrunn er bevart som `icon-source-original.png`. PNG-hjørnene er kontrollert for alfa 0, og ICO-utgavene har også alfakanal.

Redigeringsprompt:

> Edit target: the attached existing Musikkvideouka app icon. Background extraction only. Remove all white/off-white pixels OUTSIDE the dark navy rounded-square tile and make that exterior genuinely transparent with a clean antialiased alpha edge. Keep the entire rounded navy tile, its exact shape, the three blue/cyan equalizer bars, the golden highlight and play cutout unchanged. Preserve the original composition, dimensions, geometry, shading and colors. Do not add a backdrop, checkerboard, border, shadow outside the tile, text or redesign. This will be used as a Windows app icon on dark and light taskbars. Output a PNG with real alpha transparency in all four exterior corners.
