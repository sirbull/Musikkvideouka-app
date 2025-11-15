const express = require('express');
const { exec } = require('child_process');
const cors = require('cors');

const app = express();
const PORT = 3030;

app.use(cors());
app.use(express.json());

app.post('/install', (req, res) => {
  exec('npm install', (err, stdout, stderr) => {
    if (err) {
      return res.status(500).json({ success: false, error: stderr });
    }
    res.json({ success: true, output: stdout });
  });
});

app.post('/start', (req, res) => {
  exec('npm run dev', (err, stdout, stderr) => {
    if (err) {
      return res.status(500).json({ success: false, error: stderr });
    }
    res.json({ success: true, output: stdout });
  });
});

app.listen(PORT, () => {
  console.log(`Start-hjelper kjører på http://localhost:${PORT}`);
});
