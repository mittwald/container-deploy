export declare const defaultPasswordLength = 32;
/**
 * Generates a random password of a given length. The password is generated from
 * the base64 alphabet.
 *
 * @param length The desired amount of characters
 * @returns The generated password
 */
export declare function generatePassword(length?: number): string;
/**
 * Generates a random password of a given length with a specific amount of
 * special characters.
 *
 * @param length The desired amount of characters
 * @param amountSpecialChars The desired amount of special characters
 * @returns The generated password
 */
export declare function generatePasswordWithSpecialChars(length?: number, amountSpecialChars?: number): string;
/**
 * Represents a duration of time.
 *
 * This class represents a duration of time and offers utility methods around
 * this.
 */
export declare class Duration {
    readonly milliseconds: number;
    private constructor();
    static fromZero(): Duration;
    static fromMilliseconds(milliseconds: number): Duration;
    static fromSeconds(seconds: number): Duration;
    get seconds(): number;
    from(referenceDate: Date): Date;
    fromNow(): Date;
    add(other: Duration): Duration;
    compare(other: Duration): number;
    toString(): string;
}
export declare function waitUntil<T>(tester: () => Promise<T | null>, timeout?: Duration): Promise<T>;
/**
 * Quickly checks if an error is a "file not found" error. Intended to be used
 * in a catch block around "fs" functions.
 *
 * @param e The error to check
 * @returns True if the error is a "file not found" error
 */
export declare function isNotFound(e: unknown): boolean;
/**
 * Checks if a filesystem path exists.
 *
 * @param path The filesystem path (file or directory) to check
 * @returns True if the path exists
 */
export declare function pathExists(path: string): Promise<boolean>;
//# sourceMappingURL=helpers.d.ts.map