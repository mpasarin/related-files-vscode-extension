import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { getFilesInCommit, getLastCommits } from "./GitInterface";
import { PriorityQueue } from "./PriorityQueue";

const COMMIT_BASE_FACTOR = 1;
const OLDER_COMMIT_MODIFIER_FACTOR = 0.9; // Always <= 1
const REPEAT_MODIFIER_FACTOR = 1.5; // Always >= 1

interface WeightedFile {
    fileName: string;
    weight: number;
}

export async function getRelatedFiles(filePath: string, numFiles: number): Promise<WeightedFile[]> {
    const config = vscode.workspace.getConfiguration("relatedFiles").editedTogether;

    // Weigth of relationship - Inverse of number of files in the commit, adjusted for how old the commit is
    const fileWeights: Map<string, number> = new Map();
    // Modifier of the weight - Higher the more number of commits there are
    const fileModifierValues: Map<string, number> = new Map();

    const commits = await getLastCommits(filePath, config.numberOfCommits);
    const filesPromises = commits.map(commitId => getFilesInCommit(commitId));
    const filesResponses = await Promise.all(filesPromises);

    let commitBaseWeight = COMMIT_BASE_FACTOR;
    filesResponses.forEach(files => {
        if (files.length > config.maxFilesPerCommit) { return; }

        const weight = commitBaseWeight / files.length;
        commitBaseWeight *= OLDER_COMMIT_MODIFIER_FACTOR;
        files.forEach(file => { addWeight(file, weight, fileWeights, fileModifierValues); });
    });

    const priorityQueue = new PriorityQueue<WeightedFile>((a, b) => a.weight > b.weight);
    for (const relatedFilePath of fileWeights.keys()) {
        priorityQueue.push({ fileName: relatedFilePath, weight: getWeight(relatedFilePath, fileWeights, fileModifierValues) });
    }

    const results = [];
    while (results.length < numFiles && !priorityQueue.isEmpty()) {
        const nextResult = priorityQueue.pop();
        const absolutePath = getAbsolutePath(nextResult.fileName);        
                
        // Remove the same file from the results
        if (!path.relative(filePath, absolutePath)) { continue; }

        // Filter by existing file - Removed files should not show up
        if (!fs.existsSync(absolutePath)) { continue; }

        results.push(nextResult);
    }

    return results;
}

function getAbsolutePath(relativePath: string): string {
    return path.join(vscode.workspace.workspaceFolders![0].uri.fsPath, relativePath);
}

function getWeight(fileName: string, fileWeights: Map<string, number>, fileModifierValues: Map<string, number>) {
    return fileWeights.get(fileName)! * fileModifierValues.get(fileName)!;
}

function addWeight(fileName: string, weight: number, fileWeights: Map<string, number>, fileModifierValues: Map<string, number>) {
    // Weight keeps increasing linearly
    fileWeights.set(fileName, fileWeights.has(fileName) ? fileWeights.get(fileName)! + weight : weight);
    // The modifier is a multiplier
    fileModifierValues.set(fileName, fileModifierValues.has(fileName) ? fileModifierValues.get(fileName)! * REPEAT_MODIFIER_FACTOR : 1);
}