import * as snarkjs from 'snarkjs';
import { buildPoseidon } from 'circomlibjs';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Proof Generator Service
 * Generates zero-knowledge proofs for shield, unshield, and transfer operations
 */

export interface ProofInputs {
  amount?: string;  // For shield operations (now optional)
  secret?: string;
  nullifier?: string;
  randomness?: string;
  recipient?: string;
  commitment?: string;
}

export interface ProofResult {
  proof: any;
  publicSignals: string[];
  commitment?: string;
  nullifier?: string;
  secret?: string;
  randomness?: string;
  nullifierHash?: string;
  outputCommitment?: string;
}

export class ProofGeneratorService {
  private poseidon: any;
  private circuitsPath: string;

  constructor(circuitsPath: string = '../../circuits') {
    this.circuitsPath = path.resolve(__dirname, circuitsPath);
  }

  /**
   * Initialize the service (loads Poseidon hash function)
   */
  async initialize(): Promise<void> {
    console.log('🔧 Initializing ProofGeneratorService...');
    this.poseidon = await buildPoseidon();
    console.log('✅ Poseidon hash function loaded');
  }

  /**
   * Generate a random field element
   */
  private randomFieldElement(): string {
    const bytes = crypto.randomBytes(31); // Use 31 bytes to stay within field size
    return BigInt('0x' + bytes.toString('hex')).toString();
  }

  /**
   * Hash using Poseidon
   */
  private hash(...inputs: (string | bigint)[]): string {
    const bigInts = inputs.map(i => typeof i === 'string' ? BigInt(i) : i);
    const hash = this.poseidon(bigInts);
    return this.poseidon.F.toString(hash);
  }

  /**
   * Generate commitment: H(secret, nullifier, randomness)
   */
  generateCommitment(secret: string, nullifier: string, randomness: string): string {
    return this.hash(secret, nullifier, randomness);
  }

  /**
   * Generate nullifier hash: H(nullifier, randomness)
   */
  generateNullifierHash(nullifier: string, randomness: string): string {
    return this.hash(nullifier, randomness);
  }

  /**
   * Generate shield proof
   * Creates a proof that user can deposit funds and create a commitment
   */
  async generateShieldProof(inputs: ProofInputs): Promise<ProofResult> {
    try {
      console.log('🛡️ Generating shield proof...');

      // Generate random values if not provided
      const secret = inputs.secret || this.randomFieldElement();
      const nullifier = inputs.nullifier || this.randomFieldElement();
      const randomness = inputs.randomness || this.randomFieldElement();

      // Generate commitment
      const commitment = this.generateCommitment(secret, nullifier, randomness);
      const nullifierHash = this.generateNullifierHash(nullifier, randomness);

      console.log('  Secret:', secret.substring(0, 10) + '...');
      console.log('  Nullifier:', nullifier.substring(0, 10) + '...');
      console.log('  Randomness:', randomness.substring(0, 10) + '...');
      console.log('  Commitment:', commitment.substring(0, 10) + '...');

      // Check if compiled circuit files exist
      const wasmPath = path.join(this.circuitsPath, 'artifacts/shield_js/shield.wasm');
      const zkeyPath = path.join(this.circuitsPath, 'keys/shield_final.zkey');

      console.log('🔍 Checking for circuit files:');
      console.log('  - circuitsPath:', this.circuitsPath);
      console.log('  - wasmPath:', wasmPath);
      console.log('  - wasmExists:', fs.existsSync(wasmPath));
      console.log('  - zkeyPath:', zkeyPath);
      console.log('  - zkeyExists:', fs.existsSync(zkeyPath));

      if (!fs.existsSync(wasmPath) || !fs.existsSync(zkeyPath)) {
        console.log('⚠️  Compiled circuits not found. Using mock proof for development.');

        // For development: return mock proof
        // In production, circuits must be compiled
        return {
          proof: this.generateMockProof(),
          publicSignals: [commitment, inputs.amount || '0', inputs.recipient || '0'],
          commitment,
          nullifier,
          secret,
          randomness
        };
      }

      // Prepare circuit inputs
      const circuitInputs = {
        commitment,
        amount: inputs.amount || '0',
        recipient: inputs.recipient || '0',
        secret,
        nullifier,
        randomness
      };

      console.log('  Generating ZK proof with snarkjs...');

      // Generate the proof
      const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        circuitInputs,
        wasmPath,
        zkeyPath
      );

      console.log('✅ Shield proof generated successfully');

      return {
        proof,
        publicSignals,
        commitment,
        nullifier,
        secret,
        randomness
      };

    } catch (error: any) {
      console.error('❌ Shield proof generation failed:', error);
      throw new Error(`Shield proof generation failed: ${error.message}`);
    }
  }

  /**
   * Generate unshield proof (supports partial amounts with change)
   * Proves user owns a commitment and can withdraw partial/full funds
   */
  async generateUnshieldProof(inputs: ProofInputs & {
    inputAmount?: string;
    outputAmount?: string;
    changeAmount?: string;
    inputCommitment?: string;
    changeSecret?: string;
    changeNullifier?: string;
    changeRandomness?: string;
  }): Promise<ProofResult & {
    changeCommitment: string;
    changeSecret: string;
    changeNullifier: string;
    changeRandomness: string;
  }> {
    try {
      console.log('🔓 Generating unshield proof with change support...');

      if (!inputs.secret || !inputs.nullifier || !inputs.randomness) {
        throw new Error('Secret, nullifier, and randomness required for unshield');
      }

      // Recalculate input commitment to verify
      const inputCommitment = this.generateCommitment(
        inputs.secret,
        inputs.nullifier,
        inputs.randomness
      );
      const nullifierHash = this.generateNullifierHash(inputs.nullifier, inputs.randomness);

      // Generate change commitment secrets if not provided
      const changeSecret = inputs.changeSecret || this.randomFieldElement();
      const changeNullifier = inputs.changeNullifier || this.randomFieldElement();
      const changeRandomness = inputs.changeRandomness || this.randomFieldElement();

      // Calculate change commitment
      const changeCommitment = this.generateCommitment(changeSecret, changeNullifier, changeRandomness);

      console.log('  Input Commitment:', inputCommitment.substring(0, 10) + '...');
      console.log('  Nullifier Hash:', nullifierHash.substring(0, 10) + '...');
      console.log('  Change Commitment:', changeCommitment.substring(0, 10) + '...');
      console.log('  Output Amount:', inputs.outputAmount);
      console.log('  Change Amount:', inputs.changeAmount);

      // Check if compiled circuit files exist
      const wasmPath = path.join(this.circuitsPath, 'artifacts/unshield_js/unshield.wasm');
      const zkeyPath = path.join(this.circuitsPath, 'keys/unshield_final.zkey');

      if (!fs.existsSync(wasmPath) || !fs.existsSync(zkeyPath)) {
        console.log('⚠️  Compiled circuits not found. Using mock proof for development.');

        // Public signals: [outputAmount, changeAmount, recipient, nullifierHash, inputCommitment, outputAmountOut, changeCommitment, changeAmountOut, recipientOut]
        // Order: public inputs first, then public outputs
        return {
          proof: this.generateMockProof(),
          publicSignals: [
            inputs.outputAmount || '0',      // public input
            inputs.changeAmount || '0',      // public input
            inputs.recipient || '0',         // public input
            nullifierHash,                   // public output
            inputCommitment,                 // public output
            inputs.outputAmount || '0',      // public output (outputAmountOut)
            changeCommitment,                // public output
            inputs.changeAmount || '0',      // public output (changeAmountOut)
            inputs.recipient || '0'          // public output (recipientOut)
          ],
          commitment: inputCommitment,
          nullifier: inputs.nullifier,
          secret: inputs.secret,
          randomness: inputs.randomness,
          nullifierHash,
          changeCommitment,
          changeSecret,
          changeNullifier,
          changeRandomness
        };
      }

      // Prepare circuit inputs
      const circuitInputs = {
        // Private inputs (witness)
        secret: inputs.secret,
        randomness: inputs.randomness,
        nullifier: inputs.nullifier,
        changeSecret,
        changeNullifier,
        changeRandomness,
        // Public inputs
        outputAmount: inputs.outputAmount || '0',
        changeAmount: inputs.changeAmount || '0',
        recipient: inputs.recipient || '0'
      };

      console.log('  Circuit inputs debug:');
      console.log('    secret type:', typeof inputs.secret, 'value:', inputs.secret?.substring(0, 20));
      console.log('    changeSecret type:', typeof changeSecret, 'value:', changeSecret?.substring(0, 20));
      console.log('    changeNullifier type:', typeof changeNullifier, 'value:', changeNullifier?.substring(0, 20));
      console.log('    changeRandomness type:', typeof changeRandomness, 'value:', changeRandomness?.substring(0, 20));
      console.log('    Full circuitInputs:', JSON.stringify(circuitInputs, null, 2));
      console.log('  Generating ZK proof with snarkjs...');

      // Generate the proof
      const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        circuitInputs,
        wasmPath,
        zkeyPath
      );

      console.log('✅ Unshield proof generated successfully');

      return {
        proof,
        publicSignals,
        commitment: inputCommitment,
        nullifier: inputs.nullifier,
        secret: inputs.secret,
        randomness: inputs.randomness,
        nullifierHash,
        changeCommitment,
        changeSecret,
        changeNullifier,
        changeRandomness
      };

    } catch (error: any) {
      console.error('❌ Unshield proof generation failed:', error);
      throw new Error(`Unshield proof generation failed: ${error.message}`);
    }
  }

  /**
   * Generate mock proof for development (when circuits aren't compiled)
   */
  private generateMockProof(): any {
    return {
      pi_a: [
        '0x' + crypto.randomBytes(32).toString('hex'),
        '0x' + crypto.randomBytes(32).toString('hex'),
        '0x0000000000000000000000000000000000000000000000000000000000000001'
      ],
      pi_b: [
        [
          '0x' + crypto.randomBytes(32).toString('hex'),
          '0x' + crypto.randomBytes(32).toString('hex')
        ],
        [
          '0x' + crypto.randomBytes(32).toString('hex'),
          '0x' + crypto.randomBytes(32).toString('hex')
        ],
        [
          '0x0000000000000000000000000000000000000000000000000000000000000001',
          '0x0000000000000000000000000000000000000000000000000000000000000000'
        ]
      ],
      pi_c: [
        '0x' + crypto.randomBytes(32).toString('hex'),
        '0x' + crypto.randomBytes(32).toString('hex'),
        '0x0000000000000000000000000000000000000000000000000000000000000001'
      ],
      protocol: 'groth16',
      curve: 'bn128'
    };
  }

  /**
   * Generate transfer proof (supports partial amounts with change)
   * Proves user owns input commitment and creates output + change commitments
   */
  async generateTransferProof(inputs: ProofInputs & {
    inputCommitment?: string;
    inputAmount?: string;
    outputAmount?: string;
    changeAmount?: string;
    inputSecret?: string;
    inputNullifier?: string;
    inputRandomness?: string;
    outputSecret?: string;
    outputNullifier?: string;
    outputRandomness?: string;
    changeSecret?: string;
    changeNullifier?: string;
    changeRandomness?: string;
  }): Promise<ProofResult & {
    changeCommitment: string;
    changeSecret: string;
    changeNullifier: string;
    changeRandomness: string;
  }> {
    try {
      console.log('🔄 Generating transfer proof with change support...');

      // Generate change commitment secrets if not provided
      const changeSecret = inputs.changeSecret || this.randomFieldElement();
      const changeNullifier = inputs.changeNullifier || this.randomFieldElement();
      const changeRandomness = inputs.changeRandomness || this.randomFieldElement();

      // Calculate output commitment from output secrets
      const calculatedOutputCommitment = this.hash(
        inputs.outputSecret!,
        inputs.outputNullifier!,
        inputs.outputRandomness!
      );

      // Calculate change commitment
      const changeCommitment = this.hash(changeSecret, changeNullifier, changeRandomness);

      // Calculate nullifier hash
      const nullifierHash = this.hash(inputs.inputNullifier!, inputs.inputRandomness!);

      console.log('  Input Commitment:', inputs.inputCommitment?.substring(0, 10) + '...');
      console.log('  Output Commitment:', calculatedOutputCommitment.substring(0, 10) + '...');
      console.log('  Change Commitment:', changeCommitment.substring(0, 10) + '...');
      console.log('  Output Amount:', inputs.outputAmount);
      console.log('  Change Amount:', inputs.changeAmount);

      // Check if compiled circuit files exist
      const wasmPath = path.join(this.circuitsPath, 'artifacts/transfer_js/transfer.wasm');
      const zkeyPath = path.join(this.circuitsPath, 'keys/transfer_final.zkey');

      console.log('🔍 Checking for circuit files:');
      console.log('  circuitsPath:', this.circuitsPath);
      console.log('  wasmPath:', wasmPath);
      console.log('  wasmExists:', fs.existsSync(wasmPath));
      console.log('  zkeyPath:', zkeyPath);
      console.log('  zkeyExists:', fs.existsSync(zkeyPath));

      if (!fs.existsSync(wasmPath) || !fs.existsSync(zkeyPath)) {
        console.log('⚠️  Compiled circuits not found. Using mock proof for development.');

        // Public signals: [outputAmount, changeAmount, recipient, nullifierHash, inputCommitment, outputCommitment, outputAmountOut, changeCommitment, changeAmountOut, recipientOut]
        // Order: public inputs first, then public outputs
        return {
          proof: this.generateMockProof(),
          publicSignals: [
            inputs.outputAmount || '0',       // public input
            inputs.changeAmount || '0',       // public input
            inputs.recipient || '0',          // public input
            nullifierHash,                    // public output
            inputs.inputCommitment!,          // public output
            calculatedOutputCommitment,       // public output
            inputs.outputAmount || '0',       // public output (outputAmountOut)
            changeCommitment,                 // public output
            inputs.changeAmount || '0',       // public output (changeAmountOut)
            inputs.recipient || '0'           // public output (recipientOut)
          ],
          nullifierHash,
          outputCommitment: calculatedOutputCommitment,
          changeCommitment,
          changeSecret,
          changeNullifier,
          changeRandomness
        };
      }

      // Prepare circuit inputs
      const circuitInputs = {
        // Private inputs
        inputSecret: inputs.inputSecret!,
        inputNullifier: inputs.inputNullifier!,
        inputRandomness: inputs.inputRandomness!,
        outputSecret: inputs.outputSecret!,
        outputNullifier: inputs.outputNullifier!,
        outputRandomness: inputs.outputRandomness!,
        changeSecret,
        changeNullifier,
        changeRandomness,
        // Public inputs
        outputAmount: inputs.outputAmount || '0',
        changeAmount: inputs.changeAmount || '0',
        recipient: inputs.recipient || '0'
      };

      console.log('  Generating ZK proof with snarkjs...');

      // Generate the proof
      const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        circuitInputs,
        wasmPath,
        zkeyPath
      );

      console.log('✅ Transfer proof generated successfully');
      console.log('📊 Public Signals from circuit:');
      console.log('  [0] nullifierHash:', publicSignals[0]);
      console.log('  [1] inputCommitment:', publicSignals[1]);
      console.log('  [2] outputCommitment:', publicSignals[2]);
      console.log('  [3] outputAmount:', publicSignals[3]);
      console.log('  [4] changeCommitment:', publicSignals[4]);
      console.log('  [5] changeAmount:', publicSignals[5]);
      console.log('  [6] recipient:', publicSignals[6]);
      console.log('  Total signals:', publicSignals.length);

      // Verify proof locally before returning
      console.log('🔍 Verifying proof locally...');
      const isValid = await this.verifyProof(proof, publicSignals, 'transfer');
      console.log('✅ Local verification result:', isValid);

      if (!isValid) {
        throw new Error('Generated proof failed local verification!');
      }

      return {
        proof,
        publicSignals,
        nullifierHash: publicSignals[0],
        outputCommitment: calculatedOutputCommitment,
        changeCommitment,
        changeSecret,
        changeNullifier,
        changeRandomness
      };

    } catch (error: any) {
      console.error('❌ Transfer proof generation failed:', error);
      throw new Error(`Transfer proof generation failed: ${error.message}`);
    }
  }

  /**
   * Verify a proof (useful for testing)
   */
  async verifyProof(proof: any, publicSignals: string[], circuitType: 'shield' | 'unshield' | 'transfer'): Promise<boolean> {
    try {
      const vkeyPath = path.join(this.circuitsPath, `keys/${circuitType}_verification_key.json`);

      if (!fs.existsSync(vkeyPath)) {
        console.log('⚠️  Verification key not found. Skipping verification.');
        return true; // Mock verification for development
      }

      const vKey = JSON.parse(fs.readFileSync(vkeyPath, 'utf-8'));
      const isValid = await snarkjs.groth16.verify(vKey, publicSignals, proof);

      return isValid;
    } catch (error: any) {
      console.error('❌ Proof verification failed:', error);
      return false;
    }
  }
}

// Export singleton instance
export const proofGenerator = new ProofGeneratorService();
