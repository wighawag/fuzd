const fs = require('fs');
const args = process.argv.slice(2);
for (const arg of args) {
	const CSSFilePath = `./src/dashboard/styles/css/${arg}.css`;
	const TSFilePath = `./src/dashboard/styles/ts/${arg}.css.ts`;
	const cssText = fs.readFileSync(CSSFilePath);
	fs.mkdirSync('./src/dashboard/styles/ts', {recursive: true});
	fs.writeFileSync(TSFilePath, `export default \`${cssText}\``);
}
