export {ExecutorDO} from './ExecutorDO';

interface Env {
	EXECUTOR: DurableObjectNamespace;
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		let obj = env.EXECUTOR.get(env.EXECUTOR.idFromName('executor'));
		let resp = await obj.fetch(request.url);
		return resp;
	},
};
