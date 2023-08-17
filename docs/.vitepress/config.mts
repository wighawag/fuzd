import {defineConfig} from 'vitepress';
import typedocSidebar from '../api/typedoc-sidebar.json';
// import {fileURLToPath, URL} from 'node:url';

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
				items: typedocSidebar,
			},
		],

		socialLinks: [{icon: 'github', link: 'https://github.com/wighawag/fuzd'}],
	},
	base: '/fuzd/',
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