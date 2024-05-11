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
import {displayExecutionBroadcasted, displayExecutionQueued} from '../display';
import {SchemaEIP1193Account} from 'fuzd-common';

const logger = logs('fuzd-cf-worker-admin-dashboard');

export function getAdminDashboard<Env extends Bindings = Bindings>(options: ServerOptions<Env>) {
	const tmp = new Hono<{Bindings: Env & {}}>()
		// TODO authentication
		.get('/queue', async (c) => {
			const config = c.get('config');
			const queue = await config.schedulerStorage.getQueueTopMostExecutions({limit: 100});
			const diff = await config.getTimeDiff(queue[0]?.chainId);
			const displayData = queue.map(displayExecutionQueued(diff));
			return c.html(
				<Layout>
					<Table data={displayData} />
				</Layout>,
			);
		})
		.get('/all-submissions', async (c) => {
			const config = c.get('config');
			const queue = await config.schedulerStorage.getAllExecutions({limit: 100});
			const diff = await config.getTimeDiff(queue[0]?.chainId);
			const displayData = queue.map(displayExecutionQueued(diff));
			return c.html(
				<Layout>
					<Table data={displayData} />
				</Layout>,
			);
		})
		.get('/account-submissions/:account', async (c) => {
			const config = c.get('config');
			const account = SchemaEIP1193Account.parse(c.req.param('account'));
			const queue = await config.schedulerStorage.getAccountSubmissions(account, {limit: 100});
			const diff = await config.getTimeDiff(queue[0]?.chainId);
			const displayData = queue.map(displayExecutionQueued(diff));
			return c.html(
				<Layout>
					<Table data={displayData} />
				</Layout>,
			);
		})
		.get('/account-archived-submissions/:account', async (c) => {
			const config = c.get('config');
			const account = SchemaEIP1193Account.parse(c.req.param('account'));
			const queue = await config.schedulerStorage.getAccountArchivedSubmissions(account, {limit: 100});
			const diff = await config.getTimeDiff(queue[0]?.chainId);
			const displayData = queue.map(displayExecutionQueued(diff));
			return c.html(
				<Layout>
					<Table data={displayData} />
				</Layout>,
			);
		})
		.get('/transactions', async (c) => {
			const config = c.get('config');
			const txs = await config.executorStorage.getPendingExecutions({limit: 100});
			console.log(txs);
			const displayData = txs.map(displayExecutionBroadcasted());
			console.log(displayData);
			return c.html(
				<Layout>
					<Table data={displayData} />
				</Layout>,
			);
		})
		.get('/archived-transactions', async (c) => {
			const config = c.get('config');
			const txs = await config.executorStorage.getArchivedBroadcastedExecutions({limit: 100});
			const displayData = txs.map(displayExecutionBroadcasted());
			return c.html(
				<Layout>
					<Table data={displayData} />
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
