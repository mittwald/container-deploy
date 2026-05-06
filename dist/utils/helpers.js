import crypto from "crypto";
import fs from "fs/promises";
export const defaultPasswordLength = 32;
/**
 * Generates a random password of a given length. The password is generated from
 * the base64 alphabet.
 *
 * @param length The desired amount of characters
 * @returns The generated password
 */
export function generatePassword(length = defaultPasswordLength) {
    return crypto.randomBytes(length).toString("base64").substring(0, length);
}
const passwordAllowedSpecialChars = ["%", "_", "-", "+", "&"];
function randomInt(min, max) {
    return Math.floor(Math.random() * (max - 1) + min);
}
function getRandomSpecialCharacter() {
    return passwordAllowedSpecialChars[randomInt(0, passwordAllowedSpecialChars.length - 1)];
}
/**
 * Generates a random password of a given length with a specific amount of
 * special characters.
 *
 * @param length The desired amount of characters
 * @param amountSpecialChars The desired amount of special characters
 * @returns The generated password
 */
export function generatePasswordWithSpecialChars(length = defaultPasswordLength, amountSpecialChars = Math.floor(length / 8)) {
    const passwordCharacters = generatePassword(length).split("");
    for (let i = 0; i < amountSpecialChars; i++) {
        passwordCharacters[randomInt(1, passwordCharacters.length - 1)] =
            getRandomSpecialCharacter();
    }
    return passwordCharacters.join("");
}
/**
 * Represents a duration of time.
 *
 * This class represents a duration of time and offers utility methods around
 * this.
 */
export class Duration {
    constructor(milliseconds) {
        this.milliseconds = milliseconds;
    }
    static fromZero() {
        return new Duration(0);
    }
    static fromMilliseconds(milliseconds) {
        return new Duration(milliseconds);
    }
    static fromSeconds(seconds) {
        return new Duration(seconds * 1000);
    }
    get seconds() {
        return this.milliseconds / 1000;
    }
    from(referenceDate) {
        return new Date(referenceDate.getTime() + this.milliseconds);
    }
    fromNow() {
        return this.from(new Date());
    }
    add(other) {
        return new Duration(this.milliseconds + other.milliseconds);
    }
    compare(other) {
        return this.milliseconds - other.milliseconds;
    }
    toString() {
        if (this.milliseconds > 1000) {
            return `${Math.round(this.seconds)}s`;
        }
        return `${this.milliseconds}ms`;
    }
}
export async function waitUntil(tester, timeout = Duration.fromSeconds(600)) {
    let waited = Duration.fromZero();
    while (waited.compare(timeout) < 0) {
        const result = await tester();
        if (result) {
            return result;
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
        waited = waited.add(Duration.fromSeconds(1));
    }
    throw new Error(`expected condition was not reached after ${timeout.toString()}`);
}
/**
 * Quickly checks if an error is a "file not found" error. Intended to be used
 * in a catch block around "fs" functions.
 *
 * @param e The error to check
 * @returns True if the error is a "file not found" error
 */
export function isNotFound(e) {
    return e instanceof Error && "code" in e && e.code === "ENOENT";
}
/**
 * Checks if a filesystem path exists.
 *
 * @param path The filesystem path (file or directory) to check
 * @returns True if the path exists
 */
export async function pathExists(path) {
    try {
        await fs.stat(path);
        return true;
    }
    catch (e) {
        if (isNotFound(e)) {
            return false;
        }
        throw e;
    }
}
//# sourceMappingURL=helpers.js.map