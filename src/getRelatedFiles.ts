import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { getFilesInCommit, getLastCommits } from "./GitInterface";
import { PriorityQueue } from "./PriorityQueue";

const COMMIT_BASE_FACTOR = 1;

export async function getRelatedFiles(filePath: string, numFiles: number = 10): Promise<WeightedFile[]> {
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
        commitBaseWeight *= config.heuristics.olderCommitModifierFactor; // Older commits weigh less that newer commits
        files.forEach(file => { setWeight(file, weight, fileWeights, fileModifierValues); });
    });

    const priorityQueue = new PriorityQueue<WeightedFile>((a, b) => a.weight > b.weight);
    for (const relatedFilePath of fileWeights.keys()) {
        // Filter by existing file - Removed files should not show up
        const absoluteRelatedFilePath = path.join(vscode.workspace.workspaceFolders![0].uri.fsPath, relatedFilePath);
        if (!fs.existsSync(absoluteRelatedFilePath)) { continue; }

        // Remove the same file from the results
        if (!path.relative(filePath, absoluteRelatedFilePath)) { continue; }

        priorityQueue.push({ fileName: relatedFilePath, weight: getWeight(relatedFilePath, fileWeights, fileModifierValues) });
    }

    const result = [];
    for (let i = 0; i < numFiles && !priorityQueue.isEmpty(); i++) {
        result.push(priorityQueue.pop());
    }
    return result;
}

function getWeight(fileName: string, fileWeights: Map<string, number>, fileModifierValues: Map<string, number>) {
    return fileWeights.get(fileName)! * fileModifierValues.get(fileName)!;
}

function setWeight(fileName: string, weight: number, fileWeights: Map<string, number>, fileModifierValues: Map<string, number>) {
    // Weight keeps increasing linearly
    fileWeights.set(fileName, fileWeights.has(fileName) ? fileWeights.get(fileName)! + weight : weight);
    const repeatModifierFactor = vscode.workspace.getConfiguration("relatedFiles").editedTogether.heuristics.repeatModifierFactor;
    // The modifier is a multiplier
    fileModifierValues.set(fileName, fileModifierValues.has(fileName) ? fileModifierValues.get(fileName)! * repeatModifierFactor : 1);
}

interface WeightedFile {
    fileName: string;
    weight: number;
}