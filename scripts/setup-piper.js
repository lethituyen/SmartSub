const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const targetDir = path.join(__dirname, '../extraResources/piper');
if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

const zipPath = path.join(targetDir, 'piper_windows_amd64.zip');
const url = 'https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_windows_amd64.zip';

console.log('Downloading Piper from', url, '...');

function download(u, dest, cb) {
  https.get(u, (res) => {
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
      return download(res.headers.location, dest, cb);
    }
    if (res.statusCode !== 200) {
      return cb(new Error('Status ' + res.statusCode));
    }
    const file = fs.createWriteStream(dest);
    res.pipe(file);
    file.on('finish', () => file.close(cb));
  }).on('error', cb);
}

download(url, zipPath, (err) => {
  if (err) {
    console.error('Download failed:', err.message);
    process.exit(1);
  }
  console.log('Downloaded', fs.statSync(zipPath).size, 'bytes');
  console.log('Extracting zip...');
  try {
    execSync(`tar -xf "${zipPath}" -C "${targetDir}"`, { stdio: 'inherit' });
    console.log('Extraction complete. Directory contents:');
    console.log(fs.readdirSync(targetDir));
    
    // Check if extracted into targetDir/piper
    const subPiper = path.join(targetDir, 'piper');
    if (fs.existsSync(subPiper)) {
      console.log('Contents of subfolder piper:');
      const files = fs.readdirSync(subPiper);
      console.log(files);
      // Move contents up if needed
      for (const f of files) {
        fs.renameSync(path.join(subPiper, f), path.join(targetDir, f));
      }
      fs.rmdirSync(subPiper);
      console.log('Moved files to root extraResources/piper/');
    }
    
    // Clean zip
    if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
    
    const piperExe = path.join(targetDir, 'piper.exe');
    if (fs.existsSync(piperExe)) {
      console.log('SUCCESS: piper.exe is present at', piperExe);
      const out = execSync(`"${piperExe}" --version`, { encoding: 'utf8' });
      console.log('Piper Version:', out.trim());
    } else {
      console.error('Error: piper.exe not found!');
    }
  } catch (e) {
    console.error('Extraction error:', e.message);
  }
});
