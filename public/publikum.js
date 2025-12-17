const socket = io();

// Lagre forrige vinner for å detektere endringer
let forrigeVinner = null;

// Funksjon for å oppdatere visningen av grupper
function oppdaterGrupper(grupper) {
    const container1 = document.getElementById('kolonne1');
    const container2 = document.getElementById('kolonne2');

    // Beregn dynamisk skalering basert på antall grupper
    const antallGrupper = grupper.length;
    const maxGrupperPerKolonne = Math.ceil(antallGrupper / 2);
    const grupperContainer = document.querySelector('.grupper-container');
    
    // Dynamisk skalering basert på antall grupper per kolonne
    // Målet er å passe alle grupper inn på 1080px høyde
    let scale = 1;
    if (maxGrupperPerKolonne > 10) {
        // Hvis det er mer enn 10 grupper per kolonne, skal vi skalere ned
        scale = Math.max(0.5, 10 / maxGrupperPerKolonne);
    } else if (maxGrupperPerKolonne < 8) {
        // Hvis det er mindre enn 8 grupper, kan vi skalere opp litt
        scale = Math.min(1.2, 8 / maxGrupperPerKolonne);
    }
    
    // Sett CSS-variabler for dynamisk skalering
    const root = document.documentElement;
    root.style.setProperty('--container-gap', `${1.2 * scale}rem`);
    root.style.setProperty('--container-padding', `${1.2 * scale}rem`);
    root.style.setProperty('--kolonne-gap', `${0.35 * scale}rem`);
    root.style.setProperty('--gruppe-gap', `${0.7 * scale}rem`);
    root.style.setProperty('--gruppe-padding', `${0.28 * scale}rem ${0.7 * scale}rem`);
    root.style.setProperty('--gruppe-min-height', `${48 * scale}px`);
    root.style.setProperty('--bilde-size', `${60 * scale}px`);
    root.style.setProperty('--navn-font-size', `${1.5 * scale}rem`);
    root.style.setProperty('--poeng-font-size', `${1.3 * scale}rem`);
    root.style.setProperty('--vinner-min-height', `${85 * scale}px`);
    root.style.setProperty('--vinner-padding', `${0.8 * scale}rem ${1.3 * scale}rem`);
    root.style.setProperty('--vinner-bilde-size', `${70 * scale}px`);
    root.style.setProperty('--vinner-navn-font-size', `${1.8 * scale}rem`);
    root.style.setProperty('--vinner-poeng-font-size', `${1.5 * scale}rem`);

    // FLIP: Første - lagre posisjoner
    const allGruppeDivs = [...container1.children, ...container2.children];
    const firstRects = new Map();
    allGruppeDivs.forEach(div => {
        if (div.dataset.id) {
            firstRects.set(div.dataset.id, div.getBoundingClientRect());
        }
    });

    container1.innerHTML = '';
    container2.innerHTML = '';

    // Sorter gruppene etter poeng (høyest først)
    grupper.sort((a, b) => b.poeng - a.poeng);

    // Sjekk om vi har en ny vinner
    const nyVinner = grupper.length > 0 ? grupper[0].navn : null;
    const nyVinnerPoeng = grupper.length > 0 ? grupper[0].poeng : 0;
    if (forrigeVinner !== null && nyVinner !== null && forrigeVinner !== nyVinner && nyVinnerPoeng >= 20) {
        // Ny vinner med minst 20 poeng! Vis konfetti
        visKonfetti();
    }
    forrigeVinner = nyVinner;


    // === DEL GRUPPENE I TO KOLONNER ===
    // Venstre kolonne får første halvdel, høyre kolonne får andre halvdel
    const halvparten = Math.ceil(grupper.length / 2);
    let kolonne1 = grupper.slice(0, halvparten);
    let kolonne2 = grupper.slice(halvparten);

    // === GENERER ELEMENTER FOR HVER GRUPPE ===
    function lagGruppeElement(gruppe, plassering) {

        const div = document.createElement('div');
        div.className = 'gruppe';
        div.dataset.id = gruppe.navn;
        // Kun legg til vinner-stil hvis det er førsteplass OG gruppen har minst 10 poeng
        if (plassering === 1 && gruppe.poeng >= 10) {
            div.classList.add('vinner'); // ekstra stil for førsteplass
        } else if (plassering === 2 && gruppe.poeng >= 10) {
            div.classList.add('solv'); // sølv glow for andreplassen
        } else if (plassering === 3 && gruppe.poeng >= 10) {
            div.classList.add('bronse'); // bronse glow for tredjeplassen
        }


    // Nå forventes at gruppe.bildeUrl er en relativ URL, f.eks. /album_covers/artist_1.png
    // Denne brukes direkte som src for <img>
    const bilde = document.createElement('img');
    bilde.src = gruppe.bildeUrl || '';
    bilde.alt = gruppe.navn;
    bilde.className = 'gruppe-bilde';

        const navn = document.createElement('div');
        navn.className = 'gruppe-navn';
        navn.textContent = gruppe.navn;

        const poeng = document.createElement('div');
        poeng.className = 'gruppe-poeng';
        poeng.textContent = `${gruppe.poeng}`;

        div.appendChild(bilde);
        div.appendChild(navn);
        div.appendChild(poeng);

        return div;
    }

    // === VIS GRUPPENE I KOLONNE 1 ===

    // === VIS GRUPPENE I KOLONNE 1 ===
    kolonne1.forEach((gruppe, index) => {
        const plassering = index + 1; // 1, 2, 3, ...
        const element = lagGruppeElement(gruppe, plassering);
        
        // Legg til ekstra celebration-animasjon hvis dette er ny vinner
        if (plassering === 1 && forrigeVinner !== null && forrigeVinner !== gruppe.navn) {
            element.classList.add('ny-vinner');
            // Fjern klassen etter animasjon er ferdig
            setTimeout(() => {
                element.classList.remove('ny-vinner');
            }, 1200);
        }
        
        container1.appendChild(element);
    });

    // === VIS GRUPPENE I KOLONNE 2 ===
    kolonne2.forEach((gruppe, index) => {
        const plassering = kolonne1.length + index + 1;
        const element = lagGruppeElement(gruppe, plassering);
        container2.appendChild(element);
    });

    // FLIP: Last - lagre nye posisjoner og animér
    const newGruppeDivs = [...container1.children, ...container2.children];
    newGruppeDivs.forEach(div => {
        const id = div.dataset.id;
        if (!id || !firstRects.has(id)) return;
        const firstRect = firstRects.get(id);
        const lastRect = div.getBoundingClientRect();
        const dx = firstRect.left - lastRect.left;
        const dy = firstRect.top - lastRect.top;
        if (dx !== 0 || dy !== 0) {
            div.style.transition = 'none';
            div.style.transform = `translate(${dx}px, ${dy}px)`;
            requestAnimationFrame(() => {
                div.style.transition = 'transform 0.5s cubic-bezier(0.4,0,0.2,1), box-shadow 0.5s';
                div.style.transform = '';
            });
        }
    });
}

// === Socket.IO: motta oppdateringer fra server ===
socket.on('oppdater-grupper', (grupper) => {
    oppdaterGrupper(grupper);
});

// Ny Socket.IO-lytter for eksplisitt oppdatering fra admin
socket.on('oppdaterFraServer', (grupper) => {
    oppdaterGrupper(grupper);
});

// === Hent første gang ved lasting av siden ===
fetch('/api/grupper')
    .then(res => res.json())
    .then(data => oppdaterGrupper(data))
    .catch(err => console.error('Feil ved henting av grupper:', err));

// === Konfetti-effekt ===
function visKonfetti() {
    const colors = ['#FFD700', '#FF69B4', '#00CED1', '#FF6347', '#9370DB', '#32CD32'];
    const confettiCount = 150;
    const container = document.body;

    for (let i = 0; i < confettiCount; i++) {
        const confetti = document.createElement('div');
        confetti.className = 'confetti';
        confetti.style.left = Math.random() * 100 + 'vw';
        confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        confetti.style.animationDelay = Math.random() * 0.3 + 's';
        confetti.style.animationDuration = (Math.random() * 1 + 2) + 's';
        container.appendChild(confetti);

        // Fjern konfetti etter animasjon
        setTimeout(() => {
            confetti.remove();
        }, 4000);
    }
}

// === Vinner-overlay: vis overlay når admin trykker på vinner-knappen ===
socket.on('vis-vinner-overlay', (topp3) => {
    if (!Array.isArray(topp3) || topp3.length === 0) return;
    const overlayBg = document.getElementById('vinner-overlay-bg');
    const overlay = document.getElementById('vinner-overlay');
    const fireworksDiv = overlay.querySelector('.vinner-fireworks');
    const mainbox = overlay.querySelector('.vinner-mainbox');
    const topp3box = overlay.querySelector('.vinner-topp3');

    // Fade ut resten av siden
    overlayBg.style.display = 'block';
    overlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    // Fyrverkeri: restart animasjon
    if (typeof window.Stage === 'function') {
        // Fjerner gamle canvas hvis de finnes
        fireworksDiv.innerHTML = '';
        // Kopier innhold fra fireworks.html (canvasene)
        const trails = document.createElement('canvas');
        trails.id = 'trails-canvas';
        const main = document.createElement('canvas');
        main.id = 'main-canvas';
        fireworksDiv.appendChild(trails);
        fireworksDiv.appendChild(main);
        // Initier fireworks.js på nytt
        if (window.init) window.init();
    }

    // Vinnerboks
    const vinner = topp3[0];
    mainbox.innerHTML = `
      <div class="vinner-bildebox"><img src="${vinner.bildeUrl || ''}" alt="${vinner.navn}"></div>
      <div class="vinner-navnbox">${vinner.navn}</div>
      <div class="vinner-poengbox">${vinner.poeng}</div>
    `;

    // Andre- og tredjeplass
    topp3box.innerHTML = '';
    if (topp3[1]) {
      topp3box.innerHTML += `
        <div class="plassbox solv">
          <img src="${topp3[1].bildeUrl || ''}" alt="${topp3[1].navn}">
          <span>${topp3[1].navn}</span>
          <span style="margin-left:auto;font-weight:bold;">${topp3[1].poeng}</span>
        </div>
      `;
    }
    if (topp3[2]) {
      topp3box.innerHTML += `
        <div class="plassbox bronse">
          <img src="${topp3[2].bildeUrl || ''}" alt="${topp3[2].navn}">
          <span>${topp3[2].navn}</span>
          <span style="margin-left:auto;font-weight:bold;">${topp3[2].poeng}</span>
        </div>
      `;
    }

    // Lukk overlay på klikk eller ESC
    function closeOverlay() {
      overlayBg.style.display = 'none';
      overlay.style.display = 'none';
      document.body.style.overflow = '';
    }
    overlayBg.onclick = closeOverlay;
    overlay.onclick = closeOverlay;
    document.onkeydown = (e) => {
      if (e.key === 'Escape') closeOverlay();
    };
});
