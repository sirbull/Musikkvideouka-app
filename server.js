const express = require('express');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');
const XLSX = require('xlsx');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const excelFile = path.join(__dirname, 'MAL_Musikkvideouka.xlsx');
// === Åpne Excel-fil automatisk ved oppstart (dummy-løsning) ===
const { exec } = require('child_process');
const { platform } = require('os');

const openCommand = platform() === 'win32' ? `start "" "${excelFile}"` : `open "${excelFile}"`;
exec(openCommand, (err) => {
  if (err) {
    console.error('Kunne ikke åpne Musikkvideouka.xlsx:', err);
  } else {
    console.log('Åpnet Musikkvideouka.xlsx med standardprogram.');
  }
});
let sisteGrupper = []; // Lokalt minne med siste gruppeoppdatering fra admin

// === Statisk og HTML ===

// Statisk serving av alle filer i public/, inkludert album_covers
// Eksempel: public/album_covers/artist_1.png blir tilgjengelig som /album_covers/artist_1.png
// For at gruppebilder skal vises, må "Bilde"-kolonnen i Excel inneholde f.eks. /album_covers/artist_1.png
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'publikum.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// === API-endepunkt for første lasting av grupper ===
app.get('/api/grupper', (req, res) => {
  const grupper = hentGruppeDataFraExcel();
  sisteGrupper = grupper; // Initielt minne
  res.json(grupper);
});

// === Hent grupper fra Excel ===
function hentGruppeDataFraExcel() {
  try {
    const wb = XLSX.readFile(excelFile);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(ws);
    console.log('📊 Excel-data hentet:', data);
    const grupper = data.map(row => {
      let bildeUrl = row['Bilde'] || '/album_covers/default.jpg';
      
      // Hvis bildestien ikke starter med /, antar vi at det er et filnavn i album_covers/
      if (bildeUrl && !bildeUrl.startsWith('/')) {
        bildeUrl = `/album_covers/${bildeUrl}`;
      }
      
      return {
        navn: row['Navn'] || 'Ukjent',
        poeng: parseInt(row['Poeng']) || 0,
        bildeUrl: bildeUrl
      };
    });
    console.log('✅ Behandlet grupper:', grupper);
    return grupper;
  } catch (error) {
    console.error('❌ Feil ved lesing av Excel-fil:', error);
    return [];
  }
}

// === Lagre grupper til Excel ===
function skrivTilExcel(grupper) {
  const data = grupper.map(g => ({
    Navn: g.navn,
    Bilde: g.bildeUrl,
    Poeng: g.poeng
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  XLSX.writeFile(wb, excelFile);
  console.log('✅ Excel-arket er oppdatert!');
}

// === Socket.IO håndtering ===
io.on('connection', (socket) => {
  console.log('🔌 Klient tilkoblet:', socket.id);

  // Når admin lagrer endringer eksplisitt
  socket.on('lagre-endringer', (oppdaterteGrupper) => {
    console.log('📥 Mottatt lagre-endringer fra admin:', oppdaterteGrupper);
    skrivTilExcel(oppdaterteGrupper);
    sisteGrupper = oppdaterteGrupper;
    io.emit('oppdater-grupper', oppdaterteGrupper);
  });

  // Når admin trykker "Oppdater"-knapp per gruppe
  socket.on('oppdaterFraAdmin', (grupper) => {
    console.log('📤 Mottatt oppdatering fra admin – sender til publikum...');
    sisteGrupper = grupper;
    io.emit('oppdaterFraServer', grupper);
  });
});

// === Push siste admin-data til publikum hvert 3. sekund ===
setInterval(() => {
  if (sisteGrupper.length > 0) {
    io.emit('oppdater-grupper', sisteGrupper);
  }
}, 3000);

// === Start server ===
server.listen(3000, () => {
  console.log('🚀 Server kjører på http://localhost:3000');
  
  // Åpne nettleseren automatisk med publikum og admin
  setTimeout(() => {
    const openUrl = platform() === 'win32' ? 'start' : 'open';
    exec(`${openUrl} http://localhost:3000/`, (err) => {
      if (err) console.error('Kunne ikke åpne publikumsside:', err);
    });
    exec(`${openUrl} http://localhost:3000/admin`, (err) => {
      if (err) console.error('Kunne ikke åpne adminpanel:', err);
    });
  }, 1000);
});
