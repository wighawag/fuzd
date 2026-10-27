/**
 * Publish-time invariants for every publishable package (adapted from waxdb).
 *
 * npm provenance (what trusted publishing stamps on every release) verifies that
 * `repository.url` in the published package.json matches the repository the OIDC
 * token came from, and rejects the publish if it does not. Nothing in the build,
 * the tests or the type checker has an opinion about that field, so it is checked
 * here, before `changeset publish` runs, instead of by npm after the version bump.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXPECTED_URL = 'git+https://github.com/wighawag/fuzd.git';

const problems = [];
let checked = 0;

for (const group of ['packages', 'platforms']) {
	const base = path.join(root, group);
	if (!fs.existsSync(base)) continue;
	for (const entry of fs.readdirSync(base)) {
		const dir = `${group}/${entry}`;
		const manifestPath = path.join(root, dir, 'package.json');
		if (!fs.existsSync(manifestPath)) continue;
		const pkg = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
		const fail = (message) => problems.push(`${pkg.name} (${dir}): ${message}`);

		// a private package is a deployment, not a release
		if (pkg.private) continue;
		checked++;

		if (!pkg.repository) {
			fail('no "repository" field. npm provenance requires one and will reject the publish');
		} else {
			if (pkg.repository.url !== EXPECTED_URL) {
				fail(`repository.url is ${JSON.stringify(pkg.repository.url)}, expected "${EXPECTED_URL}"`);
			}
			if (pkg.repository.directory !== dir) {
				fail(`repository.directory is ${JSON.stringify(pkg.repository.directory)}, expected "${dir}"`);
			}
		}
		if (!pkg.license) fail('no "license" field');
		// a scoped package defaults to restricted, which is not what any of these want
		if (pkg.name.startsWith('@') && pkg.publishConfig?.access !== 'public') {
			fail('scoped package without publishConfig.access "public": npm would publish it restricted');
		}
		if (!pkg.name.startsWith('@fuzd/') && pkg.name !== 'fuzd') {
			fail('published packages are @fuzd/* (or the CLI, fuzd)');
		}
	}
}

if (problems.length > 0) {
	console.error('packaging check failed:\n');
	for (const problem of problems) console.error(`  - ${problem}`);
	console.error('');
	process.exit(1);
}
console.log(`packaging check passed (${checked} publishable packages)`);
