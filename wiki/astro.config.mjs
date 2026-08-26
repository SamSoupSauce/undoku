// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
	site: 'https://samsoupsauce.github.io',
	base: '/undoku/wiki',
	integrations: [
		starlight({
			title: 'Undoku Wiki',
			description: 'High-Performance Sudoku Generator, Difficulty Evaluator, & Web Engine',
			customCss: ['./src/styles/custom.css'],
			social: [
				{ icon: 'github', label: 'GitHub', href: 'https://github.com/SamSoupSauce/undoku' },
			],
			sidebar: [
				{
					label: 'Getting Started',
					items: [
						{ label: 'Overview & Features', slug: 'guides/quickstart' },
					],
				},
				{
					label: 'Core Architecture',
					items: [
						{ label: 'Fast PRNG & Generator', slug: 'guides/architecture' },
						{ label: 'Deduction & Carving Engine', slug: 'guides/solver' },
					],
				},
				{
					label: 'Difficulty Evaluation',
					items: [
						{ label: 'Elimination Metrics & Scoring', slug: 'guides/difficulty' },
					],
				},
				{
					label: 'Database & Persistence',
					items: [
						{ label: 'SQLite Database & Storage', slug: 'guides/database' },
					],
				},
				{
					label: 'API Reference',
					items: [
						{ label: 'REST API Specification', slug: 'reference/api' },
					],
				},
			],
		}),
	],
});
