import * as vscode from 'vscode';
import * as utils from './utils';

export async function createPanel(context: vscode.ExtensionContext, galleryFolder?: vscode.Uri) {
    const panel = vscode.window.createWebviewPanel(
        'gryc.gallery',
        `Image Gallery${galleryFolder ? ': ' + utils.getFilename(galleryFolder.path) : ''}`,
        vscode.ViewColumn.One,
        {
            enableScripts: true,
            retainContextWhenHidden: true,
        }
    );

    const imgPaths = await getImagePaths(galleryFolder);
    let pathsBySubFolders = utils.getPathsBySubFolders(imgPaths);
    pathsBySubFolders = sortPathsBySubFolders(pathsBySubFolders);

    panel.webview.html = getWebviewContent(context, panel.webview, pathsBySubFolders);

    return panel;
}

export async function getImagePaths(galleryFolder?: vscode.Uri) {
    const globPattern = utils.getGlob();
    const files = await vscode.workspace.findFiles(
        galleryFolder ? new vscode.RelativePattern(galleryFolder, globPattern) : globPattern
    );
    return files;
}

export function sortPathsBySubFolders(pathsBySubFolders: { [key: string]: Array<vscode.Uri> }): { [key: string]: Array<vscode.Uri> } {
    const config = vscode.workspace.getConfiguration('sorting.byPathOptions');
    const keys = [
        'localeMatcher',
        'sensitivity',
        'ignorePunctuation',
        'numeric',
        'caseFirst',
        'collation',
    ];
    const comparator = (a: string, b: string) => {
        return a.localeCompare(
            b,
            undefined,
            Object.fromEntries(keys.map(key => [key, config.get(key)]))
        );
    };

    const sortedResult: { [key: string]: Array<vscode.Uri> } = {};
    Object.keys(pathsBySubFolders).sort(comparator).forEach(
        subfolder => {
            sortedResult[subfolder] = pathsBySubFolders[subfolder].sort(
                (path1: vscode.Uri, path2: vscode.Uri) => comparator(path1.path, path2.path)
            );
        }
    );

    return sortedResult;
}

export function getWebviewContent(
    context: vscode.ExtensionContext,
    webview: vscode.Webview,
    pathsBySubFolders: { [key: string]: Array<vscode.Uri> },
) {
    const placeholderUrl = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'media', 'placeholder.jpg'));
    const imgHtml = Object.keys(pathsBySubFolders).map(
        folder => {
            return `
            <button id="${folder}" class="folder">
                <div id="${folder}-arrow" class="folder-arrow">⮟</div>
                <div id="${folder}-title" class="folder-title">${folder}</div>
            </button>
            <div id="${folder}-grid" class="grid">
                ${pathsBySubFolders[folder].map(img => {
                return `
                    <div class="image-container">
                        <img id="${img.path}" src="${placeholderUrl}" data-src="${webview.asWebviewUri(img)}" class="image lazy">
                        <div id="${img.path}-filename" class="filename">${utils.getFilename(img.path)}</div>
                    </div>
                    `;
            }).join('')}
            </div>
            `;
        }
    ).join('\n');

    const styleHref = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'media', 'gallery.css'));
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'media', 'gallery.js'));

    return (
        `<!DOCTYPE html>
		<html lang="en">
		<head>
			<meta charset="UTF-8">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${utils.nonce}'; img-src ${webview.cspSource} https:; style-src ${webview.cspSource};">
			<link href="${styleHref}" rel="stylesheet" />
			<title>Image Gallery</title>
		</head>
		<body>
            ${Object.keys(pathsBySubFolders).length === 0 ? '<p>No image found in this folder.</p>' : `${imgHtml}`}
			<script nonce="${utils.nonce}" src="${scriptUri}"></script>
		</body>
		</html>`
    );
}
