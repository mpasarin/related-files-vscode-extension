import * as vscode from 'vscode';
import { RelatedFilesProvider } from './RelatedFilesProvider';

export function activate(context: vscode.ExtensionContext) {

	const relatedFilesProvider = new RelatedFilesProvider();

	vscode.window.onDidChangeActiveTextEditor(() => relatedFilesProvider.refresh());

	const treeDataProviderDisposable = vscode.window.registerTreeDataProvider(
		'relatedFiles',
		relatedFilesProvider
	);
	context.subscriptions.push(treeDataProviderDisposable);
}

export function deactivate() { }
