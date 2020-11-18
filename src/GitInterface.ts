import * as child_process from 'child_process';
import * as util from 'util';
import * as vscode from 'vscode';
import { GitExtension } from '../types/git';

const execFile = util.promisify(child_process.execFile);

function getGitCommand(): string {
    try {
        const vscodeGit = vscode.extensions.getExtension<GitExtension>("vscode.git");

        if (vscodeGit?.exports.enabled) {
            return vscodeGit.exports.getAPI(1).git.path;
        }
    } catch (err) { /* no op */ }

    return "git";
}

function runCommand(cmd: string, args: string[], cwd: string): Promise<string> {
    return execFile(cmd, args, { cwd }).then(({ stdout, stderr }) => {
        // if (!!stderr) { throw new Error('Command had errors')}
        return stdout;
    })
}

export function getLastCommits(path: string, numCommits: number): Promise<string[]> {
    const command = getGitCommand();
    const relativePath = vscode.workspace.asRelativePath(path);
    const cwd = vscode.workspace.workspaceFolders![0].uri.fsPath;
    const args = ['log', '--format=%H', `-n ${numCommits}`, '--', relativePath];
    return runCommand(command, args, cwd)
        .then(out => {
            return out.trim().split('\n');
        });
}

/**
 * Returns relative path files touched by the commit
 */
export function getFilesInCommit(commitId: string): Promise<string[]> {
    const command = getGitCommand();
    const cwd = vscode.workspace.workspaceFolders![0].uri.fsPath;
    const args = ['show', '--format=%n', '--name-only', commitId];
    return runCommand(command, args, cwd).then(out => out.trim().split('\n'));
}