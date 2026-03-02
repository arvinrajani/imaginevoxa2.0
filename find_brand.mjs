import fs from 'fs';
import path from 'path';

function searchDirectory(dir: string, currentPath: string = '') {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            searchDirectory(fullPath, path.join(currentPath, file));
        } else if (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx')) {
            const content = fs.readFileSync(fullPath, 'utf8');
            if (content.includes("from('brands')") && content.includes(".insert(")) {
                console.log(`Found possible brand insert in ${fullPath}`);
            }
            if (content.includes("from(\"brands\")") && content.includes(".insert(")) {
                console.log(`Found possible brand insert in ${fullPath}`);
            }
        }
    }
}

searchDirectory('./app');
searchDirectory('./components');
