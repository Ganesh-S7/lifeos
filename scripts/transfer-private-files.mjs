import { execFileSync } from "node:child_process";
import {
    existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const repository = fileURLToPath(new URL("../", import.meta.url));
export const privateDirectory = resolve(repository, ".lifeos-transfer");

export function privatePath(input) {
    const path = resolve(repository, input);
    if (dirname(path) !== privateDirectory || !basename(path) ||
        (existsSync(path) && lstatSync(path).isSymbolicLink()) ||
        !existsSync(privateDirectory) || lstatSync(privateDirectory).isSymbolicLink() ||
        realpathSync(privateDirectory) !== privateDirectory) {
        throw new Error("PRIVATE_ARTIFACT_PATH_REQUIRED");
    }
    return path;
}

export function assertPrivateExclusions() {
    for (const file of [".gitignore", ".vercelignore"]) {
        if (!readFileSync(join(repository, file), "utf8").split(/\r?\n/).includes("/.lifeos-transfer/")) {
            throw new Error("PRIVATE_ARTIFACT_EXCLUSION_REQUIRED");
        }
    }
    const tracked = execFileSync("git", [
        "-c", `safe.directory=${repository.replaceAll("\\", "/")}`, "ls-files", "--", ".lifeos-transfer/",
    ], { cwd: repository, encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    if (tracked.trim()) throw new Error("TRACKED_TRANSFER_ARTIFACTS");
}

export function preparePrivateDirectory() {
    assertPrivateExclusions();
    if (!existsSync(privateDirectory)) mkdirSync(privateDirectory, { mode: 0o700 });
    if (lstatSync(privateDirectory).isSymbolicLink() || realpathSync(privateDirectory) !== privateDirectory) {
        throw new Error("PRIVATE_ARTIFACT_PATH_REQUIRED");
    }
    if (process.platform === "win32") {
        const identity = execFileSync("whoami.exe", ["/user", "/fo", "csv", "/nh"], {
            encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
        });
        const sid = identity.match(/S-1-\d+(?:-\d+)+/)?.[0];
        if (!sid) throw new Error("PRIVATE_PERMISSIONS_REQUIRED");
        execFileSync("icacls.exe", [privateDirectory, "/inheritance:r", "/grant:r", `*${sid}:(OI)(CI)F`], {
            windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
        });
    }
}

export function readPrivateFile(input) {
    const path = privatePath(input);
    if (!statSync(path).isFile() || statSync(path).size > 20 * 1024 * 1024) throw new Error("INVALID_ARTIFACT_SIZE");
    return readFileSync(path, "utf8");
}

export function writePrivatePackage(input, value) {
    preparePrivateDirectory();
    // Exclusive creation: never silently replace a previously reviewed package.
    writeFileSync(privatePath(input), `${JSON.stringify(value, null, 2)}\n`, { flag: "wx", mode: 0o600 });
}
