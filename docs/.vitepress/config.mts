import {defineConfig} from 'vitepress';
import typedocSidebar from '../api/typedoc-sidebar.json';
// import {fileURLToPath, URL} from 'node:url';

function order(arr: any, startWith?: string) {
	return arr.sort((a, b) => {
		if (startWith) {
			if (a.text === startWith) {
				return -1;
			}
			if (b.text === startWith) {
				return 1;
			}
		}
		if (a < b) {
			return -1;
		}
		if (a > b) {
			return 1;
		}
		return 0;
	});
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
	head: [
		['link', {rel: 'icon', href: '/pwa/favicon.svg', type: 'image/svg+xml'}],
		['link', {rel: 'icon', href: '/pwa/favicon.ico', sizes: 'any'}],
		['link', {rel: 'apple-touch-icon', href: '/pwa/apple-touch-icon.png'}],
		['link', {rel: 'manifest', href: '/pwa/manifest.webmanifest'}],
		['meta', {name: 'theme-color', content: '#00000'}],
		['meta', {name: 'mobile-web-app-capable', content: 'yes'}],
		['meta', {name: 'apple-mobile-web-app-capable', content: 'yes'}],
		['meta', {name: 'application-name', content: 'FUZD'}],
		['meta', {name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent'}],
		['meta', {name: 'apple-mobile-web-app-title', content: 'FUZD'}],
		['meta', {property: 'og:url', content: 'https://fuzd.dev'}],
		['meta', {property: 'og:type', content: 'website'}],
		['meta', {property: 'og:title', content: 'FUZD'}],
		[
			'meta',
			{
				property: 'og:description',
				content: 'Execute Delayed Transactions Without Knowing Their Content Until Execution Time.',
			},
		],
		['meta', {property: 'og:image', content: 'https://fuzd.dev/preview.png'}],
		['meta', {property: 'twitter:card', content: 'summary_large_image'}],
		['meta', {property: 'twitter:url', content: 'https://fuzd.dev'}],
		['meta', {property: 'twitter:title', content: 'FUZD'}],
		[
			'meta',
			{
				property: 'twitter:description',
				content: 'Execute Delayed Transactions Without Knowing Their Content Until Execution Time.',
			},
		],
		['meta', {property: 'twitter:image', content: 'https://fuzd.dev/preview.png'}],
		['meta', {property: 'twitter:image', content: ''}],
		['meta', {property: 'twitter:image', content: ''}],
		['meta', {property: 'twitter:image', content: ''}],
	],
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
				items: order(removeDuplicates(typedocSidebar), 'createExecutor'),
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
