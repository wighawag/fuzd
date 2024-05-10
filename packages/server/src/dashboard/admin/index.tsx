/** @jsx jsx */
/** @jsxImportSource hono/jsx */
import {jsx} from 'hono/jsx';
import {Hono} from 'hono';
import {Bindings} from 'hono/types';
import {ServerOptions} from '../../types';
import {basicAuth} from 'hono/basic-auth';
import {logs} from 'named-logs';
import {Layout} from '../layout';
import {Table} from '../components/Table';

const logger = logs('fuzd-cf-worker-admin-dashboard');

export function getAdminDashboard<Env extends Bindings = Bindings>(options: ServerOptions<Env>) {
	const tmp = new Hono<{Bindings: Env & {}}>()
		// TODO authentication
		.get('/queue', async (c) => {
			const config = c.get('config');

			const queue = await config.schedulerStorage.getQueueTopMostExecutions({limit: 100});

			if (queue.length == 0) {
				return c.html(<Layout>Nothing to see</Layout>);
			}

			let diff: number = 0;
			const {provider} = config.chainConfigs[queue[0].chainId];
			const virtualTimestamp = await config.time.getTimestamp(provider);
			const timestamp = Math.floor(Date.now() / 1000);
			diff = virtualTimestamp - timestamp;
			console.log({virtualTimestamp, timestamp, diff: diff / 3600});

			const simple = queue.map((v) => ({
				account: v.account,
				chainId: v.chainId,
				slot: v.slot,
				type: v.type,
				broadcasted: v.broadcasted.toString(),
				checkinTime: new Date(v.checkinTime * 1000 - diff * 1000).toLocaleString(),
				timingType: v.timing.type,
				maxFeePerGas: v.maxFeePerGas,
				paymentReserve: v.paymentReserve || 'undefined',
				retries: v.retries || 0,
			}));

			return c.html(
				<Layout>
					<Table data={simple} />
				</Layout>,
			);
		});

	const authenticated = new Hono<{Bindings: Env & {}}>().use(
		basicAuth({
			verifyUser: (username, password, c) => {
				return username === 'admin' && password === c.env.TOKEN_ADMIN;
			},
		}),
	);

	const app = new Hono<{Bindings: Env & {}}>().route('/', tmp).route('/', authenticated);

	return app;
}

// const Layout: FC = (props) => {
//   return (
//     <html>
//       <body>{props.children}</body>
//     </html>
//   )
// }

// const Top: FC<{ messages: string[] }> = (props: { messages: string[] }) => {
//   return (
//     <Layout>
//       <h1>Hello Hono!</h1>
//       <ul>
//         {props.messages.map((message) => {
//           return <li>{message}!!</li>
//         })}
//       </ul>
//     </Layout>
//   )
// }
