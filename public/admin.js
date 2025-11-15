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
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, range: 1 });
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

// === Vise dataene i admin-grensesnittet ===
function displayData(dataRows) {
    data = dataRows;
    const outputDiv = document.getElementById('output');
    outputDiv.innerHTML = '';

    data.forEach(function (row, index) {
        const rowDiv = document.createElement('div');
        rowDiv.classList.add('group-row');


    // === Bilde ===
    // Nå forventes at "Bilde"-kolonnen i Excel inneholder en relativ URL, f.eks. /album_covers/artist_1.png
    // Denne brukes direkte som src for <img>
    const imgElement = document.createElement('img');
    imgElement.src = row[1] || '';
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
            bildeInput.value = imgElement.src;
        });
    });
}

// === Last ned som Excel (backup) ===
document.getElementById('download-button').addEventListener('click', function () {
    const wb = XLSX.utils.book_new();
    const dataForExcel = data.map(row => [row[0], row[1], row[2]]);
    const ws = XLSX.utils.aoa_to_sheet(dataForExcel);
    XLSX.utils.book_append_sheet(wb, ws, 'Grupper');
    XLSX.writeFile(wb, 'gruppedata.xlsx');
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
