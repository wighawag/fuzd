// writes src/version.ts from package.json, so the version route answers the version that is built
const fs = require('fs');
const {version} = JSON.parse(fs.readFileSync('./package.json', 'utf-8'));
fs.writeFileSync('./src/version.ts', `export const version = ${JSON.stringify(version)};\n`);
