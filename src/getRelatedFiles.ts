import { getFilesInCommit, getLastCommits } from "./GitInterface";
import { PriorityQueue } from "./PriorityQueue";

const REPEAT_MODIFIER_FACTOR = 1.5;
const COMMIT_BASE_FACTOR = 1;
const OLDER_COMMIT_WEIGHT_FACTOR = 0.9;

export async function getRelatedFiles(fileName: string, numFiles: number = 10): Promise<WeightedFile[]> {
    // Weigth of relationship - Inverse of number of files in the commit, adjusted for how old the commit is
    const fileWeights: Map<string, number> = new Map();
    // Modifier of the weight - Higher the more number of commits there are
    const fileModifierValues: Map<string, number> = new Map();

    const commits = await getLastCommits(fileName, 30);
    const filesPromises = commits.map(commitId => getFilesInCommit(commitId));
    const filesResponses = await Promise.all(filesPromises);

    let commitBaseWeight = COMMIT_BASE_FACTOR;
    filesResponses.forEach(files => {
        if (files.length > 100) { return; } // Ignore commits with more than 100 files

        const weight = commitBaseWeight / files.length;
        commitBaseWeight *= OLDER_COMMIT_WEIGHT_FACTOR; // Older commits weigh less that newer commits
        files.forEach(file => { setWeight(file, weight, fileWeights, fileModifierValues); });
    });

    const priorityQueue = new PriorityQueue<WeightedFile>((a, b) => a.weight > b.weight);
    for (const fileName of fileWeights.keys()) {
        priorityQueue.push({ fileName, weight: getWeight(fileName, fileWeights, fileModifierValues) });
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
    // The modifier is a multiplier
    fileModifierValues.set(fileName, fileModifierValues.has(fileName) ? fileModifierValues.get(fileName)! * REPEAT_MODIFIER_FACTOR : 1);
}

interface WeightedFile {
    fileName: string;
    weight: number;
}