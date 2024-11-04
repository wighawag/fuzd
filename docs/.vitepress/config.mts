import {defineConfig} from 'vitepress';
import typedocSidebar from '../packages/typedoc-sidebar.json';
import {pagefindPlugin} from 'vitepress-plugin-pagefind';

import {useSidebar} from 'vitepress-openapi';
import spec from '../public/openapi.json' assert {type: 'json'};

const sidebar = useSidebar({spec: spec as any, linkPrefix: '', tagLinkPrefix: '', defaultTag: ''});

type ListItem = {items?: ListItem[]; link?: string};
type List = ListItem[];

function removeSlashDocs(list: List) {
	for (const item of list) {
		recurseRemoveSlashDocs(item);
	}
	return list;
}

function recurseRemoveSlashDocs(item: ListItem) {
	if (item.link) {
		if (item.link?.startsWith('/docs/')) {
			item.link = item.link.replace('/docs/', '/');
		}
	}
	if (item.items) {
		for (const it of item.items) {
			recurseRemoveSlashDocs(it);
		}
	}
}

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
	vite: {
		plugins: [pagefindPlugin()],
	},
	title: 'FUZD',
	head: [
		[
			'script',
			{id: 'plausible'},
			`;(() => {
				if (location.hostname === 'fuzd.dev') {
					const plausible_script = document.createElement('script');
					plausible_script.setAttribute('data-domain','fuzd.dev');
					plausible_script.setAttribute('data-api','/stats/api/event');
					plausible_script.setAttribute('src','/stats/js/script.js');
					document.head.appendChild(plausible_script);
				}
			})()`,
		],
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
			{text: 'Getting Started', link: '/guide/getting-started/'},
			{text: 'API', link: '/api/get-api-publicKey.html'},
			{text: 'Packages', link: '/packages/'},
		],

		siteTitle: ' ',

		sidebar: [
			{
				text: 'Guide',
				items: [{text: 'Getting Started', link: '/guide/getting-started/'}],
			},
			{
				text: 'API',
				collapsed: true,
				items: [
					...sidebar.generateSidebarGroups({
						linkPrefix: '/api/',
					}),
				],
			},
			{
				text: 'Packages',
				link: '/packages/',
				collapsed: true,
				items: order(removeDuplicates(removeSlashDocs(typedocSidebar)), 'createExecutor'),
			},
		],

		socialLinks: [{icon: 'github', link: 'https://github.com/wighawag/fuzd'}],
	},
});
