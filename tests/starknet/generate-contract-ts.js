import fs from 'node:fs';
import path from 'node:path';
import {extractContractHashes, formatSpaces} from 'strk/utils';

const args = process.argv.slice(2);

const tsArtifactsFolder = args[0] || 'ts-artifacts';
const targetFolder = args[1] || 'target';

function readJSON(filePath) {
	return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function parseArtifacts(targetFolder) {
	const packages = {};
	const folders = fs.readdirSync(targetFolder);
	for (const folder of folders) {
		const folderPath = path.join(targetFolder, folder);
		const folderStats = fs.statSync(folderPath);
		if (folderStats.isDirectory()) {
			const files = fs.readdirSync(folderPath);
			for (const file of files) {
				const filePath = path.join(folderPath, file);
				const stats = fs.statSync(filePath);
				if (!stats.isDirectory() && file.endsWith('.starknet_artifacts.json')) {
					const name = file.replace('.starknet_artifacts.json', '');
					const data = readJSON(filePath);

					packages[name] = {target: folder, data};
				}
			}
		}
	}
	return packages;
}

const packages = parseArtifacts(targetFolder);

for (const pakcageName of Object.keys(packages)) {
	const pkg = packages[pakcageName];
	for (const contract of pkg.data.contracts) {
		const contractName = contract.contract_name;
		const contract_package_name = contract.package_name;
		const contract_module_path = contract.module_path;
		const contract_id = contract.id;

		const sierraPath = contract.artifacts['sierra'];
		const casmPath = contract.artifacts['casm'];
		const sierra = readJSON(path.join(targetFolder, pkg.target, sierraPath));
		const casm = readJSON(path.join(targetFolder, pkg.target, casmPath));

		const {classHash, compiledClassHash} = extractContractHashes({
			contract: sierra,
			casm: casm,
		});

		const artifact = {
			sierra_program: sierra.sierra_program,
			contract_class_version: sierra.contract_class_version,
			entry_points_by_type: sierra.entry_points_by_type,
			abi: formatSpaces(JSON.stringify(sierra.abi)),
			compiled_class_hash: compiledClassHash,
			class_hash: classHash,
		};

		console.log(`${contractName}`, JSON.stringify(artifact));

		fs.mkdirSync(tsArtifactsFolder, {recursive: true});
		fs.writeFileSync(
			path.join(tsArtifactsFolder, `${contractName}.ts`),
			`export default  ${JSON.stringify(artifact, null, 2)} as  const;`,
		);
	}
}
