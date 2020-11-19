import * as path from 'path';
import * as vscode from 'vscode';
import { getRelatedFiles } from './getRelatedFiles';

const openFileCommandId = 'relatedFiles.openFile';

export class RelatedFilesProvider implements vscode.TreeDataProvider<RelatedFile> {
  private _onDidChangeTreeData: vscode.EventEmitter<RelatedFile | undefined | null | void> = new vscode.EventEmitter<RelatedFile | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<RelatedFile | undefined | null | void> = this._onDidChangeTreeData.event;

  private _editedTogetherResults: Map<string, RelatedFile[]> = new Map();
  private _similarNamedResults: Map<string, RelatedFile[]> = new Map();

  constructor() {
    vscode.commands.registerCommand(openFileCommandId, (fileName) => {
      const filePath = path.join(vscode.workspace.workspaceFolders![0].uri.fsPath, fileName);
      vscode.workspace.openTextDocument(filePath)
        .then(document => vscode.window.showTextDocument(document));
    })
  }

  public refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  public getTreeItem(element: RelatedFile): vscode.TreeItem {
    return element;
  }

  public async getChildren(element?: RelatedFile): Promise<RelatedFile[]> {
    const filePath = vscode.window.activeTextEditor?.document.fileName;
    if (!filePath) { return Promise.resolve([]); }

    const config = vscode.workspace.getConfiguration("relatedFiles");

    let results: RelatedFile[] = [];
    if (config.editedTogether.enabled) {
      const numSuggestions = config.editedTogether.numberOfSuggestions;
      results = results.concat(this.getEditedTogetherResults(filePath, numSuggestions));
    }
    if (config.similarNames.enabled) {
      const numSuggestions = config.similarNames.numberOfSuggestions;
      results = results.concat(this.getSimilarNamedResults(filePath, numSuggestions));
    }

    return Promise.resolve(results);
  }

  private getEditedTogetherResults(filePath: string, numSuggestions: number): RelatedFile[] {
    if (this._editedTogetherResults.has(filePath)) {
      return this._editedTogetherResults.get(filePath)!;
    } else {
      this._editedTogetherResults.set(filePath, []);
      getRelatedFiles(filePath, numSuggestions)
        .then(relatedFiles => {
          const editedTogether = relatedFiles.map(file => new RelatedFile(file.fileName, file.weight));
          this._editedTogetherResults.set(filePath, editedTogether);
          this.refresh();
        });

      return [];
    }
  }

  private getSimilarNamedResults(filePath: string, numSuggestions: number): RelatedFile[] {
    if (this._similarNamedResults.has(filePath)) {
      return this._similarNamedResults.get(filePath)!;
    } else {
      this._similarNamedResults.set(filePath, []);

      const fileName = path.basename(filePath);
      const fileNameWithoutExt = fileName.split('.')[0];

      const filesExcludes = vscode.workspace.getConfiguration('files.exclude');
      const searchExcludes = vscode.workspace.getConfiguration('search.exclude');

      const filesExcludesArray = Object.keys(filesExcludes).filter(ex => filesExcludes[ex] === true);
      const searchExcludesArray = Object.keys(searchExcludes).filter(ex => searchExcludes[ex] === true); 

      const excludeArray = [...filesExcludesArray, ...searchExcludesArray];
      const excludeGlob = excludeArray.join(', ');
      const searchTimeoutInMs = vscode.workspace.getConfiguration("relatedFiles").similarNames.searchTimeout * 1000;

      const cancellationTokenSource = new vscode.CancellationTokenSource();
      const token = cancellationTokenSource.token;

      const timeoutId = setTimeout(() => cancellationTokenSource.cancel(), searchTimeoutInMs)
      
      vscode.workspace.findFiles(`**/${fileNameWithoutExt}.*`, excludeGlob, numSuggestions, token)
        .then(urls => urls.map(url => vscode.workspace.asRelativePath(url.fsPath)))
        .then(filePaths => {
          clearTimeout(timeoutId);
          const editedTogether = filePaths.map(filePath => new RelatedFile(filePath));
          this._similarNamedResults.set(filePath, editedTogether);
          this.refresh();
        });

      return [];
    }
  }
}

class RelatedFile extends vscode.TreeItem {
  constructor(
    public readonly fileName: string,
    public readonly weight?: number,
  ) {
    super(fileName, vscode.TreeItemCollapsibleState.None);
    this.label = path.basename(fileName);
    const desc = !this.weight ? fileName : `${this.fileName} - ${this.weight.toFixed(4)}`;
    this.tooltip = desc;
    this.description = desc;
    this.command = {
      title: 'Open file',
      command: openFileCommandId,
      arguments: [fileName]
    }
  }

  iconPath = {
    light: path.join(__filename, '..', '..', 'resources', 'light', 'dependency.svg'),
    dark: path.join(__filename, '..', '..', 'resources', 'dark', 'dependency.svg')
  };
}