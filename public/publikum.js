const socket = io();

// Funksjon for å oppdatere visningen av grupper
function oppdaterGrupper(grupper) {
    const container1 = document.getElementById('kolonne1');
    const container2 = document.getElementById('kolonne2');

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


    // === DEL GRUPPENE I TO KOLONNER ===
    // Flytt første gruppe fra høyre til nederst i venstre kolonne
    const maxVenstre = 8;
    let kolonne1 = grupper.slice(0, maxVenstre);
    let kolonne2 = grupper.slice(maxVenstre);
    if (kolonne2.length > 0) {
        // Ta ut første fra høyre og legg til nederst i venstre
        kolonne1 = kolonne1.concat(kolonne2.shift());
    }

    // === GENERER ELEMENTER FOR HVER GRUPPE ===
    function lagGruppeElement(gruppe, erForste) {

        const div = document.createElement('div');
        div.className = 'gruppe';
        div.dataset.id = gruppe.navn;
        if (erForste) {
            div.classList.add('vinner'); // ekstra stil for førsteplass
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
        poeng.textContent = `${gruppe.poeng} poeng`;

        div.appendChild(bilde);
        div.appendChild(navn);
        div.appendChild(poeng);

        return div;
    }

    // === VIS GRUPPENE I KOLONNE 1 ===

    // === VIS GRUPPENE I KOLONNE 1 ===
    kolonne1.forEach((gruppe, index) => {
        const erForste = index === 0;
        const element = lagGruppeElement(gruppe, erForste);
        container1.appendChild(element);
    });

    // === VIS GRUPPENE I KOLONNE 2 ===
    kolonne2.forEach(gruppe => {
        const element = lagGruppeElement(gruppe, false);
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
