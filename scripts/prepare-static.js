const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const publicDir = path.join(rootDir, 'public');

const entriesToCopy = [
    'index.html',
    'admin.html',
    'referral.html',
    'guest-referral.html',
    'js',
    'images',
    'robots.txt',
    '_redirects'
];

const attachedAssetsToCopy = [
    'Hyatus-01-1_1764487238079.webp'
];

fs.rmSync(publicDir, { recursive: true, force: true });
fs.mkdirSync(publicDir, { recursive: true });

for (const entry of entriesToCopy) {
    const source = path.join(rootDir, entry);
    const destination = path.join(publicDir, entry);
    fs.cpSync(source, destination, { recursive: true });
}

const attachedAssetsDir = path.join(publicDir, 'attached_assets');
fs.mkdirSync(attachedAssetsDir, { recursive: true });

for (const filename of attachedAssetsToCopy) {
    const source = path.join(rootDir, 'attached_assets', filename);
    const destination = path.join(attachedAssetsDir, filename);
    fs.cpSync(source, destination);
}

console.log(`Prepared static output in ${publicDir}`);
