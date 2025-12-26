import hre from "hardhat";
import { parseEther } from "viem";
import fs from "fs"; // ESM import
import { network } from "hardhat";

const { viem } = await network.connect();
async function main() {
  const publicClient = await viem.getPublicClient();
  const [deployer, user, solver] = await viem.getWalletClients();

  console.log("🚀 Deploying Nika V3 Engines...");

  // 1. Deploy Tokens
  const USDC = await viem.deployContract("MockToken", ["USDC Coin", "USDC"]);
  const WETH = await viem.deployContract("MockToken", ["Wrapped Ether", "WETH"]);

  // 2. Deploy Settlement Engine
  const Settlement = await viem.deployContract("NikaSettlement");

  // 3. Deploy FeeVault
  const FeeVault = await viem.deployContract("FeeVault");

  // 4. Deploy SettlementChecker
  const SettlementChecker = await viem.deployContract("SettlementChecker", [
    FeeVault.address,
    Settlement.address
  ]);

  console.log(`✅ USDC: ${USDC.address}`);
  console.log(`✅ WETH: ${WETH.address}`);
  console.log(`✅ Settlement: ${Settlement.address}`);
  console.log(`✅ FeeVault: ${FeeVault.address}`);
  console.log(`✅ SettlementChecker: ${SettlementChecker.address}`);

  // 5. Seed Balances & Approve
  const usdcAsUser = await viem.getContractAt("MockToken", USDC.address, { client: { wallet: user } });
  const wethAsSolver = await viem.getContractAt("MockToken", WETH.address, { client: { wallet: solver } });
  
  // Minting (using deployer)
  const usdcAsDeployer = await viem.getContractAt("MockToken", USDC.address);
  const wethAsDeployer = await viem.getContractAt("MockToken", WETH.address);

  await usdcAsDeployer.write.mint([user.account.address, parseEther("1000")]);
  await wethAsDeployer.write.mint([solver.account.address, parseEther("1000")]);

  // 6. Seed FeeVault with some rewards for solvers
  const usdcAsDeployerForVault = await viem.getContractAt("MockToken", USDC.address);
  await usdcAsDeployerForVault.write.mint([deployer.account.address, parseEther("10000")]);
  
  const usdcForVault = await viem.getContractAt("MockToken", USDC.address, { client: { wallet: deployer } });
  const MAX_UINT = 115792089237316195423570985008687907853269984665640564039457584007913129639935n;
  await usdcForVault.write.approve([FeeVault.address, MAX_UINT]);
  
  const feeVaultAsDeployer = await viem.getContractAt("FeeVault", FeeVault.address, { client: { wallet: deployer } });
  await feeVaultAsDeployer.write.deposit([USDC.address, parseEther("10000")]);
  
  // Add some initial reward for the solver
  await feeVaultAsDeployer.write.addSolverReward([solver.account.address, parseEther("100")]);

  // 7. Approve Settlement contract
  await usdcAsUser.write.approve([Settlement.address, MAX_UINT]);
  await wethAsSolver.write.approve([Settlement.address, MAX_UINT]);

  // 8. Transfer FeeVault ownership to SettlementChecker so it can release funds
  // This allows SettlementChecker to call releaseFunds() on FeeVault
  await feeVaultAsDeployer.write.transferOwnership([SettlementChecker.address]);

  const data = {
    usdc: USDC.address,
    weth: WETH.address,
    settlement: Settlement.address,
    feeVault: FeeVault.address,
    settlementChecker: SettlementChecker.address,
    user: user.account.address,
    solver: solver.account.address
  };
  fs.writeFileSync("deployments.json", JSON.stringify(data, null, 2));
  console.log("💾 Data saved to deployments.json");
  console.log("\n📋 Setup Complete!");
  console.log("   FeeVault has 10,000 USDC");
  console.log(`   Solver has 100 USDC reward balance`);
}

main();
