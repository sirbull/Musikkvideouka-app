// === Vinner-knapp funksjonalitet ===
window.addEventListener('DOMContentLoaded', function() {
    const winnerBtn = document.getElementById('show-winner-btn');
    if (winnerBtn) {
        winnerBtn.addEventListener('click', function() {
            if (!confirm('Er du sikker på at du vil annonsere vinneren? Dette vises for publikum!')) return;
            // Hent grupper fra skjemaet
            const grupper = hentGruppeDataFraSkjema();
            // Sorter på poeng, høyest først
            grupper.sort((a, b) => b.poeng - a.poeng);
            // Ta topp 3
            const topp3 = grupper.slice(0, 3);
            // Send til publikum
            socket.emit('vis-vinner-overlay', topp3);
        });
    }
});
let data = [];
const socket = io();

// === Lese Excel-fil og vise data ===

const excelInput = document.getElementById('excel-file');
const uploadWarning = document.getElementById('upload-warning');

excelInput.addEventListener('change', function (event) {
    const file = event.target.files[0];
    if (!file) {
        if (uploadWarning) uploadWarning.style.display = 'block';
        return;
    }
    if (uploadWarning) uploadWarning.style.display = 'none';

    const reader = new FileReader();
    reader.onload = function (e) {
        const dataRaw = e.target.result;
        const workbook = XLSX.read(dataRaw, { type: 'binary' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        let rows = XLSX.utils.sheet_to_json(sheet, { header: 1, range: 1 });
        // Filtrer ut tomme rader (ingen navn, bilde eller poeng)
        rows = rows.filter(row => {
          // Sjekk at minst én av kolonnene har innhold (Navn, Bilde, Poeng)
          return (row[0] && row[0].toString().trim() !== '') ||
                 (row[1] && row[1].toString().trim() !== '') ||
                 (row[2] && row[2].toString().trim() !== '');
        });
        displayData(rows);
    };
    reader.readAsBinaryString(file);
});

// Vis advarsel hvis ingen fil er valgt ved lasting av siden
window.addEventListener('DOMContentLoaded', function() {
    if (excelInput && !excelInput.files.length && uploadWarning) {
        uploadWarning.style.display = 'block';
    }
});

// === Hent og vis grupper fra server ved lasting av siden ===
window.addEventListener('DOMContentLoaded', function() {
    fetch('/api/grupper')
        .then(res => res.json())
        .then(grupper => {
            // Konverter til array av arrays slik displayData forventer
            const rows = grupper.map(g => [g.navn, g.bildeUrl, g.poeng]);
            if (rows.length > 0) {
                displayData(rows);
                if (uploadWarning) uploadWarning.style.display = 'none';
            }
        })
        .catch(() => {});
});

// === Vise dataene i admin-grensesnittet ===
function displayData(dataRows) {
    data = dataRows;
    const outputDiv = document.getElementById('output');
    outputDiv.innerHTML = '';

    data.forEach(function (row, index) {
        const rowDiv = document.createElement('div');
        rowDiv.classList.add('group-row');


    // === Bilde ===
    // Støtte for flere formater i Excel: absolutt URL, ledende /-sti, data-URI eller bare filnavn.
    // Hvis det kun er filnavn (f.eks. "5.png" eller "gruppe_5.jpg"), antas det å ligge i /album_covers/
    const imgElement = document.createElement('img');
    let imageSrc = row[1] || '';
    if (imageSrc && !imageSrc.startsWith('data:') && !imageSrc.startsWith('/') && !imageSrc.match(/^https?:\/\//i)) {
        imageSrc = `/album_covers/${imageSrc}`;
    }
    imgElement.src = imageSrc;
    imgElement.style.width = '50px';
    imgElement.style.height = '50px';
    imgElement.style.objectFit = 'cover';

        const uploadImageButton = document.createElement('button');
        uploadImageButton.innerText = 'Endre Bilde';
        uploadImageButton.onclick = function () {
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = 'image/*';
            fileInput.onchange = function (e) {
                const reader = new FileReader();
                reader.onload = function (e) {
                    imgElement.src = e.target.result;
                    bildeInput.value = e.target.result;
                };
                reader.readAsDataURL(fileInput.files[0]);
            };

            const imageSource = prompt("Skriv 'lokal' for å laste opp bilde fra maskin, eller lim inn URL.");
            if (imageSource?.toLowerCase() === 'lokal') {
                fileInput.click();
            } else if (imageSource?.toLowerCase() === 'url') {
                const imageUrl = prompt("Lim inn URL til bildet:");
                imgElement.src = imageUrl;
                bildeInput.value = imageUrl;
            }
        };

        // === Gruppens navn ===
        const groupNameInput = document.createElement('input');
        groupNameInput.value = row[0] || '';
        groupNameInput.classList.add('gruppe-navn');

        // === Poengvisning ===
        const pointsDisplay = document.createElement('span');
        pointsDisplay.innerText = row[2] || 0;
        pointsDisplay.classList.add('points-display');

        // === Input for å legge til poeng ===
        const addPointsInput = document.createElement('input');
        addPointsInput.type = 'number';
        addPointsInput.placeholder = 'Legg til/trekk poeng';
        addPointsInput.classList.add('points-input');

        // === Skjult input-felt for poengverdi ===
        const hiddenPointsInput = document.createElement('input');
        hiddenPointsInput.type = 'number';
        hiddenPointsInput.value = row[2] || 0;
        hiddenPointsInput.classList.add('gruppe-poeng');
        hiddenPointsInput.style.display = 'none';

        // === Skjult input-felt for bilde-url ===
        const bildeInput = document.createElement('input');
        bildeInput.type = 'text';
        bildeInput.value = row[1] || '';
        bildeInput.classList.add('gruppe-bilde');
        bildeInput.style.display = 'none';

        // === Oppdater-knapp per gruppe ===
        const updateButton = document.createElement('button');
        updateButton.innerText = 'Oppdater';
        updateButton.onclick = function () {
            const currentPoeng = parseInt(hiddenPointsInput.value) || 0;
            const pointsToAdd = parseInt(addPointsInput.value) || 0;
            const nyPoengsum = currentPoeng + pointsToAdd;

            // Oppdater DOM
            hiddenPointsInput.value = nyPoengsum;
            pointsDisplay.innerText = nyPoengsum;
            addPointsInput.value = '';

            // Send oppdatering til publikum
            const grupper = hentGruppeDataFraSkjema();
            socket.emit('oppdaterFraAdmin', grupper);
            console.log('📤 Sender til publikum:', grupper);
        };

        // === Enter-tast for å legge til poeng ===
        addPointsInput.addEventListener('keypress', function (event) {
            if (event.key === 'Enter') {
                updateButton.click();
            }
        });

        const buttonWrapper = document.createElement('div');
        buttonWrapper.classList.add('update-buttons');
        buttonWrapper.appendChild(addPointsInput);
        buttonWrapper.appendChild(updateButton);

        // === Sett sammen raden ===
        rowDiv.appendChild(imgElement);
        rowDiv.appendChild(uploadImageButton);
        rowDiv.appendChild(groupNameInput);
        rowDiv.appendChild(pointsDisplay);
        rowDiv.appendChild(buttonWrapper);
        rowDiv.appendChild(hiddenPointsInput);
        rowDiv.appendChild(bildeInput);
        outputDiv.appendChild(rowDiv);

        // === Hold data og DOM synkronisert ===
        groupNameInput.addEventListener('input', function () {
            data[index][0] = groupNameInput.value;
        });
        imgElement.addEventListener('load', function () {
            // Når bildet er lastet inn, lagre den virkelige src i skjult input.
            // Hvis kilden er en data-URI fra opplasting, behold den. Ellers, sørg for at vi lagrer en absolut/stabil sti.
            let val = imgElement.src || '';
            // Hvis browser har resolvert en relativ sti til absolutt URL, og den peker tilbake til vår host,
            // konverter den til en rot-relative sti hvis mulig (for ryddighet).
            try {
                const u = new URL(val, window.location.href);
                if (u.origin === window.location.origin) {
                    val = u.pathname + u.search + u.hash;
                }
            } catch (e) {
                // ignore
            }
            bildeInput.value = val;
        });
    });

    // Etter at vi har vist alle rader i admin, send data direkte til publikum slik at siden oppdateres.
    // Dette lar deg laste en ny Excel-fil i admin og umiddelbart oppdatere publikum uten å klikke "Oppdater" per rad.
    const grupperForPublikum = hentGruppeDataFraSkjema();
    if (grupperForPublikum && grupperForPublikum.length > 0) {
        socket.emit('oppdaterFraAdmin', grupperForPublikum);
        console.log('📤 Automatisk sendt innlastede grupper til publikum:', grupperForPublikum);
    }
}

// === Last ned som Excel (backup) ===
document.getElementById('download-button').addEventListener('click', function () {
    // Lag filnavn med dato og klokkeslett
    const now = new Date();
    const pad = n => n.toString().padStart(2, '0');
    const dato = pad(now.getDate()) + pad(now.getMonth() + 1) + now.getFullYear();
    const tid = pad(now.getHours()) + pad(now.getMinutes()) + pad(now.getSeconds());
    const filnavn = `Musikkvideauka-${dato}-${tid}.xlsx`;

    // Header
    const dataForExcel = [["Navn", "Bilde", "Poeng"]];
    // Rader
    data.forEach(row => {
        dataForExcel.push([row[0], row[1], row[2]]);
    });
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(dataForExcel);
    XLSX.utils.book_append_sheet(wb, ws, 'Grupper');
    XLSX.writeFile(wb, filnavn);
});

// === Hente ut alle data fra skjemaet ===
function hentGruppeDataFraSkjema() {
    const gruppeElementer = document.querySelectorAll('.group-row');
    const grupper = [];

    gruppeElementer.forEach(gruppeEl => {
        const navn = gruppeEl.querySelector('.gruppe-navn')?.value || 'Ukjent';
        const poeng = parseInt(gruppeEl.querySelector('.gruppe-poeng')?.value) || 0;
        const bildeUrl = gruppeEl.querySelector('.gruppe-bilde')?.value || '';
        grupper.push({ navn, poeng, bildeUrl });
    });

    return grupper;
}
