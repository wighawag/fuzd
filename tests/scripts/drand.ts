import {timelockDecrypt, HttpChainClient, roundTime, Buffer, testnetClient, mainnetClient, roundAt} from 'tlock-js';
async function main() {
	const drandChainInfo = await mainnetClient().chain().info();
	const args = process.argv.slice(2);
	const timeQueriedStr = args[0];
	let timeQueried = Number(timeQueriedStr);
	if (timeQueried < 10000000000) {
		timeQueried *= 1000;
	} else {
		console.log(`assuming you are using milliseconds`);
	}
	const round = roundAt(timeQueried, drandChainInfo);
	const time = roundTime(drandChainInfo, round);
	console.log({round, time: Math.floor(time / 1000)});
}
main();
