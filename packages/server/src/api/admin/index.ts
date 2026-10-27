import {Hono} from 'hono';
import {ServerOptions} from '../../types.js';
import {basicAuth} from 'hono/basic-auth';
import {logs} from 'named-logs';
import {createErrorObject} from '../../utils/response.js';
import {FUZDLogger} from 'fuzd-common';
import {setChainOverride, setup} from '../../setup.js';
import {Env} from '../../env.js';
import {z} from 'zod';
import {validate} from '../../validation.js';
import {
	AccountParamSchema,
	ChainIdAccountSlotParamSchema,
	ChainIdParamSchema,
	FeesSchema,
	IntegerStringSchema,
	OptionalChainIdParamSchema,
	schemaFor,
} from '../../schemas/index.js';

const logger = <FUZDLogger>logs('fuzd-cf-worker-admin-api');

export function getAdminAPI<Bindings extends Env>(options: ServerOptions<Bindings>) {
	const {getEnv} = options;
	const tmp = new Hono<{Bindings: Bindings}>()
		.use(setup({serverOptions: options}))

		// TODO authentication
		.get('/queue', async (c) => {
			try {
				const config = c.get('config');
				const queue = await config.schedulerStorage.getQueueTopMostExecutions({limit: 100});
				return c.json({success: true as const, queue}, 200);
			} catch (err) {
				return c.json(createErrorObject(err), 500);
			}
		})
		.get('/account-submissions/:account', validate('param', AccountParamSchema), async (c) => {
			try {
				const config = c.get('config');
				const {account} = c.req.valid('param');
				const queue = await config.schedulerStorage.getAccountSubmissions(account, {limit: 1000});
				return c.json({success: true as const, queue}, 200);
			} catch (err) {
				return c.json(createErrorObject(err), 500);
			}
		})
		.get('/executions', async (c) => {
			try {
				const config = c.get('config');
				const txs = await config.executorStorage.getPendingExecutions({limit: 100});
				return c.json({success: true as const, transactions: txs}, 200);
			} catch (err) {
				return c.json(createErrorObject(err), 500);
			}
		})
		.get('/all-executions', async (c) => {
			try {
				const config = c.get('config');
				const txs = await config.executorStorage.getAllExecutions({limit: 100, order: 'DESC'});
				return c.json({success: true as const, transactions: txs}, 200);
			} catch (err) {
				return c.json(createErrorObject(err), 500);
			}
		})
		.get('/test/:message', async (c) => {
			try {
				const message = c.req.param('message');
				logger.info(message);
				return c.json({success: true as const, message}, 200);
			} catch (err) {
				return c.json(createErrorObject(err), 500);
			}
		});

	const authenticated = new Hono<{Bindings: Env & {}}>()
		.use(
			basicAuth({
				verifyUser: (username, password, c) => {
					const env = getEnv(c);
					return username === 'admin' && password === (env as any).TOKEN_ADMIN; // TODO remove any
				},
			}),
		)
		// .get('/clear', async (c) => {
		// 	try {
		// 		const config = c.get('config');
		// 		await config.executorStorage.clear();
		// 		await config.schedulerStorage.clear();
		// 		return c.json({success: true}, 200);
		// 	} catch (err) {
		// 		return c.json(createErrorObject(err), 500);
		// 	}
		// })
		.get('/setup', async (c) => {
			try {
				const config = c.get('config');
				await config.executorStorage.setup();
				await config.schedulerStorage.setup();
				return c.json({success: true}, 200);
			} catch (err) {
				return c.json(createErrorObject(err), 500);
			}
		})
		.get('/chainConfiguration/:chainId', validate('param', ChainIdParamSchema), async (c) => {
			try {
				const config = c.get('config');
				const {chainId} = c.req.valid('param');

				const chainConfiguration = await config.executorStorage.getChainConfiguration(chainId);
				return c.json(
					{
						success: true as const,
						chainConfiguration,
					},
					200,
				);
			} catch (err) {
				return c.json(createErrorObject(err), 500);
			}
		})
		.post(
			'/updateExpectedGasPrice/:chainId',
			validate('param', ChainIdParamSchema),
			validate('json', schemaFor<{value: string}>()(z.object({value: z.string()}))),
			async (c) => {
				try {
					const config = c.get('config');
					const {chainId} = c.req.valid('param');
					const timestamp = Math.floor(Date.now() / 1000);

					const {value} = c.req.valid('json');

					if (BigInt(value) > 0n) {
						const paymentAccount = config.paymentAccount;
						if (!paymentAccount) {
							return c.json(
								{
									success: false as const,
									errors: ['Payment account not configured'],
								},
								200,
							);
						}

						const broadcasterInfo = await config.executor.getRemoteAccount(chainId, paymentAccount);
						const balance = await config.chainProtocols[chainId].getBalance(broadcasterInfo.address);
						if (balance < BigInt('1000000000000000000')) {
							return c.json({
								success: false as const,
								// TODO config minimum balance per chain
								errors: [`paymentAccount's remote account (${broadcasterInfo.address}) below 1 Native token`],
							});
						}
					}

					const chainConfiguration = await config.executorStorage.updateExpectedWorstCaseGasPrice(
						chainId,
						timestamp,
						BigInt(value),
					);
					return c.json(
						{
							success: true as const,
							chainConfiguration,
						},
						200,
					);
				} catch (err) {
					return c.json(createErrorObject(err), 500);
				}
			},
		)

		.post(
			'/deleteFinalizedPendingExecutions/:chainId?',
			validate('param', OptionalChainIdParamSchema),
			validate('json', schemaFor<{upTo?: number}>()(z.object({upTo: z.number().optional()}))),
			async (c) => {
				try {
					const config = c.get('config');
					const {chainId} = c.req.valid('param');

					const timestamp = Math.floor(Date.now() / 1000);

					const {upTo} = c.req.valid('json');

					await config.executorStorage.deleteFinalizedPendingExecutions({chainId, upTo: upTo || timestamp - 24 * 3600});

					return c.json(
						{
							success: true as const,
						},
						200,
					);
				} catch (err) {
					return c.json(createErrorObject(err), 500);
				}
			},
		)
		.post(
			'/deleteFinalizedScheduledExecutions/:chainId?',
			validate('param', OptionalChainIdParamSchema),
			validate('json', schemaFor<{upTo?: number}>()(z.object({upTo: z.number().optional()}))),
			async (c) => {
				try {
					const config = c.get('config');
					const {chainId} = c.req.valid('param');

					const timestamp = Math.floor(Date.now() / 1000);

					const {upTo} = c.req.valid('json');

					await config.schedulerStorage.deleteFinalizedScheduledExecutions({
						chainId,
						upTo: upTo || timestamp - 24 * 3600,
					});

					return c.json(
						{
							success: true as const,
						},
						200,
					);
				} catch (err) {
					return c.json(createErrorObject(err), 500);
				}
			},
		)
		.post('/updateFees/:chainId', validate('param', ChainIdParamSchema), validate('json', FeesSchema), async (c) => {
			try {
				const config = c.get('config');
				const {chainId} = c.req.valid('param');
				const timestamp = Math.floor(Date.now() / 1000);
				const chainConfiguration = await config.executorStorage.updateFees(chainId, timestamp, c.req.valid('json'));
				return c.json(
					{
						success: true as const,
						chainConfiguration,
					},
					200,
				);
			} catch (err) {
				return c.json(createErrorObject(err), 500);
			}
		})
		.get(
			'/setChainOverride/:chainId/:chainOverride',
			validate(
				'param',
				schemaFor<{chainId: string; chainOverride: string}>()(
					z.object({chainId: IntegerStringSchema, chainOverride: z.string()}),
				),
			),
			async (c) => {
				if ((c.env as any).DEV === 'true') {
					const {chainId} = c.req.valid('param');
					const {chainOverride} = c.req.valid('param');
					setChainOverride(chainId, chainOverride);
					return c.json({success: true as const}, 200);
				} else {
					return c.json({success: false as const}, 500);
				}
			},
		)
		.get('/paymentAccountBroadcaster', async (c) => {
			try {
				const config = c.get('config');

				return c.json(
					{
						success: true as const,
						paymentAccountBroadcaster: config.paymentAccount
							? config.account.deriveForAddress(config.paymentAccount)
							: null,
					},
					200,
				);
			} catch (err) {
				return c.json(createErrorObject(err), 500);
			}
		})
		.post('/archiveSubmission/:chainId/:account/:slot', validate('param', ChainIdAccountSlotParamSchema), async (c) => {
			try {
				const config = c.get('config');
				const {chainId, account, slot} = c.req.valid('param');
				const execution = await config.schedulerStorage.getQueuedExecution({chainId, account, slot});
				if (execution) {
					await config.schedulerStorage.archiveExecution(execution);
					return c.json(
						{
							success: true as const,
						},
						200,
					);
				} else {
					return c.json(
						{
							success: false as const,
						},
						200,
					);
				}
			} catch (err) {
				return c.json(createErrorObject(err), 500);
			}
		});

	const app = new Hono<{Bindings: Env & {}}>().route('/', tmp).route('/', authenticated);

	return app;
}
