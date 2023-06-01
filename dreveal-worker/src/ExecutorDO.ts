interface Env {}

export class ExecutorDO implements DurableObject {
	constructor(protected state: DurableObjectState, protected env: Env) {}

	async fetch(request: Request): Promise<Response> {
		return new Response('Hello World');
	}
}
