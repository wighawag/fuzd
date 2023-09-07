import {defineConfig} from 'vitepress';
import typedocSidebar from '../api/typedoc-sidebar.json';
// import {fileURLToPath, URL} from 'node:url';

function order(arr: any, startWith?: string) {
	return arr.sort((a,b) => {
		if (startWith) {
			if (a.text  === startWith) {
				return -1;
			}
			if (b.text  === startWith) {
				return 1;
			}
		}
		if (a <b) {
			return -1;
		}
		if (a > b) {
			return 1;
		}
		return 0;
	})
}

function removeDuplicates(arr: any) {
	const newArray: any[] = [];
	const dict = {};
	for (const elem of arr) {
		const id = elem.text;
		if (!dict[id]) {
			dict[id] = true;
			newArray.push(elem);
		}
	}

	return newArray;
}

// https://vitepress.dev/reference/site-config
export default defineConfig({
	title: 'FUZD',
	description: 'Delayed and Blindfolded Execution',
	themeConfig: {
		// https://vitepress.dev/reference/default-theme-config
		logo: {dark: '/logo-white.svg', light: '/logo.svg'},
		nav: [
			{text: 'Home', link: '/'},
			{text: 'Examples', link: '/examples'},
			{text: 'API', link: '/api/'},
		],

		siteTitle: ' ',

		sidebar: [
			{
				text: 'Examples',
				items: [
					// {text: 'Markdown Examples', link: '/markdown-examples'},
					{text: 'Client Examples', link: '/examples'},
				],
			},
			{
				text: 'API',
				link: '/api/',
				items: order(removeDuplicates(typedocSidebar), "createExecutor"),
			},
		],

		socialLinks: [{icon: 'github', link: 'https://github.com/wighawag/fuzd'}],
	},
	// base: '/fuzd/',
	// vite: {
	// 	resolve: {
	// 		alias: [
	// 			{
	// 				find: /^.*\/VPNavBarTitle\.vue$/,
	// 				replacement: fileURLToPath(new URL('./theme/components/CustomNavBarTitle.vue', import.meta.url)),
	// 			},
	// 		],
	// 	},
	// },
});
