import { promises as fs } from 'fs';
import path from 'path';

const SRC_DIR = path.resolve('src');
const DIST_DIR = path.resolve('dist');

async function copyHtmlFiles(srcDir, distDir) {
	const entries = await fs.readdir(srcDir, { withFileTypes: true });
	let createdSomething = false;

	for (const entry of entries) {
		const srcPath = path.join(srcDir, entry.name);
		const distPath = path.join(distDir, entry.name);

		if (entry.isDirectory()) {
			// Recurse into directory; only create distDir if child created something
			const childCreated = await copyHtmlFiles(srcPath, distPath);
			if (childCreated) {
				await fs.mkdir(distDir, { recursive: true });
				createdSomething = true;
			}
		} else if (entry.isFile() && entry.name.endsWith('.html')) {
			// Ensure the destination dir exists only when we actually copy a file
			await fs.mkdir(distDir, { recursive: true });
			await fs.copyFile(srcPath, distPath);
			console.log(`Copied: ${srcPath} -> ${distPath}`);
			createdSomething = true;
		}
	}

	return createdSomething;
}

copyHtmlFiles(SRC_DIR, DIST_DIR)
	.then((created) => {
		if (created) {
			console.log('HTML files copied successfully.');
		} else {
			console.log('No HTML files found. No folders were created.');
		}
	})
	.catch((err) => {
		console.error('Error copying HTML files:', err);
		process.exit(1);
	});
