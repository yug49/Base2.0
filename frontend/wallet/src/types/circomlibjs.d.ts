// Type declarations for circomlibjs (no @types/circomlibjs available)
declare module 'circomlibjs' {
  interface PoseidonFunction {
    (inputs: unknown[]): unknown;
    F: {
      toMontgomery(el: unknown): unknown;
      fromMontgomery(el: unknown): unknown;
    };
  }

  export function buildPoseidonOpt(): Promise<PoseidonFunction>;
  export function buildPoseidon(): Promise<PoseidonFunction>;

  interface EddsaInstance {
    F: {
      toMontgomery(el: unknown): unknown;
      fromMontgomery(el: unknown): unknown;
    };
    prv2pub(privateKey: Uint8Array): unknown[];
    signPoseidon(privateKey: Uint8Array, msg: unknown): {
      R8: unknown[];
      S: bigint;
    };
    verifyPoseidon(
      msg: unknown,
      sig: { R8: unknown[]; S: bigint },
      pubKey: unknown[],
    ): boolean;
  }

  export function buildEddsa(): Promise<EddsaInstance>;
}
