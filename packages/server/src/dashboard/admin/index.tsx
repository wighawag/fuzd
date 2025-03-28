/** @jsx jsx */
/** @jsxImportSource hono/jsx */
import {jsx} from 'hono/jsx';
import {Hono} from 'hono';
import {ServerOptions} from '../../types.js';
import {basicAuth} from 'hono/basic-auth';
import {logs} from 'named-logs';
import {Layout} from '../layout.js';
import {Table} from '../components/Table.js';
import {displayExecutionBroadcasted, displayScheduledExecutionQueued} from '../display/index.js';
import {assert} from 'typia';
import {String0x} from 'fuzd-common';
import {Env} from '../../env.js';

const logger = logs('fuzd-cf-worker-admin-dashboard');

export function getAdminDashboard<Bindings extends Env>(options: ServerOptions<Bindings>) {
	const tmp = new Hono<{Bindings: Bindings}>()
		// TODO authentication
		.get('/queue', async (c) => {
			const config = c.get('config');
			const queue = await config.schedulerStorage.getQueueTopMostExecutions({limit: 100});
			const diff = await config.getTimeDiff(queue[0]?.chainId);
			const displayData = await Promise.all(queue.map(displayScheduledExecutionQueued(diff, false, config)));
			return c.html(
				<Layout>
					<Table data={displayData} />
				</Layout>,
			);
		})
		.get('/queue-with-payload', async (c) => {
			const config = c.get('config');
			const queue = await config.schedulerStorage.getQueueTopMostExecutions({limit: 100});
			const diff = await config.getTimeDiff(queue[0]?.chainId);
			const displayData = await Promise.all(queue.map(displayScheduledExecutionQueued(diff, true, config)));
			return c.html(
				<Layout>
					<Table data={displayData} />
				</Layout>,
			);
		})
		.get('/all-submissions', async (c) => {
			const config = c.get('config');
			const queue = await config.schedulerStorage.getAllExecutions({limit: 100, order: 'DESC'});
			const diff = await config.getTimeDiff(queue[0]?.chainId);
			const displayData = await Promise.all(queue.map(displayScheduledExecutionQueued(diff, false, config)));
			return c.html(
				<Layout>
					<Table data={displayData} />
				</Layout>,
			);
		})
		.get('/account-submissions/:account', async (c) => {
			const config = c.get('config');
			const account = assert<String0x>(c.req.param('account'));
			const queue = await config.schedulerStorage.getAccountSubmissions(account, {limit: 100});
			const diff = await config.getTimeDiff(queue[0]?.chainId);
			const displayData = await Promise.all(queue.map(displayScheduledExecutionQueued(diff, false, config)));
			return c.html(
				<Layout>
					<Table data={displayData} />
				</Layout>,
			);
		})
		.get('/account-archived-submissions/:account', async (c) => {
			const config = c.get('config');
			const account = assert<String0x>(c.req.param('account'));
			const queue = await config.schedulerStorage.getAccountArchivedSubmissions(account, {limit: 100});
			const diff = await config.getTimeDiff(queue[0]?.chainId);
			const displayData = await Promise.all(queue.map(displayScheduledExecutionQueued(diff, false, config)));
			return c.html(
				<Layout>
					<Table data={displayData} />
				</Layout>,
			);
		})
		.get('/executions', async (c) => {
			const config = c.get('config');
			const txs = await config.executorStorage.getPendingExecutions({limit: 100});
			const displayData = await Promise.all(txs.map(displayExecutionBroadcasted(config)));
			return c.html(
				<Layout>
					<Table data={displayData} />
				</Layout>,
			);
		})
		.get('/all-executions', async (c) => {
			const config = c.get('config');
			const txs = await config.executorStorage.getAllExecutions({limit: 100, order: 'DESC'});
			const displayData = await Promise.all(txs.map(displayExecutionBroadcasted(config)));
			return c.html(
				<Layout>
					<Table data={displayData} />
				</Layout>,
			);
		});

	const authenticated = new Hono<{Bindings: Env & {}}>().use(
		basicAuth({
			verifyUser: (username, password, c) => username === 'admin' && password === c.env.TOKEN_ADMIN,
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
