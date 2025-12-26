import hre from "hardhat";
import { formatEther, keccak256, encodeAbiParameters, parseAbiParameters, parseEther } from "viem";
import fs from "fs";
import { network } from "hardhat";

const { viem } = await network.connect();

async function main() {
  const deployments = JSON.parse(fs.readFileSync("deployments.json", "utf8"));
  const payload = JSON.parse(fs.readFileSync("pending_intent.json", "utf8"));
  const [deployer, user, solver] = await viem.getWalletClients();

  console.log(`🤖 Solver (${solver.account.address}) Filling...`);
  
  const settlement = await viem.getContractAt(
    "NikaSettlement", 
    deployments.settlement,
    { client: { wallet: solver } }
  );
  
  const WETH = await viem.getContractAt("MockToken", deployments.weth);
  const publicClient = await viem.getPublicClient();

  const userBalBefore = await WETH.read.balanceOf([user.account.address]);
  console.log(`User WETH Before: ${formatEther(userBalBefore)}`);

  console.log("⚡ Submitting Settlement Transaction...");
  
  const intentArgs = {
      user: payload.intent.user,
      tokenIn: payload.intent.tokenIn,
      amountIn: BigInt(payload.intent.amountIn),
      tokenOut: payload.intent.tokenOut,
      amountOut: BigInt(payload.intent.amountOut),
      nonce: BigInt(payload.intent.nonce),
      deadline: BigInt(payload.intent.deadline)
  };

  // Step 1: Fill the order
  const settlementHash = await settlement.write.settle([intentArgs, payload.signature]);
  const receipt = await publicClient.waitForTransactionReceipt({ hash: settlementHash });

  const userBalAfter = await WETH.read.balanceOf([user.account.address]);
  console.log(`✅ Settled! User WETH After: ${formatEther(userBalAfter)}`);
  console.log(`   Settlement Tx: ${settlementHash}`);

  // Step 2: Create proof of fill (as per diagram: solver passes proof after filling)
  const timestamp = BigInt(Math.floor(Date.now() / 1000));
  const rewardToken = deployments.usdc; // Reward token (from fees)
  const rewardAmount = parseEther("1"); // Example reward amount (1 USDC)
  
  // Compute proof hash for verification (must match SettlementChecker's computation)
  const proofHash = keccak256(
    encodeAbiParameters(
      parseAbiParameters("bytes32, address, address, uint256, uint256, uint256"),
      [
        settlementHash,
        solver.account.address as `0x${string}`,
        rewardToken as `0x${string}`,
        rewardAmount,
        receipt.blockNumber,
        timestamp
      ]
    )
  );
  
  const proofOfFill = {
    settlementTxHash: settlementHash,
    solver: solver.account.address,
    rewardToken: rewardToken,
    rewardAmount: rewardAmount.toString(),
    blockNumber: receipt.blockNumber.toString(),
    timestamp: timestamp.toString(),
    proofHash: proofHash
  };

  // Step 3: Submit proof to SettlementChecker (if deployed)
  if (deployments.settlementChecker) {
    console.log("🔍 Submitting proof to SettlementChecker...");
    
    const settlementChecker = await viem.getContractAt(
      "SettlementChecker",
      deployments.settlementChecker,
      { client: { wallet: solver } }
    );

    try {
      const verifyHash = await settlementChecker.write.verifyAndRelease([
        {
          settlementTxHash: settlementHash,
          solver: solver.account.address,
          rewardToken: rewardToken,
          rewardAmount: rewardAmount,
          blockNumber: receipt.blockNumber,
          timestamp: timestamp
        },
        proofHash
      ]);

      const verifyReceipt = await publicClient.waitForTransactionReceipt({ hash: verifyHash });
      console.log(`✅ Proof verified! Funds released from FeeVault to solver`);
      console.log(`   Verification Tx: ${verifyHash}`);
      
      // Check solver's reward balance after release
      const feeVault = await viem.getContractAt("FeeVault", deployments.feeVault);
      const remainingReward = await feeVault.read.getSolverReward([solver.account.address]);
      console.log(`   Solver remaining reward: ${formatEther(remainingReward)}`);

      const erc20 = await viem.getContractAt("MockToken", rewardToken);
      const solverBalance = await erc20.read.balanceOf([solver.account.address]);
      console.log(`   Solver USDC balance: ${formatEther(solverBalance)}`);
    } catch (error: any) {
      console.log(`⚠️  Failed to submit proof: ${error.message}`);
      console.log(`   Saving proof for manual verification...`);
      fs.writeFileSync("proof_of_fill.json", JSON.stringify(proofOfFill, null, 2));
      console.log(`💾 Proof saved to proof_of_fill.json`);
    }
  } else {
    console.log("⚠️  SettlementChecker not deployed. Saving proof for manual verification...");
    fs.writeFileSync("proof_of_fill.json", JSON.stringify(proofOfFill, null, 2));
    console.log(`📋 Proof of Fill Created! Hash: ${proofHash}`);
    console.log(`💾 Proof saved to proof_of_fill.json`);
    console.log(`   Next: SettlementChecker will verify this proof and release funds from FeeVault`);
  }
}

main();
