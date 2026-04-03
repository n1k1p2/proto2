declare module 'tweetnacl-util' {
    export function encodeUTF8(arr: Uint8Array): string;
    export function decodeUTF8(s: string): Uint8Array;
    export function encodeBase64(arr: Uint8Array): string;
    export function decodeBase64(s: string): Uint8Array;
}
