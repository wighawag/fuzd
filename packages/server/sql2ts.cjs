const fs = require('fs');
const args = process.argv.slice(2);
for (const arg of args) {
	const SQLFilePath = arg;
	const sqlText = fs.readFileSync(SQLFilePath);
	fs.mkdirSync('./src/sql', {recursive: true});
	fs.writeFileSync(SQLFilePath.replace('./', './src/sql/').replace('.sql', '.sql.ts'), `export default \`${sqlText}\``);
}
