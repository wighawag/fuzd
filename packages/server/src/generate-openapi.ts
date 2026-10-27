// build step: write the OpenAPI document of the public API (see package.json `openapi`)
import fs from 'node:fs';
import path from 'node:path';
import {generateOpenAPIDocument} from './openapi.js';

const output = process.argv[2];
if (!output) {
	throw new Error(`usage: generate-openapi <output.json>`);
}
const document = await generateOpenAPIDocument();
fs.mkdirSync(path.dirname(output), {recursive: true});
fs.writeFileSync(output, JSON.stringify(document, null, 2) + '\n');
console.log(`OpenAPI document written to ${output} (${Object.keys(document.paths).length} paths)`);
