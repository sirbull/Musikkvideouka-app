const socket = io();

// Funksjon for å oppdatere visningen av grupper
function oppdaterGrupper(grupper) {
    const container1 = document.getElementById('kolonne1');
    const container2 = document.getElementById('kolonne2');
    container1.innerHTML = '';
    container2.innerHTML = '';

    // Sorter gruppene etter poeng (høyest først)
    grupper.sort((a, b) => b.poeng - a.poeng);

    // === DEL GRUPPENE I TO KOLONNER ===
    const maxVenstre = 8; // maks 8 grupper i venstre kolonne
    const kolonne1 = grupper.slice(0, maxVenstre);
    const kolonne2 = grupper.slice(maxVenstre); // resten går i høyre kolonne

    // === GENERER ELEMENTER FOR HVER GRUPPE ===
    function lagGruppeElement(gruppe, erForste) {
        const div = document.createElement('div');
        div.className = 'gruppe';
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
