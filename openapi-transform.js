import fs from 'node:fs';

const openapiSTR = fs.readFileSync('./packages/server/doc/openapi.json', 'utf-8');
const openapi = JSON.parse(openapiSTR);
openapi.servers = [{url: 'https://api.fuzd.dev'}];

const descriptions = JSON.parse(fs.readFileSync('./openapi-descriptions.json'));

const methods = ['get', 'post'];

const paths = Object.keys(openapi.paths);
for (const path of paths) {
	const description = descriptions[path];
	if (description) {
		for (const method of methods) {
			if (openapi.paths[path][method]) {
				openapi.paths[path][method].description = description[method];
			}
		}
	}
}

fs.writeFileSync('./docs/public/openapi.json', JSON.stringify(openapi, null, 2));
