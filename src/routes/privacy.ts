import { Router, Request, Response } from 'express';
import { proofGenerator } from '../services/proof-generator';
import { ethers } from 'ethers';

const router = Router();

/**
 * @route POST /api/privacy/shield
 * @desc Generate proof and submit shield transaction
 */
router.post('/shield', async (req: Request, res: Response) => {
  try {
    const { amount, recipient, chainId, network, token, tokenAddress } = req.body;

    console.log('📥 Received shield request:');
    console.log('  Amount:', amount);
    console.log('  Token:', token || 'ETH');
    console.log('  Token Address:', tokenAddress || 'N/A');
    console.log('  Recipient:', recipient);
    console.log('  Chain:', chainId || network || 'default');

    // Validate inputs
    if (!amount || parseFloat(amount) <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid amount'
      });
    }

    // Convert amount to Wei based on token decimals
    let amountWei: string;

    if (token && token !== 'ETH' && tokenAddress) {
      // ERC20 token - query contract for decimals
      console.log('🔍 Querying ERC20 token decimals...');
      try {
        const provider = new ethers.JsonRpcProvider(
          process.env.RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com'
        );

        const ERC20_ABI = [
          'function decimals() view returns (uint8)'
        ];

        const tokenContract = new ethers.Contract(
          tokenAddress,
          ERC20_ABI,
          provider
        );

        const decimals = await tokenContract.decimals();
        console.log(`  Token decimals: ${decimals}`);

        amountWei = ethers.parseUnits(amount, decimals).toString();
        console.log(`  Amount converted: ${amount} ${token} = ${amountWei} (${decimals} decimals)`);
      } catch (error: any) {
        console.error('❌ Failed to query token decimals:', error.message);
        return res.status(400).json({
          success: false,
          error: `Failed to query token decimals: ${error.message}`
        });
      }
    } else {
      // Native ETH - use 18 decimals
      amountWei = ethers.parseEther(amount).toString();
      console.log(`  Amount converted: ${amount} ETH = ${amountWei} Wei`);
    }

    // Generate proof
    console.log('🔐 Generating shield proof...');
    const proofResult = await proofGenerator.generateShieldProof({
      amount: amountWei,
      recipient: recipient || '0x0000000000000000000000000000000000000000'
    });

    console.log('✅ Proof generated successfully');

    // For now, return the proof data
    // In production, this would also submit to blockchain
    res.json({
      success: true,
      commitment: proofResult.commitment,
      nullifier: proofResult.nullifier,
      secret: proofResult.secret,
      randomness: proofResult.randomness,
      proof: proofResult.proof,
      publicSignals: proofResult.publicSignals,
      chainId: chainId || null,
      network: network || null,
      message: 'Shield proof generated. Blockchain submission pending implementation.'
    });

  } catch (error: any) {
    console.error('❌ Shield endpoint error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Shield proof generation failed'
    });
  }
});

/**
 * @route POST /api/privacy/unshield
 * @desc Generate proof and submit unshield transaction (supports partial amounts)
 */
router.post('/unshield', async (req: Request, res: Response) => {
  try {
    const {
      inputAmount,
      outputAmount,
      changeAmount,
      recipient,
      secret,
      nullifier,
      randomness,
      inputCommitment,
      changeSecret,
      changeNullifier,
      changeRandomness,
      chainId,
      network,
      token,
      tokenAddress
    } = req.body;

    console.log('📥 Received unshield request:');
    console.log('  Input Amount:', inputAmount);
    console.log('  Output Amount:', outputAmount);
    console.log('  Change Amount:', changeAmount);
    console.log('  Token:', token || 'ETH');
    console.log('  Token Address:', tokenAddress || 'N/A');
    console.log('  Recipient:', recipient);
    console.log('  Chain:', chainId || network || 'default');

    // Validate inputs
    if (!inputAmount || parseFloat(inputAmount) <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid input amount'
      });
    }

    if (!outputAmount || parseFloat(outputAmount) <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid output amount'
      });
    }

    // Auto-calculate change if not provided
    const calculatedChange = changeAmount !== undefined
      ? changeAmount
      : (parseFloat(inputAmount) - parseFloat(outputAmount)).toString();

    if (parseFloat(calculatedChange) < 0) {
      return res.status(400).json({
        success: false,
        error: 'Change amount cannot be negative (output > input)'
      });
    }

    if (!secret || !nullifier || !randomness) {
      return res.status(400).json({
        success: false,
        error: 'Missing required proof inputs (secret, nullifier, randomness)'
      });
    }

    // Convert amounts to Wei based on token decimals
    let inputAmountWei: string;
    let outputAmountWei: string;
    let changeAmountWei: string;

    if (token && token !== 'ETH' && tokenAddress) {
      // ERC20 token - query contract for decimals
      console.log('🔍 Querying ERC20 token decimals...');
      try {
        const provider = new ethers.JsonRpcProvider(
          process.env.RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com'
        );

        const ERC20_ABI = [
          'function decimals() view returns (uint8)'
        ];

        const tokenContract = new ethers.Contract(
          tokenAddress,
          ERC20_ABI,
          provider
        );

        const decimals = await tokenContract.decimals();
        console.log(`  Token decimals: ${decimals}`);

        inputAmountWei = ethers.parseUnits(inputAmount, decimals).toString();
        outputAmountWei = ethers.parseUnits(outputAmount, decimals).toString();
        changeAmountWei = ethers.parseUnits(calculatedChange, decimals).toString();

        console.log('💰 Amount calculations:');
        console.log(`  Input: ${inputAmount} ${token} = ${inputAmountWei}`);
        console.log(`  Output: ${outputAmount} ${token} = ${outputAmountWei}`);
        console.log(`  Change: ${calculatedChange} ${token} = ${changeAmountWei}`);
      } catch (error: any) {
        console.error('❌ Failed to query token decimals:', error.message);
        return res.status(400).json({
          success: false,
          error: `Failed to query token decimals: ${error.message}`
        });
      }
    } else {
      // Native ETH - use 18 decimals
      inputAmountWei = ethers.parseEther(inputAmount).toString();
      outputAmountWei = ethers.parseEther(outputAmount).toString();
      changeAmountWei = ethers.parseEther(calculatedChange).toString();

      console.log('💰 Amount calculations:');
      console.log(`  Input: ${inputAmount} ETH = ${inputAmountWei} Wei`);
      console.log(`  Output: ${outputAmount} ETH = ${outputAmountWei} Wei`);
      console.log(`  Change: ${calculatedChange} ETH = ${changeAmountWei} Wei`);
    }

    // Generate proof
    console.log('🔐 Generating unshield proof with change support...');
    const proofResult = await proofGenerator.generateUnshieldProof({
      inputAmount: inputAmountWei,
      outputAmount: outputAmountWei,
      changeAmount: changeAmountWei,
      recipient,
      secret,
      nullifier,
      randomness,
      inputCommitment,
      changeSecret,
      changeNullifier,
      changeRandomness
    });

    console.log('✅ Proof generated successfully');

    // Return the proof data for frontend to submit to blockchain
    res.json({
      success: true,
      proof: proofResult.proof,
      publicSignals: proofResult.publicSignals,
      nullifierHash: proofResult.nullifierHash,
      changeCommitment: proofResult.changeCommitment,
      changeSecret: proofResult.changeSecret,
      changeNullifier: proofResult.changeNullifier,
      changeRandomness: proofResult.changeRandomness,
      changeAmount: calculatedChange, // Return in ether format (e.g., "0.001")
      chainId: chainId || null,
      network: network || null,
      message: 'Unshield proof generated successfully with change support.'
    });

  } catch (error: any) {
    console.error('❌ Unshield endpoint error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Unshield proof generation failed'
    });
  }
});

/**
 * @route POST /api/privacy/transfer
 * @desc Generate proof for private transfer (supports partial amounts)
 */
router.post('/transfer', async (req: Request, res: Response) => {
  try {
    const {
      inputCommitment,
      inputAmount,
      outputAmount,
      changeAmount,
      recipient,
      inputSecret,
      inputNullifier,
      inputRandomness,
      outputSecret,
      outputNullifier,
      outputRandomness,
      changeSecret,
      changeNullifier,
      changeRandomness,
      chainId,
      network,
      token,
      tokenAddress
    } = req.body;

    console.log('📥 Received transfer request:');
    console.log('  Input Amount:', inputAmount);
    console.log('  Output Amount:', outputAmount);
    console.log('  Change Amount:', changeAmount);
    console.log('  Token:', token || 'ETH');
    console.log('  Token Address:', tokenAddress || 'N/A');
    console.log('  Recipient:', recipient);

    // Validate inputs
    if (!inputAmount || parseFloat(inputAmount) <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid input amount'
      });
    }

    if (!outputAmount || parseFloat(outputAmount) <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid output amount'
      });
    }

    // Auto-calculate change if not provided
    const calculatedChange = changeAmount !== undefined
      ? changeAmount
      : (parseFloat(inputAmount) - parseFloat(outputAmount)).toString();

    if (parseFloat(calculatedChange) < 0) {
      return res.status(400).json({
        success: false,
        error: 'Change amount cannot be negative (output > input)'
      });
    }

    if (!inputSecret || !inputNullifier || !inputRandomness) {
      return res.status(400).json({
        success: false,
        error: 'Missing input commitment details'
      });
    }

    if (!outputSecret || !outputNullifier || !outputRandomness) {
      return res.status(400).json({
        success: false,
        error: 'Missing output commitment details'
      });
    }

    // Convert amounts to Wei based on token decimals
    let inputAmountWei: string;
    let outputAmountWei: string;
    let changeAmountWei: string;

    if (token && token !== 'ETH' && tokenAddress) {
      // ERC20 token - query contract for decimals
      console.log('🔍 Querying ERC20 token decimals...');
      try {
        const provider = new ethers.JsonRpcProvider(
          process.env.RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com'
        );

        const ERC20_ABI = [
          'function decimals() view returns (uint8)'
        ];

        const tokenContract = new ethers.Contract(
          tokenAddress,
          ERC20_ABI,
          provider
        );

        const decimals = await tokenContract.decimals();
        console.log(`  Token decimals: ${decimals}`);

        inputAmountWei = ethers.parseUnits(inputAmount, decimals).toString();
        outputAmountWei = ethers.parseUnits(outputAmount, decimals).toString();
        changeAmountWei = ethers.parseUnits(calculatedChange, decimals).toString();

        console.log('💰 Amount calculations:');
        console.log(`  Input: ${inputAmount} ${token} = ${inputAmountWei}`);
        console.log(`  Output: ${outputAmount} ${token} = ${outputAmountWei}`);
        console.log(`  Change: ${calculatedChange} ${token} = ${changeAmountWei}`);
      } catch (error: any) {
        console.error('❌ Failed to query token decimals:', error.message);
        return res.status(400).json({
          success: false,
          error: `Failed to query token decimals: ${error.message}`
        });
      }
    } else {
      // Native ETH - use 18 decimals
      inputAmountWei = ethers.parseEther(inputAmount).toString();
      outputAmountWei = ethers.parseEther(outputAmount).toString();
      changeAmountWei = ethers.parseEther(calculatedChange).toString();

      console.log('💰 Amount calculations:');
      console.log(`  Input: ${inputAmount} ETH = ${inputAmountWei} Wei`);
      console.log(`  Output: ${outputAmount} ETH = ${outputAmountWei} Wei`);
      console.log(`  Change: ${calculatedChange} ETH = ${changeAmountWei} Wei`);
    }

    // Generate proof
    console.log('🔐 Generating transfer proof with change support...');
    const proofResult = await proofGenerator.generateTransferProof({
      inputCommitment,
      inputAmount: inputAmountWei,
      outputAmount: outputAmountWei,
      changeAmount: changeAmountWei,
      recipient,
      inputSecret,
      inputNullifier,
      inputRandomness,
      outputSecret,
      outputNullifier,
      outputRandomness,
      changeSecret,
      changeNullifier,
      changeRandomness
    });

    console.log('✅ Proof generated successfully');

    res.json({
      success: true,
      proof: proofResult.proof,
      publicSignals: proofResult.publicSignals,
      nullifierHash: proofResult.nullifierHash,
      outputCommitment: proofResult.outputCommitment,
      changeCommitment: proofResult.changeCommitment,
      outputSecret,
      outputNullifier,
      outputRandomness,
      changeSecret: proofResult.changeSecret,
      changeNullifier: proofResult.changeNullifier,
      changeRandomness: proofResult.changeRandomness,
      changeAmount: calculatedChange, // Return in ether format (e.g., "0.001")
      chainId: chainId || null,
      network: network || null,
      message: 'Transfer proof generated successfully with change support.'
    });

  } catch (error: any) {
    console.error('❌ Transfer endpoint error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Transfer proof generation failed'
    });
  }
});

/**
 * @route GET /api/privacy/health
 * @desc Check if proof generator is ready
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    res.json({
      success: true,
      status: 'operational',
      message: 'Privacy service is running',
      circuitsCompiled: false, // Will be true once circuits are compiled
      poseidonLoaded: true
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
