const fs = require('fs');
const args = process.argv.slice(2);
for (const arg of args) {
	const SQLFilePath = `./src/schema/sql/${arg}.sql`;
	const TSFilePath = `./src/schema/ts/${arg}.sql.ts`;
	const sqlText = fs.readFileSync(SQLFilePath);
	fs.mkdirSync('./src/schema/ts', {recursive: true});
	fs.writeFileSync(TSFilePath, `export default \`${sqlText}\``);
}
