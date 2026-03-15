// Type declarations for snarkjs (no @types/snarkjs available)
declare module 'snarkjs' {
  export namespace groth16 {
    function fullProve(
      input: Record<string, unknown>,
      wasmFileOrBuffer: string | Uint8Array,
      zkeyFileOrBuffer: string | Uint8Array,
      logger?: unknown,
    ): Promise<{
      proof: {
        pi_a: [string, string, string];
        pi_b: [[string, string], [string, string], [string, string]];
        pi_c: [string, string, string];
        protocol: string;
        curve: string;
      };
      publicSignals: string[];
    }>;

    function verify(
      vkey: unknown,
      publicSignals: string[],
      proof: unknown,
    ): Promise<boolean>;

    function exportSolidityCallData(
      proof: unknown,
      publicSignals: string[],
    ): Promise<string>;
  }

  export namespace plonk {
    function fullProve(
      input: Record<string, unknown>,
      wasmFile: string | Uint8Array,
      zkeyFile: string | Uint8Array,
    ): Promise<{ proof: unknown; publicSignals: string[] }>;

    function verify(
      vkey: unknown,
      publicSignals: string[],
      proof: unknown,
    ): Promise<boolean>;
  }

  export namespace zKey {
    function exportVerificationKey(zkeyFile: string | Uint8Array): Promise<unknown>;
  }
}
