import DefaultTheme from 'vitepress/theme';
import './custom.css';
import MyLayout from './MyLayout.vue';
import {theme, useOpenapi, useTheme} from 'vitepress-openapi';
import 'vitepress-openapi/dist/style.css';
import spec from '../../public/openapi.json' assert {type: 'json'};

export default {
	...DefaultTheme,
	// override the Layout with a wrapper component that
	// injects the slots
	Layout: MyLayout,
	async enhanceApp({app, router, siteData}) {
		// Set the OpenAPI specification.
		const openapi = useOpenapi({
			spec,
		});

		// Does not work
		useTheme({
			requestBody: {
				// Set the default schema view.
				defaultView: 'schema', // schema or contentType
			},
			spec: {
				defaultTag: 'TODO Custom Default Tag',
				defaultTagDescription: 'TODO Custom Default Tag Description',
				// showPathsSummary: false, // <-- Add this
				// groupByTags: false, // <-- Also maybe this
			},
		});

		// Use the theme.
		theme.enhanceApp({app, openapi});
	},
};
